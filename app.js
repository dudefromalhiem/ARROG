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

// ═════════════════════════════════════════════════════════════
// TERMINAL EASTER EGG
// ═════════════════════════════════════════════════════════════

const CODE_LINES = [
  '#include <iostream>',
  '#include <vector>',
  '#include <algorithm>',
  'using namespace std;',
  'int main(int argc, char* argv[]) {',
  '    vector<int> data = {3, 1, 4, 1, 5, 9, 2, 6};',
  '    sort(data.begin(), data.end());',
  '    for (auto& v : data) cout << v << " ";',
  '    unordered_map<string, int> registry;',
  '    registry["node_alpha"] = 0x4F2A;',
  '    if (registry.find("node_gamma") == registry.end()) {',
  '        cerr << "WARN: node_gamma not in registry" << endl;',
  '    }',
  '    return 0;',
  '}',
  '',
  'import os, sys, hashlib, json',
  'from datetime import datetime, timezone',
  '',
  'def compute_checksum(fp: str) -> str:',
  '    h = hashlib.sha256()',
  '    with open(fp, "rb") as f:',
  '        for chunk in iter(lambda: f.read(8192), b""):',
  '            h.update(chunk)',
  '    return h.hexdigest()',
  '',
  'class AnomalyScanner:',
  '    def __init__(self, db_path="/var/oak/anomalies.db"):',
  '        self.db_path = db_path',
  '        self.active_scans = []',
  '',
  '    def initiate_scan(self, sector_id):',
  '        ts = datetime.now(timezone.utc).isoformat()',
  '        self.active_scans.append({"sector": sector_id, "ts": ts})',
  '        return {"status": "SCANNING", "sector": sector_id}',
  '',
  "import React, { useState, useEffect } from 'react';",
  '',
  'function DataGrid({ endpoint, auth }) {',
  '  const [rows, setRows] = useState([]);',
  '  useEffect(() => {',
  '    fetch(endpoint, { headers: { Authorization: auth } })',
  '      .then(r => r.json())',
  '      .then(data => setRows(data.items));',
  '  }, [endpoint, auth]);',
  '  return <table>{rows.map(r => <Row key={r.id} data={r} />)}</table>;',
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
  '[PROC] pid=6661 spawned by uid=dudefromalhiem (priority=RT)',
  '[SEC]  access_log: /admin/core — dudefromalhiem granted',
  '[OAK]  override_protocol: initiated by dudefromalhiem',
  '[DB]   mutation pages.insert by dudefromalhiem → doc 0xFE21',
  '[SYS]  sudo: dudefromalhiem : TTY=pts/3 ; COMMAND=/bin/oak_ctl',
  '[AUTH] ssh: accepted publickey for dudefromalhiem from 10.0.0.1',
  '[NET]  vpn_tunnel: dudefromalhiem@oak-internal connected',
];

function runTerminal() {
  const body = document.getElementById('term-body');
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

  let idx = 0;
  terminalInterval = setInterval(() => {
    if (idx >= all.length) { skipTerminal(); return; }
    const line = all[idx];
    const isEgg = EGG_LINES.includes(line);
    const isCode = line && (line.startsWith('#include') || line.startsWith('import ') || line.startsWith('from ') || line.startsWith('def ') || line.startsWith('class ') || line.startsWith('function ') || line.startsWith('  '));
    const div = document.createElement('div');
    div.className = 'term-line ' + (isEgg ? 'hl' : isCode ? 'wht' : 'red');
    div.textContent = line || '\u00A0';
    body.appendChild(div);
    // keep only last 80 lines
    while (body.children.length > 80) body.removeChild(body.firstChild);
    body.scrollTop = body.scrollHeight;
    idx++;
  }, 65);
}

function skipTerminal() {
  clearInterval(terminalInterval);
  document.getElementById('terminal').classList.add('hidden');
}

// ═════════════════════════════════════════════════════════════
// CLEARANCE WELCOME SCREEN (Owner = Level 5, Admin = Level 4)
// ═════════════════════════════════════════════════════════════

function showClearanceWelcome(role) {
  if (document.getElementById('clearance-welcome')) return;
  const level = role === 'owner' ? 5 : 4;

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

  box.innerHTML =
    `<div style="font-size:clamp(10px,1.2vw,14px);color:rgba(255,255,255,0.4);letter-spacing:4px;margin-bottom:16px;">RED OAKER GUILD // SECURE TERMINAL</div>` +
    `<div style="font-size:clamp(22px,3vw,48px);font-weight:bold;letter-spacing:6px;margin-bottom:8px;">LEVEL ${level}</div>` +
    `<div style="font-size:clamp(14px,2vw,28px);letter-spacing:3px;">CLEARANCE GRANTED</div>` +
    `<div style="margin-top:20px;font-size:clamp(10px,1.2vw,16px);color:rgba(255,255,255,0.5);">Welcome, Oaker</div>`;

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
  await rolesReady;
  const navAuth = document.getElementById('nav-auth');
  const adminLink = document.getElementById('admin-link');
  const submitLink = document.getElementById('submit-link');
  if (user) {
    currentUser = user;
    currentRole = resolveRole(user.email);
    const displayLabel = user.displayName || 'Agent';
    navAuth.innerHTML = '<button class="nav-btn" onclick="auth.signOut()">' + displayLabel + ' (Sign Out)</button>';
    if (submitLink) submitLink.classList.remove('hidden');
    if (isAdmin(user.email)) adminLink.classList.remove('hidden');
    else adminLink.classList.add('hidden');
    // upsert user doc
    db.collection('users').doc(user.uid).set({
      uid: user.uid, email: user.email,
      displayName: user.displayName || '',
      role: currentRole, lastLogin: new Date().toISOString()
    }, { merge: true }).catch(() => { });

    // Show clearance welcome for owner/admin if not shown yet this session
    if ((currentRole === 'owner' || currentRole === 'admin') && !sessionStorage.getItem('clearanceWelcomed')) {
      showClearanceWelcome(currentRole);
      sessionStorage.setItem('clearanceWelcomed', 'true');
    }
  } else {
    currentUser = null;
    currentRole = 'user';
    navAuth.innerHTML = '<button class="nav-btn" onclick="openAuth()">Sign In</button>';
    adminLink.classList.add('hidden');
    if (submitLink) submitLink.classList.add('hidden');
  }
}

