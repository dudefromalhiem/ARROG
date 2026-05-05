const admin = require('firebase-admin');
const security = require('./security');

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

/**
 * GET /api/anomalies.js
 *
 * Query params:
 * - mode: 'top' (default) or 'all'
 * - limit: number (for 'top', default 10, max 20)
 *
 * This consolidates the previous `topAnomalies.js` and `allAnomalies.js` endpoints
 * into a single handler to reduce the number of serverless functions.
 */
module.exports = async (req, res) => {
  return security.secureHandler(req, res, security.getRequestIp(req), async (req, res) => {
    if (req.method !== 'GET') {
      return security.sendError(res, 405, 'Method not allowed. Use GET.');
    }

    const mode = String(req.query?.mode || 'top').toLowerCase();

    // Rate limit per IP for read endpoints
    if (security.enforceRateLimit(req, res, `anomalies:${security.getRequestIp(req)}:${mode}`, { limit: 1000, windowMs: 3600000 })) {
      return;
    }

    const app = initAdmin();
    const db = admin.firestore(app);

    try {
      if (mode === 'all') {
        const snapshot = await db.collection('pages')
          .where('type', '==', 'Anomaly')
          .where('status', '==', 'approved')
          .get();

        const data = snapshot.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            title: d.title || '[Untitled]',
            slug: d.slug || '',
            type: d.type || 'Anomaly',
            upvoteCount: d.upvoteCount || 0,
            authorName: d.authorName || 'Unknown Agent',
            anomalyId: d.anomalyId || '',
            approvedAt: d.approvedAt || d.createdAt || null
          };
        });

        return security.sendJson(res, 200, { success: true, data, total: data.length });
      }

      // Default 'top' mode
      let limit = parseInt(String(req.query?.limit || '10'), 10);
      if (isNaN(limit) || limit < 1) limit = 10;
      if (limit > 20) limit = 20;

      // Try efficient indexed query first
      let data = [];
      try {
        const snapshot = await db.collection('pages')
          .where('type', '==', 'Anomaly')
          .where('status', '==', 'approved')
          .orderBy('upvoteCount', 'desc')
          .limit(limit)
          .get();

        data = snapshot.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            title: d.title || '[Untitled]',
            slug: d.slug || '',
            type: d.type || 'Anomaly',
            upvoteCount: d.upvoteCount || 0,
            authorName: d.authorName || 'Unknown Agent',
            approvedAt: d.approvedAt || d.createdAt || null
          };
        });
      } catch (err) {
        console.warn('Indexed query failed in anomalies API, falling back to in-memory sort:', err.message);
        const snapshot = await db.collection('pages')
          .where('type', '==', 'Anomaly')
          .where('status', '==', 'approved')
          .get();

        data = snapshot.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            title: d.title || '[Untitled]',
            slug: d.slug || '',
            type: d.type || 'Anomaly',
            upvoteCount: d.upvoteCount || 0,
            authorName: d.authorName || 'Unknown Agent',
            approvedAt: d.approvedAt || d.createdAt || null
          };
        });

        data.sort((a, b) => (b.upvoteCount || 0) - (a.upvoteCount || 0));
        data = data.slice(0, limit);
      }

      // Final fallback if empty
      if (data.length === 0) {
        try {
          const fallbackSnapshot = await db.collection('pages')
            .where('type', '==', 'Anomaly')
            .where('status', '==', 'approved')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();

          data.push(...fallbackSnapshot.docs.map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              title: d.title || '[Untitled]',
              slug: d.slug || '',
              type: d.type || 'Anomaly',
              upvoteCount: d.upvoteCount || 0,
              authorName: d.authorName || 'Unknown Agent',
              approvedAt: d.approvedAt || d.createdAt || null
            };
          }));
        } catch (fallbackErr) {
          console.warn('Secondary fallback failed:', fallbackErr.message);
          const lastSnap = await db.collection('pages')
            .where('type', '==', 'Anomaly')
            .where('status', '==', 'approved')
            .limit(limit)
            .get();

          data.push(...lastSnap.docs.map(doc => {
            const d = doc.data();
            return { id: doc.id, title: d.title || '[Untitled]', slug: d.slug || '', type: d.type || 'Anomaly', upvoteCount: d.upvoteCount || 0, authorName: d.authorName || 'Unknown Agent', approvedAt: d.approvedAt || d.createdAt || null };
          }));
        }
      }

      return security.sendJson(res, 200, { success: true, data, total: data.length });
    } catch (err) {
      console.error('Anomalies API error:', err);
      return security.sendError(res, 500, 'Internal server error');
    }
  }, { limit: 1000, windowMs: 3600000 });
};
