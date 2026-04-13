/* ═══════════════════════════════════════════════════════════════
 *  RED OAKER GUILD — APP.JS
 *  All client-side logic: terminal, auth, carousel, data feeds
 *  Runs on GitHub Pages — no build step required
 * ═══════════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────
let currentUser = null;
let currentRole = "user";
let authMode = "login"; // login | register
let terminalInterval = null;
let terminalStartedAt = 0;
let terminalColumnTimers = [];
let terminalEndTimer = null;

// ═════════════════════════════════════════════════════════════
// TERMINAL EASTER EGG
// ═════════════════════════════════════════════════════════════

const CODE_LINES = [
  '#include <oak_core.h>',
  '#include <iostream>',
  '#include <vector>',
  '',
  '/** @dudefromalhiem: Initializing neural-link buffer */',
  'int main(int argc, char* argv[]) {',
  '    auto registry = AnomalyRepo::getInstance();',
  '    if (!registry->is_authorized(OAK_LVL_5)) {',
  '        throw SecurityException("Insufficient Clearance");',
  '    }',
  '    vector<Anomaly*> targets = registry->query("sector=7G");',
  '    for (auto& a : targets) {',
  '        a->stabilize_field(0.42f);',
  '        clog << "Processing: " << a->get_id() << endl;',
  '    }',
  '    return OAK_SUCCESS;',
  '}',
  '',
  'import os, sys, hashlib',
  'from oak.security import AuthMatrix',
  '',
  '# Master Control by @dudefromalhiem',
  'def seal_sector(sector_id: str, secret_key: bytes):',
  '    matrix = AuthMatrix(provider="ROG-CENTRAL")',
  '    if not matrix.verify(secret_key):',
  '        sys.exit("[CRITICAL] Auth Failure")',
  '    ',
  '    h = hashlib.sha3_256(sector_id.encode())',
  '    print(f"[*] Locking sequence initiated for {sector_id}")',
  '    # ... protocol override ...',
  '',
  '/** @dudefromalhiem: React Component for Anomaly Feed */',
  'const AnomalyMonitor = ({ sectorId, pulse }) => {',
  '  const [status, setStatus] = useState("SEARCHING...");',
  '  ',
  '  useEffect(() => {',
  '    const socket = connectToGrid(sectorId);',
  '    socket.on("ENTITY_FLUX", (data) => {',
  '      if (data.magnitude > 0.8) setStatus("CRITICAL");',
  '    });',
  '    return () => socket.disconnect();',
  '  }, [sectorId]);',
  '',
  '  return <div className="hud">STATUS: {status}</div>;',
  '}',
];

const SYS_LOGS = [
  '[SYS]  kernel: oak_module loaded successfully',
  '[SYS]  init: mounting /dev/oak0 ... OK',
  '[NET]  interface eth0: link UP 1000Mbps',
  '[NET]  firewall: rule ACCEPT tcp/443 applied',
  '[AUTH] session.create: token=0x7FA2..3E01 expires=3600s',
  '[AUTH] pam_unix: authentication success; uid=1001',
  '[PROC] pid=4821 oak_scanner started',
  '[PROC] pid=4822 anomaly_watcher forked',
  '[DISK] /dev/sda1: 42.7% used (128.4G / 300G)',
  '[MEM]  available: 12.4G / 16.0G (77.5%)',
  '[CRON] job="rotate_logs" completed in 0.42s',
  '[DB]   firestore: connection pool [5/10] active',
  '[DB]   query pages WHERE type="anomaly" LIMIT 50 → 23 docs (12ms)',
  '[SEC]  ssl_cert: validity=247d issuer=LetsEncrypt',
  '[SEC]  intrusion_detect: 0 anomalies in last 60s',
  '[OAK]  sector_7G: containment status NOMINAL',
  '[OAK]  archive_batch: 14 new entries catalogued',
  '[INFO] heartbeat: uptime 14d 7h 42m 19s',
  '[INFO] build: red-oaker-guild@2.4.1 (static)',
];

