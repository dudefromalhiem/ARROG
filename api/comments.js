const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length) return admin.app();

  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountRaw) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable.');
  }

  const serviceAccount = JSON.parse(serviceAccountRaw);
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID
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

function normalizeText(text, maxLen = 1200) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function toPlainValue(value) {
  if (!value) return value;
  if (typeof value.toDate === 'function' && typeof value.seconds === 'number') {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (Array.isArray(value)) return value.map(toPlainValue);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlainValue(v)]));
  }
  return value;
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
    email: String(decoded.email || ''),
    name: String(decoded.name || decoded.displayName || '')
  };
}

const BOOTSTRAP_OWNERS = new Set(['jaimejoselaureano@gmail.com', 'dudefromalhiem@gmail.com']);

async function isAdminUser(db, uid, email) {
  const normalizedEmail = String(email || '').toLowerCase();
  if (BOOTSTRAP_OWNERS.has(normalizedEmail)) return true;

  const userDoc = await db.collection('users').doc(uid).get();
  if (userDoc.exists && userDoc.data() && userDoc.data().isAdmin === true) {
    return true;
  }

  const rolesDoc = await db.collection('config').doc('roles').get();
  if (!rolesDoc.exists) return false;
  const owners = Array.isArray(rolesDoc.data()?.owners) ? rolesDoc.data().owners : [];
  return owners.map(owner => String(owner || '').toLowerCase()).includes(normalizedEmail);
}

async function listComments(db, pageId, slug) {
  let query = db.collection('comments');
  if (pageId) {
    query = query.where('pageId', '==', pageId);
  } else {
    query = query.where('slug', '==', slug);
  }

  const snap = await query.limit(300).get();
  const comments = snap.docs.map(doc => ({ id: doc.id, data: toPlainValue(doc.data()) }));
  comments.sort((a, b) => {
    const sa = Number(a && a.data && a.data.createdAt && a.data.createdAt.seconds || 0);
    const sb = Number(b && b.data && b.data.createdAt && b.data.createdAt.seconds || 0);
    return sa - sb;
  });
  return comments;
}

module.exports = async function handler(req, res) {
  try {
    const app = initAdmin();
    const db = admin.firestore(app);
    const method = String(req.method || 'GET').toUpperCase();

    if (method === 'GET') {
      const pageId = normalizeText(req.query?.pageId || '', 128);
      const slug = normalizeText(req.query?.slug || '', 160);
      if (!pageId && !slug) {
        return sendJson(res, 400, { error: 'Missing page reference.' });
      }

      const comments = await listComments(db, pageId, slug);
      return sendJson(res, 200, { comments });
    }

    const actor = await verifyUser(req);

    if (method === 'POST') {
      const body = req.body || {};
      const pageId = normalizeText(body.pageId || '', 128);
      const slug = normalizeText(body.slug || '', 160);
      const pageTitle = normalizeText(body.pageTitle || '', 220);
      const content = normalizeText(body.content || '', 1200);

      if (!pageId && !slug) {
        return sendJson(res, 400, { error: 'Missing page reference.' });
      }
      if (!content) {
        return sendJson(res, 400, { error: 'Comment cannot be empty.' });
      }

      const payload = {
        pageId,
        slug,
        pageTitle,
        content,
        authorUid: actor.uid,
        authorEmail: actor.email,
        authorName: normalizeText(body.authorName || actor.name || actor.email.split('@')[0] || 'Agent', 120),
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const ref = await db.collection('comments').add(payload);
      const created = await ref.get();
      return sendJson(res, 200, { id: ref.id, data: toPlainValue(created.data()) });
    }

    if (method === 'DELETE') {
      const body = req.body || {};
      const id = normalizeText(body.id || req.query?.id || '', 128);
      if (!id) return sendJson(res, 400, { error: 'Missing comment id.' });

      const ref = db.collection('comments').doc(id);
      const doc = await ref.get();
      if (!doc.exists) return sendJson(res, 404, { error: 'Comment not found.' });

      const data = doc.data() || {};
      const adminAccess = await isAdminUser(db, actor.uid, actor.email);
      const isAuthor = String(data.authorUid || '') === actor.uid;
      if (!adminAccess && !isAuthor) {
        return sendJson(res, 403, { error: 'Forbidden.' });
      }

      await ref.delete();
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    return sendJson(res, Number(err.statusCode || 500), { error: err.message || 'Server error.' });
  }
};
