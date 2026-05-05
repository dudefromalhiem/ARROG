/**
 * /api/middleware/auth.js — Server-Side Authentication Middleware
 * 
 * Reusable middleware for all API endpoints.
 * Verifies Firebase ID token from Authorization header.
 * All protected endpoints must call this before processing.
 * 
 * Usage:
 *   const { user, error, status } = await verifyAuth(req);
 *   if (error) return res.status(status).json({ error });
 *   // Now use user.uid, user.email, user.role for operations
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();

/**
 * Extract Bearer token from Authorization header
 */
function extractToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  return parts[1];
}

/**
 * Verify Firebase ID token and return user info with role
 * 
 * Returns: { user: { uid, email, role, clearanceLevel, displayName }, error: null, status: 200 }
 * Or:      { user: null, error: 'message', status: 401|403|500 }
 */
async function verifyAuth(req) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization || '';
    const token = extractToken(authHeader);

    if (!token) {
      return {
        user: null,
        error: 'Unauthorized: No Bearer token provided',
        status: 401
      };
    }

    // Verify the Firebase ID token
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token, true); // checkRevoked = true
    } catch (err) {
      return {
        user: null,
        error: 'Unauthorized: Invalid or expired token',
        status: 401
      };
    }

    const uid = decodedToken.uid;
    const email = decodedToken.email || '';

    // Fetch user document from Firestore to get their actual role and clearance
    let userDoc;
    try {
      userDoc = await db.collection('users').doc(uid).get();
    } catch (err) {
      // If Firestore read fails, still allow auth but with default role
      return {
        user: {
          uid,
          email,
          role: 'newbie',
          clearanceLevel: 2,
          displayName: email.split('@')[0]
        },
        error: null,
        status: 200
      };
    }

    if (!userDoc.exists) {
      // User authenticated but has no profile yet
      return {
        user: {
          uid,
          email,
          role: 'newbie',
          clearanceLevel: 2,
          displayName: email.split('@')[0]
        },
        error: null,
        status: 200
      };
    }

    const userData = userDoc.data();
    return {
      user: {
        uid,
        email,
        role: userData.role || 'newbie',
        clearanceLevel: userData.clearanceLevel || 2,
        displayName: userData.displayName || email.split('@')[0]
      },
      error: null,
      status: 200
    };
  } catch (err) {
    return {
      user: null,
      error: 'Internal server error',
      status: 500
    };
  }
}

/**
 * Check if user has minimum clearance level (server-side)
 */
function hasMinimumClearance(user, requiredLevel) {
  if (!user) return false;
  return (user.clearanceLevel || 2) >= requiredLevel;
}

/**
 * Check if user has specific role (server-side)
 */
function hasRole(user, roles) {
  if (!user || !user.role) return false;
  const roleList = Array.isArray(roles) ? roles : [roles];
  return roleList.includes(user.role);
}

module.exports = {
  extractToken,
  verifyAuth,
  hasMinimumClearance,
  hasRole
};
