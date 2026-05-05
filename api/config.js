/**
 * /api/config.js — Secure Firebase Configuration Endpoint
 * 
 * Returns minimal client-safe Firebase config (NO API KEY exposed).
 * Client SDK uses this config to initialize Firebase without sensitive credentials.
 * 
 * Safe to expose: projectId, authDomain, storageBucket, messagingSenderId, appId
 * NEVER expose: apiKey (only for public API key auth, handled server-side)
 */

export default function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers (allow same-origin or your frontend domain)
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

  // Return minimal client-safe config
  const config = {
    projectId: process.env.FIREBASE_PROJECT_ID || 'redoakerguild',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'redoakerguild.firebaseapp.com',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'redoakerguild.firebasestorage.app',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '847903433642',
    appId: process.env.FIREBASE_APP_ID || '1:847903433642:web:95a9fdddef4099ff8981d3',
    // measurementId: process.env.FIREBASE_MEASUREMENT_ID || 'G-WLR20NDRQL' // Optional: only if GA is used
  };

  return res.status(200).json(config);
}
