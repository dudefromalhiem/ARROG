(function (root) {
  function getSameDocumentAnchorTarget(href, currentHref) {
    const rawHref = String(href || '').trim();
    if (!rawHref || !rawHref.includes('#')) return null;

    const baseHref = String(currentHref || (root && root.location ? root.location.href : '') || '').trim();
    if (!baseHref) return null;

    try {
      const currentUrl = new URL(baseHref, baseHref);
      const targetUrl = new URL(rawHref, currentUrl.href);
      const sameDocument = rawHref.startsWith('#') || (
        targetUrl.origin === currentUrl.origin &&
        targetUrl.pathname === currentUrl.pathname
      );

      if (!sameDocument) return null;

      const hash = targetUrl.hash || (rawHref.startsWith('#') ? rawHref : '');
      if (!hash || hash === '#') return null;

      return decodeURIComponent(hash.slice(1));
    } catch (_err) {
      return null;
    }
  }

  const helpers = { getSameDocumentAnchorTarget };
  root.RogBrowserCompatHelpers = helpers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = helpers;
  }
})(typeof window !== 'undefined' ? window : globalThis);