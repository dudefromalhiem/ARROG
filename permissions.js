/**
 * Role-Based Permission System for Red Oak Guild
 * Stack-based permissions with explicit Moderator exception
 */

const ROLE_HIERARCHY = {
  2: { name: 'Guest', roles: ['Guest'] },
  3: { name: 'User', roles: ['Registered User'] },
  4: { name: 'Contributor', roles: ['Contributor'] },
  5: { name: 'Moderator', roles: ['Junior Moderator', 'Moderator', 'Senior Moderator', 'Deputy Chief of Moderation', 'Chief of Moderation'] },
  6: { name: 'Admin', roles: ['Administrator', 'Senior Administrator', 'Deputy Chief Administrator', 'Chief Administrator'] }
};

const PERMISSIONS = {
  // Level 2 (Guest)
  viewContent: { level: 2, description: 'View public content' },

  // Level 3 (User) - inherits Level 2
  comment: { level: 3, description: 'Post comments and interact with content' },
  interact: { level: 3, description: 'Like, share, and engage with content' },

  // Level 4 (Contributor) - inherits Level 3, but Moderators don't inherit this
  createPages: { level: 4, description: 'Create new pages and content' },
  editOwnPages: { level: 4, description: 'Edit pages they created' },

  // Level 5 (Moderator) - inherits Level 3, NOT Level 4
  monitorActivity: { level: 5, description: 'Monitor user activity and reports' },
  handleViolations: { level: 5, description: 'Review and handle reported violations' },
  moderateUsers: { level: 5, description: 'Moderate user accounts and content' },
  moderateContent: { level: 5, description: 'Delete, hide, or modify inappropriate content' },

  // Level 6 (Admin) - inherits ALL (including Level 4)
  manageUsers: { level: 6, description: 'Create, modify, and delete user accounts' },
  manageRoles: { level: 6, description: 'Assign and modify user roles and permissions' },
  manageContent: { level: 6, description: 'Full content management and system administration' },
  systemAdmin: { level: 6, description: 'System configuration and maintenance' }
};

/**
 * Get the effective permissions for a user based on their role level
 * @param {Object} userDoc - Firestore user document
 * @returns {Object} - Object with permission keys set to true/false
 */
function getPermissions(userDoc) {
  if (!userDoc) {
    // Unauthenticated user - only guest permissions
    return getPermissionsForLevel(2);
  }

  const level = userDoc.level || 2;
  const isOwner = userDoc.isOwner === true;
  const contributorGranted = userDoc.contributorGranted === true;

  // Owner has all permissions
  if (isOwner) {
    return getAllPermissions();
  }

  let permissions = {};

  // Stack permissions based on level
  if (level >= 2) permissions = { ...permissions, ...getPermissionsForLevel(2) };
  if (level >= 3) permissions = { ...permissions, ...getPermissionsForLevel(3) };

  // Special handling for Level 4 (Contributor)
  // Moderators (Level 5) do NOT inherit Level 4 permissions unless explicitly granted
  if (level === 4 || level === 6 || (level === 5 && contributorGranted)) {
    permissions = { ...permissions, ...getPermissionsForLevel(4) };
  }

  if (level >= 5) permissions = { ...permissions, ...getPermissionsForLevel(5) };
  if (level >= 6) permissions = { ...permissions, ...getPermissionsForLevel(6) };

  return permissions;
}

/**
 * Get permissions for a specific level
 * @param {number} level - Permission level (2-6)
 * @returns {Object} - Object with permission keys set to true
 */
function getPermissionsForLevel(level) {
  const permissions = {};

  Object.keys(PERMISSIONS).forEach(permKey => {
    if (PERMISSIONS[permKey].level <= level) {
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
  if (!userDoc) return 'Guest';

  if (userDoc.isOwner) return 'Owner';

  const level = userDoc.level || 2;
  const roleName = userDoc.roleName || '';

  // If they have a specific role name, use it
  if (roleName) return roleName;

  // Otherwise use the level name
  const hierarchy = ROLE_HIERARCHY[level];
  return hierarchy ? hierarchy.name : 'Unknown';
}

/**
 * Get the role hierarchy as a formatted string for display
 * @returns {string} - Formatted hierarchy string
 */
function getRoleHierarchyText() {
  return `Role Hierarchy (low → high):

Level 2: Guest - View content only
Level 3: User - View + comment + interact with content
Level 4: Contributor - Level 3 + create/edit pages (no user authority)
Level 5: Moderator - Level 3 + monitor activity + handle violations + moderate users/content (NO Level 4)
Level 6: Admin - ALL permissions + manage users, roles, content, system structure
Owner: Absolute control above Level 6`;
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
  const hierarchy = ROLE_HIERARCHY[level];
  return hierarchy ? hierarchy.roles : [];
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ROLE_HIERARCHY,
    PERMISSIONS,
    getPermissions,
    getPermissionsForLevel,
    getAllPermissions,
    hasPermission,
    getRoleDisplayName,
    getRoleHierarchyText,
    isValidRoleLevel,
    getValidRoleNames
  };
}