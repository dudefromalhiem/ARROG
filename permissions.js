/**
 * Unified role ladder and permissions for Red Oaker Guild.
 * Three-branch system: Member/Contributor, Moderation, Administrative
 * Public ladder ends at chief_administrator. owner is internal-only and absolute.
 */

const ROLES = {
  // Member/Contributor Branch
  NEWBIE: 'newbie',                                    // Level 2
  SITE_MEMBER: 'site_member',                          // Level 3
  CONTRIBUTOR: 'contributor',                          // Level 4 — Entry into active participation

  // Moderation Branch
  MODERATOR: 'moderator',                              // Level 4+ — Frontline enforcement
  SENIOR_MODERATOR: 'senior_moderator',                // Level 5 — Experienced moderation authority
  DEPUTY_CHIEF_OF_MODERATION: 'deputy_chief_of_moderation', // Level 5 — Second-in-command
  CHIEF_OF_MODERATION: 'chief_of_moderation',          // Level 4+ — Head of moderation

  // Administrative Branch
  ADMINISTRATOR: 'administrator',                      // Level 5 — Core operational staff
  SENIOR_ADMINISTRATOR: 'senior_administrator',        // Level 5+ — Oversees major site sections
  DEPUTY_CHIEF_ADMINISTRATOR: 'deputy_chief_administrator', // Level 6 — Second-in-command
  CHIEF_ADMINISTRATOR: 'chief_administrator',          // Level 6 — Highest authority below Owner

  // Owner (internal-only)
  OWNER: 'owner'                                       // Level [REDACTED] — The Archivist
};

// Defines the rank order: determines permissions via isAtLeast()
const PUBLIC_ROLE_LADDER = [
  ROLES.NEWBIE,
  ROLES.SITE_MEMBER,
  ROLES.CONTRIBUTOR,
  ROLES.MODERATOR,
  ROLES.SENIOR_MODERATOR,
  ROLES.ADMINISTRATOR,
  ROLES.SENIOR_ADMINISTRATOR,
  ROLES.DEPUTY_CHIEF_OF_MODERATION,
  ROLES.DEPUTY_CHIEF_ADMINISTRATOR,
  ROLES.CHIEF_OF_MODERATION,
  ROLES.CHIEF_ADMINISTRATOR
];

const ALL_ROLES = [...PUBLIC_ROLE_LADDER, ROLES.OWNER];

const ROLE_LABELS = {
  [ROLES.NEWBIE]: 'Newbie',
  [ROLES.SITE_MEMBER]: 'Site Member',
  [ROLES.CONTRIBUTOR]: 'Contributor',
  [ROLES.MODERATOR]: 'Moderator',
  [ROLES.SENIOR_MODERATOR]: 'Senior Moderator',
  [ROLES.DEPUTY_CHIEF_OF_MODERATION]: 'Deputy Chief of Moderation',
  [ROLES.CHIEF_OF_MODERATION]: 'Chief of Moderation',
  [ROLES.ADMINISTRATOR]: 'Administrator',
  [ROLES.SENIOR_ADMINISTRATOR]: 'Senior Administrator',
  [ROLES.DEPUTY_CHIEF_ADMINISTRATOR]: 'Deputy Chief Administrator',
  [ROLES.CHIEF_ADMINISTRATOR]: 'Chief Administrator',
  [ROLES.OWNER]: 'The Archivist'
};

