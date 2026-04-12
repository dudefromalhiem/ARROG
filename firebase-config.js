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

function renderUserMenuHTML(displayLabel) {
  const safeLabel = String(displayLabel || 'Agent').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
    <div class="user-menu" data-user-menu>
      <button class="nav-btn user-menu-trigger" type="button" onclick="toggleUserMenu(this, event)" aria-haspopup="true" aria-expanded="false">
        <span class="user-menu-label">${safeLabel}</span>
        <span class="user-menu-caret">▾</span>
      </button>
      <div class="user-menu-panel" role="menu" aria-label="User menu">
        <button class="user-menu-item" type="button" role="menuitem" onclick="changeUsername(); closeUserMenus();">Change Username</button>
        <button class="user-menu-item" type="button" role="menuitem" onclick="auth.signOut(); closeUserMenus();">Log Out</button>
      </div>
    </div>`;
}

function closeUserMenus() {
  document.querySelectorAll('[data-user-menu].open').forEach(menu => {
    menu.classList.remove('open');
    const trigger = menu.querySelector('.user-menu-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  });
}

function toggleUserMenu(trigger, event) {
  if (event) event.stopPropagation();
  const menu = trigger && trigger.closest('[data-user-menu]');
  if (!menu) return;
  const shouldOpen = !menu.classList.contains('open');
  closeUserMenus();
  if (shouldOpen) {
    menu.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  }
}

document.addEventListener('click', event => {
  if (!event.target.closest('[data-user-menu]')) closeUserMenus();
});

/* ═══════════════════════════════════════════════════════════════
 *  RBAC — Dynamic role resolution via Firestore (config/roles)
 *  Admin emails are managed by the Owner via the Admin Terminal.
 *  Bootstrap owner is a safety-net fallback for initial setup only.
 * ═══════════════════════════════════════════════════════════════ */

// Bootstrap — only used if Firestore config/roles doesn't exist yet
const _BOOTSTRAP = ["jaimejoselaureano@gmail.com", "dudefromalhiem@gmail.com"];
let ROLE_DATA = { owners: [], admins: [], mods: [] };

const rolesReady = (async () => {
  try {
    const doc = await db.collection('config').doc('roles').get();
    if (doc.exists) {
      const d = doc.data();
      ROLE_DATA.owners = (d.owners || []).map(e => e.toLowerCase());
      ROLE_DATA.admins = (d.admins || []).map(e => e.toLowerCase());
      ROLE_DATA.mods = (d.mods || []).map(e => e.toLowerCase());
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
  if (ROLE_DATA.mods.includes(e)) return "mod";
  return "user";
}
function isModerator(email) {
  const r = resolveRole(email);
  return r === "mod" || r === "admin" || r === "owner";
}
function isAdmin(email) { const r = resolveRole(email); return r === "admin" || r === "owner"; }
function isOwner(email) { return resolveRole(email) === "owner"; }
function clearanceLevelForRole(role) {
  if (role === "owner") return 6;
  if (role === "admin") return 5;
  if (role === "mod") return 3;
  if (role === "user") return 2;
  return 1;
}