// ═════════════════════════════════════════════════════════════
// PLACEHOLDER DATA (used when Firestore isn't configured yet)
// ═════════════════════════════════════════════════════════════

const FALLBACK_ANOMALIES = [
  { id: 'ROG-001', title: 'The Wandering Oak', type: 'Anomaly', tags: ['flora', 'mobile', 'keter'], excerpt: 'A sentient oak tree that relocates itself every lunar cycle, leaving behind calcified root networks.' },
  { id: 'ROG-002', title: 'The Crimson Log', type: 'Anomaly', tags: ['object', 'safe', 'biological'], excerpt: 'A section of fallen timber that hemorrhages a blood-analogue fluid when exposed to frequencies above 18kHz.' },
  { id: 'ROG-003', title: 'Millipede Protocol', type: 'Anomaly', tags: ['entity', 'euclid', 'arthropod'], excerpt: 'An anomalous species of centipede exhibiting collective intelligence and rudimentary tool usage in Sector 7G.' },
  { id: 'ROG-004', title: 'The Flat Cap Specter', type: 'Anomaly', tags: ['humanoid', 'euclid', 'spectral'], excerpt: 'A recurring apparition of a man wearing a flat cap, manifesting near sites of botanical anomaly activity.' },
];

const FALLBACK_NEWS = [
  { title: 'Guild Archives v2.4 Deployed', body: 'The archive indexing system has been upgraded. All anomaly classifications now support multi-tag filtering.', date: '2026-04-08' },
  { title: 'New Containment Protocols for Sector 7G', body: 'Updated containment procedures have been issued for all flora-class anomalies within Sector 7G.', date: '2026-04-05' },
  { title: 'Community Art Submission Window Open', body: 'Artists may now submit works for the monthly Art Spotlight rotation. Submissions close on the 25th.', date: '2026-04-01' },
];

const FALLBACK_ART = [
  { id: '1', title: 'The Crimson Threshold', imageUrl: 'logo.png' },
  { id: '2', title: 'Beneath the Red Oaker', imageUrl: 'logo.png' },
  { id: '3', title: 'Containment Echo', imageUrl: 'logo.png' },
];

const FALLBACK_NEWEST = [
  { id: 'p1', title: 'ROG-005: The Hollow Stump', type: 'Anomaly', updatedAt: '2026-04-10' },
  { id: 'p2', title: 'Tale: The Man Who Planted Shadows', type: 'Tale', updatedAt: '2026-04-09' },
  { id: 'p3', title: 'ROG-006: Ring Rot Phenomenon', type: 'Anomaly', updatedAt: '2026-04-09' },
  { id: 'p4', title: 'Tale: Under the Canopy', type: 'Tale', updatedAt: '2026-04-08' },
  { id: 'p5', title: 'Artwork: Roots of Red', type: 'Artwork', updatedAt: '2026-04-08' },
];

// ═════════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ═════════════════════════════════════════════════════════════

function renderFeatured(items) {
  const grid = document.getElementById('featured-grid');
  grid.innerHTML = items.map(item => {
    const hasPage = item.htmlContent;
    const href = hasPage ? (item.slug ? 'pages/' + item.slug : 'page.html?id=' + item.id) : '#';
    return `
    <a href="${href}" style="text-decoration:none">
      <div class="card">
        <div class="card-m">${item.id} — ${item.type}</div>
        <div class="card-t">${item.title}</div>
        <div class="card-b">${item.excerpt || ''}</div>
        <div class="mt-md">${(item.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}</div>
      </div>
    </a>`;
  }).join('');
}

function renderNews(items) {
  const feed = document.getElementById('news-feed');
  feed.innerHTML = items.map(n => `
    <div class="news-item">
      <div class="news-dt">${n.date}</div>
      <div class="news-tt">${n.title}</div>
      <div class="news-bd">${n.body}</div>
    </div>
  `).join('');
}

function renderNewest(items) {
  const feed = document.getElementById('newest-feed');
  feed.innerHTML = items.map(p => {
    const hasPage = p.htmlContent;
    const href = hasPage ? (p.slug ? 'pages/' + p.slug : 'page.html?id=' + p.id) : '#';
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
    <div class="carousel-slide"><img src="${a.imageUrl}" alt="${a.title}" /></div>
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
    db.collection('pages').where('type', '==', 'Anomaly').orderBy('createdAt', 'desc').limit(4).get()
      .then(function (snap) { if (!snap.empty) renderFeatured(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })); })
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
  runTerminal();
  auth.onAuthStateChanged(updateAuthUI);
  loadData();
});
