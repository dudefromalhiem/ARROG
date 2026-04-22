/**
 * API Security Utilities
 * Provides rate limiting, CORS, security headers, and input validation
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
 * Rate limiting middleware
 * Limits requests per user/IP with configurable thresholds
 *
 * @param {string} userId - Unique identifier (uid or IP)
 * @param {object} options - { limit: 100, windowMs: 3600000 }
 * @returns {object} { allowed: boolean, remaining: number, resetTime: number }
 */
function checkRateLimit(userId, options = {}) {
  const limit = options.limit || 100;
  const windowMs = options.windowMs || 3600000; // 1 hour default
  const now = Date.now();
  const key = `ratelimit:${userId}`;

  let requests = rateLimitStore.get(key) || [];
  // Remove old requests outside the window
  requests = requests.filter(t => t > now - windowMs);

  const allowed = requests.length < limit;
  const remaining = Math.max(0, limit - requests.length - 1);
  const resetTime = requests.length > 0 ? requests[0] + windowMs : now + windowMs;

  if (allowed) {
    requests.push(now);
    rateLimitStore.set(key, requests);
  }

  return {
    allowed,
    remaining,
    resetTime: Math.ceil(resetTime / 1000)
  };
}

/**
 * Apply rate limit and return HTTP response if limit exceeded
 *
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {string} userId - User identifier
 * @param {object} options - Rate limit options
 * @returns {boolean} true if rate limited (response sent), false if allowed to continue
 */
function enforceRateLimit(req, res, userId, options = {}) {
  const status = checkRateLimit(userId, options);

  // Add rate limit headers to all responses
  res.setHeader('X-RateLimit-Limit', options.limit || 100);
  res.setHeader('X-RateLimit-Remaining', status.remaining);
  res.setHeader('X-RateLimit-Reset', status.resetTime);

  if (!status.allowed) {
    sendJson(res, 429, {
      success: false,
      error: 'Too many requests. Please try again later.',
      retryAfter: status.resetTime
    });
    return true; // Rate limited
  }

  return false; // Not rate limited, continue
}

/**
 * Add security headers to response
 */
function addSecurityHeaders(res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'");

  // Custom headers
  res.setHeader('X-API-Version', '1.0');
  res.setHeader('X-Powered-By', 'Red Oaker Guild');
}

/**
 * Handle OPTIONS preflight requests
 */
function handleCORSPreflight(req, res) {
  if (req.method === 'OPTIONS') {
    addSecurityHeaders(res);
    res.status(200).end();
    return true;
  }
  return false;
}

/**
 * Validate content length
 *
 * @param {object} req - Express request
 * @param {number} maxBytes - Maximum content length (default 1MB)
 * @returns {boolean} true if valid, false if too large
 */
function validateContentLength(req, maxBytes = 1048576) {
  const contentLength = parseInt(req.headers['content-length'] || 0, 10);
  return contentLength > 0 && contentLength <= maxBytes;
}

/**
 * Validate JSON input
 *
 * @param {string} body - Raw body string
 * @returns {object} { valid: boolean, data: ?, error: string }
 */
function validateJsonInput(body) {
  try {
    const data = JSON.parse(body || '{}');
    return { valid: true, data, error: null };
  } catch (e) {
    return {
      valid: false,
      data: null,
      error: 'Invalid JSON format'
    };
  }
}

/**
 * Validate required fields in object
 *
 * @param {object} obj - Object to validate
 * @param {string[]} required - Required field names
 * @returns {boolean} true if all required fields present and non-empty
 */
function validateRequiredFields(obj, required = []) {
  return required.every(field => {
    const val = obj[field];
    return val !== null && val !== undefined && val !== '';
  });
}

/**
 * Sanitize string input
 * Removes dangerous characters and limits length
 *
 * @param {string} input - Input string
 * @param {number} maxLength - Maximum length
 * @returns {string} Sanitized string
 */
function sanitizeInput(input, maxLength = 1000) {
  return String(input || '')
    .trim()
    .replace(/[<>\"'`]/g, '') // Remove dangerous HTML chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .slice(0, maxLength);
}

/**
 * Validate email format
 *
 * @param {string} email - Email to validate
 * @returns {boolean}
 */
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase()) && email.length <= 254;
}

/**
 * Validate URL format
 *
 * @param {string} url - URL to validate
 * @returns {boolean}
 */
function validateUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate ID format (alphanumeric with hyphens/underscores)
 *
 * @param {string} id - ID to validate
 * @returns {boolean}
 */
function validateId(id) {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

/**
 * Send JSON response with security headers
 *
 * @param {object} res - Express response
 * @param {number} statusCode - HTTP status code
 * @param {object} payload - Response data
 */
function sendJson(res, statusCode, payload) {
  addSecurityHeaders(res);
  res.status(statusCode).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/**
 * Send error response
 *
 * @param {object} res - Express response
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {string} errorCode - Optional error code for debugging
 */
function sendError(res, statusCode, message, errorCode = null) {
  const payload = {
    success: false,
    error: message
  };

  // Only include errorCode in development
  if (process.env.NODE_ENV === 'development' && errorCode) {
    payload.errorCode = errorCode;
  }

  sendJson(res, statusCode, payload);
}

/**
 * Validate authentication token
 *
 * @param {object} req - Express request
 * @returns {object} { valid: boolean, error: string }
 */
function validateAuthToken(req) {
  const header = String(req.headers.authorization || req.headers.Authorization || '');

  if (!header) {
    return { valid: false, error: 'Missing Authorization header' };
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return { valid: false, error: 'Invalid Authorization format. Use "Bearer <token>"' };
  }

  const token = match[1].trim();
  if (token.length < 10) {
    return { valid: false, error: 'Invalid token format' };
  }

  return { valid: true, token };
}

/**
 * IP-based access control (whitelist/blacklist)
 * Useful for admin endpoints
 *
 * @param {object} req - Express request
 * @param {string[]} whitelist - Allowed IP addresses (empty = allow all)
 * @param {string[]} blacklist - Blocked IP addresses
 * @returns {boolean} true if IP is allowed
 */
function checkIpAccess(req, whitelist = [], blacklist = []) {
  const ip = getRequestIp(req);

  if (blacklist.length > 0 && blacklist.includes(ip)) {
    return false;
  }

  if (whitelist.length > 0 && !whitelist.includes(ip)) {
    return false;
  }

  return true;
}

/**
 * Get client IP address
 *
 * @param {object} req - Express request
 * @returns {string} Client IP address
 */
function getRequestIp(req) {
  // Vercel forwards IPs in these headers
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['x-vercel-forwarded-for'] || '');
  if (forwarded) return forwarded.split(',')[0].trim();

  // Fallback to socket address
  return String(req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown');
}

/**
 * Wrap API handler with security checks
 * Usage: secureHandler(req, res, userId, handler, { limit: 100, windowMs: 3600000 })
 *
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {string} userId - User identifier for rate limiting
 * @param {function} handler - Actual handler function
 * @param {object} rateLimitOptions - Rate limit configuration
 * @returns {boolean} false if security checks blocked request, true if handler was called
 */
async function secureHandler(req, res, userId, handler, rateLimitOptions = {}) {
  try {
    // Handle CORS preflight
    if (handleCORSPreflight(req, res)) return true;

    // Add security headers
    addSecurityHeaders(res);

    // Check rate limit
    if (enforceRateLimit(req, res, userId, rateLimitOptions)) return true;

    // Check IP access (if configured)
    const whitelist = process.env.API_IP_WHITELIST?.split(',') || [];
    const blacklist = process.env.API_IP_BLACKLIST?.split(',') || [];
    if (!checkIpAccess(req, whitelist, blacklist)) {
      sendError(res, 403, 'Access denied');
      return true;
    }

    // Call the handler
    await handler(req, res);
    return true;
  } catch (error) {
    console.error('Security handler error:', error);
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal server error' : error.message;
    sendError(res, statusCode, message, error.code);
    return true;
  }
}

module.exports = {
  // Rate limiting
  checkRateLimit,
  enforceRateLimit,

  // CORS and security headers
  addSecurityHeaders,
  handleCORSPreflight,

  // Request validation
  validateContentLength,
  validateJsonInput,
  validateRequiredFields,
  validateAuthToken,
  validateId,

  // Input sanitization
  sanitizeInput,
  validateEmail,
  validateUrl,

  // IP access control
  getRequestIp,
  checkIpAccess,

  // Response helpers
  sendJson,
  sendError,

  // Wrapper
  secureHandler
};
