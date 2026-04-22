const admin = require('firebase-admin');
const functions = require('firebase-functions');
const sanitizeHtml = require('sanitize-html');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function sanitizeSubmissionContent(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'video', 'audio', 'source', 'figure', 'figcaption', 'span', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'details', 'summary', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel', 'title', 'class', 'id'],
      img: ['src', 'alt', 'title', 'loading', 'decoding', 'class', 'id', 'width', 'height'],
      video: ['src', 'controls', 'poster', 'preload', 'class', 'id'],
      audio: ['src', 'controls', 'preload', 'class', 'id'],
      source: ['src', 'type'],
      '*': ['class', 'id', 'title', 'aria-label', 'role']
    },
    disallowedTagsMode: 'discard',
    forbiddenTags: ['script', 'iframe', 'object', 'embed'],
    parser: { lowerCaseTags: true }
  });
}

function sanitizeCssContent(value) {
  return String(value || '')
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/expression\s*\(/gi, 'blocked(')
    .replace(/url\s*\(\s*javascript:/gi, 'url(blocked:')
    .replace(/@import\s+url\s*\(/gi, '@import blocked(')
    .replace(/behavior\s*:/gi, 'blocked:');
}

exports.sanitizeSubmission = functions.firestore
  .document('submissions/{submissionId}')
  .onCreate(async snap => {
    const data = snap.data() || {};
    await snap.ref.set({
      ...data,
      htmlContent: sanitizeSubmissionContent(data.htmlContent),
      cssContent: sanitizeCssContent(data.cssContent),
      sanitizedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return null;
  });

exports.rateLimitCheck = functions.https.onCall(async (data, context) => {
  const uid = String((context.auth && context.auth.uid) || (data && data.uid) || '').trim();
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const limit = Number((data && data.limit) || 10);
  const windowMs = Number((data && data.windowMs) || 3600000);
  const now = Date.now();
  const ref = db.collection('rateLimits').doc(uid);

  const result = await db.runTransaction(async transaction => {
    const doc = await transaction.get(ref);
    const current = doc.exists ? (doc.data() || {}) : {};
    const lastResetMillis = current.lastReset && typeof current.lastReset.toMillis === 'function' ? current.lastReset.toMillis() : 0;
    const resetNeeded = !lastResetMillis || (now - lastResetMillis) >= windowMs;
    const submissionCount = resetNeeded ? 0 : Number(current.submissionCount || 0);

    if (submissionCount >= limit) {
      return { allowed: false, remaining: 0, resetAt: lastResetMillis ? lastResetMillis + windowMs : now + windowMs };
    }

    const nextCount = submissionCount + 1;
    transaction.set(ref, {
      submissionCount: nextCount,
      lastReset: resetNeeded ? admin.firestore.FieldValue.serverTimestamp() : (current.lastReset || admin.firestore.FieldValue.serverTimestamp())
    }, { merge: true });

    return { allowed: true, remaining: Math.max(0, limit - nextCount), resetAt: resetNeeded ? now + windowMs : lastResetMillis + windowMs };
  });

  return result;
});
