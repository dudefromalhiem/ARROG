/* ═══════════════════════════════════════════════════════════════
 *  SUBMIT.JS — Page submission with Template Builder + Code Editor
 *  Templates, slug generation, image upload, HTML sanitization
 * ═══════════════════════════════════════════════════════════════ */

let uploadedImages = [];
let currentUserForSubmit = null;
let previewDebounce = null;
let currentMode = 'template'; // 'template' | 'doc' | 'code'
let currentTemplate = 'anomaly'; // 'anomaly' | 'tale' | 'artwork' | 'guide'
let subsectionCounters = { anomaly: 0, tale: 0, guide: 0 };
let docBlocks = [];
let activeDocEditable = null;
let docDragIndex = -1;
let submitEditTarget = null;
let activeDraftId = null;
let draftAutoSaveTimer = null;
let draftSaveInFlight = false;
let suppressDraftAutoSave = false;
const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const UPLOAD_STALL_CHECK_MS = 15000;
const UPLOAD_STALL_TIMEOUT_MS = 300000;
const FIRESTORE_IMAGE_MAX_BYTES = 250 * 1024;
const FIRESTORE_IMAGE_MAX_DIMENSION = 1280;
const FIRESTORE_IMAGE_LIMIT = 3;
const ALLOWED_STORAGE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const TAG_OPTIONS = [
  'object', 'animal', 'humanoid', 'plant', 'artifact', 'document', 'digital',
  'memetic', 'cognitohazard', 'spatial', 'temporal', 'biological', 'dangerous',
  'archive', 'field-report'
];
let selectedTagsState = new Set();

const ANOMALY_SUBTYPE_RULES = {
  ROS: {
    label: 'Red Oaker Specimen',
    listKey: 'ROS',
    placeholder: 'ROS-0001',
    hint: 'ROS format: ROS-0001 (digits only after ROS-).',
    pattern: /^ROS-\d{1,4}$/
  },
  SLOA: {
    label: 'Specimen Linked Anomalous Object',
    listKey: 'SLOA',
    placeholder: 'SLOA-001A',
    hint: 'SLOA format: SLOA-001A (1-3 digits + trailing letter).',
    pattern: /^SLOA-\d{1,3}[A-Z]$/
  },
  SOA: {
    label: 'Sentient or Accursed Object',
    listKey: 'SOA',
    placeholder: 'SOA-0001',
    hint: 'SOA format: SOA-0001 (digits only after SOA-).',
    pattern: /^SOA-\d{1,4}$/
  },
  SCTOR: {
    label: 'Standard Cross Testing Operations Report',
    listKey: 'SCTOR',
    placeholder: 'SCTOR: 01',
    hint: 'SCTOR format: SCTOR: 01',
    pattern: /^SCTOR:\s*\d{2,}$/
  },
  TL: {
    label: 'Termination Logs',
    listKey: 'TL',
    placeholder: 'TL: 01',
    hint: 'TL format: TL: 01',
    pattern: /^TL:\s*\d{2,}$/
  }
};

const DEFAULT_NEW_PAGE_HTML = `<div class="page-shell">
  <header class="page-header">
    <h1 class="page-title">New Classified Document</h1>
    <p class="page-subtitle">Clearance Level 2 // Internal Distribution</p>
  </header>
  <section class="page-section">
    <h2>Summary</h2>
    <p>Start writing the page content here.</p>
  </section>
</div>`;

const DOC_DEFAULT_CSS = `
.doc-editor-page { max-width: 860px; margin: 0 auto; }
.doc-editor-page .doc-title-main {
  font-family: var(--font-d);
  text-transform: uppercase;
  letter-spacing: 3px;
  color: #f2f2f2;
  margin-bottom: 18px;
}
.doc-editor-page .doc-rich, .doc-editor-page p { color: #d8d8d8; margin-bottom: 14px; }
.doc-editor-page h2 { color: #f2f2f2; margin-bottom: 10px; letter-spacing: 2px; text-transform: uppercase; }
.doc-editor-page h3 { color: #d7d7d7; margin-bottom: 8px; letter-spacing: 1px; text-transform: uppercase; }
.doc-editor-page .doc-image-wrap { margin: 22px 0; }
.doc-editor-page .doc-image-wrap img { max-width: 100%; border: 1px solid #3a3a3a; background: #111111; }
.doc-editor-page .doc-image-wrap figcaption { margin-top: 8px; color: #c7c7c7; font-size: .85rem; }
.doc-editor-page .align-left { text-align: left; }
.doc-editor-page .align-center { text-align: center; }
.doc-editor-page .align-right { text-align: right; }
.doc-editor-page blockquote {
  border-left: 3px solid #8b0000;
  background: #101010;
  padding: 14px 18px;
  color: #d7d7d7;
  margin: 20px 0;
}
.doc-editor-page blockquote footer { margin-top: 8px; color: #c7c7c7; font-size: .85rem; }
.doc-editor-page hr { border: none; border-top: 1px dashed #4a4a4a; margin: 24px 0; }
.doc-editor-page pre {
  margin: 20px 0;
  padding: 14px;
  border: 1px solid #333;
  background: #0f0f0f;
  color: #f2f2f2;
  overflow-x: auto;
}
`;

// ═════════════════════════════════════════════════════════════
// AUTH GATE
// ═════════════════════════════════════════════════════════════

auth.onAuthStateChanged(user => {
  document.getElementById('submit-loading').classList.add('hidden');
  const navAuth = document.getElementById('nav-auth');
  if (user) {
    currentUserForSubmit = user;
    document.getElementById('submit-denied').classList.add('hidden');
    document.getElementById('submit-panel').classList.remove('hidden');
    navAuth.innerHTML =
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">' +
        '<button class="nav-btn" onclick="changeUsername()" title="Click to change your username">' + (user.displayName || 'Agent') + '</button>' +
        '<button class="nav-btn" onclick="auth.signOut()">Sign Out</button>' +
      '</div>';
    setDraftStatus('Draft autosave is idle.');
    loadMySubmissions();
    initializeSubmitEditModeFromUrl();
    initializeReconstructionPrefillFromUrl();
  } else {
    currentUserForSubmit = null;
    activeDraftId = null;
    document.getElementById('submit-denied').classList.remove('hidden');
    document.getElementById('submit-panel').classList.add('hidden');
    navAuth.innerHTML = '<button class="nav-btn" onclick="location.href=\'index.html\'">Sign In</button>';
  }
});

window.addEventListener('beforeunload', () => {
  if (currentUserForSubmit) {
    saveDraft({ silent: true, trigger: 'leave' });
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && currentUserForSubmit) {
    saveDraft({ silent: true, trigger: 'hidden' });
  }
});

function setDraftStatus(message, isError = false) {
  const el = document.getElementById('draft-status');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? 'var(--red-b)' : 'var(--wht-f)';
}

function scheduleDraftAutoSave() {
  if (suppressDraftAutoSave || !currentUserForSubmit || submitEditTarget) return;
  clearTimeout(draftAutoSaveTimer);
  setDraftStatus('Draft changes detected. Autosaving...');
  draftAutoSaveTimer = setTimeout(() => {
    saveDraft({ silent: true, trigger: 'autosave' });
  }, 2500);
}

function buildCurrentEditorContent(requireContent) {
  let htmlContent = '';
  let cssContent = '';

  if (currentMode === 'template') {
    const result = buildTemplateHTML();
    htmlContent = result.html;
    cssContent = result.css;
    if (requireContent && !htmlContent.trim()) {
      throw new Error('Please fill in at least some template fields.');
    }
  } else if (currentMode === 'doc') {
    const result = buildDocumentModeHTML();
    htmlContent = result.html;
    cssContent = result.css;
    if (requireContent && !hasDocumentContent()) {
      throw new Error('Please add at least one content block in Document Studio.');
    }
  } else {
    htmlContent = document.getElementById('sf-html').value;
    cssContent = document.getElementById('sf-css').value;
    if (requireContent && !htmlContent.trim()) {
      throw new Error('Please enter some HTML content.');
    }
  }

  return {
    htmlContent: htmlContent,
    cssContent: cssContent
  };
}

function removeClientOnlySubmissionFields(data) {
  const cleaned = { ...(data || {}) };
  delete cleaned.submittedAt;
  delete cleaned.reviewedAt;
  delete cleaned.approvedPageId;
  delete cleaned.reviewedBy;
  delete cleaned.autoApproved;
  return cleaned;
}

async function getSubmissionApiHeaders() {
  const user = currentUserForSubmit || auth.currentUser;
  if (!user) {
    throw new Error('Please sign in first.');
  }
  const token = await user.getIdToken();
  return {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json'
  };
}

