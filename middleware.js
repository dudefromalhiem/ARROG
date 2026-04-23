const FIREBASE_PROJECT_ID = 'redoakerguild';
const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const protectedPaths = new Set(['/admin', '/admin.html', '/submit', '/submit.html', '/messaging', '/messaging.html']);

let jwksCache = { expiresAt: 0, keys: new Map() };

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return '';
  const pairs = String(cookieHeader).split(';');
  for (let i = 0; i < pairs.length; i++) {
    const part = pairs[i].trim();
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    return part.slice(eq + 1).trim();
  }
  return '';
}

function base64UrlToUint8Array(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJwtParts(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(parts[1])));
    return { header, payload, signature: parts[2], signingInput: parts[0] + '.' + parts[1] };
  } catch (_err) {
    return null;
  }
}

async function getFirebaseJwks() {
  const now = Date.now();
  if (jwksCache.expiresAt > now && jwksCache.keys.size) return jwksCache.keys;

  const response = await fetch(FIREBASE_JWKS_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to fetch Firebase signing keys.');
  const data = await response.json();
  const keys = new Map();
  for (const key of Array.isArray(data.keys) ? data.keys : []) {
    if (key && key.kid) keys.set(String(key.kid), key);
  }

  const cacheControl = String(response.headers.get('cache-control') || '');
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 300;
  jwksCache = { keys, expiresAt: now + (Math.max(60, maxAgeSeconds) * 1000) };
  return keys;
}

async function verifyFirebaseToken(token) {
  const decoded = decodeJwtParts(token);
  if (!decoded || !decoded.header || !decoded.payload) return false;

  const { header, payload, signingInput, signature } = decoded;
  if (header.alg !== 'RS256' || !header.kid) return false;

  const exp = Number(payload.exp || 0);
  if (!exp || exp <= Math.floor(Date.now() / 1000)) return false;
  if (String(payload.aud || '') !== FIREBASE_PROJECT_ID) return false;
  if (String(payload.iss || '') !== 'https://securetoken.google.com/' + FIREBASE_PROJECT_ID) return false;
  if (!payload.sub) return false;

  const keys = await getFirebaseJwks();
  const jwk = keys.get(String(header.kid));
  if (!jwk) return false;

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    base64UrlToUint8Array(signature),
    new TextEncoder().encode(signingInput)
  );

  return !!verified;
}

function getAuthToken(request) {
  const authHeader = String(request.headers.get('authorization') || '');
  const headerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (headerMatch && headerMatch[1]) return headerMatch[1].trim();

  const cookieHeader = String(request.headers.get('cookie') || '');
  const sessionCookie = getCookieValue(cookieHeader, '__session');
  if (sessionCookie) return sessionCookie;

  const legacyCookie = getCookieValue(cookieHeader, 'rog_id_token');
  if (legacyCookie) return legacyCookie;

  return '';
}

function redirectToHome(request) {
  const redirectUrl = new URL('/index.html', request.url);
  return Response.redirect(redirectUrl, 302);
}

export async function middleware(request) {
  const pathname = new URL(request.url).pathname;
  if (!protectedPaths.has(pathname)) return;

  const token = getAuthToken(request);
  if (!token) return redirectToHome(request);

  try {
    const verified = await verifyFirebaseToken(token);
    if (!verified) return redirectToHome(request);
    return;
  } catch (_err) {
    return redirectToHome(request);
  }
}

export const config = {
  matcher: ['/admin', '/admin.html', '/submit', '/submit.html', '/messaging', '/messaging.html']
};
