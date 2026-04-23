/* ═══════════════════════════════════════════════════════════════
 *  SUBMIT.JS — Page submission with Template Builder + Code Editor
 *  Templates, slug generation, image upload, HTML sanitization
 * ═══════════════════════════════════════════════════════════════ */

let uploadedImages = [];
let uploadedMediaFiles = [];
let currentUserForSubmit = null;
let previewDebounce = null;
let currentMode = 'doc'; // 'template' | 'doc' | 'code'
let currentTemplate = 'anomaly'; // 'anomaly' | 'tale' | 'artwork' | 'guide'
let subsectionCounters = { anomaly: 0, tale: 0, guide: 0 };
let docBlocks = [];
let activeDocEditable = null;
let docDragIndex = -1;
let mediaDragReorderEnabled = false;
let submitEditTarget = null;
let activeDraftId = null;
let draftAutoSaveTimer = null;
let draftSaveInFlight = false;
let suppressDraftAutoSave = false;
let assetSyncTimer = null;
let assetSyncInFlight = false;
let lastAssetSyncSignature = '';
let uploadQueue = [];
let uploadWorkers = 0;
const IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const AUDIO_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_UPLOAD_LIMIT = 5;
const AUDIO_UPLOAD_LIMIT = 3;
const VIDEO_UPLOAD_LIMIT = 3;
const UPLOAD_QUEUE_MAX_PARALLEL = 4;
const IMAGE_FAST_OPTIMIZE_THRESHOLD_BYTES = 1400000;
const UPLOAD_STALL_CHECK_MS = 15000;
const UPLOAD_STALL_TIMEOUT_MS = 300000;
const ALLOWED_STORAGE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const ALLOWED_STORAGE_AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/mp4']);
const ALLOWED_STORAGE_VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-matroska']);
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/mpeg', 'audio/wav', 'audio/mp4',
  'video/mp4', 'video/webm'
]);
const BASE_TAG_OPTIONS = [
  'object', 'animal', 'humanoid', 'plant', 'artifact', 'document', 'digital',
  'memetic', 'cognitohazard', 'spatial', 'temporal', 'biological', 'dangerous',
  'archive', 'field-report'
];
let customTagOptions = [];
let selectedTagsState = new Set();
let selectedEntryProfile = '';
let designationLocked = false;
let submitViewMode = 'explorer'; // 'explorer' | 'editor' | 'history' | 'drafts'
let submissionApiBase = '/api/submit';
let hasUnsavedEditorChanges = false;
let submitAutosaveEnabled = true;
let currentUserCanAccessLore = false;
let lastSubmitAttemptAt = 0;
let maxSubmitClearanceLevel = 4;
const nativeSubmitAlert = window.alert.bind(window);
let submitAlertModal = null;

const DRAFT_AUTOSAVE_SETTING_KEY = 'rog-submit-autosave-enabled';
const DOC_MEDIA_DRAG_SETTING_KEY = 'rog-doc-media-drag-enabled';
const DRAFT_AUTOSAVE_MIN_WORDS = 150;

function normalizeClearanceLevel(value, fallback = 2) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(6, parsed));
}

function enforceSubmitClearanceSelection(requestedValue) {
  const select = document.getElementById('sf-clearance');
  const requested = normalizeClearanceLevel(requestedValue, 2);
  const allowed = Math.min(maxSubmitClearanceLevel, requested);
  if (select) {
    select.value = String(allowed);
  }
  return allowed;
}

function closeSubmitAlertModal() {
  if (submitAlertModal) {
    submitAlertModal.remove();
    submitAlertModal = null;
  }
  document.body.classList.remove('submit-alert-open');
}

function showSubmitAlert(message) {
  const text = String(message == null ? '' : message);
  if (!document.body) {
    nativeSubmitAlert(text);
    return;
  }

  closeSubmitAlertModal();

  const overlay = document.createElement('div');
  overlay.className = 'submit-alert-overlay';
  overlay.innerHTML = '' +
    '<div class="submit-alert-modal" role="dialog" aria-modal="true" aria-labelledby="submit-alert-title">' +
      '<div class="submit-alert-head">' +
        '<div class="submit-alert-kicker">Red Oaker Guild</div>' +
        '<h3 id="submit-alert-title">System Notice</h3>' +
      '</div>' +
      '<div class="submit-alert-body">' +
        '<p>' + text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>' +
      '</div>' +
      '<div class="submit-alert-actions">' +
        '<button class="btn btn-p" type="button" data-close-submit-alert>OK</button>' +
      '</div>' +
    '</div>';

  submitAlertModal = overlay;
  document.body.appendChild(overlay);
  document.body.classList.add('submit-alert-open');

  const closeButton = overlay.querySelector('[data-close-submit-alert]');
  if (closeButton) {
    closeButton.addEventListener('click', closeSubmitAlertModal);
    setTimeout(() => closeButton.focus(), 0);
  }

  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeSubmitAlertModal();
  });
}

window.alert = showSubmitAlert;
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && submitAlertModal) {
    closeSubmitAlertModal();
  }
});

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
    placeholder: 'SLOA-A000',
    hint: 'SLOA format: SLOA-A000 (letter + 3 digits, up to A999 per letter).',
    pattern: /^SLOA-[A-Z]\d{3}$/
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

const ENTRY_PROFILES = {
  ros: { key: 'ros', label: 'ROS Format', type: 'Anomaly', subtype: 'ROS', template: 'anomaly' },
  soa: { key: 'soa', label: 'SOA Format', type: 'Anomaly', subtype: 'SOA', template: 'anomaly' },
  sloa: { key: 'sloa', label: 'SLOA Format', type: 'Anomaly', subtype: 'SLOA', template: 'anomaly' },
  sctor: { key: 'sctor', label: 'Cross Test Format', type: 'Anomaly', subtype: 'SCTOR', template: 'anomaly' },
  tl: { key: 'tl', label: 'Termination Log Format', type: 'Anomaly', subtype: 'TL', template: 'anomaly' },
  tale: { key: 'tale', label: 'Narrative / Field Report', type: 'Tale', template: 'tale' },
  artwork: { key: 'artwork', label: 'Artwork Upload', type: 'Artwork', template: 'artwork' },
  lore: { key: 'lore', label: 'Archived History', type: 'Lore', template: 'guide' }
};

const TYPE_CANONICAL_MAP = {
  Report: 'Tale',
  Test: 'Anomaly'
};

function getCanonicalType(rawType) {
  const value = String(rawType || '').trim();
  return TYPE_CANONICAL_MAP[value] || value || 'Anomaly';
}

function getDisplayTypeForEditor(storedType, anomalySubtype) {
  const baseType = String(storedType || '').trim() || 'Anomaly';
  if (baseType === 'Anomaly' && (anomalySubtype === 'SCTOR' || anomalySubtype === 'TL')) {
    return 'Test';
  }
  return baseType;
}

function isAnomalyFamilyType(rawType) {
  const type = String(rawType || '').trim();
  return type === 'Anomaly' || type === 'Test';
}

function isNarrativeFamilyType(rawType) {
  const type = String(rawType || '').trim();
  return type === 'Tale' || type === 'Report';
}

function isLoreFamilyType(rawType) {
  return String(rawType || '').trim() === 'Lore';
}

function isMediaEnabledSubmissionType(rawType) {
  const type = String(rawType || '').trim().toLowerCase();
  return isAnomalyFamilyType(rawType) || isNarrativeFamilyType(rawType) || type === 'guide' || type === 'legacy' || type === 'lore';
}

function getSelectedSubmissionType() {
  return String(document.getElementById('sf-type')?.value || '').trim();
}

function getStorageMediaKind(file) {
  const mimeType = String(file && file.type ? file.type : '').toLowerCase();
  if (ALLOWED_STORAGE_IMAGE_TYPES.has(mimeType)) return 'image';
  if (ALLOWED_STORAGE_AUDIO_TYPES.has(mimeType)) return 'audio';
  if (ALLOWED_STORAGE_VIDEO_TYPES.has(mimeType)) return 'video';

  const extension = String(file && file.name ? file.name : '').toLowerCase().split('.').pop();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) return 'image';
  if (['mp3', 'mpeg', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'webm'].includes(extension)) return 'audio';
  if (['mp4', 'mov', 'qt', 'webm', 'ogv', 'mkv'].includes(extension)) return 'video';
  return '';
}

function getUploadLimitForKind(kind) {
  if (kind === 'audio') return AUDIO_UPLOAD_LIMIT;
  if (kind === 'video') return VIDEO_UPLOAD_LIMIT;
  return IMAGE_UPLOAD_LIMIT;
}

function getUploadMaxBytesForKind(kind) {
  if (kind === 'audio') return AUDIO_UPLOAD_MAX_BYTES;
  if (kind === 'video') return VIDEO_UPLOAD_MAX_BYTES;
  return IMAGE_UPLOAD_MAX_BYTES;
}

function isAllowedStorageMedia(file) {
  return !!getStorageMediaKind(file);
}

function getUploadedMediaCollection(kind) {
  if (kind === 'image') return uploadedImages;
  return uploadedMediaFiles;
}

function getUploadedMediaRecords() {
  return uploadedImages.concat(uploadedMediaFiles);
}

function getActiveUploadedCount(kind) {
  return getUploadedMediaCollection(kind).filter(item => !item.removed).length;
}

function getUploadScopeLabel(kind) {
  if (kind === 'audio') return 'audio file';
  if (kind === 'video') return 'video file';
  return 'image';
}

function isUploadPendingStatus(status) {
  return status === 'queued' || status === 'preparing' || status === 'retrying' || status === 'uploading';
}

function getUploadStatusLabel(status) {
  if (status === 'ready') return 'Uploaded';
  if (status === 'failed') return 'Failed';
  if (status === 'queued') return 'Queued';
  if (status === 'preparing') return 'Preparing';
  if (status === 'retrying') return 'Retrying';
  return 'Uploading';
}

