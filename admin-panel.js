// Admin Panel - Role Management UI Logic

let currentUser = null;
let userPermissions = null;
const ROLE_META = typeof window !== 'undefined' ? (window.REDOAK_ROLES || {}) : {};

function getRoleLabel(role) {
  const normalized = typeof normalizeRole === 'function' ? normalizeRole(role) : String(role || '').trim().toLowerCase();
  if (ROLE_META.ROLE_LABELS && ROLE_META.ROLE_LABELS[normalized]) return ROLE_META.ROLE_LABELS[normalized];
  if (typeof getRoleDisplayName === 'function') {
    const display = getRoleDisplayName({ role: normalized });
    if (display) return display;
  }
  if (!normalized) return 'Unassigned';
  return String(normalized).split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function getRoleOptions(type) {
  if (type === 'assignable' && typeof getAssignableRoleOptions === 'function') {
    return getAssignableRoleOptions();
  }
  if (type === 'public' && typeof getPublicRoleOptions === 'function') {
    return getPublicRoleOptions();
  }

  // Include junior roles and order by rank (lower -> higher)
  const roles = type === 'assignable'
    ? ['contributor', 'junior_moderator', 'moderator', 'senior_moderator', 'deputy_chief_of_moderation', 'chief_of_moderation', 'junior_admin', 'administrator', 'senior_administrator', 'deputy_chief_administrator', 'chief_administrator']
    : ['newbie', 'site_member', 'contributor', 'junior_moderator', 'moderator', 'senior_moderator', 'deputy_chief_of_moderation', 'chief_of_moderation', 'junior_admin', 'administrator', 'senior_administrator', 'deputy_chief_administrator', 'chief_administrator'];

  return roles.map(value => ({ value, label: getRoleLabel(value) }));
}

function populateSelect(selectId, options, placeholder) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>` + options.map(option => `<option value="${option.value}">${option.label}</option>`).join('');
  if (currentValue) select.value = currentValue;
}

function initializeRoleControls() {
  populateSelect('filter-role', getRoleOptions('public'), 'All Roles');
  populateSelect('modal-new-role', getRoleOptions('assignable'), 'Select Role...');
}

// Initialize
async function initAdminPanel() {
  try {
    await firebase.auth().onAuthStateChanged(async user => {
      if (!user) {
        window.location.href = 'index.html';
        return;
      }

      currentUser = user;
      document.getElementById('current-user').textContent = user.email;

      // Check admin permissions
      const tokenResult = await user.getIdTokenResult();
      userPermissions = tokenResult.claims;

      // Verify user can access admin panel
      if (!tokenResult.claims.admin_user) {
        showAlert('error', 'You do not have admin access');
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
      }

      initializeRoleControls();

      // Load initial data
      loadUsers();
      loadApplications();
      loadAuditLogs();
    });
  } catch (err) {
    showAlert('error', 'Failed to initialize admin panel: ' + err.message);
  }
}

// UI Tab Switching
function switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));

  // Show selected tab
  document.getElementById(tabName).classList.add('active');
  event.target.classList.add('active');
}

// Alert Management
function showAlert(type, message) {
  const alertEl = document.getElementById(`alert-${type}`);
  alertEl.textContent = message;
  alertEl.classList.add('active');
  setTimeout(() => alertEl.classList.remove('active'), 5000);
}

// === USERS & ROLES TAB ===

async function loadUsers() {
  try {
    const token = await currentUser.getIdToken();
    const response = await fetch((window.REDOAK_API && window.REDOAK_API.social ? window.REDOAK_API.social('action=getUsersForAdmin') : '/api/social?action=getUsersForAdmin'), {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch users');
    }

    const data = await response.json();
    renderUsersTable(data.users || []);
    updateUserStats(data.users || []);
  } catch (err) {
    showAlert('error', 'Failed to load users: ' + err.message);
  }
}

async function searchUsers() {
  try {
    const email = document.getElementById('search-email').value;
    const role = document.getElementById('filter-role').value;

    const token = await currentUser.getIdToken();
    const response = await fetch((window.REDOAK_API && window.REDOAK_API.social ? window.REDOAK_API.social('action=searchUsers') : '/api/social?action=searchUsers'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, role })
    });

    if (!response.ok) {
      throw new Error('Search failed');
    }

    const data = await response.json();
    renderUsersTable(data.users || []);
  } catch (err) {
    showAlert('error', 'Search failed: ' + err.message);
  }
}

function resetUserSearch() {
  document.getElementById('search-email').value = '';
  document.getElementById('filter-role').value = '';
  loadUsers();
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-table-body');

  if (!users || users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No users found</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(user => `
    <tr>
      <td>${escapeHtml(user.email)}</td>
      <td><span class="role-badge ${getRoleBadgeClass(user.role)}">${getRoleLabel(user.role)}</span></td>
      <td><span class="status ${user.submissionAccess ? 'approved' : 'pending'}">${user.submissionAccess ? 'Active' : 'Inactive'}</span></td>
      <td>${new Date(user.createdAt?.seconds * 1000).toLocaleDateString()}</td>
      <td>
        <button class="secondary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="openRoleModal('${user.uid}', '${user.email}', '${user.role}', 'promote')">↑ Promote</button>
        ${user.role !== 'newbie' ? `<button class="secondary" style="padding: 6px 12px; font-size: 0.85rem; margin-left: 5px;" onclick="openRoleModal('${user.uid}', '${user.email}', '${user.role}', 'demote')">↓ Demote</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function updateUserStats(users) {
  if (!users) return;

  const normalizedRoles = users.map(user => typeof normalizeRole === 'function' ? normalizeRole(user.role) : String(user.role || '').toLowerCase());

  const stats = {
    total: users.length,
    contributors: normalizedRoles.filter(role => role === 'contributor').length,
    moderators: normalizedRoles.filter(role => role === 'junior_moderator' || role === 'moderator' || role === 'senior_moderator' || role === 'deputy_chief_of_moderation' || role === 'chief_of_moderation').length,
    admins: normalizedRoles.filter(role => role === 'junior_admin' || role === 'administrator' || role === 'senior_administrator' || role === 'deputy_chief_administrator' || role === 'chief_administrator').length
  };

  document.getElementById('stat-total-users').textContent = stats.total;
  document.getElementById('stat-contributors').textContent = stats.contributors;
  document.getElementById('stat-moderators').textContent = stats.moderators;
  document.getElementById('stat-admins').textContent = stats.admins;
}

// === APPLICATIONS TAB ===

async function loadApplications() {
  try {
    const status = document.getElementById('filter-app-status').value;
    const role = document.getElementById('filter-app-role').value;

    const token = await currentUser.getIdToken();
    const response = await fetch((window.REDOAK_API && window.REDOAK_API.social ? window.REDOAK_API.social('action=getApplications') : '/api/social?action=getApplications'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status, role })
    });

    if (!response.ok) {
      throw new Error('Failed to fetch applications');
    }

    const data = await response.json();
    renderApplicationsTable(data.applications || []);
  } catch (err) {
    showAlert('error', 'Failed to load applications: ' + err.message);
  }
}

function renderApplicationsTable(applications) {
  const tbody = document.getElementById('applications-table-body');

  if (!applications || applications.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No applications</td></tr>';
    return;
  }

  tbody.innerHTML = applications.map(app => `
    <tr>
      <td>${escapeHtml(app.applicantEmail)}</td>
      <td><span class="role-badge">${getRoleLabel(app.roleApplied || app.roleAppliedLabel)}</span></td>
      <td><span class="status ${getStatusClass(app.status)}">${app.status}</span></td>
      <td>${new Date(app.submittedAt?.seconds * 1000).toLocaleDateString()}</td>
      <td>
        ${app.status === 'pending' ? `
          <button class="secondary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="viewApplicationDetails('${app.uid}')">📋 Review</button>
        ` : `
          <button class="secondary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="viewApplicationDetails('${app.uid}')">👁 View</button>
        `}
      </td>
    </tr>
  `).join('');
}

async function viewApplicationDetails(uid) {
  // This would open a detailed view of the application
  showAlert('warning', 'Application detail view - coming soon');
}

// === AUDIT LOGS TAB ===

async function loadAuditLogs() {
  try {
    const type = document.getElementById('filter-audit-type').value;
    const actor = document.getElementById('filter-audit-actor').value;
    const daysBack = Number(document.getElementById('filter-audit-days').value);

    const token = await currentUser.getIdToken();
    const response = await fetch((window.REDOAK_API && window.REDOAK_API.admin ? window.REDOAK_API.admin('/audit/logs') : '/api/admin/audit/logs'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type, actorEmail: actor, daysBack, limit: 100 })
    });

    if (!response.ok) {
      throw new Error('Failed to fetch audit logs');
    }

    const data = await response.json();
    renderAuditTable(data.logs || []);
  } catch (err) {
    showAlert('error', 'Failed to load audit logs: ' + err.message);
  }
}

function renderAuditTable(logs) {
  const tbody = document.getElementById('audit-table-body');

  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No audit logs</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(log => `
    <tr>
      <td>${new Date(log.timestamp?.seconds * 1000).toLocaleString()}</td>
      <td><span class="role-badge">${log.type}</span></td>
      <td>${escapeHtml(log.actor?.email || 'system')}</td>
      <td>${escapeHtml(log.target?.email || '-')}</td>
      <td>
        ${log.type === 'role_change' ? `
          ${log.roleChange.from} → ${log.roleChange.to}
        ` : log.reason || '-'}
      </td>
    </tr>
  `).join('');
}

// === ROLE CHANGE MODAL ===

let currentRoleAction = {};

function openRoleModal(uid, email, currentRole, action) {
  currentRoleAction = { uid, email, currentRole, action };

  document.getElementById('modal-title').textContent = action === 'promote' ? '⬆️ Promote User' : '⬇️ Demote User';
  document.getElementById('modal-email').value = email;
  document.getElementById('modal-current-role').value = getRoleLabel(currentRole);
  document.getElementById('modal-new-role').value = '';
  document.getElementById('modal-reason').value = '';
  document.getElementById('modal-action-btn').textContent = action === 'promote' ? 'Promote' : 'Demote';

  document.getElementById('role-modal').classList.add('active');
}

function closeRoleModal() {
  document.getElementById('role-modal').classList.remove('active');
}

async function executeRoleChange() {
  try {
    const newRole = document.getElementById('modal-new-role').value;
    const reason = document.getElementById('modal-reason').value;

    if (!newRole || !reason) {
      showAlert('warning', 'Please fill in all fields');
      return;
    }

    if (reason.length < 10) {
      showAlert('warning', 'Reason must be at least 10 characters');
      return;
    }

    const token = await currentUser.getIdToken();
    const endpoint = currentRoleAction.action === 'promote' ? '/api/admin/roles/promote' : '/api/admin/roles/demote';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        targetUid: currentRoleAction.uid,
        targetEmail: currentRoleAction.email,
        newRole,
        reason
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Operation failed');
    }

    showAlert('success', `${currentRoleAction.action === 'promote' ? 'Promoted' : 'Demoted'} ${currentRoleAction.email} to ${newRole}`);
    closeRoleModal();
    loadUsers();
    loadAuditLogs();
  } catch (err) {
    showAlert('error', err.message);
  }
}

// === UTILITY FUNCTIONS ===

function formatRole(role) {
  return getRoleLabel(role);
}

function getRoleBadgeClass(role) {
  const normalized = typeof normalizeRole === 'function' ? normalizeRole(role) : String(role || '').trim().toLowerCase();
  if (!normalized || normalized === 'newbie' || normalized === 'site_member') return 'badge-newbie';
  if (normalized === 'contributor') return 'contributor';
  if (normalized === 'junior_moderator' || normalized === 'moderator' || normalized === 'senior_moderator' || normalized === 'deputy_chief_of_moderation' || normalized === 'chief_of_moderation') return 'moderator';
  if (normalized === 'junior_admin' || normalized === 'administrator' || normalized === 'senior_administrator' || normalized === 'deputy_chief_administrator' || normalized === 'chief_administrator') return 'administrator';
  if (normalized === 'owner') return 'chief';
  return 'badge-newbie';
}

function getStatusClass(status) {
  const statusLower = String(status || '').toLowerCase();
  if (statusLower === 'pending') return 'pending';
  if (statusLower === 'approved') return 'approved';
  if (statusLower === 'denied') return 'denied';
  return 'pending';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function logout() {
  firebase.auth().signOut().then(() => {
    window.location.href = 'index.html';
  });
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminPanel);
} else {
  initAdminPanel();
}
