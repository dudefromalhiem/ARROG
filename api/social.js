const admin = require('firebase-admin');
const {
  ROLES,
  PUBLIC_ROLE_LADDER,
  normalizeRole,
  canApplyForRole,
  isAtLeast
} = require('../permissions');

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

function getRequestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['x-vercel-forwarded-for'] || '');
  if (forwarded) return forwarded.split(',')[0].trim();
  return String(req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown');
}

function normalizeText(text, maxLen = 1200) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function normalizeApplicationRole(value) {
  const role = normalizeRole(value);
  return canApplyForRole(role) ? role : '';
}

function roleLabel(role) {
  const normalized = normalizeRole(role);
  // Use centralized labels from permissions.js
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
  return ROLE_LABELS[normalized] || 'Member';
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

function isModeratorEmail(email, rolesData) {
  const normalizedEmail = String(email || '').toLowerCase();
  if (BOOTSTRAP_OWNERS.has(normalizedEmail)) return true;
  const mods = Array.isArray(rolesData?.mods) ? rolesData.mods : [];
  return mods.map(value => String(value || '').toLowerCase()).includes(normalizedEmail) || isAdminEmail(email, rolesData);
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

async function fetchUsersByUids(db, uids) {
  const normalized = [...new Set((uids || []).map(uid => String(uid || '').trim()).filter(Boolean))];
  const byUid = new Map();
  if (!normalized.length) return byUid;

  const docs = await Promise.all(normalized.map(uid => db.collection('users').doc(uid).get()));
  docs.forEach(doc => {
    if (!doc.exists) return;
    byUid.set(doc.id, { id: doc.id, ...toPlainValue(doc.data() || {}) });
  });
  return byUid;
}

async function listPublicAdmins(db) {
  const roles = await getRolesData(db);
  const ownerEmails = Array.isArray(roles.owners) ? roles.owners.map(value => String(value || '').toLowerCase()) : [];
  const adminEmails = Array.isArray(roles.admins) ? roles.admins.map(value => String(value || '').toLowerCase()) : [];
  const modEmails = Array.isArray(roles.mods) ? roles.mods.map(value => String(value || '').toLowerCase()) : [];
  // Include bootstrap owners that might not be in config/roles yet
  BOOTSTRAP_OWNERS.forEach(email => {
    if (!ownerEmails.includes(email)) ownerEmails.push(email);
  });
  const allAuthorities = [...new Set([...ownerEmails, ...adminEmails, ...modEmails])];
  const appointments = roles.adminAppointments || {};
  const userMap = await fetchUsersByEmails(db, allAuthorities);

  return allAuthorities.map(email => {
    const user = userMap.get(email) || {};
    let displayName = normalizeText(user.displayName || email.split('@')[0] || 'Agent', 120);
    const appointedRaw = appointments[email] || user.adminSince || user.lastLogin || null;
    let role = ownerEmails.includes(email) ? 'Owner' : (adminEmails.includes(email) ? 'Chief Administrator' : 'Moderator');

    if (ownerEmails.includes(email)) {
      displayName = 'The Archivist';
      role = 'The Archivist';
    }

    return {
      uid: String(user.uid || user.id || ''),
      displayName,
      role,
      appointedAt: formatTimestamp(appointedRaw)
    };
  });
}

async function enforceMessageRateLimit(db, uid) {
  const metaRef = db.collection('rateLimits').doc(uid);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;

  await db.runTransaction(async tx => {
    const snap = await tx.get(metaRef);
    const data = snap.exists ? (snap.data() || {}) : {};
    const lastReset = data.messageLastReset && typeof data.messageLastReset.toMillis === 'function'
      ? data.messageLastReset.toMillis()
      : 0;
    const expired = !lastReset || (now - lastReset) >= windowMs;
    const count = expired ? 0 : Number(data.messageCount || 0);

    if (count >= 30) {
      const err = new Error('Message limit reached. Please slow down and try again later.');
      err.statusCode = 429;
      throw err;
    }

    tx.set(metaRef, {
      messageCount: count + 1,
      messageLastReset: expired ? admin.firestore.Timestamp.fromMillis(now) : data.messageLastReset,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
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
      photoURL: normalizeText(user.photoURL || '', 1200)
    }))
    .filter(user => user.uid);
}

async function getPublicProfileByUid(db, uid, actor = null) {
  const targetUid = normalizeText(uid || '', 128);
  if (!targetUid) {
    const err = new Error('Missing target user.');
    err.statusCode = 400;
    throw err;
  }

  const doc = await db.collection('users').doc(targetUid).get();
  if (!doc.exists) {
    const err = new Error('Target user not found.');
    err.statusCode = 404;
    throw err;
  }

  const data = doc.data() || {};
  let profile = {
    uid: String(data.uid || doc.id || ''),
    displayName: normalizeText(data.displayName || data.email || 'Agent', 120),
    email: String(data.email || '').toLowerCase(),
    role: String(data.role || 'newbie'),
    roleName: normalizeText(data.roleName || '', 120),
    bio: normalizeText(data.bio || '', 500),
    photoURL: normalizeText(data.photoURL || '', 1200)
  };

  const roles = await getRolesData(db);
  const targetIsOwner = isOwnerEmail(profile.email, roles);

  if (targetIsOwner) {
    profile.displayName = 'The Archivist';
    profile.roleName = 'The Archivist';

    let isFriend = false;
    let isStaff = false;
    let isSelf = false;

    if (actor) {
      isSelf = actor.uid === profile.uid;
      isStaff = isAdminEmail(actor.email, roles) || isModeratorEmail(actor.email, roles);
      const requestState = await getFriendRequestDoc(db, actor.uid, profile.uid);
      isFriend = isAcceptedFriendRequest(requestState.data);
    }

    if (!isSelf && !isFriend) {
      profile.email = '[Redacted]';
      profile.role = '[Redacted]';
      profile.bio = '[Redacted]';
      profile.photoURL = '';
    }
  }

  return profile;
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

function normalizeRequestId(uidA, uidB) {
  return makeThreadId(uidA, uidB);
}

async function getFriendRequestDoc(db, uidA, uidB) {
  const requestId = normalizeRequestId(uidA, uidB);
  const ref = db.collection('friendRequests').doc(requestId);
  const snap = await ref.get();
  return {
    requestId,
    ref,
    exists: snap.exists,
    data: snap.exists ? (snap.data() || {}) : null
  };
}

function isAcceptedFriendRequest(data) {
  return String(data && data.status || '').toLowerCase() === 'accepted';
}

async function ensureThreadAccess(db, actor, recipient, roles) {
  const thread = await getThreadForParticipants(db, actor.uid, recipient.uid);
  const recipientIsOwner = isOwnerEmail(recipient.email, roles);
  const senderIsOwner = isOwnerEmail(actor.email, roles);
  const senderIsAdmin = isAdminEmail(actor.email, roles);

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

  await enforceMessageRateLimit(db, actor.uid);

  const [roles, senderSnap] = await Promise.all([
    getRolesData(db),
    db.collection('users').doc(actor.uid).get()
  ]);

  const isGuildStaffChannel = recipientUid === 'guild-staff';
  const recipientSnap = isGuildStaffChannel
    ? { exists: true, data: () => ({ uid: 'guild-staff', displayName: 'Guild Staff Channel', email: 'guild-staff@redoakerguild.local', role: 'group' }) }
    : await db.collection('users').doc(recipientUid).get();

  if (!recipientSnap.exists) {
    return { statusCode: 404, payload: { error: 'Recipient not found.' } };
  }

  const recipient = { id: recipientSnap.id, ...(recipientSnap.data() || {}) };
  const sender = senderSnap.exists ? { id: senderSnap.id, ...(senderSnap.data() || {}) } : { id: actor.uid, displayName: actor.name || actor.email.split('@')[0] || 'Agent', email: actor.email };

  if (isGuildStaffChannel && !isModeratorEmail(actor.email, roles)) {
    return { statusCode: 403, payload: { error: 'Only moderators, admins, and owners can use the guild staff channel.' } };
  }

  if (await checkBlock(db, actor.uid, recipientUid) || await checkBlock(db, recipientUid, actor.uid)) {
    return { statusCode: 403, payload: { error: 'Messaging is blocked between these accounts.' } };
  }

  const requestState = await getFriendRequestDoc(db, actor.uid, recipientUid);
  const senderIsAdmin = isAdminEmail(actor.email, roles);
  const senderIsMod = isModeratorEmail(actor.email, roles);

  const recipientIsOwner = isOwnerEmail(String(recipient.email || ''), roles);
  const recipientIsAdmin = isAdminEmail(String(recipient.email || ''), roles);
  const recipientIsMod = isModeratorEmail(String(recipient.email || ''), roles);

  let canBypassFriendGate = false;
  if (recipientIsOwner) {
    canBypassFriendGate = senderIsAdmin;
  } else if (recipientIsMod) {
    canBypassFriendGate = true;
  } else {
    canBypassFriendGate = senderIsMod;
  }

  if (!canBypassFriendGate && !isAcceptedFriendRequest(requestState.data)) {
    return { statusCode: 403, payload: { error: recipientIsOwner ? 'You must have an accepted friend request to message The Archivist.' : 'Friend request must be accepted before messaging.' } };
  }

  if (isGuildStaffChannel) {
    await syncGuildStaffThread(db, roles);
  }

  const threadMeta = isGuildStaffChannel
    ? { thread: { threadId: 'guild-staff', exists: true, data: { threadKind: 'guild-staff' } }, recipientIsOwner: false, senderIsOwner: false, senderIsAdmin: true }
    : await ensureThreadAccess(db, actor, recipient, roles);
  const threadId = isGuildStaffChannel ? 'guild-staff' : threadMeta.thread.threadId;
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

  if (isGuildStaffChannel) {
    const members = await getGuildStaffMembers(db, roles);
    threadPayload.participants = members.map(member => member.uid);
    threadPayload.participantEmails = members.map(member => member.email);
    threadPayload.participantNames = members.map(member => member.displayName);
    threadPayload.threadKind = 'guild-staff';
    threadPayload.title = 'Guild Staff Channel';
    threadPayload.ownerUid = '';
    threadPayload.ownerConversationOpen = true;
  }

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
  const roles = await getRolesData(db);
  const snap = await db.collection('dmThreads').where('participants', 'array-contains', actor.uid).get();
  const threads = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }));
  if (isModeratorEmail(actor.email, roles)) {
    await syncGuildStaffThread(db, roles);
    const staffThreadSnap = await db.collection('dmThreads').doc('guild-staff').get();
    if (staffThreadSnap.exists) {
      threads.unshift({ id: 'guild-staff', ...(staffThreadSnap.data() || {}) });
    }
  }
  const peerUids = [...new Set(
    threads
      .map(thread => (Array.isArray(thread.participants) ? thread.participants : []).find(uid => uid !== actor.uid) || '')
      .filter(Boolean)
  )];
  const userMap = await fetchUsersByUids(db, peerUids);

  threads.sort((a, b) => {
    const sa = Number(a?.lastMessageAt?.seconds || a?.updatedAt?.seconds || a?.createdAt?.seconds || 0);
    const sb = Number(b?.lastMessageAt?.seconds || b?.updatedAt?.seconds || b?.createdAt?.seconds || 0);
    return sb - sa;
  });
  return threads.map(thread => {
    const participants = Array.isArray(thread.participants) ? thread.participants : [];
    const peerUid = participants.find(uid => uid !== actor.uid) || '';
    const peerData = userMap.get(peerUid) || {};
    const peerIndex = participants.indexOf(peerUid);
    const peerNameFromThread = Array.isArray(thread.participantNames) ? thread.participantNames[peerIndex] : '';
    const isStaffThread = thread.id === 'guild-staff' || thread.threadKind === 'guild-staff';

    return {
      id: thread.id,
      participants,
      participantNames: thread.participantNames || [],
      lastMessagePreview: thread.lastMessagePreview || '',
      lastMessageBy: thread.lastMessageBy || '',
      ownerConversationOpen: thread.ownerConversationOpen === true,
      updatedAt: formatTimestamp(thread.updatedAt || thread.lastMessageAt || thread.createdAt),
      peer: {
        uid: String(isStaffThread ? 'guild-staff' : peerUid || ''),
        displayName: normalizeText(isStaffThread ? 'Guild Staff Channel' : (peerData.displayName || peerNameFromThread || peerData.email || 'Guild Member'), 120),
        email: String(isStaffThread ? 'guild-staff@redoakerguild.local' : peerData.email || '').toLowerCase(),
        role: String(isStaffThread ? 'group' : peerData.role || 'newbie'),
        photoURL: normalizeText(isStaffThread ? 'logo.png' : peerData.photoURL || '', 1200)
      }
    };
  });
}

async function addFriendRequest(db, actor, body) {
  const targetUid = normalizeText(body.targetUid || '', 128);
  const note = normalizeText(body.note || '', 300);
  if (!targetUid) {
    return { statusCode: 400, payload: { error: 'Missing target user.' } };
  }
  if (targetUid === actor.uid) {
    return { statusCode: 400, payload: { error: 'You cannot add yourself.' } };
  }

  const [targetSnap, senderSnap] = await Promise.all([
    db.collection('users').doc(targetUid).get(),
    db.collection('users').doc(actor.uid).get()
  ]);
  if (!targetSnap.exists) {
    return { statusCode: 404, payload: { error: 'Target user not found.' } };
  }
  if (await checkBlock(db, actor.uid, targetUid) || await checkBlock(db, targetUid, actor.uid)) {
    return { statusCode: 403, payload: { error: 'Friend request blocked between these accounts.' } };
  }

  const senderData = senderSnap.exists ? (senderSnap.data() || {}) : {};
  const targetData = targetSnap.data() || {};
  const requestId = normalizeRequestId(actor.uid, targetUid);
  const requestRef = db.collection('friendRequests').doc(requestId);
  const requestSnap = await requestRef.get();
  if (requestSnap.exists) {
    const existing = requestSnap.data() || {};
    const existingStatus = String(existing.status || '').toLowerCase();
    if (existingStatus === 'pending') {
      if (String(existing.requesterUid || '') === actor.uid) {
        return { statusCode: 200, payload: { ok: true, alreadyPending: true, direction: 'outgoing' } };
      }
      return { statusCode: 200, payload: { ok: true, alreadyPending: true, direction: 'incoming' } };
    }
    if (existingStatus === 'accepted') {
      return { statusCode: 200, payload: { ok: true, alreadyFriends: true } };
    }
  }

  await requestRef.set({
    requestId,
    requesterUid: actor.uid,
    requesterEmail: actor.email,
    requesterName: normalizeText(senderData.displayName || actor.name || actor.email.split('@')[0] || 'Agent', 120),
    requesterPhotoURL: normalizeText(senderData.photoURL || '', 1200),
    targetUid,
    targetEmail: String(targetData.email || '').toLowerCase(),
    targetName: normalizeText(targetData.displayName || targetData.email || 'Agent', 120),
    targetPhotoURL: normalizeText(targetData.photoURL || '', 1200),
    note,
    status: 'pending',
    acceptedAt: null,
    acceptedByUid: '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { statusCode: 200, payload: { ok: true, requestId } };
}

async function listFriendRequests(db, actor) {
  const [incomingSnap, outgoingSnap] = await Promise.all([
    db.collection('friendRequests').where('targetUid', '==', actor.uid).limit(200).get(),
    db.collection('friendRequests').where('requesterUid', '==', actor.uid).limit(200).get()
  ]);

  const incoming = incomingSnap.docs.map(doc => ({ id: doc.id, ...(toPlainValue(doc.data() || {})) }));
  const outgoing = outgoingSnap.docs.map(doc => ({ id: doc.id, ...(toPlainValue(doc.data() || {})) }));
  return { incoming, outgoing };
}

async function acceptFriendRequest(db, actor, body) {
  const targetUid = normalizeText(body.targetUid || '', 128);
  if (!targetUid) return { statusCode: 400, payload: { error: 'Missing target user.' } };

  const requestState = await getFriendRequestDoc(db, actor.uid, targetUid);
  if (!requestState.exists) return { statusCode: 404, payload: { error: 'Friend request not found.' } };
  if (String(requestState.data.targetUid || '') !== actor.uid) {
    return { statusCode: 403, payload: { error: 'Only the recipient can accept this request.' } };
  }

  await requestState.ref.set({
    status: 'accepted',
    acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    acceptedByUid: actor.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return { statusCode: 200, payload: { ok: true, requestId: requestState.requestId } };
}

async function rejectFriendRequest(db, actor, body) {
  const targetUid = normalizeText(body.targetUid || '', 128);
  if (!targetUid) return { statusCode: 400, payload: { error: 'Missing target user.' } };

  const requestState = await getFriendRequestDoc(db, actor.uid, targetUid);
  if (!requestState.exists) return { statusCode: 404, payload: { error: 'Friend request not found.' } };
  if (String(requestState.data.targetUid || '') !== actor.uid) {
    return { statusCode: 403, payload: { error: 'Only the recipient can reject this request.' } };
  }

  await requestState.ref.set({
    status: 'rejected',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return { statusCode: 200, payload: { ok: true, requestId: requestState.requestId } };
}

async function cancelFriendRequest(db, actor, body) {
  const targetUid = normalizeText(body.targetUid || '', 128);
  if (!targetUid) return { statusCode: 400, payload: { error: 'Missing target user.' } };

  const requestState = await getFriendRequestDoc(db, actor.uid, targetUid);
  if (!requestState.exists) return { statusCode: 404, payload: { error: 'Friend request not found.' } };
  if (String(requestState.data.requesterUid || '') !== actor.uid) {
    return { statusCode: 403, payload: { error: 'Only the requester can cancel this request.' } };
  }

  await requestState.ref.set({
    status: 'cancelled',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return { statusCode: 200, payload: { ok: true, requestId: requestState.requestId } };
}

async function applyForAdmin(db, actor, body) {
  const reason = normalizeText(body.reason || '', 1400);
  const experience = normalizeText(body.experience || '', 700);
  if (!reason || reason.length < 20) {
    return { statusCode: 400, payload: { error: 'Please provide at least 20 characters for your admin application.' } };
  }

  const appRef = db.collection('adminApplications').doc(actor.uid);
  const existing = await appRef.get();
  const existingData = existing.exists ? (existing.data() || {}) : {};
  const existingStatus = String(existingData.status || '').toLowerCase();
  if (existingStatus === 'pending') {
    return { statusCode: 200, payload: { ok: true, alreadyPending: true } };
  }

  await appRef.set({
    uid: actor.uid,
    applicantEmail: actor.email,
    applicantName: normalizeText(actor.name || actor.email.split('@')[0] || 'Agent', 120),
    reason,
    experience,
    status: 'pending',
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return { statusCode: 200, payload: { ok: true } };
}

async function getGuildStaffMembers(db, roles) {
  const adminEmails = Array.isArray(roles.admins) ? roles.admins.map(value => String(value || '').toLowerCase()) : [];
  const modEmails = Array.isArray(roles.mods) ? roles.mods.map(value => String(value || '').toLowerCase()) : [];
  const ownerEmails = Array.isArray(roles.owners) ? roles.owners.map(value => String(value || '').toLowerCase()) : [];
  const allEmails = [...new Set([...ownerEmails, ...adminEmails, ...modEmails])];
  const userMap = await fetchUsersByEmails(db, allEmails);

  return allEmails.map(email => {
    const user = userMap.get(email) || {};
    return {
      uid: String(user.uid || user.id || ''),
      email,
      displayName: normalizeText(user.displayName || email.split('@')[0] || 'Agent', 120),
      role: ownerEmails.includes(email) ? 'owner' : (adminEmails.includes(email) ? 'chief_administrator' : 'moderator')
    };
  }).filter(member => member.uid);
}

async function syncGuildStaffThread(db, roles) {
  const members = await getGuildStaffMembers(db, roles);
  const threadRef = db.collection('dmThreads').doc('guild-staff');
  const existing = await threadRef.get();
  const existingData = existing.exists ? (existing.data() || {}) : {};

  await threadRef.set({
    participants: members.map(member => member.uid),
    participantEmails: members.map(member => member.email),
    participantNames: members.map(member => member.displayName),
    participantRoles: members.map(member => member.role),
    threadKind: 'guild-staff',
    title: 'Guild Staff Channel',
    ownerUid: '',
    ownerConversationOpen: true,
    lastMessageAt: existingData.lastMessageAt || existingData.updatedAt || null,
    lastMessageBy: existingData.lastMessageBy || '',
    lastMessagePreview: existingData.lastMessagePreview || '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { threadId: 'guild-staff', members };
}

async function readThreadMessages(db, actor, peerUid) {
  const roles = await getRolesData(db);
  if (peerUid === 'guild-staff') {
    if (!isModeratorEmail(actor.email, roles)) {
      return { threadId: 'guild-staff', thread: null, messages: [] };
    }
    await syncGuildStaffThread(db, roles);
  }
  const threadId = makeThreadId(actor.uid, peerUid);
  const actualThreadId = peerUid === 'guild-staff' ? 'guild-staff' : threadId;
  const threadRef = db.collection('dmThreads').doc(actualThreadId);
  const threadSnap = await threadRef.get();
  if (!threadSnap.exists) {
    return { threadId: actualThreadId, thread: null, messages: [] };
  }

  const thread = threadSnap.data() || {};
  if (peerUid !== 'guild-staff' && (!Array.isArray(thread.participants) || !thread.participants.includes(actor.uid))) {
    return { threadId: actualThreadId, thread: null, messages: [] };
  }


  const peerMessageSnap = await threadRef.collection('messages').orderBy('createdAt', 'asc').limit(200).get();
  return {
    threadId: actualThreadId,
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

  const reportPayload = {
    reporterUid: actor.uid,
    reporterEmail: actor.email,
    reporterName: normalizeText(actor.name || actor.email.split('@')[0] || 'Agent', 120),
    targetUid,
    targetEmail: String((targetSnap.data() || {}).email || ''),
    targetDisplayName: normalizeText((targetSnap.data() || {}).displayName || '', 120),
    reason,
    type: 'user',
    targetId: targetUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'open'
  };

  await Promise.all([
    db.collection('userReports').add(reportPayload),
    db.collection('reports').add(reportPayload)
  ]);

  return { statusCode: 200, payload: { ok: true } };
}

async function reportMessage(db, actor, body) {
  const targetUid = normalizeText(body.targetUid || '', 128);
  const reason = normalizeText(body.reason || '', 500);
  const messageId = normalizeText(body.messageId || '', 128);
  const messageText = normalizeText(body.messageText || '', 1200);
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

  const targetData = targetSnap.data() || {};
  const reportPayload = {
    reporterUid: actor.uid,
    reporterEmail: actor.email,
    reporterName: normalizeText(actor.name || actor.email.split('@')[0] || 'Agent', 120),
    reportedUid: targetUid,
    reportedEmail: String(targetData.email || ''),
    reportedName: normalizeText(targetData.displayName || targetData.email || 'Agent', 120),
    messageId,
    reportedContent: messageText,
    reason,
    type: 'message',
    targetId: messageId || targetUid,
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await Promise.all([
    db.collection('dmReports').add(reportPayload),
    db.collection('reports').add(reportPayload)
  ]);

  return { statusCode: 200, payload: { ok: true } };
}

async function reportPage(db, actor, body) {
  const pageId = normalizeText(body.pageId || '', 128);
  const pageSlug = normalizeText(body.pageSlug || '', 256);
  const pageTitle = normalizeText(body.pageTitle || '', 256);
  const reason = normalizeText(body.reason || '', 500);
  if (!pageId && !pageSlug) {
    return { statusCode: 400, payload: { error: 'Missing page identifier.' } };
  }
  if (!reason) {
    return { statusCode: 400, payload: { error: 'Report reason cannot be empty.' } };
  }

  // Get page data if we have pageId
  let pageData = {};
  if (pageId) {
    const pageDoc = await db.collection('pages').doc(pageId).get();
    if (pageDoc.exists) {
      pageData = pageDoc.data() || {};
    }
  }

  const reportPayload = {
    pageId: pageId || '',
    pageSlug: pageSlug || pageData.slug || '',
    pageTitle: pageTitle || pageData.title || '',
    reason,
    reporterUid: actor.uid,
    reporterEmail: actor.email,
    reporterName: normalizeText(actor.name || actor.email.split('@')[0] || 'Agent', 120),
    type: 'page',
    targetId: pageId || pageSlug || '',
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await Promise.all([
    db.collection('pageReports').add(reportPayload),
    db.collection('reports').add(reportPayload)
  ]);

  return { statusCode: 200, payload: { ok: true } };
}

async function enforceEditorApplicationRateLimit(db, uid, ip) {
  const metaRef = db.collection('rateLimits').doc(uid);
  const now = Date.now();
  const windowMs = 30 * 24 * 60 * 60 * 1000;

  await db.runTransaction(async tx => {
    const snap = await tx.get(metaRef);
    const data = snap.exists ? (snap.data() || {}) : {};
    const lastSubmittedAt = data.lastRoleApplicationAt && typeof data.lastRoleApplicationAt.toMillis === 'function'
      ? data.lastRoleApplicationAt.toMillis()
      : 0;
    if (lastSubmittedAt && (now - lastSubmittedAt) < windowMs) {
      const err = new Error('You can submit only one contribution application every 30 days.');
      err.statusCode = 429;
      throw err;
    }

    tx.set(metaRef, {
      roleApplicationCount: Number(data.roleApplicationCount || 0) + 1,
      lastRoleApplicationAt: admin.firestore.Timestamp.fromMillis(now),
      lastRoleApplicationIp: String(ip || 'unknown'),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

async function applyForEditor(db, actor, body, req) {
  const reason = normalizeText(body.reason || '', 1400);
  const experience = normalizeText(body.experience || '', 700);
  const roles = await getRolesData(db);
  const requestedRole = normalizeApplicationRole(body.roleApplied || body.requestedRole || ROLES.CONTRIBUTOR);

  if (!requestedRole) {
    return { statusCode: 400, payload: { error: 'Choose a valid role from Contributor to Chief Admin.' } };
  }

  if (isOwnerEmail(actor.email, roles) || isAdminEmail(actor.email, roles) || isModeratorEmail(actor.email, roles)) {
    return { statusCode: 200, payload: { ok: true, alreadyApproved: true, message: 'Your staff role already grants submission access.' } };
  }

  if (!reason || reason.length < 20) {
    return { statusCode: 400, payload: { error: 'Please provide at least 20 characters for your editor application.' } };
  }

  const userSnap = await db.collection('users').doc(actor.uid).get();
  const userData = userSnap.exists ? (userSnap.data() || {}) : {};
  const currentRole = normalizeRole(userData.role || 'newbie');
  if (isAtLeast(currentRole, requestedRole) || userData.submissionAccess === true) {
    return { statusCode: 200, payload: { ok: true, alreadyApproved: true } };
  }

  await enforceEditorApplicationRateLimit(db, actor.uid, getRequestIp(req));

  const appRef = db.collection('applications').doc(actor.uid);
  const existing = await appRef.get();
  const existingData = existing.exists ? (existing.data() || {}) : {};
  const existingStatus = String(existingData.status || '').toLowerCase();
  if (existingStatus === 'pending') {
    return { statusCode: 200, payload: { ok: true, alreadyPending: true } };
  }

  const nowField = admin.firestore.FieldValue.serverTimestamp();
  const appPayload = {
    uid: actor.uid,
    applicantEmail: actor.email,
    applicantName: normalizeText(actor.name || actor.email.split('@')[0] || 'Agent', 120),
    applicantRole: currentRole,
    roleApplied: requestedRole,
    roleAppliedLabel: roleLabel(requestedRole),
    allowedRoles: PUBLIC_ROLE_LADDER.filter(role => role !== ROLES.NEWBIE),
    reason,
    experience,
    status: 'pending',
    applicationType: 'role_ladder',
    submittedAt: nowField,
    updatedAt: nowField,
    reviewedAt: null,
    reviewedBy: '',
    decisionNote: ''
  };

  await Promise.all([
    appRef.set(appPayload, { merge: true }),
    db.collection('editorApplications').doc(actor.uid).set(appPayload, { merge: true }),
    db.collection('users').doc(actor.uid).set({
      lastApplicationAt: nowField,
      updatedAt: nowField
    }, { merge: true })
  ]);

  return { statusCode: 200, payload: { ok: true, roleApplied: requestedRole } };
}

async function getUnifiedReports(db, actor) {
  const roles = await getRolesData(db);
  if (!isModeratorEmail(actor.email, roles)) {
    return { statusCode: 403, payload: { error: 'Moderator access required.' } };
  }

  const snap = await db.collection('reports').orderBy('createdAt', 'desc').limit(300).get();
  const reports = snap.docs.map(doc => ({ id: doc.id, ...(toPlainValue(doc.data()) || {}) }));
  return { statusCode: 200, payload: { reports } };
}

async function setReportStatus(db, actor, body) {
  const roles = await getRolesData(db);
  if (!isModeratorEmail(actor.email, roles)) {
    return { statusCode: 403, payload: { error: 'Moderator access required.' } };
  }

  const id = normalizeText(body.reportId || body.id || '', 128);
  const status = normalizeText(body.status || '', 30).toLowerCase();
  const note = normalizeText(body.note || '', 600);
  const allowed = new Set(['open', 'reviewed', 'resolved', 'escalated']);
  if (!id) return { statusCode: 400, payload: { error: 'Missing report id.' } };
  if (!allowed.has(status)) return { statusCode: 400, payload: { error: 'Invalid report status.' } };

  await db.collection('reports').doc(id).set({
    status,
    actionNote: note,
    reviewedBy: actor.email,
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { statusCode: 200, payload: { ok: true } };
}

async function revokeContributor(db, actor, body) {
  const roles = await getRolesData(db);
  if (!isModeratorEmail(actor.email, roles)) {
    return { statusCode: 403, payload: { error: 'Moderator access required.' } };
  }

  const actorUserRef = db.collection('users').doc(actor.uid);
  const actorUserSnap = await actorUserRef.get();
  const actorUserData = actorUserSnap.exists ? (actorUserSnap.data() || {}) : {};
  const existingLock = actorUserData.moderationLock && typeof actorUserData.moderationLock === 'object'
    ? actorUserData.moderationLock
    : null;
  const nowMillis = Date.now();
  const lockUntilMillis = existingLock && existingLock.lockedUntil && typeof existingLock.lockedUntil.toMillis === 'function'
    ? existingLock.lockedUntil.toMillis()
    : 0;
  if (existingLock && existingLock.active === true && (!lockUntilMillis || nowMillis < lockUntilMillis)) {
    return {
      statusCode: 423,
      payload: {
        error: 'Account temporarily locked for contributor-removal abuse review. Contact the Archivist.',
        code: 'MODERATION_LOCKED'
      }
    };
  }

  const targetUid = normalizeText(body.targetUid || body.uid || '', 128);
  if (!targetUid) return { statusCode: 400, payload: { error: 'Missing target user.' } };

  const targetRef = db.collection('users').doc(targetUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) return { statusCode: 404, payload: { error: 'Target user not found.' } };

  const target = targetSnap.data() || {};
  const targetRole = normalizeRole(target.role || 'newbie');
  if (targetRole !== ROLES.CONTRIBUTOR && targetRole !== ROLES.NEWBIE) {
    return { statusCode: 403, payload: { error: 'Only contributor role can be revoked by this action.' } };
  }

  const guardRef = db.collection('moderationRateGuards').doc(actor.uid);
  const guardWindowMs = 30 * 1000;
  const guardLimit = 5;
  const lockMinutes = 60;

  const guardResult = await db.runTransaction(async tx => {
    const guardSnap = await tx.get(guardRef);
    const guardData = guardSnap.exists ? (guardSnap.data() || {}) : {};
    const previous = Array.isArray(guardData.contributorRevocationsMs)
      ? guardData.contributorRevocationsMs.map(n => Number(n)).filter(n => Number.isFinite(n))
      : [];
    const recent = previous.filter(ts => (nowMillis - ts) <= guardWindowMs);
    const nextCount = recent.length + 1;
    const shouldLock = nextCount >= guardLimit;
    const lockedUntilTs = shouldLock
      ? admin.firestore.Timestamp.fromMillis(nowMillis + (lockMinutes * 60 * 1000))
      : null;

    const nextTimestamps = recent.concat(nowMillis).slice(-guardLimit);
    tx.set(guardRef, {
      contributorRevocationsMs: nextTimestamps,
      contributorRevocationCount: Number(guardData.contributorRevocationCount || 0) + 1,
      contributorRevocationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastRevocationAtMs: nowMillis,
      lastRevocationBy: actor.email
    }, { merge: true });

    if (shouldLock) {
      tx.set(actorUserRef, {
        moderationLock: {
          active: true,
          reason: 'contributor-revocation-spike',
          threshold: guardLimit,
          windowMs: guardWindowMs,
          reviewStatus: 'pending-investigation',
          lockedBySystem: true,
          lockedUntil: lockedUntilTs,
          lockedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return { shouldLock, nextCount, lockedUntilTs };
  });

  await targetRef.set({
    role: ROLES.NEWBIE,
    roleName: roleLabel(ROLES.NEWBIE),
    submissionAccess: false,
    submissionAccessStatus: 'revoked',
    contributorGranted: false,
    roleRevokedBy: actor.email,
    roleRevokedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  if (guardResult.shouldLock) {
    await db.collection('moderationInvestigations').add({
      type: 'contributor-revocation-spike',
      status: 'open',
      severity: 'high',
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorName: normalizeText(actor.name || actor.email.split('@')[0] || 'Agent', 120),
      eventCount: guardResult.nextCount,
      threshold: guardLimit,
      windowMs: guardWindowMs,
      notes: 'Automatic lock triggered due to high-frequency contributor revocations.',
      triggeredAt: admin.firestore.FieldValue.serverTimestamp(),
      lockedUntil: guardResult.lockedUntilTs || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      statusCode: 423,
      payload: {
        ok: true,
        locked: true,
        error: 'Contributor removed, but your account is now locked for investigation due to rapid revocations.'
      }
    };
  }

  return { statusCode: 200, payload: { ok: true } };
}

async function listContributors(db, actor) {
  const roles = await getRolesData(db);
  if (!isModeratorEmail(actor.email, roles)) {
    return { statusCode: 403, payload: { error: 'Moderator access required.' } };
  }

  const byRole = await db.collection('users').where('role', '==', ROLES.CONTRIBUTOR).limit(300).get();
  const byAccess = await db.collection('users').where('submissionAccess', '==', true).limit(300).get();
  const map = new Map();
  byRole.docs.forEach(doc => map.set(doc.id, { id: doc.id, ...(toPlainValue(doc.data()) || {}) }));
  byAccess.docs.forEach(doc => {
    const data = toPlainValue(doc.data()) || {};
    const role = normalizeRole(data.role || 'newbie');
    if (role === ROLES.CONTRIBUTOR) {
      map.set(doc.id, { id: doc.id, ...data });
    }
  });

  return { statusCode: 200, payload: { contributors: Array.from(map.values()) } };
}

async function assignRole(db, actor, body) {
  const rolesRef = db.collection('config').doc('roles');
  const roles = await getRolesData(db);
  // Only owners or admins may assign roles
  if (!isAdminEmail(actor.email, roles) && !isOwnerEmail(actor.email, roles)) {
    return { statusCode: 403, payload: { error: 'Admin or Owner access required.' } };
  }

  const email = String((body.email || '').trim()).toLowerCase();
  const rawRole = String((body.role || '').trim());
  if (!email || !rawRole) return { statusCode: 400, payload: { error: 'Missing email or role.' } };

  const normalized = normalizeRole(rawRole);
  if (!normalized) return { statusCode: 400, payload: { error: 'Invalid role.' } };

  // Transactionally update config/roles and the user's users/{uid} doc if present
  try {
    await db.runTransaction(async tx => {
      const rolesSnap = await tx.get(rolesRef);
      const rd = rolesSnap.exists ? (rolesSnap.data() || {}) : {};
      const owners = Array.isArray(rd.owners) ? rd.owners.filter(Boolean).map(e => String(e).toLowerCase()) : [];
      const admins = Array.isArray(rd.admins) ? rd.admins.filter(Boolean).map(e => String(e).toLowerCase()) : [];
      const mods = Array.isArray(rd.mods) ? rd.mods.filter(Boolean).map(e => String(e).toLowerCase()) : [];
      const userRoles = Object.assign({}, rd.userRoles || {});

      // Remove email from arrays to avoid duplicates
      const without = arr => arr.filter(e => String(e).toLowerCase() !== email);
      const nextOwners = without(owners);
      const nextAdmins = without(admins);
      const nextMods = without(mods);

      // Assign into appropriate container
      if (normalized === 'owner') nextOwners.push(email);
      else if (['administrator','senior_administrator','deputy_chief_administrator','chief_administrator'].includes(normalized)) nextAdmins.push(email);
      else if (['moderator','senior_moderator','deputy_chief_of_moderation','chief_of_moderation'].includes(normalized)) nextMods.push(email);

      // Update userRoles map (single role per user)
      userRoles[email] = normalized === 'newbie' ? undefined : normalized;
      if (userRoles[email] === undefined) delete userRoles[email];

      tx.set(rolesRef, {
        owners: nextOwners,
        admins: nextAdmins,
        mods: nextMods,
        userRoles: userRoles,
        adminAppointments: rd.adminAppointments || {}
      }, { merge: true });

      // If a users doc exists, update it to reflect the canonical role
      const userSnap = await tx.get(db.collection('users').where('email', '==', email).limit(1));
      if (!userSnap.empty) {
        const doc = userSnap.docs[0];
        const uid = doc.id;
        const roleName = roleLabel(normalized);
        const updates = {
          role: normalized,
          roleName: roleName,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if (normalized === 'contributor') {
          updates.contributorGranted = true;
          updates.submissionAccess = true;
          updates.submissionAccessStatus = 'granted';
        } else {
          updates.contributorGranted = false;
          updates.submissionAccess = false;
          updates.submissionAccessStatus = 'revoked';
        }
        tx.set(db.collection('users').doc(uid), updates, { merge: true });
      }
    });
  } catch (err) {
    return { statusCode: 500, payload: { error: 'Failed to assign role: ' + String(err.message || err) } };
  }

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

    if (method === 'GET' && type === 'profile') {
      let actor = null;
      try {
        actor = await verifyUser(req);
      } catch (e) {
        // Continue unauthenticated
      }
      const profile = await getPublicProfileByUid(db, req.query?.uid || '', actor);
      return sendJson(res, 200, { profile });
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

    if (method === 'GET' && type === 'friendrequests') {
      const requests = await listFriendRequests(db, actor);
      return sendJson(res, 200, requests);
    }

    if (method === 'GET' && type === 'reports') {
      const result = await getUnifiedReports(db, actor);
      return sendJson(res, result.statusCode, result.payload);
    }

    if (method === 'GET' && type === 'contributors') {
      const result = await listContributors(db, actor);
      return sendJson(res, result.statusCode, result.payload);
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

      if (action === 'addfriend') {
        const result = await addFriendRequest(db, actor, body);
        return sendJson(res, result.statusCode, result.payload);
      }

      if (action === 'acceptfriend') {
        const result = await acceptFriendRequest(db, actor, body);
        return sendJson(res, result.statusCode, result.payload);
      }

      if (action === 'rejectfriend') {
        const result = await rejectFriendRequest(db, actor, body);
        return sendJson(res, result.statusCode, result.payload);
      }

      if (action === 'cancelfriend') {
        const result = await cancelFriendRequest(db, actor, body);
        return sendJson(res, result.statusCode, result.payload);
      }

      if (action === 'applyeditor' || action === 'applyadmin') {
        const result = await applyForEditor(db, actor, body, req);
        return sendJson(res, result.statusCode, result.payload);
      }

      if (action === 'reportmessage') {
        const result = await reportMessage(db, actor, body);
        return sendJson(res, result.statusCode, result.payload);
      }

      if (action === 'reportpage') {
        const result = await reportPage(db, actor, body);
        return sendJson(res, result.statusCode, result.payload);
      }

      if (action === 'setreportstatus') {
        const result = await setReportStatus(db, actor, body);
        return sendJson(res, result.statusCode, result.payload);
      }

      if (action === 'revokecontributor') {
        const result = await revokeContributor(db, actor, body);
        return sendJson(res, result.statusCode, result.payload);
      }
      if (action === 'assignrole') {
        const result = await assignRole(db, actor, body);
        return sendJson(res, result.statusCode, result.payload);
      }

      return sendJson(res, 400, { error: 'Missing social action.' });
    }

    return sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    return sendJson(res, Number(err.statusCode || 500), { error: err.message || 'Server error.' });
  }
};