function applyTypeSubtypeConstraints() {
  const type = String(document.getElementById('sf-type')?.value || '').trim();
  const subtypeEl = document.getElementById('sf-anomaly-subtype');
  if (!subtypeEl) return;

  const isTest = type === 'Test';
  const isAnomaly = type === 'Anomaly';

  const allowed = isTest
    ? new Set(['SCTOR', 'TL'])
    : isAnomaly
      ? new Set(['ROS', 'SOA', 'SLOA'])
      : new Set(['ROS', 'SOA', 'SLOA', 'SCTOR', 'TL']);

  Array.from(subtypeEl.options || []).forEach(opt => {
    if (!opt.value) {
      opt.disabled = false;
      opt.hidden = false;
      return;
    }
    const enabled = allowed.has(opt.value);
    opt.disabled = !enabled;
    opt.hidden = !enabled;
  });

  if (subtypeEl.value && !allowed.has(subtypeEl.value)) {
    subtypeEl.value = isTest ? 'SCTOR' : isAnomaly ? 'ROS' : '';
  }
}

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
.doc-editor-page { max-width: 860px; margin: 0 auto; padding-bottom: 40px; }
.doc-editor-page .doc-title-main {
  font-family: var(--font-d);
  text-transform: uppercase;
  letter-spacing: 3px;
  color: #f2f2f2;
  margin: 30px 0 20px 0;
  border-bottom: 2px solid #333;
  padding-bottom: 10px;
}
.doc-editor-page .doc-rich, .doc-editor-page p { color: #d8d8d8; margin-bottom: 16px; line-height: 1.6; }
.doc-editor-page h2 { color: #f2f2f2; margin: 24px 0 12px 0; letter-spacing: 2px; text-transform: uppercase; border-left: 4px solid #8b0000; padding-left: 15px; }
.doc-editor-page h3 { color: #d7d7d7; margin: 20px 0 10px 0; letter-spacing: 1px; text-transform: uppercase; }

.doc-editor-page .doc-image-container { margin: 24px 0; width: 100%; }
.doc-editor-page .doc-image-wrap, .doc-editor-page figure { margin-bottom: 20px; }
.doc-editor-page .doc-image-wrap img, .doc-editor-page figure img { max-width: 100%; height: auto; border: 1px solid #3a3a3a; background: #0b0b0b; display: block; }
.doc-editor-page .doc-image-wrap figcaption, .doc-editor-page figure figcaption { margin-top: 10px; color: #aaa; font-size: .85rem; font-style: italic; line-height: 1.4; }

.doc-editor-page .align-left { text-align: left; }
.doc-editor-page .align-center { text-align: center; }
.doc-editor-page .align-right { text-align: right; }

.doc-editor-page .doc-image-row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: center;
}
.doc-editor-page .doc-image-row .doc-image-wrap, .doc-editor-page .doc-image-row figure {
  flex: 1 1 300px;
  margin: 0;
  max-width: calc(50% - 8px);
}
.doc-editor-page .doc-image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}
.doc-editor-page .doc-image-grid .doc-image-wrap, .doc-editor-page .doc-image-grid figure {
  margin: 0;
}

.doc-editor-page blockquote {
  border-left: 3px solid #8b0000;
  background: rgba(139, 0, 0, 0.05);
  padding: 16px 20px;
  color: #e0e0e0;
  margin: 24px 0;
  font-style: italic;
}
.doc-editor-page blockquote footer { margin-top: 10px; color: #999; font-size: .85rem; text-align: right; }
.doc-editor-page hr { border: none; border-top: 1px solid #333; margin: 32px 0; }
.doc-editor-page pre {
  margin: 24px 0;
  padding: 16px;
  border: 1px solid #2a2a2a;
  background: #050505;
  color: #00ff41;
  overflow-x: auto;
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
}
.doc-editor-page ul, .doc-editor-page ol { margin: 16px 0 16px 30px; color: #d8d8d8; }
.doc-editor-page li { margin-bottom: 8px; }
`;

// ═════════════════════════════════════════════════════════════
// AUTH GATE
// ═════════════════════════════════════════════════════════════

async function setClearanceLimits(user) {
  if (!user) return;
  
  const isOwnerUser = isOwner(user.email);
  const isAdminUser = await getUserAdminFlag(user);
  
  let maxLevel = 4; // Default for normal users
  if (isOwnerUser) {
    maxLevel = 6;
  } else if (isAdminUser) {
    maxLevel = 5;
  }
  maxSubmitClearanceLevel = maxLevel;
  
  const clearanceSelect = document.getElementById('sf-clearance');
  const limitNote = document.getElementById('clearance-limit-note');
  
  if (clearanceSelect) {
    // Limit options above the user's role ceiling.
    Array.from(clearanceSelect.options).forEach(option => {
      const level = normalizeClearanceLevel(option.value, 2);
      const blocked = level > maxLevel;
      option.disabled = blocked;
      option.hidden = blocked;
      option.style.display = blocked ? 'none' : '';
    });

    const currentValue = normalizeClearanceLevel(clearanceSelect.value, maxLevel);
    clearanceSelect.value = String(Math.min(currentValue, maxLevel));
  }
  
  if (limitNote) {
    if (isOwnerUser) {
      limitNote.textContent = 'Your role allows up to Level 6.';
    } else if (isAdminUser) {
      limitNote.textContent = 'Your role allows up to Level 5.';
    } else {
      limitNote.textContent = 'Your role allows up to Level 4.';
    }
  }
}

auth.onAuthStateChanged(async user => {
  document.getElementById('submit-loading').classList.add('hidden');
  const navAuth = document.getElementById('nav-auth');
  if (user) {
    currentUserForSubmit = user;
    submitAutosaveEnabled = loadSubmitAutosaveSetting(user);
    document.getElementById('submit-denied').classList.add('hidden');
    document.getElementById('submit-panel').classList.remove('hidden');
    navAuth.innerHTML = renderSubmitUserMenu(user);
    setDraftStatus('Draft autosave is idle.');
    configureSubmissionApiBase();
    setLoreWorkshopVisibility(true);
    await setClearanceLimits(user);
    initializeSubmitEditModeFromUrl();
    initializeReconstructionPrefillFromUrl();

    const params = new URLSearchParams(window.location.search);
    const isForcedEditor = !!(params.get('editId') || params.get('editSlug') || params.get('reconstruct') === '1');
    const entryProfile = String(params.get('entry') || '').toLowerCase();
    const view = String(params.get('view') || '').toLowerCase();

    if (isForcedEditor) {
      showSubmitEditor(true);
    } else if (view === 'history') {
      openSubmissionHistoryView();
    } else if (view === 'drafts') {
      openSubmissionDraftsView();
    } else if (ENTRY_PROFILES[entryProfile]) {
      applyEntryProfile(entryProfile);
    } else {
      showSubmitEditor(false);
    }
  } else {
    currentUserForSubmit = null;
    currentUserCanAccessLore = false;
    activeDraftId = null;
    document.getElementById('submit-denied').classList.remove('hidden');
    document.getElementById('submit-panel').classList.add('hidden');
    navAuth.innerHTML = '<button class="nav-btn" onclick="location.href=\'index.html\'">Sign In</button>';
  }
});

window.addEventListener('beforeunload', event => {
  if (!currentUserForSubmit) return;
  if (hasUnsavedEditorChanges) {
    event.preventDefault();
    event.returnValue = 'You have unsaved content. Leave this page anyway?';
  }
});

function getTagOptions() {
  return [...BASE_TAG_OPTIONS, ...customTagOptions];
}

function loadSubmitAutosaveSetting(user) {
  const activeUser = user || currentUserForSubmit;
  const key = activeUser && activeUser.uid ? (DRAFT_AUTOSAVE_SETTING_KEY + ':' + activeUser.uid) : DRAFT_AUTOSAVE_SETTING_KEY;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null && activeUser && activeUser.uid) {
      const legacy = localStorage.getItem(DRAFT_AUTOSAVE_SETTING_KEY);
      if (legacy === 'off') return false;
      if (legacy === 'on') return true;
    }
    if (raw === 'off') return false;
    if (raw === 'on') return true;
  } catch (_err) {
    // Use default.
  }
  return true;
}

function setSubmitAutosaveSetting(value) {
  const normalized = String(value || '').toLowerCase();
  submitAutosaveEnabled = normalized !== 'off';
  const activeUser = currentUserForSubmit;
  const key = activeUser && activeUser.uid ? (DRAFT_AUTOSAVE_SETTING_KEY + ':' + activeUser.uid) : DRAFT_AUTOSAVE_SETTING_KEY;
  try {
    localStorage.setItem(key, submitAutosaveEnabled ? 'on' : 'off');
  } catch (_err) {
    // Storage unavailable. Keep runtime value.
  }
  setDraftStatus(submitAutosaveEnabled ? 'Draft autosave is enabled.' : 'Draft autosave is disabled.');
}

function renderSubmitUserMenu(user) {
  const label = String((user && user.displayName) || 'Agent').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const autosaveValue = submitAutosaveEnabled ? 'on' : 'off';
  return '' +
    '<div class="user-menu" data-user-menu>' +
      '<button class="nav-btn user-menu-trigger" type="button" onclick="toggleUserMenu(this, event)" aria-haspopup="true" aria-expanded="false">' +
        '<span class="user-menu-label">' + label + '</span>' +
        '<span class="user-menu-caret">▾</span>' +
      '</button>' +
      '<div class="user-menu-panel" role="menu" aria-label="User menu">' +
        '<div class="user-menu-setting" onclick="event.stopPropagation()">' +
          '<label class="user-menu-setting-label" for="submit-autosave-setting">Draft Autosave</label>' +
          '<select class="user-menu-setting-select" id="submit-autosave-setting" aria-label="Draft autosave setting" onchange="setSubmitAutosaveSetting(this.value)">' +
            '<option value="on"' + (autosaveValue === 'on' ? ' selected' : '') + '>On</option>' +
            '<option value="off"' + (autosaveValue === 'off' ? ' selected' : '') + '>Off</option>' +
          '</select>' +
        '</div>' +
        '<button class="user-menu-item" type="button" role="menuitem" onclick="changeUsername(); closeUserMenus();">Change Username</button>' +
        '<button class="user-menu-item" type="button" role="menuitem" onclick="auth.signOut(); closeUserMenus();">Log Out</button>' +
      '</div>' +
    '</div>';
}

function normalizeTagValue(tag) {
  return String(tag || '').trim().toLowerCase();
}

function setDesignationLock(locked, note) {
  designationLocked = !!locked;
  const codeEl = document.getElementById('sf-anomaly-code');
  const noteEl = document.getElementById('sf-anomaly-lock-note');
  if (codeEl) {
    codeEl.readOnly = designationLocked;
    codeEl.style.opacity = designationLocked ? '0.72' : '1';
    codeEl.style.cursor = designationLocked ? 'not-allowed' : 'text';
  }
  if (noteEl) {
    noteEl.classList.toggle('hidden', !designationLocked);
    if (designationLocked && note) noteEl.textContent = note;
  }
}

function showSubmitEditor(showEditor) {
  setSubmitViewMode(showEditor ? 'editor' : 'explorer');
}

function setSubmitViewMode(mode) {
  submitViewMode = mode;
  const explorer = document.getElementById('submit-file-explorer');
  const editor = document.getElementById('submit-editor-shell');
  const history = document.getElementById('my-submissions-section');
  const createWorkspace = document.getElementById('submit-create-workspace');
  if (!explorer || !editor || !history || !createWorkspace) return;

  const showExplorer = mode === 'explorer';
  const showEditor = mode !== 'explorer';
  const listMode = mode === 'history' || mode === 'drafts';

  explorer.classList.toggle('hidden', !showExplorer);
  editor.classList.toggle('hidden', !showEditor);
  createWorkspace.classList.toggle('hidden', !showEditor || listMode);
  history.classList.toggle('hidden', !listMode);
  updateMySubmissionsHeading(mode);
}

function updateMySubmissionsHeading(mode) {
  const heading = document.getElementById('my-submissions-heading');
  if (!heading) return;
  if (mode === 'drafts') {
    heading.textContent = 'Saved Drafts';
    return;
  }
  if (mode === 'history') {
    heading.textContent = 'Submission History';
    return;
  }
  heading.textContent = 'Submission Records';
}

function markEditorAsChanged() {
  if (!currentUserForSubmit || suppressDraftAutoSave) return;
  hasUnsavedEditorChanges = true;
}

function clearEditorUnsavedState() {
  hasUnsavedEditorChanges = false;
}

function hasMeaningfulEditorContent() {
  const title = (document.getElementById('sf-title')?.value || '').trim();
  const slug = (document.getElementById('sf-slug')?.value || '').trim();
  const tags = getSelectedTags();
  let content;
  try {
    content = buildCurrentEditorContent(false);
  } catch (_err) {
    content = {
      htmlContent: (document.getElementById('sf-html')?.value || ''),
      cssContent: (document.getElementById('sf-css')?.value || '')
    };
  }
  return !!(title || slug || (Array.isArray(tags) && tags.length) || String(content.htmlContent || '').trim() || String(content.cssContent || '').trim());
}

async function confirmEditorLeaveIfUnsaved() {
  if (submitViewMode !== 'editor' || !hasUnsavedEditorChanges) return true;

  const shouldSave = confirm('You have unsaved content. Save it as a draft before leaving this editor?');
  if (shouldSave) {
    if (!hasMeaningfulEditorContent()) {
      clearEditorUnsavedState();
      return true;
    }
    const draftId = await saveDraft({ silent: false, trigger: 'leave-editor' });
    if (!draftId) {
      alert('Draft save failed. Please resolve the issue before leaving.');
      return false;
    }
    clearEditorUnsavedState();
    return true;
  }

  const discard = confirm('Unsaved content will be lost. Leave without saving?');
  if (discard) {
    clearEditorUnsavedState();
    return true;
  }
  return false;
}

function configureSubmissionApiBase() {
  try {
    const host = String(window.location.hostname || '').toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    const isFile = window.location.protocol === 'file:';
    if (isLocal || isFile) {
      submissionApiBase = 'https://redoakguild.vercel.app/api/submit';
      return;
    }
  } catch (_err) {
    // Keep default relative API path.
  }
  submissionApiBase = '/api/submit';
}

async function openSubmissionHistoryView() {
  const canLeave = await confirmEditorLeaveIfUnsaved();
  if (!canLeave) return;
  setSubmitViewMode('history');
  loadMySubmissions('history');
  setTimeout(() => {
    const history = document.getElementById('my-submissions-section');
    if (history) history.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 0);
}

async function openSubmissionDraftsView() {
  const canLeave = await confirmEditorLeaveIfUnsaved();
  if (!canLeave) return;
  setSubmitViewMode('drafts');
  loadMySubmissions('drafts');
  setTimeout(() => {
    const history = document.getElementById('my-submissions-section');
    if (history) history.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 0);
}

async function openSubmitFileExplorer() {
  const canLeave = await confirmEditorLeaveIfUnsaved();
  if (!canLeave) return;
  selectedEntryProfile = '';
  submitViewMode = 'explorer';
  const banner = document.getElementById('entry-profile-banner');
  if (banner) banner.textContent = 'Mode: General Submission';
  const typeEl = document.getElementById('sf-type');
  const subtypeEl = document.getElementById('sf-anomaly-subtype');
  if (typeEl) typeEl.disabled = false;
  if (subtypeEl) subtypeEl.disabled = false;
  showSubmitEditor(false);
}

function setLoreWorkshopVisibility(canAccess) {
  currentUserCanAccessLore = !!canAccess;
  const loreOption = document.querySelector('#sf-type option[value="Lore"]');
  if (loreOption) {
    loreOption.hidden = !currentUserCanAccessLore;
    loreOption.disabled = !currentUserCanAccessLore;
  }
}

function applyEntryProfile(profileKey) {
  const profile = ENTRY_PROFILES[profileKey];
  if (!profile) return;

  selectedEntryProfile = profile.key;
  const banner = document.getElementById('entry-profile-banner');
  if (banner) banner.textContent = 'Mode: ' + profile.label;

  showSubmitEditor(true);
  switchMode('doc');
  document.getElementById('sf-type').value = profile.type;
  if (profile.template) selectTemplate(profile.template);

  if (profile.type === 'Anomaly') {
    document.getElementById('sf-anomaly-subtype').value = profile.subtype;
    document.getElementById('sf-anomaly-subtype').disabled = true;
    onAnomalySubtypeChange();
  } else {
    const subtypeEl = document.getElementById('sf-anomaly-subtype');
    if (subtypeEl) subtypeEl.disabled = false;
    setDesignationLock(false);
  }

  const typeEl = document.getElementById('sf-type');
  if (typeEl) typeEl.disabled = true;

  updateTypeSpecificUI();
  schedulePreview();
}

function initSubmitExplorer() {
  const panel = document.getElementById('submit-panel');
  if (!panel) return;

  panel.querySelectorAll('[data-entry-profile]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = String(btn.getAttribute('data-entry-profile') || '').toLowerCase();
      applyEntryProfile(key);
    });
  });

  panel.querySelectorAll('[data-open-history]').forEach(btn => {
    btn.addEventListener('click', openSubmissionHistoryView);
  });

  panel.querySelectorAll('[data-open-drafts]').forEach(btn => {
    btn.addEventListener('click', openSubmissionDraftsView);
  });

  panel.querySelectorAll('[data-show-guidebook]').forEach(btn => {
    btn.addEventListener('click', toggleGuidebook);
  });
}

function setDraftStatus(message, isError = false) {
  const el = document.getElementById('draft-status');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? 'var(--red-b)' : 'var(--wht-f)';
}

function toggleGuidebook() {
  const guidebook = document.querySelector('.guidebook');
  const explorer = document.getElementById('submit-file-explorer');
  if (!guidebook || !explorer) return;
  const isHidden = guidebook.style.display === 'none';
  guidebook.style.display = isHidden ? 'block' : 'none';
  explorer.style.display = isHidden ? 'none' : '';
}

function scheduleDraftAutoSave() {
  if (suppressDraftAutoSave || !currentUserForSubmit || !submitAutosaveEnabled) return;
  clearTimeout(draftAutoSaveTimer);
  setDraftStatus('Draft changes detected. Autosaving...');
  draftAutoSaveTimer = setTimeout(() => {
    saveDraft({ silent: true, trigger: 'autosave' });
  }, 2500);
}

function extractWordCountFromHtml(html) {
  const text = String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 0;
  return text.split(' ').filter(Boolean).length;
}

function hasDraftMedia(contentHtml, imageAssets, mediaAssets) {
  if (Array.isArray(imageAssets) && imageAssets.length > 0) return true;
  if (Array.isArray(mediaAssets) && mediaAssets.length > 0) return true;
  return /<(img|audio|video)\b/i.test(String(contentHtml || ''));
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
  const response = await fetch(submissionApiBase + query, {
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
  if (!currentUserForSubmit) return null;
  if (draftSaveInFlight) return activeDraftId;

  const canEditExistingPage = !submitEditTarget || await getUserAdminFlag(currentUserForSubmit);
  if (submitEditTarget && !canEditExistingPage) return null;

  const silent = !!options.silent;
  const trigger = options.trigger || 'manual';

  const title = document.getElementById('sf-title').value.trim();
  const selectedType = document.getElementById('sf-type').value;
  const type = getCanonicalType(selectedType);
  const manualSlug = document.getElementById('sf-slug').value.trim();
  const slug = manualSlug || generateSlug(title);
  const tags = getSelectedTags();
  const anomalySubtype = document.getElementById('sf-anomaly-subtype').value;
  const anomalyCodeInput = document.getElementById('sf-anomaly-code').value;

  let anomalyId = '';
  let anomalyListKey = '';
  let anomalySubtypeLabel = '';
  if (isAnomalyFamilyType(selectedType)) {
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

  const uploadedAssets = collectUploadedMediaAssets();

  const wordCount = extractWordCountFromHtml(content.htmlContent || '');
  const hasImage = hasDraftMedia(content.htmlContent || '', uploadedAssets.imageAssets, uploadedAssets.mediaAssets);
  const meaningfulCss = String(content.cssContent || '').trim().length > 0;
  const isEmpty = !title && !slug && !tags.length && wordCount === 0 && !meaningfulCss && !hasImage;
  if (isEmpty) {
    if (!silent) setDraftStatus('Draft not saved because the page is empty.');
    return null;
  }

  if (trigger === 'autosave') {
    if (wordCount < DRAFT_AUTOSAVE_MIN_WORDS) {
      setDraftStatus('Autosave skipped: at least ' + DRAFT_AUTOSAVE_MIN_WORDS + ' words are required.');
      return null;
    }
    if (!hasImage) {
      setDraftStatus('Autosave skipped: add at least one image, audio, or video before autosaving.');
      return null;
    }
  }

  /* Removed confirm to improve draft persistence reliability */
  // const shouldSave = confirm('Do you want to save this draft now?');
  // if (!shouldSave) {
  //   setDraftStatus('Draft save canceled.');
  //   return null;
  // }

  const uploadedUrls = uploadedAssets.imageAssets.map(asset => asset.url);
  const uploadedMediaUrls = uploadedAssets.mediaAssets.map(asset => asset.url);
  const sanitizedHTML = sanitizeHTML(content.htmlContent || '');
  const wrappedHTML = wrapWithDefaultSchema(sanitizedHTML, title || 'Untitled Draft');
  const mergedCSS = mergeWithDefaultSchemaCSS(content.cssContent || '');

  const clearanceLevel = enforceSubmitClearanceSelection(document.getElementById('sf-clearance').value);

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
    imageAssets: uploadedAssets.imageAssets,
    mediaUrls: uploadedMediaUrls,
    mediaAssets: uploadedAssets.mediaAssets,
    clearanceLevel: clearanceLevel,
    authorUid: currentUserForSubmit.uid,
    authorEmail: currentUserForSubmit.email,
    authorName: currentUserForSubmit.displayName || currentUserForSubmit.email.split('@')[0],
    status: 'draft',
    currentMode: currentMode,
    draftTrigger: trigger,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
    // Preserve structured data for Studio/Template modes
    docBlocks: docBlocks,
    currentMode: currentMode,
    currentTemplate: currentTemplate,
    subsectionCounters: subsectionCounters,
  };

  draftSaveInFlight = true;
  try {
    const result = await callSubmissionApi('POST', {
      action: 'draft',
      submissionId: activeDraftId || (submitEditTarget && submitEditTarget.id) || '',
      submission: removeClientOnlySubmissionFields(draftPayload)
    });
    activeDraftId = result.id || activeDraftId;
    if (!silent) {
      setDraftStatus('Draft saved at ' + new Date().toLocaleTimeString() + '.');
    } else {
      setDraftStatus('Draft autosaved at ' + new Date().toLocaleTimeString() + '.');
    }
    clearEditorUnsavedState();
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
    document.getElementById('sf-type').value = getDisplayTypeForEditor(draft.type || 'Anomaly', draft.anomalySubtype || '');
    document.getElementById('sf-slug').value = draft.slug || '';
    document.getElementById('sf-anomaly-subtype').value = draft.anomalySubtype || '';
    document.getElementById('sf-anomaly-code').value = draft.anomalyId || '';
    enforceSubmitClearanceSelection(draft.clearanceLevel || maxSubmitClearanceLevel);

    const tags = Array.isArray(draft.tags) ? draft.tags : [];
    setSelectedTags(tags);

    // Restore structured state
    docBlocks = Array.isArray(draft.docBlocks) ? JSON.parse(JSON.stringify(draft.docBlocks)) : [];
    currentMode = draft.currentMode || 'code';
    currentTemplate = draft.currentTemplate || 'anomaly';
    if (draft.subsectionCounters) {
      subsectionCounters = { ...draft.subsectionCounters };
    }

    if (currentMode === 'doc') {
      switchMode('doc');
      // No need to set sf-html/sf-css here as Document Studio renders from docBlocks
    } else if (currentMode === 'template') {
      switchMode('template');
      if (currentTemplate) selectTemplate(currentTemplate);
      // Template fields are usually built from DOM, but we should at least restore the mode
    } else {
      switchMode('code');
      document.getElementById('sf-html').value = draft.htmlContent || DEFAULT_NEW_PAGE_HTML;
      document.getElementById('sf-css').value = draft.cssContent || '';
    }

    const draftAssets = Array.isArray(draft.imageAssets) && draft.imageAssets.length
      ? draft.imageAssets
      : (Array.isArray(draft.imageUrls) ? draft.imageUrls.map(url => ({ url: url, caption: '', alt: '' })) : []);
    const draftMediaAssets = Array.isArray(draft.mediaAssets) && draft.mediaAssets.length
      ? draft.mediaAssets
      : (Array.isArray(draft.mediaUrls) ? draft.mediaUrls.map(url => ({ url: url, caption: '', alt: '', kind: 'audio' })) : []);

    uploadedImages = draftAssets.map((asset, idx) => ({
      id: 'draft_image_' + idx + '_' + Date.now(),
      name: 'Draft image ' + (idx + 1),
      kind: 'image',
      url: String(asset.url || ''),
      localUrl: String(asset.url || ''),
      remoteUrl: String(asset.url || ''),
      status: 'ready',
      removed: false,
      file: null,
      caption: String(asset.caption || ''),
      alt: String(asset.alt || ''),
      label: String(asset.label || ''),
      fingerprint: 'draft-image-' + idx
    }));
    uploadedMediaFiles = draftMediaAssets.map((asset, idx) => ({
      id: 'draft_media_' + idx + '_' + Date.now(),
      name: 'Draft media ' + (idx + 1),
      kind: String(asset.kind || 'audio').toLowerCase(),
      url: String(asset.url || ''),
      localUrl: String(asset.url || ''),
      remoteUrl: String(asset.url || ''),
      status: 'ready',
      removed: false,
      file: null,
      caption: String(asset.caption || ''),
      alt: String(asset.alt || ''),
      label: String(asset.label || asset.title || ''),
      fingerprint: 'draft-media-' + idx
    }));
    renderImageList();
    renderMediaList();
    renderDocBlocks();
    refreshImageSelectors();

    updateTypeSpecificUI();
    updateSlugPreview();
    updatePreview();
    setDraftStatus('Loaded draft for editing.');
    clearEditorUnsavedState();
    setSubmitViewMode('editor');
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
      '<iframe class="review-modal-preview" sandbox="allow-same-origin allow-scripts" csp="default-src \'none\'; style-src \'unsafe-inline\'; img-src https: data: blob:; media-src https: data: blob:; connect-src https:;" title="Rejected submission preview"></iframe>' +
      '<div class="review-modal-meta">' +
        '<dl>' +
          '<dt>Status</dt><dd><span class="status status-rejected">rejected</span></dd>' +
          '<dt>Reason</dt><dd>' + escapeHtml(s.rejectionReason || 'No rejection reason provided.') + '</dd>' +
          '<dt>Type</dt><dd>' + escapeHtml(s.type || 'Unknown') + '</dd>' +
          '<dt>Page link</dt><dd>' + escapeHtml(s.slug || '[none]') + '</dd>' +
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
    typeInput.value = getDisplayTypeForEditor(entryType, listKey);
  }
  onTypeChange();

  if (typeInput.value === 'Anomaly' && listKey && ANOMALY_SUBTYPE_RULES[listKey]) {
    subtypeInput.value = listKey;
    codeInput.value = designation;
    onAnomalySubtypeChange();
    setDesignationLock(true, 'Designation is fixed for this reconstruction target.');
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
  refreshMediaSelectors();
  setDraftStatus('Reconstruction target loaded for ' + designation + '.');
  showSubmitEditor(true);

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
    activeDraftId = pageDoc.id || null;

    document.getElementById('sf-title').value = page.title || '';
    document.getElementById('sf-type').value = getDisplayTypeForEditor(page.type || 'Anomaly', page.anomalySubtype || '');
    document.getElementById('sf-slug').value = page.slug || '';
    enforceSubmitClearanceSelection(page.clearanceLevel || maxSubmitClearanceLevel);

    const tags = Array.isArray(page.tags) ? page.tags : [];
    setSelectedTags(tags);

    if (page.type === 'Anomaly') {
      const subtype = page.anomalySubtype || '';
      const code = page.anomalyId || '';
      document.getElementById('sf-anomaly-subtype').value = subtype;
      document.getElementById('sf-anomaly-code').value = code;
      onAnomalySubtypeChange();
      setDesignationLock(!!code, 'Designation is fixed for existing anomaly records.');
    } else {
      setDesignationLock(false);
    }

    document.getElementById('sf-html').value = page.htmlContent || DEFAULT_NEW_PAGE_HTML;
    document.getElementById('sf-css').value = page.cssContent || '';

    uploadedImages = Array.isArray(page.imageAssets) && page.imageAssets.length
      ? page.imageAssets.map((asset, idx) => ({
          id: 'page_image_' + idx + '_' + Date.now(),
          name: 'Page image ' + (idx + 1),
          kind: 'image',
          url: String(asset.url || ''),
          localUrl: String(asset.url || ''),
          remoteUrl: String(asset.url || ''),
          status: 'ready',
          removed: false,
          file: null,
          caption: String(asset.caption || ''),
          alt: String(asset.alt || ''),
          label: String(asset.label || ''),
          fingerprint: 'page-image-' + idx
        }))
      : [];
    uploadedMediaFiles = Array.isArray(page.mediaAssets) && page.mediaAssets.length
      ? page.mediaAssets.map((asset, idx) => ({
          id: 'page_media_' + idx + '_' + Date.now(),
          name: 'Page media ' + (idx + 1),
          kind: String(asset.kind || 'audio').toLowerCase(),
          url: String(asset.url || ''),
          localUrl: String(asset.url || ''),
          remoteUrl: String(asset.url || ''),
          status: 'ready',
          removed: false,
          file: null,
          caption: String(asset.caption || ''),
          alt: String(asset.alt || ''),
          label: String(asset.label || asset.title || ''),
          fingerprint: 'page-media-' + idx
        }))
      : [];
    renderImageList();
    renderMediaList();
    refreshImageSelectors();

    const content = String(page.htmlContent || '');
    const isGuide = String(page.type || '') === 'Guide' || String(page.type || '') === 'Lore';
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
    clearEditorUnsavedState();
    showSubmitEditor(true);

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
  const predefined = BASE_TAG_OPTIONS.filter(tag => !normalizedFilter || tag.includes(normalizedFilter));
  const custom = customTagOptions.filter(tag => !normalizedFilter || tag.includes(normalizedFilter));
  const visible = [...predefined, ...custom];

  holder.innerHTML = visible.map(tag => {
    const active = selectedTagsState.has(tag);
    return '<button type="button" class="tag-option' + (active ? ' active' : '') + '" data-tag="' + escapeAttr(tag) + '">' +
      escapeHtml(customTagOptions.includes(tag) ? (tag + ' (custom)') : tag) +
    '</button>';
  }).join('');
}

function setSelectedTags(tags) {
  const incoming = Array.isArray(tags) ? tags : [];
  const normalizedIncoming = incoming
    .map(normalizeTagValue)
    .filter(Boolean);

  normalizedIncoming.forEach(tag => {
    const existsInBase = BASE_TAG_OPTIONS.includes(tag);
    const existsInCustom = customTagOptions.includes(tag);
    if (!existsInBase && !existsInCustom) customTagOptions.push(tag);
  });

  selectedTagsState = new Set(normalizedIncoming.filter(tag => getTagOptions().includes(tag)));
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
  if (!getTagOptions().includes(tag)) return;
  if (selectedTagsState.has(tag)) selectedTagsState.delete(tag);
  else selectedTagsState.add(tag);
  const searchEl = document.getElementById('sf-tag-search');
  renderTagOptions(searchEl ? searchEl.value : '');
  updateTagSummary();
  schedulePreview();
}

function addCustomTag() {
  const input = document.getElementById('sf-tag-custom');
  if (!input) return;
  const tag = normalizeTagValue(input.value);
  if (!tag) return;

  const exists = getTagOptions().some(t => t.toLowerCase() === tag.toLowerCase());
  if (exists) {
    input.value = '';
    return;
  }

  customTagOptions.push(tag);
  selectedTagsState.add(tag);
  input.value = '';
  const searchEl = document.getElementById('sf-tag-search');
  renderTagOptions(searchEl ? searchEl.value : '');
  updateTagSummary();
  schedulePreview();
}

function initTagPicker() {
  const searchEl = document.getElementById('sf-tag-search');
  const customEl = document.getElementById('sf-tag-custom');
  const addBtn = document.getElementById('sf-tag-add');
  const allBtn = document.getElementById('sf-tag-all');
  const clearBtn = document.getElementById('sf-tag-clear');
  const listEl = document.getElementById('sf-tags-list');
  if (!searchEl || !allBtn || !clearBtn || !listEl || !customEl || !addBtn) return;

  searchEl.addEventListener('input', () => {
    renderTagOptions(searchEl.value);
  });

  allBtn.addEventListener('click', () => {
    selectedTagsState = new Set(getTagOptions());
    renderTagOptions(searchEl.value);
    updateTagSummary();
    schedulePreview();
  });

  addBtn.addEventListener('click', addCustomTag);
  customEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomTag();
    }
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
  applyTypeSubtypeConstraints();
  const anomalyRow = document.getElementById('anomaly-meta-row');
  if (anomalyRow) anomalyRow.classList.toggle('hidden', !isAnomalyFamilyType(type));

  const isGuide = type === 'Guide' || type === 'Lore';
  const modeDoc = document.getElementById('mode-doc');
  const modeCode = document.getElementById('mode-code');

  if (modeDoc) modeDoc.disabled = isGuide;
  if (modeCode) modeCode.disabled = isGuide;

  if (isGuide) {
    switchMode('template');
    selectTemplate('guide');
    setGuideSectionsFixedStructure();
  }

  updateUploadZoneCopy();
}

function updateUploadZoneCopy() {
  const zone = document.getElementById('upload-zone');
  const title = document.querySelector('#upload-zone .uz-text');
  const hint = document.querySelector('#upload-zone .uz-hint');
  const type = getSelectedSubmissionType();
  const mediaEnabled = isMediaEnabledSubmissionType(type);

  if (zone) {
    zone.setAttribute('aria-label', mediaEnabled
      ? 'Choose image, audio, or video files to upload'
      : 'Choose image files to upload');
  }

  if (title) {
    title.textContent = mediaEnabled
      ? 'Click or drag images, audio, or video here to upload'
      : 'Click or drag images here to upload';
  }

  if (hint) {
    hint.textContent = mediaEnabled
      ? 'Images are available for all page types. Audio and video are enabled for Tale, Anomaly, Guide, Lore, and Legacy submissions.'
      : 'Images are available for all page types. Audio and video are disabled for this submission type.';
  }
}

function setAnomalySubsectionPreset(subtype) {
  const holder = document.getElementById('tf-subsections');
  if (!holder) return;

  const presets = {
    ROS: ['Discovery', 'Behavior', 'Anomalous Properties', 'Researchers Notes', 'Interaction Log'],
    SOA: ['Discovery Log', 'Behavior', 'Anomalous Properties', 'Researchers Notes', 'Interaction Log'],
    SLOA: ['Behavior', 'Anomalous Properties', 'Linkage', 'Researchers Notes', 'Interaction Log'],
    SCTOR: ['Subjects', 'Researchers Assigned', 'Authorization Level', 'Objective', 'Test Environment', 'Procedure', 'Observations', 'Results', 'Conclusion', 'Follow-Up Recommendations'],
    TL: ['Target Entity', 'Authorization Level', 'Supervising Unit', 'Objective', 'Method', 'Procedure', 'Observations and Conclusion', 'Termination Status', 'Researcher Notes']
  };

  const preset = presets[subtype] || [];
  holder.innerHTML = '';
  subsectionCounters.anomaly = 0;

  preset.forEach(title => {
    subsectionCounters.anomaly += 1;
    const n = subsectionCounters.anomaly;
    const div = document.createElement('div');
    div.className = 'subsection-block';
    div.id = 'sub-anomaly-' + n;
    div.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;margin-bottom:8px">' +
        '<label class="fl" style="margin:0">Subsection ' + n + ' Title</label>' +
      '</div>' +
      '<div class="fg"><input class="fi" id="sub-title-anomaly-' + n + '" value="' + escapeAttr(title) + '" /></div>' +
      '<div class="fg"><label class="fl">Subsection ' + n + ' Content</label>' +
        '<textarea class="fta" id="sub-body-anomaly-' + n + '" placeholder="Write the content for this section..."></textarea>' +
      '</div>';
    holder.appendChild(div);
  });

  holder.querySelectorAll('input,textarea').forEach(el => {
    el.addEventListener('input', schedulePreview);
  });
}

function onAnomalySubtypeChange() {
  const subtype = document.getElementById('sf-anomaly-subtype').value;
  const hintEl = document.getElementById('sf-anomaly-hint');
  const codeEl = document.getElementById('sf-anomaly-code');
  const containmentLabelEl = document.getElementById('tf-containment-label');
  const containmentInputEl = document.getElementById('tf-containment');
  const classLabelEl = document.getElementById('tf-class-label');
  const rule = ANOMALY_SUBTYPE_RULES[subtype];

  if (!rule) {
    if (hintEl) hintEl.textContent = 'Format hint will appear after selecting a submission type.';
    if (codeEl) codeEl.placeholder = 'e.g. ROS-0001';
    if (containmentLabelEl) containmentLabelEl.textContent = 'Containment Procedures';
    if (containmentInputEl) containmentInputEl.placeholder = 'Describe how this anomaly is contained...';
    if (classLabelEl) classLabelEl.textContent = 'Object Class';
    return;
  }

  if (hintEl) hintEl.textContent = rule.hint;
  if (codeEl) codeEl.placeholder = rule.placeholder;

  if (containmentLabelEl) {
    containmentLabelEl.textContent = subtype === 'ROS' ? 'Shelterization Process' : 'Containment Protocol';
  }
  if (containmentInputEl) {
    containmentInputEl.placeholder = subtype === 'ROS'
      ? 'Describe the shelterization process for this specimen...'
      : 'Describe the containment protocol...';
  }
  if (classLabelEl) {
    classLabelEl.textContent = (subtype === 'SCTOR' || subtype === 'TL') ? 'Classification / Test Class' : 'Object Class';
  }

  setAnomalySubsectionPreset(subtype);

  if (!codeEl.value.trim()) {
    codeEl.value = rule.placeholder;
    onAnomalyCodeInput();
  }
}

function onAnomalyCodeInput() {
  const codeEl = document.getElementById('sf-anomaly-code');
  if (!codeEl) return;
  if (designationLocked) return;
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
  // Relaxed restrictions: Allow Document Studio for all types including Guide/Lore
  const type = document.getElementById('sf-type').value;
  currentMode = mode;
  document.getElementById('mode-template').classList.toggle('active', mode === 'template');
  document.getElementById('mode-doc').classList.toggle('active', mode === 'doc');
  document.getElementById('mode-code').classList.toggle('active', mode === 'code');
  document.getElementById('template-mode').classList.toggle('hidden', mode !== 'template');
  document.getElementById('doc-mode').classList.toggle('hidden', mode !== 'doc');
  document.getElementById('code-mode').classList.toggle('hidden', mode !== 'code');
  if (mode === 'doc') renderDocBlocks();
  schedulePreview();
}

// ═════════════════════════════════════════════════════════════
// TEMPLATE SELECTION & DYNAMIC FIELDS
// ═════════════════════════════════════════════════════════════

function selectTemplate(tpl) {
  currentTemplate = tpl;
  if (!tpl) return;
  
  ['anomaly', 'tale', 'artwork', 'guide'].forEach(t => {
    const card = document.getElementById('tpl-' + t);
    const fields = document.getElementById('tpl-fields-' + t);
    if (card) {
      if (t === tpl) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    }
    if (fields) {
      if (t === tpl) {
        fields.classList.remove('hidden');
      } else {
        fields.classList.add('hidden');
      }
    }
  });

  // Auto-set the type dropdown
  const typeMap = { anomaly: 'Anomaly', tale: 'Tale', artwork: 'Artwork' };
  const typeEl = document.getElementById('sf-type');
  if (typeEl) {
    if (tpl === 'guide') {
      const currentType = String(typeEl.value || '').trim();
      typeEl.value = currentType === 'Lore' ? 'Lore' : 'Guide';
    } else {
      typeEl.value = typeMap[tpl] || 'Anomaly';
    }
  }

  // Update Title label and placeholder based on type
  const titleLabel = document.getElementById('lbl-title');
  const titleInput = document.getElementById('sf-title');
  if (titleLabel && titleInput) {
    if (tpl === 'anomaly') {
      titleLabel.textContent = 'Title (must begin with anomaly designation)';
      titleInput.placeholder = 'e.g. ROS-0001: Sample Title';
    } else {
      titleLabel.textContent = 'Title';
      const placeholders = { tale: 'e.g. The Hollow Mirror', artwork: 'e.g. Sketch of ROG-088', guide: 'e.g. Containment Protocols' };
      titleInput.placeholder = placeholders[tpl] || 'Enter a title';
    }
  }

  if (tpl === 'guide') {
    setGuideSectionsFixedStructure();
  }

  if (tpl === 'artwork') {
    const list = document.getElementById('tf-art-images-list');
    if (list && list.children.length === 0) {
      addArtworkImage();
    }
  }

  schedulePreview();
}

function onTypeChange() {
  const type = document.getElementById('sf-type').value;
  const tplMap = { Anomaly: 'anomaly', Test: 'anomaly', Tale: 'tale', Report: 'tale', Artwork: 'artwork', Guide: 'guide', Lore: 'guide', Hub: 'guide' };
  if (tplMap[type]) {
    selectTemplate(tplMap[type]);
  }

  if (type === 'Test') {
    const subtypeEl = document.getElementById('sf-anomaly-subtype');
    if (subtypeEl && subtypeEl.value !== 'SCTOR' && subtypeEl.value !== 'TL') {
      subtypeEl.value = 'SCTOR';
    }
  }

  if (type === 'Anomaly') {
    const subtypeEl = document.getElementById('sf-anomaly-subtype');
    if (subtypeEl && (subtypeEl.value === 'SCTOR' || subtypeEl.value === 'TL')) {
      subtypeEl.value = 'ROS';
    }
  }

  applyTypeSubtypeConstraints();
  onAnomalySubtypeChange();
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

let artworkImageCounter = 0;
function addArtworkImage() {
  artworkImageCounter++;
  const n = artworkImageCounter;
  const list = document.getElementById('tf-art-images-list');
  if (!list) return;

  const div = document.createElement('div');
  div.className = 'doc-image-entry';
  div.id = 'art-img-' + n;
  div.style.marginBottom = '12px';
  div.innerHTML =
    '<div class="doc-image-entry-row">' +
      '<div style="flex:1"><label class="fl">Image ' + n + '</label><select class="fi art-img-select">' + getUploadedImageOptions('') + '</select></div>' +
      '<div style="flex:1"><label class="fl">URL</label><input class="fi art-img-url" placeholder="https://..." /></div>' +
      '<button class="btn btn-sm btn-d" onclick="removeArtworkImage(' + n + ')" style="margin-top:20px;height:32px">✕</button>' +
    '</div>';
  
  list.appendChild(div);
  div.querySelectorAll('select, input').forEach(el => el.addEventListener('input', schedulePreview));
}

function removeArtworkImage(n) {
  const el = document.getElementById('art-img-' + n);
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
  if (type === 'image') return { type: 'image', images: [{ url: '', caption: '' }], layout: 'stack', align: 'center', width: '' };
  if (type === 'audio') return { type: 'audio', url: '', label: '' };
  if (type === 'video') return { type: 'video', url: '', label: '', poster: '' };
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

function getUploadedMediaOptions(kind, selected) {
  const media = uploadedMediaFiles.filter(item => item.status === 'ready' && item.remoteUrl && item.kind === kind);
  const label = kind === 'video' ? 'video' : 'audio';
  const options = ['<option value="">Select uploaded ' + label + '</option>'];
  media.forEach(item => {
    const isSel = selected && selected === item.remoteUrl ? ' selected' : '';
    options.push('<option value="' + escapeAttr(item.remoteUrl) + '"' + isSel + '>' + escapeHtml(item.name) + '</option>');
  });
  return options.join('');
}

function isMediaDocBlockType(type) {
  return type === 'image' || type === 'audio' || type === 'video';
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
      const images = block.images || (block.url ? [{ url: block.url, caption: block.caption || '' }] : []);
      const layout = block.layout || 'stack';
      
      let imagesHtml = '';
      images.forEach((img, iIdx) => {
        const preview = img.url && isValidImageSrc(img.url)
          ? '<img class="doc-image-preview-mini" src="' + escapeAttr(img.url) + '" />'
          : '';
        imagesHtml += '<div class="doc-image-entry" data-img-index="' + iIdx + '">' +
          '<div class="doc-image-entry-row">' +
            '<div style="flex:1"><label class="fl">Image ' + (iIdx + 1) + '</label><select class="fi" data-field="imageSelect" data-index="' + idx + '" data-img-index="' + iIdx + '">' + getUploadedImageOptions(img.url || '') + '</select></div>' +
            '<div style="flex:1"><label class="fl">URL</label><input class="fi" data-field="imageUrl" data-index="' + idx + '" data-img-index="' + iIdx + '" value="' + escapeAttr(img.url || '') + '" /></div>' +
            '<button class="btn btn-sm btn-d" type="button" data-action="removeImage" data-index="' + idx + '" data-img-index="' + iIdx + '" style="margin-top:20px;height:32px">✕</button>' +
          '</div>' +
          '<div class="fg"><label class="fl">Caption</label><input class="fi" data-field="imageCaption" data-index="' + idx + '" data-img-index="' + iIdx + '" value="' + escapeAttr(img.caption || '') + '" /></div>' +
          preview +
        '</div>';
      });

      body = '<div class="doc-image-block-settings">' +
        '<div class="doc-grid-3">' +
          '<div><label class="fl">Layout</label><select class="fi" data-field="layout" data-index="' + idx + '">' +
            '<option value="stack"' + (layout === 'stack' ? ' selected' : '') + '>Stacked (Column)</option>' +
            '<option value="row"' + (layout === 'row' ? ' selected' : '') + '>Side-by-Side (Row)</option>' +
            '<option value="grid"' + (layout === 'grid' ? ' selected' : '') + '>Grid</option>' +
          '</select></div>' +
          '<div><label class="fl">Alignment</label><select class="fi" data-field="align" data-index="' + idx + '">' +
            '<option value="left"' + (block.align === 'left' ? ' selected' : '') + '>Left</option>' +
            '<option value="center"' + (block.align !== 'left' && block.align !== 'right' ? ' selected' : '') + '>Center</option>' +
            '<option value="right"' + (block.align === 'right' ? ' selected' : '') + '>Right</option>' +
          '</select></div>' +
          '<div><label class="fl">Max Width</label><input class="fi" data-field="width" data-index="' + idx + '" value="' + escapeAttr(block.width || '') + '" placeholder="auto, 100%, 800px" /></div>' +
        '</div>' +
        '<div class="doc-image-list">' + imagesHtml + '</div>' +
        '<button class="btn btn-sm btn-s" type="button" data-action="addImage" data-index="' + idx + '" style="margin-top:8px">+ Add Another Image</button>' +
      '</div>';
    } else if (block.type === 'audio') {
      const preview = block.url
        ? '<audio src="' + escapeAttr(block.url) + '" controls preload="metadata" style="width:100%;display:block;margin-top:8px"></audio>'
        : '';
      body = '<div class="doc-grid-2">' +
        '<div><label class="fl">Uploaded Audio</label><select class="fi" data-field="uploadSelectMedia" data-kind="audio" data-index="' + idx + '">' + getUploadedMediaOptions('audio', block.url || '') + '</select></div>' +
        '<div><label class="fl">Audio URL</label><input class="fi" data-field="url" data-index="' + idx + '" value="' + escapeAttr(block.url || '') + '" placeholder="https://..." /></div>' +
        '<div><label class="fl">Label</label><input class="fi" data-field="label" data-index="' + idx + '" value="' + escapeAttr(block.label || '') + '" placeholder="Optional label" /></div>' +
      '</div>' + preview;
    } else if (block.type === 'video') {
      const preview = block.url
        ? '<video src="' + escapeAttr(block.url) + '" controls playsinline preload="metadata" style="width:100%;display:block;margin-top:8px;border:1px solid #3a3a3a;background:#111"></video>'
        : '';
      body = '<div class="doc-grid-2">' +
        '<div><label class="fl">Uploaded Video</label><select class="fi" data-field="uploadSelectMedia" data-kind="video" data-index="' + idx + '">' + getUploadedMediaOptions('video', block.url || '') + '</select></div>' +
        '<div><label class="fl">Video URL</label><input class="fi" data-field="url" data-index="' + idx + '" value="' + escapeAttr(block.url || '') + '" placeholder="https://..." /></div>' +
        '<div><label class="fl">Label</label><input class="fi" data-field="label" data-index="' + idx + '" value="' + escapeAttr(block.label || '') + '" placeholder="Optional label" /></div>' +
        '<div><label class="fl">Poster URL</label><input class="fi" data-field="poster" data-index="' + idx + '" value="' + escapeAttr(block.poster || '') + '" placeholder="https://..." /></div>' +
      '</div>' + preview;
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

    if (action === 'addImage') {
      if (!docBlocks[index].images) {
        docBlocks[index].images = docBlocks[index].url ? [{ url: docBlocks[index].url, caption: docBlocks[index].caption || '' }] : [];
        delete docBlocks[index].url;
        delete docBlocks[index].caption;
      }
      docBlocks[index].images.push({ url: '', caption: '' });
      renderDocBlocks();
      schedulePreview();
    }
    if (action === 'removeImage') {
      const iIdx = Number(actionBtn.getAttribute('data-img-index'));
      if (docBlocks[index].images && docBlocks[index].images[iIdx]) {
        docBlocks[index].images.splice(iIdx, 1);
        renderDocBlocks();
        schedulePreview();
      }
    }
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
    const iIdx = Number(target.getAttribute('data-img-index'));

    if (field === 'layout') {
      docBlocks[index].layout = value;
      schedulePreview();
      return;
    }

    if (field === 'imageSelect' || field === 'imageUrl' || field === 'imageCaption') {
      if (!docBlocks[index].images) {
        docBlocks[index].images = docBlocks[index].url ? [{ url: docBlocks[index].url, caption: docBlocks[index].caption || '' }] : [];
        delete docBlocks[index].url;
        delete docBlocks[index].caption;
      }
      if (docBlocks[index].images[iIdx]) {
        if (field === 'imageSelect' || field === 'imageUrl') {
          docBlocks[index].images[iIdx].url = value;
          renderDocBlocks();
        } else {
          docBlocks[index].images[iIdx].caption = value;
        }
        schedulePreview();
      }
      return;
    }

    if (field === 'uploadSelect') {
      docBlocks[index].url = value;
      renderDocBlocks();
      schedulePreview();
      return;
    }

    if (field === 'uploadSelectMedia') {
      docBlocks[index].url = value;
      renderDocBlocks();
      schedulePreview();
      return;
    }

    if (field === 'url') {
      docBlocks[index][field] = value;
      renderDocBlocks();
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
    if (block.type === 'image') {
      const images = block.images || (block.url ? [{ url: block.url, caption: block.caption || '' }] : []);
      if (images.length === 0) return;

      const layout = block.layout || 'stack';
      const layoutClass = layout === 'row' ? 'doc-image-row' : (layout === 'grid' ? 'doc-image-grid' : 'doc-image-stack');
      const align = (block.align === 'left' || block.align === 'right') ? block.align : 'center';
      
      let html = '<div class="doc-image-container ' + layoutClass + ' align-' + align + '"';
      if (block.width) html += ' style="max-width:' + block.width + '"';
      html += '>\n';
      
      images.forEach(img => {
        if (!img.url) return;
        const caption = img.caption ? '<figcaption>' + escapeHtml(img.caption) + '</figcaption>' : '';
        html += '  <figure class="doc-image-wrap"><img src="' + escapeAttr(img.url) + '" alt="' + escapeAttr(img.caption || 'Document image') + '" loading="lazy" decoding="async" />' + caption + '</figure>\n';
      });
      
      html += '</div>';
      parts.push(html);
      return;
    }
    if (block.type === 'audio' && String(block.url || '').trim()) {
      const label = String(block.label || '').trim();
      parts.push('<figure class="doc-media-wrap doc-audio-wrap"><audio src="' + escapeAttr(block.url) + '" controls preload="metadata" style="width:100%;display:block"></audio>' + (label ? '<figcaption>' + escapeHtml(label) + '</figcaption>' : '') + '</figure>');
      return;
    }
    if (block.type === 'video' && String(block.url || '').trim()) {
      const label = String(block.label || '').trim();
      const poster = String(block.poster || '').trim();
      const posterAttr = poster ? ' poster="' + escapeAttr(poster) + '"' : '';
      parts.push('<figure class="doc-media-wrap doc-video-wrap"><video src="' + escapeAttr(block.url) + '" controls playsinline preload="metadata"' + posterAttr + ' style="width:100%;display:block;border:1px solid #3a3a3a;background:#111"></video>' + (label ? '<figcaption>' + escapeHtml(label) + '</figcaption>' : '') + '</figure>');
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
    if (block.type === 'audio') return !!String(block.url || '').trim();
    if (block.type === 'video') return !!String(block.url || '').trim();
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
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src https: data: blob:; media-src https: data: blob:; connect-src https:;">' +
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

function hasFirstPersonNarration(content) {
  return /\b(i|me|my|mine|myself|we|us|our|ours|ourselves)\b/i.test(String(content || ''));
}

function buildAnomalyTemplate() {
  const itemNum = document.getElementById('sf-title').value.trim() || 'ROG-XXX';
  const subtype = document.getElementById('sf-anomaly-subtype').value;
  const rule = ANOMALY_SUBTYPE_RULES[subtype];
  const objClass = document.getElementById('tf-object-class').value;
  const heroUrl = document.getElementById('tf-hero-img').value;
  const containment = document.getElementById('tf-containment').value.trim();
  const mediaAudioUrl = document.getElementById('tf-anomaly-audio')?.value || '';
  const mediaVideoUrl = document.getElementById('tf-anomaly-video')?.value || '';
  const description = document.getElementById('tf-description').value.trim();

  let html = '<div class="rog-header">\n';
  html += '  <h1>' + escapeHtml(itemNum) + '</h1>\n';
  const classLabel = (subtype === 'SCTOR' || subtype === 'TL') ? 'Test Classification' : 'Classification';
  html += '  <div class="rog-class"><span class="rog-class-label">' + classLabel + ':</span> ' + escapeHtml(objClass) + '</div>\n';
  if (rule) html += '  <div class="rog-class"><span class="rog-class-label">Format:</span> ' + escapeHtml(rule.label) + '</div>\n';
  html += '</div>\n\n';

  if (heroUrl) {
    html += '<div class="rog-hero"><img src="' + heroUrl + '" alt="' + escapeHtml(itemNum) + '" /></div>\n\n';
  }

  if (containment) {
    html += '<div class="rog-section">\n';
    html += '  <h2>' + (subtype === 'ROS' ? 'Shelterization Process' : 'Containment Protocol') + '</h2>\n';
    html += '  ' + textToHtmlParagraphs(containment) + '\n';
    html += '</div>\n\n';
  }

  if (description) {
    html += '<div class="rog-section">\n';
    html += '  <h2>Description</h2>\n';
    html += '  ' + textToHtmlParagraphs(description) + '\n';
    html += '</div>\n\n';
  }

  if (mediaAudioUrl || mediaVideoUrl) {
    html += '<div class="rog-section">\n';
    html += '  <h2>Attached Media</h2>\n';
    if (mediaAudioUrl) html += '  <audio src="' + escapeAttr(mediaAudioUrl) + '" controls preload="metadata" style="width:100%;display:block;margin-bottom:12px"></audio>\n';
    if (mediaVideoUrl) html += '  <video src="' + escapeAttr(mediaVideoUrl) + '" controls playsinline preload="metadata" style="width:100%;display:block;border:1px solid #3a3a3a;background:#111"></video>\n';
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
  const mediaAudioUrl = document.getElementById('tf-tale-audio')?.value || '';
  const mediaVideoUrl = document.getElementById('tf-tale-video')?.value || '';

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

  if (mediaAudioUrl || mediaVideoUrl) {
    html += '<div class="tale-body" style="margin-bottom:24px">\n';
    if (mediaAudioUrl) html += '  <audio src="' + escapeAttr(mediaAudioUrl) + '" controls preload="metadata" style="width:100%;display:block;margin-bottom:12px"></audio>\n';
    if (mediaVideoUrl) html += '  <video src="' + escapeAttr(mediaVideoUrl) + '" controls playsinline preload="metadata" style="width:100%;display:block;border:1px solid #3a3a3a;background:#111"></video>\n';
    html += '</div>\n\n';
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
  const artist = document.getElementById('tf-art-artist').value.trim();
  const medium = document.getElementById('tf-art-medium').value.trim();
  const desc = document.getElementById('tf-art-desc').value.trim();

  let html = '<div class="art-showcase">\n';
  html += '  <h1>' + escapeHtml(document.getElementById('sf-title').value.trim() || 'Untitled') + '</h1>\n';
  
  const imgEntries = document.querySelectorAll('#tf-art-images-list .doc-image-entry');
  if (imgEntries.length > 0) {
    html += '  <div class="art-gallery">\n';
    imgEntries.forEach(entry => {
      const sel = entry.querySelector('.art-img-select');
      const url = entry.querySelector('.art-img-url');
      const finalUrl = (sel && sel.value) || (url && url.value) || '';
      if (finalUrl) {
        html += '    <div class="art-frame"><img src="' + escapeAttr(finalUrl) + '" alt="Artwork" /></div>\n';
      }
    });
    html += '  </div>\n';
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
.art-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: center;
  margin-bottom: 32px;
}
.art-frame {
  background: #111111;
  padding: 16px;
  border: 1px solid #3a3a3a;
  display: inline-block;
}
.art-frame img { max-width: 100%; max-height: 500px; display: block; }
.art-info { max-width: 600px; margin: 0 auto; text-align: left; }
.art-artist { font-size: 1rem; color: #8b0000; font-weight: 700; margin-bottom: 4px; }
.art-medium { font-size: .85rem; color: #c7c7c7; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px; }
.art-desc p { margin-bottom: 12px; color: #d8d8d8; }`;

  return { html, css };
}

function buildGuideTemplate() {
  const intro = document.getElementById('tf-guide-intro').value.trim();
  const heroUrl = document.getElementById('tf-guide-hero').value;
  const mediaAudioUrl = document.getElementById('tf-guide-audio')?.value || '';
  const mediaVideoUrl = document.getElementById('tf-guide-video')?.value || '';

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

  if (mediaAudioUrl || mediaVideoUrl) {
    html += '<div class="guide-section">\n  <h2>Attached Media</h2>\n';
    if (mediaAudioUrl) html += '  <audio src="' + escapeAttr(mediaAudioUrl) + '" controls preload="metadata" style="width:100%;display:block;margin-bottom:12px"></audio>\n';
    if (mediaVideoUrl) html += '  <video src="' + escapeAttr(mediaVideoUrl) + '" controls playsinline preload="metadata" style="width:100%;display:block;border:1px solid #3a3a3a;background:#111"></video>\n';
    html += '</div>\n\n';
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
  initSubmitExplorer();

  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('img-input');
  const chooseBtn = document.getElementById('choose-images-btn');
  const uploadStatus = document.getElementById('upload-status');
  const editorShell = document.getElementById('submit-editor-shell');
  const clearanceSelect = document.getElementById('sf-clearance');

  if (clearanceSelect) {
    clearanceSelect.addEventListener('change', () => {
      enforceSubmitClearanceSelection(clearanceSelect.value);
    });
  }

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
    if (isAnomalyFamilyType(document.getElementById('sf-type').value)) {
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

  if (editorShell) {
    const markTrustedChanges = e => {
      if (!e || !e.isTrusted) return;
      if (!e.target || !e.target.closest('#submit-create-workspace')) return;
      markEditorAsChanged();
    };
    editorShell.addEventListener('input', markTrustedChanges, true);
    editorShell.addEventListener('change', markTrustedChanges, true);
  }
});

function handleFiles(files) {
  const selectedType = getSelectedSubmissionType();
  Array.from(files).forEach(file => {
    const fingerprint = file.name + '::' + file.size + '::' + file.lastModified;
    const kind = getStorageMediaKind(file);
    const isMediaEnabled = isMediaEnabledSubmissionType(selectedType);

    if (!kind) {
      alert('Unsupported file type: ' + file.name);
      return;
    }

    if ((kind === 'audio' || kind === 'video') && !isMediaEnabled) {
      alert('Audio and video uploads are available only for Tale, Anomaly, Guide, and Legacy submissions.');
      return;
    }

    if (getActiveUploadedCount(kind) >= getUploadLimitForKind(kind)) {
      alert('You can attach up to ' + getUploadLimitForKind(kind) + ' ' + getUploadScopeLabel(kind) + (getUploadLimitForKind(kind) > 1 ? 's' : '') + ' per submission.');
      return;
    }

    const alreadyQueued = uploadedImages.some(img => !img.removed && img.fingerprint === fingerprint && (isUploadPendingStatus(img.status) || img.status === 'ready'));
    const alreadyQueuedMedia = uploadedMediaFiles.some(media => !media.removed && media.fingerprint === fingerprint && (isUploadPendingStatus(media.status) || media.status === 'ready'));
    if (alreadyQueued) {
      const uploadStatus = document.getElementById('upload-status');
      if (uploadStatus) uploadStatus.textContent = file.name + ' is already queued.';
      return;
    }
    if (alreadyQueuedMedia) {
      const uploadStatus = document.getElementById('upload-status');
      if (uploadStatus) uploadStatus.textContent = file.name + ' is already queued.';
      return;
    }

    if (!isAllowedStorageMedia(file)) {
      alert('Unsupported upload type: ' + file.name);
      return;
    }

    if (file.size > getUploadMaxBytesForKind(kind)) {
      alert('File too large for ' + kind + ' uploads: ' + file.name);
      return;
    }

    enqueueUpload(file, kind);
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

function createLocalPreviewUrl(file) {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return { url: URL.createObjectURL(file), isObjectUrl: true };
  }
  return { url: '', isObjectUrl: false };
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

async function optimizeImageForStorage(file) {
  const original = await fileToDataUrl(file);
  const image = await loadImageFromDataUrl(original);

  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  const maxDim = 1280;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.max(1, Math.floor(width * scale));
  height = Math.max(1, Math.floor(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context for image optimization.');
  ctx.drawImage(image, 0, 0, width, height);

  // Convert to JPEG to keep uploads compact for Storage.
  let quality = 0.82;
  let out = canvas.toDataURL('image/jpeg', quality);

  while (dataUrlByteLength(out) > IMAGE_UPLOAD_MAX_BYTES && quality > 0.45) {
    quality -= 0.08;
    out = canvas.toDataURL('image/jpeg', quality);
  }

  let shrinkPass = 0;
  while (dataUrlByteLength(out) > IMAGE_UPLOAD_MAX_BYTES && shrinkPass < 4) {
    width = Math.max(1, Math.floor(width * 0.85));
    height = Math.max(1, Math.floor(height * 0.85));
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, width, height);
    out = canvas.toDataURL('image/jpeg', Math.max(0.45, quality));
    shrinkPass++;
  }

  const bytes = dataUrlByteLength(out);
  if (bytes > IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error('Image remains too large after optimization. Use a smaller image.');
  }

  return { dataUrl: out, bytes: bytes, width: width, height: height };
}

function getStorageRef(path, bucket) {
  if (!storage) {
    throw new Error('Firebase Storage not initialized. Check firebase-config.js');
  }
  if (bucket) {
    const bucketUrl = 'gs://' + bucket;
    return storage.refFromURL(bucketUrl).child(path);
  }
  return storage.ref(path);
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

function getPreferredStorageBucket() {
  const configured = (firebaseConfig && firebaseConfig.storageBucket) ? String(firebaseConfig.storageBucket).replace(/^gs:\/\//, '') : '';
  if (configured) return configured;
  const projectId = (firebaseConfig && firebaseConfig.projectId) ? String(firebaseConfig.projectId).trim() : '';
  return projectId ? (projectId + '.firebasestorage.app') : '';
}

function normalizeStorageAssetUrl(rawUrl) {
  const input = String(rawUrl || '').trim();
  if (!input) return '';

  if (/^gs:\/\//i.test(input)) {
    const match = input.match(/^gs:\/\/([^\/]+)\/(.+)$/i);
    if (!match) return input;
    const bucket = match[1];
    const objectPath = match[2].replace(/^\/+/, '');
    return 'https://firebasestorage.googleapis.com/v0/b/' + bucket + '/o/' + encodeURIComponent(objectPath) + '?alt=media';
  }

  return input;
}

function getStorageMimeType(file) {
  const mimeType = String(file && file.type ? file.type : '').toLowerCase();
  if (ALLOWED_STORAGE_IMAGE_TYPES.has(mimeType) || ALLOWED_STORAGE_AUDIO_TYPES.has(mimeType) || ALLOWED_STORAGE_VIDEO_TYPES.has(mimeType)) {
    return mimeType;
  }

  const ext = (file.name || '').toLowerCase().split('.').pop();
  const mimeMap = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'mp3': 'audio/mpeg',
    'mpeg': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'oga': 'audio/ogg',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'qt': 'video/quicktime',
    'webm': 'video/webm',
    'ogv': 'video/ogg',
    'mkv': 'video/x-matroska'
  };

  return mimeMap[ext] || '';
}

function createUploadTask(ref, file, onProgress, onTaskCreated) {
  return new Promise((resolve, reject) => {
    const NO_PROGRESS_TIMEOUT_MS = 45000;
    const STALL_TIMEOUT_MS = 180000;
    let uploadCompleted = false;
    let started = false;
    let lastProgressAt = Date.now();
    const metadata = {
      contentType: getStorageMimeType(file) || 'application/octet-stream',
      cacheControl: 'public,max-age=31536000,immutable'
    };

    const task = ref.put(file, metadata);
    if (typeof onTaskCreated === 'function') onTaskCreated(task);

    const watchdog = setInterval(() => {
      if (uploadCompleted) {
        clearInterval(watchdog);
        return;
      }
      const idleFor = Date.now() - lastProgressAt;
      const timedOutBeforeStart = !started && idleFor >= NO_PROGRESS_TIMEOUT_MS;
      const timedOutAfterStart = started && idleFor >= STALL_TIMEOUT_MS;
      if (timedOutBeforeStart || timedOutAfterStart) {
        uploadCompleted = true;
        clearInterval(watchdog);
        try { task.cancel(); } catch (e) { /* ignore */ }
        const err = new Error('Upload stalled with no progress; retrying with fallback bucket.');
        err.code = 'storage/stalled';
        reject(err);
      }
    }, 4000);

    task.on('state_changed',
      snap => {
        started = true;
        lastProgressAt = Date.now();
        if (typeof onProgress === 'function') onProgress(snap, task);
      },
      err => {
        if (uploadCompleted) return;
        uploadCompleted = true;
        clearInterval(watchdog);
        console.error('[Upload Error]', err.code, err.message);
        reject(err);
      },
      async () => {
        if (uploadCompleted) return;
        uploadCompleted = true;
        clearInterval(watchdog);
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
    'storage/stalled',
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
      const { url } = await createUploadTask(ref, file, setProgress, task => {
        uploadRecord.task = task;
      });
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

async function maybeOptimizeImageUploadFile(file) {
  const mime = String(file && file.type ? file.type : '').toLowerCase();
  if (mime === 'image/gif' || file.size < IMAGE_FAST_OPTIMIZE_THRESHOLD_BYTES) return file;

  try {
    const optimized = await optimizeImageForStorage(file);
    if (!optimized || !optimized.dataUrl) return file;

    const response = await fetch(optimized.dataUrl);
    const blob = await response.blob();
    if (!blob || !blob.size) return file;
    if (blob.size >= Math.floor(file.size * 0.95)) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], baseName + '.jpg', {
      type: 'image/jpeg',
      lastModified: Date.now()
    });
  } catch (err) {
    console.warn('[Upload] Image optimization skipped:', err && err.message ? err.message : err);
    return file;
  }
}

function createUploadRecord(file, kind) {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = 'uploads/' + currentUserForSubmit.uid + '/' + timestamp + '_' + safeName;
  const uploadId = timestamp + '_' + Math.random().toString(36).slice(2, 8) + '_' + safeName;
  const fingerprint = file.name + '::' + file.size + '::' + file.lastModified;
  const preview = createLocalPreviewUrl(file);

  return {
    id: uploadId,
    name: file.name,
    kind: kind,
    file: file,
    url: preview.url || '',
    localUrl: preview.url || '',
    remoteUrl: '',
    status: 'queued',
    removed: false,
    path: path,
    task: null,
    label: file.name.replace(/\.[^.]+$/, ''),
    caption: '',
    alt: file.name.replace(/\.[^.]+$/, ''),
    fingerprint: fingerprint,
    isObjectUrl: preview.isObjectUrl,
    timeoutId: null
  };
}

function queueUploadRecord(record) {
  const list = record.kind === 'image' ? uploadedImages : uploadedMediaFiles;
  list.push(record);
  uploadQueue.push(record.id);

  if (record.kind === 'image') {
    renderImageList();
    refreshImageSelectors();
  } else {
    renderMediaList();
  }

  const uploadStatus = document.getElementById('upload-status');
  if (uploadStatus) uploadStatus.textContent = 'Queued ' + record.name + ' for upload.';
  scheduleSubmissionAssetSync();
  pumpUploadQueue();
}

function enqueueUpload(file, kind) {
  if (!currentUserForSubmit) {
    alert('Please sign in first.');
    return;
  }

  const fileType = String(file && file.type || '').toLowerCase();
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(fileType)) {
    alert('Unsupported file type: ' + (file && file.name ? file.name : 'selected file') + '.');
    return;
  }

  if (kind === 'image' && !isAllowedStorageImage(file)) {
    alert('Only PNG, JPG, GIF, and WebP images can be uploaded.');
    return;
  }

  const progressWrap = document.getElementById('upload-progress');
  const progressBar = document.getElementById('upload-bar');
  if (progressWrap && progressBar) {
    progressWrap.style.display = 'block';
    progressBar.style.width = '2%';
  }

  const record = createUploadRecord(file, kind);
  queueUploadRecord(record);

  if (!record.localUrl) {
    fileToDataUrl(file).then(dataUrl => {
      if (record.removed || record.remoteUrl) return;
      record.localUrl = dataUrl;
      record.url = dataUrl;
      if (record.kind === 'image') {
        renderImageList();
      } else {
        renderMediaList();
      }
    }).catch(() => { /* ignore preview fallback failure */ });
  }
}

async function runQueuedUpload(record) {
  if (!record || record.removed || !record.file) return;

  const progressWrap = document.getElementById('upload-progress');
  const progressBar = document.getElementById('upload-bar');
  const uploadStatus = document.getElementById('upload-status');

  try {
    record.status = 'preparing';
    if (record.kind === 'image') {
      renderImageList();
      refreshImageSelectors();
    } else {
      renderMediaList();
    }
    if (uploadStatus) uploadStatus.textContent = 'Preparing ' + record.name + '...';

    let uploadFile = record.file;
    if (record.kind === 'image') {
      uploadFile = await maybeOptimizeImageUploadFile(record.file);
    }
    if (record.removed) return;

    record.status = 'uploading';
    if (record.kind === 'image') {
      renderImageList();
      refreshImageSelectors();
    } else {
      renderMediaList();
    }

    const remoteUrl = await uploadWithBucketFallback(record.path, uploadFile, record, snap => {
      const pct = snap && snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
      const safePct = Math.max(2, Math.min(100, pct));
      if (progressBar) progressBar.style.width = safePct + '%';
      if (uploadStatus) {
        const queuedCount = uploadQueue.length;
        uploadStatus.textContent = 'Uploading ' + record.name + '... ' + safePct + '% (' + queuedCount + ' queued)';
      }
    });

    if (record.removed) return;
    const normalizedUrl = normalizeStorageAssetUrl(remoteUrl);
    record.remoteUrl = normalizedUrl;
    record.url = normalizedUrl;
    record.status = 'ready';
    record.sizeBytes = uploadFile.size;
    record.storageMode = 'storage-download-url';

    if (record.kind === 'image') {
      renderImageList();
      refreshImageSelectors();
    } else {
      renderMediaList();
    }
    markEditorAsChanged();
    scheduleDraftAutoSave();
    scheduleSubmissionAssetSync();

    if (progressBar) progressBar.style.width = '100%';
    if (uploadStatus) uploadStatus.textContent = 'Uploaded ' + record.name + '.';
  } catch (err) {
    const code = err && err.code ? err.code : '';
    if (code === 'storage/canceled' && record.removed) return;

    record.status = 'failed';
    if (record.kind === 'image') {
      renderImageList();
      refreshImageSelectors();
    } else {
      renderMediaList();
    }
    scheduleSubmissionAssetSync();

    const msg = (record.kind === 'image' ? 'Image upload failed: ' : 'Media upload failed: ') + (err.message || code || 'Unknown error');
    if (window.rogLogger) rogLogger.error('[Upload] Failed:', msg);
    alert(msg);
  } finally {
    if (progressWrap && uploadWorkers <= 1 && uploadQueue.length === 0) {
      progressWrap.style.display = 'none';
    }
  }
}

function pumpUploadQueue() {
  while (uploadWorkers < UPLOAD_QUEUE_MAX_PARALLEL && uploadQueue.length > 0) {
    const nextId = uploadQueue.shift();
    const record = getUploadedMediaRecords().find(item => item.id === nextId && !item.removed);
    if (!record) continue;

    uploadWorkers++;
    runQueuedUpload(record).finally(() => {
      uploadWorkers = Math.max(0, uploadWorkers - 1);
      pumpUploadQueue();
    });
  }
}

function uploadImage(file) {
  enqueueUpload(file, 'image');
}

function uploadSupplementalMedia(file, kind) {
  enqueueUpload(file, kind);
}

function renderMediaList() {
  const list = document.getElementById('media-list');
  if (!list) return;

  const media = uploadedMediaFiles.filter(item => !item.removed);
  if (!media.length) {
    list.innerHTML = '<p style="font-size:.75rem;color:var(--wht-f);text-align:center;padding:12px 0">No audio or video files uploaded.</p>';
    return;
  }

  list.innerHTML = media.map((item) => {
    const displayUrl = item.remoteUrl || item.localUrl || item.url || '';
    const label = getUploadStatusLabel(item.status);
    const preview = item.kind === 'video'
      ? '<video src="' + displayUrl + '" controls playsinline preload="metadata" style="width:100%;max-width:240px;border:1px solid #3a3a3a;background:#111"></video>'
      : '<audio src="' + displayUrl + '" controls preload="metadata" style="width:100%;max-width:240px"></audio>';

    return '<div class="img-item">' +
      '<div style="width:120px;flex:0 0 120px">' + preview + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<span class="img-url" title="' + escapeAttr(displayUrl) + '">' + escapeHtml(item.name) + '</span>' +
        '<div style="font-size:.65rem;color:var(--wht-f);margin-top:3px;text-transform:uppercase;letter-spacing:1px">' + label + ' · ' + escapeHtml(item.kind) + '</div>' +
        '<input class="fi" type="text" placeholder="Optional label" value="' + escapeAttr(item.label || '') + '" oninput="updateUploadedMediaMeta(' + JSON.stringify(item.id) + ', ' + JSON.stringify('label') + ', this.value)" style="margin-top:6px;font-size:.72rem;padding:6px 8px" />' +
      '</div>' +
      '<button class="btn btn-sm btn-s btn-copy" type="button" onclick="copyMediaUrl(\'' + item.id + '\', this)">Copy URL</button>' +
      (item.status === 'ready' ? '<button class="btn btn-sm btn-s" type="button" onclick="insertUploadedMediaIntoPage(\'' + item.id + '\')">Insert</button>' : '') +
      (item.status === 'failed' ? '<button class="btn btn-sm btn-s" type="button" onclick="retryUploadedMedia(\'' + item.id + '\')">Retry</button>' : '') +
      '<button class="btn btn-sm btn-d" type="button" onclick="removeUploadedMedia(\'' + item.id + '\')">Remove</button>' +
    '</div>';
  }).join('');

  refreshMediaSelectors();
}

function updateUploadedMediaMeta(id, field, value) {
  const record = uploadedMediaFiles.find(item => item.id === id);
  if (!record) return;
  if (field === 'label') record.label = String(value || '').slice(0, 180);
  if (field === 'caption') record.caption = String(value || '').slice(0, 180);
  if (field === 'alt') record.alt = String(value || '').slice(0, 180);
  scheduleDraftAutoSave();
}

function retryUploadedMedia(id) {
  const record = uploadedMediaFiles.find(item => item.id === id);
  if (!record || !record.file) return;
  removeUploadedMedia(id);
  if (record.kind === 'video' || record.kind === 'audio') {
    uploadSupplementalMedia(record.file, record.kind);
  }
}

function removeUploadedMedia(id) {
  const index = uploadedMediaFiles.findIndex(item => item.id === id);
  if (index === -1) return;
  const record = uploadedMediaFiles[index];
  record.removed = true;
  uploadQueue = uploadQueue.filter(queueId => queueId !== id);
  if (record.task && isUploadPendingStatus(record.status) && typeof record.task.cancel === 'function') {
    try { record.task.cancel(); } catch (e) { /* ignore */ }
  }
  if (record.timeoutId) {
    try { clearTimeout(record.timeoutId); } catch (e) { /* ignore */ }
  }
  if (record.isObjectUrl && record.localUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try { URL.revokeObjectURL(record.localUrl); } catch (e) { /* ignore */ }
  }
  uploadedMediaFiles.splice(index, 1);
  renderMediaList();
  markEditorAsChanged();
  scheduleDraftAutoSave();
  scheduleSubmissionAssetSync();
  const uploadStatus = document.getElementById('upload-status');
  if (uploadStatus) uploadStatus.textContent = 'Media removed.';
}

function copyMediaUrl(id, buttonEl) {
  const record = uploadedMediaFiles.find(item => item.id === id);
  if (!record) return;
  const url = record.remoteUrl || '';
  if (!url) {
    alert('Media file is not uploaded yet. Please wait for upload completion.');
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

function insertMarkupAtCursorInTextarea(textarea, markup) {
  if (!textarea) return false;
  const start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : textarea.value.length;
  const end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  textarea.value = before + markup + after;
  const caret = start + markup.length;
  textarea.selectionStart = textarea.selectionEnd = caret;
  textarea.focus();
  return true;
}

function insertUploadedAssetMarkup(kind, url, label) {
  const safeUrl = escapeAttr(url);
  const safeLabel = escapeHtml(label || '');
  if (kind === 'image') {
    return '<figure><img src="' + safeUrl + '" alt="' + escapeAttr(label || 'Uploaded image') + '" loading="lazy" decoding="async" />' + (safeLabel ? '<figcaption>' + safeLabel + '</figcaption>' : '') + '</figure>';
  }
  if (kind === 'video') {
    return '<figure><video src="' + safeUrl + '" controls playsinline preload="metadata"></video>' + (safeLabel ? '<figcaption>' + safeLabel + '</figcaption>' : '') + '</figure>';
  }
  return '<figure><audio src="' + safeUrl + '" controls preload="metadata"></audio>' + (safeLabel ? '<figcaption>' + safeLabel + '</figcaption>' : '') + '</figure>';
}

function insertUploadedAssetIntoCurrentEditor(kind, url, label) {
  if (!url) {
    alert('This file is not uploaded yet. Wait until status is Uploaded.');
    return;
  }

  const markup = insertUploadedAssetMarkup(kind, url, label);

  if (currentMode === 'code') {
    const htmlField = document.getElementById('sf-html');
    insertMarkupAtCursorInTextarea(htmlField, '\n' + markup + '\n');
    schedulePreview();
    return;
  }

  if (currentMode === 'doc') {
    if (activeDocEditable && document.contains(activeDocEditable)) {
      activeDocEditable.focus();
      document.execCommand('insertHTML', false, markup);
      schedulePreview();
      return;
    }

    if (kind === 'image') {
      const lastBlock = docBlocks.length > 0 ? docBlocks[docBlocks.length - 1] : null;
      if (lastBlock && lastBlock.type === 'image') {
        if (!lastBlock.images) {
          lastBlock.images = lastBlock.url ? [{ url: lastBlock.url, caption: lastBlock.caption || '' }] : [];
          delete lastBlock.url;
          delete lastBlock.caption;
        }
        lastBlock.images.push({ url: url, caption: label || '' });
        renderDocBlocks();
        schedulePreview();
        return;
      }
      const block = createDocBlock('image');
      block.images = [{ url: url, caption: label || '' }];
      block.layout = 'stack';
      docBlocks.push(block);
    } else {
      const block = createDocBlock(kind);
      block.url = url;
      if (kind === 'audio' || kind === 'video') block.label = label || '';
      docBlocks.push(block);
    }
    renderDocBlocks();
    schedulePreview();
    return;
  }

  switchMode('code');
  const htmlField = document.getElementById('sf-html');
  insertMarkupAtCursorInTextarea(htmlField, '\n' + markup + '\n');
  schedulePreview();
  alert('Inserted into Code Editor for precise placement.');
}

function insertUploadedImageIntoPage(id) {
  const record = uploadedImages.find(img => img.id === id && !img.removed);
  if (!record || !record.remoteUrl) {
    alert('Image is not uploaded yet.');
    return;
  }
  insertUploadedAssetIntoCurrentEditor('image', record.remoteUrl, record.caption || record.name);
}

function insertUploadedMediaIntoPage(id) {
  const record = uploadedMediaFiles.find(item => item.id === id && !item.removed);
  if (!record || !record.remoteUrl) {
    alert('Media file is not uploaded yet.');
    return;
  }
  insertUploadedAssetIntoCurrentEditor(record.kind, record.remoteUrl, record.label || record.name);
}

function collectUploadedMediaAssets() {
  const imageAssets = uploadedImages
    .filter(img => !img.removed && img.remoteUrl)
    .map(img => ({
      kind: 'image',
      url: normalizeStorageAssetUrl(img.remoteUrl),
      alt: img.alt || img.name || '',
      caption: img.caption || '',
      label: img.name || ''
    }));

  const mediaAssets = uploadedMediaFiles
    .filter(item => !item.removed && item.remoteUrl)
    .map(item => ({
      kind: item.kind,
      url: normalizeStorageAssetUrl(item.remoteUrl),
      alt: item.alt || item.name || '',
      caption: item.caption || '',
      label: item.label || item.name || ''
    }));

  return { imageAssets, mediaAssets };
}

function getPendingUploadCounts() {
  const pendingImages = uploadedImages.filter(img => !img.removed && isUploadPendingStatus(img.status)).length;
  const pendingMedia = uploadedMediaFiles.filter(item => !item.removed && isUploadPendingStatus(item.status)).length;
  const failedImages = uploadedImages.filter(img => !img.removed && img.status === 'failed').length;
  const failedMedia = uploadedMediaFiles.filter(item => !item.removed && item.status === 'failed').length;
  return {
    pending: pendingImages + pendingMedia,
    failed: failedImages + failedMedia
  };
}

async function flushSubmissionAssetSync() {
  if (!activeDraftId || !currentUserForSubmit || assetSyncInFlight) return;

  const uploadedAssets = collectUploadedMediaAssets();
  const counts = getPendingUploadCounts();
  const signature = JSON.stringify({
    id: activeDraftId,
    imageUrls: uploadedAssets.imageAssets.map(asset => asset.url),
    mediaUrls: uploadedAssets.mediaAssets.map(asset => asset.url),
    pending: counts.pending,
    failed: counts.failed
  });
  if (signature === lastAssetSyncSignature) return;

  assetSyncInFlight = true;
  try {
    await callSubmissionApi('POST', {
      action: 'patch-assets',
      submissionId: activeDraftId,
      imageUrls: uploadedAssets.imageAssets.map(asset => asset.url),
      imageAssets: uploadedAssets.imageAssets,
      mediaUrls: uploadedAssets.mediaAssets.map(asset => asset.url),
      mediaAssets: uploadedAssets.mediaAssets,
      uploadState: {
        pendingCount: counts.pending,
        failedCount: counts.failed
      }
    });
    lastAssetSyncSignature = signature;
  } catch (err) {
    console.warn('[Submission Asset Sync] Failed:', err && err.message ? err.message : err);
  } finally {
    assetSyncInFlight = false;
  }
}

function scheduleSubmissionAssetSync() {
  if (assetSyncTimer) clearTimeout(assetSyncTimer);
  assetSyncTimer = setTimeout(() => {
    flushSubmissionAssetSync();
  }, 1200);
}

function normalizeUploadedMediaFromDraft(draftAssets, kind) {
  return draftAssets.map((asset, idx) => ({
    id: 'draft_' + kind + '_' + idx + '_' + Date.now(),
    name: kind + ' file ' + (idx + 1),
    kind: kind,
    url: String(asset.url || ''),
    localUrl: String(asset.url || ''),
    remoteUrl: String(asset.url || ''),
    status: 'ready',
    removed: false,
    file: null,
    caption: String(asset.caption || ''),
    alt: String(asset.alt || ''),
    label: String(asset.label || asset.title || asset.name || ''),
    fingerprint: 'draft-' + kind + '-' + idx
  }));
}

function resetUploadedMediaState() {
  uploadedImages = [];
  uploadedMediaFiles = [];
  renderImageList();
  renderMediaList();
  refreshImageSelectors();
}

function renderImageList() {
  const list = document.getElementById('img-list');
  list.innerHTML = uploadedImages.map((img) => {
    const displayUrl = img.remoteUrl || img.localUrl || img.url || '';
    const label = getUploadStatusLabel(img.status);
    return `
    <div class="img-item">
      <img src="${displayUrl}" alt="${img.name}" />
      <div style="flex:1;min-width:0">
        <span class="img-url" title="${displayUrl}">${img.name}</span>
        <div style="font-size:.65rem;color:var(--wht-f);margin-top:3px;text-transform:uppercase;letter-spacing:1px">${label}</div>
        <input class="fi" type="text" placeholder="Image caption (shown on page)" value="${escapeHtml(img.caption || '')}" oninput="updateUploadedImageMeta('${img.id}', 'caption', this.value)" style="margin-top:6px;font-size:.72rem;padding:6px 8px" />
      </div>
      <button class="btn btn-sm btn-s btn-copy" type="button" onclick="copyImageUrl('${img.id}', this)">Copy URL</button>
      ${img.status === 'ready' ? '<button class="btn btn-sm btn-s" type="button" onclick="insertUploadedImageIntoPage(\'' + img.id + '\')">Insert</button>' : ''}
      ${img.status === 'failed' ? '<button class="btn btn-sm btn-s" type="button" onclick="retryUploadedImage(\'' + img.id + '\')">Retry</button>' : ''}
      <button class="btn btn-sm btn-d" type="button" onclick="removeUploadedImage('${img.id}')">Remove</button>
    </div>
  `;
  }).join('');
}

function updateUploadedImageMeta(id, field, value) {
  const record = uploadedImages.find(img => img.id === id);
  if (!record) return;
  if (field === 'caption') record.caption = String(value || '').slice(0, 180);
  if (field === 'alt') record.alt = String(value || '').slice(0, 180);
  scheduleDraftAutoSave();
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
  uploadQueue = uploadQueue.filter(queueId => queueId !== id);
  if (record.task && isUploadPendingStatus(record.status) && typeof record.task.cancel === 'function') {
    try { record.task.cancel(); } catch (e) { /* ignore */ }
  }
  if (record.timeoutId) {
    try { clearTimeout(record.timeoutId); } catch (e) { /* ignore */ }
  }
  if (record.isObjectUrl && record.localUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try { URL.revokeObjectURL(record.localUrl); } catch (e) { /* ignore */ }
  }
  uploadedImages.splice(index, 1);
  renderImageList();
  refreshImageSelectors();
  markEditorAsChanged();
  scheduleDraftAutoSave();
  scheduleSubmissionAssetSync();
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
  refreshMediaSelectors();
}

function refreshMediaSelectors() {
  const templateAudioSelectors = ['tf-anomaly-audio', 'tf-tale-audio', 'tf-guide-audio'];
  const templateVideoSelectors = ['tf-anomaly-video', 'tf-tale-video', 'tf-guide-video'];

  templateAudioSelectors.forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">None</option>';
    uploadedMediaFiles.filter(item => item.status === 'ready' && item.remoteUrl && item.kind === 'audio').forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.remoteUrl;
      opt.textContent = item.name;
      sel.appendChild(opt);
    });
    if (prev && Array.from(sel.options).some(option => option.value === prev)) sel.value = prev;
  });

  templateVideoSelectors.forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">None</option>';
    uploadedMediaFiles.filter(item => item.status === 'ready' && item.remoteUrl && item.kind === 'video').forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.remoteUrl;
      opt.textContent = item.name;
      sel.appendChild(opt);
    });
    if (prev && Array.from(sel.options).some(option => option.value === prev)) sel.value = prev;
  });

  document.querySelectorAll('#doc-blocks select[data-field="uploadSelectMedia"]').forEach(selectEl => {
    const index = Number(selectEl.getAttribute('data-index'));
    const kind = String(selectEl.getAttribute('data-kind') || '').toLowerCase();
    const selected = Number.isFinite(index) && docBlocks[index] ? (docBlocks[index].url || '') : '';
    selectEl.innerHTML = getUploadedMediaOptions(kind === 'video' ? 'video' : 'audio', selected);
    if (selected && Array.from(selectEl.options).some(option => option.value === selected)) {
      selectEl.value = selected;
    }
  });
}

function refreshDocumentImagePickers() {
  document.querySelectorAll('#doc-blocks select[data-field="imageSelect"]').forEach(selectEl => {
    const index = Number(selectEl.getAttribute('data-index'));
    const iIdx = Number(selectEl.getAttribute('data-img-index'));
    const block = docBlocks[index];
    if (block && block.images && block.images[iIdx]) {
      const selected = block.images[iIdx].url || '';
      selectEl.innerHTML = getUploadedImageOptions(selected);
      if (selected && Array.from(selectEl.options).some(option => option.value === selected)) {
        selectEl.value = selected;
      }
    }
  });
  // Handle old-style or media blocks if they exist
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
  const source = String(html || '');
  if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
    return window.DOMPurify.sanitize(source, {
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
    });
  }

  let clean = source.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  clean = clean.replace(/javascript\s*:/gi, 'blocked:');
  clean = clean.replace(/<\s*\/?\s*(iframe|object|embed|applet|meta|link)\b[^>]*>/gi, '');
  return clean;
}

function embedUploadedImagesIfMissing(html, imageAssets) {
  const assets = Array.isArray(imageAssets)
    ? imageAssets.map(item => typeof item === 'string' ? { url: item, caption: '', alt: '' } : item).filter(item => item && item.url)
    : [];
  const urls = assets.map(item => item.url);
  if (!urls.length) return html || '';

  const raw = String(html || '');
  if (raw.includes('class="uploaded-assets"')) return raw;

  // If at least one uploaded URL is already used in content, respect author layout.
  if (urls.some(url => raw.includes(url))) return raw;

  const gallery = '\n<div class="page-section uploaded-assets">' +
    '<h2>Uploaded Assets</h2>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">' +
      assets.map((asset, idx) =>
        '<figure style="margin:0">' +
          '<a href="' + asset.url + '" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none">' +
            '<img src="' + asset.url + '" alt="' + escapeHtml(asset.alt || ('Uploaded asset ' + (idx + 1))) + '" style="display:block;max-width:100%;width:auto;height:auto;border:1px solid #3a3a3a;background:#111" />' +
          '</a>' +
          (asset.caption ? '<figcaption style="margin-top:6px;font-size:.75rem;color:#bdbdbd;line-height:1.4">' + escapeHtml(asset.caption) + '</figcaption>' : '') +
        '</figure>'
      ).join('') +
    '</div>' +
  '</div>';

  return raw + gallery;
}

function embedUploadedMediaIfMissing(html, mediaAssets) {
  const assets = Array.isArray(mediaAssets) ? mediaAssets.filter(asset => asset && asset.url) : [];
  if (!assets.length) return String(html || '');

  const raw = String(html || '');
  if (raw.includes('class="uploaded-media"')) return raw;
  if (assets.some(asset => raw.includes(asset.url))) return raw;

  const gallery = '\n<div class="page-section uploaded-media">' +
    '<h2>Uploaded Media</h2>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">' +
      assets.map((asset, idx) => {
        const kind = String(asset.kind || '').toLowerCase();
        const label = escapeHtml(asset.label || asset.caption || (kind ? kind + ' ' + (idx + 1) : 'Media ' + (idx + 1)));
        const player = kind === 'video'
          ? '<video src="' + asset.url + '" controls playsinline preload="metadata" style="width:100%;display:block;border:1px solid #3a3a3a;background:#111"></video>'
          : '<audio src="' + asset.url + '" controls preload="metadata" style="width:100%;display:block"></audio>';
        return '<figure style="margin:0">' +
          player +
          '<figcaption style="margin-top:8px;font-size:.75rem;color:#bdbdbd;line-height:1.4">' + label + '</figcaption>' +
        '</figure>';
      }).join('') +
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
  const assets = collectUploadedMediaAssets();

  // Update external asset preview section instead of embedding in iframe
  updateExternalAssetPreview(sanitized, assets);

  const wrappedHtml = wrapWithDefaultSchema(sanitized, document.getElementById('sf-title').value || 'New Classified Document');
  const doc = buildSandboxDocument(wrappedHtml, mergeWithDefaultSchemaCSS(css));
  frame.srcdoc = doc;
}

function updateExternalAssetPreview(currentHtml, assets) {
  const container = document.getElementById('external-asset-preview');
  if (!container) return;

  const imageGallery = getExternalImageGalleryHtml(currentHtml, assets.imageAssets);
  const mediaGallery = getExternalMediaGalleryHtml(currentHtml, assets.mediaAssets);

  if (!imageGallery && !mediaGallery) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.innerHTML = `
    <div class="section" style="margin-top:24px">
      <div class="section-hd">Uploaded Media Preview</div>
      <p style="font-size:.75rem;color:var(--wht-d);margin-bottom:16px">
        These assets are uploaded but not yet used in your page content. They will not be visible to users until you insert them.
      </p>
      ${imageGallery}
      ${mediaGallery}
    </div>
  `;
  container.classList.remove('hidden');
}

function getExternalImageGalleryHtml(html, imageAssets) {
  const assets = Array.isArray(imageAssets)
    ? imageAssets.map(item => typeof item === 'string' ? { url: item, caption: '', alt: '' } : item).filter(item => item && item.url)
    : [];
  const urls = assets.map(item => item.url);
  if (!urls.length) return '';

  const raw = String(html || '');
  // Filter out assets already used in the content
  const unusedAssets = assets.filter(asset => !raw.includes(asset.url));
  if (!unusedAssets.length) return '';

  return `
    <div class="page-section" style="margin-bottom:20px">
      <h3>Images</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
        ${unusedAssets.map((asset, idx) => `
          <figure style="margin:0">
            <a href="${asset.url}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none">
              <img src="${asset.url}" alt="${escapeHtml(asset.alt || ('Uploaded asset ' + (idx + 1)))}" style="display:block;max-width:100%;width:auto;height:auto;border:1px solid #3a3a3a;background:#111" />
            </a>
            ${asset.caption ? `<figcaption style="margin-top:6px;font-size:.75rem;color:#bdbdbd;line-height:1.4">${escapeHtml(asset.caption)}</figcaption>` : ''}
          </figure>
        `).join('')}
      </div>
    </div>
  `;
}

function getExternalMediaGalleryHtml(html, mediaAssets) {
  const assets = Array.isArray(mediaAssets) ? mediaAssets.filter(asset => asset && asset.url) : [];
  if (!assets.length) return '';

  const raw = String(html || '');
  // Filter out assets already used in the content
  const unusedAssets = assets.filter(asset => !raw.includes(asset.url));
  if (!unusedAssets.length) return '';

  return `
    <div class="page-section">
      <h3>Audio & Video</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">
        ${unusedAssets.map((asset, idx) => {
          const kind = String(asset.kind || '').toLowerCase();
          const label = escapeHtml(asset.label || asset.caption || (kind ? kind + ' ' + (idx + 1) : 'Media ' + (idx + 1)));
          const player = kind === 'video'
            ? `<video src="${asset.url}" controls playsinline preload="metadata" style="width:100%;display:block;border:1px solid #3a3a3a;background:#111"></video>`
            : `<audio src="${asset.url}" controls preload="metadata" style="width:100%;display:block"></audio>`;
          return `
            <figure style="margin:0">
              ${player}
              <figcaption style="margin-top:8px;font-size:.75rem;color:#bdbdbd;line-height:1.4">${label}</figcaption>
            </figure>
          `;
        }).join('')}
      </div>
    </div>
  `;
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

  const now = Date.now();
  if (now - lastSubmitAttemptAt < 500) {
    alert('Please wait a moment before submitting again.');
    return;
  }
  lastSubmitAttemptAt = now;

  let title = document.getElementById('sf-title').value.trim();
  const selectedType = document.getElementById('sf-type').value;
  const type = getCanonicalType(selectedType);
  const tags = getSelectedTags();
  const manualSlug = document.getElementById('sf-slug').value.trim();
  const slug = manualSlug || generateSlug(title);
  const anomalySubtype = document.getElementById('sf-anomaly-subtype').value;
  const anomalyCodeInput = document.getElementById('sf-anomaly-code').value;

  if (isAnomalyFamilyType(selectedType)) {
    title = title.toUpperCase();
    document.getElementById('sf-title').value = title;
  }

  if (!title) { alert('Please enter a title.'); return; }
  if (!slug) { alert('Please enter a valid slug.'); return; }

  let anomalyId = '';
  let anomalyListKey = '';
  let anomalySubtypeLabel = '';
  if (isAnomalyFamilyType(selectedType)) {
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
  if (isAnomalyFamilyType(selectedType) && currentMode === 'template') {
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

  if (isNarrativeFamilyType(selectedType)) {
    const narrativeSample = (document.getElementById('tf-tale-intro')?.value || '') + '\n' + String(htmlContent || '');
    if (!hasFirstPersonNarration(narrativeSample)) {
      alert('Narratives/Field Reports must be written in first-person perspective (I, me, my, we, our).');
      return;
    }
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
      if (window.rogLogger) rogLogger.warn('Title uniqueness check skipped:', e);
    }
  }

  if (type === 'Anomaly' && anomalyId) {
    try {
      const existingPages = await db.collection('pages')
        .where('type', '==', 'Anomaly')
        .where('anomalyId', '==', anomalyId)
        .limit(5)
        .get();
      const existingSubs = await db.collection('submissions')
        .where('type', '==', 'Anomaly')
        .where('anomalyId', '==', anomalyId)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
      const foundInOtherPage = !existingPages.empty && existingPages.docs.some(doc => doc.id !== (submitEditTarget && submitEditTarget.id));
      const found = foundInOtherPage || !existingSubs.empty;

      if (found) {
        alert('An Anomaly entry for ID "' + anomalyId + '" already exists or is pending review. You cannot create a duplicate Anomaly designation, though you may submit Tales or Art for it.');
        btn.textContent = '>> Submit for Review';
        btn.disabled = false;
        return;
      }
    } catch(e) {
      if (window.rogLogger) rogLogger.warn('Uniqueness check skipped due to missing composite index.', e);
    }
  }

  btn.textContent = 'Checking page link...';
  btn.disabled = true;

  try {
    const existingPages = await db.collection('pages').where('slug', '==', slug).limit(1).get();
    const existingSubs = await db.collection('submissions').where('slug', '==', slug).where('status', '==', 'pending').limit(1).get();
    const slugUsedByOtherPage = !existingPages.empty && existingPages.docs.some(doc => doc.id !== (submitEditTarget && submitEditTarget.id));
    if (slugUsedByOtherPage || (!submitEditTarget && !existingSubs.empty)) {
      alert('The page link "' + slug + '" is already in use. Please choose a different one.');
      btn.textContent = '>> Submit for Review';
      btn.disabled = false;
      return;
    }
  } catch (e) {
    // Database might not have indexes yet -> proceed
  }

  btn.textContent = 'Submitting...';

  const inFlightUploads = uploadedImages.filter(img => !img.removed && isUploadPendingStatus(img.status));
  const inFlightMediaUploads = uploadedMediaFiles.filter(item => !item.removed && isUploadPendingStatus(item.status));
  const failedUploads = uploadedImages.filter(img => !img.removed && img.status === 'failed');
  const failedMediaUploads = uploadedMediaFiles.filter(item => !item.removed && item.status === 'failed');
  const pendingUploadCount = inFlightUploads.length + inFlightMediaUploads.length;
  const failedUploadCount = failedUploads.length + failedMediaUploads.length;

  const uploadedAssets = collectUploadedMediaAssets();
  if (!isMediaEnabledSubmissionType(type) && uploadedAssets.mediaAssets.length) {
    alert('Audio and video files can only be attached to Tale, Anomaly, Guide, and Legacy submissions.');
    btn.textContent = '>> Submit for Review';
    btn.disabled = false;
    return;
  }
  const uploadedUrls = uploadedAssets.imageAssets.map(asset => asset.url);
  const sanitizedHTML = sanitizeHTML(htmlContent);
  const wrappedHTML = wrapWithDefaultSchema(sanitizedHTML, title);
  const mergedCSS = mergeWithDefaultSchemaCSS(cssContent);
  const isAdminUser = await getUserAdminFlag(currentUserForSubmit);

  const clearanceLevel = enforceSubmitClearanceSelection(document.getElementById('sf-clearance').value);

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
    imageAssets: uploadedAssets.imageAssets,
    mediaUrls: uploadedAssets.mediaAssets.map(asset => asset.url),
    mediaAssets: uploadedAssets.mediaAssets,
    clearanceLevel: clearanceLevel,
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

      const editPageId = submitEditTarget.id;

      const result = await callSubmissionApi('POST', {
        action: 'publish',
        pageId: editPageId,
        submissionId: activeDraftId || '',
        submission: submission,
        reviewerName: currentUserForSubmit.displayName || currentUserForSubmit.email.split('@')[0] || 'Admin',
        removeDraft: !!activeDraftId
      });
      alert('Page updated successfully.');
      clearTimeout(draftAutoSaveTimer);
      submitEditTarget = null;
      activeDraftId = null;
      hasUnsavedEditorChanges = false;
      suppressDraftAutoSave = true;
      const publishedPageId = result.pageId || editPageId;
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
    activeDraftId = result.id || activeDraftId || null;
    lastAssetSyncSignature = '';
    scheduleSubmissionAssetSync();

    if (pendingUploadCount || failedUploadCount) {
      const uploadStatus = document.getElementById('upload-status');
      if (uploadStatus) {
        uploadStatus.textContent = 'Submission saved. Uploads continue in background (' + pendingUploadCount + ' pending, ' + failedUploadCount + ' failed).';
      }
      alert('Submission saved. Media files will keep uploading in the background and auto-sync to the backend while this tab stays open.');
      loadMySubmissions('history');
      return;
    }

    activeDraftId = null;
    if (isAdminUser) {
      alert('Published directly by admin clearance.\nLive at: /pages/' + slug);
    } else {
      alert('Submission received! Your page will be reviewed by Guild admins.\nOnce approved, it will be live at: /pages/' + slug);
    }
    resetSubmitForm();
    loadMySubmissions('history');
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
  setDesignationLock(false);
  enforceSubmitClearanceSelection(maxSubmitClearanceLevel);
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
  ['tf-hero-img', 'tf-tale-hero', 'tf-art-img', 'tf-guide-hero', 'tf-anomaly-audio', 'tf-anomaly-video', 'tf-tale-audio', 'tf-tale-video', 'tf-guide-audio', 'tf-guide-video'].forEach(id => {
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

  resetUploadedMediaState();
  updateTagSummary();
  onAnomalySubtypeChange();
  updateTypeSpecificUI();
  updateSlugPreview();
  updatePreview();
  document.getElementById('submit-btn').textContent = '>> Submit for Review';
  setDraftStatus('Draft autosave is idle.');
  clearEditorUnsavedState();
  suppressDraftAutoSave = false;
}

// ═════════════════════════════════════════════════════════════
// MY SUBMISSIONS
// ═════════════════════════════════════════════════════════════

async function loadMySubmissions(viewMode = 'history') {
  if (!currentUserForSubmit) return;
  const container = document.getElementById('my-submissions');
  if (!container) return;
  const showDraftsOnly = viewMode === 'drafts';
  updateMySubmissionsHeading(viewMode);

  try {
    let submissions = [];
    try {
      const result = await callSubmissionApi('GET');
      submissions = Array.isArray(result.submissions) ? result.submissions : [];
    } catch (_apiErr) {
      const snapshot = await db.collection('submissions')
        .where('authorUid', '==', currentUserForSubmit.uid)
        .get();
      submissions = snapshot.docs
        .map(doc => ({ id: doc.id, data: doc.data() }))
        .sort((a, b) => {
          const aTime = a.data.updatedAt?.seconds || a.data.submittedAt?.seconds || 0;
          const bTime = b.data.updatedAt?.seconds || b.data.submittedAt?.seconds || 0;
          return bTime - aTime;
        });
    }

    const visibleSubmissions = submissions.filter(entry => {
      const status = String(entry && entry.data && entry.data.status || '').toLowerCase();
      return showDraftsOnly ? status === 'draft' : status !== 'draft';
    });

    if (visibleSubmissions.length === 0) {
      const emptyMessage = showDraftsOnly ? 'No drafts found.' : 'No submission history yet.';
      container.innerHTML = '<p style="font-size:.8rem;color:var(--wht-f);text-align:center;padding:24px">' + emptyMessage + '</p>';
      return;
    }

    container.innerHTML = visibleSubmissions.map(entry => {
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
      if (!showDraftsOnly && s.status === 'pending') {
        deleteBtn = '<button class="btn btn-sm btn-d" onclick="deleteMySubmission(\'' + d.id + '\')" style="margin-left:8px">Withdraw</button>';
      }
      if (showDraftsOnly && s.status === 'draft') {
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
    loadMySubmissions(submitViewMode === 'drafts' ? 'drafts' : 'history');
  } catch (err) {
    alert('Error: ' + err.message);
  }
}
