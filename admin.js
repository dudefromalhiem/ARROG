/* ═══════════════════════════════════════════════════════════════
 *  ADMIN.JS — Admin dashboard logic
 *  Full CRUD for Pages, Artworks, News + Owner-only User mgmt
 * ═══════════════════════════════════════════════════════════════ */

let activeTab = 'pages';

// ── Auth Gate ─────────────────────────────────────────────────
auth.onAuthStateChanged(async user => {
  await rolesReady;
  if (!user) {
    document.getElementById('admin-denied').classList.remove('hidden');
    document.getElementById('admin-panel').classList.add('hidden');
    document.getElementById('admin-info').textContent = '';
    document.getElementById('nav-auth').innerHTML = '<button class="nav-btn" onclick="location.href=\'index.html\'">Sign In</button>';
    return;
  }

  const role = resolveRole(user.email);
  if (!isAdmin(user.email)) {
    document.getElementById('admin-denied').querySelector('.section-hd').textContent = 'Insufficient Clearance';
    document.getElementById('admin-denied').querySelector('p').innerHTML =
      `Your account does not have Admin privileges. Contact the Guild Owner.`;
    const displayLabel = user.displayName || 'Agent';
    document.getElementById('nav-auth').innerHTML = `<button class="nav-btn" onclick="auth.signOut()">${displayLabel} (Sign Out)</button>`;
    return;
  }

  // Authorized
  const displayLabel = user.displayName || 'Agent';
  document.getElementById('admin-denied').classList.add('hidden');
  document.getElementById('admin-panel').classList.remove('hidden');
  document.getElementById('admin-info').innerHTML =
    `Logged in as <span style="color:var(--red-b)">${displayLabel}</span> — Clearance: <span style="color:var(--red-b);text-transform:uppercase">${role}</span>
     <button class="btn btn-sm btn-p" onclick="changeUsername()" style="margin-left:12px; font-size:0.7rem; padding:4px 8px;">✎ Change Username</button>`;
  document.getElementById('nav-auth').innerHTML = `<button class="nav-btn" onclick="auth.signOut()">${displayLabel} (Sign Out)</button>`;

  if (isOwner(user.email)) {
    document.getElementById('tab-users').classList.remove('hidden');
    document.getElementById('tab-roles').classList.remove('hidden');
  }

  const params = new URLSearchParams(window.location.search);
  const editId = params.get('editId');
  if (editId) {
    activeTab = 'pages';
    document.querySelectorAll('#adm-tabs a').forEach(a => a.classList.remove('on'));
    const pageTabEl = Array.from(document.querySelectorAll('#adm-tabs a')).find(a => a.textContent.includes('Pages'));
    if (pageTabEl) pageTabEl.classList.add('on');
    
    loadTab();
    setTimeout(() => { editPage(editId); }, 300);
  } else {
    loadTab();
  }
});

// ── Tab Switching ─────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('#adm-tabs a').forEach(a => a.classList.remove('on'));
  event.target.classList.add('on');
  
  // Clear any editId from url so refreshing doesn't keep locking into edit
  window.history.replaceState({}, document.title, window.location.pathname);
  
  loadTab();
}

