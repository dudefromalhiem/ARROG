const admin = require('firebase-admin');

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const { slug, title, type, tags, htmlContent, cssContent } = req.body || {};
    
    if (!slug || !type) {
      return sendJson(res, 400, { error: 'Missing required sync fields' });
    }

    const normalizedType = String(type).trim();
    if (normalizedType.toLowerCase() !== 'anomaly') {
      return sendJson(res, 400, { error: 'Sync is only available for anomalies' });
    }

    const app = initAdmin();
    const db = admin.firestore(app);

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
