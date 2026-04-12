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

if (!document.getElementById('auth-pending-style')) {
  const style = document.createElement('style');
  style.id = 'auth-pending-style';
  style.textContent = `html.auth-pending .hdr { visibility: hidden; }`;
  document.head.appendChild(style);
}

document.documentElement.classList.add('auth-pending');

function waitForReady(promise, timeoutMs = 1200) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(resolve, timeoutMs))
  ]);
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

async function getUserAdminFlag(user) {
  if (!user) return false;
  try {
    const doc = await db.collection('users').doc(user.uid).get();
    return !!(doc.exists && doc.data() && doc.data().isAdmin === true);
  } catch (_err) {
    return false;
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

function closeMobileNav() {
  const nav = document.getElementById('nav');
  if (nav) nav.classList.remove('open');
}

function normalizeNavIA() {
  const nav = document.getElementById('nav');
  if (!nav) return;

  const submitLi = nav.querySelector('#submit-link');
  const adminLi = nav.querySelector('#admin-link');
  const authLi = nav.querySelector('#nav-auth');

  const primary = [
    { href: 'explore.html', label: 'Explore' },
    { href: 'guide.html', label: 'Guide' }
  ];

  nav.innerHTML = '';
  primary.forEach(item => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = item.href;
    a.textContent = item.label;
    li.appendChild(a);
    nav.appendChild(li);
  });

  if (submitLi) nav.appendChild(submitLi);
  if (adminLi) nav.appendChild(adminLi);
  if (authLi) nav.appendChild(authLi);
}

function normalizedCurrentPath() {
  const raw = location.pathname.replace(/\/+$/, '').split('/').pop() || 'index.html';
  const aliases = {
    '': 'index.html',
    'index': 'index.html',
    'explore': 'explore.html',
    'registry': 'registry.html',
    'guide': 'guide.html',
    'archives': 'archives.html',
    'submit': 'submit.html',
    'admin': 'admin.html'
  };
  return aliases[raw] || raw;
}

function markActiveNavLink() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const current = normalizedCurrentPath();
  nav.querySelectorAll('a[href]').forEach(link => {
    const href = (link.getAttribute('href') || '').split('?')[0];
    link.classList.toggle('active', href === current);
  });
}

function ensureSkipLink() {
  if (document.querySelector('.skip-link')) return;
  const main = document.querySelector('main');
  if (!main) return;
  if (!main.id) main.id = 'main-content';
  const skip = document.createElement('a');
  skip.className = 'skip-link';
  skip.href = '#' + main.id;
  skip.textContent = 'Skip to content';
  document.body.prepend(skip);
}

function ensureBackToTop() {
  if (document.getElementById('back-to-top')) return;
  const btn = document.createElement('button');
  btn.id = 'back-to-top';
  btn.className = 'back-to-top';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Back to top');
  btn.textContent = '↑';
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.body.appendChild(btn);

  const toggle = () => {
    btn.classList.toggle('show', window.scrollY > 460);
  };
  window.addEventListener('scroll', toggle, { passive: true });
  toggle();
}

function bindGlobalNavUX() {
  const nav = document.getElementById('nav');
  const toggle = document.querySelector('.nav-toggle');
  if (!nav || !toggle) return;

  toggle.setAttribute('aria-label', 'Toggle navigation');
  toggle.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
  toggle.setAttribute('aria-controls', 'nav');

  nav.addEventListener('click', e => {
    const target = e.target;
    if (target && target.closest('a,button')) closeMobileNav();
  });

  document.addEventListener('click', e => {
    if (!nav.classList.contains('open')) return;
    if (!e.target.closest('.hdr')) closeMobileNav();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeUserMenus();
      closeMobileNav();
    }
  });

  const observer = new MutationObserver(() => {
    toggle.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
  });
  observer.observe(nav, { attributes: true, attributeFilter: ['class'] });
}

function initializeGlobalUX() {
  normalizeNavIA();
  ensureSkipLink();
  ensureBackToTop();
  bindGlobalNavUX();
  markActiveNavLink();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeGlobalUX);
} else {
  initializeGlobalUX();
}

/* ═══════════════════════════════════════════════════════════════
 *  RBAC — Dynamic role resolution via Firestore (config/roles)
 *  Admin emails are managed by the Owner via the Admin Terminal.
 *  Bootstrap owner is a safety-net fallback for initial setup only.
 * ═══════════════════════════════════════════════════════════════ */

