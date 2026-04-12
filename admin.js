/* ═══════════════════════════════════════════════════════════════
 *  ADMIN.JS — Admin dashboard logic
 *  Full CRUD for Pages, Artworks, News + Owner-only User mgmt
 * ═══════════════════════════════════════════════════════════════ */

let activeTab = 'pages';
let adminArtworkUploadUrl = '';
let adminNewsImageUrl = '';

function getCurrentRole() {
  return resolveRole(auth.currentUser?.email || '');
}

function isModOnlyRole() {
  return getCurrentRole() === 'mod';
}

function canModerateSubmissions() {
  return isModerator(auth.currentUser?.email);
}

function canDeleteManagedContent() {
  return isAdmin(auth.currentUser?.email);
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

function applyTabVisibilityForRole(role) {
  const pagesTab = document.getElementById('tab-pages');
  const submissionsTab = document.getElementById('tab-submissions');
  const artworksTab = document.getElementById('tab-artworks');
  const newsTab = document.getElementById('tab-news');
  const usersTab = document.getElementById('tab-users');
  const rolesTab = document.getElementById('tab-roles');
  const configTab = document.getElementById('tab-config');

  const isModOnly = role === 'mod';

  if (pagesTab) pagesTab.classList.toggle('hidden', isModOnly);
  if (submissionsTab) submissionsTab.classList.remove('hidden');
  if (artworksTab) artworksTab.classList.toggle('hidden', isModOnly);
  if (newsTab) newsTab.classList.toggle('hidden', isModOnly);
  if (configTab) configTab.classList.toggle('hidden', isModOnly);

  if (usersTab) usersTab.classList.toggle('hidden', !isAdmin(auth.currentUser?.email));
  if (rolesTab) rolesTab.classList.toggle('hidden', !isOwner(auth.currentUser?.email));

  if (isModOnly && activeTab !== 'submissions') {
    activeTab = 'submissions';
    document.querySelectorAll('#adm-tabs a').forEach(a => a.classList.remove('on'));
    if (submissionsTab) submissionsTab.classList.add('on');
  }
}

// ── Auth Gate ─────────────────────────────────────────────────
auth.onAuthStateChanged(async user => {
  await rolesReady;
  document.getElementById('admin-loading').classList.add('hidden');
  if (!user) {
    document.getElementById('admin-denied').classList.remove('hidden');
    document.getElementById('admin-panel').classList.add('hidden');
    document.getElementById('admin-info').textContent = '';
    document.getElementById('nav-auth').innerHTML = '<button class="nav-btn" onclick="location.href=\'index.html\'">Sign In</button>';
    return;
  }

  const role = resolveRole(user.email);
  if (!isModerator(user.email)) {
    document.getElementById('admin-denied').querySelector('.section-hd').textContent = 'Insufficient Clearance';
    document.getElementById('admin-denied').querySelector('p').innerHTML =
      `Your account does not have moderation privileges. Contact the Guild Owner.`;
    const displayLabel = user.displayName || 'Agent';
    document.getElementById('nav-auth').innerHTML = renderUserMenuHTML(displayLabel);
    return;
  }

  // Authorized
  const displayLabel = user.displayName || 'Agent';
  document.getElementById('admin-denied').classList.add('hidden');
  document.getElementById('admin-panel').classList.remove('hidden');
  const clearanceLevel = clearanceLevelForRole(role);
  document.getElementById('admin-info').innerHTML =
    `Logged in as <span style="color:var(--red-b)">${displayLabel}</span> — Clearance: <span style="color:var(--red-b);text-transform:uppercase">${role}</span> (Level ${clearanceLevel})
     <button class="btn btn-sm btn-p" onclick="changeUsername()" style="margin-left:12px; font-size:0.7rem; padding:4px 8px;">✎ Change Username</button>`;
  document.getElementById('nav-auth').innerHTML = renderUserMenuHTML(displayLabel);
  applyTabVisibilityForRole(role);

  const params = new URLSearchParams(window.location.search);
  const editId = params.get('editId');
  const editSlug = params.get('editSlug');
  if (editId && !isModOnlyRole()) {
    activeTab = 'pages';
    document.querySelectorAll('#adm-tabs a').forEach(a => a.classList.remove('on'));
    const pageTabEl = Array.from(document.querySelectorAll('#adm-tabs a')).find(a => a.textContent.includes('Pages'));
    if (pageTabEl) pageTabEl.classList.add('on');
    
    loadTab();
    setTimeout(() => { editPage(editId); }, 300);
  } else if (editSlug && !isModOnlyRole()) {
    activeTab = 'pages';
    document.querySelectorAll('#adm-tabs a').forEach(a => a.classList.remove('on'));
    const pageTabEl = Array.from(document.querySelectorAll('#adm-tabs a')).find(a => a.textContent.includes('Pages'));
    if (pageTabEl) pageTabEl.classList.add('on');

    loadTab();
    setTimeout(async () => {
      const snap = await db.collection('pages').where('slug', '==', editSlug).limit(1).get();
      if (!snap.empty) {
        editPage(snap.docs[0].id);
        return;
      }

      resetPageForm();
      const titleEl = document.getElementById('pf-title');
      const slugEl = document.getElementById('pf-slug');
      const typeEl = document.getElementById('pf-type');
      if (titleEl) titleEl.value = editSlug.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
      if (slugEl) slugEl.value = editSlug;
      if (typeEl) typeEl.value = editSlug.toLowerCase() === 'guide' ? 'Guide' : 'Hub';
      document.getElementById('pf-html').value = editSlug.toLowerCase() === 'guide'
        ? '<div class="page-shell">\n  <header class="page-header">\n    <h1 class="page-title">New Guide</h1>\n    <p class="page-subtitle">Owner Editable Guide</p>\n  </header>\n  <section class="page-section">\n    <h2>Overview</h2>\n    <p>Start editing this guide here.</p>\n  </section>\n</div>'
        : defaultSchemaHTML();
      document.getElementById('pf-css').value = defaultSchemaCSS();
    }, 300);
  } else {
    loadTab();
  }
});

// ── Tab Switching ─────────────────────────────────────────────
function switchTab(tab) {
  if (isModOnlyRole() && tab !== 'submissions') {
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
  if (isModOnlyRole() && activeTab !== 'submissions') {
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
    else if (activeTab === 'users') loadUsers(main);
    else if (activeTab === 'roles') loadRolesManager(main);
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
      document.getElementById('st-db').textContent = 'CONNECTED';
      document.getElementById('st-db').className = 'tag';
    }
  } catch (err) {
    console.warn('Config load failed:', err);
  }
}

async function saveConfig() {
  const categories = document.getElementById('cfg-categories').value.split(',').map(s => s.trim()).filter(Boolean);
  const tags = document.getElementById('cfg-tags').value.split(',').map(s => s.trim()).filter(Boolean);
  
  try {
    await db.collection('config').doc('site').set({ categories, tags });
    alert('System configuration updated successfully.');
  } catch (err) {
    alert('Failed to save config: ' + err.message);
  }
}

async function normalizeAllStoredPageStyles() {
  const btn = document.getElementById('btn-normalize-pages');
  const statusEl = document.getElementById('normalize-status');
  if (!btn || !statusEl) return;

  const ok = confirm('Normalize and re-save CSS colors for all stored pages? This updates existing Firestore page records.');
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
  const newName = prompt('Enter new Username/Display Name:');
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
    <form id="page-form" style="margin-bottom:24px">
      <div class="g2 mb-md">
        <div class="fg"><label class="fl">Title</label><input class="fi" id="pf-title" required /></div>
        <div class="fg"><label class="fl">Type</label>
          <select class="fi" id="pf-type"><option>Anomaly</option><option>Tale</option><option>Artwork</option><option>Hub</option><option>Guide</option></select>
        </div>
      </div>
      <div class="fg"><label class="fl">Tags (comma-separated)</label><input class="fi" id="pf-tags" /></div>
      <div class="g2 mb-md">
        <div class="fg"><label class="fl">HTML Content</label><textarea class="fta" id="pf-html" style="min-height:150px; font-family:monospace;"></textarea></div>
        <div class="fg"><label class="fl">CSS Content (Optional)</label><textarea class="fta" id="pf-css" style="min-height:150px; font-family:monospace;"></textarea></div>
      </div>
      <input type="hidden" id="pf-id" />
      <button type="submit" class="btn btn-p" id="pf-btn">&gt;&gt; Save Page</button>
      <button type="button" class="btn btn-s hidden" id="pf-cancel" onclick="resetPageForm()" style="margin-left:8px">Cancel</button>
    </form>
    <table class="adm-tbl"><thead><tr><th>Title</th><th>Type</th><th>Actions</th></tr></thead><tbody id="pages-tbody"></tbody></table>
  `;
  document.getElementById('page-form').addEventListener('submit', submitPage);
  resetPageForm();
  await refreshPages();
}

async function refreshPages() {
  const tbody = document.getElementById('pages-tbody');
  try {
    const snap = await db.collection('pages').orderBy('createdAt', 'desc').limit(50).get();
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="3" class="tc" style="padding:24px;color:var(--wht-f)">No pages found. Create one above.</td></tr>';
      return;
    }
    tbody.innerHTML = snap.docs.map(d => {
      const p = d.data();
      const guideLocked = isGuideType(p.type) && !canManageGuidePages();
      const editBtn = guideLocked
        ? '<span style="font-size:.7rem;color:var(--wht-f)">Owner-only guide</span>'
        : '<button class="btn btn-sm btn-s" onclick="editPage(\'' + d.id + '\')">Edit</button>';
      const deleteBtn = canDeleteManagedContent() && !guideLocked
        ? '<button class="btn btn-sm btn-d" onclick="deletePage(\'' + d.id + '\')" style="margin-left:4px">Delete</button>'
        : '';
      return `<tr>
        <td>${p.title}</td>
        <td><span class="tag">${p.type}</span></td>
        <td>
          ${editBtn}
          ${deleteBtn}
        </td>
      </tr>`;
    }).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="3" class="tc" style="padding:24px;color:var(--wht-f)">Connect Firebase to manage pages.</td></tr>'; }
}

async function submitPage(e) {
  e.preventDefault();
  const id = document.getElementById('pf-id').value;
  const data = {
    title: document.getElementById('pf-title').value,
    type: document.getElementById('pf-type').value,
    tags: document.getElementById('pf-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    htmlContent: wrapWithDefaultSchema(document.getElementById('pf-html').value),
    cssContent: mergeWithDefaultSchemaCSS(document.getElementById('pf-css').value),
  };
  try {
    if (!id && isGuideType(data.type) && !canManageGuidePages()) {
      alert('Only the Owner can create Guide pages.');
      return;
    }

    if (id) {
      const existingDoc = await db.collection('pages').doc(id).get();
      if (!existingDoc.exists) {
        alert('Page no longer exists.');
        return;
      }

      const existingType = existingDoc.data().type;
      if ((isGuideType(existingType) || isGuideType(data.type)) && !canManageGuidePages()) {
        alert('Only the Owner can edit Guide pages.');
        return;
      }

      await db.collection('pages').doc(id).update({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    } else {
      await db.collection('pages').add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    resetPageForm();
    await refreshPages();
  } catch (err) { alert('Error: ' + err.message); }
}

async function editPage(id) {
  const doc = await db.collection('pages').doc(id).get();
  if (!doc.exists) return;
  const p = doc.data();
  if (isGuideType(p.type) && !canManageGuidePages()) {
    alert('Only the Owner can edit Guide pages.');
    return;
  }
  document.getElementById('pf-id').value = id;
  document.getElementById('pf-title').value = p.title || '';
  document.getElementById('pf-type').value = p.type || 'Anomaly';
  document.getElementById('pf-tags').value = (p.tags || []).join(', ');
  document.getElementById('pf-html').value = p.htmlContent || p.content || '';
  document.getElementById('pf-css').value = p.cssContent || '';
  document.getElementById('pf-btn').textContent = '>> Update Page';
  document.getElementById('pf-cancel').classList.remove('hidden');
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
    alert('Only the Owner can delete Guide pages.');
    return;
  }

  if (!confirm('Delete this page permanently?')) return;
  try { await db.collection('pages').doc(id).delete(); await refreshPages(); }
  catch (err) { alert('Delete failed: ' + err.message); }
}

function resetPageForm() {
  document.getElementById('page-form').reset();
  document.getElementById('pf-id').value = '';
  document.getElementById('pf-html').value = defaultSchemaHTML();
  document.getElementById('pf-css').value = defaultSchemaCSS();
  document.getElementById('pf-btn').textContent = '>> Save Page';
  document.getElementById('pf-cancel').classList.add('hidden');
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
  if (urls.some(url => raw.includes(url))) return raw;

  const gallery = '<div class="page-section uploaded-assets">' +
    '<h2>Uploaded Assets</h2>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">' +
      urls.map((url, idx) =>
        '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none">' +
          '<img src="' + url + '" alt="Uploaded asset ' + (idx + 1) + '" loading="lazy" decoding="async" style="display:block;width:100%;height:180px;object-fit:cover;border:1px solid #3a3a3a;background:#111" />' +
        '</a>'
      ).join('') +
    '</div>' +
  '</div>';

  return raw + gallery;
}

function buildPageDocument(html, css, imageUrls) {
  const raw = (html || '').trim();
  const htmlWithUploads = embedUploadedImagesIfMissing(raw, imageUrls || []);
  const wrapped = htmlWithUploads.includes('class="page-shell"')
    ? htmlWithUploads
    : '<div class="page-shell"><section class="page-section">' + htmlWithUploads + '</section></div>';
  const safeCss = normalizePageCss(css || '');

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>' +
    ':root{--red:#8b0000;--red-b:#cc0000;--red-d:#5c0000;--blk:#000;--blk-s:#0a0a0a;--blk-c:#111;--wht:#fff;--wht-m:#ccc;--font-m:"IBM Plex Mono",monospace;--font-d:"Special Elite",monospace;color-scheme:dark}' +
    '*{margin:0;padding:0;box-sizing:border-box}body{font-family:var(--font-m);line-height:1.7;padding:24px;color:var(--wht-m);background:var(--blk)}img{max-width:100%;height:auto}' +
    '.page-shell{max-width:960px;margin:0 auto;padding:24px}.page-header{padding:24px;border-bottom:2px solid var(--red-d);margin-bottom:24px;background:linear-gradient(180deg,rgba(139,0,0,.1),transparent)}.page-title{font-family:var(--font-d);font-size:2rem;color:var(--wht);text-transform:uppercase;letter-spacing:3px;margin-bottom:8px}.page-subtitle{font-size:.8rem;color:var(--red-b);letter-spacing:2px;text-transform:uppercase}.page-section{margin-bottom:24px;padding:20px;border:1px solid var(--red-d);background:var(--blk-s)}.page-section h2{font-family:var(--font-d);color:var(--wht);text-transform:uppercase;letter-spacing:2px;border-bottom:1px dashed var(--red-d);padding-bottom:8px;margin-bottom:12px}' +
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
  await refreshSubmissions('pending');
}

let currentSubFilter = 'pending';

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
      .filter(entry => !status || status === 'all' || entry.data.status === status)
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
      const showEmail = isOwner(auth.currentUser?.email) ? (s.authorEmail || '[Not Set]') : '[Redacted]';
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
            <dt>Email</dt><dd>${isOwner(auth.currentUser?.email) ? (s.authorEmail || '[Not Set]') : '[Redacted]'}</dd>
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

async function approveSubmission(id) {
  if (!canModerateSubmissions()) {
    alert('Moderator access is required to approve submissions.');
    return;
  }
  if (!confirm('Approve this submission and publish it to the site?')) return;

  try {
    const doc = await db.collection('submissions').doc(id).get();
    if (!doc.exists) { alert('Submission not found.'); return; }
    const s = doc.data();
    if (isGuideType(s.type) && !canManageGuidePages()) {
      alert('Only the Owner can approve Guide submissions.');
      return;
    }
    const reviewer = auth.currentUser;

    // Generate slug if not present
    const slug = s.slug || s.title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 80);

    // Create page from submission
    const pageData = {
      title: s.title,
      type: s.type,
      tags: s.tags || [],
      slug: slug,
      content: s.title, // basic content field for backward compat
      htmlContent: wrapWithDefaultSchema(s.htmlContent),
      cssContent: mergeWithDefaultSchemaCSS(s.cssContent || ''),
      imageUrls: s.imageUrls || [],
      authorUid: s.authorUid,
      authorEmail: s.authorEmail,
      authorName: s.authorName || '',
      approvedBy: reviewer ? (reviewer.displayName || 'Admin') : 'Admin',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: s.submittedAt || firebase.firestore.FieldValue.serverTimestamp(),
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

function showRejectForm(id) {
  const reason = prompt('Enter rejection reason (optional):');
  if (reason === null) return; // cancelled
  rejectSubmission(id, reason);
}

async function rejectSubmission(id, reason) {
  if (!canModerateSubmissions()) {
    alert('Moderator access is required to reject submissions.');
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
  if (!confirm('Remove this artwork?')) return;
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
  if (!confirm('Delete this news item?')) return;
  try { await db.collection('news').doc(id).delete(); await refreshNews(); }
  catch (err) { alert('Error: ' + err.message); }
}

// ═════════════════════════════════════════════════════════════
// USERS (OWNER ONLY)
// ═════════════════════════════════════════════════════════════

async function loadUsers(container) {
  container.innerHTML = `
    <h3 style="margin-bottom:16px">Registered Users</h3>
    <p style="font-size:.8rem;color:var(--wht-d);margin-bottom:16px">All accounts that have signed into the Guild. Owners may see email addresses; Admins see [Redacted]. Manage admin access in the Roles tab.</p>
    <table class="adm-tbl"><thead><tr><th>Display Name</th><th>Email</th><th>Role</th><th>Last Login</th></tr></thead><tbody id="users-tbody"></tbody></table>
  `;
  await refreshUsers();
}

async function refreshUsers() {
  const tbody = document.getElementById('users-tbody');
  try {
    const snap = await db.collection('users').get();
    if (snap.empty) { tbody.innerHTML = '<tr><td colspan="3" class="tc" style="padding:24px;color:var(--wht-f)">No users found.</td></tr>'; return; }
    tbody.innerHTML = snap.docs.map(d => {
      const u = d.data();
      const showEmail = isOwner(auth.currentUser?.email) ? (u.email || '[Not Set]') : '[Redacted]';
      return `<tr><td>${u.displayName || 'Unknown Agent'}</td><td style="font-family:monospace;color:var(--wht-d)">${showEmail}</td><td><span class="tag">${u.role}</span></td><td style="font-size:.75rem;color:var(--wht-d)">${u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : '—'}</td></tr>`;
    }).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="3" class="tc" style="padding:24px;color:var(--wht-f)">Connect Firebase.</td></tr>'; }
}

// ═════════════════════════════════════════════════════════════
// ROLES MANAGEMENT (OWNER ONLY)
// ═════════════════════════════════════════════════════════════

async function loadRolesManager(container) {
  const user = auth.currentUser;
  if (!isOwner(user?.email)) {
    container.innerHTML = '<p style="color:var(--red-b)">⚠ Roles management requires Owner clearance.</p>';
    return;
  }
  container.innerHTML = `
    <h3 style="margin-bottom:16px">Roles Management (Owner Only)</h3>
    <p style="font-size:.8rem;color:var(--wht-d);margin-bottom:24px">Assign Moderator or Admin access. Changes take effect on next login. Roles are stored in Firebase config.</p>
    <div style="margin-bottom:24px;border:1px solid var(--wht-f);padding:16px">
      <h4 style="margin-bottom:12px;color:var(--red-b)">Add Staff Role</h4>
      <div style="display:flex;gap:8px;align-items:center">
        <input class="fi" id="role-email" placeholder="email@example.com" style="flex:1" />
        <select class="fi" id="role-kind" style="max-width:180px">
          <option value="mod">Moderator (Level 5)</option>
          <option value="admin">Admin (Level 6)</option>
        </select>
        <button class="btn btn-p" onclick="addStaffRole()">+ Add Role</button>
      </div>
    </div>
    <h4 style="margin-bottom:8px">Current Moderators</h4>
    <div id="mods-list" style="margin-bottom:24px"></div>
    <h4 style="margin-bottom:8px">Current Admins</h4>
    <div id="roles-list" style="margin-bottom:24px"></div>
    <h4 style="margin-bottom:8px;color:var(--wht-d)">Owners (Bootstrap — cannot be changed here)</h4>
    <div id="owners-list"></div>
  `;
  await refreshRolesDisplay();
}

async function refreshRolesDisplay() {
  const modsList = document.getElementById('mods-list');
  const adminsList = document.getElementById('roles-list');
  const ownersList = document.getElementById('owners-list');
  if (!modsList || !adminsList || !ownersList) return;

  // Refresh from Firestore
  try {
    const doc = await db.collection('config').doc('roles').get();
    if (doc.exists) {
      const d = doc.data();
      ROLE_DATA.owners = (d.owners || []).map(e => e.toLowerCase());
      ROLE_DATA.admins = (d.admins || []).map(e => e.toLowerCase());
      ROLE_DATA.mods = (d.mods || []).map(e => e.toLowerCase());
    }
  } catch(e) { /* keep cached */ }

  if (ROLE_DATA.mods.length === 0) {
    modsList.innerHTML = '<p style="color:var(--wht-f);font-size:.85rem;padding:8px 0">No moderators assigned yet.</p>';
  } else {
    modsList.innerHTML = ROLE_DATA.mods.map(email => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--wht-f);margin-bottom:4px;font-family:monospace;font-size:.85rem">
        <span>${email}</span>
        <button class="btn btn-sm btn-d" onclick="removeStaffRole('mod','${email}')">Revoke</button>
      </div>
    `).join('');
  }

  if (ROLE_DATA.admins.length === 0) {
    adminsList.innerHTML = '<p style="color:var(--wht-f);font-size:.85rem;padding:8px 0">No admins assigned yet.</p>';
  } else {
    adminsList.innerHTML = ROLE_DATA.admins.map(email => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--wht-f);margin-bottom:4px;font-family:monospace;font-size:.85rem">
        <span>${email}</span>
        <button class="btn btn-sm btn-d" onclick="removeStaffRole('admin','${email}')">Revoke</button>
      </div>
    `).join('');
  }

  ownersList.innerHTML = ROLE_DATA.owners.map(email => `
    <div style="padding:8px 12px;border:1px solid var(--red-b);margin-bottom:4px;font-family:monospace;font-size:.85rem;color:var(--red-b)">
      ${email} <span style="color:var(--wht-d)">(owner)</span>
    </div>
  `).join('');
}

async function addStaffRole() {
  const input = document.getElementById('role-email');
  const kindInput = document.getElementById('role-kind');
  const email = (input.value || '').trim().toLowerCase();
  const kind = (kindInput && kindInput.value) || 'mod';
  if (!email || !email.includes('@')) { alert('Enter a valid email address.'); return; }
  if (ROLE_DATA.owners.includes(email)) { alert('This email is already an Owner.'); return; }

  if (kind === 'admin' && ROLE_DATA.admins.includes(email)) { alert('This email is already an Admin.'); return; }
  if (kind === 'mod' && ROLE_DATA.mods.includes(email)) { alert('This email is already a Moderator.'); return; }

  try {
    if (kind === 'admin') {
      ROLE_DATA.admins = ROLE_DATA.admins.filter(e => e !== email);
      ROLE_DATA.mods = ROLE_DATA.mods.filter(e => e !== email);
      ROLE_DATA.admins.push(email);
    } else {
      ROLE_DATA.admins = ROLE_DATA.admins.filter(e => e !== email);
      ROLE_DATA.mods = ROLE_DATA.mods.filter(e => e !== email);
      ROLE_DATA.mods.push(email);
    }

    await db.collection('config').doc('roles').set({
      owners: ROLE_DATA.owners,
      admins: ROLE_DATA.admins,
      mods: ROLE_DATA.mods
    });

    input.value = '';
    alert((kind === 'admin' ? 'Admin' : 'Moderator') + ' access granted to ' + email);
    await refreshRolesDisplay();
  } catch (err) {
    alert('Failed to add role: ' + err.message);
  }
}

async function removeStaffRole(kind, email) {
  if (!confirm('Revoke ' + (kind === 'admin' ? 'admin' : 'moderator') + ' access for ' + email + '?')) return;
  try {
    if (kind === 'admin') ROLE_DATA.admins = ROLE_DATA.admins.filter(e => e !== email);
    else ROLE_DATA.mods = ROLE_DATA.mods.filter(e => e !== email);

    await db.collection('config').doc('roles').set({
      owners: ROLE_DATA.owners,
      admins: ROLE_DATA.admins,
      mods: ROLE_DATA.mods
    });
    alert((kind === 'admin' ? 'Admin' : 'Moderator') + ' access revoked for ' + email);
    await refreshRolesDisplay();
  } catch (err) {
    alert('Failed to remove role: ' + err.message);
  }
}