function loadTab() {
  const main = document.getElementById('adm-main');
  if (activeTab === 'pages') loadPages(main);
  else if (activeTab === 'submissions') loadSubmissions(main);
  else if (activeTab === 'artworks') loadArtworks(main);
  else if (activeTab === 'news') loadNewsAdmin(main);
  else if (activeTab === 'users') loadUsers(main);
  else if (activeTab === 'roles') loadRolesManager(main);
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
      return `<tr>
        <td>${p.title}</td>
        <td><span class="tag">${p.type}</span></td>
        <td>
          <button class="btn btn-sm btn-s" onclick="editPage('${d.id}')">Edit</button>
          <button class="btn btn-sm btn-d" onclick="deletePage('${d.id}')" style="margin-left:4px">Delete</button>
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
    htmlContent: document.getElementById('pf-html').value,
    cssContent: document.getElementById('pf-css').value,
  };
  try {
    if (id) { await db.collection('pages').doc(id).update({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); }
    else { await db.collection('pages').add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); }
    resetPageForm();
    await refreshPages();
  } catch (err) { alert('Error: ' + err.message); }
}

async function editPage(id) {
  const doc = await db.collection('pages').doc(id).get();
  if (!doc.exists) return;
  const p = doc.data();
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
  if (!confirm('Delete this page permanently?')) return;
  try { await db.collection('pages').doc(id).delete(); await refreshPages(); }
  catch (err) { alert('Delete failed: ' + err.message); }
}

function resetPageForm() {
  document.getElementById('page-form').reset();
  document.getElementById('pf-id').value = '';
  document.getElementById('pf-btn').textContent = '>> Save Page';
  document.getElementById('pf-cancel').classList.add('hidden');
}

// ═════════════════════════════════════════════════════════════
// SUBMISSIONS REVIEW (Admin)
// ═════════════════════════════════════════════════════════════

async function loadSubmissions(container) {
  container.innerHTML = `
    <h3 style="margin-bottom:16px">Submission Review Queue</h3>
    <p style="font-size:.8rem;color:var(--wht-d);margin-bottom:16px">Review user-submitted pages. Approved pages are published to the site. Rejected pages are returned to the author with feedback.</p>
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
    let query = db.collection('submissions').orderBy('submittedAt', 'desc').limit(50);
    if (status && status !== 'all') {
      query = db.collection('submissions').where('status', '==', status).orderBy('submittedAt', 'desc').limit(50);
    }
    const snap = await query.get();
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="5" class="tc" style="padding:24px;color:var(--wht-f)">No ' + (status === 'all' ? '' : status + ' ') + 'submissions found.</td></tr>';
      return;
    }
    tbody.innerHTML = snap.docs.map(d => {
      const s = d.data();
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
      return `<tr>
        <td>${s.title}</td>
        <td style="font-size:.75rem;color:var(--wht-d)">${s.authorName || 'Unknown Agent'}</td>
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
          <dl>
            <dt>Author</dt><dd>${s.authorName || 'Unknown Agent'}</dd>
            <dt>Type</dt><dd>${s.type}</dd>
            <dt>Tags</dt><dd>${(s.tags || []).join(', ') || 'None'}</dd>
            <dt>Status</dt><dd><span class="status status-${s.status}">${s.status}</span></dd>
            <dt>Submitted</dt><dd>${date}</dd>
            <dt>Images</dt><dd>${(s.imageUrls || []).length} uploaded</dd>
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
    const htmlDoc = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.7;padding:24px;color:#222;background:#fff}img{max-width:100%;height:auto}' + (s.cssContent || '').replace(/<\/style>/gi, '') + '</style></head><body>' + (s.htmlContent || '') + '</body></html>';
    frame.srcdoc = htmlDoc;

  } catch (err) {
    alert('Error loading preview: ' + err.message);
  }
}

function closeReviewModal() {
  const modal = document.getElementById('review-modal');
  if (modal) modal.remove();
}

async function approveSubmission(id) {
  if (!confirm('Approve this submission and publish it to the site?')) return;

  try {
    const doc = await db.collection('submissions').doc(id).get();
    if (!doc.exists) { alert('Submission not found.'); return; }
    const s = doc.data();
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
      htmlContent: s.htmlContent,
      cssContent: s.cssContent || '',
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
      <div class="fg"><label style="font-size:.8rem;color:var(--wht-d);cursor:pointer"><input type="checkbox" id="af-spot" checked style="margin-right:8px" /> Display in Art Spotlight</label></div>
      <input type="hidden" id="af-id" />
      <button type="submit" class="btn btn-p" id="af-btn">&gt;&gt; Add Artwork</button>
    </form>
    <table class="adm-tbl"><thead><tr><th>Title</th><th>Spotlight</th><th>Actions</th></tr></thead><tbody id="art-tbody"></tbody></table>
  `;
  document.getElementById('art-form').addEventListener('submit', submitArt);
  await refreshArt();
}

async function refreshArt() {
  const tbody = document.getElementById('art-tbody');
  try {
    const snap = await db.collection('artworks').get();
    if (snap.empty) { tbody.innerHTML = '<tr><td colspan="3" class="tc" style="padding:24px;color:var(--wht-f)">No artworks found.</td></tr>'; return; }
    tbody.innerHTML = snap.docs.map(d => {
      const a = d.data();
      return `<tr><td>${a.title}</td><td>${a.displayInSpotlight ? '✓' : '—'}</td><td>
        <button class="btn btn-sm btn-s" onclick="editArt('${d.id}')">Edit</button>
        <button class="btn btn-sm btn-d" onclick="deleteArt('${d.id}')" style="margin-left:4px">Delete</button>
      </td></tr>`;
    }).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="3" class="tc" style="padding:24px;color:var(--wht-f)">Connect Firebase.</td></tr>'; }
}

async function submitArt(e) {
  e.preventDefault();
  const id = document.getElementById('af-id').value;
  const data = { title: document.getElementById('af-title').value, imageUrl: document.getElementById('af-url').value, displayInSpotlight: document.getElementById('af-spot').checked };
  try {
    if (id) await db.collection('artworks').doc(id).update(data);
    else await db.collection('artworks').add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    document.getElementById('art-form').reset(); document.getElementById('af-id').value = '';
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
  document.getElementById('af-spot').checked = !!a.displayInSpotlight;
  document.getElementById('af-btn').textContent = '>> Update Artwork';
}

async function deleteArt(id) {
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
      <div class="fg"><label class="fl">Body</label><textarea class="fta" id="nf-body"></textarea></div>
      <input type="hidden" id="nf-id" />
      <button type="submit" class="btn btn-p" id="nf-btn">&gt;&gt; Publish Article</button>
    </form>
    <table class="adm-tbl"><thead><tr><th>Date</th><th>Title</th><th>Actions</th></tr></thead><tbody id="news-tbody"></tbody></table>
  `;
  document.getElementById('nf-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('news-form').addEventListener('submit', submitNews);
  await refreshNews();
}

async function refreshNews() {
  const tbody = document.getElementById('news-tbody');
  try {
    const snap = await db.collection('news').orderBy('date', 'desc').limit(20).get();
    if (snap.empty) { tbody.innerHTML = '<tr><td colspan="3" class="tc" style="padding:24px;color:var(--wht-f)">No news items.</td></tr>'; return; }
    tbody.innerHTML = snap.docs.map(d => {
      const n = d.data();
      return `<tr><td style="white-space:nowrap">${n.date}</td><td>${n.title}</td><td>
        <button class="btn btn-sm btn-s" onclick="editNews('${d.id}')">Edit</button>
        <button class="btn btn-sm btn-d" onclick="deleteNews('${d.id}')" style="margin-left:4px">Delete</button>
      </td></tr>`;
    }).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="3" class="tc" style="padding:24px;color:var(--wht-f)">Connect Firebase.</td></tr>'; }
}

async function submitNews(e) {
  e.preventDefault();
  const id = document.getElementById('nf-id').value;
  const data = { title: document.getElementById('nf-title').value, body: document.getElementById('nf-body').value, date: document.getElementById('nf-date').value };
  try {
    if (id) await db.collection('news').doc(id).update(data);
    else await db.collection('news').add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    document.getElementById('news-form').reset(); document.getElementById('nf-id').value = '';
    document.getElementById('nf-date').value = new Date().toISOString().split('T')[0];
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
  document.getElementById('nf-btn').textContent = '>> Update Article';
}

async function deleteNews(id) {
  if (!confirm('Delete this news item?')) return;
  try { await db.collection('news').doc(id).delete(); await refreshNews(); }
  catch (err) { alert('Error: ' + err.message); }
}

// ═════════════════════════════════════════════════════════════
// USERS (OWNER ONLY)
// ═════════════════════════════════════════════════════════════

async function loadUsers(container) {
  const user = auth.currentUser;
  if (!isOwner(user?.email)) {
    container.innerHTML = '<p style="color:var(--red-b)">⚠ Role modifications require Owner clearance.</p>';
    return;
  }
  container.innerHTML = `
    <h3 style="margin-bottom:16px">Registered Users</h3>
    <p style="font-size:.8rem;color:var(--wht-d);margin-bottom:16px">All accounts that have signed into the Guild. Manage admin access in the Roles tab.</p>
    <table class="adm-tbl"><thead><tr><th>Display Name</th><th>Role</th><th>Last Login</th></tr></thead><tbody id="users-tbody"></tbody></table>
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
      return `<tr><td>${u.displayName || 'Unknown Agent'}</td><td><span class="tag">${u.role}</span></td><td style="font-size:.75rem;color:var(--wht-d)">${u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : '—'}</td></tr>`;
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
    <p style="font-size:.8rem;color:var(--wht-d);margin-bottom:24px">Add or remove admin access. Changes take effect on next login. Roles are stored securely in Firebase — not in the codebase.</p>
    <div style="margin-bottom:24px;border:1px solid var(--wht-f);padding:16px">
      <h4 style="margin-bottom:12px;color:var(--red-b)">Add New Admin</h4>
      <div style="display:flex;gap:8px;align-items:center">
        <input class="fi" id="role-email" placeholder="email@example.com" style="flex:1" />
        <button class="btn btn-p" onclick="addAdminRole()">+ Add Admin</button>
      </div>
    </div>
    <h4 style="margin-bottom:8px">Current Admins</h4>
    <div id="roles-list" style="margin-bottom:24px"></div>
    <h4 style="margin-bottom:8px;color:var(--wht-d)">Owners (Bootstrap — cannot be changed here)</h4>
    <div id="owners-list"></div>
  `;
  await refreshRolesDisplay();
}

async function refreshRolesDisplay() {
  const adminsList = document.getElementById('roles-list');
  const ownersList = document.getElementById('owners-list');
  if (!adminsList || !ownersList) return;

  // Refresh from Firestore
  try {
    const doc = await db.collection('config').doc('roles').get();
    if (doc.exists) {
      const d = doc.data();
      ROLE_DATA.owners = (d.owners || []).map(e => e.toLowerCase());
      ROLE_DATA.admins = (d.admins || []).map(e => e.toLowerCase());
    }
  } catch(e) { /* keep cached */ }

  if (ROLE_DATA.admins.length === 0) {
    adminsList.innerHTML = '<p style="color:var(--wht-f);font-size:.85rem;padding:8px 0">No admins assigned yet.</p>';
  } else {
    adminsList.innerHTML = ROLE_DATA.admins.map(email => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--wht-f);margin-bottom:4px;font-family:monospace;font-size:.85rem">
        <span>${email}</span>
        <button class="btn btn-sm btn-d" onclick="removeAdminRole('${email}')">Revoke</button>
      </div>
    `).join('');
  }

  ownersList.innerHTML = ROLE_DATA.owners.map(email => `
    <div style="padding:8px 12px;border:1px solid var(--red-b);margin-bottom:4px;font-family:monospace;font-size:.85rem;color:var(--red-b)">
      ${email} <span style="color:var(--wht-d)">(owner)</span>
    </div>
  `).join('');
}

async function addAdminRole() {
  const input = document.getElementById('role-email');
  const email = (input.value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) { alert('Enter a valid email address.'); return; }
  if (ROLE_DATA.owners.includes(email)) { alert('This email is already an Owner.'); return; }
  if (ROLE_DATA.admins.includes(email)) { alert('This email is already an Admin.'); return; }

  try {
    ROLE_DATA.admins.push(email);
    await db.collection('config').doc('roles').set({
      owners: ROLE_DATA.owners,
      admins: ROLE_DATA.admins
    });
    input.value = '';
    alert('Admin access granted to ' + email);
    await refreshRolesDisplay();
  } catch (err) {
    ROLE_DATA.admins = ROLE_DATA.admins.filter(e => e !== email);
    alert('Failed to add admin: ' + err.message);
  }
}

async function removeAdminRole(email) {
  if (!confirm('Revoke admin access for ' + email + '?')) return;
  try {
    ROLE_DATA.admins = ROLE_DATA.admins.filter(e => e !== email);
    await db.collection('config').doc('roles').set({
      owners: ROLE_DATA.owners,
      admins: ROLE_DATA.admins
    });
    alert('Admin access revoked for ' + email);
    await refreshRolesDisplay();
  } catch (err) {
    alert('Failed to remove admin: ' + err.message);
  }
}