// Bootstrap — only used if Firestore config/roles doesn't exist yet
const _BOOTSTRAP = ["jaimejoselaureano@gmail.com", "dudefromalhiem@gmail.com"];
let ROLE_DATA = { owners: [], admins: [], mods: [] };
let SITE_STATE = { esdLocked: false, esdActivatedBy: '', esdActivatedAt: null };
let rolesReadyResolved = false;

const siteStateReady = (async () => {
  try {
    const doc = await db.collection('config').doc('site').get();
    if (doc.exists) {
      SITE_STATE = { ...SITE_STATE, ...(doc.data() || {}) };
    }
  } catch (e) {
    console.warn('[RBAC] Could not fetch site config from Firestore.');
  }
})();

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
  rolesReadyResolved = true;
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
  if (role === "mod") return 4;
  if (role === "user") return 2;
  return 2;
}

async function syncSharedNav(user) {
  const navAuth = document.getElementById('nav-auth');
  const submitLink = document.getElementById('submit-link');
  const adminLink = document.getElementById('admin-link');
  if (!navAuth) return;

  if (user) {
    const displayLabel = user.displayName || 'Agent';
    const isAdminUser = await getUserAdminFlag(user);
    navAuth.innerHTML = renderUserMenuHTML(displayLabel);
    if (submitLink) submitLink.classList.remove('hidden');
    if (adminLink) adminLink.classList.toggle('hidden', !isAdminUser);
  } else {
    const onHome = normalizedCurrentPath() === 'index.html' && typeof openAuth === 'function';
    navAuth.innerHTML = onHome
      ? '<button class="nav-btn" onclick="openAuth()">Sign In</button>'
      : '<button class="nav-btn" onclick="location.href=\'index.html\'">Sign In</button>';
    if (submitLink) submitLink.classList.add('hidden');
    if (adminLink) adminLink.classList.add('hidden');
  }
}

async function syncServerAuthCookie(user) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  if (!user) {
    document.cookie = 'rog_id_token=; Max-Age=0; Path=/; SameSite=Lax' + secure;
    return;
  }
  try {
    const token = await user.getIdToken(false);
    // Keep short-lived token in a first-party cookie so Vercel middleware can gate /admin.
    document.cookie = 'rog_id_token=' + token + '; Max-Age=3600; Path=/; SameSite=Lax' + secure;
  } catch (_err) {
    document.cookie = 'rog_id_token=; Max-Age=0; Path=/; SameSite=Lax' + secure;
  }
}

function applySiteAccessGate(user) {
  const locked = !!SITE_STATE.esdLocked;
  const privileged = !!user && isModerator(user.email);
  const gateId = 'site-access-gate';
  const pageRoots = Array.from(document.querySelectorAll('main, footer'));

  if (locked && !privileged) {
    pageRoots.forEach(el => {
      if (!el.dataset.esdHidden) {
        el.dataset.esdHidden = '1';
        el.classList.add('hidden');
      }
    });
    if (!document.getElementById(gateId)) {
      const gate = document.createElement('div');
      gate.id = gateId;
      gate.className = 'section tc';
      gate.style.cssText = 'max-width:640px;margin:64px auto;padding:28px;border:1px solid var(--red-b);background:rgba(0,0,0,.92)';
      gate.innerHTML = '<div class="section-hd">Emergency Shutdown Active</div><p style="font-size:.85rem;color:var(--wht-d);line-height:1.7">The Guild archive is temporarily locked. Only moderators, admins, and owners may access site content right now.</p>';
      document.body.appendChild(gate);
    }
  } else {
    const gate = document.getElementById(gateId);
    if (gate) gate.remove();
    pageRoots.forEach(el => {
      if (el.dataset.esdHidden) {
        el.classList.remove('hidden');
        delete el.dataset.esdHidden;
      }
    });
  }
}

auth.onAuthStateChanged(async user => {
  syncServerAuthCookie(user);
  await syncSharedNav(user);
  applySiteAccessGate(user);
  document.documentElement.classList.remove('auth-pending');

  Promise.allSettled([rolesReady, siteStateReady]).then(() => {
    SITE_STATE.esdLocked = !!SITE_STATE.esdLocked;
    syncSharedNav(user);
    applySiteAccessGate(user);
  });
});
