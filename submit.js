/* ═══════════════════════════════════════════════════════════════
 *  SUBMIT.JS — Page submission with Template Builder + Code Editor
 *  Templates, slug generation, image upload, HTML sanitization
 * ═══════════════════════════════════════════════════════════════ */

let uploadedImages = [];
let currentUserForSubmit = null;
let previewDebounce = null;
let currentMode = 'template'; // 'template' | 'code'
let currentTemplate = 'anomaly'; // 'anomaly' | 'tale' | 'artwork' | 'guide'
let subsectionCounters = { anomaly: 0, tale: 0, guide: 0 };

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
    navAuth.innerHTML = '<button class="nav-btn" onclick="auth.signOut()">' + (user.displayName || 'Agent') + ' (Sign Out)</button>';
    loadMySubmissions();
  } else {
    currentUserForSubmit = null;
    document.getElementById('submit-denied').classList.remove('hidden');
    document.getElementById('submit-panel').classList.add('hidden');
    navAuth.innerHTML = '<button class="nav-btn" onclick="location.href=\'index.html\'">Sign In</button>';
  }
});

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

// ═════════════════════════════════════════════════════════════
// MODE SWITCHING
// ═════════════════════════════════════════════════════════════

function switchMode(mode) {
  currentMode = mode;
  document.getElementById('mode-template').classList.toggle('active', mode === 'template');
  document.getElementById('mode-code').classList.toggle('active', mode === 'code');
  document.getElementById('template-mode').classList.toggle('hidden', mode !== 'template');
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
    titleLabel.textContent = 'Anomaly Number (Title)';
    titleInput.placeholder = 'e.g. ROG-007';
  } else {
    titleLabel.textContent = 'Title';
    const placeholders = { tale: 'e.g. The Hollow Mirror', artwork: 'e.g. Sketch of ROG-088', guide: 'e.g. Containment Protocols' };
    titleInput.placeholder = placeholders[tpl] || 'Enter a title';
  }

  schedulePreview();
}

function onTypeChange() {
  const type = document.getElementById('sf-type').value;
  const tplMap = { Anomaly: 'anomaly', Tale: 'tale', Artwork: 'artwork', Guide: 'guide', Hub: 'guide' };
  if (currentMode === 'template' && tplMap[type]) {
    selectTemplate(tplMap[type]);
  }
}

function addSubsection(type) {
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
  return normalizePageCss(css || '').trim();
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

function buildSandboxDocument(html, css) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>' +
    ':root{--red:#8b0000;--red-b:#cc0000;--red-d:#5c0000;--blk:#000;--blk-s:#0a0a0a;--blk-c:#111;--wht:#fff;--wht-m:#ccc;--wht-d:#999;--font-m:"IBM Plex Mono",monospace;--font-d:"Special Elite",monospace;color-scheme:dark}' +
    '*{margin:0;padding:0;box-sizing:border-box}body{font-family:var(--font-m);line-height:1.7;padding:24px;color:var(--wht-m);background:var(--blk)}img{max-width:100%;height:auto}' +
    '.page-shell{max-width:960px;margin:0 auto;padding:24px}.page-header{padding:24px;border-bottom:2px solid var(--red-d);margin-bottom:24px;background:linear-gradient(180deg,rgba(139,0,0,.1),transparent)}.page-title{font-family:var(--font-d);font-size:2rem;color:var(--wht);text-transform:uppercase;letter-spacing:3px;margin-bottom:8px}.page-subtitle{font-size:.8rem;color:var(--red-b);letter-spacing:2px;text-transform:uppercase}.page-section{margin-bottom:24px;padding:20px;border:1px solid var(--red-d);background:var(--blk-s)}.page-section h2{font-family:var(--font-d);color:var(--wht);text-transform:uppercase;letter-spacing:2px;border-bottom:1px dashed var(--red-d);padding-bottom:8px;margin-bottom:12px}' +
    css.replace(/<\/style>/gi, '') +
    '</style></head><body>' + html + '</body></html>';
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
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  input.addEventListener('change', e => {
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

  // Bind all template fields to preview
  document.querySelectorAll('#template-mode input, #template-mode textarea, #template-mode select').forEach(el => {
    el.addEventListener('input', schedulePreview);
    el.addEventListener('change', schedulePreview);
  });

  document.getElementById('sf-html').value = DEFAULT_NEW_PAGE_HTML;
  document.getElementById('sf-css').value = '';
  updateSlugPreview();
  updatePreview();
});

function handleFiles(files) {
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) {
      alert('Only image files are allowed: ' + file.name);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File too large (max 5MB): ' + file.name);
      return;
    }
    uploadImage(file);
  });
}

