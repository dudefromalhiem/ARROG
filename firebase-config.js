/* ═══════════════════════════════════════════════════════════════
 *  FIREBASE CONFIGURATION — Replace placeholders before deploy
 *  For GitHub Pages, these are public config keys (safe to commit)
 * ═══════════════════════════════════════════════════════════════ */
const firebaseConfig = {
  apiKey: "AIzaSyDq8UwN7P1EDfa0IvR2-jUUgV3dHt67f3M",
  authDomain: "redoakerguild.firebaseapp.com",
  projectId: "redoakerguild",
  // Canonical Cloud Storage bucket for Firebase uploads.
  storageBucket: "redoakerguild.appspot.com",
  messagingSenderId: "847903433642",
  appId: "1:847903433642:web:95a9fdddef4099ff8981d3",
  measurementId: "G-WLR20NDRQL"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
let storage = null;

function configureStorageClient(client) {
  if (!client) return;
  client.setMaxUploadRetryTime(120000);
  client.setMaxOperationRetryTime(120000);
}

function ensureStorageClient(preferredBucket) {
  if (typeof firebase.storage !== 'function') {
    throw new Error('Firebase Storage SDK is not loaded on this page.');
  }

  const bucket = (preferredBucket || '').replace(/^gs:\/\//, '');
  if (!bucket && storage) return storage;

  const next = bucket ? firebase.app().storage('gs://' + bucket) : firebase.storage();
  configureStorageClient(next);
  if (!bucket) storage = next;
  return next;
}

function getStorageRef(path, preferredBucket) {
  const cleanPath = String(path || '').replace(/^\/+/, '');
  if (!cleanPath) throw new Error('Storage path is required.');

  return ensureStorageClient(preferredBucket).ref(cleanPath);
}

async function changeUsername() {
  const user = auth.currentUser;
  if (!user) {
    alert('Please sign in first.');
    return;
  }

  const currentName = user.displayName || '';
  const newName = prompt('Enter new Username/Display Name:', currentName);
  if (newName === null) return;

  const trimmed = newName.trim();
  if (!trimmed) {
    alert('Username cannot be empty.');
    return;
  }

  try {
    await user.updateProfile({ displayName: trimmed });
    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      displayName: trimmed,
      lastLogin: new Date().toISOString()
    }, { merge: true });
    alert('Username updated to ' + trimmed + '.');
    location.reload();
  } catch (err) {
    alert('Failed to update username: ' + err.message);
  }
}

// Try to warm up storage when SDK is available, but keep non-upload pages functional.
try {
  storage = ensureStorageClient();
} catch (e) {
  console.warn('[Storage] Initialization skipped:', e.message || e);
}

/* ═══════════════════════════════════════════════════════════════
 *  RBAC — Dynamic role resolution via Firestore (config/roles)
 *  Admin emails are managed by the Owner via the Admin Terminal.
 *  Bootstrap owner is a safety-net fallback for initial setup only.
 * ═══════════════════════════════════════════════════════════════ */

// Bootstrap — only used if Firestore config/roles doesn't exist yet
const _BOOTSTRAP = ["jaimejoselaureano@gmail.com", "dudefromalhiem@gmail.com"];
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
function clearanceLevelForRole(role) {
  if (role === "owner") return 5;
  if (role === "admin") return 4;
  return 2;
}
