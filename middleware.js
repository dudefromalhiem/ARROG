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

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch (_err) {
    return null;
  }
}

function isAuthenticatedFirebaseToken(token) {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const exp = Number(payload.exp || 0);
  if (!exp || exp <= Math.floor(Date.now() / 1000)) return false;

  // Sanity checks for this project's Firebase tokens.
  const aud = String(payload.aud || '');
  const iss = String(payload.iss || '');
  if (aud && aud !== 'redoakerguild') return false;
  if (iss && !iss.endsWith('/redoakerguild')) return false;
  return true;
}

export default function middleware(request) {
  const token = getCookieValue(request.headers.get('cookie'), 'rog_id_token');
  if (isAuthenticatedFirebaseToken(token)) {
    return;
  }

  const redirectUrl = new URL('/index.html', request.url);
  return Response.redirect(redirectUrl, 307);
}

export const config = {
  matcher: ['/admin', '/admin.html']
};
