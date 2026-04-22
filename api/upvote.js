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

async function verifyUser(req) {
  const app = initAdmin();
  const authCheck = security.validateAuthToken(req);
  if (!authCheck.valid) {
    const err = new Error(authCheck.error);
    err.statusCode = 401;
    throw err;
  }

  const decoded = await admin.auth(app).verifyIdToken(authCheck.token);
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

/**
 * POST /api/upvote.js
 * 
 * Toggle upvote for a page (anomalies only).
 * 
 * Request body:
 * {
 *   pageId: string (required) - Firestore document ID of the page
 *   pageType: string (required) - Must be "Anomaly"
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   upvoted: boolean (true = upvote added, false = removed),
 *   upvoteCount: number,
 *   message: string
 * }
 */
module.exports = async (req, res) => {
  return security.secureHandler(req, res, null, async (req, res) => {
    // Handle method check
    if (req.method !== 'POST') {
      return security.sendError(res, 405, 'Method not allowed. Use POST.');
    }

    // Validate content length (max 1KB for this endpoint)
    if (!security.validateContentLength(req, 1024)) {
      return security.sendError(res, 413, 'Request payload too large');
    }

    // Verify authentication
    let user;
    try {
      user = await verifyUser(req);
    } catch (err) {
      return security.sendError(res, 401, err.message);
    }

    // Rate limit per user (100 upvotes per hour)
    if (security.enforceRateLimit(req, res, `upvote:${user.uid}`, { limit: 100, windowMs: 3600000 })) {
      return;
    }

    // Parse and validate request body
    const pageId = String(req.body?.pageId || '').trim();
    const pageType = String(req.body?.pageType || '').trim();

    if (!security.validateId(pageId)) {
      return security.sendError(res, 400, 'Invalid pageId format.');
    }

    // Only allow upvotes for anomalies
    if (pageType !== 'Anomaly') {
      return security.sendError(res, 400, 'Upvotes are only available for anomaly pages.');
    }

    const app = initAdmin();
    const db = admin.firestore(app);

    // Check if page exists and is an anomaly
    const pageDoc = await db.collection('pages').doc(pageId).get();
    if (!pageDoc.exists) {
      return security.sendError(res, 404, 'Page not found.');
    }

    const pageData = pageDoc.data();
    if (pageData.type !== 'Anomaly') {
      return security.sendError(res, 400, 'Upvotes are only available for anomaly pages.');
    }

    // Check if page is approved
    if (pageData.approvalStatus !== 'approved') {
      return security.sendError(res, 400, 'Cannot upvote unapproved pages.');
    }

    const upvoteRef = db.collection('pages').doc(pageId).collection('upvotes').doc(user.uid);
    const upvoteSnapshot = await upvoteRef.get();
    const currentlyUpvoted = upvoteSnapshot.exists;

    let isNowUpvoted = !currentlyUpvoted;

    if (currentlyUpvoted) {
      // Remove upvote
      await upvoteRef.delete();
    } else {
      // Add upvote
      await upvoteRef.set({
        userId: user.uid,
        email: user.email,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Get updated upvote count
    const upvotesSnapshot = await db.collection('pages').doc(pageId).collection('upvotes').get();
    const upvoteCount = upvotesSnapshot.size;

    // Update the denormalized upvoteCount field on the page for quick queries
    await db.collection('pages').doc(pageId).update({
      upvoteCount: upvoteCount,
      upvoteCountUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return security.sendJson(res, 200, {
      success: true,
      upvoted: isNowUpvoted,
      upvoteCount: upvoteCount,
      message: isNowUpvoted ? 'Upvote added.' : 'Upvote removed.'
    });
  }, { limit: 100, windowMs: 3600000 });
};
