const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length) return admin.app();

  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountRaw) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable.');
  }

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

function normalizeText(text, maxLen = 1200) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function toPlainValue(value) {
  if (!value) return value;
  if (typeof value.toDate === 'function' && typeof value.seconds === 'number') {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (Array.isArray(value)) return value.map(toPlainValue);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlainValue(v)]));
  }
  return value;
}

async function verifyUser(req) {
  const app = initAdmin();
  const token = getBearerToken(req);
  if (!token) {
    const err = new Error('Missing bearer token.');
    err.statusCode = 401;
    throw err;
  }

  const decoded = await admin.auth(app).verifyIdToken(token);
  const uid = String(decoded.uid || '');
  if (!uid) {
    const err = new Error('Invalid authentication token.');
    err.statusCode = 401;
    throw err;
  }

  return {
    uid,
    email: String(decoded.email || ''),
    name: String(decoded.name || decoded.displayName || '')
  };
}

const BOOTSTRAP_OWNERS = new Set(['jaimejoselaureano@gmail.com', 'dudefromalhiem@gmail.com']);

function isOwnerEmail(email, rolesData) {
  const normalizedEmail = String(email || '').toLowerCase();
  if (BOOTSTRAP_OWNERS.has(normalizedEmail)) return true;
  const owners = Array.isArray(rolesData?.owners) ? rolesData.owners : [];
  return owners.map(value => String(value || '').toLowerCase()).includes(normalizedEmail);
}

function isAdminEmail(email, rolesData) {
  const normalizedEmail = String(email || '').toLowerCase();
  if (BOOTSTRAP_OWNERS.has(normalizedEmail)) return true;
  const admins = Array.isArray(rolesData?.admins) ? rolesData.admins : [];
  return admins.map(value => String(value || '').toLowerCase()).includes(normalizedEmail) || isOwnerEmail(email, rolesData);
}

function makeThreadId(uidA, uidB) {
  return [String(uidA || ''), String(uidB || '')].sort().join('__');
}

function formatTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  if (typeof value === 'string') return value;
  return null;
}

async function getRolesData(db) {
  const doc = await db.collection('config').doc('roles').get();
  return doc.exists ? (doc.data() || {}) : {};
}

async function fetchUsersByEmails(db, emails) {
  const normalized = [...new Set((emails || []).map(email => String(email || '').toLowerCase()).filter(Boolean))];
  const byEmail = new Map();

  for (let index = 0; index < normalized.length; index += 10) {
    const chunk = normalized.slice(index, index + 10);
    const snap = await db.collection('users').where('email', 'in', chunk).get();
    snap.docs.forEach(doc => {
      const data = doc.data() || {};
      byEmail.set(String(data.email || '').toLowerCase(), { id: doc.id, ...toPlainValue(data) });
    });
  }

  return byEmail;
}

async function listPublicAdmins(db) {
  const roles = await getRolesData(db);
  const adminEmails = Array.isArray(roles.admins) ? roles.admins.map(value => String(value || '').toLowerCase()) : [];
  const modEmails = Array.isArray(roles.mods) ? roles.mods.map(value => String(value || '').toLowerCase()) : [];
  const allAuthorities = [...new Set([...adminEmails, ...modEmails])];
  const appointments = roles.adminAppointments || {};
  const userMap = await fetchUsersByEmails(db, allAuthorities);

  return allAuthorities.map(email => {
    const user = userMap.get(email) || {};
    const displayName = normalizeText(user.displayName || email.split('@')[0] || 'Agent', 120);
    const appointedRaw = appointments[email] || user.adminSince || user.lastLogin || null;
    const role = adminEmails.includes(email) ? 'Admin' : 'Moderator';
    return {
      uid: String(user.uid || user.id || ''),
      displayName,
      role,
      appointedAt: formatTimestamp(appointedRaw)
    };
  });
}

async function searchUsers(db, queryText) {
  const query = normalizeText(queryText || '', 80).toLowerCase();
  if (!query) return [];

  const snap = await db.collection('users').limit(300).get();
  return snap.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter(user => {
      const haystack = [user.displayName, user.email, user.role].map(value => String(value || '').toLowerCase()).join(' ');
      return haystack.includes(query);
    })
    .map(user => ({
      uid: String(user.uid || user.id || ''),
      displayName: normalizeText(user.displayName || user.email || 'Agent', 120),
      email: String(user.email || '').toLowerCase(),
      role: String(user.role || 'user')
    }))
    .filter(user => user.uid);
}

async function checkBlock(db, blockerUid, blockedUid) {
  const doc = await db.collection('blocks').doc(`${blockerUid}_${blockedUid}`).get();
  return doc.exists;
}

