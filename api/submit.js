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

function getRequestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['x-vercel-forwarded-for'] || '');
  if (forwarded) return forwarded.split(',')[0].trim();
  return String(req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown');
}

function sanitizeHtmlContent(html) {
  let clean = String(html || '');
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  clean = clean.replace(/javascript\s*:/gi, 'blocked:');
  clean = clean.replace(/<\s*\/?\s*(iframe|object|embed|applet|meta|link)\b[^>]*>/gi, '');
  return clean;
}

function sanitizeCssOrThrow(css) {
  const source = String(css || '');
  if (/url\s*\(/i.test(source) || /@import\b/i.test(source) || /expression\s*\(/i.test(source)) {
    const err = new Error('CSS may not contain url(), @import, or expression().');
    err.statusCode = 400;
    throw err;
  }
  return source;
}

function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.map(tag => String(tag || '').trim()).filter(Boolean) : [];
}

const ANOMALY_SUBTYPE_RULES = {
  ROS: {
    label: 'Red Oaker Specimen',
    listKey: 'ROS',
    hint: 'ROS format: ROS-0001 (digits only after ROS-).',
    pattern: /^ROS-\d{1,4}$/
  },
  SLOA: {
    label: 'Specimen Linked Anomalous Object',
    listKey: 'SLOA',
    hint: 'SLOA format: SLOA-001A (1-3 digits + trailing letter).',
    pattern: /^SLOA-\d{1,3}[A-Z]$/
  },
  SOA: {
    label: 'Sentient or Accursed Object',
    listKey: 'SOA',
    hint: 'SOA format: SOA-0001 (digits only after SOA-).',
    pattern: /^SOA-\d{1,4}$/
  },
  SCTOR: {
    label: 'Standard Cross Testing Operations Report',
    listKey: 'SCTOR',
    hint: 'SCTOR format: SCTOR: 01',
    pattern: /^SCTOR:\s*\d{2,}$/
  },
  TL: {
    label: 'Termination Logs',
    listKey: 'TL',
    hint: 'TL format: TL: 01',
    pattern: /^TL:\s*\d{2,}$/
  }
};

function validateAnomalyPayloadOrThrow(payload, options = {}) {
  if (payload.type !== 'Anomaly') return;

  const subtype = String(payload.anomalySubtype || '').toUpperCase().trim();
  const anomalyId = String(payload.anomalyId || '').toUpperCase().trim();
  const rule = ANOMALY_SUBTYPE_RULES[subtype];

  if (!rule) {
    const err = new Error('Please select a valid anomaly submission type.');
    err.statusCode = 400;
    throw err;
  }

  if (!rule.pattern.test(anomalyId)) {
    const err = new Error(rule.hint);
    err.statusCode = 400;
    throw err;
  }

  payload.anomalySubtype = subtype;
  payload.anomalyId = anomalyId;
  payload.anomalyListKey = rule.listKey;
  payload.anomalySubtypeLabel = rule.label;

  if (options.enforceTitlePrefix) {
    const title = String(payload.title || '').toUpperCase().trim();
    if (!title.startsWith(anomalyId)) {
      const err = new Error('Anomaly titles must begin with the exact designation.');
      err.statusCode = 400;
      throw err;
    }
  }
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

  return { uid, email: String(decoded.email || ''), name: String(decoded.name || decoded.displayName || '') };
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

function stripUndefined(data) {
  return Object.fromEntries(Object.entries(data || {}).filter(([, value]) => value !== undefined));
}

function toPlainValue(value) {
  if (!value) return value;
  if (typeof value.toDate === 'function' && typeof value.seconds === 'number') {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (Array.isArray(value)) {
    return value.map(toPlainValue);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toPlainValue(child)]));
  }
  return value;
}

