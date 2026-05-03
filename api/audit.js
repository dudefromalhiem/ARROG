const admin = require('firebase-admin');

/**
 * Audit logging system for tracking role changes, promotions, and sensitive operations
 * All audit events are immutable and include actor, timestamp, and reason
 */

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountRaw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY');
  const serviceAccount = JSON.parse(serviceAccountRaw);
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

/**
 * Log a role change with full context for compliance and debugging
 * @param {Object} db - Firestore instance
 * @param {Object} actor - Actor performing the change {uid, email}
 * @param {string} targetUid - UID of user whose role is changing
 * @param {string} targetEmail - Email of user whose role is changing
 * @param {string} oldRole - Previous role
 * @param {string} newRole - New role
 * @param {string} operation - 'promotion', 'demotion', 'revocation', 'assignment'
 * @param {string} reason - Why the change occurred
 * @param {Object} metadata - Additional context (approval_id, request_id, etc.)
 * @returns {Promise<string>} Document ID of audit log entry
 */
async function logRoleChange(db, actor, targetUid, targetEmail, oldRole, newRole, operation, reason, metadata = {}) {
  const auditRef = db.collection('auditLogs').doc();
  
  const logEntry = {
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    type: 'role_change',
    operation: String(operation || 'unknown').toLowerCase(),
    actor: {
      uid: String(actor.uid || ''),
      email: String(actor.email || '').toLowerCase()
    },
    target: {
      uid: String(targetUid || ''),
      email: String(targetEmail || '').toLowerCase()
    },
    roleChange: {
      from: String(oldRole || 'unknown'),
      to: String(newRole || 'unknown')
    },
    reason: String(reason || 'not provided').slice(0, 500),
    metadata: Object.assign({}, metadata),
    ipAddress: metadata.ipAddress || 'unknown',
    status: 'completed'
  };

  await auditRef.set(logEntry);
  return auditRef.id;
}

/**
 * Log a permission denial or failed operation attempt
 * @param {Object} db - Firestore instance
 * @param {Object} actor - Actor who was denied
 * @param {string} operation - Operation attempted
 * @param {string} reason - Why it was denied
 * @param {Object} context - Additional context about the attempt
 */
async function logPermissionDenial(db, actor, operation, reason, context = {}) {
  const auditRef = db.collection('auditLogs').doc();
  
  const logEntry = {
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    type: 'permission_denial',
    actor: {
      uid: String(actor.uid || ''),
      email: String(actor.email || '').toLowerCase()
    },
    operation: String(operation || 'unknown').toLowerCase(),
    reason: String(reason || 'not provided').slice(0, 500),
    context: Object.assign({}, context),
    status: 'denied'
  };

  await auditRef.set(logEntry);
  return auditRef.id;
}

/**
 * Log a sensitive data access or operation
 * @param {Object} db - Firestore instance
 * @param {Object} actor - Actor performing action
 * @param {string} actionType - Type of action (view_audit_logs, export_data, etc.)
 * @param {string} resourceType - Type of resource (users, applications, etc.)
 * @param {Object} details - Additional details
 */
async function logSensitiveAccess(db, actor, actionType, resourceType, details = {}) {
  const auditRef = db.collection('auditLogs').doc();
  
  const logEntry = {
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    type: 'sensitive_access',
    actionType: String(actionType || 'unknown').toLowerCase(),
    resourceType: String(resourceType || 'unknown').toLowerCase(),
    actor: {
      uid: String(actor.uid || ''),
      email: String(actor.email || '').toLowerCase()
    },
    details: Object.assign({}, details),
    status: 'logged'
  };

  await auditRef.set(logEntry);
  return auditRef.id;
}

/**
 * Get audit logs with filtering and pagination (admin only)
 * @param {Object} db - Firestore instance
 * @param {Object} filters - Query filters {type, actorEmail, targetEmail, operation, startTime, endTime, limit}
 * @returns {Promise<Array>} Array of audit log entries
 */
async function getAuditLogs(db, filters = {}) {
  let query = db.collection('auditLogs');

  if (filters.type) {
    query = query.where('type', '==', String(filters.type).toLowerCase());
  }

  if (filters.operation) {
    query = query.where('operation', '==', String(filters.operation).toLowerCase());
  }

  if (filters.actorEmail) {
    const email = String(filters.actorEmail || '').toLowerCase();
    query = query.where('actor.email', '==', email);
  }

  if (filters.targetEmail) {
    const email = String(filters.targetEmail || '').toLowerCase();
    query = query.where('target.email', '==', email);
  }

  if (filters.startTime) {
    query = query.where('timestamp', '>=', filters.startTime);
  }

  if (filters.endTime) {
    query = query.where('timestamp', '<=', filters.endTime);
  }

  query = query.orderBy('timestamp', 'desc');
  query = query.limit(Math.min(Number(filters.limit) || 100, 500));

  const snap = await query.get();
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Generate audit report for date range
 * @param {Object} db - Firestore instance
 * @param {Date} startDate - Report start date
 * @param {Date} endDate - Report end date
 * @param {string} reportType - 'role_changes', 'permission_denials', 'all'
 */
async function generateAuditReport(db, startDate, endDate, reportType = 'all') {
  const startTs = admin.firestore.Timestamp.fromDate(startDate);
  const endTs = admin.firestore.Timestamp.fromDate(endDate);

  let query = db.collection('auditLogs')
    .where('timestamp', '>=', startTs)
    .where('timestamp', '<=', endTs);

  if (reportType === 'role_changes') {
    query = query.where('type', '==', 'role_change');
  } else if (reportType === 'permission_denials') {
    query = query.where('type', '==', 'permission_denial');
  }

  const snap = await query.orderBy('timestamp', 'desc').get();
  const logs = snap.docs.map(doc => doc.data());

  // Aggregate statistics
  const stats = {
    totalEvents: logs.length,
    byType: {},
    byActor: {},
    byOperation: {},
    byStatus: {}
  };

  logs.forEach(log => {
    stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;
    stats.byActor[log.actor?.email || 'unknown'] = (stats.byActor[log.actor?.email || 'unknown'] || 0) + 1;
    if (log.operation) stats.byOperation[log.operation] = (stats.byOperation[log.operation] || 0) + 1;
    stats.byStatus[log.status || 'unknown'] = (stats.byStatus[log.status || 'unknown'] || 0) + 1;
  });

  return {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    statistics: stats,
    events: logs
  };
}

module.exports = {
  logRoleChange,
  logPermissionDenial,
  logSensitiveAccess,
  getAuditLogs,
  generateAuditReport
};