const PERMISSIONS = {
  // User/Member permissions
  viewContent: { role: ROLES.NEWBIE, description: 'View public content' },
  comment: { role: ROLES.SITE_MEMBER, description: 'Post comments and interact with content' },
  interact: { role: ROLES.SITE_MEMBER, description: 'Like, share, and engage with content' },
  reportContent: { role: ROLES.SITE_MEMBER, description: 'Report inappropriate content' },

  // Contributor permissions
  createPages: { role: ROLES.CONTRIBUTOR, description: 'Create and submit content' },
  editOwnPages: { role: ROLES.CONTRIBUTOR, description: 'Edit own content' },
  editRegistryPages: { role: ROLES.CONTRIBUTOR, description: 'Edit registry pages' },

  // Moderation permissions (Moderator level and above)
  moderateContent: { role: ROLES.MODERATOR, description: 'Remove inappropriate content' },
  warnUsers: { role: ROLES.MODERATOR, description: 'Warn users for violations' },
  handleReports: { role: ROLES.MODERATOR, description: 'Handle and manage reports' },
  escalateIssues: { role: ROLES.MODERATOR, description: 'Escalate serious issues' },
  handleComplexDisputes: { role: ROLES.SENIOR_MODERATOR, description: 'Handle complex disputes' },
  restrictContributors: { role: ROLES.SENIOR_MODERATOR, description: 'Temporarily restrict contributors (up to 2 months)' },
  guideJuniorModerators: { role: ROLES.SENIOR_MODERATOR, description: 'Guide junior moderators' },
  overseeModeratorPerformance: { role: ROLES.DEPUTY_CHIEF_OF_MODERATION, description: 'Oversee moderator performance' },
  promoteModerationStaff: { role: ROLES.CHIEF_OF_MODERATION, description: 'Promote moderation staff' },
  defineEnforcementStandards: { role: ROLES.CHIEF_OF_MODERATION, description: 'Define enforcement standards' },

  // Administrative permissions (Administrator level and above)
  editAndApprovPages: { role: ROLES.ADMINISTRATOR, description: 'Edit and approve pages' },
  manageUsers: { role: ROLES.ADMINISTRATOR, description: 'Manage users (with report logs)' },
  enforcRules: { role: ROLES.ADMINISTRATOR, description: 'Enforce rules alongside moderators' },
  approveMajorChanges: { role: ROLES.SENIOR_ADMINISTRATOR, description: 'Approve major structural changes' },
  superviseAdmins: { role: ROLES.SENIOR_ADMINISTRATOR, description: 'Supervise admins and moderation leadership' },
  banUsers: { role: ROLES.SENIOR_ADMINISTRATOR, description: 'Ban users (with evidence)' },
  demoteAdmins: { role: ROLES.SENIOR_ADMINISTRATOR, description: 'Demote other admins' },
  handleAdminEscalations: { role: ROLES.DEPUTY_CHIEF_ADMINISTRATOR, description: 'Handle escalations and act in place of Chief Admin' },
  removeContributorsIndependently: { role: ROLES.DEPUTY_CHIEF_ADMINISTRATOR, description: 'Remove contributors independently' },
  demoteModerationRanks: { role: ROLES.DEPUTY_CHIEF_ADMINISTRATOR, description: 'Demote moderation ranks below Deputy Chief' },
  promoteUsers: { role: ROLES.DEPUTY_CHIEF_ADMINISTRATOR, description: 'Promote users' },
  finalDisputes: { role: ROLES.CHIEF_ADMINISTRATOR, description: 'Final decisions on disputes and bans' },
  systemWidePolicy: { role: ROLES.CHIEF_ADMINISTRATOR, description: 'System-wide policy control' },
  permissionManagement: { role: ROLES.CHIEF_ADMINISTRATOR, description: 'Permission management' },
  structuralOversight: { role: ROLES.CHIEF_ADMINISTRATOR, description: 'Structural oversight' }
};

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (!role) return ROLES.NEWBIE;
  
  // Legacy mappings for old role names
  if (role === 'user') return ROLES.NEWBIE;
  if (role === 'editor') return ROLES.CONTRIBUTOR;
  if (role === 'mod') return ROLES.MODERATOR;
  if (role === 'junior_moderator') return ROLES.MODERATOR;
  if (role === 'junior-moderator') return ROLES.MODERATOR;
  if (role === 'junior_admin' || role === 'junior-admin') return ROLES.ADMINISTRATOR;
  if (role === 'admin') return ROLES.ADMINISTRATOR;
  if (role === 'chief-admin' || role === 'chiefadmin' || role === 'chief_admin') return ROLES.CHIEF_ADMINISTRATOR;
  
  // All other roles
  return ALL_ROLES.includes(role) ? role : ROLES.NEWBIE;
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
    2: ROLES.NEWBIE,
    3: ROLES.SITE_MEMBER,
    4: ROLES.CONTRIBUTOR,
    5: ROLES.MODERATOR,
    6: ROLES.ADMINISTRATOR
  };
  const role = legacyMap[Number(level)] || ROLES.NEWBIE;
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
  if (!userDoc) return ROLE_LABELS[ROLES.NEWBIE];
  const role = userDoc.isOwner ? ROLES.OWNER : normalizeRole(userDoc.role);
  return userDoc.roleName || ROLE_LABELS[role] || 'User';
}