async function uploadImage(file, attempt = 1) {
  if (!currentUserForSubmit) { alert('Please sign in first.'); return; }

  const progressWrap = document.getElementById('upload-progress');
  const progressBar = document.getElementById('upload-bar');
  progressWrap.style.display = 'block';
  progressBar.style.width = '0%';

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = 'submissions/' + currentUserForSubmit.uid + '/' + timestamp + '_' + safeName;
  let ref;

  try {
    ref = getStorageRef(path);
  } catch (initErr) {
    alert('Upload unavailable: ' + (initErr.message || initErr));
    progressWrap.style.display = 'none';
    return;
  }

  try {
    const task = ref.put(file);
    task.on('state_changed',
      snap => {
        const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
        progressBar.style.width = pct + '%';
      },
      err => {
        const code = err && err.code ? err.code : '';
        if ((code === 'storage/retry-limit-exceeded' || code === 'storage/invalid-default-bucket' || code === 'storage/bucket-not-found') && attempt < 2) {
          progressBar.style.width = '0%';
          uploadImage(file, attempt + 1);
          return;
        }
        if (code === 'storage/unauthorized') {
          alert('Upload denied by Firebase Storage rules. Confirm you are signed in and using your own submissions folder.');
        } else {
          alert('Upload failed: ' + (err.message || code || 'Unknown storage error'));
        }
        progressWrap.style.display = 'none';
      },
      async () => {
        const url = await ref.getDownloadURL();
        uploadedImages.push({ name: file.name, url: url });
        renderImageList();
        refreshImageSelectors();
        progressWrap.style.display = 'none';
      }
    );
  } catch (err) {
    alert('Upload error: ' + err.message);
    progressWrap.style.display = 'none';
  }
}

function renderImageList() {
  const list = document.getElementById('img-list');
  list.innerHTML = uploadedImages.map((img, i) => `
    <div class="img-item">
      <img src="${img.url}" alt="${img.name}" />
      <span class="img-url" title="${img.url}">${img.name}</span>
      <button class="btn btn-sm btn-s btn-copy" onclick="copyImageUrl(${i})">Copy URL</button>
    </div>
  `).join('');
}

function refreshImageSelectors() {
  const selectors = ['tf-hero-img', 'tf-tale-hero', 'tf-art-img', 'tf-guide-hero'];
  selectors.forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const prev = sel.value;
    const noneLabel = selId.includes('art') ? 'Upload an image above first' : 'None — No hero image';
    sel.innerHTML = '<option value="">' + noneLabel + '</option>';
    uploadedImages.forEach((img, i) => {
      const opt = document.createElement('option');
      opt.value = img.url;
      opt.textContent = img.name;
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
  });
}

