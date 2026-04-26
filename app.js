/* ═══════════════════════════════════════════════════════════════
 *  RED OAKER GUILD — APP.JS
 *  All client-side logic: terminal, auth, carousel, data feeds
 *  Runs on GitHub Pages — no build step required
 * ═══════════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────
let currentUser = null;
let currentRole = "user";
let terminalInterval = null;
let terminalStartedAt = 0;
let terminalEndTimer = null;
let terminalRafId = null;
let clearanceWelcomeShownThisLoad = false;

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
  '',
  'namespace rog::archive {',
  '  struct ClearanceMap {',
  '    int owner = 6;',
  '    int admin = 5;',
  '    int mod = 4;',
  '    int user = 2;',
  '  };',
  '',
  '  bool verify_signature(const string& payload, const string& sig) {',
  '    return crypto::ed25519::verify(payload, sig, KEYRING.primary());',
  '  }',
  '}',
  '',
  'async function hydratePanels(api) {',
  '  const [pages, queue, art] = await Promise.all([',
  '    api.get("/pages/featured"),',
  '    api.get("/submissions/pending"),',
  '    api.get("/artworks/spotlight")',
  '  ]);',
  '  ui.paint("featured", pages);',
  '  ui.paint("queue", queue);',
  '  ui.paint("spotlight", art);',
  '}',
  '',
  'SELECT id, title, type FROM pages',
  'WHERE status = "approved"',
  'ORDER BY createdAt DESC LIMIT 10;',
  '',
  'fn recompute_vector_field(grid: &mut Grid) {',
  '  for cell in grid.iter_mut() {',
  '    cell.flux = (cell.variance * 0.618) + cell.drift;',
  '    cell.safe = cell.flux < THRESHOLD;',
  '  }',
  '}',
  '',
  'const archiveDigest = await api.fetch(`/archive/manifest?scope=featured,registry,artworks,news,stats&lang=en-US&tz=UTC&render=compact&signature=${sessionToken.slice(0,16)}`);',
  'const permissionVector = ["owner","admin","mod","user"].map(role => ({ role, level: clearanceTable[role], canWrite: acl.can(role, "pages.write"), canReview: acl.can(role, "submissions.review"), canPurge: acl.can(role, "records.delete") }));',
  'const normalizedPayload = JSON.stringify(payload).replace(/\\s+/g, " ").trim().slice(0, 2048) + " :: checksum=" + crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));',
  'db.collection("pages").where("status","==","approved").where("type","in",["Anomaly","Tale","Artwork","Guide"]).orderBy("createdAt","desc").limit(25).get();',
  'router.push(`/page.html?slug=${encodeURIComponent(entry.slug)}&from=registry&compartment=${encodeURIComponent(entry.type)}&clearance=${encodeURIComponent(String(clearance))}`);',
  'logger.info("stream.sync", { channel: "guild-core", latencyMs: perf.now() - startedAt, retries, cacheHit, viewport: `${window.innerWidth}x${window.innerHeight}`, device: navigator.userAgent });',
  'if (Array.isArray(records) && records.length > 0 && records.every(r => r && typeof r === "object" && r.status === "approved")) ui.renderRows(records.map(r => ({ id: r.id, title: r.title, tags: r.tags?.join(", ") || "none", updated: formatDate(r.updatedAt) })));',
  'SELECT id, slug, title, type, status, createdAt, updatedAt FROM pages WHERE status = "approved" AND type IN ("Anomaly","Tale","Artwork","Guide") ORDER BY createdAt DESC, updatedAt DESC LIMIT 50;',
  'fn validate_request(req: &Request, keyring: &Keyring) -> Result<Session, AuthError> { let token = req.headers.get("Authorization").ok_or(AuthError::MissingToken)?; let session = keyring.verify_and_decode(token)?; if session.expired() || session.clearance < 2 { return Err(AuthError::InsufficientClearance); } Ok(session) }',
  'const graph = registry.nodes.reduce((acc, node) => ({ ...acc, [node.id]: { links: node.links || [], state: node.state || "idle", checksum: hash(node.id + JSON.stringify(node.links || [])) } }), {});',
  'await Promise.all(Object.keys(graph).map(id => transport.publish(`rog/sync/${id}`, { ts: Date.now(), payload: graph[id], actor: session.user, clearance, traceId })));',
  'for (const packet of packets.filter(p => p && p.scope === "archive" && p.integrity === "ok" && p.latencyMs < 300)) { dispatcher.enqueue(packet.topic, packet.body, { priority: packet.priority || 3, retries: 2 }); }',
  'const viewModel = records.map((r, idx) => ({ index: idx + 1, slug: r.slug, title: r.title, compartment: r.type, tags: (r.tags || []).slice(0, 6), created: formatDate(r.createdAt), updated: formatDate(r.updatedAt), status: r.status }));',
  'if (telemetry.errorRate > 0.015 || telemetry.p95 > 420 || telemetry.dropCount > 2) notifier.raise("DEGRADED_CHANNEL", { p95: telemetry.p95, errorRate: telemetry.errorRate, dropCount: telemetry.dropCount, service: "guild-core" });',
  'db.collection("submissions").where("status","in",["pending","approved"]).orderBy("updatedAt","desc").limit(40).get().then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));',
  'const rollbackPlan = snapshots.slice(-5).map(s => ({ id: s.id, createdAt: s.createdAt, hash: s.hash, reason: s.reason || "routine", canRestore: s.integrity === "verified" && s.locked !== true }));',
  'pipeline.use(async (ctx, next) => { ctx.meta.requestId = crypto.randomUUID(); ctx.meta.startedAt = performance.now(); await next(); ctx.meta.durationMs = Number((performance.now() - ctx.meta.startedAt).toFixed(2)); audit.write(ctx.meta); });',
  'let reconcilePass = 0; while (reconcilePass < 3 && driftIndex > 0.03) { driftIndex = await reconciler.run({ sector: "7G", mode: "adaptive", pressure: 0.42 + reconcilePass * 0.08, traceId, dryRun: false }); reconcilePass++; }',
  'INSERT INTO audit_log (actor, action, target, metadata, created_at) VALUES ("system", "STREAM_SYNC", "registry", JSON_OBJECT("traceId", ?, "records", ?, "latencyMs", ?), CURRENT_TIMESTAMP);',
  'const signedRoute = `/page.html?slug=${encodeURIComponent(item.slug)}&trace=${encodeURIComponent(traceId)}&sig=${encodeURIComponent(await signer.sign(item.slug + traceId + String(clearance)))}`;',
  'fn hydrate_registry(cache: &mut Cache, entries: Vec<Entry>) -> Result<(), String> { for e in entries.into_iter().filter(|x| x.approval_status == "approved") { cache.upsert(e.slug.clone(), e); } Ok(()) }',
  'const merged = [...featured, ...newest, ...spotlight].filter(Boolean).reduce((m, row) => m.set(row.id || row.slug, row), new Map()); const ordered = [...merged.values()].sort((a, b) => +new Date(b.updatedAt || 0) - +new Date(a.updatedAt || 0));',
  'await storage.ref(`artworks/${session.user}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`).put(file, { cacheControl: "public,max-age=31536000,immutable", contentType: file.type || "application/octet-stream" });',
  'if (Object.keys(rules).length && rules["esd.lock"] === true && !["owner","admin","mod"].includes(role)) throw new Error("ESD lock active: elevated account required for archive access path /registry");',
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
  const minHoldMs = 4200;
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

  const isPhoneViewport = window.innerWidth <= 768;
  terminal.classList.toggle('mobile', isPhoneViewport);
  const initialLines = isPhoneViewport
    ? Math.max(14, Math.floor(window.innerHeight / 16))
    : Math.max(20, Math.floor(window.innerHeight / 12));
  const maxLines = initialLines + (isPhoneViewport ? 24 : 56);
  let idx = 0;
  let frameCounter = 0;
  let lastTickAt = performance.now();

  body.innerHTML = '<div class="term-stream"><div class="term-code" id="term-code"></div></div>';
  const stream = document.getElementById('term-code');
  if (!stream) return;

  const appendTerminalLine = line => {
    const isEgg = EGG_LINES.includes(line);
    const isCode = line && (line.startsWith('#include') || line.startsWith('import ') || line.startsWith('from ') || line.startsWith('def ') || line.startsWith('class ') || line.startsWith('const ') || line.startsWith('function ') || line.startsWith('int ') || line.startsWith('auto ') || line.startsWith('  ') || line.startsWith('    '));
    const row = document.createElement('div');
    row.className = 'term-row ' + (isEgg ? 'hl' : isCode ? 'wht' : 'red');
    row.textContent = String(line || '\u00A0').replace(/\s+/g, ' ').trim() || '\u00A0';
    if (isPhoneViewport) {
      row.style.animation = 'none';
      row.style.opacity = '1';
      row.style.transform = 'none';
      row.style.filter = 'none';
    }
    stream.appendChild(row);
    while (stream.children.length > maxLines) stream.removeChild(stream.firstChild);
    if (isPhoneViewport) {
      body.scrollTop = body.scrollHeight;
    }
  };

  const getNextLine = () => {
    const line = all[idx % all.length];
    idx += 1;
    return line;
  };

  appendTerminalLine('[BOOT] initializing secure terminal...');
  for (let seed = 0; seed < initialLines; seed++) appendTerminalLine(getNextLine());
  if (isPhoneViewport) {
    body.scrollTop = body.scrollHeight;
  }

  const tickEveryMs = isPhoneViewport ? 72 : 54;
  const pump = now => {
    if (Date.now() - terminalStartedAt >= minHoldMs) {
      terminalRafId = null;
      endAt();
      return;
    }

    if (now - lastTickAt >= tickEveryMs) {
      appendTerminalLine(getNextLine());
      if (!isPhoneViewport && frameCounter % 3 === 0) appendTerminalLine(getNextLine());
      frameCounter += 1;
      lastTickAt = now;
    }

    terminalRafId = requestAnimationFrame(pump);
  };

  terminalRafId = requestAnimationFrame(pump);
}

function stopTerminalAnimation() {
  clearInterval(terminalInterval);
  terminalInterval = null;
  if (terminalRafId) {
    cancelAnimationFrame(terminalRafId);
    terminalRafId = null;
  }
  if (terminalEndTimer) {
    clearTimeout(terminalEndTimer);
    terminalEndTimer = null;
  }
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

window.skipTerminal = skipTerminal;

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

function showClearanceWelcomeWhenReady(role) {
  const maxWaitMs = 18000;
  const startedAt = Date.now();

  const tryShow = () => {
    const terminalActive = document.body.classList.contains('terminal-active');
    const terminalVisible = !document.getElementById('terminal')?.classList.contains('hidden');
    if (!terminalActive && !terminalVisible) {
      showClearanceWelcome(role);
      return;
    }
    if (Date.now() - startedAt >= maxWaitMs) {
      // Force-close a stuck intro so the clearance flash can still display.
      skipTerminal();
      setTimeout(() => showClearanceWelcome(role), 80);
      return;
    }
    setTimeout(tryShow, 250);
  };

  tryShow();
}

// Authentication UI handlers have been moved to firebase-config.js for universal availability.

async function updateAuthUI(user) {
  await rolesReady;
  const navAuth = document.getElementById('nav-auth');
  const adminLink = document.getElementById('admin-link');
  const submitLink = document.getElementById('submit-link');
    const messagingLink = document.getElementById('messaging-link');
  const exitEsdButton = user && isOwner(user.email) && SITE_STATE && SITE_STATE.esdLocked
    ? ' <button class="nav-btn" type="button" onclick="updateESDState(false)">Exit ESD</button>'
    : '';

  if (user) {
    currentUser = user;
    currentRole = resolveRole(user.email);
    const displayLabel = user.displayName || 'Agent';
    const isAdminUser = await getUserAdminFlag(user);
    navAuth.innerHTML = renderUserMenuHTML(displayLabel) + exitEsdButton;
    if (submitLink) submitLink.classList.remove('hidden');
    if (messagingLink) messagingLink.classList.remove('hidden');
    if (document.getElementById('footer-submit-link')) document.getElementById('footer-submit-link').classList.remove('hidden');
    if (document.getElementById('footer-messaging-link')) document.getElementById('footer-messaging-link').classList.remove('hidden');
    if (isAdminUser) {
      if (!adminLink) {
        const nav = document.getElementById('nav');
        const authLi = document.getElementById('nav-auth');
        if (nav && authLi) {
          const li = document.createElement('li');
          li.id = 'admin-link';
          li.innerHTML = '<a href="admin.html">Admin</a>';
          nav.insertBefore(li, authLi);
        }
      } else {
        adminLink.classList.remove('hidden');
      }
    } else if (adminLink) {
      adminLink.remove();
    }
    // upsert user doc
    db.collection('users').doc(user.uid).set({
      uid: user.uid, email: user.email,
      displayName: user.displayName || '',
      lastLogin: new Date().toISOString()
    }, { merge: true }).catch(() => { });

    if (!clearanceWelcomeShownThisLoad) {
      // Wait for the terminal intro to finish so the welcome is not skipped.
      if (shouldShowTerminal()) {
        showClearanceWelcomeWhenReady(currentRole);
      } else {
        showClearanceWelcome(currentRole);
      }
      clearanceWelcomeShownThisLoad = true;
    }
  } else {
    currentUser = null;
    currentRole = 'guest';
    navAuth.innerHTML = '<button class="nav-btn" onclick="openAuth()">Sign In</button>';
    if (adminLink) adminLink.remove();
    if (submitLink) submitLink.classList.add('hidden');
    if (messagingLink) messagingLink.classList.add('hidden');
    if (document.getElementById('footer-submit-link')) document.getElementById('footer-submit-link').classList.add('hidden');
    if (document.getElementById('footer-messaging-link')) document.getElementById('footer-messaging-link').classList.add('hidden');
    if (!clearanceWelcomeShownThisLoad) {
      // Wait for the terminal intro to finish so the welcome is not skipped.
      if (shouldShowTerminal()) {
        showClearanceWelcomeWhenReady('guest');
      } else {
        showClearanceWelcome('guest');
      }
      clearanceWelcomeShownThisLoad = true;
    }
  }
}

// ═════════════════════════════════════════════════════════════
// CACHING UTILS
// ═════════════════════════════════════════════════════════════
const HOME_CACHE_PREFIX = 'rog.home.cache.';
const HOME_CACHE_TTL_MS = 3 * 60 * 1000;

function getCachedHomeData(key) {
  try {
    const raw = sessionStorage.getItem(HOME_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.ts || (Date.now() - parsed.ts) > HOME_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch (_err) {
    return null;
  }
}

function setCachedHomeData(key, data) {
  try {
    sessionStorage.setItem(HOME_CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data: data }));
  } catch (_err) { }
}

// ═════════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ═════════════════════════════════════════════════════════════

function renderFeatured(items, isError = false) {
  const grid = document.getElementById('featured-grid');
  if (!grid) return;

  if (isError) {
    grid.innerHTML = '<div class="card" style="padding:20px;text-align:center;color:var(--red-b);grid-column:1/-1">Failed to fetch featured pages.</div>';
    return;
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    grid.innerHTML = '<div class="card" style="padding:20px;text-align:center;color:var(--wht-d);grid-column:1/-1">No featured pages available.</div>';
    return;
  }
  grid.innerHTML = items.map(item => {
    const hasPage = item.htmlContent || item.slug;
    const href = hasPage
      ? (item.slug ? 'page.html?slug=' + encodeURIComponent(String(item.slug || '')) : 'page.html?id=' + encodeURIComponent(String(item.id || '')))
      : '#';
    const primaryId = escapeHtmlApp(item.anomalyId || item.id || 'N/A');
    const type = escapeHtmlApp(item.type || 'Page');
    const title = escapeHtmlApp(item.title || 'Untitled');
    const excerpt = escapeHtmlApp(item.excerpt || '');
    return `
    <a href="${href}" style="text-decoration:none">
      <div class="card">
        <div class="card-m">${primaryId} — ${type}</div>
        <div class="card-t">${title}</div>
        <div class="card-b">${excerpt}</div>
        <div class="mt-md">${(item.tags || []).map(t => `<span class="tag">${escapeHtmlApp(t)}</span>`).join('')}</div>
      </div>
    </a>`;
  }).join('');
}

function sanitizeAssetUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || /^\//.test(raw) || /^[a-z0-9._\-/]+$/i.test(raw)) return raw;
  return '';
}

function normalizeAssetKey(url) {
  const clean = sanitizeAssetUrl(url);
  if (!clean) return '';
  try {
    const u = new URL(clean, window.location.origin);
    return (u.origin + u.pathname).toLowerCase();
  } catch (_err) {
    return clean.toLowerCase().split('?')[0].split('#')[0];
  }
}

function buildArtworkPageLinkMap(pageRows) {
  const map = new Map();
  (pageRows || []).forEach(page => {
    const slug = String(page && page.slug ? page.slug : '').trim();
    if (!slug) return;
    const imageUrls = [];
    if (Array.isArray(page.imageUrls)) imageUrls.push(...page.imageUrls);
    if (Array.isArray(page.imageAssets)) {
      page.imageAssets.forEach(asset => {
        if (asset && asset.url) imageUrls.push(asset.url);
      });
    }
    imageUrls.forEach(url => {
      const key = normalizeAssetKey(url);
      if (key && !map.has(key)) map.set(key, slug);
    });
  });
  return map;
}

function attachArtworkLinks(artRows, pageRows) {
  const byImage = buildArtworkPageLinkMap(pageRows);
  return (artRows || []).map(row => {
    const existingSlug = String(row && row.slug ? row.slug : '').trim();
    const existingPageUrl = String(row && row.pageUrl ? row.pageUrl : '').trim();
    if (existingSlug || existingPageUrl) return row;
    const key = normalizeAssetKey(row && row.imageUrl);
    if (!key) return row;
    const slug = byImage.get(key);
    return slug ? Object.assign({}, row, { slug: slug, pageUrl: 'page.html?slug=' + encodeURIComponent(slug) }) : row;
  });
}

function renderNews(items, isError = false) {
  const feed = document.getElementById('news-feed');
  if (!feed) return;

  if (isError) {
    feed.innerHTML = '<div style="padding:10px;color:var(--red-b)">Failed to fetch latest news.</div>';
    return;
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    feed.innerHTML = '<div style="padding:10px;color:var(--wht-d)">No recent news updates.</div>';
    return;
  }
  feed.innerHTML = items.map(n => {
    const imageUrl = sanitizeAssetUrl(n.imageUrl);
    const hasImage = !!imageUrl;
    const title = escapeHtmlApp(n.title || '');
    const body = escapeHtmlApp(n.body || '');
    const date = escapeHtmlApp(n.date || '');
    return `
    <div class="news-item" style="display:grid;grid-template-columns:${hasImage ? '180px 1fr' : '1fr'};gap:16px;align-items:start">
      ${hasImage ? `<a href="${imageUrl}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none"><img src="${imageUrl}" alt="${title}" loading="lazy" decoding="async" style="width:100%;height:140px;object-fit:cover;border:1px solid var(--blk-d);background:#111" /></a>` : ''}
      <div>
        <div class="news-dt">${date}</div>
        <div class="news-tt">${title}</div>
        <div class="news-bd">${body}</div>
      </div>
    </div>`;
  }).join('');
}

function escapeHtmlApp(value) {
  const text = String(value == null ? '' : value);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value) {
  if (!value) return '—';
  if (typeof value === 'string' || typeof value === 'number') {
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    const dt = new Date(value.seconds * 1000);
    return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return '—';
}

function renderAdminRoster(items) {
  const grid = document.getElementById('admin-roster-grid');
  if (!grid) return;
  if (!Array.isArray(items) || !items.length) {
    grid.innerHTML = '<div class="card"><div class="card-t">No public roster available</div><div class="card-b">The current administration list could not be loaded.</div></div>';
    return;
  }

  grid.innerHTML = items.map(item => {
    const name = escapeHtmlApp(item.displayName || 'Agent');
    const role = escapeHtmlApp(item.role || 'Authority');
    const date = formatDateTime(item.appointedAt);
    const uid = encodeURIComponent(String(item.uid || ''));
    const encodedName = encodeURIComponent(String(item.displayName || 'Agent'));
    return `
    <div class="card">
      <div class="card-t">${name}</div>
      <div class="card-m">${role}</div>
      <div class="card-b">Appointed ${date}</div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn btn-s" type="button" onclick="openDirectMessage('${uid}', '${encodedName}')">Message Admin</button>
      </div>
    </div>`;
  }).join('');
}

function renderNewest(items, isError = false) {
  const feed = document.getElementById('newest-feed');
  if (!feed) return;

  if (isError) {
    feed.innerHTML = '<div style="padding:10px;color:var(--red-b)">Failed to fetch newest archives.</div>';
    return;
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    feed.innerHTML = '<div style="padding:10px;color:var(--wht-d)">No new archives detected.</div>';
    return;
  }
  feed.innerHTML = items.map(p => {
    const hasPage = !!(p && (p.htmlContent || p.slug || p.id));
    const href = hasPage
      ? (p.slug ? 'page.html?slug=' + encodeURIComponent(String(p.slug)) : 'page.html?id=' + encodeURIComponent(String(p.id || '')))
      : '#';
    const type = escapeHtmlApp(p.type || 'Page');
    const title = escapeHtmlApp(p.title || 'Untitled');
    const dateStr = formatDateTime(p.updatedAt || p.createdAt);
    return `
    <div class="newest-row">
      <div><span class="tag">${type}</span> <a href="${href}">${title}</a></div>
      <span style="font-size:.7rem;color:var(--wht-f);font-family:var(--font-m)">${dateStr}</span>
    </div>`;
  }).join('');
}

// ── Carousel ──────────────────────────────────────────────
let carouselIdx = 0;
let carouselItems = [];
let carouselTimer = null;

function initCarousel(items, isError = false) {
  const track = document.getElementById('carousel-track');
  const dots = document.getElementById('carousel-dots');
  const label = document.getElementById('carousel-label');
  const btnPrev = document.getElementById('carousel-prev');
  const btnNext = document.getElementById('carousel-next');
  if (!track) return;

  if (isError) {
    track.innerHTML = '<div style="padding:40px;text-align:center;color:var(--red-b);width:100%">Failed to fetch art spotlight.</div>';
    if (dots) dots.innerHTML = '';
    if (label) label.textContent = '';
    return;
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    track.innerHTML = '<div style="padding:40px;text-align:center;color:var(--wht-d);width:100%">No spotlight art available.</div>';
    if (dots) dots.innerHTML = '';
    if (label) label.textContent = '';
    return;
  }

  carouselItems = items;
  resetCarouselTimer();

  track.innerHTML = items.map(a => {
    const href = a.slug ? 'page.html?slug=' + encodeURIComponent(a.slug) : (a.pageUrl || '#');
    return `<div class="carousel-slide"><a href="${href}"><img src="${a.imageUrl}" alt="${a.title}" loading="lazy" decoding="async" /></a></div>`;
  }).join('');

  if (dots) {
    dots.innerHTML = items.map((_, i) =>
      `<button class="carousel-dot ${i === 0 ? 'on' : ''}" onclick="goSlide(${i})"></button>`
    ).join('');
  }

  if (btnPrev) btnPrev.onclick = () => goPrev();
  if (btnNext) btnNext.onclick = () => goNext();

  updateCarousel();
}

function resetCarouselTimer() {
  if (carouselTimer) clearInterval(carouselTimer);
  if (carouselItems.length > 1) {
    carouselTimer = setInterval(() => {
      carouselIdx = (carouselIdx + 1) % carouselItems.length;
      updateCarousel();
    }, 8000);
  }
}

function goNext() {
  carouselIdx = (carouselIdx + 1) % carouselItems.length;
  updateCarousel();
  resetCarouselTimer();
}

function goPrev() {
  carouselIdx = (carouselIdx - 1 + carouselItems.length) % carouselItems.length;
  updateCarousel();
  resetCarouselTimer();
}

function goSlide(i) {
  carouselIdx = i;
  updateCarousel();
  resetCarouselTimer();
}

function updateCarousel() {
  document.getElementById('carousel-track').style.transform = `translateX(-${carouselIdx * 100}%)`;
  document.getElementById('carousel-label').textContent = carouselItems[carouselIdx]?.title || '';
  document.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('on', i === carouselIdx));
}

// ── Direct Messaging ──────────────────────────────────────────
function openDirectMessage(uid, name) {
  if (!currentUser) {
    alert('Please sign in to send messages.');
    return;
  }
  const decodedUid = decodeURIComponent(String(uid || ''));
  const decodedName = decodeURIComponent(String(name || ''));
  if (!decodedUid) {
    alert('Direct messaging is unavailable for this account.');
    return;
  }
  // Navigate to messaging page with recipient pre-selected
  localStorage.setItem('dmRecipientUid', decodedUid);
  localStorage.setItem('dmRecipientName', decodedName);
  window.location.href = 'messaging.html?to=' + encodeURIComponent(decodedUid);
}

// ═════════════════════════════════════════════════════════════
// DATA LOADING
// ═════════════════════════════════════════════════════════════

function loadData() {
  const cachedFeatured = getCachedHomeData('featured');
  if (Array.isArray(cachedFeatured) && cachedFeatured.length) renderFeatured(cachedFeatured);
  const cachedNews = getCachedHomeData('news');
  if (Array.isArray(cachedNews) && cachedNews.length) renderNews(cachedNews);
  const cachedArt = getCachedHomeData('art');
  if (Array.isArray(cachedArt) && cachedArt.length) initCarousel(cachedArt);
  const cachedNewest = getCachedHomeData('newest');
  if (Array.isArray(cachedNewest) && cachedNewest.length) renderNewest(cachedNewest);
  const cachedTopRated = getCachedHomeData('top-rated');
  if (Array.isArray(cachedTopRated) && cachedTopRated.length) renderTopRatedAnomalies(cachedTopRated);

  // Then try to overlay with live Firestore data (non-blocking)
  try {
    // 1. Featured Pages
    db.collection('pages').where('featured', '==', true).orderBy('createdAt', 'desc').limit(4).get()
      .then(function (snap) {
        const rows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        renderFeatured(rows);
        setCachedHomeData('featured', rows);
      })
      .catch(function (err) {
        console.warn('Featured query failed, trying fallback:', err.message);
        // Fallback: Fetch without orderBy if index is missing
        db.collection('pages').where('featured', '==', true).limit(10).get()
          .then(function (snap) {
            const rows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
            rows.sort((a, b) => (new Date(b.createdAt || 0)) - (new Date(a.createdAt || 0)));
            renderFeatured(rows.slice(0, 4));
            setCachedHomeData('featured', rows.slice(0, 4));
          })
          .catch(function (finalErr) {
            console.error('Final featured fallback failed:', finalErr);
            renderFeatured(null, true);
          });
      });

    // 2. Site News
    db.collection('news').orderBy('date', 'desc').limit(10).get()
      .then(function (snap) {
        const rows = snap.docs.map(function (d) { return d.data(); });
        renderNews(rows);
        setCachedHomeData('news', rows);
      })
      .catch(function (err) {
        console.warn('News query failed, trying fallback:', err.message);
        // Fallback: Fetch all and sort if index on "date" is missing or different field name
        db.collection('news').get()
          .then(function (snap) {
            const rows = snap.docs.map(function (d) { return d.data(); });
            rows.sort((a, b) => (new Date(b.date || b.createdAt || 0)) - (new Date(a.date || a.createdAt || 0)));
            renderNews(rows.slice(0, 10));
            setCachedHomeData('news', rows.slice(0, 10));
          })
          .catch(function (finalErr) {
            console.error('Final news fallback failed:', finalErr);
            renderNews(null, true);
          });
      });

    Promise.all([
      db.collection('artworks').where('displayInSpotlight', '==', true).get(),
      db.collection('pages').where('type', '==', 'Artwork').where('status', '==', 'approved').get()
    ])
      .then(function ([artSnap, pageSnap]) {
        if (!artSnap.empty) {
          const artRows = artSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
          const pageRows = pageSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
          const rows = attachArtworkLinks(artRows, pageRows);
          initCarousel(rows);
          setCachedHomeData('art', rows);
        }
      })
      .catch(function (_e) { });

    db.collection('pages').orderBy('createdAt', 'desc').limit(5).get()
      .then(function (snap) {
        if (!snap.empty) {
          const rows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
          renderNewest(rows);
          setCachedHomeData('newest', rows);
        }
      })
      .catch(function (_e) { });

    // Load top-rated anomalies
    loadTopRatedAnomalies().catch(function (_e) { });
  } catch (err) {
    console.error('Firestore not configured or failed:', err);
    renderFeatured(null, true);
    renderNews(null, true);
    initCarousel(null, true);
    renderNewest(null, true);
  }
}

async function loadTopRatedAnomalies() {
  try {
    // Reverted to pure client-side Firestore query



    // Fall back to Firestore query
    try {
      let rows = [];
      try {
        const snap = await db.collection('pages')
          .where('type', '==', 'Anomaly')
          .where('status', '==', 'approved')
          .orderBy('upvoteCount', 'desc')
          .limit(10)
          .get();

        if (!snap.empty) {
          rows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        }
      } catch (innerErr) {
        console.warn('Firestore upvoteCount query failed, falling back to in-memory sort:', innerErr.message);
        // Resilient Fallback: Get all and sort in memory
        const snap = await db.collection('pages')
          .where('type', '==', 'Anomaly')
          .where('status', '==', 'approved')
          .get();
        rows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        rows.sort((a, b) => (b.upvoteCount || 0) - (a.upvoteCount || 0));
        rows = rows.slice(0, 10);
      }

      if (rows.length > 0) {
        renderTopRatedAnomalies(rows);
        setCachedHomeData('top-rated', rows);
      } else {
        // Try newest anomalies as a secondary fallback
        const snap = await db.collection('pages')
          .where('type', '==', 'Anomaly')
          .where('status', '==', 'approved')
          .orderBy('createdAt', 'desc')
          .limit(10)
          .get();

        const newestRows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        if (newestRows.length > 0) {
          renderTopRatedAnomalies(newestRows);
          setCachedHomeData('top-rated', newestRows);
        } else {
          renderTopRatedAnomalies([]); // Shows "No anomalies available"
        }
      }
    } catch (fsErr) {
      console.error('All Firestore fallback attempts failed for top anomalies:', fsErr);
      throw fsErr;
    }
  } catch (err) {
    console.error('Failed to load top-rated anomalies:', err);
    renderTopRatedAnomalies(null, true);
  }
}

function renderTopRatedAnomalies(anomalies, isError = false) {
  const grid = document.getElementById('top-rated-grid');
  if (!grid) return;

  if (isError) {
    grid.innerHTML = '<div class="card" style="padding:20px;text-align:center;color:var(--red-b);grid-column:1/-1">Failed to fetch top rated anomalies.</div>';
    return;
  }

  if (!anomalies || !Array.isArray(anomalies) || anomalies.length === 0) {
    grid.innerHTML = '<div class="card" style="padding:20px;text-align:center;color:var(--wht-d);grid-column:1/-1">No anomalies available, upvote your favorite anomaly.</div>';
    return;
  }

  grid.innerHTML = anomalies.map(function (item, index) {
    const title = String(item.title || '[Untitled]');
    const excerpt = String(item.slug || '');
    const upvotes = Number(item.upvoteCount || 0);
    const slug = String(item.slug || '');
    const author = String(item.authorName || 'Unknown Agent');
    const url = slug ? 'page.html?slug=' + encodeURIComponent(slug) : '#';

    return '<a href="' + url + '" style="text-decoration:none;color:inherit">' +
      '<div class="card">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">' +
          '<div style="flex:1">' +
            '<div class="card-t">' + escapeHtmlApp(title) + '</div>' +
            '<div class="card-b" style="font-size:.75rem;color:var(--wht-f)">by ' + escapeHtmlApp(author) + '</div>' +
          '</div>' +
          '<div style="font-family:var(--font-d);color:var(--red-b);font-weight:bold;text-align:right">' +
            '<div style="font-size:1.1rem">▲ ' + upvotes + '</div>' +
            '<div style="font-size:.65rem;letter-spacing:1px">UPVOTES</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</a>';
  }).join('');
}

// ═════════════════════════════════════════════════════════════
// BOOT
// ═════════════════════════════════════════════════════════════

let appBooted = false;
function bootApp() {
  if (appBooted) return;
  appBooted = true;
  const skipBtn = document.querySelector('.term-skip button');
  if (skipBtn) skipBtn.addEventListener('click', skipTerminal);
  if (shouldShowTerminal()) runTerminal();
  else skipTerminal();
  auth.onAuthStateChanged(updateAuthUI);
  loadData();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp, { once: true });
} else {
  bootApp();
}
