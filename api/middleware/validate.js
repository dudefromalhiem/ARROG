/**
 * /api/middleware/validate.js — Request Input Validation Middleware
 * 
 * Validates and sanitizes all incoming request data.
 * Ensures type safety and prevents injection attacks.
 * 
 * Usage:
 *   const { valid, errors, data } = validateRequest(req, schema);
 *   if (!valid) return res.status(400).json({ errors });
 */

/**
 * Validate a request body against a schema
 * 
 * Schema format:
 * {
 *   fieldName: { type: 'string'|'number'|'boolean'|'array', required: true, maxLength: 100 },
 *   ...
 * }
 */
function validateRequest(req, schema = {}) {
  const errors = [];
  const data = {};
  const body = req.body || {};

  // Check for unexpected fields (whitelist approach)
  const schemaKeys = new Set(Object.keys(schema));
  for (const key in body) {
    if (!schemaKeys.has(key)) {
      errors.push(`Unexpected field: ${key}`);
    }
  }

  // Validate each schema field
  for (const [fieldName, rules] of Object.entries(schema)) {
    const value = body[fieldName];

    // Check required
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`Missing required field: ${fieldName}`);
      continue;
    }

    if (value === undefined || value === null) {
      data[fieldName] = rules.default !== undefined ? rules.default : null;
      continue;
    }

    // Type validation and coercion
    let validated = value;
    try {
      switch (rules.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`Field "${fieldName}" must be a string, got ${typeof value}`);
            continue;
          }
          validated = String(value).trim();
          if (rules.maxLength && validated.length > rules.maxLength) {
            errors.push(`Field "${fieldName}" exceeds max length of ${rules.maxLength}`);
            continue;
          }
          if (rules.minLength && validated.length < rules.minLength) {
            errors.push(`Field "${fieldName}" is below min length of ${rules.minLength}`);
            continue;
          }
          if (rules.pattern && !rules.pattern.test(validated)) {
            errors.push(`Field "${fieldName}" does not match required pattern`);
            continue;
          }
          break;

        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`Field "${fieldName}" must be a number`);
            continue;
          }
          if (rules.min !== undefined && value < rules.min) {
            errors.push(`Field "${fieldName}" must be >= ${rules.min}`);
            continue;
          }
          if (rules.max !== undefined && value > rules.max) {
            errors.push(`Field "${fieldName}" must be <= ${rules.max}`);
            continue;
          }
          break;

        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`Field "${fieldName}" must be a boolean`);
            continue;
          }
          break;

        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`Field "${fieldName}" must be an array`);
            continue;
          }
          if (rules.maxItems && value.length > rules.maxItems) {
            errors.push(`Field "${fieldName}" exceeds max items of ${rules.maxItems}`);
            continue;
          }
          if (rules.itemType) {
            validated = value.map(item => {
              if (typeof item !== rules.itemType) {
                throw new Error(`Array items in "${fieldName}" must be ${rules.itemType}`);
              }
              return item;
            });
          }
          break;

        default:
          errors.push(`Unknown type: ${rules.type}`);
          continue;
      }
    } catch (err) {
      errors.push(`Validation error for field "${fieldName}": ${err.message}`);
      continue;
    }

    data[fieldName] = validated;
  }

  return {
    valid: errors.length === 0,
    errors,
    data
  };
}

/**
 * Sanitize user input to prevent XSS/injection
 */
function sanitizeInput(input, maxLength = 5000) {
  let text = String(input || '').trim();
  if (text.length > maxLength) {
    text = text.substring(0, maxLength);
  }
  // Remove null bytes and control characters
  text = text.replace(/[\u0000-\u001F\u007F]/g, '');
  return text;
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

/**
 * Validate URL format
 */
function isValidUrl(urlString) {
  try {
    new URL(urlString);
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  validateRequest,
  sanitizeInput,
  isValidEmail,
  isValidUrl
};