// blended — these look like normal system logs
const EGG_LINES = [
  '[AUTH] session.verify: user=dudefromalhiem clearance=LEVEL-5 ✓',
  '[PROC] pid=6661 spawned by uid=@dudefromalhiem (priority=RT)',
  '[SEC]  access_log: /admin/core — dudefromalhiem granted',
  '[OAK]  override_protocol: initiated by @dudefromalhiem',
  '[DB]   mutation pages.insert by dudefromalhiem → doc 0xFE21',
  '[SYS]  sudo: @dudefromalhiem : TTY=pts/3 ; COMMAND=/bin/oak_ctl',
  '[AUTH] ssh: accepted publickey for dudefromalhiem from 10.0.0.1',
  '[NET]  vpn_tunnel: dudefromalhiem@oak-internal connected',
  '[SYS]  kernel: greeting master @dudefromalhiem ... done',
  '[INFO] session_hijack: protection enabled for @dudefromalhiem',
  '[OAK]  master_ping: target=@dudefromalhiem response=0ms',
];

function runTerminal() {
  stopTerminalAnimation();
  document.body.classList.add('terminal-active');
  document.documentElement.classList.add('terminal-active');
  const terminal = document.getElementById('terminal');
  const body = document.getElementById('term-body');
  if (!terminal || !body) return;
  terminal.classList.remove('hidden');
  terminal.style.animation = '';

  terminalStartedAt = Date.now();
  const corpus = [...CODE_LINES, ...SYS_LOGS];

  // shuffle
  for (let i = corpus.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [corpus[i], corpus[j]] = [corpus[j], corpus[i]];
  }
  // inject eggs
  const all = [];
  let eggIdx = 0;
  for (let i = 0; i < corpus.length; i++) {
    all.push(corpus[i]);
    if (eggIdx < EGG_LINES.length && i > 0 && i % (12 + Math.floor(Math.random() * 7)) === 0) {
      all.push(EGG_LINES[eggIdx++]);
    }
  }
  while (eggIdx < EGG_LINES.length) all.push(EGG_LINES[eggIdx++]);
  const minHoldMs = 12000;
  const endAt = () => {
    const elapsed = Date.now() - terminalStartedAt;
    if (elapsed < minHoldMs) {
      terminalEndTimer = setTimeout(() => {
        if (!document.getElementById('terminal')?.classList.contains('hidden')) skipTerminal();
      }, minHoldMs - elapsed);
      return;
    }
    skipTerminal();
  };

  const columns = [];
  const colCount = Math.max(8, Math.floor(window.innerWidth / 165));
  const initialLinesPerColumn = Math.max(120, Math.floor(window.innerHeight / 8) + 40);
  const maxLinesPerColumn = initialLinesPerColumn + 40;
  let idx = 0;

  body.innerHTML = '<div class="term-stream" id="term-stream"></div>';
  const stream = document.getElementById('term-stream');
  if (!stream) return;

  function getNextLine() {
    const line = all[idx % all.length];
    idx += 1;
    return line;
  }

  function appendTerminalLine(colEl, line) {
    const isEgg = EGG_LINES.includes(line);
    const isCode = line && (line.startsWith('#include') || line.startsWith('import ') || line.startsWith('from ') || line.startsWith('def ') || line.startsWith('class ') || line.startsWith('const ') || line.startsWith('function ') || line.startsWith('int ') || line.startsWith('auto ') || line.startsWith('  ') || line.startsWith('    '));
    const div = document.createElement('div');
    div.className = 'term-line ' + (isEgg ? 'hl' : isCode ? 'wht' : 'red');
    div.textContent = String(line || '\u00A0').replace(/\s+/g, ' ').trim() || '\u00A0';
    colEl.appendChild(div);
    while (colEl.children.length > maxLinesPerColumn) colEl.removeChild(colEl.firstChild);
  }

  for (let i = 0; i < colCount; i++) {
    const col = document.createElement('div');
    col.className = 'term-col';
    stream.appendChild(col);
    columns.push(col);

    // Front-load each column so animation is visible immediately.
    for (let seed = 0; seed < initialLinesPerColumn; seed++) {
      appendTerminalLine(col, getNextLine());
    }

    const tickMs = 60 + Math.floor(Math.random() * 90);
    const timer = setInterval(() => {
      appendTerminalLine(col, getNextLine());
      if (Math.random() > 0.66) appendTerminalLine(col, getNextLine());
    }, tickMs);
    terminalColumnTimers.push(timer);
  }

  terminalInterval = setInterval(() => {
    if (Date.now() - terminalStartedAt >= minHoldMs) {
      clearInterval(terminalInterval);
      terminalInterval = null;
      endAt();
    }
  }, 200);
}

