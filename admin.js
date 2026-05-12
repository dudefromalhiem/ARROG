/* ═══════════════════════════════════════════════════════════════
 *  ADMIN.JS — Admin dashboard logic
 *  Full CRUD for Pages, Artworks, News + Archivist-only User mgmt
 * ═══════════════════════════════════════════════════════════════ */

let activeTab = 'pages';
let adminArtworkUploadUrl = '';
let adminNewsImageUrl = '';
let currentUserIsAdminFlag = false;
let currentUserDoc = null;
let adminSeedDataLoadPromise = null;
let socialApiBase = '/api/social';
const REMOTE_SOCIAL_API_BASES = [
  'https://www.redoakerguild.com/api/social',
  'https://arrog-l1n833511-dudefromalhiem-1186s-projects.vercel.app/api/social'
];

// Utility for safe HTML rendering
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function escapeAttr(text) {
  return String(text || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function applyRedactionSpans(html) {
  return String(html || '').replace(/\|\|([\s\S]*?)\|\|/g, function(_m, inner) {
    const safe = escapeAttr(String(inner || ''));
    return '<span class="redaction" data-original="' + safe + '" aria-hidden="true">' + escapeHtml(inner) + '</span>';
  });
}


// Permission system functions (client-side)
const PERMISSIONS = {
  viewContent: { level: 2, description: 'View public content' },
  comment: { level: 3, description: 'Post comments and interact with content' },
  interact: { level: 3, description: 'Like, share, and engage with content' },
  createPages: { level: 4, description: 'Create new pages and content' },
  editOwnPages: { level: 4, description: 'Edit pages they created' },
  monitorActivity: { level: 5, description: 'Monitor user activity and reports' },
  handleViolations: { level: 5, description: 'Review and handle reported violations' },
  moderateUsers: { level: 5, description: 'Moderate user accounts and content' },
  moderateContent: { level: 5, description: 'Delete, hide, or modify inappropriate content' },
  manageUsers: { level: 6, description: 'Create, modify, and delete user accounts' },
  manageRoles: { level: 6, description: 'Assign and modify user roles and permissions' },
  manageContent: { level: 6, description: 'Full content management and system administration' },
  systemAdmin: { level: 6, description: 'System configuration and maintenance' }
};

function getPermissions(userDoc) {
  if (!userDoc) {
    return getPermissionsForLevel(2);
  }

  // Resolve level from doc or email-based roles
  let level = userDoc.level;
  const email = userDoc.email || '';
  const isOwnerFlag = userDoc.isOwner === true || (email && isOwner(email));
  
  if (isOwnerFlag) {
    return getAllPermissions();
  }

  if (!level && email) {
    const lvl100 = getUserLevel(email);
    if (lvl100 >= 60) level = 6;      // Admin
    else if (lvl100 >= 10) level = 5; // Moderator
    else if (lvl100 >= 5) level = 3;  // User
    else level = 2;                  // Guest
  }
  
  level = level || 2;
  const contributorGranted = userDoc.contributorGranted === true;

  let permissions = {};

  if (level >= 2) permissions = { ...permissions, ...getPermissionsForLevel(2) };
  if (level >= 3) permissions = { ...permissions, ...getPermissionsForLevel(3) };

  if (level === 4 || level === 6 || (level === 5 && contributorGranted)) {
    permissions = { ...permissions, ...getPermissionsForLevel(4) };
  }

  if (level >= 5) permissions = { ...permissions, ...getPermissionsForLevel(5) };
  if (level >= 6) permissions = { ...permissions, ...getPermissionsForLevel(6) };

  return permissions;
}

function getPermissionsForLevel(level) {
  const permissions = {};
  Object.keys(PERMISSIONS).forEach(permKey => {
    if (PERMISSIONS[permKey].level <= level) {
      permissions[permKey] = true;
    }
  });
  return permissions;
}

function getAllPermissions() {
  const permissions = {};
  Object.keys(PERMISSIONS).forEach(permKey => {
    permissions[permKey] = true;
  });
  return permissions;
}

function hasPermission(userDoc, permission) {
  const permissions = getPermissions(userDoc);
  return permissions[permission] === true;
}

function getRoleDisplayName(userDoc) {
  if (!userDoc) return 'Guest';

  if (userDoc.isOwner) return 'Owner';

  const level = userDoc.level || 2;
  const roleName = userDoc.roleName || '';

  if (roleName) return roleName;

  const hierarchy = {
    2: 'Guest',
    3: 'User',
    4: 'Contributor',
    5: 'Moderator',
    6: 'Admin'
  };

  return hierarchy[level] || 'Unknown';
}

function getRoleDisplayNameForUserRecord(userRecord) {
  const user = userRecord || {};
  const email = String(user.email || '').toLowerCase();
  const explicitRole = String(user.role || '').toLowerCase().trim();
  const resolvedRole = email ? resolveRole(email) : '';
  const roleKey = resolvedRole || explicitRole;

  if (roleKey && ROLE_NAMES[roleKey]) return ROLE_NAMES[roleKey];
  if (roleKey === 'owner') return 'Owner';
  if (roleKey === 'admin') return 'Administrator';
  if (roleKey === 'mod') return 'Moderator';
  return getRoleDisplayName(user);
}

function getCurrentRole() {
  return getRoleDisplayName(currentUserDoc);
}

function renderHierarchyGraph() {
  const chain = [
    { key: 'owner', label: 'Owner / Archivist' },
    { key: 'chief-admin', label: 'Chief Administrator' },
    { key: 'deputy-chief-admin', label: 'Deputy Chief Administrator' },
    { key: 'senior-admin', label: 'Senior Administrator' },
    { key: 'admin', label: 'Administrator' },
    { key: 'chief-mod', label: 'Chief of Moderation' },
    { key: 'deputy-chief-mod', label: 'Deputy Chief of Moderation' },
    { key: 'senior-mod', label: 'Senior Moderator' },
    { key: 'mod', label: 'Moderator' },
    { key: 'junior-mod', label: 'Junior Moderator' },
    { key: 'user', label: 'User' },
    { key: 'guest', label: 'Guest' }
  ];

  const blocks = chain.map((entry, idx) => {
    const style = idx < chain.length - 1 ? 'margin-bottom:10px;' : '';
    return '<div style="' + style + '">' +
      '<div style="border:1px solid var(--blk-m);padding:8px 10px;background:rgba(255,255,255,.02);font-size:.8rem">' + escapeHtml(entry.label) + '</div>' +
      (idx < chain.length - 1 ? '<div style="text-align:center;color:var(--wht-f);font-size:.75rem;line-height:1.1;padding:3px 0">|</div>' : '') +
    '</div>';
  }).join('');

  return '<div style="margin-bottom:20px;border:1px solid var(--blk-m);padding:14px;background:rgba(0,0,0,.25)">' +
    '<h4 style="margin-bottom:10px;color:var(--red-b)">Guild Authority Hierarchy</h4>' +
    '<p style="font-size:.78rem;color:var(--wht-d);margin-bottom:10px">Visibility: all admin-clearance users.</p>' +
    blocks +
  '</div>';
}

function isModOnlyRole() {
  if (!auth.currentUser?.email) return true;
  return !currentUserIsAdminFlag && !isOwner(auth.currentUser.email) && !isAdmin(auth.currentUser.email);
}

function canModeratorOpenTab(tab) {
  const allowed = new Set(['submissions', 'reports', 'applications', 'contributors']);
  return allowed.has(String(tab || ''));
}

function ensureAdminSeedDataLoaded() {
  if (typeof PAGE_SEED !== 'undefined' && Array.isArray(PAGE_SEED)) {
    return Promise.resolve(true);
  }
  if (adminSeedDataLoadPromise) return adminSeedDataLoadPromise;

  adminSeedDataLoadPromise = new Promise(resolve => {
    const existing = document.querySelector('script[data-seed-data="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(typeof PAGE_SEED !== 'undefined' && Array.isArray(PAGE_SEED)), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'seed-data.js';
    script.defer = true;
    script.setAttribute('data-seed-data', 'true');
    script.onload = () => resolve(typeof PAGE_SEED !== 'undefined' && Array.isArray(PAGE_SEED));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return adminSeedDataLoadPromise;
}

function canModerateSubmissions() {
  const userDoc = currentUserDoc || {};
  return hasPermission(userDoc, 'moderateContent');
}

function configureSocialApiBase() {
  try {
    if (window.REDOAK_API && typeof window.REDOAK_API.social === 'function') {
      socialApiBase = window.REDOAK_API.social();
      return;
    }
    const host = String(window.location.hostname || '').toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    const isFile = window.location.protocol === 'file:';
    const isGithubPages = host.endsWith('.github.io');
    if (isLocal || isFile || isGithubPages) {
      socialApiBase = REMOTE_SOCIAL_API_BASES[0];
      return;
    }
  } catch (_err) {
    // Keep default relative API path.
  }
  socialApiBase = '/api/social';
}

async function getSocialApiHeaders() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in first.');
  }
  const token = await user.getIdToken();
  return {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json'
  };
}

async function callSocialApi(method, payload = {}, query = '') {
  try {
    const requestHeaders = await getSocialApiHeaders();
    let response = null;
    
    try {
      response = await fetch(socialApiBase + query, {
        method: method,
        headers: requestHeaders,
        body: method === 'GET' ? undefined : JSON.stringify(payload)
      });
    } catch (networkErr) {
      // If initial local API failed, try all configured remote fallbacks
      const tried = [];
      let lastErr = networkErr;
      for (let i = 0; i < REMOTE_SOCIAL_API_BASES.length; i++) {
        const base = REMOTE_SOCIAL_API_BASES[i];
        tried.push(base);
        try {
          socialApiBase = base;
          response = await fetch(socialApiBase + query, {
            method: method,
            headers: requestHeaders,
            body: method === 'GET' ? undefined : JSON.stringify(payload)
          });
          break; // success (or a non-network response)
        } catch (e) {
          lastErr = e;
          // continue to next remote
        }
      }
      if (!response) {
        const err = new Error('Network failure when contacting social API. Tried: ' + tried.join(', ') + '. Last error: ' + (lastErr && lastErr.message ? lastErr.message : String(lastErr)));
        err.cause = lastErr;
        throw err;
      }
    }

    if (!response.ok && response.status === 404 && socialApiBase === '/api/social') {
      socialApiBase = REMOTE_SOCIAL_API_BASES[0];
      response = await fetch(socialApiBase + query, {
        method: method,
        headers: requestHeaders,
        body: method === 'GET' ? undefined : JSON.stringify(payload)
      });
    }

    if (!response.ok && response.status === 404) {
      const currentRemoteIndex = REMOTE_SOCIAL_API_BASES.indexOf(socialApiBase);
      if (currentRemoteIndex !== -1 && currentRemoteIndex < REMOTE_SOCIAL_API_BASES.length - 1) {
        socialApiBase = REMOTE_SOCIAL_API_BASES[currentRemoteIndex + 1];
        response = await fetch(socialApiBase + query, {
          method: method,
          headers: requestHeaders,
          body: method === 'GET' ? undefined : JSON.stringify(payload)
        });
      }
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data && data.error ? data.error : ('Request failed with status ' + response.status);
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }
    return data;
  } catch (err) {
    // Provide actionable logs including target base and status
    console.error('Social API call failed for ' + query + ' (base=' + socialApiBase + '):', err && err.message ? err.message : err);
    const wrapped = new Error('Social API request failed: ' + (err && err.message ? err.message : 'Unknown error') + ' (base=' + socialApiBase + ')');
    wrapped.status = err && err.status ? err.status : undefined;
    throw wrapped;
  }
}

function canDeleteManagedContent() {
  const userDoc = currentUserDoc || {};
  return hasPermission(userDoc, 'moderateContent');
}

function isGuideType(type) {
  return String(type || '').toLowerCase() === 'guide';
}

function canManageGuidePages() {
  return isOwner(auth.currentUser?.email);
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

function dataUrlBytes(dataUrl) {
  const parts = String(dataUrl || '').split(',');
  if (parts.length < 2) return 0;
  const base64 = parts[1];
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image.'));
    img.src = url;
  });
}

async function optimizeImageToDataUrl(file, maxDim = 1280, maxBytes = 250 * 1024) {
  const original = await toDataUrl(file);
  const image = await loadImage(original);

  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.max(1, Math.floor(width * scale));
  height = Math.max(1, Math.floor(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not initialize canvas.');

  ctx.drawImage(image, 0, 0, width, height);
  let quality = 0.82;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);

  while (dataUrlBytes(dataUrl) > maxBytes && quality > 0.45) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  let shrinkPass = 0;
  while (dataUrlBytes(dataUrl) > maxBytes && shrinkPass < 4) {
    width = Math.max(1, Math.floor(width * 0.85));
    height = Math.max(1, Math.floor(height * 0.85));
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, width, height);
    dataUrl = canvas.toDataURL('image/jpeg', Math.max(0.45, quality));
    shrinkPass++;
  }

  if (dataUrlBytes(dataUrl) > maxBytes) {
    throw new Error('Image is too large after optimization. Use a smaller image.');
  }

  return dataUrl;
}

function applyTabVisibilityForRole(user, hasAdminAccess = false) {
  const pagesTab = document.getElementById('tab-pages');
  const submissionsTab = document.getElementById('tab-submissions');
  const artworksTab = document.getElementById('tab-artworks');
  const newsTab = document.getElementById('tab-news');
  const reportsTab = document.getElementById('tab-reports');
  const contributorsTab = document.getElementById('tab-contributors');
  const applicationsTab = document.getElementById('tab-applications');
  const usersTab = document.getElementById('tab-users');
  const rolesTab = document.getElementById('tab-roles');
  const configTab = document.getElementById('tab-config');

  const isOwnerUser = isOwner(user.email);
  const isAdminUser = isAdmin(user.email);
  const isModUser = isModerator(user.email);
  const isModOnly = !isOwnerUser && !isAdminUser;

  // Owner and admin see all tabs
  if (pagesTab) pagesTab.classList.toggle('hidden', isModOnly);
  if (submissionsTab) submissionsTab.classList.remove('hidden');
  if (artworksTab) artworksTab.classList.toggle('hidden', isModOnly);
  if (newsTab) newsTab.classList.toggle('hidden', isModOnly);
  if (reportsTab) reportsTab.classList.remove('hidden');
  if (contributorsTab) contributorsTab.classList.remove('hidden');
  if (applicationsTab) applicationsTab.classList.remove('hidden');
  if (configTab) configTab.classList.toggle('hidden', isModOnly);

  // Users tab: visible to owner, admin, and anyone with manageUsers perm
  const canViewUsersTab = isOwnerUser || isAdminUser || hasAdminAccess || hasPermission(currentUserDoc, 'manageUsers');
  if (usersTab) usersTab.classList.toggle('hidden', !canViewUsersTab);

  // Roles tab: owner always, admin if delegated
  const canManageRoles = isOwnerUser || (isAdminUser && GUILD_PERMISSIONS['adminCanManageRoles']);
  if (rolesTab) rolesTab.classList.toggle('hidden', !canManageRoles);

  if (isModOnly && !canModeratorOpenTab(activeTab)) {
    activeTab = 'submissions';
    document.querySelectorAll('#adm-tabs a').forEach(a => a.classList.remove('on'));
    if (submissionsTab) submissionsTab.classList.add('on');
  }
}

// ── Auth Gate ─────────────────────────────────────────────────
async function renderAdminBootstrap(user) {
  const adminLoading = document.getElementById('admin-loading');
  const adminDenied = document.getElementById('admin-denied');
  const adminPanel = document.getElementById('admin-panel');
  const adminInfo = document.getElementById('admin-info');
  const navAuth = document.getElementById('nav-auth');

  if (!user) {
    adminLoading.classList.add('hidden');
    adminDenied.classList.remove('hidden');
    adminDenied.style.display = 'block';
    adminPanel.classList.add('hidden');
    adminPanel.style.display = 'none';
    adminInfo.textContent = '';
    navAuth.innerHTML = '<button class="nav-btn" onclick="location.href=\'index.html\'">Sign In</button>';
    currentUserDoc = null;
    return;
  }

  try {
    configureSocialApiBase();
    // Load user document from Firestore
    const userDocSnap = await db.collection('users').doc(user.uid).get();
    currentUserDoc = userDocSnap.exists ? userDocSnap.data() : { uid: user.uid, email: user.email };
    if (!currentUserDoc.email) currentUserDoc.email = user.email;

    // Check if user can enter the staff shell, but keep true admin state separate.
    const canOpenAdminPanel = await getUserAdminFlag(user);
    const isAdminUser = isAdmin(user.email);
    const isOwnerUser = isOwner(user.email);
    currentUserIsAdminFlag = isAdminUser || isOwnerUser;
    
    // Sync owner status
    if (isOwnerUser) currentUserDoc.isOwner = true;

    // Sync user role flags to Firestore to ensure permission checks pass
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(socialApiBase + '?type=sync-user', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (window.rogLogger) rogLogger.debug('Admin user role sync complete:', data);
      }
    } catch (syncErr) {
      if (window.rogLogger) rogLogger.warn('Could not sync admin user role flags:', syncErr);
    }

    if (!canOpenAdminPanel) {
      adminLoading.classList.add('hidden');
      adminDenied.classList.remove('hidden');
      adminDenied.style.display = 'block';
      adminDenied.querySelector('.section-hd').textContent = 'Insufficient Clearance';
      adminDenied.querySelector('p').innerHTML = `Your account does not have admin privileges. Contact the Guild Archivist.`;
      adminPanel.classList.add('hidden');
      adminPanel.style.display = 'none';
      navAuth.innerHTML = renderUserMenuHTML(user.displayName || 'Agent');
      return;
    }

    adminDenied.classList.add('hidden');
    adminDenied.style.display = 'none';
    adminPanel.classList.remove('hidden');
    adminPanel.style.display = 'block';
    adminLoading.classList.add('hidden');

    const displayLabel = user.displayName || 'Agent';
    const role = resolveRole(user.email);
    const roleDisplayName = role.charAt(0).toUpperCase() + role.slice(1);
    const level = role === 'owner' ? 6 : role === 'admin' ? 6 : role === 'mod' ? 5 : 3;

    adminInfo.innerHTML =
      `Logged in as <span style="color:var(--red-b)">${displayLabel}</span> — Role: <span style="color:var(--red-b);text-transform:uppercase">${roleDisplayName}</span> (Level ${level})
       <button class="btn btn-sm btn-p" onclick="changeUsername()" style="margin-left:12px; font-size:0.7rem; padding:4px 8px;">✎ Change Username</button>`;
    
    // Load and display version with auto-update check (don't block auth if fails)
    try {
      initializeVersionDisplay().catch(err => console.warn('Version display failed:', err));
    } catch (e) {
      console.warn('Version initialization error:', e);
    }
    navAuth.innerHTML = renderUserMenuHTML(displayLabel);
    applyTabVisibilityForRole(user, isAdminUser);

    const params = new URLSearchParams(window.location.search);
    const editId = params.get('editId');
    const editSlug = params.get('editSlug');
    const tab = params.get('tab');
    if (editId && !isModOnlyRole()) {
      window.location.href = 'submit.html?editId=' + encodeURIComponent(editId);
      return;
    } else if (editSlug && !isModOnlyRole()) {
      window.location.href = 'submit.html?editSlug=' + encodeURIComponent(editSlug);
      return;
    }

    loadTab();
    if (tab) {
      switchTab(tab);
    }
  } catch (error) {
    console.error('Error loading user document:', error);
    adminLoading.classList.add('hidden');
    adminDenied.classList.remove('hidden');
    adminDenied.style.display = 'block';
    adminDenied.querySelector('.section-hd').textContent = 'Access Denied';
    adminDenied.querySelector('p').innerHTML = 'Error loading user permissions. Please try again.';
    currentUserDoc = null;
  }
}

auth.onAuthStateChanged(async user => {
  const adminLoading = document.getElementById('admin-loading');
  const adminDenied = document.getElementById('admin-denied');
  const adminPanel = document.getElementById('admin-panel');

  const showAdminDenied = (message) => {
    if (adminLoading) adminLoading.classList.add('hidden');
    if (adminPanel) {
      adminPanel.classList.add('hidden');
      adminPanel.style.display = 'none';
    }
    if (adminDenied) {
      adminDenied.classList.remove('hidden');
      adminDenied.style.display = 'block';
      const deniedHeading = adminDenied.querySelector('.section-hd');
      const deniedBody = adminDenied.querySelector('p');
      if (deniedHeading) deniedHeading.textContent = 'Access Denied';
      if (deniedBody && message) deniedBody.textContent = message;
    }
  };

  try {
    if (!rolesReadyResolved) {
      if (adminLoading) adminLoading.classList.remove('hidden');
      await rolesReady;
    }
    if (!user) {
      await renderAdminBootstrap(null);
      return;
    }
    await renderAdminBootstrap(user);
  } catch (err) {
    const logger = window.rogLogger || console;
    if (typeof logger.error === 'function') logger.error('[Admin Auth] Bootstrap failed:', err);
    showAdminDenied('Secure link could not be established. Refresh and sign in again.');
  }
});

// ── Tab Switching ─────────────────────────────────────────────
function switchTab(tab) {
  if (isModOnlyRole() && !canModeratorOpenTab(tab)) {
    tab = 'submissions';
  }
  activeTab = tab;
  document.querySelectorAll('#adm-tabs a').forEach(a => a.classList.remove('on'));
  if (typeof event !== 'undefined' && event && event.target) event.target.classList.add('on');
  else {
    const selected = document.getElementById('tab-' + tab);
    if (selected) selected.classList.add('on');
  }
  
  // Clear any editId from url so refreshing doesn't keep locking into edit
  window.history.replaceState({}, document.title, window.location.pathname);
  
  loadTab();
}

function loadTab() {
  if (isModOnlyRole() && !canModeratorOpenTab(activeTab)) {
    activeTab = 'submissions';
  }

  const main = document.getElementById('adm-main');
  const cfgSection = document.getElementById('section-config');
  
  // Toggle visibility
  if (activeTab === 'config') {
    main.classList.add('hidden');
    cfgSection.classList.remove('hidden');
    loadConfig();
  } else {
    main.classList.remove('hidden');
    cfgSection.classList.add('hidden');
    
    if (activeTab === 'pages') loadPages(main);
    else if (activeTab === 'submissions') loadSubmissions(main);
    else if (activeTab === 'artworks') loadArtworks(main);
    else if (activeTab === 'news') loadNewsAdmin(main);
    else if (activeTab === 'reports') loadReports(main);
    else if (activeTab === 'contributors') loadContributors(main);
    else if (activeTab === 'applications') loadApplications(main);
    else if (activeTab === 'users') loadUsers(main);
    else if (activeTab === 'roles') loadRolesManager(main);
  }
}

async function loadReports(container) {
  container.innerHTML = '<h3 style="margin-bottom:16px">Moderation Reports</h3><p style="font-size:.82rem;color:var(--wht-d)">Loading report queues...</p>';

  try {
    const snap = await db.collection('reports').orderBy('createdAt', 'desc').limit(300).get();
    const rows = snap.docs.map(doc => {
      const data = doc.data() || {};
      const type = String(data.type || '').toLowerCase();
      const reportedLabel = type === 'page'
        ? (data.pageTitle || data.pageSlug || data.targetId || 'Unknown page')
        : (data.reportedName || data.reportedEmail || data.targetDisplayName || data.targetEmail || data.targetId || 'Unknown target');
      const contentLabel = type === 'page'
        ? (data.pageSlug ? '/' + data.pageSlug : (data.pageId ? '(ID: ' + data.pageId + ')' : '(page target)'))
        : (data.reportedContent || data.messageText || '(content unavailable)');
      return {
        id: doc.id,
        type: type || 'unknown',
        reporter: data.reporterName || data.reporterEmail || 'Unknown',
        reported: reportedLabel,
        content: contentLabel,
        reason: data.reason || '',
        status: String(data.status || 'open').toLowerCase(),
        createdAt: data.createdAt && data.createdAt.seconds ? data.createdAt.seconds : 0
      };
    });

    rows.sort((a, b) => b.createdAt - a.createdAt);
    if (!rows.length) {
      container.innerHTML = '<h3 style="margin-bottom:16px">Moderation Reports</h3><p style="font-size:.82rem;color:var(--wht-d)">No reports yet.</p>';
      return;
    }

    container.innerHTML = [
      '<h3 style="margin-bottom:16px">Moderation Reports</h3>',
      '<p style="font-size:.8rem;color:var(--wht-d);margin-bottom:12px">Unified queue for page, user, and message reports.</p>',
      '<div style="overflow:auto;border:1px solid var(--blk-m)">',
      '<table style="width:100%;border-collapse:collapse;font-size:.8rem">',
      '<thead><tr style="background:rgba(139,0,0,.16)"><th style="text-align:left;padding:8px;border-bottom:1px solid var(--blk-m)">Type</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--blk-m)">Reporter</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--blk-m)">Reported Item</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--blk-m)">Content/Link</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--blk-m)">Reason</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--blk-m)">Status</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--blk-m)">Actions</th></tr></thead>',
      '<tbody>',
      rows.map(row => {
        return '<tr>' +
          '<td style="padding:8px;border-bottom:1px solid var(--blk-m);white-space:nowrap;text-transform:uppercase">' + escapeHtml(row.type) + '</td>' +
          '<td style="padding:8px;border-bottom:1px solid var(--blk-m)">' + escapeHtml(row.reporter) + '</td>' +
          '<td style="padding:8px;border-bottom:1px solid var(--blk-m)">' + escapeHtml(row.reported) + '</td>' +
          '<td style="padding:8px;border-bottom:1px solid var(--blk-m);max-width:280px;white-space:normal;word-break:break-word">' + escapeHtml(row.content) + '</td>' +
          '<td style="padding:8px;border-bottom:1px solid var(--blk-m);max-width:200px;white-space:normal;word-break:break-word">' + escapeHtml(row.reason) + '</td>' +
          '<td style="padding:8px;border-bottom:1px solid var(--blk-m);text-transform:uppercase">' + escapeHtml(row.status) + '</td>' +
          '<td style="padding:8px;border-bottom:1px solid var(--blk-m)">'
            + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
            + '<button class="btn btn-sm btn-s" onclick="setReportStatus(\'' + escapeHtml(row.id) + '\',\'reviewed\')">Review</button>'
            + '<button class="btn btn-sm btn-p" onclick="setReportStatus(\'' + escapeHtml(row.id) + '\',\'resolved\')">Resolve</button>'
            + '<button class="btn btn-sm btn-d" onclick="setReportStatus(\'' + escapeHtml(row.id) + '\',\'escalated\')">Escalate</button>'
            + '</div>'
          + '</td>' +
        '</tr>';
      }).join(''),
      '</tbody>',
      '</table>',
      '</div>'
    ].join('');
  } catch (err) {
    rogLogger?.error?.('Failed to load reports:', err);
    container.innerHTML = '<h3 style="margin-bottom:16px">Moderation Reports</h3><p style="font-size:.82rem;color:var(--red-g)">Error loading reports: ' + escapeHtml(err.message || 'Unknown error') + '</p>';
  }
}

async function setReportStatus(reportId, status) {
  try {
    await db.collection('reports').doc(String(reportId || '')).set({
      status: String(status || 'open').toLowerCase(),
      reviewedBy: String(auth.currentUser?.email || ''),
      reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    const main = document.getElementById('adm-main');
    if (main && activeTab === 'reports') await loadReports(main);
  } catch (err) {
    alert('Could not update report: ' + err.message);
  }
}

async function setAdminApplicationStatus(uid, status) {
  if (!uid) return;
  if (!isOwner(auth.currentUser?.email) && !isAdmin(auth.currentUser?.email) && !isModerator(auth.currentUser?.email)) {
    alert('Moderator or admin clearance required.');
    return;
  }
  try {
    // Sync user role flags before writing to ensure permission checks pass
    try {
      const token = await auth.currentUser.getIdToken();
      await fetch(socialApiBase + '?type=sync-user', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
      }).catch(() => {});
    } catch (syncErr) {
      if (window.rogLogger) rogLogger.warn('Could not sync user role flags:', syncErr);
    }
    await db.collection('applications').doc(uid).set({
      status: String(status || 'pending'),
      reviewedBy: String(auth.currentUser?.email || ''),
      reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    if (String(status || '').toLowerCase() === 'approved') {
      const appDoc = await db.collection('applications').doc(uid).get();
      const appData = appDoc.exists ? (appDoc.data() || {}) : {};
      const approvedRole = String(appData.roleApplied || 'contributor').toLowerCase();
      const roleNameMap = {
        contributor: 'Contributor',
        moderator: 'Moderator',
        admin: 'Admin',
        chief_admin: 'Chief Admin'
      };
      await db.collection('users').doc(uid).set({
        uid,
        email: String(appData.applicantEmail || ''),
        displayName: String(appData.applicantName || ''),
        submissionAccess: true,
        submissionAccessStatus: 'approved',
        role: approvedRole,
        roleName: roleNameMap[approvedRole] || 'Contributor',
        submissionGrantedBy: String(auth.currentUser?.email || ''),
        submissionGrantedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    const main = document.getElementById('adm-main');
    if (main && activeTab === 'reports') await loadReports(main);
    if (main && activeTab === 'roles') await refreshRolesDisplay();
    if (main && activeTab === 'applications') await loadApplications(main);
  } catch (err) {
    alert('Failed to update application: ' + err.message);
  }
}

async function loadApplications(container) {
  container.innerHTML = '<h3 style="margin-bottom:16px">Contribution Applications</h3><p style="font-size:.82rem;color:var(--wht-d)">Loading contribution application queue...</p>';

  try {
    const snap = await db.collection('applications').orderBy('updatedAt', 'desc').limit(200).get();
    const apps = snap.docs.map(doc => ({ id: doc.id, data: doc.data() || {} }));
    if (!apps.length) {
      container.innerHTML = '<h3 style="margin-bottom:16px">Contribution Applications</h3><p style="font-size:.82rem;color:var(--wht-d)">No contribution applications found.</p>';
      return;
    }

    container.innerHTML = [
      '<h3 style="margin-bottom:16px">Contribution Applications</h3>',
      '<p style="font-size:.8rem;color:var(--wht-d);margin-bottom:12px">Approve or reject role requests from Contributor up to Admin. Chief Admin and Owner roles are appointment-only.</p>',
      '<div style="display:grid;gap:10px">',
      apps.map(row => {
        const data = row.data || {};
        const status = String(data.status || 'pending');
        const roleApplied = String(data.roleAppliedLabel || data.roleApplied || 'contributor');
        return '<div style="border:1px solid var(--blk-m);padding:10px;background:rgba(255,255,255,.02)">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">' +
            '<strong>' + escapeHtml(data.applicantName || data.applicantEmail || row.id) + '</strong>' +
            '<span class="status status-' + escapeHtml(status) + '">' + escapeHtml(status) + '</span>' +
          '</div>' +
          '<div style="font-size:.78rem;color:var(--wht-d);margin-bottom:6px">' + escapeHtml(data.applicantEmail || '') + '</div>' +
          '<div style="font-size:.78rem;color:var(--wht-f);margin-bottom:8px">Role requested: ' + escapeHtml(roleApplied) + '</div>' +
          '<div style="font-size:.8rem;margin-bottom:8px;white-space:pre-wrap;word-break:break-word">' + escapeHtml(data.reason || '') + '</div>' +
          '<div style="font-size:.78rem;color:var(--wht-f);margin-bottom:10px;white-space:pre-wrap;word-break:break-word">' + escapeHtml(data.experience || '') + '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<button class="btn btn-sm btn-s" onclick="setAdminApplicationStatus(\'' + escapeHtml(row.id) + '\',\'approved\')">Approve</button>' +
            '<button class="btn btn-sm btn-d" onclick="setAdminApplicationStatus(\'' + escapeHtml(row.id) + '\',\'rejected\')">Reject</button>' +
            '<button class="btn btn-sm btn-s" onclick="setAdminApplicationStatus(\'' + escapeHtml(row.id) + '\',\'pending\')">Reset Pending</button>' +
          '</div>' +
        '</div>';
      }).join(''),
      '</div>'
    ].join('');
  } catch (err) {
    let errorMsg = String(err && err.message || 'Unknown error');
    
    // Provide helpful diagnostic info for permission errors
    if (err && err.code === 'permission-denied') {
      errorMsg = 'Permission denied. You may not have moderator access. Please ensure your admin role is properly configured in the users collection and your session token is up to date. Try refreshing the page or signing out and back in.';
    }
    
    container.innerHTML = '<h3 style="margin-bottom:16px">Contribution Applications</h3>' +
      '<p style="font-size:.82rem;color:var(--red-g)">Could not load applications: ' + escapeHtml(errorMsg) + '</p>' +
      '<p style="font-size:.75rem;color:var(--wht-f);margin-top:8px">Error details: ' + escapeHtml(err.code || 'N/A') + '</p>';
  }
}

async function revokeContributor(uid) {
  if (!uid) return;
  if (!await window.rogConfirm('Revoke contributor access for this user?')) return;
  try {
    const result = await callSocialApi('POST', {
      action: 'revokecontributor',
      targetUid: String(uid)
    });
    if (result && result.locked) {
      alert(result.error || 'Contributor removed, and your account has been locked for investigation.');
    }
    const main = document.getElementById('adm-main');
    if (main && activeTab === 'contributors') await loadContributors(main);
  } catch (err) {
    alert('Failed to revoke contributor role: ' + err.message);
  }
}

async function loadContributors(container) {
  container.innerHTML = '<h3 style="margin-bottom:16px">Editors / Contributors</h3><p style="font-size:.82rem;color:var(--wht-d)">Loading contributor records...</p>';
  try {
    const result = await callSocialApi('GET', {}, '?type=contributors');
    const rows = Array.isArray(result && result.contributors) ? result.contributors : [];
    if (!rows.length) {
      container.innerHTML = '<h3 style="margin-bottom:16px">Editors / Contributors</h3><p style="font-size:.82rem;color:var(--wht-d)">No contributors found.</p>';
      return;
    }

    container.innerHTML = [
      '<h3 style="margin-bottom:16px">Editors / Contributors</h3>',
      '<p style="font-size:.8rem;color:var(--wht-d);margin-bottom:12px">Owner, Admin, and Moderator accounts can revoke contributor access.</p>',
      '<div style="overflow:auto;border:1px solid var(--blk-m)">',
      '<table style="width:100%;border-collapse:collapse;font-size:.8rem">',
      '<thead><tr style="background:rgba(139,0,0,.16)"><th style="text-align:left;padding:8px;border-bottom:1px solid var(--blk-m)">Name</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--blk-m)">Email</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--blk-m)">Role</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--blk-m)">Action</th></tr></thead>',
      '<tbody>',
      rows.map(row => '<tr>' +
        '<td style="padding:8px;border-bottom:1px solid var(--blk-m)">' + escapeHtml(row.displayName || 'Unknown Agent') + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid var(--blk-m)">' + escapeHtml(row.email || '') + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid var(--blk-m)">' + escapeHtml(row.roleName || 'Contributor') + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid var(--blk-m)"><button class="btn btn-sm btn-d" onclick="revokeContributor(\'' + escapeHtml(row.uid || row.id) + '\')">Revoke</button></td>' +
      '</tr>').join(''),
      '</tbody>',
      '</table>',
      '</div>'
    ].join('');
  } catch (err) {
    const raw = String(err && err.message || 'Unknown error');
    // Extract any attempted host URLs for clearer guidance
    const urls = (raw.match(/https?:\/\/[\w.\-:\/]+/g) || []).filter(Boolean);
    const tried = urls.length ? urls.join(', ') : socialApiBase || '/api/social';

    container.innerHTML = [
      '<h3 style="margin-bottom:16px">Editors / Contributors</h3>',
      '<p style="font-size:.82rem;color:var(--red-g)">Could not load contributors: Social API appears unavailable.</p>',
      '<p style="font-size:.75rem;color:var(--wht-f);margin-top:8px">Attempted endpoints: ' + escapeHtml(tried) + '</p>',
      '<p style="font-size:.75rem;color:var(--wht-f);margin-top:8px">Possible causes: the API deployment is missing or down, or required server environment variables are not set.</p>',
      '<p style="font-size:.75rem;color:var(--wht-f);margin-top:8px">Quick fixes: deploy the API to Vercel or run locally with the Vercel dev server. Ensure the function `api/social` is deployed and the env var <strong>FIREBASE_SERVICE_ACCOUNT_KEY</strong> is configured.</p>',
      '<p style="font-size:.75rem;color:var(--wht-f);margin-top:8px">Local test command:<br><code>npm i -g vercel</code><br><code>vercel dev</code></p>'
    ].join('');
  }
}

// ── Site Configuration ────────────────────────────────────────
async function loadConfig() {
  try {
    const doc = await db.collection('config').doc('site').get();
    if (doc.exists) {
      const data = doc.data();
      document.getElementById('cfg-categories').value = (data.categories || []).join(', ');
      document.getElementById('cfg-tags').value = (data.tags || []).join(', ');
      updateESDStatus(data);
    } else {
      updateESDStatus({});
    }
    const ownerOnlyControls = [document.getElementById('esd-on-btn'), document.getElementById('esd-off-btn')];
    const canControlEsd = isOwner(auth.currentUser?.email) || adminHasDelegation(auth.currentUser?.email, 'adminCanControlESD');
    ownerOnlyControls.forEach(btn => {
      if (!btn) return;
      btn.classList.toggle('hidden', !canControlEsd);
    });
    const migrateBtn = document.getElementById('btn-migrate-seed');
    if (migrateBtn) migrateBtn.classList.toggle('hidden', !(isOwner(auth.currentUser?.email) || adminHasDelegation(auth.currentUser?.email, 'adminCanMigrateSeed')));
    
    // Delegation checkboxes visibility and state
    const delegationCard = document.getElementById('card-authority-delegation');
    if (delegationCard) {
      if (!isOwner(auth.currentUser?.email)) {
        delegationCard.classList.add('hidden');
      } else {
        delegationCard.classList.remove('hidden');
        document.getElementById('perm-legacy').checked = GUILD_PERMISSIONS['adminCanEditLegacy'] === true;
        document.getElementById('perm-guides').checked = GUILD_PERMISSIONS['adminCanManageGuides'] === true;
        document.getElementById('perm-roles').checked = GUILD_PERMISSIONS['adminCanManageRoles'] === true;
        document.getElementById('perm-esd').checked = GUILD_PERMISSIONS['adminCanControlESD'] === true;
        document.getElementById('perm-seed').checked = GUILD_PERMISSIONS['adminCanMigrateSeed'] === true;
      }
    }
  } catch (err) {
    console.warn('Config load failed:', err);
  }
}

async function migrateSeededPagesToFirestore() {
  const statusEl = document.getElementById('seed-migrate-status');
  if (!(isOwner(auth.currentUser?.email) || adminHasDelegation(auth.currentUser?.email, 'adminCanMigrateSeed'))) {
    alert('You do not have permission to run seeded page migration.');
    return;
  }
  
  // Sync user role flags before writing to ensure permission checks pass
  try {
    const token = await auth.currentUser.getIdToken();
    await fetch(socialApiBase + '?type=sync-user', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    }).catch(() => {});
  } catch (syncErr) {
    if (window.rogLogger) rogLogger.warn('Could not sync user role flags:', syncErr);
  }
  
  const seedReady = await ensureAdminSeedDataLoaded();
  if (!seedReady || typeof PAGE_SEED === 'undefined' || !Array.isArray(PAGE_SEED) || PAGE_SEED.length === 0) {
    if (statusEl) statusEl.textContent = 'Seed migration status: no PAGE_SEED data found.';
    alert('No seeded pages were found to migrate.');
    return;
  }

  const ok = await window.rogConfirm('Move starter pages into the live page collection? Existing page links will be skipped.');
  if (!ok) return;

  if (statusEl) statusEl.textContent = 'Seed migration status: scanning existing pages...';
  const existingSnap = await db.collection('pages').get();
  const existingSlugs = new Set(existingSnap.docs.map(doc => String((doc.data() || {}).slug || '').trim()).filter(Boolean));

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const now = firebase.firestore.FieldValue.serverTimestamp();

  for (const item of PAGE_SEED) {
    const slug = String(item.slug || '').trim();
    if (!slug || existingSlugs.has(slug)) {
      skipped++;
      continue;
    }

    try {
      await db.collection('pages').add({
        title: item.title || 'Untitled',
        slug: slug,
        type: item.type || 'Page',
        tags: Array.isArray(item.tags) ? item.tags : [],
        htmlContent: item.htmlContent || '',
        cssContent: item.cssContent || '',
        authorName: 'Seed Migration',
        approvedBy: 'Seed Migration',
        approvedAt: now,
        createdAt: now,
        migratedFromSeed: true,
        featured: false
      });
      existingSlugs.add(slug);
      inserted++;
    } catch (_err) {
      failed++;
    }
  }

  const msg = 'Seed migration complete. Added: ' + inserted + ', skipped: ' + skipped + ', failed: ' + failed + '.';
  if (statusEl) statusEl.textContent = 'Seed migration status: ' + msg;
  alert(msg);
  if (activeTab === 'pages') refreshPages();
}

function applyConfigPreset(preset) {
  const presets = {
    'archive-core': {
      categories: ['Anomaly', 'Tale', 'Artwork', 'Hub', 'Guide'],
      tags: ['object', 'animal', 'humanoid', 'plant', 'artifact', 'document', 'digital', 'memetic', 'cognitohazard', 'spatial', 'temporal', 'biological', 'dangerous', 'archive', 'field-report']
    },
    'research-mode': {
      categories: ['Anomaly', 'Guide', 'Tale'],
      tags: ['document', 'digital', 'memetic', 'cognitohazard', 'spatial', 'temporal', 'biological', 'dangerous', 'archive', 'field-report']
    },
    'publication-light': {
      categories: ['Anomaly', 'Artwork', 'Tale'],
      tags: ['object', 'artifact', 'document', 'archive', 'field-report']
    }
  };

  const selected = presets[preset];
  if (!selected) return;
  document.getElementById('cfg-categories').value = selected.categories.join(', ');
  document.getElementById('cfg-tags').value = selected.tags.join(', ');
}

async function saveConfig() {
  const categories = document.getElementById('cfg-categories').value.split(',').map(s => s.trim()).filter(Boolean);
  const tags = document.getElementById('cfg-tags').value.split(',').map(s => s.trim()).filter(Boolean);
  
  try {
    // Sync user role flags before writing to ensure permission checks pass
    try {
      const token = await auth.currentUser.getIdToken();
      await fetch(socialApiBase + '?type=sync-user', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
      }).catch(() => {});
    } catch (syncErr) {
      if (window.rogLogger) rogLogger.warn('Could not sync user role flags:', syncErr);
    }
    await db.collection('config').doc('site').set({ categories, tags }, { merge: true });
    alert('System configuration updated successfully.');
  } catch (err) {
    alert('Failed to save config: ' + err.message);
  }
}

async function saveDelegationConfig() {
  if (!isOwner(auth.currentUser?.email)) {
    alert('Only the Archivist can save delegation settings.');
    return;
  }
  const btn = document.getElementById('btn-save-delegation');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  
  try {
    // Sync user role flags before writing to ensure permission checks pass
    try {
      const token = await auth.currentUser.getIdToken();
      await fetch(socialApiBase + '?type=sync-user', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
      }).catch(() => {});
    } catch (syncErr) {
      if (window.rogLogger) rogLogger.warn('Could not sync user role flags:', syncErr);
    }
    const payload = {
      adminCanEditLegacy: document.getElementById('perm-legacy').checked,
      adminCanManageGuides: document.getElementById('perm-guides').checked,
      adminCanManageRoles: document.getElementById('perm-roles').checked,
      adminCanControlESD: document.getElementById('perm-esd').checked,
      adminCanMigrateSeed: document.getElementById('perm-seed').checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: auth.currentUser?.email
    };
    
    await db.collection('config').doc('permissions').set(payload, { merge: true });
    GUILD_PERMISSIONS = { ...GUILD_PERMISSIONS, ...payload };
    alert('Delegation settings saved successfully.');
  } catch (err) {
    alert('Failed to save delegation config: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Delegations';
  }
}

async function toggleESD(enabled) {
  if (!(isOwner(auth.currentUser?.email) || adminHasDelegation(auth.currentUser?.email, 'adminCanControlESD'))) {
    alert('You do not have permission to activate or deactivate ESD.');
    return;
  }

  const ok = await window.rogConfirm(enabled
    ? 'Activate Emergency Shutdown Protocol? Visitors without moderator clearance will be locked out.'
    : 'Deactivate Emergency Shutdown Protocol and restore normal access?');
  if (!ok) return;

  try {
    // Sync user role flags before writing to ensure permission checks pass
    try {
      const token = await auth.currentUser.getIdToken();
      await fetch(socialApiBase + '?type=sync-user', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
      }).catch(() => {});
    } catch (syncErr) {
      if (window.rogLogger) rogLogger.warn('Could not sync user role flags:', syncErr);
    }
    await db.collection('config').doc('site').set({
      esdLocked: !!enabled,
      esdActivatedBy: enabled ? (auth.currentUser.displayName || auth.currentUser.email || 'Owner') : '',
      esdActivatedAt: enabled ? firebase.firestore.FieldValue.serverTimestamp() : null
    }, { merge: true });
    await loadConfig();
    alert(enabled ? 'ESD activated.' : 'ESD deactivated.');
  } catch (err) {
    alert('Failed to update ESD: ' + err.message);
  }
}

function updateESDStatus(data) {
  const statusEl = document.getElementById('esd-status');
  if (!statusEl) return;
  if (data && data.esdLocked) {
    const by = data.esdActivatedBy || 'Owner';
    statusEl.textContent = 'ESD status: ACTIVE by ' + by + '. Non-moderator visitors are locked out.';
  } else {
    statusEl.textContent = 'ESD status: INACTIVE.';
  }
}

async function normalizeAllStoredPageStyles() {
  const btn = document.getElementById('btn-normalize-pages');
  const statusEl = document.getElementById('normalize-status');
  if (!btn || !statusEl) return;

  const ok = await window.rogConfirm('Normalize and re-save CSS colors for all stored pages? This updates existing Firestore page records.');
  if (!ok) return;

  btn.disabled = true;
  btn.textContent = 'Normalizing...';
  statusEl.textContent = 'Scanning pages collection...';

  let scanned = 0;
  let updated = 0;
  let lastDoc = null;

  try {
    while (true) {
      let query = db.collection('pages')
        .orderBy(firebase.firestore.FieldPath.documentId())
        .limit(100);

      if (lastDoc) query = query.startAfter(lastDoc);

      const snap = await query.get();
      if (snap.empty) break;

      const batch = db.batch();
      let batchUpdates = 0;

      snap.docs.forEach(doc => {
        scanned++;
        const page = doc.data() || {};
        const currentCss = page.cssContent || '';
        const normalizedCss = normalizePageCss(currentCss);

        if (normalizedCss !== currentCss) {
          batch.update(doc.ref, {
            cssContent: normalizedCss,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            styleNormalizedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          batchUpdates++;
          updated++;
        }
      });

      if (batchUpdates > 0) {
        await batch.commit();
      }

      lastDoc = snap.docs[snap.docs.length - 1];
      statusEl.textContent = 'Scanned ' + scanned + ' pages, updated ' + updated + '...';

      if (snap.size < 100) break;
    }

    statusEl.textContent = 'Done. Scanned ' + scanned + ' pages and updated ' + updated + ' with readable colors.';
    alert('Normalization complete.\nScanned: ' + scanned + '\nUpdated: ' + updated);
  } catch (err) {
    statusEl.textContent = 'Failed: ' + err.message;
    alert('Normalization failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Normalize Existing Page Colors';
  }
}


// ── Username Management ───────────────────────────────────────
async function changeUsername() {
  const newName = await window.rogPrompt('Enter new Username/Display Name:');
  if (!newName) return;
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    // 1. Update Firebase Auth Profile
    await user.updateProfile({ displayName: newName });
    
    // 2. Update Firestore User Document
    await db.collection('users').doc(user.uid).update({ displayName: newName });
    
    alert('Username updated to ' + newName + '. Reloading Terminal...');
    location.reload();
  } catch (err) {
    alert('Failed to update username: ' + err.message);
  }
}

// ═════════════════════════════════════════════════════════════
// PAGES CRUD
// ═════════════════════════════════════════════════════════════

async function loadPages(container) {
  container.innerHTML = `
    <h3 style="margin-bottom:16px">Pages Management</h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
      <button class="btn btn-p" type="button" onclick="location.href='submit.html'">>> Create in Submit Editor</button>
      <a class="btn btn-s" href="submit.html" style="text-decoration:none;display:inline-flex;align-items:center">Open Unified Editor</a>
    </div>
    <p style="font-size:.8rem;color:var(--wht-d);margin-bottom:16px">All page creation and editing now uses the same submission editor. This panel only handles review, delete, and featured-state controls.</p>
    <table class="adm-tbl"><thead><tr><th>Title</th><th>Type</th><th>Featured</th><th>Actions</th></tr></thead><tbody id="pages-tbody"></tbody></table>
  `;
  await refreshPages();
}

async function refreshPages() {
  const tbody = document.getElementById('pages-tbody');
  if (!tbody) return;
  try {
    const snap = await db.collection('pages').orderBy('createdAt', 'desc').limit(50).get();
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="4" class="tc" style="padding:24px;color:var(--wht-f)">No pages found. Create one above.</td></tr>';
      return;
    }
    tbody.innerHTML = snap.docs.map(d => {
      const p = d.data();
      const guideLocked = isGuideType(p.type) && !canManageGuidePages();
      const editBtn = guideLocked
        ? '<span style="font-size:.7rem;color:var(--wht-f)">Owner-only guide</span>'
        : '<button class="btn btn-sm btn-s" onclick="location.href=\'submit.html?editId=' + d.id + '\'">Edit</button>';
      const deleteBtn = canDeleteManagedContent() && !guideLocked
        ? '<button class="btn btn-sm btn-d" onclick="deletePage(\'' + d.id + '\')" style="margin-left:4px">Delete</button>'
        : '';
      const featureBtn = '<button class="btn btn-sm btn-s" onclick="toggleFeaturedPage(\'' + d.id + '\',' + (p.featured ? 'false' : 'true') + ')" style="margin-left:4px">' + (p.featured ? 'Unfeature' : 'Feature') + '</button>';
      return `<tr>
        <td>${p.title}</td>
        <td><span class="tag">${p.type}</span></td>
        <td>${p.featured ? '<span class="status status-approved">Yes</span>' : '<span class="status status-pending">No</span>'}</td>
        <td>
          ${editBtn}
          ${featureBtn}
          ${deleteBtn}
        </td>
      </tr>`;
    }).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="4" class="tc" style="padding:24px;color:var(--wht-f)">Connect Firebase to manage pages.</td></tr>'; }
}

async function deletePage(id) {
  if (!canDeleteManagedContent()) {
    alert('Only Admins and Owners can delete pages.');
    return;
  }

  const doc = await db.collection('pages').doc(id).get();
  if (!doc.exists) return;
  const p = doc.data() || {};
  if (isGuideType(p.type) && !canManageGuidePages()) {
    alert('Only the Archivist can delete Guide pages.');
    return;
  }

  if (!await window.rogConfirm('Delete this page permanently?')) return;
  try {
    if (String(p.type || '').trim() === 'Lore' || String(p.contentFamily || '').trim() === 'lore') {
      await db.collection('loreIndex').doc(id).delete().catch(() => {});
    }
    await db.collection('pages').doc(id).delete();
    await refreshPages();
  }
  catch (err) { alert('Delete failed: ' + err.message); }
}

async function toggleFeaturedPage(id, nextState) {
  try {
    await db.collection('pages').doc(id).update({
      featured: !!nextState,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await refreshPages();
  } catch (err) {
    alert('Could not update featured status: ' + err.message);
  }
}

function defaultSchemaHTML() {
  return '<div class="page-shell">\n' +
    '  <header class="page-header">\n' +
    '    <h1 class="page-title">New Classified Document</h1>\n' +
    '    <p class="page-subtitle">Clearance Level 2 // Internal Distribution</p>\n' +
    '  </header>\n' +
    '  <section class="page-section">\n' +
    '    <h2>Summary</h2>\n' +
    '    <p>Start writing the page content here.</p>\n' +
    '  </section>\n' +
    '</div>';
}

function defaultSchemaCSS() {
  return '';
}

function wrapWithDefaultSchema(html) {
  const raw = (html || '').trim();
  if (!raw) return defaultSchemaHTML();
  if (raw.includes('class="page-shell"')) return raw;
  return '<div class="page-shell">\n' + raw + '\n</div>';
}

function mergeWithDefaultSchemaCSS(css) {
  return normalizePageCss(css || '').trim();
}

function normalizePageCss(css) {
  return String(css || '')
    .replace(/#1a1a1a/gi, '#f2f2f2')
    .replace(/#444\b/gi, '#d7d7d7')
    .replace(/#888\b/gi, '#c7c7c7')
    .replace(/#f5f5f5/gi, '#111111')
    .replace(/#f9f9f9/gi, '#101010')
    .replace(/#ddd\b/gi, '#3a3a3a')
    .replace(/#eee\b/gi, '#2f2f2f');
}

function embedUploadedImagesIfMissing(html, imageUrls) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
  if (!urls.length) return String(html || '');

  const raw = String(html || '');
  if (raw.includes('class="uploaded-assets"')) return raw;
  
  // Filter to only unused images (not already in HTML)
  const unusedUrls = urls.filter(url => !raw.includes(url));
  if (!unusedUrls.length) return raw;

  const gallery = '<div class="page-section uploaded-assets">' +
    '<h2>Uploaded Assets</h2>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">' +
      unusedUrls.map((url, idx) =>
        '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none">' +
          '<img src="' + url + '" alt="Uploaded asset ' + (idx + 1) + '" loading="lazy" decoding="async" style="display:block;max-width:100%;width:auto;height:auto;border:1px solid #3a3a3a;background:#111" />' +
        '</a>'
      ).join('') +
    '</div>' +
  '</div>';

  return raw + gallery;
}

function repairDocumentImagesWithUploads(html, imageUrls) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
  if (!urls.length) return String(html || '');

  const wrapper = document.createElement('div');
  wrapper.innerHTML = String(html || '');
  const docImages = Array.from(wrapper.querySelectorAll('figure.doc-image-wrap img'));
  let uploadIndex = 0;

  docImages.forEach(img => {
    const src = String(img.getAttribute('src') || '').trim();
    const alt = String(img.getAttribute('alt') || '').trim();
    const valid = /^(data:image\/(png|jpeg|gif|webp|bmp|svg\+xml);base64,|https?:\/\/|\/)/i.test(src);
    const referencesKnownUpload = urls.some(url => src === url);
    if ((!valid || /document image/i.test(alt)) && !referencesKnownUpload) {
      img.setAttribute('src', urls[Math.min(uploadIndex, urls.length - 1)]);
      uploadIndex++;
    }
  });

  return wrapper.innerHTML;
}

function buildPageDocument(html, css, imageUrls) {
  const raw = repairDocumentImagesWithUploads((html || '').trim(), imageUrls || []);
  const withRedactions = applyRedactionSpans(raw);
  const htmlWithUploads = embedUploadedImagesIfMissing(withRedactions, imageUrls || []);
  const wrapped = htmlWithUploads.includes('class="page-shell"')
    ? htmlWithUploads
    : '<div class="page-shell"><section class="page-section">' + htmlWithUploads + '</section></div>';
  const safeCss = normalizePageCss(css || '');

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>' +
    ':root{--red:#8b0000;--red-b:#cc0000;--red-d:#5c0000;--blk:#000;--blk-s:#0a0a0a;--blk-c:#111;--wht:#fff;--wht-m:#ccc;--font-m:"IBM Plex Mono",monospace;--font-d:"Special Elite",monospace;color-scheme:dark}' +
    '*{margin:0;padding:0;box-sizing:border-box}body{font-family:var(--font-m);line-height:1.7;padding:24px;color:var(--wht-m);background:var(--blk)}img{max-width:100%;height:auto}figure{display:block;margin:0 0 14px}figcaption{margin-top:6px;line-height:1.45}' +
    '.page-shell{max-width:960px;margin:0 auto;padding:24px}.page-header{padding:24px;border-bottom:2px solid var(--red-d);margin-bottom:24px;background:linear-gradient(180deg,rgba(139,0,0,.1),transparent)}.page-title{font-family:var(--font-d);font-size:2rem;color:var(--wht);text-transform:uppercase;letter-spacing:3px;margin-bottom:8px}.page-subtitle{font-size:.8rem;color:var(--red-b);letter-spacing:2px;text-transform:uppercase}.page-section{margin-bottom:24px;padding:20px;border:1px solid var(--red-d);background:var(--blk-s)}.page-section h2{font-family:var(--font-d);color:var(--wht);text-transform:uppercase;letter-spacing:2px;border-bottom:1px dashed var(--red-d);padding-bottom:8px;margin-bottom:12px}' +
    '.redaction{display:inline-block;background:#8b0000;color:transparent;border-radius:2px;padding:0 0.5ch;line-height:1em}.redaction[aria-hidden="true"]::after{content:"";display:inline-block;width:0.6em;height:1em}' +
    safeCss.replace(/<\/style>/gi, '') +
    '</style></head><body>' + wrapped + '</body></html>';
}

// ═════════════════════════════════════════════════════════════
// SUBMISSIONS REVIEW (Admin)
// ═════════════════════════════════════════════════════════════

async function loadSubmissions(container) {
  container.innerHTML = `
    <h3 style="margin-bottom:16px">Submission Review Queue</h3>
    <p style="font-size:.8rem;color:var(--wht-d);margin-bottom:16px">Review user-submitted pages. Approved pages are published to the site. Rejected pages are returned to the author with feedback. Moderators can approve/reject but cannot delete records.</p>
    <div style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm btn-p" id="filter-pending" onclick="filterSubmissions('pending')" style="opacity:1">Pending</button>
      <button class="btn btn-sm btn-s" id="filter-approved" onclick="filterSubmissions('approved')">Approved</button>
      <button class="btn btn-sm btn-s" id="filter-rejected" onclick="filterSubmissions('rejected')">Rejected</button>
      <button class="btn btn-sm btn-s" id="filter-all" onclick="filterSubmissions('all')">All</button>
    </div>
    <table class="adm-tbl"><thead><tr><th>Title</th><th>Author</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead><tbody id="subs-tbody"></tbody></table>
  `;
  await refreshSubmissions('all');
}

let currentSubFilter = 'all';

async function filterSubmissions(status) {
  currentSubFilter = status;
  // Update button styles
  ['pending','approved','rejected','all'].forEach(s => {
    const btn = document.getElementById('filter-' + s);
    if (btn) {
      btn.className = s === status ? 'btn btn-sm btn-p' : 'btn btn-sm btn-s';
    }
  });
  await refreshSubmissions(status);
}

async function refreshSubmissions(status) {
  const tbody = document.getElementById('subs-tbody');
  try {
    const snap = await db.collection('submissions').get();
    const docs = snap.docs
      .map(doc => ({ id: doc.id, data: doc.data() }))
      .filter(entry => {
        const entryStatus = String(entry?.data?.status || '').toLowerCase();
        if (entryStatus === 'draft') return false;
        return !status || status === 'all' || entryStatus === String(status).toLowerCase();
      })
      .sort((a, b) => {
        const aTime = a.data.submittedAt?.seconds || 0;
        const bTime = b.data.submittedAt?.seconds || 0;
        return bTime - aTime;
      })
      .slice(0, 50);

    if (docs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="tc" style="padding:24px;color:var(--wht-f)">No ' + (status === 'all' ? '' : status + ' ') + 'submissions found.</td></tr>';
      return;
    }
    tbody.innerHTML = docs.map(entry => {
      const d = entry;
      const s = entry.data;
      const statusClass = 'status status-' + s.status;
      const date = s.submittedAt ? new Date(s.submittedAt.seconds * 1000).toLocaleDateString() : '—';
      let actions = '<button class="btn btn-sm btn-s" onclick="previewSubmission(\'' + d.id + '\')" style="margin-right:4px">Preview</button>';
      if (s.status === 'pending') {
        actions += '<button class="btn btn-sm btn-p" onclick="approveSubmission(\'' + d.id + '\')" style="margin-right:4px">Approve</button>';
        actions += '<button class="btn btn-sm btn-d" onclick="showRejectForm(\'' + d.id + '\')">Reject</button>';
      }
      if (s.status === 'approved' && s.approvedPageId) {
        const viewUrl = s.slug ? 'pages/' + s.slug : 'page.html?id=' + s.approvedPageId;
        actions += '<a href="' + viewUrl + '" class="btn btn-sm btn-s" target="_blank" style="margin-left:4px">View</a>';
      }
      const showEmail = hasPermission(currentUserDoc, 'manageUsers') ? (s.authorEmail || '[Not Set]') : '[Redacted]';
      return `<tr>
        <td>${s.title}</td>
        <td style="font-size:.75rem;color:var(--wht-d)">${s.authorName || 'Unknown Agent'}<br><span style="font-family:monospace;color:var(--red-b)">${showEmail}</span></td>
        <td><span class="tag">${s.type}</span></td>
        <td><span class="${statusClass}">${s.status}</span></td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="tc" style="padding:24px;color:var(--wht-f)">Failed to load submissions: ' + err.message + '</td></tr>';
  }
}

async function previewSubmission(id) {
  try {
    const doc = await db.collection('submissions').doc(id).get();
    if (!doc.exists) { alert('Submission not found.'); return; }
    const s = doc.data();
    const date = s.submittedAt ? new Date(s.submittedAt.seconds * 1000).toLocaleDateString() : '—';
    const uploaded = Array.isArray(s.imageUrls) ? s.imageUrls.filter(Boolean) : [];
    const imagesMarkup = uploaded.length
      ? '<div class="review-upload-grid">' + uploaded.map((url, idx) =>
          '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="review-upload-item" title="Open image ' + (idx + 1) + '">' +
            '<img src="' + url + '" alt="Uploaded image ' + (idx + 1) + '" loading="lazy" decoding="async" />' +
          '</a>'
        ).join('') + '</div>'
      : '<div style="font-size:.75rem;color:var(--wht-f);margin-top:6px">No uploaded images.</div>';

    // Build review modal
    const modal = document.createElement('div');
    modal.className = 'review-modal';
    modal.id = 'review-modal';
    modal.innerHTML = `
      <div class="review-modal-header">
        <h3>${s.title}</h3>
        <button class="btn btn-sm btn-s" onclick="closeReviewModal()">✕ Close</button>
      </div>
      <div class="review-modal-body">
        <iframe class="review-modal-preview" sandbox="allow-same-origin" title="Submission preview"></iframe>
        <div class="review-modal-meta">
          <p style="font-size:.75rem;color:var(--wht-f);margin-bottom:12px;line-height:1.6">Preview is rendered in a large sandboxed canvas using the same page renderer as the public site, including embedded images.</p>
          <dl>
            <dt>Author</dt><dd>${s.authorName || 'Unknown Agent'}</dd>
            <dt>Email</dt><dd>${(isOwner(auth.currentUser?.email) || hasPermission(currentUserDoc, 'manageUsers')) ? (s.authorEmail || '[Not Set]') : '[Redacted]'}</dd>
            <dt>Type</dt><dd>${s.type}</dd>
            <dt>Tags</dt><dd>${(s.tags || []).join(', ') || 'None'}</dd>
            <dt>Status</dt><dd><span class="status status-${s.status}">${s.status}</span></dd>
            <dt>Submitted</dt><dd>${date}</dd>
            <dt>Images</dt><dd>${uploaded.length} uploaded</dd>
            <dt>Uploaded Assets</dt><dd>${imagesMarkup}</dd>
          </dl>
          ${s.status === 'pending' ? `
          <div class="review-actions">
            <button class="btn btn-p" onclick="closeReviewModal();approveSubmission('${id}')">>> Approve</button>
            <button class="btn btn-d" onclick="closeReviewModal();showRejectForm('${id}')">Reject</button>
          </div>` : ''}
          ${s.status === 'rejected' && s.rejectionReason ? '<dt style="margin-top:12px">Rejection Reason</dt><dd>' + s.rejectionReason + '</dd>' : ''}
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Fill iframe
    const frame = modal.querySelector('iframe');
    const uploadedImages = Array.isArray(s.imageUrls) ? s.imageUrls.filter(Boolean) : [];
    frame.srcdoc = buildPageDocument(s.htmlContent || '', s.cssContent || '', uploadedImages);

  } catch (err) {
    alert('Error loading preview: ' + err.message);
  }
}

function closeReviewModal() {
  const modal = document.getElementById('review-modal');
  if (modal) modal.remove();
}

function extractDescriptionFromHTML(html) {
  if (!html) return '';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = String(html || '');
  
  // Look for a section with h2 containing "Description"
  const sections = wrapper.querySelectorAll('.rog-section, section, div[class*="section"]');
  for (const section of sections) {
    const heading = section.querySelector('h2, h3');
    if (heading && /^description$/i.test((heading.textContent || '').trim())) {
      // Get the text content after the heading, excluding the heading itself
      const textParts = [];
      let foundHeading = false;
      for (const node of section.childNodes) {
        if (node.nodeType === 1) { // Element node
          if (heading.contains(node) || heading === node) {
            foundHeading = true;
            continue;
          }
          if (foundHeading) {
            const text = (node.textContent || '').trim();
            if (text) textParts.push(text);
          }
        }
      }
      if (textParts.length) return textParts.join(' ').substring(0, 500);
      
      // Fallback: get all text after heading
      const allText = Array.from(section.childNodes)
        .slice(Array.from(section.childNodes).indexOf(heading.parentElement || heading) + 1)
        .map(node => (node.textContent || '').trim())
        .filter(Boolean)
        .join(' ');
      if (allText) return allText.substring(0, 500);
    }
  }
  
  // Fallback: extract first paragraph or first text content
  const firstP = wrapper.querySelector('p');
  if (firstP) return (firstP.textContent || '').trim().substring(0, 500);
  
  return '';
}

async function approveSubmission(id) {
  const userEmail = auth.currentUser?.email;
  const isOwnerUser = isOwner(userEmail);
  const isAdminUser = isAdmin(userEmail);
  const isModUser = isModerator(userEmail);
  
  if (!isOwnerUser && !isAdminUser && !isModUser) {
    alert('Admin/Moderator access is required to approve submissions.');
    return;
  }
  if (!await window.rogConfirm('Approve this submission and publish it to the site?')) return;

  try {
    const doc = await db.collection('submissions').doc(id).get();
    if (!doc.exists) { alert('Submission not found.'); return; }
    const s = doc.data();
    if (isGuideType(s.type) && !canManageGuidePages()) {
      alert('Only the Archivist can approve Guide submissions.');
      return;
    }
    const reviewer = auth.currentUser;

    // Generate slug if not present
    const slug = s.slug || s.title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 80);

    // Create page from submission
    const wrappedHtml = wrapWithDefaultSchema(s.htmlContent);
    const pageData = {
      title: s.title,
      type: s.type,
      tags: s.tags || [],
      slug: slug,
      content: s.title, // basic content field for backward compat
      htmlContent: wrappedHtml,
      cssContent: mergeWithDefaultSchemaCSS(s.cssContent || ''),
      imageUrls: s.imageUrls || [],
      imageAssets: s.imageAssets || [],
      mediaUrls: s.mediaUrls || [],
      mediaAssets: s.mediaAssets || [],
      currentMode: s.currentMode || '',
      currentTemplate: s.currentTemplate || '',
      docBlocks: Array.isArray(s.docBlocks) ? s.docBlocks : [],
      subsectionCounters: s.subsectionCounters || { anomaly: 0, tale: 0, guide: 0 },
      authorUid: s.authorUid,
      authorEmail: s.authorEmail,
      authorName: s.authorName || '',
      approvedBy: reviewer ? (reviewer.displayName || 'Admin') : 'Admin',
      approvedByUid: reviewer ? reviewer.uid : null,
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: s.submittedAt || firebase.firestore.FieldValue.serverTimestamp(),
      featured: false,
      // Add anomaly-specific fields
      anomalyId: s.anomalyId || '',
      anomalySubtype: s.anomalySubtype || '',
      anomalySubtypeLabel: s.anomalySubtypeLabel || '',
      anomalyListKey: s.anomalyListKey || '',
      anomalyDescription: s.type === 'Anomaly' ? extractDescriptionFromHTML(wrappedHtml) : ''
    };

    const pageRef = await db.collection('pages').add(pageData);

    // Update submission status
    await db.collection('submissions').doc(id).update({
      status: 'approved',
      reviewedBy: reviewer ? (reviewer.displayName || 'Admin') : 'Admin',
      reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedPageId: pageRef.id,
    });

    alert('Submission approved and published!\\nLive at: /pages/' + slug);
    await refreshSubmissions(currentSubFilter);
  } catch (err) {
    alert('Approval failed: ' + err.message);
  }
}

async function showRejectForm(id) {
  const reason = await window.rogPrompt('Enter rejection reason (optional):');
  if (reason === null) return; // cancelled
  rejectSubmission(id, reason);
}

async function rejectSubmission(id, reason) {
  const userEmail = auth.currentUser?.email;
  const isOwnerUser = isOwner(userEmail);
  const isAdminUser = isAdmin(userEmail);
  const isModUser = isModerator(userEmail);
  
  if (!isOwnerUser && !isAdminUser && !isModUser) {
    alert('Admin/Moderator access is required to reject submissions.');
    return;
  }
  try {
    const reviewer = auth.currentUser;
    await db.collection('submissions').doc(id).update({
      status: 'rejected',
      rejectionReason: reason || '',
      reviewedBy: reviewer ? (reviewer.displayName || 'Admin') : 'Admin',
      reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    alert('Submission rejected.');
    await refreshSubmissions(currentSubFilter);
  } catch (err) {
    alert('Rejection failed: ' + err.message);
  }
}

// ═════════════════════════════════════════════════════════════
// ARTWORKS CRUD
// ═════════════════════════════════════════════════════════════

async function loadArtworks(container) {
  container.innerHTML = `
    <h3 style="margin-bottom:16px">Artwork Management</h3>
    <form id="art-form" style="margin-bottom:24px">
      <div class="g2 mb-md">
        <div class="fg"><label class="fl">Title</label><input class="fi" id="af-title" required /></div>
        <div class="fg"><label class="fl">Image URL</label><input class="fi" id="af-url" required /></div>
      </div>
      <div class="fg" style="margin-bottom:12px">
        <label class="fl">Or Upload Image File</label>
        <div class="upload-zone" id="af-upload-zone">
          <input type="file" id="af-file" accept="image/png,image/jpeg,image/gif,image/webp,image/heic,image/heif" />
          <div class="uz-icon">⬆</div>
          <div class="uz-text">Click or drag image here to upload</div>
          <div class="uz-hint">PNG, JPG, GIF, WebP, HEIC, HEIF - optimized for Firestore</div>
        </div>
        <div class="upload-progress" id="af-upload-progress">
          <div class="upload-progress-bar" id="af-upload-bar"></div>
        </div>
        <div class="img-list" id="af-uploaded"></div>
      </div>
      <div class="fg"><label style="font-size:.8rem;color:var(--wht-d);cursor:pointer"><input type="checkbox" id="af-spot" checked style="margin-right:8px" /> Display in Art Spotlight</label></div>
      <input type="hidden" id="af-id" />
      <button type="submit" class="btn btn-p" id="af-btn">&gt;&gt; Add Artwork</button>
    </form>
    <table class="adm-tbl"><thead><tr><th>Title</th><th>Spotlight</th><th>Actions</th></tr></thead><tbody id="art-tbody"></tbody></table>
  `;
  document.getElementById('art-form').addEventListener('submit', submitArt);
  bindArtworkUploadControls();
  await refreshArt();
}

function bindArtworkUploadControls() {
  const zone = document.getElementById('af-upload-zone');
  const input = document.getElementById('af-file');
  if (!zone || !input) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleAdminArtworkFiles(e.dataTransfer.files);
  });

  input.addEventListener('change', e => {
    handleAdminArtworkFiles(e.target.files);
    input.value = '';
  });

  const urlInput = document.getElementById('af-url');
  if (urlInput) {
    urlInput.addEventListener('input', () => {
      if (urlInput.value.trim()) {
        adminArtworkUploadUrl = urlInput.value.trim();
        renderAdminArtworkUploadPreview();
      }
    });
  }
}

function handleAdminArtworkFiles(files) {
  if (!files || !files.length) return;
  const file = files[0];

  if (!file.type.startsWith('image/')) {
    alert('Only image files are allowed.');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('File too large (max 5MB).');
    return;
  }

  uploadAdminArtworkFile(file);
}

async function uploadAdminArtworkFile(file, attempt = 1) {
  const progressWrap = document.getElementById('af-upload-progress');
  const progressBar = document.getElementById('af-upload-bar');
  if (!progressWrap || !progressBar) return;

  progressWrap.style.display = 'block';
  progressBar.style.width = '0%';

  function toDataUrl(f) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
      reader.readAsDataURL(f);
    });
  }

  function dataUrlBytes(dataUrl) {
    const parts = String(dataUrl || '').split(',');
    if (parts.length < 2) return 0;
    const base64 = parts[1];
    const padding = (base64.match(/=+$/) || [''])[0].length;
    return Math.floor((base64.length * 3) / 4) - padding;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode image.'));
      img.src = url;
    });
  }

  try {
    progressBar.style.width = '15%';
    const original = await toDataUrl(file);
    const image = await loadImage(original);

    const maxDim = 1280;
    let width = image.naturalWidth || image.width;
    let height = image.naturalHeight || image.height;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not initialize canvas.');

    ctx.drawImage(image, 0, 0, width, height);
    let quality = 0.82;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);

    progressBar.style.width = '60%';
    while (dataUrlBytes(dataUrl) > 250 * 1024 && quality > 0.45) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    let shrinkPass = 0;
    while (dataUrlBytes(dataUrl) > 250 * 1024 && shrinkPass < 4) {
      width = Math.max(1, Math.floor(width * 0.85));
      height = Math.max(1, Math.floor(height * 0.85));
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(image, 0, 0, width, height);
      dataUrl = canvas.toDataURL('image/jpeg', Math.max(0.45, quality));
      shrinkPass++;
    }

    if (dataUrlBytes(dataUrl) > 250 * 1024) {
      throw new Error('Image is too large after optimization. Use a smaller image.');
    }

    progressBar.style.width = '100%';
    adminArtworkUploadUrl = dataUrl;
    document.getElementById('af-url').value = dataUrl;
    renderAdminArtworkUploadPreview();
    progressWrap.style.display = 'none';
  } catch (err) {
    alert('Image processing failed: ' + err.message);
    progressWrap.style.display = 'none';
  }
}

function renderAdminArtworkUploadPreview() {
  const holder = document.getElementById('af-uploaded');
  if (!holder) return;

  if (!adminArtworkUploadUrl) {
    holder.innerHTML = '';
    return;
  }

  holder.innerHTML = '<div class="img-item">' +
    '<img src="' + adminArtworkUploadUrl + '" alt="Uploaded artwork" loading="lazy" decoding="async" />' +
    '<span class="img-url" title="' + adminArtworkUploadUrl + '">Selected artwork image</span>' +
    '<button type="button" class="btn btn-sm btn-s" onclick="clearAdminArtworkUpload()">Remove</button>' +
  '</div>';
}

function clearAdminArtworkUpload() {
  adminArtworkUploadUrl = '';
  const urlInput = document.getElementById('af-url');
  if (urlInput) urlInput.value = '';
  renderAdminArtworkUploadPreview();
}

async function refreshArt() {
  const tbody = document.getElementById('art-tbody');
  try {
    const snap = await db.collection('artworks').get();
    if (snap.empty) { tbody.innerHTML = '<tr><td colspan="3" class="tc" style="padding:24px;color:var(--wht-f)">No artworks found.</td></tr>'; return; }
    tbody.innerHTML = snap.docs.map(d => {
      const a = d.data();
      const deleteBtn = canDeleteManagedContent()
        ? '<button class="btn btn-sm btn-d" onclick="deleteArt(\'' + d.id + '\')" style="margin-left:4px">Delete</button>'
        : '';
      return `<tr><td>${a.title}</td><td>${a.displayInSpotlight ? '✓' : '—'}</td><td>
        <button class="btn btn-sm btn-s" onclick="editArt('${d.id}')">Edit</button>
        ${deleteBtn}
      </td></tr>`;
    }).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="3" class="tc" style="padding:24px;color:var(--wht-f)">Connect Firebase.</td></tr>'; }
}

async function submitArt(e) {
  e.preventDefault();
  const id = document.getElementById('af-id').value;
  const imageUrl = document.getElementById('af-url').value.trim();
  if (!imageUrl) {
    alert('Provide an image URL or upload an image file.');
    return;
  }
  const data = { title: document.getElementById('af-title').value, imageUrl: imageUrl, displayInSpotlight: document.getElementById('af-spot').checked };
  try {
    if (id) await db.collection('artworks').doc(id).update(data);
    else await db.collection('artworks').add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    document.getElementById('art-form').reset();
    document.getElementById('af-id').value = '';
    document.getElementById('af-btn').textContent = '>> Add Artwork';
    clearAdminArtworkUpload();
    await refreshArt();
  } catch (err) { alert('Error: ' + err.message); }
}

async function editArt(id) {
  const doc = await db.collection('artworks').doc(id).get();
  if (!doc.exists) return;
  const a = doc.data();
  document.getElementById('af-id').value = id;
  document.getElementById('af-title').value = a.title || '';
  document.getElementById('af-url').value = a.imageUrl || '';
  adminArtworkUploadUrl = a.imageUrl || '';
  renderAdminArtworkUploadPreview();
  document.getElementById('af-spot').checked = !!a.displayInSpotlight;
  document.getElementById('af-btn').textContent = '>> Update Artwork';
}

async function deleteArt(id) {
  if (!canDeleteManagedContent()) {
    alert('Only Admins and Owners can delete artworks.');
    return;
  }
  if (!await window.rogConfirm('Remove this artwork?')) return;
  try { await db.collection('artworks').doc(id).delete(); await refreshArt(); }
  catch (err) { alert('Error: ' + err.message); }
}

// ═════════════════════════════════════════════════════════════
// NEWS CRUD
// ═════════════════════════════════════════════════════════════

async function loadNewsAdmin(container) {
  container.innerHTML = `
    <h3 style="margin-bottom:16px">News Management</h3>
    <form id="news-form" style="margin-bottom:24px">
      <div class="g2 mb-md">
        <div class="fg"><label class="fl">Title</label><input class="fi" id="nf-title" required /></div>
        <div class="fg"><label class="fl">Date</label><input type="date" class="fi" id="nf-date" /></div>
      </div>
      <div class="fg"><label class="fl">Image URL</label><input class="fi" id="nf-image" placeholder="Optional image URL or upload below" /></div>
      <div class="fg" style="margin-bottom:12px">
        <label class="fl">Or Upload News Image</label>
        <div class="upload-zone" id="nf-upload-zone">
          <input type="file" id="nf-file" accept="image/png,image/jpeg,image/gif,image/webp,image/heic,image/heif" />
          <div class="uz-icon">⬆</div>
          <div class="uz-text">Click or drag image here to attach to news</div>
          <div class="uz-hint">PNG, JPG, GIF, WebP, HEIC, HEIF - optimized for Firestore</div>
        </div>
        <div class="upload-progress" id="nf-upload-progress">
          <div class="upload-progress-bar" id="nf-upload-bar"></div>
        </div>
        <div class="img-list" id="nf-uploaded"></div>
      </div>
      <div class="fg"><label class="fl">Body</label><textarea class="fta" id="nf-body"></textarea></div>
      <input type="hidden" id="nf-id" />
      <button type="submit" class="btn btn-p" id="nf-btn">&gt;&gt; Publish Article</button>
    </form>
    <table class="adm-tbl"><thead><tr><th>Date</th><th>Title</th><th>Image</th><th>Actions</th></tr></thead><tbody id="news-tbody"></tbody></table>
  `;
  document.getElementById('nf-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('news-form').addEventListener('submit', submitNews);
  bindNewsImageControls();
  await refreshNews();
}

function bindNewsImageControls() {
  const zone = document.getElementById('nf-upload-zone');
  const input = document.getElementById('nf-file');
  const urlInput = document.getElementById('nf-image');
  if (!zone || !input || !urlInput) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleNewsImageFiles(e.dataTransfer.files);
  });

  input.addEventListener('change', e => {
    handleNewsImageFiles(e.target.files);
    input.value = '';
  });

  urlInput.addEventListener('input', () => {
    if (urlInput.value.trim()) {
      adminNewsImageUrl = urlInput.value.trim();
      renderNewsImagePreview();
    }
  });
}

function handleNewsImageFiles(files) {
  if (!files || !files.length) return;
  const file = files[0];
  if (!file.type.startsWith('image/')) {
    alert('Only image files are allowed.');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('File too large (max 5MB).');
    return;
  }
  uploadNewsImageFile(file);
}

async function uploadNewsImageFile(file) {
  const progressWrap = document.getElementById('nf-upload-progress');
  const progressBar = document.getElementById('nf-upload-bar');
  if (!progressWrap || !progressBar) return;

  progressWrap.style.display = 'block';
  progressBar.style.width = '10%';
  try {
    adminNewsImageUrl = await optimizeImageToDataUrl(file);
    document.getElementById('nf-image').value = adminNewsImageUrl;
    progressBar.style.width = '100%';
    renderNewsImagePreview();
  } catch (err) {
    alert('Image processing failed: ' + err.message);
  } finally {
    progressWrap.style.display = 'none';
  }
}

function renderNewsImagePreview() {
  const holder = document.getElementById('nf-uploaded');
  if (!holder) return;
  if (!adminNewsImageUrl) {
    holder.innerHTML = '';
    return;
  }

  holder.innerHTML = '<div class="img-item">' +
    '<img src="' + adminNewsImageUrl + '" alt="News image" loading="lazy" decoding="async" />' +
    '<span class="img-url" title="' + adminNewsImageUrl + '">Selected news image</span>' +
    '<button type="button" class="btn btn-sm btn-s" onclick="clearNewsImageUpload()">Remove</button>' +
  '</div>';
}

function clearNewsImageUpload() {
  adminNewsImageUrl = '';
  const urlInput = document.getElementById('nf-image');
  if (urlInput) urlInput.value = '';
  renderNewsImagePreview();
}

async function refreshNews() {
  const tbody = document.getElementById('news-tbody');
  try {
    const snap = await db.collection('news').orderBy('date', 'desc').limit(20).get();
    if (snap.empty) { tbody.innerHTML = '<tr><td colspan="4" class="tc" style="padding:24px;color:var(--wht-f)">No news items.</td></tr>'; return; }
    tbody.innerHTML = snap.docs.map(d => {
      const n = d.data();
      const thumb = n.imageUrl ? '<img src="' + n.imageUrl + '" alt="News thumbnail" loading="lazy" decoding="async" style="width:72px;height:48px;object-fit:cover;border:1px solid var(--blk-d);background:#111" />' : '<span style="color:var(--wht-f)">—</span>';
      const deleteBtn = canDeleteManagedContent()
        ? '<button class="btn btn-sm btn-d" onclick="deleteNews(\'' + d.id + '\')" style="margin-left:4px">Delete</button>'
        : '';
      return `<tr><td style="white-space:nowrap">${n.date}</td><td>${n.title}</td><td>${thumb}</td><td>
        <button class="btn btn-sm btn-s" onclick="editNews('${d.id}')">Edit</button>
        ${deleteBtn}
      </td></tr>`;
    }).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="4" class="tc" style="padding:24px;color:var(--wht-f)">Connect Firebase.</td></tr>'; }
}

async function submitNews(e) {
  e.preventDefault();
  const id = document.getElementById('nf-id').value;
  const imageUrl = document.getElementById('nf-image').value.trim() || adminNewsImageUrl || '';
  const data = { title: document.getElementById('nf-title').value, body: document.getElementById('nf-body').value, date: document.getElementById('nf-date').value, imageUrl: imageUrl };
  try {
    if (id) await db.collection('news').doc(id).update(data);
    else await db.collection('news').add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    document.getElementById('news-form').reset(); document.getElementById('nf-id').value = '';
    document.getElementById('nf-date').value = new Date().toISOString().split('T')[0];
    clearNewsImageUpload();
    await refreshNews();
  } catch (err) { alert('Error: ' + err.message); }
}

async function editNews(id) {
  const doc = await db.collection('news').doc(id).get();
  if (!doc.exists) return;
  const n = doc.data();
  document.getElementById('nf-id').value = id;
  document.getElementById('nf-title').value = n.title || '';
  document.getElementById('nf-body').value = n.body || '';
  document.getElementById('nf-date').value = n.date || '';
  document.getElementById('nf-image').value = n.imageUrl || '';
  adminNewsImageUrl = n.imageUrl || '';
  renderNewsImagePreview();
  document.getElementById('nf-btn').textContent = '>> Update Article';
}

async function deleteNews(id) {
  if (!canDeleteManagedContent()) {
    alert('Only Admins and Owners can delete news.');
    return;
  }
  if (!await window.rogConfirm('Delete this news item?')) return;
  try { await db.collection('news').doc(id).delete(); await refreshNews(); }
  catch (err) { alert('Error: ' + err.message); }
}

// ═════════════════════════════════════════════════════════════
// USERS (OWNER ONLY)
// ═════════════════════════════════════════════════════════════

async function loadUsers(container) {
  container.innerHTML = `
    <h3 style="margin-bottom:16px">Registered Users</h3>
    <p style="font-size:.8rem;color:var(--wht-d);margin-bottom:16px">All accounts that have signed into the Guild. Owners and Admins may see email addresses. Manage admin access in the Roles tab.</p>
    <table class="adm-tbl"><thead><tr><th>Display Name</th><th>Email</th><th>Role</th><th>Last Login</th></tr></thead><tbody id="users-tbody"></tbody></table>
    ${renderHierarchyGraph()}
  `;
  await refreshUsers();
}

async function refreshUsers() {
  const tbody = document.getElementById('users-tbody');
  try {
    const snap = await db.collection('users').get();

    // Build full user list from Firestore
    const users = snap.docs.map(d => {
      const u = d.data() || {};
      return {
        uid: d.id,
        email: String(u.email || '').toLowerCase(),
        displayName: String(u.displayName || u.email || 'Unknown Agent'),
        role: String(u.role || 'user'),
        roleName: String(u.roleName || ''),
        lastLogin: u.lastLogin || u.updatedAt || null,
        raw: u
      };
    });

    // Include any configured owners/admins/mods that don't have user docs yet
    ROLE_DATA.owners.forEach(email => {
      const e = String(email || '').toLowerCase();
      if (!users.find(u => u.email === e)) users.push({ uid: '', email: e, displayName: e.split('@')[0], role: 'owner', roleName: ROLE_NAMES.owner || 'Owner', lastLogin: null, raw: {} });
    });
    ROLE_DATA.admins.forEach(email => {
      const e = String(email || '').toLowerCase();
      if (!users.find(u => u.email === e)) users.push({ uid: '', email: e, displayName: e.split('@')[0], role: 'admin', roleName: ROLE_NAMES.admin || 'Admin', lastLogin: null, raw: {} });
    });
    ROLE_DATA.mods.forEach(email => {
      const e = String(email || '').toLowerCase();
      if (!users.find(u => u.email === e)) users.push({ uid: '', email: e, displayName: e.split('@')[0], role: 'mod', roleName: ROLE_NAMES.mod || 'Moderator', lastLogin: null, raw: {} });
    });

    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="tc" style="padding:24px;color:var(--wht-f)">No users found.</td></tr>';
      return;
    }

    // Resolve role for display and group users with explicit hierarchy buckets
    const groups = {
      owner: [],
      senior_admin: [],
      admin: [],
      junior_admin: [],
      senior_moderator: [],
      moderator: [],
      junior_moderator: [],
      contributor: [],
      site_member: [],
      other: []
    };

    const toHierarchyKey = (rawRole) => {
      const normalized = String(rawRole || '').toLowerCase().trim();
      if (!normalized) return 'site_member';
      if (normalized === 'owner' || normalized === 'the archivist') return 'owner';

      if (normalized === 'senior_administrator' || normalized === 'senior-admin') return 'senior_admin';
      if (normalized === 'administrator' || normalized === 'admin') return 'admin';
      if (normalized === 'junior_administrator' || normalized === 'junior_admin' || normalized === 'junior-admin') return 'junior_admin';

      if (normalized === 'senior_moderator' || normalized === 'senior-mod') return 'senior_moderator';
      if (normalized === 'moderator' || normalized === 'mod') return 'moderator';
      if (normalized === 'junior_moderator' || normalized === 'junior-mod') return 'junior_moderator';

      if (normalized === 'contributor' || normalized === 'editor') return 'contributor';
      if (normalized === 'site_member' || normalized === 'user' || normalized === 'newbie' || normalized === 'guest') return 'site_member';

      // Map branch-head legacy roles into nearest visible buckets
      if (normalized === 'chief_admin' || normalized === 'chief-admin' || normalized === 'deputy_chief_administrator' || normalized === 'deputy-chief-admin') return 'senior_admin';
      if (normalized === 'chief_of_moderation' || normalized === 'chief-mod' || normalized === 'deputy_chief_of_moderation' || normalized === 'deputy-chief-mod') return 'senior_moderator';

      return 'other';
    };

    users.forEach(u => {
      const email = String(u.email || '').toLowerCase();
      // Prefer explicit config role mapping
      const mapped = ROLE_DATA.userRoles && ROLE_DATA.userRoles[email] ? ROLE_DATA.userRoles[email] : u.role || 'user';
      const key = toHierarchyKey(mapped || 'site_member');
      groups[key].push(u);
    });

    // Helper to render a group as table rows with a section header
    const renderGroup = (label, arr) => {
      if (!arr || !arr.length) return '';
      const headerRow = `<tr><td colspan="4" style="padding:6px 12px;background:rgba(0,0,0,.06);font-weight:600">${escapeHtml(label)} (${arr.length})</td></tr>`;
      const rows = arr.map(u => {
        const showEmail = (isOwner(auth.currentUser?.email) || isAdmin(auth.currentUser?.email)) ? (u.email || '[Not Set]') : '[Redacted]';
        const roleDisplayName = getRoleDisplayNameForUserRecord(u);
        return `<tr><td>${escapeHtml(u.displayName || 'Unknown Agent')}</td><td style="font-family:monospace;color:var(--wht-d)">${escapeHtml(showEmail)}</td><td><span class="tag">${escapeHtml(roleDisplayName)}</span></td><td style="font-size:.75rem;color:var(--wht-d)">${u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : '—'}</td></tr>`;
      }).join('');
      return headerRow + rows;
    };

    // Order: explicit hierarchy requested for admin user listing
    const html = [];
    html.push(renderGroup('Owners', groups.owner));
    html.push(renderGroup('Senior Administrators', groups.senior_admin));
    html.push(renderGroup('Administrators', groups.admin));
    html.push(renderGroup('Junior Administrators', groups.junior_admin));
    html.push(renderGroup('Senior Moderators', groups.senior_moderator));
    html.push(renderGroup('Moderators', groups.moderator));
    html.push(renderGroup('Junior Moderators', groups.junior_moderator));
    html.push(renderGroup('Contributors', groups.contributor));
    html.push(renderGroup('Site Members', groups.site_member));
    html.push(renderGroup('Other Roles', groups.other));

    tbody.innerHTML = html.filter(Boolean).join('') || '<tr><td colspan="4" class="tc" style="padding:24px;color:var(--wht-f)">No users found.</td></tr>';
  } catch (err) { 
    tbody.innerHTML = '<tr><td colspan="4" class="tc" style="padding:24px;color:var(--wht-f)">Connect Firebase.</td></tr>';
  }
}

// ═════════════════════════════════════════════════════════════
// ROLES MANAGEMENT
// ═════════════════════════════════════════════════════════════

function canEditRole(targetEmail, currentEmail) {
  const target = String(targetEmail || '').toLowerCase();
  if (!target || isOwner(target)) return false;
  const currentLevel = getUserLevel(currentEmail);
  const targetLevel = getUserLevel(targetEmail);
  return currentLevel > targetLevel;
}

async function loadRolesManager(container) {
  const user = auth.currentUser;
  const isOwnerUser = isOwner(user?.email);
  const canManageRoles = isOwner(user?.email) || (isAdmin(user?.email) && GUILD_PERMISSIONS['adminCanManageRoles']);
  if (!canManageRoles) {
    container.innerHTML = '<p style="color:var(--red-b)">⚠ Roles management requires Owner clearance or Admin with role management permission.</p>';
    return;
  }
  const currentLevel = getUserLevel(user?.email);
  const roleOptions = Object.keys(ROLE_LEVELS).filter(role => ROLE_LEVELS[role] < currentLevel && role !== 'owner' && role !== 'user' && role !== 'guest').map(role => 
    `<option value="${role}">${ROLE_NAMES[role]}</option>`
  ).join('');
  container.innerHTML = `
    <h3 style="margin-bottom:16px">Roles Management${isOwnerUser ? ' (Owner)' : ' (Admin)'}</h3>
    <p style="font-size:.8rem;color:var(--wht-d);margin-bottom:24px">Assign staff roles. Changes take effect on next login. Roles are stored in Firebase config.</p>
    <div style="margin-bottom:24px;border:1px solid var(--wht-f);padding:16px">
      <h4 style="margin-bottom:12px;color:var(--red-b)">Add Staff Role</h4>
      <div style="display:flex;gap:8px;align-items:center">
        <input class="fi" id="role-email" placeholder="email@example.com" style="flex:1" />
        <select class="fi" id="role-kind" style="max-width:200px">
          ${roleOptions}
        </select>
        <button class="btn btn-p" onclick="addStaffRole()">+ Add Role</button>
      </div>
    </div>
    <h4 style="margin-bottom:8px">Administrative Staff</h4>
    <div id="admin-list" style="margin-bottom:24px"></div>
    <h4 style="margin-bottom:8px">Moderation Staff</h4>
    <div id="mod-list" style="margin-bottom:24px"></div>
    <h4 style="margin-bottom:8px;color:var(--wht-d)">Owners (Bootstrap — cannot be changed here)</h4>
    <div id="owners-list"></div>
    <div style="margin:10px 0 24px;padding:12px;border:1px solid var(--blk-m);background:rgba(255,255,255,.02)">
      <div style="font-size:.78rem;color:var(--wht-f);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Hierarchy Guide</div>
      <div style="font-size:.8rem;color:var(--wht-d);line-height:1.7">
        Owner / Archivist &gt; Chief Administrator &gt; Deputy Chief Administrator &gt; Senior Administrator &gt; Administrator &gt; Junior Administrator &gt; Chief of Moderation &gt; Deputy Chief of Moderation &gt; Senior Moderator &gt; Moderator &gt; Junior Moderator
      </div>
    </div>
    <div style="margin-top:8px;padding:12px;border:1px solid var(--blk-m);background:rgba(255,255,255,.02);font-size:.78rem;color:var(--wht-d);line-height:1.7">
      Editor applications are reviewed in the Applications tab.
    </div>
  `;
  await refreshRolesDisplay();
}

async function refreshRolesDisplay() {
  const adminList = document.getElementById('admin-list');
  const modList = document.getElementById('mod-list');
  const ownersList = document.getElementById('owners-list');
  const roleAdminApplications = document.getElementById('role-admin-applications');
  if (!adminList || !modList || !ownersList) return;

  // Refresh from Firestore
  try {
    const doc = await db.collection('config').doc('roles').get();
    if (doc.exists) {
      const d = doc.data();
      ROLE_DATA.owners = (d.owners || []).map(e => e.toLowerCase());
      ROLE_DATA.admins = (d.admins || []).map(e => e.toLowerCase());
      ROLE_DATA.mods = (d.mods || []).map(e => e.toLowerCase());
      ROLE_DATA.userRoles = d.userRoles || {};
      ROLE_DATA.adminAppointments = d.adminAppointments || {};
    }
  } catch(e) { /* keep cached */ }

  // Set userRoles for backward compatibility
  ROLE_DATA.owners.forEach(email => {
    if (!ROLE_DATA.userRoles[email]) ROLE_DATA.userRoles[email] = 'owner';
  });
  ROLE_DATA.admins.forEach(email => {
    if (!ROLE_DATA.userRoles[email]) ROLE_DATA.userRoles[email] = 'admin';
  });
  ROLE_DATA.mods.forEach(email => {
    if (!ROLE_DATA.userRoles[email]) ROLE_DATA.userRoles[email] = 'mod';
  });

  const currentEmail = auth.currentUser?.email;
  const currentLevel = getUserLevel(currentEmail);
  const roleOptions = Object.keys(ROLE_LEVELS)
    .filter(role => role !== 'owner' && role !== 'user' && role !== 'guest' && (ROLE_LEVELS[role] || 0) < currentLevel)
    .map(role => `<option value="${role}">${ROLE_NAMES[role] || role}</option>`)
    .join('');

  const renderRoleEditor = (email, role) => {
    const canModify = canEditRole(email, currentEmail);
    if (!canModify) return '';
    const selectorId = 'role-edit-' + String(email).replace(/[^a-z0-9]/gi, '-');
    const buttonId = 'role-update-' + String(email).replace(/[^a-z0-9]/gi, '-');
    return '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      `<select class="fi" id="${selectorId}" style="min-width:190px;max-width:260px" onchange="toggleRoleUpdateButton('${selectorId}','${buttonId}','${role}')">${roleOptions}</select>` +
      `<button class="btn btn-sm btn-p" id="${buttonId}" onclick="updateStaffRole('${email}')" disabled>Update Role</button>` +
      `<button class="btn btn-sm btn-d" onclick="removeStaffRole('${role}','${email}')">Revoke</button>` +
    '</div>';
  };

  // Administrative Staff (level >=60 and <100)
  const adminStaff = Object.entries(ROLE_DATA.userRoles).filter(([email, role]) => {
    const level = ROLE_LEVELS[role] || 0;
    return level >= 60 && level < 100;
  });
  if (adminStaff.length === 0) {
    adminList.innerHTML = '<p style="color:var(--wht-f);font-size:.85rem;padding:8px 0">No administrative staff assigned yet.</p>';
  } else {
    adminList.innerHTML = adminStaff.map(([email, role]) => {
      const canRevoke = canEditRole(email, currentEmail);
      const roleName = ROLE_NAMES[role] || role;
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;border:1px solid var(--wht-f);margin-bottom:4px;font-family:monospace;font-size:.85rem">
          <span>${email} <span style="color:var(--wht-d)">(${roleName})</span></span>
          ${canRevoke ? renderRoleEditor(email, role) : ''}
        </div>
      `;
    }).join('');
  }

  // Moderation Staff (level >=10 and <60)
  const modStaff = Object.entries(ROLE_DATA.userRoles).filter(([email, role]) => {
    const level = ROLE_LEVELS[role] || 0;
    return level >= 10 && level < 60;
  });
  if (modStaff.length === 0) {
    modList.innerHTML = '<p style="color:var(--wht-f);font-size:.85rem;padding:8px 0">No moderation staff assigned yet.</p>';
  } else {
    modList.innerHTML = modStaff.map(([email, role]) => {
      const canRevoke = canEditRole(email, currentEmail);
      const roleName = ROLE_NAMES[role] || role;
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;border:1px solid var(--wht-f);margin-bottom:4px;font-family:monospace;font-size:.85rem">
          <span>${email} <span style="color:var(--wht-d)">(${roleName})</span></span>
          ${canRevoke ? renderRoleEditor(email, role) : ''}
        </div>
      `;
    }).join('');
  }

  ownersList.innerHTML = ROLE_DATA.owners.map(email => `
    <div style="padding:8px 12px;border:1px solid var(--red-b);margin-bottom:4px;font-family:monospace;font-size:.85rem;color:var(--red-b)">
      ${email} <span style="color:var(--wht-d)">(Owner)</span>
    </div>
  `).join('');

  Object.entries(ROLE_DATA.userRoles).forEach(([email, role]) => {
    const selectorId = 'role-edit-' + String(email).replace(/[^a-z0-9]/gi, '-');
    const buttonId = 'role-update-' + String(email).replace(/[^a-z0-9]/gi, '-');
    const picker = document.getElementById(selectorId);
    if (picker) {
      picker.value = role;
      toggleRoleUpdateButton(selectorId, buttonId, role);
    }
  });

  if (roleAdminApplications) {
    roleAdminApplications.innerHTML = '<p style="font-size:.82rem;color:var(--wht-d)">Applications are reviewed in the Applications tab.</p>';
  }
}

function toggleRoleUpdateButton(selectId, buttonId, currentRole) {
  const select = document.getElementById(selectId);
  const button = document.getElementById(buttonId);
  if (!select || !button) return;
  const nextRole = String(select.value || '').trim();
  button.disabled = !nextRole || nextRole === String(currentRole || '');
}

async function updateStaffRole(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const selectorId = 'role-edit-' + normalizedEmail.replace(/[^a-z0-9]/gi, '-');
  const roleSelect = document.getElementById(selectorId);
  const nextRole = String(roleSelect && roleSelect.value || '').trim();
  if (!normalizedEmail || !nextRole) return;
  if (!canEditRole(normalizedEmail, auth.currentUser?.email)) {
    alert('You do not have permission to modify this user\'s role.');
    return;
  }
  if (ROLE_DATA.userRoles[normalizedEmail] === nextRole) {
    alert('No changes detected for this user.');
    return;
  }
  const roleInput = document.getElementById('role-email');
  const kindInput = document.getElementById('role-kind');
  if (roleInput && kindInput) {
    roleInput.value = normalizedEmail;
    kindInput.value = nextRole;
  }
  await addStaffRole();
}

async function addStaffRole() {
  const input = document.getElementById('role-email');
  const kindInput = document.getElementById('role-kind');
  const email = (input.value || '').trim().toLowerCase();
  const kind = (kindInput && kindInput.value) || 'mod';
  if (!email || !email.includes('@')) { alert('Enter a valid email address.'); return; }
  if (!canEditRole(email, auth.currentUser?.email)) { alert('You do not have permission to modify this user\'s role.'); return; }
  if (ROLE_DATA.owners.includes(email)) { alert('This email is already an Owner.'); return; }

  // Check if already has this role
  if (ROLE_DATA.userRoles[email] === kind) { alert(`This email is already assigned the ${ROLE_NAMES[kind]} role.`); return; }

  try {
    const result = await callSocialApi('POST', { action: 'assignrole', email, role: kind });
    if (result && result.ok) {
      // Refresh local cached roles by reading config again
      await refreshRolesDisplay();
      input.value = '';
      alert(`${ROLE_NAMES[kind]} role granted to ${email}`);
    } else {
      alert('Failed to add role.');
    }
  } catch (err) {
    alert('Failed to add role: ' + err.message);
  }
}

async function removeStaffRole(kind, email) {
  if (!await window.rogConfirm(`Revoke ${ROLE_NAMES[kind]} access for ${email}?`)) return;
  if (!canEditRole(email, auth.currentUser?.email)) { alert('You do not have permission to modify this user\'s role.'); return; }
  try {
    const result = await callSocialApi('POST', { action: 'assignrole', email, role: 'user' });
    if (result && result.ok) {
      await refreshRolesDisplay();
      alert(`${ROLE_NAMES[kind]} access revoked for ${email}`);
    } else {
      alert('Failed to remove role.');
    }
  } catch (err) {
    alert('Failed to remove role: ' + err.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
 *  VERSION MANAGEMENT
 * ═══════════════════════════════════════════════════════════════ */

let currentAppVersion = null;
let latestGitHubVersion = null;
let versionCheckInterval = null;

async function initializeVersionDisplay() {
  try {
    // Load local version
    const versionResponse = await fetch('./version.json');
    const versionData = await versionResponse.json();
    currentAppVersion = versionData.version;
    
    const versionEl = document.getElementById('current-version');
    if (versionEl) {
      versionEl.textContent = currentAppVersion;
    }
    
    // Update UI helper
    const setCheckedAt = (txt) => {
      const wrap = document.getElementById('version-check');
      const when = document.getElementById('version-checked-at');
      if (when) when.textContent = txt || '-';
      if (wrap) wrap.style.display = txt ? 'block' : 'none';
    };

    setCheckedAt('Checking...');

    // Initial check for updates
    await checkForUpdates(versionData.githubRepo).finally(() => {
      setCheckedAt(new Date().toLocaleString());
    });

    // Check for updates every 5 minutes
    versionCheckInterval = setInterval(() => {
      checkForUpdates(versionData.githubRepo).finally(() => setCheckedAt(new Date().toLocaleString()));
    }, 5 * 60 * 1000);

    // Also check when tab/window gains focus
    window.addEventListener('focus', () => {
      try {
        checkForUpdates(versionData.githubRepo).finally(() => setCheckedAt(new Date().toLocaleString()));
      } catch (e) { /* ignore */ }
    });
  } catch (error) {
    console.warn('Failed to initialize version display:', error);
    const versionEl = document.getElementById('current-version');
    if (versionEl) versionEl.textContent = 'unknown';
  }
}

async function checkForUpdates(gitHubRepo) {
  try {
    const [owner, repo] = gitHubRepo.split('/');
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    
    const response = await fetch(apiUrl, { headers: { Accept: 'application/vnd.github.v3+json' } });
    if (!response.ok) {
      console.warn('Failed to fetch GitHub releases:', response.status);
      // update UI to indicate no remote releases found
      const indicator = document.getElementById('update-indicator');
      if (indicator) indicator.style.display = 'none';
      const when = document.getElementById('version-checked-at');
      if (when) when.textContent = `Error: ${response.status}`;
      return;
    }
    
    const releaseData = await response.json();
    const latestVersion = releaseData.tag_name ? releaseData.tag_name.replace(/^v/, '') : null;
    
    if (latestVersion && latestVersion !== currentAppVersion) {
      latestGitHubVersion = latestVersion;
      displayUpdateIndicator(latestVersion);
      console.info(`Update available: ${latestVersion} (current: ${currentAppVersion})`);
    }
    // If no update, ensure indicator is hidden
    else {
      const indicator = document.getElementById('update-indicator');
      if (indicator) indicator.style.display = 'none';
    }
  } catch (error) {
    console.warn('Error checking for GitHub updates:', error);
    const when = document.getElementById('version-checked-at');
    if (when) when.textContent = 'Error';
  }
}

function displayUpdateIndicator(newVersion) {
  const indicator = document.getElementById('update-indicator');
  if (indicator) {
    indicator.style.display = 'inline';
    indicator.title = `Update available: v${newVersion}`;
    indicator.innerHTML = `• Update available (v${newVersion})`;
  }
}

window.addEventListener('beforeunload', () => {
  if (versionCheckInterval) clearInterval(versionCheckInterval);
});
