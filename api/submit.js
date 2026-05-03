const admin = require('firebase-admin');
const { ROLES, normalizeRole, isAtLeast } = require('../permissions');
const MAX_TITLE_LENGTH = 160;
const MAX_SLUG_LENGTH = 120;
const MAX_AUTHOR_NAME_LENGTH = 80;
const MAX_TAG_LENGTH = 32;
const MAX_TAGS = 24;
const MAX_HTML_BYTES = 220000;
const MAX_CSS_BYTES = 80000;

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
  if (Buffer.byteLength(clean, 'utf8') > MAX_HTML_BYTES) {
    const err = new Error('HTML payload is too large.');
    err.statusCode = 413;
    throw err;
  }
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  clean = clean.replace(/javascript\s*:/gi, 'blocked:');
  clean = clean.replace(/<\s*\/?\s*(iframe|object|embed|applet|meta|link)\b[^>]*>/gi, '');
  return clean;
}

function sanitizeCssOrThrow(css) {
  const source = String(css || '');
  if (Buffer.byteLength(source, 'utf8') > MAX_CSS_BYTES) {
    const err = new Error('CSS payload is too large.');
    err.statusCode = 413;
    throw err;
  }
  if (/url\s*\(/i.test(source) || /@import\b/i.test(source) || /expression\s*\(/i.test(source)) {
    const err = new Error('CSS may not contain url(), @import, or expression().');
    err.statusCode = 400;
    throw err;
  }
  return source;
}

function sanitizePlainText(input, maxLength) {
  return String(input || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeSlug(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SLUG_LENGTH);
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const normalized = tags
    .map(tag => sanitizePlainText(tag, MAX_TAG_LENGTH).toLowerCase())
    .filter(Boolean);
  return [...new Set(normalized)].slice(0, MAX_TAGS);
}

function determineContentFamily(type) {
  return String(type || '').trim().toLowerCase() === 'lore' ? 'lore' : '';
}

function extractPlainTextExcerpt(html, maxLength = 220) {
  const text = String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength).trim() + '...' : text;
}

function normalizeMediaAssets(assets) {
  return Array.isArray(assets)
    ? assets.map(asset => ({
        kind: String(asset && asset.kind || 'image').toLowerCase(),
        url: String(asset && asset.url || '').trim(),
        alt: String(asset && asset.alt || '').trim(),
        caption: String(asset && asset.caption || '').trim(),
        label: String(asset && asset.label || asset.title || asset.name || '').trim()
      })).filter(asset => asset.url)
    : [];
}

function validateSubmissionMediaOrThrow(payload) {
  const imageAssets = Array.isArray(payload.imageAssets)
    ? payload.imageAssets.filter(asset => asset && asset.url)
    : [];
  const mediaAssets = normalizeMediaAssets(payload.mediaAssets);
  const mediaKinds = new Set(mediaAssets.map(asset => asset.kind));
  const normalizedType = String(payload.type || '').trim().toLowerCase();
  const mediaEnabledTypes = new Set(['tale', 'anomaly', 'guide', 'legacy', 'lore']);
  const requiresMediaGate = !mediaEnabledTypes.has(normalizedType);

  if (imageAssets.length > 5) {
    const err = new Error('Too many image files attached. Maximum is 5 images per submission.');
    err.statusCode = 400;
    throw err;
  }

  if (requiresMediaGate && mediaAssets.length) {
    const err = new Error('Audio and video uploads are only allowed for Tale, Anomaly, Guide, and Legacy submissions.');
    err.statusCode = 400;
    throw err;
  }

  if ([...mediaKinds].some(kind => kind && kind !== 'audio' && kind !== 'video' && kind !== 'image')) {
    const err = new Error('Unsupported media asset kind provided.');
    err.statusCode = 400;
    throw err;
  }

  const audioCount = mediaAssets.filter(asset => asset.kind === 'audio').length;
  const videoCount = mediaAssets.filter(asset => asset.kind === 'video').length;
  if (audioCount > 3 || videoCount > 3) {
    const err = new Error('Too many media files attached. Maximums are 3 audio files and 3 video files.');
    err.statusCode = 400;
    throw err;
  }

  payload.mediaAssets = mediaAssets.filter(asset => asset.kind === 'audio' || asset.kind === 'video');
  payload.mediaUrls = payload.mediaAssets.map(asset => asset.url);
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
    hint: 'SLOA format: SLOA-A000 (letter + 3 digits, up to A999 per letter).',
    pattern: /^SLOA-[A-Z]\d{3}$/
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

async function resolveActorAccessProfile(db, uid, email) {
  const normalizedEmail = String(email || '').toLowerCase();
  if (BOOTSTRAP_OWNERS.has(normalizedEmail)) {
    return { role: ROLES.OWNER, isOwner: true, isAdmin: true, maxClearance: 6 };
  }

  let isAdmin = false;
  const userDoc = await db.collection('users').doc(uid).get();
  if (userDoc.exists && userDoc.data()) {
    const userData = userDoc.data();
    const userRole = normalizeRole(userData.role);
    if (userData.isAdmin === true || isAtLeast(userRole, ROLES.ADMINISTRATOR)) {
      isAdmin = true;
    }
  }

  const rolesDoc = await db.collection('config').doc('roles').get();
  const owners = rolesDoc.exists && Array.isArray(rolesDoc.data()?.owners) ? rolesDoc.data().owners : [];
  const isOwner = owners.map(owner => String(owner || '').toLowerCase()).includes(normalizedEmail);

  if (isOwner) {
    return { role: ROLES.OWNER, isOwner: true, isAdmin: true, maxClearance: 6 };
  }

  if (isAdmin) {
    return { role: ROLES.ADMINISTRATOR, isOwner: false, isAdmin: true, maxClearance: 5 };
  }

  return { role: ROLES.NEWBIE, isOwner: false, isAdmin: false, maxClearance: 4 };
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

function buildDraftVersionData(source) {
  const data = source || {};
  return {
    title: String(data.title || ''),
    htmlContent: String(data.htmlContent || data.content || ''),
    cssContent: String(data.cssContent || ''),
    type: String(data.type || ''),
    slug: String(data.slug || ''),
    tags: Array.isArray(data.tags) ? data.tags : [],
    anomalyId: String(data.anomalyId || ''),
    anomalySubtype: String(data.anomalySubtype || ''),
    docBlocks: Array.isArray(data.docBlocks) ? data.docBlocks : [],
    currentMode: String(data.currentMode || ''),
    currentTemplate: String(data.currentTemplate || ''),
    subsectionCounters: (data.subsectionCounters && typeof data.subsectionCounters === 'object') ? data.subsectionCounters : {},
    imageAssets: Array.isArray(data.imageAssets) ? data.imageAssets : [],
    mediaAssets: Array.isArray(data.mediaAssets) ? data.mediaAssets : [],
    clearanceLevel: Number.isFinite(Number(data.clearanceLevel)) ? Number(data.clearanceLevel) : 2
  };
}

function buildDraftVersionSnapshot(source, actorUid, trigger) {
  const normalizedTrigger = String(trigger || 'manual').trim() || 'manual';
  return {
    // Use concrete timestamp values for array items. FieldValue.serverTimestamp() is invalid inside arrays.
    timestamp: admin.firestore.Timestamp.now(),
    trigger: normalizedTrigger,
    savedBy: String(actorUid || ''),
    wordCount: extractPlainTextExcerpt(String(source && source.htmlContent || source && source.content || ''), 4000).split(/\s+/).filter(Boolean).length,
    data: buildDraftVersionData(source)
  };
}

function buildSubmissionPayload(body, actor) {
  const payload = body && body.submission ? body.submission : body || {};
  const title = sanitizePlainText(payload.title || '', MAX_TITLE_LENGTH);
  const slug = sanitizeSlug(payload.slug || '');
  const htmlContent = sanitizeHtmlContent(payload.htmlContent || '');
  const cssContent = sanitizeCssOrThrow(payload.cssContent || '');
  const anomalySubtype = sanitizePlainText(payload.anomalySubtype || '', 20).toUpperCase();
  const anomalyId = sanitizePlainText(payload.anomalyId || '', 40).toUpperCase();
  const clearanceLevel = Number.parseInt(String(payload.clearanceLevel || 2), 10);
  const normalizedPayload = {
    title,
    anomalyId,
    anomalySubtype,
    anomalySubtypeLabel: sanitizePlainText(payload.anomalySubtypeLabel || '', 80),
    anomalyListKey: sanitizePlainText(payload.anomalyListKey || '', 30),
    type: sanitizePlainText(payload.type || 'Page', 30),
    contentFamily: determineContentFamily(payload.type),
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
    mediaUrls: Array.isArray(payload.mediaUrls) ? payload.mediaUrls.filter(Boolean).map(String) : [],
    mediaAssets: normalizeMediaAssets(payload.mediaAssets),
    clearanceLevel: Number.isFinite(clearanceLevel) ? Math.max(1, Math.min(6, clearanceLevel)) : 2,
    authorUid: actor.uid,
    authorEmail: actor.email,
    authorName: sanitizePlainText(payload.authorName || actor.name || actor.email.split('@')[0] || 'Agent', MAX_AUTHOR_NAME_LENGTH),
    status: String(payload.status || 'pending').trim(),
    currentMode: String(payload.currentMode || '').trim(),
    currentTemplate: String(payload.currentTemplate || '').trim(),
    draftTrigger: String(payload.draftTrigger || '').trim(),
    docBlocks: Array.isArray(payload.docBlocks) ? payload.docBlocks : [],
    subsectionCounters: payload && typeof payload.subsectionCounters === 'object' && payload.subsectionCounters
      ? {
          anomaly: Number(payload.subsectionCounters.anomaly || 0),
          tale: Number(payload.subsectionCounters.tale || 0),
          guide: Number(payload.subsectionCounters.guide || 0)
        }
      : { anomaly: 0, tale: 0, guide: 0 },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    submittedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  validateSubmissionMediaOrThrow(normalizedPayload);
  return normalizedPayload;
}

async function generateUniqueAnomalyId(db, subtype) {
  const normalizedSubtype = String(subtype || 'ROS').toUpperCase().trim();
  const counterKey = ['ROS', 'SOA', 'SLOA', 'SCTOR', 'TL'].includes(normalizedSubtype) ? normalizedSubtype : 'ROS';
  const counterRef = db.collection('counters').doc('anomaly_' + counterKey.toLowerCase());

  const result = await db.runTransaction(async tx => {
    const snap = await tx.get(counterRef);
    const data = snap.exists ? (snap.data() || {}) : {};
    const next = Number(data.last || 0) + 1;
    tx.set(counterRef, {
      last: next,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return next;
  });

  if (counterKey === 'SLOA') {
    const block = Math.max(0, result - 1);
    const letterIndex = Math.floor(block / 1000);
    const letter = String.fromCharCode(65 + (letterIndex % 26));
    const number = String((block % 1000) + 1).padStart(3, '0');
    return 'SLOA-' + letter + number;
  }
  if (counterKey === 'SCTOR' || counterKey === 'TL') {
    return counterKey + ': ' + String(result).padStart(2, '0');
  }
  return counterKey + '-' + String(result).padStart(4, '0');
}

async function ensureSubmissionMetadata(db, payload) {
  if (!payload.title) {
    const excerpt = extractPlainTextExcerpt(payload.htmlContent || '', 90);
    if (payload.type === 'Anomaly' && payload.anomalyId) {
      payload.title = sanitizePlainText(payload.anomalyId + ': ' + (excerpt || 'Untitled Anomaly Entry'), MAX_TITLE_LENGTH);
    } else {
      payload.title = sanitizePlainText(excerpt || 'Untitled Submission', MAX_TITLE_LENGTH);
    }
  }

  if (payload.type === 'Anomaly' && !payload.anomalyId) {
    const generatedId = await generateUniqueAnomalyId(db, payload.anomalySubtype || 'ROS');
    payload.anomalyId = generatedId;
    if (!payload.anomalySubtype) {
      payload.anomalySubtype = String(generatedId).split(/[-:]/)[0].toUpperCase();
    }
    if (!payload.title || !String(payload.title).toUpperCase().startsWith(String(generatedId).toUpperCase())) {
      payload.title = sanitizePlainText(generatedId + ': ' + payload.title, MAX_TITLE_LENGTH);
    }
  }
}

function validateSubmissionForPublishOrQueueOrThrow(payload) {
  if (!payload.title || payload.title.length < 3) {
    const err = new Error('Submission title is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!payload.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)) {
    const err = new Error('A valid slug is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!payload.htmlContent || !String(payload.htmlContent).trim()) {
    const err = new Error('HTML content is required.');
    err.statusCode = 400;
    throw err;
  }
}

function enforceRequestedClearanceOrThrow(payload, actorProfile) {
  const requested = Number.parseInt(String(payload.clearanceLevel || 2), 10);
  const normalized = Number.isFinite(requested) ? Math.max(1, Math.min(6, requested)) : 2;
  const maxClearance = Number(actorProfile && actorProfile.maxClearance || 4);
  if (normalized > maxClearance) {
    const err = new Error('Requested clearance exceeds role maximum.');
    err.statusCode = 403;
    throw err;
  }
  payload.clearanceLevel = normalized;
}

async function enforceRateLimit(db, uid, ip) {
  const metaRef = db.collection('rateLimits').doc(uid);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;

  await db.runTransaction(async tx => {
    const snap = await tx.get(metaRef);
    const data = snap.exists ? (snap.data() || {}) : {};
    const lastReset = data.lastReset && typeof data.lastReset.toMillis === 'function'
      ? data.lastReset.toMillis()
      : 0;
    const expired = !lastReset || (now - lastReset) >= windowMs;
    const count = expired ? 0 : Number(data.submissionCount || 0);

    if (count >= 10) {
      const err = new Error('Submission limit reached. Try again later.');
      err.statusCode = 429;
      throw err;
    }

    tx.set(metaRef, {
      submissionCount: count + 1,
      lastReset: expired ? admin.firestore.Timestamp.fromMillis(now) : data.lastReset,
      lastSubmissionIp: ip,
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
  const conflict = submissionQuery.docs.some(doc => {
    if (doc.id === submissionId) return false;
    const status = String((doc.data() || {}).status || '').toLowerCase();
    return status === 'pending';
  });
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
    const actorProfile = await resolveActorAccessProfile(db, actor.uid, actor.email);
    const adminAccess = actorProfile.isAdmin;
    const method = String(req.method || 'GET').toUpperCase();

    if (method === 'GET') {
      const query = req.query || {};
      if (query.id) {
        const doc = await db.collection('submissions').doc(String(query.id)).get();
        if (!doc.exists) {
          return sendJson(res, 404, { error: 'Submission not found.' });
        }
        const data = doc.data() || {};
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

    if (action === 'patch-assets') {
      if (!submissionId) return sendJson(res, 400, { error: 'Missing submission id.' });

      const existing = await submissionRef.get();
      if (!existing.exists) return sendJson(res, 404, { error: 'Submission not found.' });

      const current = existing.data() || {};
      if (!adminAccess && current.authorUid !== actor.uid) {
        return sendJson(res, 403, { error: 'Forbidden.' });
      }

      const imageAssets = Array.isArray(body.imageAssets)
        ? body.imageAssets
            .map(asset => ({
              url: String(asset && asset.url || '').trim(),
              alt: String(asset && asset.alt || '').trim(),
              caption: String(asset && asset.caption || '').trim(),
              label: String(asset && asset.label || '').trim()
            }))
            .filter(asset => asset.url)
        : [];
      const mediaAssets = normalizeMediaAssets(body.mediaAssets || []);

      const patch = stripUndefined({
        imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls.filter(Boolean).map(String) : imageAssets.map(asset => asset.url),
        imageAssets,
        mediaUrls: Array.isArray(body.mediaUrls) ? body.mediaUrls.filter(Boolean).map(String) : mediaAssets.map(asset => asset.url),
        mediaAssets,
        uploadState: {
          pendingCount: Number(body.uploadState && body.uploadState.pendingCount || 0),
          failedCount: Number(body.uploadState && body.uploadState.failedCount || 0),
          syncedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await submissionRef.set(patch, { merge: true });

      const approvedPageId = String(current.approvedPageId || '').trim();
      if (approvedPageId) {
        await db.collection('pages').doc(approvedPageId).set(stripUndefined({
          imageUrls: patch.imageUrls,
          imageAssets: patch.imageAssets,
          mediaUrls: patch.mediaUrls,
          mediaAssets: patch.mediaAssets,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }), { merge: true });
      }

      return sendJson(res, 200, { id: submissionId, status: String(current.status || 'pending') });
    }

    if (action === 'draft') {
      const payload = buildSubmissionPayload(body, actor);
      payload.status = 'draft';
      enforceRequestedClearanceOrThrow(payload, actorProfile);
      const draftTrigger = String(payload.draftTrigger || body.trigger || 'manual').trim() || 'manual';

      if (submissionId) {
        const existing = await submissionRef.get();
        if (existing.exists) {
          const current = existing.data() || {};
          if (!adminAccess && current.authorUid !== actor.uid) {
            return sendJson(res, 403, { error: 'Forbidden.' });
          }

          // Handle versioned updates: append to history instead of overwriting
          const isVersionedUpdate = body.isVersionedUpdate === true || body.isVersionedUpdate === 'true';
          if (isVersionedUpdate) {
            const versions = Array.isArray(current.versions) ? current.versions : [];
            const versionSnapshot = buildDraftVersionSnapshot(current, actor.uid, draftTrigger);
            versions.push(versionSnapshot);
            payload.versions = versions;
          } else {
            // First time draft or non-versioned: create initial version history
            payload.versions = [buildDraftVersionSnapshot(payload, actor.uid, draftTrigger)];
          }
        } else {
          // New submission: initialize versions array
          payload.versions = [buildDraftVersionSnapshot(payload, actor.uid, draftTrigger)];
        }
      } else {
        // Creating new draft: initialize versions array
        payload.versions = [buildDraftVersionSnapshot(payload, actor.uid, draftTrigger)];
      }

      await submissionRef.set(stripUndefined(payload), { merge: true });
      return sendJson(res, 200, { id: submissionRef.id, status: 'draft' });
    }

    if (action === 'submit' || action === 'publish') {
      const payload = buildSubmissionPayload(body, actor);
      payload.status = action === 'publish' ? 'approved' : 'pending';
      enforceRequestedClearanceOrThrow(payload, actorProfile);
      await ensureSubmissionMetadata(db, payload);
      validateSubmissionForPublishOrQueueOrThrow(payload);

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
          contentFamily: payload.contentFamily,
          legacySection: String(payload.type || '').trim().toLowerCase() === 'lore' ? 'Archived History' : '',
          tags: payload.tags,
          slug: payload.slug,
          htmlContent: payload.htmlContent,
          cssContent: payload.cssContent,
          imageUrls: payload.imageUrls,
          imageAssets: payload.imageAssets,
          mediaUrls: payload.mediaUrls,
          mediaAssets: payload.mediaAssets,
          currentMode: payload.currentMode,
          currentTemplate: payload.currentTemplate,
          docBlocks: payload.docBlocks,
          subsectionCounters: payload.subsectionCounters,
          clearanceLevel: payload.clearanceLevel,
          authorUid: actor.uid,
          authorEmail: actor.email,
          authorName: payload.authorName,
          approvedBy: String(body.reviewerName || actor.name || actor.email || 'Admin'),
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          upvoteCount: 0,
          featured: false,
          status: 'approved'
        });

        const pageId = String(body.pageId || '').trim();
        let publishedPageId = pageId;
        if (pageId) {
          await db.collection('pages').doc(pageId).set(pagePayload, { merge: true });
        } else {
          const pageRef = await db.collection('pages').add(pagePayload);
          body.pageId = pageRef.id;
          publishedPageId = pageRef.id;
        }

        if (String(payload.type || '').trim().toLowerCase() === 'lore') {
          await db.collection('loreIndex').doc(publishedPageId).set(stripUndefined({
            pageId: publishedPageId,
            title: payload.title,
            slug: payload.slug,
            type: payload.type,
            contentFamily: payload.contentFamily,
            legacySection: 'Archived History',
            clearanceLevel: payload.clearanceLevel,
            authenticityNote: 'Documents that contradict first Legacy records created by owners/admins are considered false.',
            summary: extractPlainTextExcerpt(payload.htmlContent || payload.title || '', 240),
            tags: payload.tags,
            authorUid: actor.uid,
            authorEmail: actor.email,
            authorName: payload.authorName,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            publishedAt: admin.firestore.FieldValue.serverTimestamp()
          }), { merge: true });
        } else if (pageId) {
          await db.collection('loreIndex').doc(pageId).delete().catch(() => {});
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

    if (action === 'restore-version') {
      if (!submissionId) return sendJson(res, 400, { error: 'Missing submission id.' });
      
      const versionIndex = Number(body.versionIndex || -1);
      if (versionIndex < 0) return sendJson(res, 400, { error: 'Missing or invalid version index.' });

      const existing = await submissionRef.get();
      if (!existing.exists) return sendJson(res, 404, { error: 'Submission not found.' });

      const current = existing.data() || {};
      if (!adminAccess && current.authorUid !== actor.uid) {
        return sendJson(res, 403, { error: 'Forbidden.' });
      }

      const versions = Array.isArray(current.versions) ? current.versions : [];
      if (versionIndex >= versions.length) {
        return sendJson(res, 400, { error: 'Version index out of range.' });
      }

      const restoredVersion = versions[versionIndex];
      if (!restoredVersion || !restoredVersion.data) {
        return sendJson(res, 400, { error: 'Invalid version data.' });
      }

      // Restore the selected version's data as the current state
      const restoredData = restoredVersion.data;
      const newVersion = buildDraftVersionSnapshot(
        {
          ...restoredData,
          htmlContent: String(restoredData.htmlContent || restoredData.content || ''),
          cssContent: String(restoredData.cssContent || '')
        },
        actor.uid,
        'restored-from-version-' + versionIndex
      );

      versions.push(newVersion);

      const updatedPayload = stripUndefined({
        title: String(restoredData.title || ''),
        htmlContent: String(restoredData.htmlContent || restoredData.content || ''),
        cssContent: String(restoredData.cssContent || ''),
        type: String(restoredData.type || ''),
        slug: String(restoredData.slug || ''),
        tags: Array.isArray(restoredData.tags) ? restoredData.tags : [],
        anomalyId: String(restoredData.anomalyId || ''),
        anomalySubtype: String(restoredData.anomalySubtype || ''),
        docBlocks: restoredData.docBlocks,
        currentMode: restoredData.currentMode,
        currentTemplate: restoredData.currentTemplate,
        subsectionCounters: restoredData.subsectionCounters,
        imageAssets: restoredData.imageAssets,
        mediaAssets: restoredData.mediaAssets,
        imageUrls: Array.isArray(restoredData.imageAssets) ? restoredData.imageAssets.map(asset => String(asset && asset.url || '')).filter(Boolean) : [],
        mediaUrls: Array.isArray(restoredData.mediaAssets) ? restoredData.mediaAssets.map(asset => String(asset && asset.url || '')).filter(Boolean) : [],
        versions: versions,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await submissionRef.set(updatedPayload, { merge: true });
      return sendJson(res, 200, { 
        id: submissionRef.id, 
        status: 'draft',
        restoredFromVersion: versionIndex,
        totalVersions: versions.length
      });
    }

    return sendJson(res, 400, { error: 'Unknown action.' });

  } catch (err) {
    const statusCode = Number(err.statusCode || 500);
    return sendJson(res, statusCode, { error: err.message || 'Server error.' });
  }
};