function buildSubmissionPayload(body, actor) {
  const payload = body && body.submission ? body.submission : body || {};
  const title = String(payload.title || '').trim();
  const slug = String(payload.slug || '').trim();
  const htmlContent = sanitizeHtmlContent(payload.htmlContent || '');
  const cssContent = sanitizeCssOrThrow(payload.cssContent || '');
  const anomalySubtype = String(payload.anomalySubtype || '').toUpperCase().trim();
  const anomalyId = String(payload.anomalyId || '').toUpperCase().trim();
  return {
    title,
    anomalyId,
    anomalySubtype,
    anomalySubtypeLabel: String(payload.anomalySubtypeLabel || '').trim(),
    anomalyListKey: String(payload.anomalyListKey || '').trim(),
    type: String(payload.type || 'Page').trim(),
    tags: normalizeTags(payload.tags),
    slug,
    htmlContent,
    cssContent,
    imageUrls: Array.isArray(payload.imageUrls) ? payload.imageUrls.filter(Boolean).map(String) : [],
    imageAssets: Array.isArray(payload.imageAssets)
      ? payload.imageAssets
          .map(asset => ({
            url: String(asset && asset.url || '').trim(),
            alt: String(asset && asset.alt || '').trim(),
            caption: String(asset && asset.caption || '').trim()
          }))
          .filter(asset => asset.url)
      : [],
    authorUid: actor.uid,
    authorEmail: actor.email,
    authorName: String(payload.authorName || actor.name || actor.email.split('@')[0] || 'Agent').trim(),
    status: String(payload.status || 'pending').trim(),
    currentMode: String(payload.currentMode || '').trim(),
    draftTrigger: String(payload.draftTrigger || '').trim(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    submittedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

async function enforceRateLimit(db, uid, ip) {
  const metaRef = db.collection('submissions_meta').doc(uid);
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000;

  await db.runTransaction(async tx => {
    const snap = await tx.get(metaRef);
    const data = snap.exists ? (snap.data() || {}) : {};
    const windowStart = data.windowStart && typeof data.windowStart.toMillis === 'function'
      ? data.windowStart.toMillis()
      : 0;
    const expired = !windowStart || (now - windowStart) >= windowMs;
    const count = expired ? 0 : Number(data.count || 0);

    if (count >= 3) {
      const err = new Error('Submission limit reached. Try again tomorrow.');
      err.statusCode = 429;
      throw err;
    }

    tx.set(metaRef, {
      count: count + 1,
      windowStart: expired ? admin.firestore.Timestamp.fromMillis(now) : data.windowStart,
      lastIp: ip,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

async function checkDuplicateSubmission(db, submissionId, payload, ignorePageId = '') {
  if (!payload.slug) return;

  const pageQuery = await db.collection('pages').where('slug', '==', payload.slug).limit(1).get();
  if (!pageQuery.empty && pageQuery.docs.some(doc => doc.id !== ignorePageId)) {
    const err = new Error('That slug is already in use by a published page.');
    err.statusCode = 409;
    throw err;
  }

  const submissionQuery = await db.collection('submissions').where('slug', '==', payload.slug).limit(5).get();
  const conflict = submissionQuery.docs.some(doc => doc.id !== submissionId);
  if (conflict) {
    const err = new Error('That slug is already in use by another submission.');
    err.statusCode = 409;
    throw err;
  }

  if (payload.type === 'Anomaly' && payload.anomalyId) {
    const pageAnomaly = await db.collection('pages').where('anomalyId', '==', payload.anomalyId).limit(1).get();
    const submissionAnomaly = await db.collection('submissions').where('anomalyId', '==', payload.anomalyId).limit(10).get();
    const anomalyConflict = (!pageAnomaly.empty && pageAnomaly.docs.some(doc => doc.id !== ignorePageId)) || submissionAnomaly.docs.some(doc => doc.id !== submissionId && String((doc.data() || {}).status || '') === 'pending');
    if (anomalyConflict) {
      const err = new Error('That anomaly designation is already in use or pending review.');
      err.statusCode = 409;
      throw err;
    }
  }
}

async function listOwnSubmissions(db, uid) {
  const snap = await db.collection('submissions').where('authorUid', '==', uid).get();
  return snap.docs
    .map(doc => ({ id: doc.id, data: doc.data() }))
    .sort((a, b) => {
      const aTime = a.data.updatedAt?.seconds || a.data.submittedAt?.seconds || 0;
      const bTime = b.data.updatedAt?.seconds || b.data.submittedAt?.seconds || 0;
      return bTime - aTime;
    });
}

module.exports = async function handler(req, res) {
  try {
    const app = initAdmin();
    const db = admin.firestore(app);
    const actor = await verifyUser(req);
    const method = String(req.method || 'GET').toUpperCase();

    if (method === 'GET') {
      const query = req.query || {};
      if (query.id) {
        const doc = await db.collection('submissions').doc(String(query.id)).get();
        if (!doc.exists) {
          return sendJson(res, 404, { error: 'Submission not found.' });
        }
        const data = doc.data() || {};
        const adminAccess = await isAdminUser(db, actor.uid, actor.email);
        if (!adminAccess && data.authorUid !== actor.uid) {
          return sendJson(res, 403, { error: 'Forbidden.' });
        }
        return sendJson(res, 200, { id: doc.id, data: toPlainValue(data) });
      }

      const submissions = await listOwnSubmissions(db, actor.uid);
      return sendJson(res, 200, {
        submissions: submissions.map(entry => ({ id: entry.id, data: toPlainValue(entry.data) }))
      });
    }

    if (method === 'DELETE') {
      const body = req.body || {};
      const id = String(body.id || req.query?.id || '').trim();
      if (!id) return sendJson(res, 400, { error: 'Missing submission id.' });

      const docRef = db.collection('submissions').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) return sendJson(res, 404, { error: 'Submission not found.' });

      const data = doc.data() || {};
      const adminAccess = await isAdminUser(db, actor.uid, actor.email);
      if (!adminAccess && data.authorUid !== actor.uid) {
        return sendJson(res, 403, { error: 'Forbidden.' });
      }

      await docRef.delete();
      return sendJson(res, 200, { ok: true });
    }

    if (method !== 'POST') {
      return sendJson(res, 405, { error: 'Method not allowed.' });
    }

    const body = req.body || {};
    const action = String(body.action || 'submit').trim();
    const submissionId = String(body.submissionId || body.id || '').trim();
    const submissionRef = submissionId ? db.collection('submissions').doc(submissionId) : db.collection('submissions').doc();
    const adminAccess = await isAdminUser(db, actor.uid, actor.email);

    if (action === 'draft') {
      const payload = buildSubmissionPayload(body, actor);
      payload.status = 'draft';

      if (submissionId) {
        const existing = await submissionRef.get();
        if (existing.exists) {
          const current = existing.data() || {};
          if (!adminAccess && current.authorUid !== actor.uid) {
            return sendJson(res, 403, { error: 'Forbidden.' });
          }
        }
      }

      await submissionRef.set(stripUndefined(payload), { merge: true });
      return sendJson(res, 200, { id: submissionRef.id, status: 'draft' });
    }

    if (action === 'submit' || action === 'publish') {
      const payload = buildSubmissionPayload(body, actor);
      payload.status = action === 'publish' ? 'approved' : 'pending';

      validateAnomalyPayloadOrThrow(payload, { enforceTitlePrefix: true });

      if (action === 'publish' && !adminAccess) {
        return sendJson(res, 403, { error: 'Admin access required.' });
      }

      await checkDuplicateSubmission(db, submissionRef.id, payload, body.pageId ? String(body.pageId) : '');
      if (action === 'submit') {
        await enforceRateLimit(db, actor.uid, getRequestIp(req));
      }

      if (action === 'publish') {
        const pagePayload = stripUndefined({
          title: payload.title,
          anomalyId: payload.anomalyId,
          anomalySubtype: payload.anomalySubtype,
          anomalySubtypeLabel: payload.anomalySubtypeLabel,
          anomalyListKey: payload.anomalyListKey,
          type: payload.type,
          tags: payload.tags,
          slug: payload.slug,
          htmlContent: payload.htmlContent,
          cssContent: payload.cssContent,
          imageUrls: payload.imageUrls,
          imageAssets: payload.imageAssets,
          authorUid: actor.uid,
          authorEmail: actor.email,
          authorName: payload.authorName,
          approvedBy: String(body.reviewerName || actor.name || actor.email || 'Admin'),
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          featured: false,
          status: 'approved'
        });

        const pageId = String(body.pageId || '').trim();
        if (pageId) {
          await db.collection('pages').doc(pageId).set(pagePayload, { merge: true });
        } else {
          const pageRef = await db.collection('pages').add(pagePayload);
          body.pageId = pageRef.id;
        }

        await submissionRef.set(stripUndefined({
          ...payload,
          status: 'approved',
          approvedPageId: body.pageId || pageId || null,
          reviewedBy: String(body.reviewerName || actor.name || actor.email || 'Admin'),
          reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
          autoApproved: true
        }), { merge: true });

        return sendJson(res, 200, { id: submissionRef.id, pageId: body.pageId || pageId || null, status: 'approved' });
      }

      await submissionRef.set(stripUndefined(payload), { merge: true });
      return sendJson(res, 200, { id: submissionRef.id, status: 'pending' });
    }

    return sendJson(res, 400, { error: 'Unknown action.' });
  } catch (err) {
    const statusCode = Number(err.statusCode || 500);
    return sendJson(res, statusCode, { error: err.message || 'Server error.' });
  }
};