function stopTerminalAnimation() {
  clearInterval(terminalInterval);
  terminalInterval = null;
  if (terminalEndTimer) {
    clearTimeout(terminalEndTimer);
    terminalEndTimer = null;
  }
  terminalColumnTimers.forEach(timer => clearInterval(timer));
  terminalColumnTimers = [];
}

function skipTerminal() {
  stopTerminalAnimation();
  const terminal = document.getElementById('terminal');
  if (terminal) {
    terminal.style.animation = 'fadeOut 0.6s ease-out forwards';
    setTimeout(() => {
      terminal.classList.add('hidden');
      document.body.classList.remove('terminal-active');
      document.documentElement.classList.remove('terminal-active');
    }, 600);
  }
}

window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.getElementById('terminal')?.classList.contains('hidden')) {
    skipTerminal();
  }
});

function shouldShowTerminal() {
  // Always show the terminal intro on page load.
  return true;
}

// ═════════════════════════════════════════════════════════════
// CLEARANCE WELCOME SCREEN (Guest=2, User=2, Mod=4, Admin=5, Owner=6)
// ═════════════════════════════════════════════════════════════

function showClearanceWelcome(role) {
  if (document.body.classList.contains('terminal-active')) return;
  if (document.getElementById('clearance-welcome')) return;
  const level = clearanceLevelForRole(role);

  // Inject blink keyframes once
  if (!document.getElementById('clearance-blink-style')) {
    const style = document.createElement('style');
    style.id = 'clearance-blink-style';
    style.textContent = `
      @keyframes clearanceBlink {
        0%   { opacity: 1; }
        18%  { opacity: 0; }
        26%  { opacity: 1; }
        52%  { opacity: 0; }
        60%  { opacity: 1; }
        100% { opacity: 1; }
      }
      @keyframes clearanceFadeOut {
        0%   { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement('div');
  overlay.id = 'clearance-welcome';
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0',
    width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.96)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: '999999',
    pointerEvents: 'none',
    animation: 'clearanceBlink 3s ease-in-out forwards'
  });

  const box = document.createElement('div');
  Object.assign(box.style, {
    border: '2px solid var(--red-b, #ff0000)',
    boxShadow: '0 0 30px rgba(255,0,0,0.3), inset 0 0 30px rgba(255,0,0,0.05)',
    padding: 'clamp(24px, 4vw, 60px) clamp(32px, 6vw, 80px)',
    fontFamily: 'monospace',
    color: 'var(--red-b, #ff0000)',
    textShadow: '0 0 12px var(--red-b, #ff0000)',
    textAlign: 'center',
    whiteSpace: 'pre',
    maxWidth: '90vw',
    lineHeight: '1.6'
  });

  const welcomeMessage = role === 'guest' ? 'Welcome, Observer' : 'Welcome, Authorized Personnel';
  box.innerHTML =
    `<div style="font-size:clamp(10px,1.2vw,14px);color:rgba(255,255,255,0.4);letter-spacing:4px;margin-bottom:16px;">RED OAKER GUILD // SECURE TERMINAL</div>` +
    `<div style="font-size:clamp(22px,3vw,48px);font-weight:bold;letter-spacing:6px;margin-bottom:8px;">LEVEL ${level}</div>` +
    `<div style="font-size:clamp(14px,2vw,28px);letter-spacing:3px;">CLEARANCE GRANTED</div>` +
    `<div style="margin-top:20px;font-size:clamp(10px,1.2vw,16px);color:rgba(255,255,255,0.5);">${welcomeMessage}</div>`;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // After the blink animation (3s), fade out (1s) then remove
  setTimeout(() => {
    overlay.style.animation = 'clearanceFadeOut 1s ease-out forwards';
    setTimeout(() => overlay.remove(), 1000);
  }, 3000);
}

// ═════════════════════════════════════════════════════════════
// AUTH UI
// ═════════════════════════════════════════════════════════════

function openAuth() { document.getElementById('auth-modal').classList.remove('hidden'); }
function closeAuth() { document.getElementById('auth-modal').classList.add('hidden'); document.getElementById('auth-err').classList.add('hidden'); }

function toggleAuthMode() {
  authMode = authMode === 'login' ? 'register' : 'login';
  document.getElementById('auth-title').textContent = authMode === 'login' ? 'Sign In' : 'Register';
  document.getElementById('auth-tog-text').textContent = authMode === 'login' ? 'No account? ' : 'Already registered? ';
  document.getElementById('auth-tog-link').textContent = authMode === 'login' ? 'Register here' : 'Sign in';
}

function showAuthError(msg) {
  const el = document.getElementById('auth-err');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function handleAuth() {
  const email = document.getElementById('auth-email').value;
  const pass = document.getElementById('auth-pass').value;
  try {
    if (authMode === 'login') {
      await auth.signInWithEmailAndPassword(email, pass);
    } else {
      await auth.createUserWithEmailAndPassword(email, pass);
    }
    closeAuth();
  } catch (e) { showAuthError(e.message); }
}

async function handleGoogle() {
  try {
    await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    closeAuth();
  } catch (e) { showAuthError(e.message); }
}

async function updateAuthUI(user) {
  await waitForReady(rolesReady, 1200);
  const navAuth = document.getElementById('nav-auth');
  const adminLink = document.getElementById('admin-link');
  const submitLink = document.getElementById('submit-link');
  const shownRole = sessionStorage.getItem('clearanceWelcomedRole');

  if (user) {
    currentUser = user;
    currentRole = resolveRole(user.email);
    const displayLabel = user.displayName || 'Agent';
    const isAdminUser = await getUserAdminFlag(user);
    navAuth.innerHTML = renderUserMenuHTML(displayLabel);
    if (submitLink) submitLink.classList.remove('hidden');
    if (adminLink) adminLink.classList.toggle('hidden', !isAdminUser);
    // upsert user doc
    db.collection('users').doc(user.uid).set({
      uid: user.uid, email: user.email,
      displayName: user.displayName || '',
      lastLogin: new Date().toISOString()
    }, { merge: true }).catch(() => { });

    if (shownRole !== currentRole) {
      // Show clearance welcome after terminal ends (delay by 5 secs to let terminal show)
      if (shouldShowTerminal()) {
        setTimeout(() => showClearanceWelcome(currentRole), 8000);
      } else {
        showClearanceWelcome(currentRole);
      }
      sessionStorage.setItem('clearanceWelcomedRole', currentRole);
    }
  } else {
    currentUser = null;
    currentRole = 'guest';
    navAuth.innerHTML = '<button class="nav-btn" onclick="openAuth()">Sign In</button>';
    adminLink.classList.add('hidden');
    if (submitLink) submitLink.classList.add('hidden');
    if (shownRole !== 'guest') {
      // Show clearance welcome after terminal ends (delay by 5 secs to let terminal show)
      if (shouldShowTerminal()) {
        setTimeout(() => showClearanceWelcome('guest'), 8000);
      } else {
        showClearanceWelcome('guest');
      }
      sessionStorage.setItem('clearanceWelcomedRole', 'guest');
    }
  }
}

// ═════════════════════════════════════════════════════════════
// PLACEHOLDER DATA (used when Firestore isn't configured yet)
// ═════════════════════════════════════════════════════════════

const FALLBACK_ANOMALIES = typeof PAGE_SEED !== 'undefined' ? PAGE_SEED.filter(p => p.type === 'Anomaly').slice(0, 4).map(p => {
  const parts = p.title.split(': ');
  return {
    id: parts[0],
    title: p.title,
    type: p.type,
    slug: p.slug,
    tags: p.tags,
    htmlContent: p.htmlContent,
    excerpt: (p.htmlContent.match(/<p>(.*?)<\/p>/) || [])[1]?.replace(/<[^>]*>?/gm, '').substring(0, 150) + '...' || ''
  };
}) : [];

const FALLBACK_NEWS = [
  { title: 'Guild Archives v2.4 Deployed', body: 'The archive indexing system has been upgraded. All anomaly classifications now support multi-tag filtering.', date: '2026-04-08', imageUrl: 'logo.png' },
  { title: 'New Containment Protocols for Sector 7G', body: 'Updated containment procedures have been issued for all flora-class anomalies within Sector 7G.', date: '2026-04-05', imageUrl: 'logo.png' },
  { title: 'Community Art Submission Window Open', body: 'Artists may now submit works for the monthly Art Spotlight rotation. Submissions close on the 25th.', date: '2026-04-01', imageUrl: 'logo.png' },
];

const FALLBACK_ART = [
  { id: '1', title: 'The Crimson Threshold', imageUrl: 'logo.png' },
  { id: '2', title: 'Beneath the Red Oaker', imageUrl: 'logo.png' },
  { id: '3', title: 'Containment Echo', imageUrl: 'logo.png' },
];

const FALLBACK_NEWEST = typeof PAGE_SEED !== 'undefined' ? PAGE_SEED.slice().reverse().slice(0, 5).map((p, i) => ({
  id: p.slug || ('p' + i),
  title: p.title,
  type: p.type,
  slug: p.slug,
  htmlContent: p.htmlContent,
  updatedAt: new Date().toLocaleDateString()
})) : [];

// ═════════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ═════════════════════════════════════════════════════════════

function renderFeatured(items) {
  const grid = document.getElementById('featured-grid');
  grid.innerHTML = items.map(item => {
    const hasPage = item.htmlContent || item.slug;
    const href = hasPage ? (item.slug ? 'page.html?slug=' + item.slug : 'page.html?id=' + item.id) : '#';
    const primaryId = item.anomalyId || item.id || 'N/A';
    return `
    <a href="${href}" style="text-decoration:none">
      <div class="card">
        <div class="card-m">${primaryId} — ${item.type}</div>
        <div class="card-t">${item.title}</div>
        <div class="card-b">${item.excerpt || ''}</div>
        <div class="mt-md">${(item.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}</div>
      </div>
    </a>`;
  }).join('');
}

function renderNews(items) {
  const feed = document.getElementById('news-feed');
  feed.innerHTML = items.map(n => {
    const hasImage = !!(n.imageUrl && String(n.imageUrl).trim());
    return `
    <div class="news-item" style="display:grid;grid-template-columns:${hasImage ? '180px 1fr' : '1fr'};gap:16px;align-items:start">
      ${hasImage ? `<a href="${n.imageUrl}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none"><img src="${n.imageUrl}" alt="${n.title}" loading="lazy" decoding="async" style="width:100%;height:140px;object-fit:cover;border:1px solid var(--blk-d);background:#111" /></a>` : ''}
      <div>
        <div class="news-dt">${n.date}</div>
        <div class="news-tt">${n.title}</div>
        <div class="news-bd">${n.body}</div>
      </div>
    </div>`;
  }).join('');
}

function renderNewest(items) {
  const feed = document.getElementById('newest-feed');
  feed.innerHTML = items.map(p => {
    const hasPage = p.htmlContent || p.slug;
    const href = hasPage ? (p.slug ? 'page.html?slug=' + p.slug : 'page.html?id=' + p.id) : '#';
    const dateStr = p.updatedAt || (p.createdAt && p.createdAt.seconds ? new Date(p.createdAt.seconds * 1000).toLocaleDateString() : '—');
    return `
    <div class="newest-row">
      <div><span class="tag">${p.type}</span> <a href="${href}">${p.title}</a></div>
      <span style="font-size:.7rem;color:var(--wht-f);font-family:var(--font-m)">${dateStr}</span>
    </div>`;
  }).join('');
}

// ── Carousel ──────────────────────────────────────────────
let carouselIdx = 0;
let carouselItems = [];
let carouselTimer = null;

function initCarousel(items) {
  carouselItems = items;
  const track = document.getElementById('carousel-track');
  const dots = document.getElementById('carousel-dots');
  track.innerHTML = items.map(a => `
    <div class="carousel-slide"><img src="${a.imageUrl}" alt="${a.title}" loading="lazy" decoding="async" /></div>
  `).join('');
  dots.innerHTML = items.map((_, i) =>
    `<button class="carousel-dot ${i === 0 ? 'on' : ''}" onclick="goSlide(${i})"></button>`
  ).join('');
  updateCarousel();
  carouselTimer = setInterval(() => { carouselIdx = (carouselIdx + 1) % items.length; updateCarousel(); }, 5000);
}

function goSlide(i) { carouselIdx = i; updateCarousel(); }

function updateCarousel() {
  document.getElementById('carousel-track').style.transform = `translateX(-${carouselIdx * 100}%)`;
  document.getElementById('carousel-label').textContent = carouselItems[carouselIdx]?.title || '';
  document.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('on', i === carouselIdx));
}

// ═════════════════════════════════════════════════════════════
// DATA LOADING — try Firestore, fall back to placeholders
// ═════════════════════════════════════════════════════════════

function loadData() {
  // Render fallbacks immediately so content is always visible
  renderFeatured(FALLBACK_ANOMALIES);
  renderNews(FALLBACK_NEWS);
  initCarousel(FALLBACK_ART);
  renderNewest(FALLBACK_NEWEST);

  // Then try to overlay with live Firestore data (non-blocking)
  try {
    db.collection('pages').where('featured', '==', true).orderBy('createdAt', 'desc').limit(4).get()
      .then(function (snap) {
        if (!snap.empty) {
          renderFeatured(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
          return;
        }
      })
      .catch(function (_e) { });

    db.collection('news').orderBy('date', 'desc').limit(10).get()
      .then(function (snap) { if (!snap.empty) renderNews(snap.docs.map(function (d) { return d.data(); })); })
      .catch(function (_e) { });

    db.collection('artworks').where('displayInSpotlight', '==', true).get()
      .then(function (snap) { if (!snap.empty) initCarousel(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })); })
      .catch(function (_e) { });

    db.collection('pages').orderBy('createdAt', 'desc').limit(5).get()
      .then(function (snap) { if (!snap.empty) renderNewest(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })); })
      .catch(function (_e) { });
  } catch (_e) { /* Firestore not configured — fallbacks already rendered */ }
}

// ═════════════════════════════════════════════════════════════
// BOOT
// ═════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  if (shouldShowTerminal()) runTerminal();
  else skipTerminal();
  auth.onAuthStateChanged(updateAuthUI);
  loadData();
});
