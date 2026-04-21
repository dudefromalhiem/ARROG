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

function normalizeMediaItem(item) {
  if (!item || typeof item !== 'object') return null;
  const url = normalizeText(item.url || '', 1000);
  if (!url) return null;
  return {
    url,
    path: normalizeText(item.path || '', 500),
    name: normalizeText(item.name || '', 200),
    type: normalizeText(item.type || '', 120)
  };
}

function normalizeMediaArray(media) {
  if (!Array.isArray(media)) return [];
  return media.map(normalizeMediaItem).filter(Boolean).slice(0, 4);
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

async function verifyUserIfPresent(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    return await verifyUser(req);
  } catch (_err) {
    return null;
  }
}

const BOOTSTRAP_OWNERS = new Set(['jaimejoselaureano@gmail.com', 'dudefromalhiem@gmail.com']);

async function isAdminUser(db, uid, email) {
  const normalizedEmail = String(email || '').toLowerCase();
  if (BOOTSTRAP_OWNERS.has(normalizedEmail)) return true;

  const userDoc = await db.collection('users').doc(uid).get();
  if (userDoc.exists && userDoc.data() && userDoc.data().isAdmin === true) {
    return true;
  }

  const rolesDoc = await db.collection('config').doc('roles').get();
  if (!rolesDoc.exists) return false;
  const owners = Array.isArray(rolesDoc.data()?.owners) ? rolesDoc.data().owners : [];
  return owners.map(owner => String(owner || '').toLowerCase()).includes(normalizedEmail);
}

async function isStaffUser(db, uid, email) {
  const normalizedEmail = String(email || '').toLowerCase();
  if (BOOTSTRAP_OWNERS.has(normalizedEmail)) return true;

  const userDoc = await db.collection('users').doc(uid).get();
  if (userDoc.exists) {
    const userData = userDoc.data() || {};
    if (userData.isAdmin === true || userData.role === 'admin' || userData.role === 'mod') return true;
  }

  const rolesDoc = await db.collection('config').doc('roles').get();
  if (!rolesDoc.exists) return false;
  const roleData = rolesDoc.data() || {};
  const admins = Array.isArray(roleData.admins) ? roleData.admins : [];
  const mods = Array.isArray(roleData.mods) ? roleData.mods : [];
  const owners = Array.isArray(roleData.owners) ? roleData.owners : [];
  return [...admins, ...mods, ...owners].map(value => String(value || '').toLowerCase()).includes(normalizedEmail);
}

