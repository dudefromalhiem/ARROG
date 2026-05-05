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
 * GET /api/topAnomalies.js
 * 
 * Fetch the top 10 highest upvoted anomalies.
 * 
 * Query params:
 * - limit: number (default 10, max 20)
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
    if (security.enforceRateLimit(req, res, `topAnomalies:${security.getRequestIp(req)}`, { limit: 1000, windowMs: 3600000 })) {
      return;
    }

    // Validate limit parameter
    let limit = parseInt(String(req.query?.limit || '10'), 10);
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 20) limit = 20;

    const app = initAdmin();
    const db = admin.firestore(app);

    // Query approved anomalies sorted by upvoteCount descending
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
      console.warn('Firestore upvoteCount query failed in API, falling back to in-memory sort:', err.message);
      // Resilience Fallback: Fetch all approved anomalies and sort in memory
      // This is safe for small-to-medium collections and avoids 500 errors if indexes are missing.
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

      // Sort by upvoteCount desc, then by date desc
      data.sort((a, b) => {
        const upA = a.upvoteCount || 0;
        const upB = b.upvoteCount || 0;
        if (upB !== upA) return upB - upA;
        return 0; // secondary sort could be date here if desired
      });

      // Apply limit
      data = data.slice(0, limit);
    }
    
    // Final Fallback: If still no anomalies found, fall back to newest anomalies
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
        // Last resort: fetch without orderBy
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

    return security.sendJson(res, 200, {
      success: true,
      data: data,
      total: data.length
    });
  }, { limit: 1000, windowMs: 3600000 });
};
