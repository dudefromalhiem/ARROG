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

function normalizeVoteKey(value) {
  return String(value || '').trim();
}

function normalizePageKey(value) {
  const compact = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = compact.match(/^([a-z]+)(\d+)([a-z]*)$/i);
  if (!match) {
    return { compact };
  }

  return {
    compact,
    prefix: match[1],
    number: Number(match[2]),
    suffix: match[3] || ''
  };
}

function pageKeyMatches(a, b) {
  const left = normalizePageKey(a);
  const right = normalizePageKey(b);

  if (!left.compact || !right.compact) return false;
  if (left.compact === right.compact) return true;
  if (left.prefix && right.prefix && left.prefix === right.prefix && left.number === right.number) {
    if (!left.suffix && !right.suffix) return true;
    return left.suffix === right.suffix;
  }

  return false;
}

/**
 * POST /api/upvote.js
 * 
 * Toggle upvote for a page (anomalies only).
 * 
 * Request body:
 * {
 *   pageId: string (optional) - Firestore document ID of the page
 *   pageSlug: string (optional) - Page slug, used when pageId is unavailable
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
  return security.secureHandler(req, res, security.getRequestIp(req), async (req, res) => {
    // Handle method check
    if (req.method !== 'POST') {
      return security.sendError(res, 405, 'Method not allowed. Use POST.');
    }

    // Validate content length (max 1KB for this endpoint)
    if (!security.validateContentLength(req, 1024)) {
      return security.sendError(res, 413, 'Request payload too large');
    }

    // Verify authentication or accept an anonymous browser vote key.
    let user;
    try {
      user = await verifyUser(req);
    } catch (err) {
      user = null;
    }

    const anonymousVoteKey = normalizeVoteKey(req.body?.voteKey || req.headers['x-rog-vote-key']);
    const voteKey = user ? user.uid : anonymousVoteKey;
    if (!voteKey) {
      return security.sendError(res, 401, 'Sign in or provide a vote key to upvote.');
    }

    // Rate limit per user (100 upvotes per hour)
    if (security.enforceRateLimit(req, res, `upvote:${voteKey}`, { limit: 100, windowMs: 3600000 })) {
      return;
    }

    // Parse and validate request body
    const pageId = String(req.body?.pageId || '').trim();
    const pageSlug = String(req.body?.pageSlug || '').trim().toLowerCase();
    const pageType = String(req.body?.pageType || '').trim().toLowerCase();

    const hasValidPageId = pageId && security.validateId(pageId);
    const hasValidSlug = /^[a-z0-9-]{1,120}$/.test(pageSlug);
    if (!hasValidPageId && !hasValidSlug) {
      return security.sendError(res, 400, 'Invalid page target. Provide pageId or pageSlug.');
    }

    // Only allow upvotes for anomalies
    if (pageType !== 'anomaly' && !pageType.includes('anomaly')) {
      return security.sendError(res, 400, 'Upvotes are only available for anomaly pages.');
    }

    const app = initAdmin();
    const db = admin.firestore(app);

    // Resolve page by ID first, then slug-as-ID, then slug fallback.
    let resolvedPageId = hasValidPageId ? pageId : '';
    let pageDoc = null;

    if (hasValidPageId) {
      const byId = await db.collection('pages').doc(pageId).get();
      if (byId.exists) {
        pageDoc = byId;
      }
    }

    // NEW: Try direct slug-as-ID lookup (Fast path for seeded/synced pages)
    if (!pageDoc && hasValidSlug) {
      const bySlugId = await db.collection('pages').doc(pageSlug.toLowerCase()).get();
      if (bySlugId.exists) {
        pageDoc = bySlugId;
        resolvedPageId = bySlugId.id;
      }
    }

    if (!pageDoc && hasValidSlug) {
      const bySlugQuery = await db.collection('pages').where('slug', '==', pageSlug.toLowerCase()).limit(1).get();
      if (!bySlugQuery.empty) {
        pageDoc = bySlugQuery.docs[0];
        resolvedPageId = pageDoc.id;
      }
    }

    // Fallback: search all anomalies if the specific ones missed (e.g. slight slug variation in DB)
    if (!pageDoc && hasValidSlug) {
      // Try both 'Anomaly' and 'anomaly' cases for broad compatibility
      const snapshots = await Promise.all([
        db.collection('pages').where('type', '==', 'Anomaly').get(),
        db.collection('pages').where('type', '==', 'anomaly').get()
      ]);
      
      const allDocs = [...snapshots[0].docs, ...snapshots[1].docs];
      const targetSlug = pageSlug.toLowerCase();
      
      const matchedDoc = allDocs.find(doc => {
        const docData = doc.data() || {};
        return pageKeyMatches(docData.slug || '', targetSlug) || pageKeyMatches(doc.id || '', targetSlug);
      });

      if (matchedDoc) {
        pageDoc = matchedDoc;
        resolvedPageId = matchedDoc.id;
      }
    }

    if (!pageDoc || !pageDoc.exists || !resolvedPageId) {
      return security.sendError(res, 404, 'Page not found for upvote target.');
    }

    const pageData = pageDoc.data() || {};
    if (String(pageData.type || '').toLowerCase() !== 'anomaly') {
      return security.sendError(res, 400, 'Upvotes are only available for anomaly pages.');
    }

    // Check if page is approved
    const status = String(pageData.status || '').toLowerCase();
    const hasLegacyApproval = !!pageData.approvedAt || !!pageData.approvedBy;
    if (status && status !== 'approved' && !hasLegacyApproval) {
      return security.sendError(res, 400, 'Cannot upvote unapproved pages.');
    }

    const upvoteRef = db.collection('pages').doc(resolvedPageId).collection('upvotes').doc(voteKey);
    const upvoteSnapshot = await upvoteRef.get();
    const currentlyUpvoted = upvoteSnapshot.exists;

    let isNowUpvoted = !currentlyUpvoted;

    if (currentlyUpvoted) {
      // Remove upvote
      await upvoteRef.delete();
    } else {
      // Add upvote
      await upvoteRef.set({
        userId: voteKey,
        email: user ? user.email : '',
        anonymous: !user,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Get updated upvote count
    const upvotesSnapshot = await db.collection('pages').doc(resolvedPageId).collection('upvotes').get();
    const upvoteCount = upvotesSnapshot.size;

    // Update the denormalized upvoteCount field on the page for quick queries
    await db.collection('pages').doc(resolvedPageId).update({
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