async function storeCommentReport(db, actor, body) {
  const id = normalizeText(body.id || '', 128);
  const reason = normalizeText(body.reason || '', 500);
  if (!id) {
    return { statusCode: 400, payload: { error: 'Missing comment id.' } };
  }
  if (!reason) {
    return { statusCode: 400, payload: { error: 'Report reason cannot be empty.' } };
  }

  const ref = db.collection('comments').doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    return { statusCode: 404, payload: { error: 'Comment not found.' } };
  }

  const commentData = doc.data() || {};
  await db.collection('commentReports').add({
    commentId: id,
    pageId: commentData.pageId || '',
    slug: commentData.slug || '',
    pageTitle: commentData.pageTitle || '',
    reason,
    reporterUid: actor.uid,
    reporterEmail: actor.email,
    reporterName: normalizeText(actor.name || actor.email.split('@')[0] || 'Agent', 120),
    reportedUid: String(commentData.authorUid || ''),
    reportedEmail: String(commentData.authorEmail || ''),
    reportedName: normalizeText(commentData.authorName || commentData.authorEmail || 'Agent', 120),
    reportedContent: normalizeText(commentData.content || '', 1200),
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const reportsSnap = await db.collection('commentReports').where('commentId', '==', id).get();
  await ref.set({ reportCount: reportsSnap.size, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  return { statusCode: 200, payload: { ok: true, reportCount: reportsSnap.size } };
}

async function listComments(db, pageId, slug, actor) {
  let query = db.collection('comments');
  if (pageId) {
    query = query.where('pageId', '==', pageId);
  } else {
    query = query.where('slug', '==', slug);
  }

  const snap = await query.limit(300).get();
  let comments = snap.docs.map(doc => ({ id: doc.id, data: toPlainValue(doc.data()) }));

  if (actor && actor.uid) {
    const blocksSnap = await db.collection('blocks').where('blockerUid', '==', actor.uid).limit(500).get();
    const blockedUids = new Set(blocksSnap.docs.map(d => String((d.data() || {}).targetUid || '')).filter(Boolean));
    if (blockedUids.size) {
      comments = comments.filter(entry => !blockedUids.has(String(entry?.data?.authorUid || '')));
    }
  }

  const authorUids = [...new Set(comments.map(entry => String(entry?.data?.authorUid || '')).filter(Boolean))];
  if (authorUids.length) {
    const authorDocs = await Promise.all(authorUids.map(uid => db.collection('users').doc(uid).get()));
    const authorMap = new Map();
    authorDocs.forEach(doc => {
      if (!doc.exists) return;
      authorMap.set(doc.id, doc.data() || {});
    });

    comments = comments.map(entry => {
      const data = entry && entry.data ? entry.data : {};
      const uid = String(data.authorUid || '');
      const profile = authorMap.get(uid) || {};
      return {
        ...entry,
        data: {
          ...data,
          authorName: normalizeText(data.authorName || profile.displayName || data.authorEmail || 'Agent', 120),
          authorPhotoURL: normalizeText(data.authorPhotoURL || profile.photoURL || '', 1200)
        }
      };
    });
  }

  comments.sort((a, b) => {
    const sa = Number(a && a.data && a.data.createdAt && a.data.createdAt.seconds || 0);
    const sb = Number(b && b.data && b.data.createdAt && b.data.createdAt.seconds || 0);
    return sa - sb;
  });
  return comments;
}

module.exports = async function handler(req, res) {
  try {
    const app = initAdmin();
    const db = admin.firestore(app);
    const method = String(req.method || 'GET').toUpperCase();

    if (method === 'GET') {
      const pageId = normalizeText(req.query?.pageId || '', 128);
      const slug = normalizeText(req.query?.slug || '', 160);
      if (!pageId && !slug) {
        return sendJson(res, 400, { error: 'Missing page reference.' });
      }

      const actor = await verifyUserIfPresent(req);
      const comments = await listComments(db, pageId, slug, actor);
      return sendJson(res, 200, { comments });
    }

    const actor = await verifyUser(req);

    if (method === 'POST') {
      const body = req.body || {};
      const action = normalizeText(body.action || '', 20).toLowerCase();

      if (action === 'report') {
        const reportResult = await storeCommentReport(db, actor, body);
        return sendJson(res, reportResult.statusCode, reportResult.payload);
      }

      const pageId = normalizeText(body.pageId || '', 128);
      const slug = normalizeText(body.slug || '', 160);
      const pageTitle = normalizeText(body.pageTitle || '', 220);
      const content = normalizeText(body.content || '', 1200);
      const media = normalizeMediaArray(body.media || []);

      if (!pageId && !slug) {
        return sendJson(res, 400, { error: 'Missing page reference.' });
      }
      if (!content) {
        return sendJson(res, 400, { error: 'Comment cannot be empty.' });
      }

      const userDoc = await db.collection('users').doc(actor.uid).get();
      const userData = userDoc.exists ? (userDoc.data() || {}) : {};

      const payload = {
        pageId,
        slug,
        pageTitle,
        content,
        media,
        authorUid: actor.uid,
        authorEmail: actor.email,
        authorName: normalizeText(body.authorName || userData.displayName || actor.name || actor.email.split('@')[0] || 'Agent', 120),
        authorPhotoURL: normalizeText(userData.photoURL || '', 1200),
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const ref = await db.collection('comments').add(payload);
      const created = await ref.get();
      return sendJson(res, 200, { id: ref.id, data: toPlainValue(created.data()) });
    }

    if (method === 'DELETE') {
      const body = req.body || {};
      const id = normalizeText(body.id || req.query?.id || '', 128);
      if (!id) return sendJson(res, 400, { error: 'Missing comment id.' });

      const ref = db.collection('comments').doc(id);
      const doc = await ref.get();
      if (!doc.exists) return sendJson(res, 404, { error: 'Comment not found.' });

      const data = doc.data() || {};
      const adminAccess = await isStaffUser(db, actor.uid, actor.email);
      const isAuthor = String(data.authorUid || '') === actor.uid;
      if (!adminAccess && !isAuthor) {
        return sendJson(res, 403, { error: 'Forbidden.' });
      }

      await ref.delete();
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'PATCH') {
      const body = req.body || {};
      const id = normalizeText(body.id || '', 128);
      const content = normalizeText(body.content || '', 1200);
      
      if (!id) return sendJson(res, 400, { error: 'Missing comment id.' });
      if (!content) return sendJson(res, 400, { error: 'Comment cannot be empty.' });

      const ref = db.collection('comments').doc(id);
      const doc = await ref.get();
      if (!doc.exists) return sendJson(res, 404, { error: 'Comment not found.' });

      const data = doc.data() || {};
      const isAuthor = String(data.authorUid || '') === actor.uid;
      if (!isAuthor) {
        return sendJson(res, 403, { error: 'Only comment author can edit.' });
      }

      const updatePayload = {
        content,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        editedAt: admin.firestore.FieldValue.serverTimestamp(),
        editedByUid: actor.uid,
        editedByEmail: actor.email
      };

      await ref.set(updatePayload, { merge: true });
      const updated = await ref.get();
      return sendJson(res, 200, { id: ref.id, data: toPlainValue(updated.data()) });
    }

    return sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    return sendJson(res, Number(err.statusCode || 500), { error: err.message || 'Server error.' });
  }
};