async function getThreadForParticipants(db, uidA, uidB) {
  const threadId = makeThreadId(uidA, uidB);
  const doc = await db.collection('dmThreads').doc(threadId).get();
  return { threadId, exists: doc.exists, data: doc.exists ? (doc.data() || {}) : null };
}

async function ensureThreadAccess(db, actor, recipient, roles) {
  const thread = await getThreadForParticipants(db, actor.uid, recipient.uid);
  const recipientIsOwner = isOwnerEmail(recipient.email, roles);
  const senderIsOwner = isOwnerEmail(actor.email, roles);
  const senderIsAdmin = isAdminEmail(actor.email, roles);

  if (recipientIsOwner && !senderIsOwner && !senderIsAdmin) {
    if (!thread.exists || thread.data.ownerConversationOpen !== true) {
      const err = new Error('Only admins can message the Owner unless the Owner opens the conversation first.');
      err.statusCode = 403;
      throw err;
    }
  }

  return { thread, recipientIsOwner, senderIsOwner, senderIsAdmin };
}

async function sendMessage(db, actor, body) {
  const recipientUid = normalizeText(body.recipientUid || '', 128);
  const text = normalizeText(body.text || body.content || '', 1200);
  if (!recipientUid) {
    return { statusCode: 400, payload: { error: 'Missing recipient.' } };
  }
  if (!text) {
    return { statusCode: 400, payload: { error: 'Message cannot be empty.' } };
  }

  const [roles, recipientSnap, senderSnap] = await Promise.all([
    getRolesData(db),
    db.collection('users').doc(recipientUid).get(),
    db.collection('users').doc(actor.uid).get()
  ]);

  if (!recipientSnap.exists) {
    return { statusCode: 404, payload: { error: 'Recipient not found.' } };
  }

  const recipient = { id: recipientSnap.id, ...(recipientSnap.data() || {}) };
  const sender = senderSnap.exists ? { id: senderSnap.id, ...(senderSnap.data() || {}) } : { id: actor.uid, displayName: actor.name || actor.email.split('@')[0] || 'Agent', email: actor.email };

  if (await checkBlock(db, actor.uid, recipientUid) || await checkBlock(db, recipientUid, actor.uid)) {
    return { statusCode: 403, payload: { error: 'Messaging is blocked between these accounts.' } };
  }

  const threadMeta = await ensureThreadAccess(db, actor, recipient, roles);
  const threadId = threadMeta.thread.threadId;
  const threadRef = db.collection('dmThreads').doc(threadId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const threadPayload = {
    participants: [actor.uid, recipientUid],
    participantEmails: [actor.email, String(recipient.email || '')],
    participantNames: [normalizeText(sender.displayName || sender.email || actor.email.split('@')[0] || 'Agent', 120), normalizeText(recipient.displayName || recipient.email || 'Agent', 120)],
    ownerUid: threadMeta.recipientIsOwner ? recipientUid : (threadMeta.senderIsOwner ? actor.uid : (threadMeta.thread.data?.ownerUid || '')),
    ownerConversationOpen: threadMeta.senderIsOwner || threadMeta.thread.data?.ownerConversationOpen === true,
    ownerInitiatedByUid: threadMeta.thread.data?.ownerInitiatedByUid || (threadMeta.senderIsOwner && threadMeta.recipientIsOwner ? actor.uid : ''),
    lastMessageAt: now,
    lastMessageBy: actor.uid,
    lastMessagePreview: text.slice(0, 160),
    updatedAt: now
  };

  if (!threadMeta.thread.exists) {
    threadPayload.createdAt = now;
  }

  await threadRef.set(threadPayload, { merge: true });
  const messageRef = await threadRef.collection('messages').add({
    senderUid: actor.uid,
    senderEmail: actor.email,
    senderName: normalizeText(sender.displayName || actor.name || actor.email.split('@')[0] || 'Agent', 120),
    recipientUid,
    recipientEmail: String(recipient.email || ''),
    recipientName: normalizeText(recipient.displayName || recipient.email || 'Agent', 120),
    text,
    createdAt: now
  });

  return { statusCode: 200, payload: { ok: true, threadId, messageId: messageRef.id } };
}

async function listInbox(db, actor) {
  const snap = await db.collection('dmThreads').where('participants', 'array-contains', actor.uid).get();
  const threads = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }));
  threads.sort((a, b) => {
    const sa = Number(a?.lastMessageAt?.seconds || a?.updatedAt?.seconds || a?.createdAt?.seconds || 0);
    const sb = Number(b?.lastMessageAt?.seconds || b?.updatedAt?.seconds || b?.createdAt?.seconds || 0);
    return sb - sa;
  });
  return threads.map(thread => ({
    id: thread.id,
    participants: thread.participants || [],
    participantNames: thread.participantNames || [],
    lastMessagePreview: thread.lastMessagePreview || '',
    lastMessageBy: thread.lastMessageBy || '',
    ownerConversationOpen: thread.ownerConversationOpen === true,
    updatedAt: formatTimestamp(thread.updatedAt || thread.lastMessageAt || thread.createdAt)
  }));
}

