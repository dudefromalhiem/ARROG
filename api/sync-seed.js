const admin = require('firebase-admin');
const { ROLES, normalizeRole, isAtLeast } = require('../permissions');

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountRaw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY');
  const serviceAccount = JSON.parse(serviceAccountRaw);
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

function sendJson(res, statusCode, payload) {
  res.status(statusCode).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || req.headers.Authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function verifyUser(req) {
  const app = initAdmin();
  const token = getBearerToken(req);
  if (!token) {
    const err = new Error('Missing bearer token.');
    err.statusCode = 401;
    throw err;
  }

  const decoded = await admin.auth(app).verifyIdToken(token);
  const uid = String(decoded.uid || '');
  if (!uid) {
    const err = new Error('Invalid authentication token.');
    err.statusCode = 401;
    throw err;
  }

  return {
    uid,
    email: String(decoded.email || '').toLowerCase()
  };
}

const BOOTSTRAP_OWNERS = new Set(['jaimejoselaureano@gmail.com', 'dudefromalhiem@gmail.com']);

async function isAdminUser(db, uid, email) {
  if (BOOTSTRAP_OWNERS.has(String(email || '').toLowerCase())) return true;

  const [userDoc, rolesDoc] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('config').doc('roles').get()
  ]);

  if (userDoc.exists) {
    const userData = userDoc.data() || {};
    const userRole = normalizeRole(userData.role);
    if (userData.isAdmin === true || isAtLeast(userRole, ROLES.ADMINISTRATOR) || userRole === ROLES.OWNER) {
      return true;
    }
  }

  if (!rolesDoc.exists) return false;
  const roleData = rolesDoc.data() || {};
  const owners = Array.isArray(roleData.owners) ? roleData.owners : [];
  const admins = Array.isArray(roleData.admins) ? roleData.admins : [];
  return [...owners, ...admins].map(value => String(value || '').toLowerCase()).includes(String(email || '').toLowerCase());
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const app = initAdmin();
    const db = admin.firestore(app);
    const actor = await verifyUser(req);
    const allowed = await isAdminUser(db, actor.uid, actor.email);
    if (!allowed) {
      return sendJson(res, 403, { error: 'Admin access required.' });
    }

    const { slug, title, type, tags, htmlContent, cssContent } = req.body || {};
    
    if (!slug || !type) {
      return sendJson(res, 400, { error: 'Missing required sync fields' });
    }

    const normalizedType = String(type).trim();
    if (normalizedType.toLowerCase() !== 'anomaly') {
      return sendJson(res, 400, { error: 'Sync is only available for anomalies' });
    }

    // Extract Anomaly ID from slug or title
    const slugUpper = String(slug).toUpperCase().trim();
    const anomalyIdMatch = slugUpper.match(/^([A-Z]+)-(\d+[A-Z]?)$/);
    
    let anomalySubtype = '';
    let anomalyId = '';
    if (anomalyIdMatch) {
      anomalySubtype = anomalyIdMatch[1];
      anomalyId = slugUpper;
    }

    const pagePayload = {
      title: String(title || slugUpper).trim(),
      slug: String(slug).toLowerCase().trim(),
      type: 'Anomaly',
      tags: Array.isArray(tags) ? tags : [],
      htmlContent: String(htmlContent || '').trim(),
      cssContent: String(cssContent || '').trim(),
      anomalyId: anomalyId || slugUpper,
      anomalySubtype: anomalySubtype || 'UNKNOWN',
      status: 'approved',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      upvoteCount: 0,
      autoSynced: true
    };

    // Use SLUG as the Document ID to prevent duplicates and simplify lookup
    await db.collection('pages').doc(pagePayload.slug).set(pagePayload, { merge: true });

    return sendJson(res, 200, { ok: true, id: pagePayload.slug });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
};
