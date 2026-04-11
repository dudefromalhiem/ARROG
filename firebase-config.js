/* ═══════════════════════════════════════════════════════════════
 *  FIREBASE CONFIGURATION — Replace placeholders before deploy
 *  For GitHub Pages, these are public config keys (safe to commit)
 * ═══════════════════════════════════════════════════════════════ */
const firebaseConfig = {
  apiKey: "AIzaSyDq8UwN7P1EDfa0IvR2-jUUgV3dHt67f3M",
  authDomain: "redoakerguild.firebaseapp.com",
  projectId: "redoakerguild",
  storageBucket: "redoakerguild.firebasestorage.app",
  messagingSenderId: "847903433642",
  appId: "1:847903433642:web:95a9fdddef4099ff8981d3",
  measurementId: "G-WLR20NDRQL"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

/* ═══════════════════════════════════════════════════════════════
 *  RBAC — Dynamic role resolution via Firestore (config/roles)
 *  Admin emails are managed by the Owner via the Admin Terminal.
 *  Bootstrap owner is a safety-net fallback for initial setup only.
 * ═══════════════════════════════════════════════════════════════ */

// Bootstrap — only used if Firestore config/roles doesn't exist yet
const _BOOTSTRAP = [];
let ROLE_DATA = { owners: [], admins: [] };

const rolesReady = (async () => {
  try {
    const doc = await db.collection('config').doc('roles').get();
    if (doc.exists) {
      const d = doc.data();
      ROLE_DATA.owners = (d.owners || []).map(e => e.toLowerCase());
      ROLE_DATA.admins = (d.admins || []).map(e => e.toLowerCase());
    }
  } catch (e) {
    console.warn('[RBAC] Could not fetch roles from Firestore — using bootstrap.');
  }
  // Merge bootstrap owners as safety net
  _BOOTSTRAP.forEach(bo => {
    const low = bo.toLowerCase();
    if (!ROLE_DATA.owners.includes(low)) ROLE_DATA.owners.push(low);
  });
})();

function resolveRole(email) {
  if (!email) return "user";
  const e = email.toLowerCase();
  if (ROLE_DATA.owners.includes(e)) return "owner";
  if (ROLE_DATA.admins.includes(e)) return "admin";
  return "user";
}
function isAdmin(email) { const r = resolveRole(email); return r === "admin" || r === "owner"; }
function isOwner(email) { return resolveRole(email) === "owner"; }
