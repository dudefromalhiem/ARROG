/**
 * Client-side input sanitization utility
 * ISSUE 5 FIX: Prevents XSS attacks using DOMPurify
 * Used by page rendering, comments, profile pages
 */

// DOMPurify configuration for different content types
const PURIFY_CONFIG_HTML = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 'i', 'b',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'blockquote', 'pre', 'code', 'span', 'div',
    'img', 'a', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'article', 'section', 'aside', 'nav', 'header', 'footer'
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'id',
    'width', 'height', 'target', 'rel',
    'colspan', 'rowspan', 'loading', 'decoding',
    'aria-label', 'role', 'data-*'
  ],
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  FORCE_BODY: true
};

const PURIFY_CONFIG_PLAIN = {
  ALLOWED_TAGS: [],
  ALLOWED_ATTR: [],
  KEEP_CONTENT: true,
  FORCE_BODY: false
};

/**
 * Sanitize HTML content using DOMPurify
 * Removes script tags, event handlers, dangerous attributes
 * @param {string} dirtyHtml - Raw HTML from user
 * @returns {string} Clean HTML safe to render
 */
function sanitizeHtml(dirtyHtml) {
  if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';
  
  // ISSUE 5 FIX: Use DOMPurify if available
  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(dirtyHtml, PURIFY_CONFIG_HTML);
  }
  
  // Fallback: Basic sanitization
  return escapeHtml(dirtyHtml);
}

/**
 * Sanitize plain text - removes all HTML tags
 * @param {string} dirtyText - Raw text from user
 * @returns {string} Plain text safe to render
 */
function sanitizeText(dirtyText) {
  if (!dirtyText || typeof dirtyText !== 'string') return '';
  
  // ISSUE 5 FIX: Strip all HTML tags
  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(dirtyText, PURIFY_CONFIG_PLAIN);
  }
  
  return escapeHtml(dirtyText);
}

/**
 * Sanitize CSS content - removes dangerous CSS properties
 * @param {string} dirtyCss - Raw CSS from user
 * @returns {string} Safe CSS
 */
function sanitizeCss(dirtyCss) {
  if (!dirtyCss || typeof dirtyCss !== 'string') return '';
  
  return String(dirtyCss)
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/expression\s*\(/gi, 'blocked(')
    .replace(/url\s*\(\s*javascript:/gi, 'url(blocked:')
    .replace(/behavior\s*:/gi, 'blocked:')
    .replace(/@import\s+url\s*\(/gi, '@import blocked(')
    .replace(/javascript:/gi, 'blocked:')
    .replace(/on\w+\s*=/gi, 'blocked=');
}

/**
 * Basic HTML escape for fallback sanitization
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text || typeof text !== 'string') return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Render sanitized HTML into a DOM element
 * @param {HTMLElement} element - Target element
 * @param {string} dirtyHtml - Raw HTML
 */
function renderSafeHtml(element, dirtyHtml) {
  if (!element || !(element instanceof HTMLElement)) return;
  
  const cleanHtml = sanitizeHtml(dirtyHtml);
  element.innerHTML = cleanHtml;
}

/**
 * Render sanitized text into a DOM element
 * @param {HTMLElement} element - Target element
 * @param {string} dirtyText - Raw text
 */
function renderSafeText(element, dirtyText) {
  if (!element || !(element instanceof HTMLElement)) return;
  
  element.textContent = sanitizeText(dirtyText);
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid format
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL
 */
function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'data:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Validate and sanitize user input object
 * @param {Object} data - Input object
 * @param {Object} schema - Validation schema
 * @returns {Object} {valid: boolean, errors: string[], data: Object}
 */
function validateInput(data, schema) {
  const errors = [];
  const sanitized = {};
  
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Input must be an object'], data: {} };
  }
  
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    
    // Check required
    if (rules.required && !value) {
      errors.push(`${field} is required`);
      continue;
    }
    
    if (!value) {
      sanitized[field] = null;
      continue;
    }
    
    // Type checking
    if (rules.type === 'string' && typeof value !== 'string') {
      errors.push(`${field} must be a string`);
      continue;
    }
    if (rules.type === 'number' && typeof value !== 'number') {
      errors.push(`${field} must be a number`);
      continue;
    }
    if (rules.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`${field} must be a boolean`);
      continue;
    }
    if (rules.type === 'array' && !Array.isArray(value)) {
      errors.push(`${field} must be an array`);
      continue;
    }
    
    // Length checks
    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push(`${field} exceeds maximum length of ${rules.maxLength}`);
      continue;
    }
    if (rules.minLength && value.length < rules.minLength) {
      errors.push(`${field} is below minimum length of ${rules.minLength}`);
      continue;
    }
    
    // Pattern checks
    if (rules.pattern && !rules.pattern.test(String(value))) {
      errors.push(`${field} has invalid format`);
      continue;
    }
    
    // Custom validation
    if (rules.isHtml) {
      sanitized[field] = sanitizeHtml(value);
    } else if (rules.isCss) {
      sanitized[field] = sanitizeCss(value);
    } else if (rules.isEmail) {
      if (!isValidEmail(value)) {
        errors.push(`${field} must be a valid email`);
        continue;
      }
      sanitized[field] = value.toLowerCase().trim();
    } else if (rules.isUrl) {
      if (!isValidUrl(value)) {
        errors.push(`${field} must be a valid URL`);
        continue;
      }
      sanitized[field] = value;
    } else if (typeof value === 'string') {
      sanitized[field] = sanitizeText(value);
    } else {
      sanitized[field] = value;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    data: sanitized
  };
}

// Export for use in inline scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sanitizeHtml,
    sanitizeText,
    sanitizeCss,
    escapeHtml,
    renderSafeHtml,
    renderSafeText,
    isValidEmail,
    isValidUrl,
    validateInput
  };
}