async function readThreadMessages(db, actor, peerUid) {
  const threadId = makeThreadId(actor.uid, peerUid);
  const threadRef = db.collection('dmThreads').doc(threadId);
  const threadSnap = await threadRef.get();
  if (!threadSnap.exists) {
    return { threadId, thread: null, messages: [] };
  }

  const thread = threadSnap.data() || {};
  if (!Array.isArray(thread.participants) || !thread.participants.includes(actor.uid)) {
    return { threadId, thread: null, messages: [] };
  }

  const peerMessageSnap = await threadRef.collection('messages').orderBy('createdAt', 'asc').limit(200).get();
  return {
    threadId,
    thread: { id: threadId, ...(toPlainValue(thread) || {}) },
    messages: peerMessageSnap.docs.map(doc => ({ id: doc.id, ...(toPlainValue(doc.data()) || {}) }))
  };
}

async function blockUser(db, actor, body) {
  const targetUid = normalizeText(body.targetUid || '', 128);
  const reason = normalizeText(body.reason || '', 500);
  if (!targetUid) {
    return { statusCode: 400, payload: { error: 'Missing target user.' } };
  }
  if (targetUid === actor.uid) {
    return { statusCode: 400, payload: { error: 'You cannot block yourself.' } };
  }

  const targetSnap = await db.collection('users').doc(targetUid).get();
  if (!targetSnap.exists) {
    return { statusCode: 404, payload: { error: 'Target user not found.' } };
  }

  await db.collection('blocks').doc(`${actor.uid}_${targetUid}`).set({
    blockerUid: actor.uid,
    blockerEmail: actor.email,
    targetUid,
    targetEmail: String((targetSnap.data() || {}).email || ''),
    reason,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { statusCode: 200, payload: { ok: true } };
}

async function reportUser(db, actor, body) {
  const targetUid = normalizeText(body.targetUid || '', 128);
  const reason = normalizeText(body.reason || '', 500);
  if (!targetUid) {
    return { statusCode: 400, payload: { error: 'Missing target user.' } };
  }
  if (!reason) {
    return { statusCode: 400, payload: { error: 'Report reason cannot be empty.' } };
  }

  const targetSnap = await db.collection('users').doc(targetUid).get();
  if (!targetSnap.exists) {
    return { statusCode: 404, payload: { error: 'Target user not found.' } };
  }

  await db.collection('userReports').add({
    reporterUid: actor.uid,
    reporterEmail: actor.email,
    targetUid,
    targetEmail: String((targetSnap.data() || {}).email || ''),
    reason,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { statusCode: 200, payload: { ok: true } };
}

module.exports = async function handler(req, res) {
  try {
    const app = initAdmin();
    const db = admin.firestore(app);
    const method = String(req.method || 'GET').toUpperCase();
    const type = normalizeText(req.query?.type || '', 40).toLowerCase();

    if (method === 'GET' && type === 'admins') {
      const admins = await listPublicAdmins(db);
      return sendJson(res, 200, { admins });
    }

    const actor = await verifyUser(req);

    if (method === 'GET' && type === 'searchusers') {
      const users = await searchUsers(db, req.query?.q || '');
      return sendJson(res, 200, { users });
    }

    if (method === 'GET' && type === 'inbox') {
      const threads = await listInbox(db, actor);
      return sendJson(res, 200, { threads });
    }

    if (method === 'GET' && type === 'thread') {
      const peerUid = normalizeText(req.query?.peerUid || '', 128);
      if (!peerUid) {
        return sendJson(res, 400, { error: 'Missing peer user.' });
      }
      const thread = await readThreadMessages(db, actor, peerUid);
      return sendJson(res, 200, thread);
    }

    if (method === 'POST') {
      const body = req.body || {};
      const action = normalizeText(body.action || '', 24).toLowerCase();

      if (action === 'message') {
        const result = await sendMessage(db, actor, body);
        return sendJson(res, result.statusCode, result.payload);
      }

      if (action === 'block') {
        const result = await blockUser(db, actor, body);
        return sendJson(res, result.statusCode, result.payload);
      }

      if (action === 'report') {
        const result = await reportUser(db, actor, body);
        return sendJson(res, result.statusCode, result.payload);
      }

      return sendJson(res, 400, { error: 'Missing social action.' });
    }

    return sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    return sendJson(res, Number(err.statusCode || 500), { error: err.message || 'Server error.' });
  }
};