function copyImageUrl(index) {
  const url = uploadedImages[index].url;
  navigator.clipboard.writeText(url).then(() => {
    const btns = document.querySelectorAll('.btn-copy');
    if (btns[index]) {
      btns[index].textContent = 'Copied!';
      setTimeout(() => { btns[index].textContent = 'Copy URL'; }, 1500);
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
  clean = clean.replace(/src\s*=\s*["']?\s*data\s*:/gi, 'src="blocked:');
  return clean;
}

// ═════════════════════════════════════════════════════════════
// LIVE PREVIEW
// ═════════════════════════════════════════════════════════════

function schedulePreview() {
  clearTimeout(previewDebounce);
  previewDebounce = setTimeout(updatePreview, 300);
}

function updatePreview() {
  let html, css;

  if (currentMode === 'template') {
    const result = buildTemplateHTML();
    html = result.html;
    css = result.css;
  } else {
    html = document.getElementById('sf-html').value;
    css = document.getElementById('sf-css').value;
  }

  const frame = document.getElementById('preview-frame');
  const sanitized = sanitizeHTML(html);
  const wrappedHtml = wrapWithDefaultSchema(sanitized, document.getElementById('sf-title').value || 'New Classified Document');
  const doc = buildSandboxDocument(wrappedHtml, mergeWithDefaultSchemaCSS(css));
  frame.srcdoc = doc;
}

// ═════════════════════════════════════════════════════════════
// SUBMIT PAGE
// ═════════════════════════════════════════════════════════════

async function submitPage() {
  if (!currentUserForSubmit) { alert('Please sign in first.'); return; }

  let title = document.getElementById('sf-title').value.trim();
  if (document.getElementById('sf-type').value === 'Anomaly') {
    title = title.toUpperCase(); // Ensure uppercase for anomaly numbers
  }
  const type = document.getElementById('sf-type').value;
  const tags = document.getElementById('sf-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const manualSlug = document.getElementById('sf-slug').value.trim();
  const slug = manualSlug || generateSlug(title);

  if (!title) { alert('Please enter a title.'); return; }
  const idMatch = title.match(/^([A-Z]{2,4}-\d+)/i) || title.match(/^([A-Za-z]+-\d+)/i);
  if (!idMatch) {
    alert("The submission Title MUST begin with an Anomaly ID designation (e.g. ROG-001, ROS-0050). This is compulsory for search indexing.");
    return;
  }
  const anomalyId = idMatch[1].toUpperCase();

  let htmlContent, cssContent;

  if (currentMode === 'template') {
    const result = buildTemplateHTML();
    htmlContent = result.html;
    cssContent = result.css;
    if (!htmlContent.trim()) { alert('Please fill in at least some template fields.'); return; }
  } else {
    htmlContent = document.getElementById('sf-html').value;
    cssContent = document.getElementById('sf-css').value;
    if (!htmlContent.trim()) { alert('Please enter some HTML content.'); return; }
  }

  const btn = document.getElementById('submit-btn');
  btn.textContent = 'Verifying ID constraints...';
  btn.disabled = true;

  if (type === 'Anomaly') {
    try {
      let found = false;
      if (typeof PAGE_SEED !== 'undefined') {
        found = PAGE_SEED.some(p => p.type === 'Anomaly' && p.title.toUpperCase().startsWith(anomalyId));
      }
      if (!found) {
        const existingPages = await db.collection('pages').where('type', '==', 'Anomaly').where('anomalyId', '==', anomalyId).limit(1).get();
        const existingSubs = await db.collection('submissions').where('type', '==', 'Anomaly').where('anomalyId', '==', anomalyId).where('status', '==', 'pending').limit(1).get();
        found = !existingPages.empty || !existingSubs.empty;
      }

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
    if (!existingPages.empty || !existingSubs.empty) {
      alert('The URL slug "' + slug + '" is already in use. Please choose a different slug.');
      btn.textContent = '>> Submit for Review';
      btn.disabled = false;
      return;
    }
  } catch (e) {
    // Firestore might not have indexes yet -> proceed
  }

  btn.textContent = 'Submitting...';

  const sanitizedHTML = sanitizeHTML(htmlContent);
  const wrappedHTML = wrapWithDefaultSchema(sanitizedHTML, title);
  const mergedCSS = mergeWithDefaultSchemaCSS(cssContent);

  const submission = {
    title: title,
    anomalyId: anomalyId,
    type: type,
    tags: tags,
    slug: slug,
    htmlContent: wrappedHTML,
    cssContent: mergedCSS,
    imageUrls: uploadedImages.map(img => img.url),
    authorUid: currentUserForSubmit.uid,
    authorEmail: currentUserForSubmit.email,
    authorName: currentUserForSubmit.displayName || currentUserForSubmit.email.split('@')[0],
    status: 'pending',
    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    await db.collection('submissions').add(submission);
    alert('Submission received! Your page will be reviewed by Guild admins.\nOnce approved, it will be live at: /pages/' + slug);
    resetSubmitForm();
    loadMySubmissions();
  } catch (err) {
    alert('Submission failed: ' + err.message);
  } finally {
    btn.textContent = '>> Submit for Review';
    btn.disabled = false;
  }
}

function resetSubmitForm() {
  document.getElementById('sf-title').value = '';
  document.getElementById('sf-type').value = 'Anomaly';
  document.getElementById('sf-tags').value = '';
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
    if (el) el.value = 'Safe';
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

  uploadedImages = [];
  renderImageList();
  refreshImageSelectors();
  updateSlugPreview();
  updatePreview();
}

// ═════════════════════════════════════════════════════════════
// MY SUBMISSIONS
// ═════════════════════════════════════════════════════════════

async function loadMySubmissions() {
  if (!currentUserForSubmit) return;
  const container = document.getElementById('my-submissions');

  try {
    const snap = await db.collection('submissions')
      .where('authorUid', '==', currentUserForSubmit.uid)
      .orderBy('submittedAt', 'desc')
      .limit(20)
      .get();

    if (snap.empty) {
      container.innerHTML = '<p style="font-size:.8rem;color:var(--wht-f);text-align:center;padding:24px">No submissions yet. Create your first page above!</p>';
      return;
    }

    container.innerHTML = snap.docs.map(d => {
      const s = d.data();
      const statusClass = 'status status-' + s.status;
      const date = s.submittedAt ? new Date(s.submittedAt.seconds * 1000).toLocaleDateString() : '—';
      const slug = s.slug || '';
      let extra = '';
      if (s.status === 'rejected' && s.rejectionReason) {
        extra = '<div style="font-size:.75rem;color:var(--red-b);margin-top:4px">Reason: ' + s.rejectionReason + '</div>';
      }
      if (s.status === 'approved') {
        const pageUrl = slug ? 'pages/' + slug : 'page.html?id=' + (s.approvedPageId || d.id);
        extra = '<div style="margin-top:4px"><a href="' + pageUrl + '" class="btn btn-sm btn-s" style="font-size:.65rem">View Live Page</a></div>';
      }
      let deleteBtn = '';
      if (s.status === 'pending') {
        deleteBtn = '<button class="btn btn-sm btn-d" onclick="deleteMySubmission(\'' + d.id + '\')" style="margin-left:8px">Withdraw</button>';
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
    await db.collection('submissions').doc(id).delete();
    loadMySubmissions();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}
