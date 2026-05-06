const admin = require('firebase-admin');

// SECURITY FIX: Server-side endpoint to assign trusted custom claims.
// Prevents clients from assigning their own privileges.

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountRaw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY');
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const app = initAdmin();
    const token = getBearerToken(req);
    if (!token) return sendJson(res, 401, { error: 'Missing bearer token' });

    const decoded = await admin.auth(app).verifyIdToken(token);
    if (!decoded || decoded.isOwner !== true) return sendJson(res, 403, { error: 'Owner claim required' });

    const body = req.body || {};
    const targetUid = String(body.targetUid || '').trim();
    const claim = String(body.claim || '').trim();

    if (!targetUid || !claim) return sendJson(res, 400, { error: 'Missing targetUid or claim' });
    if (!['admin', 'isOwner'].includes(claim)) return sendJson(res, 400, { error: 'Invalid claim. Must be "admin" or "isOwner"' });

    const claims = {};
    claims[claim] = true;

    await admin.auth(app).setCustomUserClaims(targetUid, claims);

    return sendJson(res, 200, { success: true });
  } catch (err) {
    console.error('setAdminClaim error:', err && err.stack ? err.stack : err);
    return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
  }
};
