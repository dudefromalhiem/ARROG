const admin = require('firebase-admin');
const { ROLES, normalizeRole, isAtLeast, PUBLIC_ROLE_LADDER } = require('../permissions');
const { logRoleChange, logPermissionDenial } = require('./audit');

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountRaw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY');
  const serviceAccount = JSON.parse(serviceAccountRaw);
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID
  });
}

function sendJson(res, statusCode, payload) {
  res.status(statusCode).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || req.headers.Authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function getRequestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['x-vercel-forwarded-for'] || '');
  if (forwarded) return forwarded.split(',')[0].trim();
  return String(req.socket?.remoteAddress || 'unknown');
}

async function verifyUser(req) {
  const app = initAdmin();
  const token = getBearerToken(req);
  if (!token) {
    const err = new Error('Missing bearer token');
    err.statusCode = 401;
    throw err;
  }
  const decoded = await admin.auth(app).verifyIdToken(token);
  return {
    uid: String(decoded.uid || ''),
    email: String(decoded.email || '').toLowerCase()
  };
}

const BOOTSTRAP_OWNERS = new Set(['jaimejoselaureano@gmail.com', 'dudefromalhiem@gmail.com']);

async function getActorPermissions(db, uid, email) {
  const normalizedEmail = String(email || '').toLowerCase();

  // Bootstrap owners have ultimate authority
  if (BOOTSTRAP_OWNERS.has(normalizedEmail)) {
    return {
      role: ROLES.OWNER,
      rank: 999,
      canPromote: true,
      canDemote: true,
      canAudit: true,
      canManageAll: true
    };
  }

  const userDoc = await db.collection('users').doc(uid).get();
  const userData = userDoc.exists ? userDoc.data() : {};
  const userRole = normalizeRole(userData.role);

  const rolesDoc = await db.collection('config').doc('roles').get();
  const rolesData = rolesDoc.exists ? rolesDoc.data() : {};
  const inOwners = Array.isArray(rolesData.owners) && rolesData.owners.map(e => String(e || '').toLowerCase()).includes(normalizedEmail);
  const inAdmins = Array.isArray(rolesData.admins) && rolesData.admins.map(e => String(e || '').toLowerCase()).includes(normalizedEmail);
  const inMods = Array.isArray(rolesData.mods) && rolesData.mods.map(e => String(e || '').toLowerCase()).includes(normalizedEmail);

  // Determine effective role
  let effectiveRole = userRole;
  if (inOwners) effectiveRole = ROLES.OWNER;
  else if (inAdmins) effectiveRole = ROLES.CHIEF_ADMINISTRATOR;
  else if (inMods) effectiveRole = ROLES.CHIEF_OF_MODERATION;

  // Build permissions based on role hierarchy
  const permissions = {
    role: effectiveRole,
    rank: PUBLIC_ROLE_LADDER.indexOf(effectiveRole) + 1,
    canPromote: false,
    canDemote: false,
    canAudit: false,
    canManageAll: false
  };

  // OWNER: can do everything
  if (effectiveRole === ROLES.OWNER) {
    permissions.canPromote = true;
    permissions.canDemote = true;
    permissions.canAudit = true;
    permissions.canManageAll = true;
  }
  // CHIEF_ADMINISTRATOR: can manage admins/moderators, full audit
  else if (isAtLeast(effectiveRole, ROLES.CHIEF_ADMINISTRATOR)) {
    permissions.canPromote = true;
    permissions.canDemote = true;
    permissions.canAudit = true;
  }
  // CHIEF_OF_MODERATION: can promote/demote moderators only
  else if (isAtLeast(effectiveRole, ROLES.CHIEF_OF_MODERATION)) {
    permissions.canPromote = true;
    permissions.canDemote = true;
    permissions.canAudit = true;
  }
  // All other roles: audit only
  else if (isAtLeast(effectiveRole, ROLES.MODERATOR)) {
    permissions.canAudit = true;
  }

  return permissions;
}

/**
 * Validate if actor can promote target to newRole
 */
function canActorPromote(actorPerms, targetRole, newRole) {
  if (!actorPerms.canPromote) return false;

  const actorRank = PUBLIC_ROLE_LADDER.indexOf(actorPerms.role);
  const targetRank = PUBLIC_ROLE_LADDER.indexOf(targetRole);
  const newRank = PUBLIC_ROLE_LADDER.indexOf(newRole);

  // Can't promote above own rank
  if (newRank > actorRank) return false;

  // Can't promote an admin role if you're not an admin
  if (newRank >= PUBLIC_ROLE_LADDER.indexOf(ROLES.ADMINISTRATOR) &&
      actorRank < PUBLIC_ROLE_LADDER.indexOf(ROLES.CHIEF_ADMINISTRATOR)) {
    return false;
  }

  // Can't promote a moderation role if you're not a moderation chief
  if (newRank >= PUBLIC_ROLE_LADDER.indexOf(ROLES.MODERATOR) &&
      newRank <= PUBLIC_ROLE_LADDER.indexOf(ROLES.CHIEF_OF_MODERATION) &&
      actorRank < PUBLIC_ROLE_LADDER.indexOf(ROLES.CHIEF_OF_MODERATION)) {
    return false;
  }

  return true;
}