/**
 * Get the role hierarchy as a formatted string for display
 * @returns {string} - Formatted hierarchy string
 */
function getRoleHierarchyText() {
  return 'Role Hierarchy (low to high): Newbie -> Site Member -> Contributor -> Moderator -> Senior Moderator -> Administrator -> Senior Administrator -> Deputy Chief of Moderation -> Deputy Chief Administrator -> Chief of Moderation -> Chief Administrator. Owner is internal-only and unrestricted.';
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
  if (level === 6) {
    return [
      ROLE_LABELS[ROLES.ADMINISTRATOR],
      ROLE_LABELS[ROLES.SENIOR_ADMINISTRATOR],
      ROLE_LABELS[ROLES.DEPUTY_CHIEF_ADMINISTRATOR],
      ROLE_LABELS[ROLES.CHIEF_ADMINISTRATOR]
    ];
  }
  if (level === 5) {
    return [
      ROLE_LABELS[ROLES.MODERATOR],
      ROLE_LABELS[ROLES.SENIOR_MODERATOR],
      ROLE_LABELS[ROLES.DEPUTY_CHIEF_OF_MODERATION],
      ROLE_LABELS[ROLES.CHIEF_OF_MODERATION]
    ];
  }
  if (level === 4) return [ROLE_LABELS[ROLES.CONTRIBUTOR]];
  if (level <= 3) return [ROLE_LABELS[ROLES.NEWBIE], ROLE_LABELS[ROLES.SITE_MEMBER]];
  return [];
}

function getAssignableRoleOptions() {
  return [
    ROLES.CONTRIBUTOR,
    ROLES.MODERATOR,
    ROLES.SENIOR_MODERATOR,
    ROLES.DEPUTY_CHIEF_OF_MODERATION,
    ROLES.CHIEF_OF_MODERATION,
    ROLES.ADMINISTRATOR,
    ROLES.SENIOR_ADMINISTRATOR,
    ROLES.DEPUTY_CHIEF_ADMINISTRATOR,
    ROLES.CHIEF_ADMINISTRATOR
  ].map(role => ({ value: role, label: ROLE_LABELS[role] || role }));
}

function getPublicRoleOptions() {
  return [ROLES.NEWBIE, ROLES.SITE_MEMBER, ROLES.CONTRIBUTOR, ROLES.MODERATOR, ROLES.SENIOR_MODERATOR, ROLES.DEPUTY_CHIEF_OF_MODERATION, ROLES.CHIEF_OF_MODERATION, ROLES.ADMINISTRATOR, ROLES.SENIOR_ADMINISTRATOR, ROLES.DEPUTY_CHIEF_ADMINISTRATOR, ROLES.CHIEF_ADMINISTRATOR].map(role => ({ value: role, label: ROLE_LABELS[role] || role }));
}

function getApplicationRoleOptions() {
  return [
    { value: ROLES.CONTRIBUTOR, label: 'Contributor' },
    { value: ROLES.MODERATOR, label: 'Junior Moderator' },
    { value: ROLES.ADMINISTRATOR, label: 'Junior Admin' }
  ];
}

function canApplyForRole(role) {
  const normalized = normalizeRole(role);
  return getApplicationRoleOptions().some(option => option.value === normalized);
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
    getAssignableRoleOptions,
    getPublicRoleOptions,
    getApplicationRoleOptions,
    canApplyForRole
  };
}

if (typeof window !== 'undefined') {
  const exported = {
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
    getAssignableRoleOptions,
    getPublicRoleOptions,
    getApplicationRoleOptions,
    canApplyForRole
  };

  window.REDOAK_ROLES = exported;
  Object.assign(window, exported);
}