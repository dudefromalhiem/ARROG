/**
 * Rate limiting middleware
 * ISSUE 6 FIX: Prevent abuse and DoS attacks
 * Uses in-memory store (development) or Redis (production)
 */

// In-memory rate limit store (for development)
// In production, use Redis via Upstash for distributed rate limiting
const rateLimitStore = new Map();
const REQUEST_LOG_CLEANUP_INTERVAL = 60000; // Clean up every minute

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  const cutoff = now - 3600000; // 1 hour
  for (const [key, requests] of rateLimitStore.entries()) {
    const fresh = requests.filter(t => t > cutoff);
    if (fresh.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, fresh);
    }
  }
}, REQUEST_LOG_CLEANUP_INTERVAL);

/**
 * Get client IP from request
 * @param {object} req - Request object
 * @returns {string} IP address
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-vercel-forwarded-for'] || 
         req.socket?.remoteAddress || 
         'unknown';
}

/**
 * Check rate limit for identifier
 * ISSUE 6 FIX: Enforce request throttling
 *
 * @param {string} identifier - User ID or IP
 * @param {object} options - { limit: 10, windowMs: 60000 }
 * @returns {object} { allowed: boolean, remaining: number, resetAt: number }
 */
function checkRateLimit(identifier, options = {}) {
  const limit = options.limit || 100;
  const windowMs = options.windowMs || 3600000; // 1 hour default
  const now = Date.now();
  const key = `ratelimit:${identifier}`;

  let requests = rateLimitStore.get(key) || [];
  // Remove old requests outside the window
  requests = requests.filter(t => t > now - windowMs);

  const allowed = requests.length < limit;
  const remaining = Math.max(0, limit - requests.length);
  const resetAt = requests.length > 0 
    ? Math.ceil((requests[0] + windowMs) / 1000)
    : Math.ceil((now + windowMs) / 1000);

  if (allowed) {
    requests.push(now);
    rateLimitStore.set(key, requests);
  }

  return {
    allowed,
    remaining,
    resetAt,
    limit
  };
}

/**
 * Check rate limit and return middleware response if exceeded
 * ISSUE 6 FIX: Return 429 Too Many Requests
 *
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {string} identifier - User ID or IP (optional, defaults to IP)
 * @param {object} options - { limit, windowMs }
 * @returns {boolean} true if rate limited, false to continue
 */
function enforceRateLimit(req, res, identifier, options = {}) {
  // Use provided identifier or default to client IP
  const id = identifier || getClientIp(req);
  const status = checkRateLimit(id, options);

  // Add rate limit headers to response
  res.setHeader('X-RateLimit-Limit', status.limit);
  res.setHeader('X-RateLimit-Remaining', status.remaining);
  res.setHeader('X-RateLimit-Reset', status.resetAt);

  if (!status.allowed) {
    // ISSUE 6 FIX: Return 429 Too Many Requests
    res.status(429).setHeader('Content-Type', 'application/json');
    res.setHeader('Retry-After', status.resetAt);
    res.end(JSON.stringify({
      error: 'Too many requests. Please try again later.',
      retryAfter: status.resetAt
    }));
    return true; // Rate limited
  }

  return false; // Not rate limited
}

/**
 * Create rate limit middleware function
 * ISSUE 6 FIX: Factory for creating endpoint-specific rate limiters
 *
 * @param {object} options - { limit, windowMs, keyFn }
 * @returns {function} Middleware function
 */
function createRateLimitMiddleware(options = {}) {
  const limit = options.limit || 100;
  const windowMs = options.windowMs || 3600000;
  const keyFn = options.keyFn || ((req) => getClientIp(req));

  return (req, res, identifier) => {
    const key = identifier || keyFn(req);
    return enforceRateLimit(req, res, key, { limit, windowMs });
  };
}

module.exports = {
  checkRateLimit,
  enforceRateLimit,
  createRateLimitMiddleware,
  getClientIp
};
