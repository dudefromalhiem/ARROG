/**
 * Unified role ladder and permissions for Red Oaker Guild.
 * Public ladder ends at chief_admin. owner is internal-only and absolute.
 */

const ROLES = {
  USER: 'user',
  CONTRIBUTOR: 'contributor',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
  CHIEF_ADMIN: 'chief_admin',
  OWNER: 'owner'
};

const PUBLIC_ROLE_LADDER = [
  ROLES.USER,
  ROLES.CONTRIBUTOR,
  ROLES.MODERATOR,
  ROLES.ADMIN,
  ROLES.CHIEF_ADMIN
];

const ALL_ROLES = [...PUBLIC_ROLE_LADDER, ROLES.OWNER];

const ROLE_LABELS = {
  [ROLES.USER]: 'User',
  [ROLES.CONTRIBUTOR]: 'Contributor',
  [ROLES.MODERATOR]: 'Moderator',
  [ROLES.ADMIN]: 'Admin',
  [ROLES.CHIEF_ADMIN]: 'Chief Admin',
  [ROLES.OWNER]: 'Owner'
};

const PERMISSIONS = {
  viewContent: { role: ROLES.USER, description: 'View public content' },
  comment: { role: ROLES.USER, description: 'Post comments and interact with content' },
  interact: { role: ROLES.USER, description: 'Like, share, and engage with content' },

  createPages: { role: ROLES.CONTRIBUTOR, description: 'Create and submit content' },
  editOwnPages: { role: ROLES.CONTRIBUTOR, description: 'Edit own content' },

  reviewSubmissions: { role: ROLES.MODERATOR, description: 'Review submissions in moderation queue' },
  moderateContent: { role: ROLES.MODERATOR, description: 'Moderate content and enforce rules' },
  handleReports: { role: ROLES.MODERATOR, description: 'Handle reports in limited scope' },
  revokeContributor: { role: ROLES.MODERATOR, description: 'Revoke contributor role' },

  manageApplications: { role: ROLES.ADMIN, description: 'Approve or reject role applications' },
  manageUsers: { role: ROLES.ADMIN, description: 'Manage users within policy limits' },
  manageReports: { role: ROLES.ADMIN, description: 'Manage reports and escalations' },

  overrideAdminDecisions: { role: ROLES.CHIEF_ADMIN, description: 'Override admin decisions' },
  manageHighLevelRoles: { role: ROLES.CHIEF_ADMIN, description: 'Manage all non-owner roles' },
  systemAdmin: { role: ROLES.CHIEF_ADMIN, description: 'System administration and moderation control' }
};

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (!role) return ROLES.USER;
  if (role === 'editor') return ROLES.CONTRIBUTOR;
  if (role === 'mod') return ROLES.MODERATOR;
  if (role === 'chief-admin' || role === 'chiefadmin') return ROLES.CHIEF_ADMIN;
  return ALL_ROLES.includes(role) ? role : ROLES.USER;
}

function roleRank(role) {
  const normalized = normalizeRole(role);
  if (normalized === ROLES.OWNER) return 999;
  const idx = PUBLIC_ROLE_LADDER.indexOf(normalized);
  return idx === -1 ? 0 : idx;
}

function isAtLeast(userRole, requiredRole) {
  const a = roleRank(userRole);
  const b = roleRank(requiredRole);
  return a >= b;
}

/**
 * Get the effective permissions for a user based on their role level
 * @param {Object} userDoc - Firestore user document
 * @returns {Object} - Object with permission keys set to true/false
 */
function getPermissions(userDoc) {
  const role = userDoc && userDoc.isOwner ? ROLES.OWNER : normalizeRole(userDoc && userDoc.role);
  const permissions = {};
  Object.keys(PERMISSIONS).forEach(permKey => {
    if (isAtLeast(role, PERMISSIONS[permKey].role)) {
      permissions[permKey] = true;
    }
  });
  return permissions;
}

/**
 * Get permissions for a specific level
 * @param {number} level - Permission level (2-6)
 * @returns {Object} - Object with permission keys set to true
 */
function getPermissionsForLevel(level) {
  const permissions = {};

  const legacyMap = {
    2: ROLES.USER,
    3: ROLES.USER,
    4: ROLES.CONTRIBUTOR,
    5: ROLES.MODERATOR,
    6: ROLES.ADMIN
  };
  const role = legacyMap[Number(level)] || ROLES.USER;
  Object.keys(PERMISSIONS).forEach(permKey => {
    if (isAtLeast(role, PERMISSIONS[permKey].role)) {
      permissions[permKey] = true;
    }
  });

  return permissions;
}

/**
 * Get all permissions (for Owner)
 * @returns {Object} - Object with all permission keys set to true
 */
function getAllPermissions() {
  const permissions = {};
  Object.keys(PERMISSIONS).forEach(permKey => {
    permissions[permKey] = true;
  });
  return permissions;
}

/**
 * Check if a user has a specific permission
 * @param {Object} userDoc - Firestore user document
 * @param {string} permission - Permission key to check
 * @returns {boolean} - True if user has the permission
 */
function hasPermission(userDoc, permission) {
  const permissions = getPermissions(userDoc);
  return permissions[permission] === true;
}

/**
 * Get the display name for a user's role
 * @param {Object} userDoc - Firestore user document
 * @returns {string} - Human-readable role name
 */
function getRoleDisplayName(userDoc) {
  if (!userDoc) return ROLE_LABELS[ROLES.USER];
  const role = userDoc.isOwner ? ROLES.OWNER : normalizeRole(userDoc.role);
  return userDoc.roleName || ROLE_LABELS[role] || 'User';
}

/**
 * Get the role hierarchy as a formatted string for display
 * @returns {string} - Formatted hierarchy string
 */
function getRoleHierarchyText() {
  return 'Role Hierarchy (low to high): User -> Contributor -> Moderator -> Admin -> Chief Admin. Owner is internal-only and unrestricted.';
}

/**
 * Validate if a role level is valid
 * @param {number} level - Level to validate
 * @returns {boolean} - True if valid
 */
function isValidRoleLevel(level) {
  return typeof level === 'number' && level >= 2 && level <= 6;
}

/**
 * Get all valid role names for a level
 * @param {number} level - Role level
 * @returns {Array<string>} - Array of valid role names
 */
function getValidRoleNames(level) {
  if (level === 6) return [ROLE_LABELS[ROLES.ADMIN], ROLE_LABELS[ROLES.CHIEF_ADMIN]];
  if (level === 5) return [ROLE_LABELS[ROLES.MODERATOR]];
  if (level === 4) return [ROLE_LABELS[ROLES.CONTRIBUTOR]];
  if (level <= 3) return [ROLE_LABELS[ROLES.USER]];
  return [];
}

function canApplyForRole(role) {
  const normalized = normalizeRole(role);
  return PUBLIC_ROLE_LADDER.includes(normalized) && normalized !== ROLES.USER;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ROLES,
    PUBLIC_ROLE_LADDER,
    ALL_ROLES,
    ROLE_LABELS,
    PERMISSIONS,
    normalizeRole,
    roleRank,
    isAtLeast,
    getPermissions,
    getPermissionsForLevel,
    getAllPermissions,
    hasPermission,
    getRoleDisplayName,
    getRoleHierarchyText,
    isValidRoleLevel,
    getValidRoleNames,
    canApplyForRole
  };
}