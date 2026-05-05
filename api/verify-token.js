/**
 * /api/verify-token.js — Server-Side Token & Role Verification
 * 
 * Verifies Firebase ID token and fetches user role/clearance from Firestore.
 * Never trusts client-side role determination.
 * Returns verified user info only if token is valid.
 */

const admin = require('firebase-admin');
const errorHandler = require('./middleware/errorHandler');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();

/**
 * Verify Firebase ID token from Authorization header
 * Returns: { uid, email, role, clearanceLevel, displayName, verified: true }
 * Throws: Error if token invalid or user not found
 */
async function verifyIdToken(token) {
  if (!token) {
    const err = new Error('Unauthorized: No token provided');
    err.statusCode = 401;
    throw err;
  }

  let decodedToken;
  try {
    // Verify the Firebase ID token
    decodedToken = await auth.verifyIdToken(token, true); // checkRevoked = true
  } catch (err) {
    const error = new Error('Unauthorized: Invalid or expired token');
    error.statusCode = 401;
    throw error;
  }

  const uid = decodedToken.uid;
  const email = decodedToken.email || '';

  // Fetch user document from Firestore to get their actual role
  let userDoc;
  try {
    userDoc = await db.collection('users').doc(uid).get();
  } catch (err) {
    // If Firestore read fails, user exists in auth but has no profile
    return {
      uid,
      email,
      role: 'newbie', // Default unregistered user
      clearanceLevel: 2,
      displayName: email.split('@')[0],
      verified: true
    };
  }

  if (!userDoc.exists) {
    // User authenticated but has no profile yet
    return {
      uid,
      email,
      role: 'newbie',
      clearanceLevel: 2,
      displayName: email.split('@')[0],
      verified: true
    };
  }

  const userData = userDoc.data();
  return {
    uid,
    email,
    role: userData.role || 'newbie',
    clearanceLevel: userData.clearanceLevel || 2,
    displayName: userData.displayName || email.split('@')[0],
    verified: true
  };
}

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
 * Vercel serverless handler for token verification
 */
async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Allow CORS for frontend domain
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization || '';
    const token = extractToken(authHeader);

    if (!token) {
      return res.status(401).json({ 
        verified: false, 
        error: 'Unauthorized: No Bearer token provided' 
      });
    }

    // Verify token and fetch user role
    const verifiedUser = await verifyIdToken(token);

    return res.status(200).json({
      verified: true,
      user: verifiedUser
    });
  } catch (err) {
    // ISSUE 8 FIX: Sanitize error responses to prevent information leakage
    const handled = errorHandler.handleCatchError(err);
    return res.status(handled.statusCode).json({
      verified: false,
      error: handled.message
    });
  }
}

module.exports = handler;