/**
 * Validate if actor can demote target from currentRole
 */
function canActorDemote(actorPerms, currentRole) {
  if (!actorPerms.canDemote) return false;

  const actorRank = PUBLIC_ROLE_LADDER.indexOf(actorPerms.role);
  const targetRank = PUBLIC_ROLE_LADDER.indexOf(currentRole);

  // Can't demote someone at or above your level
  if (targetRank >= actorRank) return false;

  return true;
}

/**
 * POST /api/admin/roles/promote
 * Promote a user to a new role
 * Required: {targetUid, targetEmail, newRole, reason}
 */
async function promoteUser(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const app = initAdmin();
    const db = admin.firestore(app);
    const actor = await verifyUser(req);
    const actorPerms = await getActorPermissions(db, actor.uid, actor.email);

    if (!actorPerms.canPromote) {
      await logPermissionDenial(db, actor, 'promote_user', 'Insufficient permissions', req.body);
      return sendJson(res, 403, { error: 'Permission denied: Cannot promote users' });
    }

    const { targetUid, targetEmail, newRole, reason } = req.body;

    if (!targetUid || !targetEmail || !newRole) {
      return sendJson(res, 400, { error: 'Missing required fields: targetUid, targetEmail, newRole' });
    }

    const normalizedRole = normalizeRole(newRole);
    if (!normalizedRole || !PUBLIC_ROLE_LADDER.includes(normalizedRole)) {
      return sendJson(res, 400, { error: 'Invalid role: ' + newRole });
    }

    // Fetch target user
    const targetUserRef = db.collection('users').doc(targetUid);
    const targetUserDoc = await targetUserRef.get();
    const currentRole = normalizeRole(targetUserDoc.exists ? targetUserDoc.data()?.role : ROLES.NEWBIE);

    // Validate actor can promote to this role
    if (!canActorPromote(actorPerms, currentRole, normalizedRole)) {
      await logPermissionDenial(db, actor, 'promote_user', `Cannot promote to ${normalizedRole}`, { targetUid, targetEmail, newRole });
      return sendJson(res, 403, { error: 'Permission denied: Cannot promote to that role' });
    }

    // Can't promote to same role
    if (currentRole === normalizedRole) {
      return sendJson(res, 400, { error: 'Target already has role: ' + normalizedRole });
    }

    // Update user document
    await targetUserRef.set({
      role: normalizedRole,
      roleName: require('../permissions').ROLE_LABELS[normalizedRole] || normalizedRole,
      roleGrantedBy: actor.email,
      roleGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
      roleChangedBy: actor.email,
      roleChangedAt: admin.firestore.FieldValue.serverTimestamp(),
      roleChangeReason: String(reason || 'promotion').slice(0, 500),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Log the promotion
    await logRoleChange(
      db,
      actor,
      targetUid,
      targetEmail,
      currentRole,
      normalizedRole,
      'promotion',
      reason || 'role promotion via admin panel',
      { ipAddress: getRequestIp(req) }
    );

    return sendJson(res, 200, {
      success: true,
      message: `Promoted ${targetEmail} to ${normalizedRole}`,
      previousRole: currentRole,
      newRole: normalizedRole
    });
  } catch (err) {
    console.error('Promotion error:', err);
    return sendJson(res, 500, { error: String(err.message || 'Server error') });
  }
}

/**
 * POST /api/admin/roles/demote
 * Demote a user to a lower role
 * Required: {targetUid, targetEmail, newRole, reason}
 */
async function demoteUser(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const app = initAdmin();
    const db = admin.firestore(app);
    const actor = await verifyUser(req);
    const actorPerms = await getActorPermissions(db, actor.uid, actor.email);

    if (!actorPerms.canDemote) {
      await logPermissionDenial(db, actor, 'demote_user', 'Insufficient permissions', req.body);
      return sendJson(res, 403, { error: 'Permission denied: Cannot demote users' });
    }

    const { targetUid, targetEmail, newRole, reason } = req.body;

    if (!targetUid || !targetEmail || !newRole) {
      return sendJson(res, 400, { error: 'Missing required fields: targetUid, targetEmail, newRole' });
    }

    const normalizedRole = normalizeRole(newRole);
    if (!normalizedRole || !PUBLIC_ROLE_LADDER.includes(normalizedRole)) {
      return sendJson(res, 400, { error: 'Invalid role: ' + newRole });
    }

    // Fetch target user
    const targetUserRef = db.collection('users').doc(targetUid);
    const targetUserDoc = await targetUserRef.get();
    const currentRole = normalizeRole(targetUserDoc.exists ? targetUserDoc.data()?.role : ROLES.NEWBIE);

    // Validate demotion
    if (!canActorDemote(actorPerms, currentRole)) {
      await logPermissionDenial(db, actor, 'demote_user', `Cannot demote from ${currentRole}`, { targetUid, targetEmail });
      return sendJson(res, 403, { error: 'Permission denied: Cannot demote that role' });
    }

    if (currentRole === normalizedRole) {
      return sendJson(res, 400, { error: 'Target already has role: ' + normalizedRole });
    }

    // Update user document
    await targetUserRef.set({
      role: normalizedRole,
      roleName: require('../permissions').ROLE_LABELS[normalizedRole] || normalizedRole,
      roleChangedBy: actor.email,
      roleChangedAt: admin.firestore.FieldValue.serverTimestamp(),
      roleChangeReason: String(reason || 'demotion').slice(0, 500),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Log the demotion
    await logRoleChange(
      db,
      actor,
      targetUid,
      targetEmail,
      currentRole,
      normalizedRole,
      'demotion',
      reason || 'role demotion via admin panel',
      { ipAddress: getRequestIp(req) }
    );

    return sendJson(res, 200, {
      success: true,
      message: `Demoted ${targetEmail} to ${normalizedRole}`,
      previousRole: currentRole,
      newRole: normalizedRole
    });
  } catch (err) {
    console.error('Demotion error:', err);
    return sendJson(res, 500, { error: String(err.message || 'Server error') });
  }
}

/**
 * POST /api/admin/audit/logs
 * Retrieve audit logs (admin only)
 * Query: {type, operation, actorEmail, targetEmail, limit, daysBack}
 */
async function getAuditLogs(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const app = initAdmin();
    const db = admin.firestore(app);
    const actor = await verifyUser(req);
    const actorPerms = await getActorPermissions(db, actor.uid, actor.email);

    if (!actorPerms.canAudit) {
      await logPermissionDenial(db, actor, 'view_audit_logs', 'Insufficient permissions', {});
      return sendJson(res, 403, { error: 'Permission denied: Cannot view audit logs' });
    }

    const { type, operation, actorEmail, targetEmail, limit, daysBack } = req.body || {};
    const constraints = {
      type: type ? String(type).toLowerCase() : undefined,
      operation: operation ? String(operation).toLowerCase() : undefined,
      actorEmail: actorEmail ? String(actorEmail).toLowerCase() : undefined,
      targetEmail: targetEmail ? String(targetEmail).toLowerCase() : undefined,
      limit: Math.min(Number(limit) || 100, 500)
    };

    // Add time filter if requested
    if (daysBack) {
      const days = Number(daysBack) || 7;
      const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      constraints.startTime = admin.firestore.Timestamp.fromDate(startTime);
    }

    let query = db.collection('auditLogs');

    if (constraints.type) query = query.where('type', '==', constraints.type);
    if (constraints.operation) query = query.where('operation', '==', constraints.operation);
    if (constraints.actorEmail) query = query.where('actor.email', '==', constraints.actorEmail);
    if (constraints.targetEmail) query = query.where('target.email', '==', constraints.targetEmail);
    if (constraints.startTime) query = query.where('timestamp', '>=', constraints.startTime);

    const snap = await query.orderBy('timestamp', 'desc').limit(constraints.limit).get();
    const logs = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Log this audit access
    require('./audit').logSensitiveAccess(db, actor, 'view_audit_logs', 'auditLogs', {
      filters: { type, operation, actorEmail, targetEmail, daysBack },
      resultCount: logs.length
    });

    return sendJson(res, 200, {
      success: true,
      count: logs.length,
      logs: logs
    });
  } catch (err) {
    console.error('Audit log error:', err);
    return sendJson(res, 500, { error: String(err.message || 'Server error') });
  }
}

module.exports = async (req, res) => {
  // Route handler
  const pathname = req.url?.split('?')[0] || '/';

  try {
    if (pathname === '/api/admin/roles/promote') {
      return await promoteUser(req, res);
    } else if (pathname === '/api/admin/roles/demote') {
      return await demoteUser(req, res);
    } else if (pathname === '/api/admin/audit/logs') {
      return await getAuditLogs(req, res);
    } else {
      return sendJson(res, 404, { error: 'Endpoint not found' });
    }
  } catch (err) {
    console.error('Admin API error:', err);
    return sendJson(res, 500, { error: 'Internal server error' });
  }
};
