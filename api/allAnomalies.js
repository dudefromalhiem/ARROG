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
 * GET /api/allAnomalies.js
 * 
 * Fetch all approved anomalies with upvote counts.
 * 
 * Response:
 * {
 *   success: boolean,
 *   data: [
 *     {
 *       id: string,
 *       title: string,
 *       slug: string,
 *       type: string,
 *       upvoteCount: number,
 *       authorName: string,
 *       anomalyId: string (optional - the designation like ROS-0001),
 *       approvedAt: { seconds: number, nanoseconds: number }
 *     }
 *   ],
 *   total: number
 * }
 */
module.exports = async (req, res) => {
  return security.secureHandler(req, res, security.getRequestIp(req), async (req, res) => {
    // Handle method check
    if (req.method !== 'GET') {
      return security.sendError(res, 405, 'Method not allowed. Use GET.');
    }

    // Rate limit per IP (1000 requests per hour for read-only endpoint)
    if (security.enforceRateLimit(req, res, `allAnomalies:${security.getRequestIp(req)}`, { limit: 1000, windowMs: 3600000 })) {
      return;
    }

    const app = initAdmin();
    const db = admin.firestore(app);

    // Query all approved anomalies
    const snapshot = await db.collection('pages')
      .where('type', '==', 'Anomaly')
      .where('approvalStatus', '==', 'approved')
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

    return security.sendJson(res, 200, {
      success: true,
      data: data,
      total: data.length
    });
  }, { limit: 1000, windowMs: 3600000 });
};
