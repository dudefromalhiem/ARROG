/**
 * Error response sanitization
 * ISSUE 8 FIX: Prevents information leakage through error messages
 * Never exposes stack traces, Firebase error codes, or internal details
 */

/**
 * Sanitize error message for client exposure
 * Removes Firebase-specific errors and sensitive information
 * @param {Error} error - Error object
 * @param {number} statusCode - HTTP status code
 * @returns {string} Safe error message
 */
function sanitizeErrorMessage(error, statusCode = 500) {
  if (!error) return 'Server error.';
  
  const message = String(error.message || error || '').trim();
  
  // For 5xx errors, never expose the actual error
  if (statusCode >= 500) {
    return 'Server error.';
  }
  
  // For 4xx errors, only return safe messages
  // Block Firebase-specific error codes
  const blockedPatterns = [
    /firebase/gi,
    /firestore/gi,
    /auth\//gi,
    /\.firebaseio\.com/gi,
    /\.firebasestorage\.app/gi,
    /\.cloudfunctions\.net/gi,
    /process\.env\./gi,
    /password/gi,
    /secret/gi,
    /token/gi,
    /api[_-]?key/gi,
    /private[_-]?key/gi,
    /stack/gi,
    /at\s+[A-Za-z]/gi  // Stack trace patterns like "at function"
  ];
  
  let sanitized = message;
  for (const pattern of blockedPatterns) {
    sanitized = sanitized.replace(pattern, (match) => {
      // Replace Firebase with "service", auth errors with generic message
      if (match.toLowerCase().includes('firebase')) return 'service';
      if (match.toLowerCase().includes('firestore')) return 'database';
      if (match.toLowerCase().includes('auth/')) return '';
      return '';
    });
  }
  
  // Limit message length
  sanitized = sanitized.substring(0, 200).trim();
  
  // If result is empty or still contains dangerous patterns, return generic
  if (!sanitized || /[<>{}[\]|\\^`]/.test(sanitized)) {
    return 'Invalid request.';
  }
  
  return sanitized;
}

/**
 * Build safe error response
 * @param {number} statusCode - HTTP status code
 * @param {string|Error} message - Error message or Error object
 * @param {string} defaultMessage - Default message if message empty
 * @returns {object} { error: string }
 */
function buildErrorResponse(statusCode, message, defaultMessage = 'Server error.') {
  const error = message instanceof Error ? message : new Error(message);
  const sanitized = sanitizeErrorMessage(error, statusCode);
  
  return {
    error: sanitized || defaultMessage
  };
}

/**
 * Send safe error response
 * @param {object} res - Response object
 * @param {number} statusCode - HTTP status code
 * @param {string|Error} message - Error message or Error object
 */
function sendSafeError(res, statusCode, message) {
  const payload = buildErrorResponse(statusCode, message);
  
  res.status(statusCode).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/**
 * Catch-all error handler for try/catch blocks
 * @param {Error} error - Caught error
 * @returns {object} { statusCode: number, message: string }
 */
function handleCatchError(error) {
  // Check for custom status codes
  let statusCode = error?.statusCode || 500;
  
  // For Firebase auth errors, map to 401
  if (error?.code?.includes('auth/') || error?.message?.includes('auth/')) {
    statusCode = 401;
  }
  
  // For verification errors, map to 401
  if (error?.message?.includes('token') || error?.message?.includes('verify')) {
    statusCode = 401;
  }
  
  // Limit to valid HTTP status codes
  if (statusCode < 400 || statusCode >= 600) {
    statusCode = 500;
  }
  
  const message = sanitizeErrorMessage(error, statusCode);
  
  return {
    statusCode,
    message: message || 'Server error.'
  };
}

module.exports = {
  sanitizeErrorMessage,
  buildErrorResponse,
  sendSafeError,
  handleCatchError
};