async function callSubmissionApi(method, payload = {}, query = '') {
  const response = await fetch('/api/submit' + query, {
    method: method,
    headers: await getSubmissionApiHeaders(),
    body: method === 'GET' ? undefined : JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && data.error ? data.error : ('Request failed with status ' + response.status);
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function saveDraft(options = {}) {
  if (!currentUserForSubmit || submitEditTarget) return null;
  if (draftSaveInFlight) return activeDraftId;

  const silent = !!options.silent;
  const trigger = options.trigger || 'manual';

  const title = document.getElementById('sf-title').value.trim();
  const type = document.getElementById('sf-type').value;
  const manualSlug = document.getElementById('sf-slug').value.trim();
  const slug = manualSlug || generateSlug(title);
  const tags = getSelectedTags();
  const anomalySubtype = document.getElementById('sf-anomaly-subtype').value;
  const anomalyCodeInput = document.getElementById('sf-anomaly-code').value;

  let anomalyId = '';
  let anomalyListKey = '';
  let anomalySubtypeLabel = '';
  if (type === 'Anomaly') {
    const validation = validateAnomalyDesignation(anomalySubtype, anomalyCodeInput);
    if (validation.valid) {
      anomalyId = validation.code;
      anomalyListKey = validation.rule.listKey;
      anomalySubtypeLabel = validation.rule.label;
    }
  }

  let content;
  try {
    content = buildCurrentEditorContent(false);
  } catch (_err) {
    content = {
      htmlContent: document.getElementById('sf-html').value || '',
      cssContent: document.getElementById('sf-css').value || ''
    };
  }

  const isEmpty = !title && !slug && !tags.length && !content.htmlContent.trim() && !content.cssContent.trim();
  if (isEmpty) {
    if (!silent) setDraftStatus('Draft not saved because the editor is empty.');
    return null;
  }

  const uploadedUrls = uploadedImages.filter(img => !img.removed && img.remoteUrl).map(img => img.remoteUrl);
  const sanitizedHTML = sanitizeHTML(content.htmlContent || '');
  const wrappedHTML = wrapWithDefaultSchema(sanitizedHTML, title || 'Untitled Draft');
  const mergedCSS = mergeWithDefaultSchemaCSS(content.cssContent || '');

  const draftPayload = {
    title: title || 'Untitled Draft',
    anomalyId: anomalyId,
    anomalySubtype: anomalySubtype || '',
    anomalySubtypeLabel: anomalySubtypeLabel || '',
    anomalyListKey: anomalyListKey || '',
    type: type,
    tags: tags,
    slug: slug || '',
    htmlContent: wrappedHTML,
    cssContent: mergedCSS,
    imageUrls: uploadedUrls,
    authorUid: currentUserForSubmit.uid,
    authorEmail: currentUserForSubmit.email,
    authorName: currentUserForSubmit.displayName || currentUserForSubmit.email.split('@')[0],
    status: 'draft',
    currentMode: currentMode,
    draftTrigger: trigger,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  draftSaveInFlight = true;
  try {
    const result = await callSubmissionApi('POST', {
      action: 'draft',
      submissionId: activeDraftId || '',
      submission: removeClientOnlySubmissionFields(draftPayload)
    });
    activeDraftId = result.id || activeDraftId;
    if (!silent) {
      setDraftStatus('Draft saved at ' + new Date().toLocaleTimeString() + '.');
    } else {
      setDraftStatus('Draft autosaved at ' + new Date().toLocaleTimeString() + '.');
    }
    return activeDraftId;
  } catch (err) {
    setDraftStatus('Draft save failed: ' + err.message, true);
    return null;
  } finally {
    draftSaveInFlight = false;
  }
}

function manualSaveDraft() {
  saveDraft({ silent: false, trigger: 'manual' });
}

async function continueDraftSubmission(id) {
  if (!currentUserForSubmit) return;
  try {
    const result = await callSubmissionApi('GET', {}, '?id=' + encodeURIComponent(id));
    if (!result || !result.data) {
      alert('Draft not found.');
      return;
    }
    const draft = result.data || {};
    if (draft.authorUid !== currentUserForSubmit.uid) {
      alert('You can only open your own draft.');
      return;
    }

    suppressDraftAutoSave = true;
    activeDraftId = id;
    document.getElementById('sf-title').value = draft.title || '';
    document.getElementById('sf-type').value = draft.type || 'Anomaly';
    document.getElementById('sf-slug').value = draft.slug || '';
    document.getElementById('sf-anomaly-subtype').value = draft.anomalySubtype || '';
    document.getElementById('sf-anomaly-code').value = draft.anomalyId || '';

    const tags = Array.isArray(draft.tags) ? draft.tags : [];
    setSelectedTags(tags);

    // Drafts are re-opened in code mode to preserve exact authored markup.
    switchMode('code');
    document.getElementById('sf-html').value = draft.htmlContent || DEFAULT_NEW_PAGE_HTML;
    document.getElementById('sf-css').value = draft.cssContent || '';

    uploadedImages = (Array.isArray(draft.imageUrls) ? draft.imageUrls : []).map((url, idx) => ({
      id: 'draft_' + idx + '_' + Date.now(),
      name: 'Draft image ' + (idx + 1),
      url: url,
      localUrl: url,
      remoteUrl: url,
      status: 'ready',
      removed: false,
      file: null,
      fingerprint: 'draft-' + idx
    }));
    renderImageList();
    refreshImageSelectors();

    updateTypeSpecificUI();
    updateSlugPreview();
    updatePreview();
    setDraftStatus('Loaded draft for editing.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    alert('Could not load draft: ' + err.message);
  } finally {
    suppressDraftAutoSave = false;
  }
}

async function openRejectedSubmissionPreview(id) {
  try {
    const result = await callSubmissionApi('GET', {}, '?id=' + encodeURIComponent(id));
    if (!result || !result.data) {
      alert('Submission not found.');
      return;
    }
    const s = result.data || {};
    if (s.authorUid !== currentUserForSubmit.uid) {
      alert('You can only view your own submission details.');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'review-modal';
    modal.id = 'my-reject-modal';
    modal.innerHTML = '<div class="review-modal-header">' +
      '<h3>' + (s.title || 'Rejected Submission') + '</h3>' +
      '<button class="btn btn-sm btn-s" type="button" onclick="closeRejectedSubmissionPreview()">Close</button>' +
    '</div>' +
    '<div class="review-modal-body">' +
      '<iframe class="review-modal-preview" sandbox="allow-same-origin allow-scripts" csp="default-src \'none\'; style-src \'unsafe-inline\'" title="Rejected submission preview"></iframe>' +
      '<div class="review-modal-meta">' +
        '<dl>' +
          '<dt>Status</dt><dd><span class="status status-rejected">rejected</span></dd>' +
          '<dt>Reason</dt><dd>' + escapeHtml(s.rejectionReason || 'No rejection reason provided.') + '</dd>' +
          '<dt>Type</dt><dd>' + escapeHtml(s.type || 'Unknown') + '</dd>' +
          '<dt>Slug</dt><dd>' + escapeHtml(s.slug || '[none]') + '</dd>' +
        '</dl>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);

    const frame = modal.querySelector('iframe');
    const uploaded = Array.isArray(s.imageUrls) ? s.imageUrls.filter(Boolean) : [];
    frame.srcdoc = buildSandboxDocument(
      wrapWithDefaultSchema(String(s.htmlContent || ''), s.title || 'Rejected Submission'),
      mergeWithDefaultSchemaCSS(s.cssContent || '')
    );
  } catch (err) {
    alert('Could not open rejection preview: ' + err.message);
  }
}

function closeRejectedSubmissionPreview() {
  const modal = document.getElementById('my-reject-modal');
  if (modal) modal.remove();
}

function initializeReconstructionPrefillFromUrl() {
  if (!currentUserForSubmit || submitEditTarget) return;

  const params = new URLSearchParams(window.location.search);
  if (params.get('reconstruct') !== '1') return;

  const designation = String(params.get('designation') || '').trim();
  const listKey = String(params.get('listKey') || '').trim().toUpperCase();
  const entryType = String(params.get('entryType') || '').trim();
  const title = String(params.get('title') || '').trim();
  const slug = String(params.get('slug') || '').trim();

  if (!designation) return;

  const typeInput = document.getElementById('sf-type');
  const titleInput = document.getElementById('sf-title');
  const slugInput = document.getElementById('sf-slug');
  const subtypeInput = document.getElementById('sf-anomaly-subtype');
  const codeInput = document.getElementById('sf-anomaly-code');

  if (entryType && Array.from(typeInput.options).some(opt => opt.value === entryType)) {
    typeInput.value = entryType;
  }
  onTypeChange();

  if (typeInput.value === 'Anomaly' && listKey && ANOMALY_SUBTYPE_RULES[listKey]) {
    subtypeInput.value = listKey;
    codeInput.value = designation;
    onAnomalySubtypeChange();
  }

  titleInput.value = title || (designation + ': [TITLE]');
  slugInput.value = slug || generateSlug(designation);

  switchMode('code');
  if (!document.getElementById('sf-html').value.trim() || document.getElementById('sf-html').value.trim() === DEFAULT_NEW_PAGE_HTML.trim()) {
    document.getElementById('sf-html').value = `<div class="page-shell">\n  <header class="page-header">\n    <h1 class="page-title">${designation}: [TITLE]</h1>\n    <p class="page-subtitle">Reconstructed Archive Entry</p>\n  </header>\n  <section class="page-section">\n    <h2>Summary</h2>\n    <p>Enter reconstructed data for this designation.</p>\n  </section>\n</div>`;
  }

  updateTypeSpecificUI();
  updateSlugPreview();
  updatePreview();
  setDraftStatus('Reconstruction target loaded for ' + designation + '.');

  window.history.replaceState({}, document.title, window.location.pathname);
}

async function initializeSubmitEditModeFromUrl() {
  if (!currentUserForSubmit) return;

  const params = new URLSearchParams(window.location.search);
  const editId = params.get('editId');
  const editSlug = params.get('editSlug');
  if (!editId && !editSlug) return;

  await rolesReady;
  const isAdminUser = await getUserAdminFlag(currentUserForSubmit);
  if (!isAdminUser) {
    alert('Only Admin or Owner accounts can edit existing pages.');
    return;
  }

  try {
    let pageDoc = null;
    if (editId) {
      const doc = await db.collection('pages').doc(editId).get();
      if (doc.exists) pageDoc = doc;
    } else if (editSlug) {
      const snap = await db.collection('pages').where('slug', '==', editSlug).limit(1).get();
      if (!snap.empty) pageDoc = snap.docs[0];
    }

    if (!pageDoc) {
      const seedItem = typeof PAGE_SEED !== 'undefined'
        ? PAGE_SEED.find(p => (editId && p.id === editId) || (editSlug && p.slug === editSlug))
        : null;
      if (!seedItem) {
        alert('Requested page was not found.');
        return;
      }

      pageDoc = { id: null, data: () => seedItem };
    }

    const page = pageDoc.data() || {};
    submitEditTarget = { id: pageDoc.id || null, seeded: !pageDoc.id, seedSlug: page.slug || editSlug || '' };

    document.getElementById('sf-title').value = page.title || '';
    document.getElementById('sf-type').value = page.type || 'Anomaly';
    document.getElementById('sf-slug').value = page.slug || '';

    const tags = Array.isArray(page.tags) ? page.tags : [];
    setSelectedTags(tags);

    if (page.type === 'Anomaly') {
      const subtype = page.anomalySubtype || '';
      const code = page.anomalyId || '';
      document.getElementById('sf-anomaly-subtype').value = subtype;
      document.getElementById('sf-anomaly-code').value = code;
      onAnomalySubtypeChange();
    }

    document.getElementById('sf-html').value = page.htmlContent || DEFAULT_NEW_PAGE_HTML;
    document.getElementById('sf-css').value = page.cssContent || '';

    const content = String(page.htmlContent || '');
    const isGuide = String(page.type || '') === 'Guide';
    if (isGuide) {
      switchMode('template');
      selectTemplate('guide');
      setGuideSectionsFixedStructure();
      const parsed = new DOMParser().parseFromString(content, 'text/html');
      const sections = Array.from(parsed.querySelectorAll('.guide-section'));
      let fixedIndex = 1;
      sections.forEach(section => {
        const heading = (section.querySelector('h2')?.textContent || '').trim();
        const bodyPieces = Array.from(section.children)
          .filter(node => node.tagName !== 'H2')
          .map(node => node.outerHTML)
          .join('');
        const bodyText = htmlBlockToPlainText(bodyPieces);

        if (/^introduction$/i.test(heading)) {
          document.getElementById('tf-guide-intro').value = bodyText;
          return;
        }

        const titleField = document.getElementById('sub-title-guide-' + fixedIndex);
        const bodyField = document.getElementById('sub-body-guide-' + fixedIndex);
        if (titleField) titleField.value = heading || titleField.value;
        if (bodyField) bodyField.value = bodyText;
        fixedIndex++;
      });
    } else {
      switchMode('code');
    }

    updateTypeSpecificUI();
    updateSlugPreview();
    updatePreview();

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.textContent = '>> Save Page Changes';
  } catch (err) {
    alert('Could not load page for editing: ' + err.message);
  }
}

// ═════════════════════════════════════════════════════════════
// SLUG GENERATION
// ═════════════════════════════════════════════════════════════

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

function updateSlugPreview() {
  const title = document.getElementById('sf-title').value.trim();
  const manualSlug = document.getElementById('sf-slug').value.trim();
  const slug = manualSlug || generateSlug(title) || '...';
  document.getElementById('slug-preview').textContent = '/pages/' + slug;
}

function getSelectedTags() {
  return Array.from(selectedTagsState);
}

function updateTagSummary() {
  const selected = getSelectedTags();
  const summary = document.getElementById('sf-tags-summary');
  const selectedWrap = document.getElementById('sf-tag-selected');
  if (!summary) return;
  summary.textContent = selected.length
    ? (selected.length + ' tag(s) selected: ' + selected.join(', '))
    : 'No tags selected.';

  if (!selectedWrap) return;
  if (!selected.length) {
    selectedWrap.innerHTML = '<span class="tag-empty">Selected tags will appear here.</span>';
    return;
  }
  selectedWrap.innerHTML = selected.map(tag => {
    return '<span class="tag-chip">' + escapeHtml(tag) +
      '<button type="button" aria-label="Remove ' + escapeAttr(tag) + '" onclick="removeSelectedTag(\'' + escapeAttr(tag) + '\')">x</button>' +
    '</span>';
  }).join('');
}

function renderTagOptions(filterText) {
  const holder = document.getElementById('sf-tags-list');
  if (!holder) return;
  const normalizedFilter = String(filterText || '').toLowerCase().trim();
  const visible = TAG_OPTIONS.filter(tag => !normalizedFilter || tag.includes(normalizedFilter));

  holder.innerHTML = visible.map(tag => {
    const active = selectedTagsState.has(tag);
    return '<button type="button" class="tag-option' + (active ? ' active' : '') + '" data-tag="' + escapeAttr(tag) + '">' +
      escapeHtml(tag) +
    '</button>';
  }).join('');
}

function setSelectedTags(tags) {
  const incoming = Array.isArray(tags) ? tags : [];
  selectedTagsState = new Set(incoming.filter(tag => TAG_OPTIONS.includes(tag)));
  const searchEl = document.getElementById('sf-tag-search');
  renderTagOptions(searchEl ? searchEl.value : '');
  updateTagSummary();
}

function removeSelectedTag(tag) {
  if (!selectedTagsState.has(tag)) return;
  selectedTagsState.delete(tag);
  const searchEl = document.getElementById('sf-tag-search');
  renderTagOptions(searchEl ? searchEl.value : '');
  updateTagSummary();
  schedulePreview();
}

function toggleTagSelection(tag) {
  if (!TAG_OPTIONS.includes(tag)) return;
  if (selectedTagsState.has(tag)) selectedTagsState.delete(tag);
  else selectedTagsState.add(tag);
  const searchEl = document.getElementById('sf-tag-search');
  renderTagOptions(searchEl ? searchEl.value : '');
  updateTagSummary();
  schedulePreview();
}

function initTagPicker() {
  const searchEl = document.getElementById('sf-tag-search');
  const allBtn = document.getElementById('sf-tag-all');
  const clearBtn = document.getElementById('sf-tag-clear');
  const listEl = document.getElementById('sf-tags-list');
  if (!searchEl || !allBtn || !clearBtn || !listEl) return;

  searchEl.addEventListener('input', () => {
    renderTagOptions(searchEl.value);
  });

  allBtn.addEventListener('click', () => {
    selectedTagsState = new Set(TAG_OPTIONS);
    renderTagOptions(searchEl.value);
    updateTagSummary();
    schedulePreview();
  });

  clearBtn.addEventListener('click', () => {
    selectedTagsState.clear();
    renderTagOptions(searchEl.value);
    updateTagSummary();
    schedulePreview();
  });

  listEl.addEventListener('click', e => {
    const btn = e.target.closest('.tag-option');
    if (!btn) return;
    const tag = btn.getAttribute('data-tag') || '';
    toggleTagSelection(tag);
  });

  renderTagOptions('');
  updateTagSummary();
}

function setGuideSectionsFixedStructure() {
  const holder = document.getElementById('tf-guide-sections');
  if (!holder) return;

  if (holder.children.length > 0) return;

  const sectionTitles = [
    'Purpose',
    'Scope',
    'Procedure',
    'Field Notes',
    'References'
  ];

  holder.innerHTML = sectionTitles.map((title, idx) => {
    const n = idx + 1;
    return '<div class="subsection-block" id="guide-fixed-' + n + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;margin-bottom:8px">' +
        '<label class="fl" style="margin:0">Section ' + n + ' Title</label>' +
      '</div>' +
      '<div class="fg"><input class="fi" id="sub-title-guide-' + n + '" value="' + escapeAttr(title) + '" /></div>' +
      '<div class="fg"><label class="fl">Section ' + n + ' Content</label>' +
        '<textarea class="fta" id="sub-body-guide-' + n + '" placeholder="Write this section..."></textarea>' +
      '</div>' +
    '</div>';
  }).join('');

  holder.querySelectorAll('input,textarea').forEach(el => {
    el.addEventListener('input', schedulePreview);
  });
}

function updateTypeSpecificUI() {
  const type = document.getElementById('sf-type').value;
  const anomalyRow = document.getElementById('anomaly-meta-row');
  if (anomalyRow) anomalyRow.classList.toggle('hidden', type !== 'Anomaly');

  const isGuide = type === 'Guide';
  const modeDoc = document.getElementById('mode-doc');
  const modeCode = document.getElementById('mode-code');

  if (modeDoc) modeDoc.disabled = isGuide;
  if (modeCode) modeCode.disabled = isGuide;

  if (isGuide) {
    switchMode('template');
    selectTemplate('guide');
    setGuideSectionsFixedStructure();
  }
}

function onAnomalySubtypeChange() {
  const subtype = document.getElementById('sf-anomaly-subtype').value;
  const hintEl = document.getElementById('sf-anomaly-hint');
  const codeEl = document.getElementById('sf-anomaly-code');
  const rule = ANOMALY_SUBTYPE_RULES[subtype];

  if (!rule) {
    if (hintEl) hintEl.textContent = 'Format hint will appear after selecting a submission type.';
    if (codeEl) codeEl.placeholder = 'e.g. ROS-0001';
    return;
  }

  if (hintEl) hintEl.textContent = rule.hint;
  if (codeEl) codeEl.placeholder = rule.placeholder;

  if (!codeEl.value.trim()) {
    codeEl.value = rule.placeholder;
    onAnomalyCodeInput();
  }
}

function onAnomalyCodeInput() {
  const codeEl = document.getElementById('sf-anomaly-code');
  if (!codeEl) return;
  const subtype = document.getElementById('sf-anomaly-subtype').value;
  const rule = ANOMALY_SUBTYPE_RULES[subtype];
  const normalized = String(codeEl.value || '').toUpperCase().trim();
  codeEl.value = normalized;

  const titleEl = document.getElementById('sf-title');
  if (!titleEl || !normalized || !rule) return;
  if (!titleEl.value.trim() || !titleEl.value.trim().includes(' ')) {
    titleEl.value = normalized;
    updateSlugPreview();
  }
}

// ═════════════════════════════════════════════════════════════
// MODE SWITCHING
// ═════════════════════════════════════════════════════════════

function switchMode(mode) {
  const type = document.getElementById('sf-type').value;
  if (type === 'Guide' && mode !== 'template') {
    mode = 'template';
  }
  currentMode = mode;
  document.getElementById('mode-template').classList.toggle('active', mode === 'template');
  document.getElementById('mode-doc').classList.toggle('active', mode === 'doc');
  document.getElementById('mode-code').classList.toggle('active', mode === 'code');
  document.getElementById('template-mode').classList.toggle('hidden', mode !== 'template');
  document.getElementById('doc-mode').classList.toggle('hidden', mode !== 'doc');
  document.getElementById('code-mode').classList.toggle('hidden', mode !== 'code');
  schedulePreview();
}

// ═════════════════════════════════════════════════════════════
// TEMPLATE SELECTION & DYNAMIC FIELDS
// ═════════════════════════════════════════════════════════════

function selectTemplate(tpl) {
  currentTemplate = tpl;
  ['anomaly', 'tale', 'artwork', 'guide'].forEach(t => {
    document.getElementById('tpl-' + t).classList.toggle('active', t === tpl);
    document.getElementById('tpl-fields-' + t).classList.toggle('hidden', t !== tpl);
  });

  // Auto-set the type dropdown
  const typeMap = { anomaly: 'Anomaly', tale: 'Tale', artwork: 'Artwork', guide: 'Guide' };
  document.getElementById('sf-type').value = typeMap[tpl] || 'Anomaly';

  // Update Title label and placeholder based on type
  const titleLabel = document.getElementById('lbl-title');
  const titleInput = document.getElementById('sf-title');
  if (tpl === 'anomaly') {
    titleLabel.textContent = 'Title (must begin with anomaly designation)';
    titleInput.placeholder = 'e.g. ROS-0001: Sample Title';
  } else {
    titleLabel.textContent = 'Title';
    const placeholders = { tale: 'e.g. The Hollow Mirror', artwork: 'e.g. Sketch of ROG-088', guide: 'e.g. Containment Protocols' };
    titleInput.placeholder = placeholders[tpl] || 'Enter a title';
  }

  if (tpl === 'guide') {
    setGuideSectionsFixedStructure();
  }

  schedulePreview();
}

function onTypeChange() {
  const type = document.getElementById('sf-type').value;
  const tplMap = { Anomaly: 'anomaly', Tale: 'tale', Artwork: 'artwork', Guide: 'guide', Hub: 'guide' };
  if (currentMode === 'template' && tplMap[type]) {
    selectTemplate(tplMap[type]);
  }
  updateTypeSpecificUI();
}

function addSubsection(type) {
  if (type === 'guide') {
    return;
  }
  subsectionCounters[type] = (subsectionCounters[type] || 0) + 1;
  const n = subsectionCounters[type];
  const containerId = type === 'anomaly' ? 'tf-subsections' :
                      type === 'tale' ? 'tf-tale-sections' : 'tf-guide-sections';
  const container = document.getElementById(containerId);
  const labelMap = { anomaly: 'Subsection', tale: 'Chapter', guide: 'Section' };
  const label = labelMap[type] || 'Section';

  const div = document.createElement('div');
  div.className = 'subsection-block';
  div.id = 'sub-' + type + '-' + n;
  div.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;margin-bottom:8px">' +
      '<label class="fl" style="margin:0">' + label + ' ' + n + ' Title</label>' +
      '<button class="btn btn-sm btn-d" onclick="removeSubsection(\'' + type + '\',' + n + ')" style="padding:2px 8px;font-size:.65rem">✕ Remove</button>' +
    '</div>' +
    '<div class="fg"><input class="fi" id="sub-title-' + type + '-' + n + '" placeholder="' + label + ' title" /></div>' +
    '<div class="fg"><label class="fl">' + label + ' ' + n + ' Content</label>' +
      '<textarea class="fta" id="sub-body-' + type + '-' + n + '" placeholder="Write the content for this ' + label.toLowerCase() + '..."></textarea>' +
    '</div>';

  container.appendChild(div);

  // Bind preview updates
  div.querySelector('input').addEventListener('input', schedulePreview);
  div.querySelector('textarea').addEventListener('input', schedulePreview);
}

function removeSubsection(type, n) {
  const el = document.getElementById('sub-' + type + '-' + n);
  if (el) el.remove();
  schedulePreview();
}

// ═════════════════════════════════════════════════════════════
// TEMPLATE → HTML/CSS GENERATION
// ═════════════════════════════════════════════════════════════

function buildTemplateHTML() {
  if (currentTemplate === 'anomaly') return buildAnomalyTemplate();
  if (currentTemplate === 'tale') return buildTaleTemplate();
  if (currentTemplate === 'artwork') return buildArtworkTemplate();
  if (currentTemplate === 'guide') return buildGuideTemplate();
  return { html: '', css: '' };
}

function createDocBlock(type) {
  if (type === 'title') return { type: 'title', text: '' };
  if (type === 'text') return { type: 'text', html: '' };
  if (type === 'image') return { type: 'image', url: '', caption: '', align: 'center', width: '' };
  if (type === 'quote') return { type: 'quote', text: '', source: '' };
  if (type === 'list') return { type: 'list', items: '' };
  if (type === 'code') return { type: 'code', code: '' };
  if (type === 'divider') return { type: 'divider' };
  return { type: 'text', html: '' };
}

function escapeAttr(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripTags(html) {
  const el = document.createElement('div');
  el.innerHTML = String(html || '');
  return (el.textContent || '').trim();
}

function isValidImageSrc(src) {
  const value = String(src || '').trim();
  if (!value) return false;
  return /^(data:image\/(png|jpeg|gif|webp|bmp|svg\+xml);base64,|https?:\/\/|\/)/i.test(value);
}

function normalizeImageWidthValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d+(?:\.\d+)?%$/.test(raw) || /^\d+(?:\.\d+)?px$/.test(raw)) return raw;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return raw + '%';
  return '';
}

function buildImageRenderStyle(widthValue) {
  const width = normalizeImageWidthValue(widthValue);
  if (width) return 'width:' + width + ';max-width:100%;height:auto;display:block;';
  return 'width:auto;max-width:100%;height:auto;display:block;';
}

function htmlBlockToPlainText(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = String(html || '');
  const chunks = [];
  wrapper.querySelectorAll('p,li').forEach(node => {
    const text = (node.textContent || '').trim();
    if (text) chunks.push(text);
  });
  if (chunks.length) return chunks.join('\n\n');
  return (wrapper.textContent || '').trim();
}

function getUploadedImageOptions(selected) {
  const images = uploadedImages.filter(img => img.status === 'ready' && img.remoteUrl);
  const options = ['<option value="">Select uploaded image</option>'];
  images.forEach(img => {
    const isSel = selected && selected === img.remoteUrl ? ' selected' : '';
    options.push('<option value="' + escapeAttr(img.remoteUrl) + '"' + isSel + '>' + escapeHtml(img.name) + '</option>');
  });
  return options.join('');
}

function renderDocBlocks() {
  const holder = document.getElementById('doc-blocks');
  if (!holder) return;

  if (!docBlocks.length) {
    holder.innerHTML = '<div class="no-results">No blocks yet. Use the + buttons above to build your page.</div>';
    return;
  }

  holder.innerHTML = docBlocks.map((block, idx) => {
    const head = '<div class="doc-block-head"><strong style="font-size:.8rem;color:var(--wht-b);text-transform:uppercase;letter-spacing:1px">' +
      escapeHtml(block.type) +
      '</strong><div class="doc-block-actions">' +
      '<button class="btn btn-sm btn-s doc-drag-handle" draggable="true" type="button" title="Drag to move" data-action="drag" data-index="' + idx + '">↕</button>' +
      '<button class="btn btn-sm btn-s" type="button" data-action="up" data-index="' + idx + '">↑</button>' +
      '<button class="btn btn-sm btn-s" type="button" data-action="down" data-index="' + idx + '">↓</button>' +
      '<button class="btn btn-sm btn-s" type="button" data-action="duplicate" data-index="' + idx + '">Clone</button>' +
      '<button class="btn btn-sm btn-d" type="button" data-action="delete" data-index="' + idx + '">Delete</button>' +
      '</div></div>';

    let body = '';
    if (block.type === 'title') {
      body = '<input class="fi" data-field="text" data-index="' + idx + '" value="' + escapeAttr(block.text || '') + '" placeholder="Section title" />';
    } else if (block.type === 'text') {
      body = '<div class="doc-editable" contenteditable="true" data-field="html" data-index="' + idx + '">' + (block.html || '') + '</div>';
    } else if (block.type === 'image') {
      const imageSrc = block.url && isValidImageSrc(block.url)
        ? '<img class="doc-image-preview" src="' + escapeAttr(block.url) + '" alt="Selected" style="' + buildImageRenderStyle(block.width) + '" />'
        : '';
      body = '<div class="doc-grid-2">' +
        '<div><label class="fl">Uploaded Images</label><select class="fi" data-field="uploadSelect" data-index="' + idx + '">' + getUploadedImageOptions(block.url || '') + '</select></div>' +
        '<div><label class="fl">Image URL</label><input class="fi" data-field="url" data-index="' + idx + '" value="' + escapeAttr(block.url || '') + '" placeholder="https://..." /></div>' +
        '<div><label class="fl">Caption</label><input class="fi" data-field="caption" data-index="' + idx + '" value="' + escapeAttr(block.caption || '') + '" placeholder="Optional caption" /></div>' +
        '<div><label class="fl">Alignment</label><select class="fi" data-field="align" data-index="' + idx + '"><option value="left"' + (block.align === 'left' ? ' selected' : '') + '>Left</option><option value="center"' + (block.align !== 'left' && block.align !== 'right' ? ' selected' : '') + '>Center</option><option value="right"' + (block.align === 'right' ? ' selected' : '') + '>Right</option></select></div>' +
        '<div><label class="fl">Image Width</label><input class="fi" data-field="width" data-index="' + idx + '" value="' + escapeAttr(block.width || '') + '" placeholder="auto, 80%, 420px" /></div>' +
      '</div>' + imageSrc;
    } else if (block.type === 'quote') {
      body = '<textarea class="fta" data-field="text" data-index="' + idx + '" placeholder="Quote text">' + escapeHtml(block.text || '') + '</textarea>' +
        '<input class="fi" data-field="source" data-index="' + idx + '" value="' + escapeAttr(block.source || '') + '" placeholder="Quote source" />';
    } else if (block.type === 'list') {
      body = '<textarea class="fta" data-field="items" data-index="' + idx + '" placeholder="One item per line">' + escapeHtml(block.items || '') + '</textarea>';
    } else if (block.type === 'code') {
      body = '<textarea class="fta" data-field="code" data-index="' + idx + '" placeholder="Code or fixed-width text">' + escapeHtml(block.code || '') + '</textarea>';
    } else {
      body = '<div style="font-size:.8rem;color:var(--wht-f)">Horizontal divider</div>';
    }

    return '<div class="doc-block" data-index="' + idx + '">' + head + '<div class="doc-block-body">' + body + '</div></div>';
  }).join('');
}

function updateDocImagePreviewInBlock(blockEl, url) {
  if (!blockEl) return;
  let img = blockEl.querySelector('.doc-image-preview');
  const index = Number(blockEl.getAttribute('data-index'));
  const block = Number.isFinite(index) ? docBlocks[index] : null;
  if (!url) {
    if (img) img.remove();
    return;
  }
  if (!img) {
    img = document.createElement('img');
    img.className = 'doc-image-preview';
    img.alt = 'Selected';
    blockEl.querySelector('.doc-block-body').appendChild(img);
  }
  img.src = url;
  img.style.cssText = buildImageRenderStyle(block && block.width);
}

function moveDocBlock(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= docBlocks.length) return;
  const temp = docBlocks[index];
  docBlocks[index] = docBlocks[next];
  docBlocks[next] = temp;
  renderDocBlocks();
  schedulePreview();
}

function removeDocBlock(index) {
  docBlocks.splice(index, 1);
  renderDocBlocks();
  schedulePreview();
}

function duplicateDocBlock(index) {
  if (index < 0 || index >= docBlocks.length) return;
  const copy = JSON.parse(JSON.stringify(docBlocks[index]));
  docBlocks.splice(index + 1, 0, copy);
  renderDocBlocks();
  schedulePreview();
}

function initDocumentStudio() {
  const toolbar = document.getElementById('doc-toolbar');
  const adders = document.getElementById('doc-adders');
  const holder = document.getElementById('doc-blocks');
  const formatSelect = document.getElementById('doc-format-select');
  const linkBtn = document.getElementById('doc-link-btn');
  if (!toolbar || !adders || !holder) return;

  if (!docBlocks.length) {
    docBlocks = [
      { type: 'title', text: 'Overview' },
      { type: 'text', html: '<p>Start writing your document here.</p>' }
    ];
  }
  renderDocBlocks();

  adders.addEventListener('click', e => {
    const btn = e.target.closest('[data-add-block]');
    if (!btn) return;
    docBlocks.push(createDocBlock(btn.getAttribute('data-add-block')));
    renderDocBlocks();
    schedulePreview();
  });

  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('[data-doc-cmd]');
    if (!btn) return;
    if (!activeDocEditable) {
      alert('Click inside a text block first.');
      return;
    }
    activeDocEditable.focus();
    document.execCommand(btn.getAttribute('data-doc-cmd'), false, null);
    schedulePreview();
  });

  if (linkBtn) {
    linkBtn.addEventListener('click', () => {
      if (!activeDocEditable) {
        alert('Click inside a text block first.');
        return;
      }
      const url = prompt('Enter link URL:');
      if (!url) return;
      activeDocEditable.focus();
      document.execCommand('createLink', false, url);
      schedulePreview();
    });
  }

  if (formatSelect) {
    formatSelect.addEventListener('change', () => {
      if (!activeDocEditable || !formatSelect.value) return;
      activeDocEditable.focus();
      document.execCommand('formatBlock', false, formatSelect.value);
      formatSelect.value = '';
      schedulePreview();
    });
  }

  holder.addEventListener('focusin', e => {
    if (e.target.matches('[contenteditable="true"]')) {
      activeDocEditable = e.target;
    }
  });

  holder.addEventListener('click', e => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    const index = Number(actionBtn.getAttribute('data-index'));
    const action = actionBtn.getAttribute('data-action');
    if (action === 'up') moveDocBlock(index, -1);
    if (action === 'down') moveDocBlock(index, 1);
    if (action === 'duplicate') duplicateDocBlock(index);
    if (action === 'delete') removeDocBlock(index);
  });

  holder.addEventListener('dragstart', e => {
    const handle = e.target.closest('.doc-drag-handle');
    if (!handle) return;
    const block = handle.closest('.doc-block');
    if (!block) return;
    docDragIndex = Number(block.getAttribute('data-index'));
    if (Number.isFinite(docDragIndex)) {
      e.dataTransfer.effectAllowed = 'move';
      block.style.opacity = '0.45';
    }
  });

  holder.addEventListener('dragend', e => {
    const block = e.target.closest('.doc-block');
    if (block) block.style.opacity = '1';
    docDragIndex = -1;
    holder.querySelectorAll('.doc-block').forEach(el => el.style.borderColor = '');
  });

  holder.addEventListener('dragover', e => {
    e.preventDefault();
    const targetBlock = e.target.closest('.doc-block');
    if (!targetBlock) return;
    holder.querySelectorAll('.doc-block').forEach(el => el.style.borderColor = '');
    targetBlock.style.borderColor = 'var(--red-b)';
  });

  holder.addEventListener('drop', e => {
    e.preventDefault();
    const targetBlock = e.target.closest('.doc-block');
    if (!targetBlock || !Number.isFinite(docDragIndex) || docDragIndex < 0) return;

    const targetIndex = Number(targetBlock.getAttribute('data-index'));
    if (!Number.isFinite(targetIndex) || targetIndex === docDragIndex) return;

    const moved = docBlocks.splice(docDragIndex, 1)[0];
    const insertAt = docDragIndex < targetIndex ? targetIndex : targetIndex;
    docBlocks.splice(insertAt, 0, moved);
    renderDocBlocks();
    schedulePreview();
  });

  function handleBlockValueChange(target) {
    const index = Number(target.getAttribute('data-index'));
    const field = target.getAttribute('data-field');
    if (!Number.isFinite(index) || index < 0 || index >= docBlocks.length || !field) return;

    if (target.matches('[contenteditable="true"]')) {
      docBlocks[index][field] = target.innerHTML;
      schedulePreview();
      return;
    }

    const value = target.value;
    if (field === 'uploadSelect') {
      docBlocks[index].url = value;
      updateDocImagePreviewInBlock(target.closest('.doc-block'), value);
      schedulePreview();
      return;
    }

    if (field === 'url') {
      docBlocks[index][field] = value;
      updateDocImagePreviewInBlock(target.closest('.doc-block'), value);
      schedulePreview();
      return;
    }

    if (field === 'align') {
      docBlocks[index][field] = value;
      schedulePreview();
      return;
    }

    if (field === 'width') {
      docBlocks[index][field] = normalizeImageWidthValue(value);
      renderDocBlocks();
      schedulePreview();
      return;
    } else {
      docBlocks[index][field] = value;
    }
    schedulePreview();
  }

  holder.addEventListener('input', e => {
    if (e.target.hasAttribute('data-field')) handleBlockValueChange(e.target);
  });

  holder.addEventListener('change', e => {
    if (e.target.hasAttribute('data-field')) handleBlockValueChange(e.target);
  });
}

function buildDocumentModeHTML() {
  const parts = [];
  docBlocks.forEach(block => {
    if (block.type === 'title' && block.text && block.text.trim()) {
      parts.push('<h2 class="doc-title-main">' + escapeHtml(block.text.trim()) + '</h2>');
      return;
    }
    if (block.type === 'text' && stripTags(block.html || '').length) {
      parts.push('<div class="doc-rich">' + (block.html || '') + '</div>');
      return;
    }
    if (block.type === 'image' && isValidImageSrc(block.url)) {
      const align = (block.align === 'left' || block.align === 'right') ? block.align : 'center';
      const captionText = (block.caption || 'Document image').trim();
      const caption = block.caption ? '<figcaption>' + escapeHtml(block.caption) + '</figcaption>' : '';
      parts.push('<figure class="doc-image-wrap align-' + align + '"><img src="' + escapeAttr(block.url) + '" alt="' + escapeAttr(captionText) + '" loading="lazy" decoding="async" />' + caption + '</figure>');
      return;
    }
    if (block.type === 'quote' && (block.text || '').trim()) {
      const source = block.source ? '<footer>— ' + escapeHtml(block.source) + '</footer>' : '';
      parts.push('<blockquote><p>' + escapeHtml(block.text.trim()) + '</p>' + source + '</blockquote>');
      return;
    }
    if (block.type === 'list' && (block.items || '').trim()) {
      const items = String(block.items).split(/\n+/).map(s => s.trim()).filter(Boolean);
      if (items.length) {
        parts.push('<ul>' + items.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>');
      }
      return;
    }
    if (block.type === 'code' && (block.code || '').trim()) {
      parts.push('<pre><code>' + escapeHtml(block.code.trim()) + '</code></pre>');
      return;
    }
    if (block.type === 'divider') {
      parts.push('<hr />');
    }
  });

  return {
    html: '<div class="doc-editor-page">' + parts.join('\n') + '</div>',
    css: DOC_DEFAULT_CSS
  };
}

function hasDocumentContent() {
  return docBlocks.some(block => {
    if (block.type === 'title') return !!String(block.text || '').trim();
    if (block.type === 'text') return !!stripTags(block.html || '');
    if (block.type === 'image') return isValidImageSrc(block.url);
    if (block.type === 'quote') return !!String(block.text || '').trim();
    if (block.type === 'list') return String(block.items || '').split(/\n+/).map(s => s.trim()).filter(Boolean).length > 0;
    if (block.type === 'code') return !!String(block.code || '').trim();
    if (block.type === 'divider') return true;
    return false;
  });
}

function wrapWithDefaultSchema(html, title) {
  const raw = (html || '').trim();
  const safeTitle = escapeHtml((title || '').trim() || 'New Classified Document');
  if (!raw) {
    return DEFAULT_NEW_PAGE_HTML.replace('New Classified Document', safeTitle);
  }
  if (raw.includes('class="page-shell"')) return raw;
  return '<div class="page-shell">\n' +
    '  <header class="page-header">\n' +
    '    <h1 class="page-title">' + safeTitle + '</h1>\n' +
    '    <p class="page-subtitle">Clearance Level 2 // Internal Distribution</p>\n' +
    '  </header>\n' + raw + '\n</div>';
}

function mergeWithDefaultSchemaCSS(css) {
  return normalizePageCss(sanitizeCSS(css || '')).trim();
}

function normalizePageCss(css) {
  if (!css) return '';
  return String(css)
    .replace(/#1a1a1a/gi, '#f2f2f2')
    .replace(/#444\b/gi, '#d7d7d7')
    .replace(/#888\b/gi, '#c7c7c7')
    .replace(/#f5f5f5/gi, '#111111')
    .replace(/#f9f9f9/gi, '#101010')
    .replace(/#ddd\b/gi, '#3a3a3a')
    .replace(/#eee\b/gi, '#2f2f2f');
}

function sanitizeCSS(css) {
  let safe = String(css || '').replace(/<\/?style\b[^>]*>/gi, '');

  // Do not allow remote stylesheet inclusion.
  safe = safe.replace(/@import\s+[^;]+;?/gi, '');

  // Drop custom property declarations to prevent variable-based style injection.
  safe = safe.replace(/--[a-z0-9_-]+\s*:\s*[^;{}]+;?/gi, '');

  // Block legacy executable CSS vectors.
  safe = safe.replace(/expression\s*\(/gi, 'blocked(');
  safe = safe.replace(/behavior\s*:/gi, 'blocked-behavior:');

  // Remove external URL fetches from CSS values.
  safe = safe.replace(/url\(([^)]+)\)/gi, (_match, rawValue) => {
    const value = String(rawValue || '').trim().replace(/^['"]|['"]$/g, '');
    if (!value) return 'url("")';
    if (value.startsWith('/') || value.startsWith('#')) return 'url("' + value + '")';
    if (/^data:image\//i.test(value)) return 'url("' + value + '")';
    return 'url("")';
  });

  return safe;
}

function buildSandboxDocument(html, css) {
  const htmlWithLazyImages = String(html || '').replace(/<img(?![^>]*\bloading=)([^>]*?)>/gi, '<img loading="lazy" decoding="async"$1>');
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">' +
    '<style>' +
    ':root{--red:#8b0000;--red-b:#cc0000;--red-d:#5c0000;--blk:#000;--blk-s:#0a0a0a;--blk-c:#111;--wht:#fff;--wht-m:#ccc;--wht-d:#999;--font-m:"IBM Plex Mono",monospace;--font-d:"Special Elite",monospace;color-scheme:dark}' +
    '*{margin:0;padding:0;box-sizing:border-box}body{font-family:var(--font-m);line-height:1.7;padding:24px;color:var(--wht-m);background:var(--blk)}img{max-width:100%;height:auto}' +
    '.page-shell{max-width:960px;margin:0 auto;padding:24px}.page-header{padding:24px;border-bottom:2px solid var(--red-d);margin-bottom:24px;background:linear-gradient(180deg,rgba(139,0,0,.1),transparent)}.page-title{font-family:var(--font-d);font-size:2rem;color:var(--wht);text-transform:uppercase;letter-spacing:3px;margin-bottom:8px}.page-subtitle{font-size:.8rem;color:var(--red-b);letter-spacing:2px;text-transform:uppercase}.page-section{margin-bottom:24px;padding:20px;border:1px solid var(--red-d);background:var(--blk-s)}.page-section h2{font-family:var(--font-d);color:var(--wht);text-transform:uppercase;letter-spacing:2px;border-bottom:1px dashed var(--red-d);padding-bottom:8px;margin-bottom:12px}' +
    css.replace(/<\/style>/gi, '') +
    '</style></head><body>' + htmlWithLazyImages + '</body></html>';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function textToHtmlParagraphs(text) {
  if (!text) return '';
  return text.split(/\n\n+/).map(p => '<p>' + escapeHtml(p.trim()) + '</p>').join('\n');
}

function buildAnomalyTemplate() {
  const itemNum = document.getElementById('sf-title').value.trim() || 'ROG-XXX';
  const objClass = document.getElementById('tf-object-class').value;
  const heroUrl = document.getElementById('tf-hero-img').value;
  const containment = document.getElementById('tf-containment').value.trim();
  const description = document.getElementById('tf-description').value.trim();

  let html = '<div class="rog-header">\n';
  html += '  <h1>' + escapeHtml(itemNum) + '</h1>\n';
  html += '  <div class="rog-class"><span class="rog-class-label">Object Class:</span> ' + escapeHtml(objClass) + '</div>\n';
  html += '</div>\n\n';

  if (heroUrl) {
    html += '<div class="rog-hero"><img src="' + heroUrl + '" alt="' + escapeHtml(itemNum) + '" /></div>\n\n';
  }

  if (containment) {
    html += '<div class="rog-section">\n';
    html += '  <h2>Special Containment Procedures</h2>\n';
    html += '  ' + textToHtmlParagraphs(containment) + '\n';
    html += '</div>\n\n';
  }

  if (description) {
    html += '<div class="rog-section">\n';
    html += '  <h2>Description</h2>\n';
    html += '  ' + textToHtmlParagraphs(description) + '\n';
    html += '</div>\n\n';
  }

  // Subsections
  const subs = document.querySelectorAll('#tf-subsections .subsection-block');
  subs.forEach(sub => {
    const titleEl = sub.querySelector('input');
    const bodyEl = sub.querySelector('textarea');
    if (titleEl && bodyEl && (titleEl.value.trim() || bodyEl.value.trim())) {
      html += '<div class="rog-section">\n';
      if (titleEl.value.trim()) html += '  <h2>' + escapeHtml(titleEl.value.trim()) + '</h2>\n';
      if (bodyEl.value.trim()) html += '  ' + textToHtmlParagraphs(bodyEl.value.trim()) + '\n';
      html += '</div>\n\n';
    }
  });

  const css = `
.rog-header {
  text-align: center;
  padding: 32px 24px;
  border-bottom: 3px solid #8b0000;
  margin-bottom: 32px;
}
.rog-header h1 {
  font-size: 2.2rem;
  color: #f2f2f2;
  letter-spacing: 4px;
  margin-bottom: 8px;
}
.rog-class {
  font-size: 1rem;
  color: #d7d7d7;
  text-transform: uppercase;
  letter-spacing: 2px;
}
.rog-class-label { color: #8b0000; font-weight: 700; }
.rog-hero {
  text-align: center;
  margin-bottom: 32px;
  padding: 16px;
  border: 1px solid #3a3a3a;
  background: #101010;
}
.rog-hero img { max-width: 100%; max-height: 400px; object-fit: contain; }
.rog-section {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid #2f2f2f;
}
.rog-section:last-child { border-bottom: none; }
.rog-section h2 {
  font-size: 1.2rem;
  color: #8b0000;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #4a4a4a;
}
.rog-section p { margin-bottom: 12px; color: #d8d8d8; }`;

  return { html, css };
}

function buildTaleTemplate() {
  const subtitle = document.getElementById('tf-tale-subtitle').value.trim();
  const heroUrl = document.getElementById('tf-tale-hero').value;
  const intro = document.getElementById('tf-tale-intro').value.trim();

  let html = '<div class="tale-header">\n';
  html += '  <h1>' + escapeHtml(document.getElementById('sf-title').value.trim() || 'Untitled Tale') + '</h1>\n';
  if (subtitle) html += '  <div class="tale-subtitle">' + escapeHtml(subtitle) + '</div>\n';
  html += '</div>\n\n';

  if (heroUrl) {
    html += '<div class="tale-hero"><img src="' + heroUrl + '" alt="Tale illustration" /></div>\n\n';
  }

  if (intro) {
    html += '<div class="tale-body tale-intro">\n  ' + textToHtmlParagraphs(intro) + '\n</div>\n\n';
  }

  const subs = document.querySelectorAll('#tf-tale-sections .subsection-block');
  subs.forEach(sub => {
    const titleEl = sub.querySelector('input');
    const bodyEl = sub.querySelector('textarea');
    if (titleEl && bodyEl && (titleEl.value.trim() || bodyEl.value.trim())) {
      html += '<div class="tale-chapter">\n';
      if (titleEl.value.trim()) html += '  <h2>' + escapeHtml(titleEl.value.trim()) + '</h2>\n';
      if (bodyEl.value.trim()) html += '  <div class="tale-body">' + textToHtmlParagraphs(bodyEl.value.trim()) + '</div>\n';
      html += '</div>\n\n';
    }
  });

  const css = `
.tale-header {
  text-align: center;
  padding: 48px 24px 32px;
  margin-bottom: 32px;
}
.tale-header h1 {
  font-size: 2rem;
  color: #f2f2f2;
  font-style: italic;
  margin-bottom: 8px;
}
.tale-subtitle {
  font-size: .9rem;
  color: #c7c7c7;
  letter-spacing: 2px;
  text-transform: uppercase;
}
.tale-hero {
  text-align: center;
  margin-bottom: 32px;
}
.tale-hero img { max-width: 100%; max-height: 400px; border-radius: 4px; }
.tale-body { max-width: 640px; margin: 0 auto; }
.tale-body p { margin-bottom: 16px; text-indent: 2em; color: #d8d8d8; }
.tale-intro { font-style: italic; border-left: 3px solid #8b0000; padding-left: 24px; margin-bottom: 32px; background: #101010; }
.tale-chapter { margin-bottom: 40px; }
.tale-chapter h2 {
  text-align: center;
  font-size: 1.1rem;
  color: #8b0000;
  letter-spacing: 4px;
  margin-bottom: 20px;
  text-transform: uppercase;
}`;

  return { html, css };
}

function buildArtworkTemplate() {
  const imgUrl = document.getElementById('tf-art-img').value;
  const artist = document.getElementById('tf-art-artist').value.trim();
  const medium = document.getElementById('tf-art-medium').value.trim();
  const desc = document.getElementById('tf-art-desc').value.trim();

  let html = '<div class="art-showcase">\n';
  html += '  <h1>' + escapeHtml(document.getElementById('sf-title').value.trim() || 'Untitled') + '</h1>\n';
  if (imgUrl) {
    html += '  <div class="art-frame"><img src="' + imgUrl + '" alt="Artwork" /></div>\n';
  }
  html += '  <div class="art-info">\n';
  if (artist) html += '    <div class="art-artist">By ' + escapeHtml(artist) + '</div>\n';
  if (medium) html += '    <div class="art-medium">' + escapeHtml(medium) + '</div>\n';
  if (desc) html += '    <div class="art-desc">' + textToHtmlParagraphs(desc) + '</div>\n';
  html += '  </div>\n';
  html += '</div>\n';

  const css = `
.art-showcase { text-align: center; }
.art-showcase h1 {
  font-size: 1.8rem;
  color: #f2f2f2;
  margin-bottom: 24px;
  letter-spacing: 2px;
}
.art-frame {
  background: #111111;
  padding: 24px;
  border: 1px solid #3a3a3a;
  margin-bottom: 24px;
  display: inline-block;
}
.art-frame img { max-width: 100%; max-height: 600px; }
.art-info { max-width: 600px; margin: 0 auto; text-align: left; }
.art-artist { font-size: 1rem; color: #8b0000; font-weight: 700; margin-bottom: 4px; }
.art-medium { font-size: .85rem; color: #c7c7c7; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px; }
.art-desc p { margin-bottom: 12px; color: #d8d8d8; }`;

  return { html, css };
}

function buildGuideTemplate() {
  const intro = document.getElementById('tf-guide-intro').value.trim();
  const heroUrl = document.getElementById('tf-guide-hero').value;

  let html = '<div class="guide-header">\n';
  html += '  <h1>' + escapeHtml(document.getElementById('sf-title').value.trim() || 'Guide') + '</h1>\n';
  html += '</div>\n\n';

  if (heroUrl) {
    html += '<div class="guide-hero"><img src="' + heroUrl + '" alt="Guide illustration" /></div>\n\n';
  }

  // Table of contents
  const subs = document.querySelectorAll('#tf-guide-sections .subsection-block');
  if (subs.length > 0) {
    html += '<nav class="guide-toc">\n  <h2>Table of Contents</h2>\n  <ol>\n';
    let tocIdx = 1;
    subs.forEach(sub => {
      const titleEl = sub.querySelector('input');
      if (titleEl && titleEl.value.trim()) {
        html += '    <li><a href="#section-' + tocIdx + '">' + escapeHtml(titleEl.value.trim()) + '</a></li>\n';
      }
      tocIdx++;
    });
    html += '  </ol>\n</nav>\n\n';
  }

  if (intro) {
    html += '<div class="guide-section">\n  <h2>Introduction</h2>\n  ' + textToHtmlParagraphs(intro) + '\n</div>\n\n';
  }

  let secIdx = 1;
  subs.forEach(sub => {
    const titleEl = sub.querySelector('input');
    const bodyEl = sub.querySelector('textarea');
    if (titleEl && bodyEl && (titleEl.value.trim() || bodyEl.value.trim())) {
      html += '<div class="guide-section" id="section-' + secIdx + '">\n';
      if (titleEl.value.trim()) html += '  <h2>' + escapeHtml(titleEl.value.trim()) + '</h2>\n';
      if (bodyEl.value.trim()) html += '  ' + textToHtmlParagraphs(bodyEl.value.trim()) + '\n';
      html += '</div>\n\n';
    }
    secIdx++;
  });

  const css = `
.guide-header {
  text-align: center;
  padding: 32px 24px;
  border-bottom: 3px solid #8b0000;
  margin-bottom: 32px;
}
.guide-header h1 { font-size: 2rem; color: #f2f2f2; letter-spacing: 3px; }
.guide-hero { text-align: center; margin-bottom: 32px; }
.guide-hero img { max-width: 100%; max-height: 300px; }
.guide-toc {
  background: #101010;
  border: 1px solid #3a3a3a;
  padding: 20px 24px;
  margin-bottom: 32px;
}
.guide-toc h2 { font-size: 1rem; color: #8b0000; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 2px; }
.guide-toc ol { padding-left: 20px; }
.guide-toc li { margin-bottom: 6px; }
.guide-toc a { color: #8b0000; text-decoration: none; }
.guide-toc a:hover { text-decoration: underline; }
.guide-section { margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #2f2f2f; }
.guide-section:last-child { border-bottom: none; }
.guide-section h2 {
  font-size: 1.2rem;
  color: #8b0000;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 16px;
}
.guide-section p { margin-bottom: 12px; color: #d8d8d8; }`;

  return { html, css };
}

// ═════════════════════════════════════════════════════════════
// IMAGE UPLOAD
// ═════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('img-input');
  const chooseBtn = document.getElementById('choose-images-btn');
  const uploadStatus = document.getElementById('upload-status');

  function openFilePicker() {
    input.click();
  }

  zone.addEventListener('click', openFilePicker);
  zone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFilePicker();
    }
  });
  if (chooseBtn) chooseBtn.addEventListener('click', openFilePicker);
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  input.addEventListener('change', e => {
    if (uploadStatus) {
      uploadStatus.textContent = e.target.files && e.target.files.length
        ? e.target.files.length + ' file(s) selected.'
        : 'No files selected.';
    }
    handleFiles(e.target.files);
    input.value = '';
  });

  // Live preview on code editor changes
  const htmlEl = document.getElementById('sf-html');
  const cssEl = document.getElementById('sf-css');
  htmlEl.addEventListener('input', schedulePreview);
  cssEl.addEventListener('input', schedulePreview);

  // Tab key support in code textareas
  [htmlEl, cssEl].forEach(ta => {
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        ta.value = ta.value.substring(0, start) + '  ' + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + 2;
        schedulePreview();
      }
    });
  });

  // Slug auto-generation from title
  const titleEl = document.getElementById('sf-title');
  titleEl.addEventListener('input', () => {
    // If anomaly, enforce uppercase for the ROG-XXX format
    if (document.getElementById('sf-type').value === 'Anomaly') {
      titleEl.value = titleEl.value.toUpperCase();
    }
    updateSlugPreview();
    schedulePreview();
  });
  document.getElementById('sf-slug').addEventListener('input', updateSlugPreview);
  document.getElementById('sf-anomaly-subtype').addEventListener('change', schedulePreview);
  document.getElementById('sf-anomaly-code').addEventListener('input', schedulePreview);

  initTagPicker();

  // Bind all template fields to preview
  document.querySelectorAll('#template-mode input, #template-mode textarea, #template-mode select').forEach(el => {
    el.addEventListener('input', schedulePreview);
    el.addEventListener('change', schedulePreview);
  });

  initDocumentStudio();

  document.getElementById('sf-html').value = DEFAULT_NEW_PAGE_HTML;
  document.getElementById('sf-css').value = '';
  setGuideSectionsFixedStructure();
  onAnomalySubtypeChange();
  updateTagSummary();
  updateTypeSpecificUI();
  updateSlugPreview();
  updatePreview();
});

function handleFiles(files) {
  Array.from(files).forEach(file => {
    const fingerprint = file.name + '::' + file.size + '::' + file.lastModified;
    const alreadyQueued = uploadedImages.some(img => !img.removed && img.fingerprint === fingerprint && (img.status === 'uploading' || img.status === 'ready'));
    if (alreadyQueued) {
      const uploadStatus = document.getElementById('upload-status');
      if (uploadStatus) uploadStatus.textContent = file.name + ' is already queued.';
      return;
    }

    if (!isAllowedStorageImage(file)) {
      alert('Only image files are allowed: ' + file.name);
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      alert('File too large (max 2MB): ' + file.name);
      return;
    }
    uploadImage(file);
  });
}

function isAllowedStorageImage(file) {
  const mimeType = String(file && file.type ? file.type : '').toLowerCase();
  if (ALLOWED_STORAGE_IMAGE_TYPES.has(mimeType)) return true;

  const extension = String(file && file.name ? file.name : '').toLowerCase().split('.').pop();
  return extension === 'png' || extension === 'jpg' || extension === 'jpeg' || extension === 'gif' || extension === 'webp';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

function dataUrlByteLength(dataUrl) {
  const parts = String(dataUrl || '').split(',');
  if (parts.length < 2) return 0;
  const base64 = parts[1];
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image for optimization.'));
    img.src = dataUrl;
  });
}

async function optimizeImageForFirestore(file) {
  const original = await fileToDataUrl(file);
  const image = await loadImageFromDataUrl(original);

  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  const maxDim = FIRESTORE_IMAGE_MAX_DIMENSION;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.max(1, Math.floor(width * scale));
  height = Math.max(1, Math.floor(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context for image optimization.');
  ctx.drawImage(image, 0, 0, width, height);

  // Convert to JPEG to keep payloads Firestore-friendly for Spark limits.
  let quality = 0.82;
  let out = canvas.toDataURL('image/jpeg', quality);

  while (dataUrlByteLength(out) > FIRESTORE_IMAGE_MAX_BYTES && quality > 0.45) {
    quality -= 0.08;
    out = canvas.toDataURL('image/jpeg', quality);
  }

  let shrinkPass = 0;
  while (dataUrlByteLength(out) > FIRESTORE_IMAGE_MAX_BYTES && shrinkPass < 4) {
    width = Math.max(1, Math.floor(width * 0.85));
    height = Math.max(1, Math.floor(height * 0.85));
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, width, height);
    out = canvas.toDataURL('image/jpeg', Math.max(0.45, quality));
    shrinkPass++;
  }

  const bytes = dataUrlByteLength(out);
  if (bytes > FIRESTORE_IMAGE_MAX_BYTES) {
    throw new Error('Image remains too large after optimization. Use a smaller image.');
  }

  return { dataUrl: out, bytes: bytes, width: width, height: height };
}

function getStorageBucketCandidates() {
  const configured = (firebaseConfig && firebaseConfig.storageBucket) ? String(firebaseConfig.storageBucket).replace(/^gs:\/\//, '') : '';
  const projectId = (firebaseConfig && firebaseConfig.projectId) ? String(firebaseConfig.projectId).trim() : '';
  const candidates = [];

  if (configured) candidates.push(configured);
  if (projectId) {
    candidates.push(projectId + '.firebasestorage.app');
    candidates.push(projectId + '.appspot.com');
  }

  // Keep first occurrence only.
  return candidates.filter((bucket, idx) => bucket && candidates.indexOf(bucket) === idx);
}

function getImageMimeType(file) {
  const mimeType = String(file && file.type ? file.type : '').toLowerCase();
  if (ALLOWED_STORAGE_IMAGE_TYPES.has(mimeType)) {
    return mimeType;
  }

  const ext = (file.name || '').toLowerCase().split('.').pop();
  const mimeMap = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp'
  };

  return mimeMap[ext] || '';
}

function createUploadTask(ref, file, onProgress) {
  return new Promise((resolve, reject) => {
    let lastProgressAt = Date.now();
    let uploadStarted = false;
    let uploadCompleted = false;
    const metadata = {
      contentType: getImageMimeType(file),
      cacheControl: 'public,max-age=31536000,immutable'
    };
    
    // Timeout if nothing happens for 30 seconds
    const initialTimeout = setTimeout(() => {
      if (!uploadStarted) {
        try { task.cancel(); } catch (e) { /* ignore */ }
        clearInterval(stallTimer);
        reject(new Error('Upload timeout: No progress after 30 seconds. Check Firebase Storage rules and network connection.'));
      }
    }, 30000);

    const task = ref.put(file, metadata);

    const stallTimer = setInterval(() => {
      if (Date.now() - lastProgressAt > UPLOAD_STALL_TIMEOUT_MS) {
        try { task.cancel(); } catch (e) { /* ignore */ }
      }
    }, UPLOAD_STALL_CHECK_MS);

    task.on('state_changed',
      snap => {
        uploadStarted = true;
        clearTimeout(initialTimeout);
        lastProgressAt = Date.now();
        if (typeof onProgress === 'function') onProgress(snap, task);
      },
      err => {
        if (uploadCompleted) return;
        uploadCompleted = true;
        clearInterval(stallTimer);
        clearTimeout(initialTimeout);
        console.error('[Upload Error]', err.code, err.message);
        reject(err);
      },
      async () => {
        if (uploadCompleted) return;
        uploadCompleted = true;
        clearInterval(stallTimer);
        clearTimeout(initialTimeout);
        try {
          const url = await ref.getDownloadURL();
          resolve({ task, url });
        } catch (downloadErr) {
          console.error('[Download URL Error]', downloadErr);
          reject(downloadErr);
        }
      }
    );
  });
}

async function uploadWithBucketFallback(path, file, uploadRecord, setProgress) {
  const buckets = getStorageBucketCandidates();
  console.log('[uploadWithBucketFallback] Buckets to try:', buckets);
  const retryable = new Set([
    'storage/retry-limit-exceeded',
    'storage/network-request-failed',
    'storage/invalid-default-bucket',
    'storage/bucket-not-found',
    'storage/unknown'
  ]);
  const errors = [];

  // First attempt: default initialized storage client.
  const defaultAttempts = [''];
  const attempts = defaultAttempts.concat(buckets);

  for (let i = 0; i < attempts.length; i++) {
    if (uploadRecord.removed) {
      const removedErr = new Error('Upload canceled by user.');
      removedErr.code = 'storage/canceled';
      throw removedErr;
    }

    const bucket = attempts[i];
    console.log('[uploadWithBucketFallback] Attempt', i, 'bucket:', bucket || '(default)');
    let ref;
    try {
      ref = bucket ? getStorageRef(path, bucket) : getStorageRef(path);
    } catch (initErr) {
      console.error('[uploadWithBucketFallback] Ref init failed:', initErr);
      errors.push(initErr);
      continue;
    }

    try {
      const { task, url } = await createUploadTask(ref, file, setProgress);
      uploadRecord.task = task;
      console.log('[uploadWithBucketFallback] Upload succeeded');
      return url;
    } catch (err) {
      const code = err && err.code ? err.code : '';
      console.error('[uploadWithBucketFallback] Upload failed:', code, err.message);
      errors.push(err);
      if (code === 'storage/unauthorized' || code === 'storage/canceled') throw err;
      if (!retryable.has(code)) throw err;
    }
  }

  const finalErr = errors[errors.length - 1] || new Error('Upload failed after bucket fallback attempts.');
  console.error('[uploadWithBucketFallback] All attempts failed:', finalErr);
  throw finalErr;
}

async function uploadImage(file) {
  if (!currentUserForSubmit) { alert('Please sign in first.'); return; }

  const progressWrap = document.getElementById('upload-progress');
  const progressBar = document.getElementById('upload-bar');
  const uploadStatus = document.getElementById('upload-status');
  if (!progressWrap || !progressBar) {
    alert('Upload UI is unavailable on this page.');
    return;
  }

  progressWrap.style.display = 'block';
  progressBar.style.width = '0%';
  if (uploadStatus) uploadStatus.textContent = 'Preparing ' + file.name + '...';

  const activeCount = uploadedImages.filter(img => !img.removed).length;
  if (activeCount >= FIRESTORE_IMAGE_LIMIT) {
    progressWrap.style.display = 'none';
    alert('You can attach up to ' + FIRESTORE_IMAGE_LIMIT + ' images per submission in Spark mode.');
    return;
  }

  if (!isAllowedStorageImage(file)) {
    progressWrap.style.display = 'none';
    alert('Only PNG, JPG, GIF, and WebP images can be uploaded.');
    return;
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = 'uploads/' + currentUserForSubmit.uid + '/' + timestamp + '_' + safeName;
  const uploadId = timestamp + '_' + Math.random().toString(36).slice(2, 8) + '_' + safeName;
  const fingerprint = file.name + '::' + file.size + '::' + file.lastModified;
  const localUrl = await fileToDataUrl(file);
  const uploadRecord = { id: uploadId, name: file.name, file: file, url: localUrl, localUrl: localUrl, remoteUrl: '', status: 'uploading', removed: false, path: path, task: null, fingerprint: fingerprint, timeoutId: null };
  uploadedImages.push(uploadRecord);
  renderImageList();
  refreshImageSelectors();

  console.log('[Upload] Starting upload:', { uid: currentUserForSubmit.uid, path, fileName: file.name, fileSize: file.size });

  function finalizeFailure(msg) {
    if (uploadRecord.removed) return;
    uploadRecord.status = 'failed';
    renderImageList();
    progressWrap.style.display = 'none';
    if (uploadStatus) uploadStatus.textContent = 'Upload failed for ' + file.name + '. Click Retry.';
    console.error('[Upload] Failed:', msg);
    if (msg) alert(msg);
  }

  function finalizeSuccess(url) {
    if (uploadRecord.removed) return;
    uploadRecord.remoteUrl = url;
    uploadRecord.url = url;
    uploadRecord.status = 'ready';
    renderImageList();
    refreshImageSelectors();
    progressWrap.style.display = 'none';
    if (uploadStatus) uploadStatus.textContent = 'Uploaded ' + file.name + '.';
    console.log('[Upload] Success:', url);
  }

  try {
    uploadRecord.status = 'uploading';
    renderImageList();
    if (uploadStatus) uploadStatus.textContent = 'Uploading ' + file.name + ' to Storage...';
    progressBar.style.width = '20%';

    const remoteUrl = await uploadWithBucketFallback(path, file, uploadRecord, snap => {
      const pct = snap && snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 20;
      progressBar.style.width = Math.max(20, Math.min(100, pct)) + '%';
      if (uploadStatus) uploadStatus.textContent = 'Uploading ' + file.name + '... ' + Math.max(20, Math.min(100, pct)) + '%';
    });
    progressBar.style.width = '100%';
    finalizeSuccess(remoteUrl);
    uploadRecord.sizeBytes = file.size;
    uploadRecord.storageMode = 'storage-download-url';
    if (uploadStatus) {
      uploadStatus.textContent = 'Uploaded ' + file.name + ' to Storage.';
    }
  } catch (err) {
    const code = err && err.code ? err.code : '';
    if (code === 'storage/canceled' && uploadRecord.removed) return;
    finalizeFailure('Image upload failed: ' + (err.message || code || 'Unknown error'));
  }
}

function renderImageList() {
  const list = document.getElementById('img-list');
  list.innerHTML = uploadedImages.map((img) => {
    const displayUrl = img.remoteUrl || img.localUrl || img.url || '';
    const label = img.status === 'ready' ? 'Uploaded' : img.status === 'failed' ? 'Failed' : 'Uploading';
    return `
    <div class="img-item">
      <img src="${displayUrl}" alt="${img.name}" />
      <div style="flex:1;min-width:0">
        <span class="img-url" title="${displayUrl}">${img.name}</span>
        <div style="font-size:.65rem;color:var(--wht-f);margin-top:3px;text-transform:uppercase;letter-spacing:1px">${label}</div>
      </div>
      <button class="btn btn-sm btn-s btn-copy" type="button" onclick="copyImageUrl('${img.id}', this)">Copy URL</button>
      ${img.status === 'failed' ? '<button class="btn btn-sm btn-s" type="button" onclick="retryUploadedImage(\'' + img.id + '\')">Retry</button>' : ''}
      <button class="btn btn-sm btn-d" type="button" onclick="removeUploadedImage('${img.id}')">Remove</button>
    </div>
  `;
  }).join('');
}

function retryUploadedImage(id) {
  const record = uploadedImages.find(img => img.id === id);
  if (!record || !record.file) return;
  removeUploadedImage(id);
  uploadImage(record.file);
}

function removeUploadedImage(id) {
  const index = uploadedImages.findIndex(img => img.id === id);
  if (index === -1) return;
  const record = uploadedImages[index];
  record.removed = true;
  if (record.task && record.status === 'uploading' && typeof record.task.cancel === 'function') {
    try { record.task.cancel(); } catch (e) { /* ignore */ }
  }
  if (record.timeoutId) {
    try { clearTimeout(record.timeoutId); } catch (e) { /* ignore */ }
  }
  uploadedImages.splice(index, 1);
  renderImageList();
  refreshImageSelectors();
  const uploadStatus = document.getElementById('upload-status');
  if (uploadStatus) uploadStatus.textContent = 'Image removed.';
}

function refreshImageSelectors() {
  const selectors = ['tf-hero-img', 'tf-tale-hero', 'tf-art-img', 'tf-guide-hero'];
  selectors.forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const prev = sel.value;
    const noneLabel = selId.includes('art') ? 'Upload an image above first' : 'None — No hero image';
    sel.innerHTML = '<option value="">' + noneLabel + '</option>';
    uploadedImages.filter(img => img.status === 'ready' && img.remoteUrl).forEach((img, i) => {
      const opt = document.createElement('option');
      opt.value = img.remoteUrl;
      opt.textContent = img.name;
      sel.appendChild(opt);
    });
    if (prev && Array.from(sel.options).some(option => option.value === prev)) {
      sel.value = prev;
    }
  });

  refreshDocumentImagePickers();
}

function refreshDocumentImagePickers() {
  document.querySelectorAll('#doc-blocks select[data-field="uploadSelect"]').forEach(selectEl => {
    const index = Number(selectEl.getAttribute('data-index'));
    const selected = Number.isFinite(index) && docBlocks[index] ? (docBlocks[index].url || '') : '';
    selectEl.innerHTML = getUploadedImageOptions(selected);
    if (selected && Array.from(selectEl.options).some(option => option.value === selected)) {
      selectEl.value = selected;
    }
  });
}

function copyImageUrl(id, buttonEl) {
  const record = uploadedImages.find(img => img.id === id);
  if (!record) return;
  const url = record.remoteUrl || '';
  if (!url) {
    alert('Image is not uploaded yet. Please wait for upload completion.');
    return;
  }
  navigator.clipboard.writeText(url).then(() => {
    if (buttonEl) {
      buttonEl.textContent = 'Copied!';
      setTimeout(() => { buttonEl.textContent = 'Copy URL'; }, 1500);
    }
  }).catch(() => {
    prompt('Copy this URL:', url);
  });
}

// ═════════════════════════════════════════════════════════════
// HTML SANITIZATION
// ═════════════════════════════════════════════════════════════

function sanitizeHTML(html) {
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  clean = clean.replace(/javascript\s*:/gi, 'blocked:');
  clean = clean.replace(/<\s*\/?\s*(iframe|object|embed|applet|meta|link)\b[^>]*>/gi, '');
  return clean;
}

function embedUploadedImagesIfMissing(html, imageUrls) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
  if (!urls.length) return html || '';

  const raw = String(html || '');
  if (raw.includes('class="uploaded-assets"')) return raw;

  // If at least one uploaded URL is already used in content, respect author layout.
  if (urls.some(url => raw.includes(url))) return raw;

  const gallery = '\n<div class="page-section uploaded-assets">' +
    '<h2>Uploaded Assets</h2>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">' +
      urls.map((url, idx) =>
        '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none">' +
          '<img src="' + url + '" alt="Uploaded asset ' + (idx + 1) + '" style="display:block;max-width:100%;width:auto;height:auto;border:1px solid #3a3a3a;background:#111" />' +
        '</a>'
      ).join('') +
    '</div>' +
  '</div>';

  return raw + gallery;
}

// ═════════════════════════════════════════════════════════════
// LIVE PREVIEW
// ═════════════════════════════════════════════════════════════

function schedulePreview() {
  clearTimeout(previewDebounce);
  previewDebounce = setTimeout(updatePreview, 300);
  scheduleDraftAutoSave();
}

function updatePreview() {
  let html, css;

  if (currentMode === 'template') {
    const result = buildTemplateHTML();
    html = result.html;
    css = result.css;
  } else if (currentMode === 'doc') {
    const result = buildDocumentModeHTML();
    html = result.html;
    css = result.css;
  } else {
    html = document.getElementById('sf-html').value;
    css = document.getElementById('sf-css').value;
  }

  const frame = document.getElementById('preview-frame');
  const sanitized = sanitizeHTML(html);
  const htmlWithUploads = embedUploadedImagesIfMissing(sanitized, uploadedImages.map(img => img.remoteUrl || img.url));
  const wrappedHtml = wrapWithDefaultSchema(htmlWithUploads, document.getElementById('sf-title').value || 'New Classified Document');
  const doc = buildSandboxDocument(wrappedHtml, mergeWithDefaultSchemaCSS(css));
  frame.srcdoc = doc;
}

function validateAnomalyDesignation(subtype, rawCode) {
  const rule = ANOMALY_SUBTYPE_RULES[subtype];
  const code = String(rawCode || '').toUpperCase().trim();
  if (!rule) {
    return { valid: false, code: '', error: 'Please select an anomaly submission type.' };
  }
  if (!rule.pattern.test(code)) {
    return { valid: false, code: '', error: rule.hint };
  }
  return { valid: true, code: code, rule: rule };
}

async function shouldBypassSubmissionReview() {
  const user = currentUserForSubmit;
  if (!user) return false;

  await rolesReady;
  if (isModerator(user.email)) return true;

  try {
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) return false;
    const userData = userDoc.data() || {};
    if (userData.authorizedMember === true) return true;
    return String(userData.role || '').toLowerCase() === 'authorized';
  } catch (_err) {
    return false;
  }
}

// ═════════════════════════════════════════════════════════════
// SUBMIT PAGE
// ═════════════════════════════════════════════════════════════

async function submitPage() {
  if (!currentUserForSubmit) { alert('Please sign in first.'); return; }

  let title = document.getElementById('sf-title').value.trim();
  const type = document.getElementById('sf-type').value;
  const tags = getSelectedTags();
  const manualSlug = document.getElementById('sf-slug').value.trim();
  const slug = manualSlug || generateSlug(title);
  const anomalySubtype = document.getElementById('sf-anomaly-subtype').value;
  const anomalyCodeInput = document.getElementById('sf-anomaly-code').value;

  if (type === 'Anomaly') {
    title = title.toUpperCase();
    document.getElementById('sf-title').value = title;
  }

  if (!title) { alert('Please enter a title.'); return; }
  if (!slug) { alert('Please enter a valid slug.'); return; }

  let anomalyId = '';
  let anomalyListKey = '';
  let anomalySubtypeLabel = '';
  if (type === 'Anomaly') {
    const validation = validateAnomalyDesignation(anomalySubtype, anomalyCodeInput);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    anomalyId = validation.code;
    anomalyListKey = validation.rule.listKey;
    anomalySubtypeLabel = validation.rule.label;
    if (!title.startsWith(anomalyId)) {
      alert('Anomaly titles must begin with the exact designation. Example: ' + anomalyId + ': Entry Title');
      return;
    }
  }

  // Anomaly-specific validation
  if (type === 'Anomaly' && currentMode === 'template') {
    const description = document.getElementById('tf-description').value.trim();
    if (!description) {
      alert('Description is mandatory for Anomaly submissions. Please provide a detailed description of the anomaly.');
      return;
    }
  }

  let htmlContent, cssContent;
  try {
    const content = buildCurrentEditorContent(true);
    htmlContent = content.htmlContent;
    cssContent = content.cssContent;
  } catch (err) {
    alert(err.message || 'Could not build submission content.');
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.textContent = 'Verifying ID constraints...';
  btn.disabled = true;

  // Check for duplicate title
  if (type === 'Anomaly') {
    try {
      const existingPagesByTitle = await db.collection('pages')
        .where('type', '==', 'Anomaly')
        .where('title', '==', title)
        .limit(1)
        .get();
      const existingSubsByTitle = await db.collection('submissions')
        .where('type', '==', 'Anomaly')
        .where('title', '==', title)
        .where('status', 'in', ['pending', 'approved'])
        .limit(1)
        .get();
      const titleExists = !existingPagesByTitle.empty || !existingSubsByTitle.empty;

      if (titleExists && (!submitEditTarget || submitEditTarget.id === null)) {
        alert('An Anomaly with the title "' + title + '" already exists. Anomaly titles must be unique.');
        btn.textContent = '>> Submit for Review';
        btn.disabled = false;
        return;
      }
    } catch(e) {
      console.warn("Title uniqueness check skipped:", e);
    }
  }

  if (type === 'Anomaly' && anomalyId) {
    try {
      const existingPages = await db.collection('pages')
        .where('type', '==', 'Anomaly')
        .where('anomalyId', '==', anomalyId)
        .limit(1)
        .get();
      const existingSubs = await db.collection('submissions')
        .where('type', '==', 'Anomaly')
        .where('anomalyId', '==', anomalyId)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
      const found = !existingPages.empty || !existingSubs.empty;

      if (found) {
        alert('An Anomaly entry for ID "' + anomalyId + '" already exists or is pending review. You cannot create a duplicate Anomaly designation, though you may submit Tales or Art for it.');
        btn.textContent = '>> Submit for Review';
        btn.disabled = false;
        return;
      }
    } catch(e) {
      console.warn("Uniqueness check skipped due to missing composite index.", e);
    }
  }

  btn.textContent = 'Checking slug...';
  btn.disabled = true;

  try {
    const existingPages = await db.collection('pages').where('slug', '==', slug).limit(1).get();
    const existingSubs = await db.collection('submissions').where('slug', '==', slug).where('status', '==', 'pending').limit(1).get();
    const slugUsedByOtherPage = !existingPages.empty && existingPages.docs.some(doc => doc.id !== (submitEditTarget && submitEditTarget.id));
    if (slugUsedByOtherPage || (!submitEditTarget && !existingSubs.empty)) {
      alert('The URL slug "' + slug + '" is already in use. Please choose a different slug.');
      btn.textContent = '>> Submit for Review';
      btn.disabled = false;
      return;
    }
  } catch (e) {
    // Firestore might not have indexes yet -> proceed
  }

  btn.textContent = 'Submitting...';

  const inFlightUploads = uploadedImages.filter(img => !img.removed && img.status === 'uploading');
  if (inFlightUploads.length) {
    alert('Please wait until all image uploads finish before submitting.');
    btn.textContent = '>> Submit for Review';
    btn.disabled = false;
    return;
  }

  const failedUploads = uploadedImages.filter(img => !img.removed && img.status === 'failed');
  if (failedUploads.length) {
    alert('One or more uploads failed. Retry or remove failed images before submitting.');
    btn.textContent = '>> Submit for Review';
    btn.disabled = false;
    return;
  }

  const uploadedUrls = uploadedImages.filter(img => !img.removed && img.remoteUrl).map(img => img.remoteUrl);
  const sanitizedHTML = sanitizeHTML(htmlContent);
  const wrappedHTML = wrapWithDefaultSchema(sanitizedHTML, title);
  const mergedCSS = mergeWithDefaultSchemaCSS(cssContent);
  const isAdminUser = await getUserAdminFlag(currentUserForSubmit);

  const submission = {
    title: title,
    anomalyId: anomalyId,
    anomalySubtype: anomalySubtype || '',
    anomalySubtypeLabel: anomalySubtypeLabel || '',
    anomalyListKey: anomalyListKey || '',
    type: type,
    tags: tags,
    slug: slug,
    htmlContent: wrappedHTML,
    cssContent: mergedCSS,
    imageUrls: uploadedUrls,
    authorUid: currentUserForSubmit.uid,
    authorEmail: currentUserForSubmit.email,
    authorName: currentUserForSubmit.displayName || currentUserForSubmit.email.split('@')[0],
    status: 'pending',
    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    if (submitEditTarget && submitEditTarget.id) {
      if (!isAdminUser) {
        alert('Only Admin or Owner accounts can edit existing pages.');
        return;
      }

      const result = await callSubmissionApi('POST', {
        action: 'publish',
        pageId: submitEditTarget.id,
        submissionId: activeDraftId || '',
        submission: submission,
        reviewerName: currentUserForSubmit.displayName || currentUserForSubmit.email.split('@')[0] || 'Admin',
        removeDraft: !!activeDraftId
      });
      alert('Page updated successfully.');
      const publishedPageId = result.pageId || submitEditTarget.id;
      window.location.href = slug ? ('page.html?slug=' + encodeURIComponent(slug)) : ('page.html?id=' + encodeURIComponent(publishedPageId));
      return;
    }

    const result = await callSubmissionApi('POST', {
      action: isAdminUser ? 'publish' : 'submit',
      submissionId: activeDraftId || '',
      submission: submission,
      reviewerName: currentUserForSubmit.displayName || currentUserForSubmit.email.split('@')[0] || 'Admin',
      removeDraft: !!activeDraftId
    });
    activeDraftId = null;
    if (isAdminUser) {
      alert('Published directly by admin clearance.\nLive at: /pages/' + slug);
    } else {
      alert('Submission received! Your page will be reviewed by Guild admins.\nOnce approved, it will be live at: /pages/' + slug);
    }
    resetSubmitForm();
    loadMySubmissions();
  } catch (err) {
    alert('Submission failed: ' + err.message);
  } finally {
    btn.textContent = submitEditTarget ? '>> Save Page Changes' : '>> Submit for Review';
    btn.disabled = false;
  }
}

function resetSubmitForm() {
  suppressDraftAutoSave = true;
  submitEditTarget = null;
  activeDraftId = null;
  document.getElementById('sf-title').value = '';
  document.getElementById('sf-type').value = 'Anomaly';
  setSelectedTags([]);
  document.getElementById('sf-anomaly-subtype').value = '';
  document.getElementById('sf-anomaly-code').value = '';
  document.getElementById('sf-slug').value = '';
  document.getElementById('sf-html').value = DEFAULT_NEW_PAGE_HTML;
  document.getElementById('sf-css').value = '';

  // Reset template fields
  ['tf-containment', 'tf-description', 'tf-tale-subtitle', 'tf-tale-intro',
   'tf-art-artist', 'tf-art-medium', 'tf-art-desc', 'tf-guide-intro'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['tf-object-class'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = 'Alona';
  });
  ['tf-hero-img', 'tf-tale-hero', 'tf-art-img', 'tf-guide-hero'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Clear subsections
  ['tf-subsections', 'tf-tale-sections', 'tf-guide-sections'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  subsectionCounters = { anomaly: 0, tale: 0, guide: 0 };

  docBlocks = [
    { type: 'title', text: 'Overview' },
    { type: 'text', html: '<p>Start writing your document here.</p>' }
  ];
  renderDocBlocks();

  uploadedImages = [];
  renderImageList();
  refreshImageSelectors();
  updateTagSummary();
  onAnomalySubtypeChange();
  updateTypeSpecificUI();
  updateSlugPreview();
  updatePreview();
  document.getElementById('submit-btn').textContent = '>> Submit for Review';
  setDraftStatus('Draft autosave is idle.');
  suppressDraftAutoSave = false;
}

// ═════════════════════════════════════════════════════════════
// MY SUBMISSIONS
// ═════════════════════════════════════════════════════════════

async function loadMySubmissions() {
  if (!currentUserForSubmit) return;
  const container = document.getElementById('my-submissions');
  if (!container) return;

  try {
    const result = await callSubmissionApi('GET');
    const submissions = Array.isArray(result.submissions) ? result.submissions : [];

    if (submissions.length === 0) {
      container.innerHTML = '<p style="font-size:.8rem;color:var(--wht-f);text-align:center;padding:24px">No submissions yet. Create your first page above!</p>';
      return;
    }

    container.innerHTML = submissions.map(entry => {
      const d = entry;
      const s = entry.data;
      const statusClass = 'status status-' + s.status;
      const ts = s.updatedAt || s.submittedAt;
      const date = ts && ts.seconds ? new Date(ts.seconds * 1000).toLocaleDateString() : '—';
      const slug = s.slug || '';
      let extra = '';
      if (s.status === 'rejected' && s.rejectionReason) {
        extra = '<div style="font-size:.75rem;color:var(--red-b);margin-top:4px">Reason: ' + s.rejectionReason + '</div>' +
          '<div style="margin-top:6px"><button class="btn btn-sm btn-s" type="button" onclick="openRejectedSubmissionPreview(\'' + d.id + '\')" style="font-size:.65rem">Preview Rejected Page</button></div>';
      }
      if (s.status === 'approved') {
        const pageUrl = slug ? 'pages/' + slug : 'page.html?id=' + (s.approvedPageId || d.id);
        extra = '<div style="margin-top:4px"><a href="' + pageUrl + '" class="btn btn-sm btn-s" style="font-size:.65rem">View Live Page</a></div>';
      }
      let deleteBtn = '';
      if (s.status === 'pending') {
        deleteBtn = '<button class="btn btn-sm btn-d" onclick="deleteMySubmission(\'' + d.id + '\')" style="margin-left:8px">Withdraw</button>';
      }
      if (s.status === 'draft') {
        deleteBtn = '<button class="btn btn-sm btn-s" type="button" onclick="continueDraftSubmission(\'' + d.id + '\')" style="margin-left:8px">Continue Draft</button>' +
          '<button class="btn btn-sm btn-d" onclick="deleteMySubmission(\'' + d.id + '\')" style="margin-left:8px">Delete Draft</button>';
      }
      const slugInfo = slug ? '<span style="font-size:.65rem;color:var(--wht-f);margin-left:8px">/pages/' + slug + '</span>' : '';
      return '<div class="my-sub-row"><div class="my-sub-info"><div><div class="my-sub-title">' + s.title + slugInfo + '</div><div class="my-sub-meta">' + s.type + ' · ' + date + '</div>' + extra + '</div></div><div style="display:flex;align-items:center"><span class="' + statusClass + '">' + s.status + '</span>' + deleteBtn + '</div></div>';
    }).join('');

  } catch (err) {
    container.innerHTML = '<p style="font-size:.8rem;color:var(--wht-f);text-align:center;padding:24px">Could not load submissions.</p>';
  }
}

async function deleteMySubmission(id) {
  if (!confirm('Withdraw this submission? This cannot be undone.')) return;
  try {
    await callSubmissionApi('DELETE', { id: id });
    if (activeDraftId === id) activeDraftId = null;
    loadMySubmissions();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}
