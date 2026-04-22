# API Security Implementation

This document outlines the security measures implemented for the Red Oaker Guild API.

## Overview

The API includes comprehensive security layers:
- **Rate Limiting** - Prevents abuse via request throttling
- **Authentication** - Validates Firebase ID tokens
- **Input Validation** - Sanitizes and validates all inputs
- **CORS Headers** - Controls cross-origin requests
- **Security Headers** - Prevents XSS, clickjacking, and other attacks
- **Authorization** - Enforces role-based access control
- **Content Validation** - Limits payload sizes and formats

## Components

### 1. Security Utilities (`api/security.js`)

Shared security functions used across all API endpoints.

#### Rate Limiting

**Purpose**: Prevent abuse by limiting requests per user/IP

**Configuration**:
```javascript
// Per endpoint (e.g., upvote.js)
security.enforceRateLimit(req, res, userId, {
  limit: 100,           // Max requests
  windowMs: 3600000     // Time window in ms (1 hour)
});
```

**Default Limits**:
- **Upvote endpoint**: 100 requests/hour per user
- **Read endpoints**: 1000 requests/hour per IP
- Custom limits can be set per endpoint

**In Production**:
The in-memory rate limiting works for single-server deployments. For distributed systems (Vercel, serverless), upgrade to Redis-based rate limiting:

```javascript
// Coming soon: Redis via Upstash
const client = await redis.connect();
```

**Environment Variables**:
```env
# Optional: Redis connection for distributed rate limiting
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Optional: IP-based access control
API_IP_WHITELIST=192.168.1.1,10.0.0.1
API_IP_BLACKLIST=203.0.113.0
```

---

#### Authentication

**Purpose**: Validate user identity and authorization

**Flow**:
1. Client sends `Authorization: Bearer <firebaseToken>` header
2. API validates token with Firebase Admin SDK
3. Returns user `uid`, `email`, `name`

**Token Validation**:
```javascript
const authCheck = security.validateAuthToken(req);
if (!authCheck.valid) {
  return security.sendError(res, 401, authCheck.error);
}
// authCheck.token contains the validated token
```

**Requirements**:
- Firebase ID token from signed-in user
- Token must be valid and not expired
- User must be authenticated for protected endpoints

---

#### Input Validation

**String Validation**:
```javascript
// Sanitize user input
const title = security.sanitizeInput(req.body.title, 200);

// Validate required fields
security.validateRequiredFields(req.body, ['pageId', 'pageType']);

// Validate specific formats
security.validateId(pageId);        // Alphanumeric, hyphens, underscores
security.validateEmail(email);      // Email format
security.validateUrl(url);          // HTTP/HTTPS URLs
```

**Content Length**:
```javascript
// Enforce max 1KB for this endpoint
if (!security.validateContentLength(req, 1024)) {
  return security.sendError(res, 413, 'Request too large');
}
```

---

#### CORS & Security Headers

**Automatic Application**:
```javascript
security.addSecurityHeaders(res);
```

**Headers Applied**:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

---

#### IP Access Control

**Whitelist/Blacklist**:
```javascript
// In environment variables
API_IP_WHITELIST=192.168.1.1,10.0.0.1  // Only allow these
API_IP_BLACKLIST=203.0.113.0             // Block these

// Automatic in secureHandler
security.checkIpAccess(req, whitelist, blacklist);
```

---

## Endpoint Protection

### Protected Endpoints

#### POST `/api/upvote`

**Authentication**: ✓ Required
**Rate Limit**: 100 requests/hour per user
**Input Validation**: ✓ Full
**Payload Size**: Max 1KB

**Request**:
```json
{
  "pageId": "abc123",
  "pageType": "Anomaly"
}
```

**Validation**:
- `pageId`: Must be valid ID format (alphanumeric + hyphens/underscores)
- `pageType`: Must be exactly "Anomaly"
- Page must exist and be approved
- User must be authenticated

**Response Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1640000000
```

---

#### GET `/api/topAnomalies`

**Authentication**: ✗ Not required
**Rate Limit**: 1000 requests/hour per IP
**Input Validation**: ✓ Query parameters
**Payload Size**: N/A (GET)

**Query Parameters**:
- `limit` (optional): Number of results (default: 10, max: 20)

**Validation**:
- Limit parameter must be numeric and within bounds
- Invalid values use defaults

---

#### GET `/api/allAnomalies`

**Authentication**: ✗ Not required
**Rate Limit**: 1000 requests/hour per IP
**Input Validation**: ✗ None needed (no params)
**Payload Size**: N/A (GET)

---

## Error Handling

**Format**:
```json
{
  "success": false,
  "error": "Human-readable error message",
  "errorCode": "DEBUG_CODE"  // Development only
}
```

**Status Codes**:
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing/invalid auth)
- `403` - Forbidden (access denied by IP rules)
- `404` - Not Found
- `405` - Method Not Allowed
- `413` - Payload Too Large
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

**Security**: Error messages never expose:
- File paths
- System details
- Database structure
- Stack traces (production only)

---

## Best Practices for Developers

### When Adding New Endpoints

1. **Use `secureHandler` wrapper**:
```javascript
module.exports = async (req, res) => {
  return security.secureHandler(req, res, userId, async (req, res) => {
    // Your endpoint logic
  }, { limit: 100, windowMs: 3600000 });
};
```

2. **Always validate input**:
```javascript
// Validate required fields
if (!req.body.pageId) {
  return security.sendError(res, 400, 'Missing pageId');
}

// Validate format
if (!security.validateId(req.body.pageId)) {
  return security.sendError(res, 400, 'Invalid pageId format');
}
```

3. **Authenticate when needed**:
```javascript
let user;
try {
  user = await verifyUser(req); // For protected endpoints
} catch (err) {
  return security.sendError(res, 401, err.message);
}
```

4. **Set appropriate rate limits**:
```javascript
// Write operations: strict limit per user
security.enforceRateLimit(req, res, `endpoint:${user.uid}`, { 
  limit: 50, 
  windowMs: 3600000 
});

// Read operations: lenient limit per IP
security.enforceRateLimit(req, res, `endpoint:${ip}`, { 
  limit: 10000, 
  windowMs: 3600000 
});
```

5. **Use security functions for responses**:
```javascript
// Do this
security.sendJson(res, 200, { success: true, data: [] });
security.sendError(res, 400, 'Invalid input');

// Not this
res.json({ success: true });
res.status(400).send('error');
```

---

## Monitoring & Debugging

### Check Rate Limit Status

Headers in every response:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1640000000  (Unix timestamp, seconds)
```

### Enable Debug Logging

```javascript
// In development
console.error('[upvote.js]', statusCode, message);

// Includes: endpoint, HTTP status, error message
```

---

## Future Improvements

### Redis-based Rate Limiting
```javascript
// For distributed deployments
const client = await redis.connect();
const key = `ratelimit:${userId}`;
const count = await client.incr(key);
if (count === 1) await client.expire(key, 3600);
```

### WAF (Web Application Firewall)
- Vercel Edge Middleware for request filtering
- Automated bot detection
- DDoS mitigation

### Audit Logging
```javascript
// Log all API access
await db.collection('audit_logs').add({
  userId,
  endpoint,
  method,
  status,
  timestamp: new Date()
});
```

### API Keys (optional)
```javascript
// For third-party integrations
if (req.headers['x-api-key']) {
  const key = req.headers['x-api-key'];
  const valid = await validateApiKey(key);
  // ...
}
```

---

## Testing Security

### Test Rate Limiting
```bash
# Rapid fire 101 requests (should get 429 on 101st)
for i in {1..101}; do
  curl -X POST https://api.redoakerguild.com/api/upvote \
    -H "Authorization: Bearer $TOKEN"
done
```

### Test Invalid Input
```bash
# Missing required field
curl -X POST https://api.redoakerguild.com/api/upvote \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"pageType":"Anomaly"}'
```

### Test CORS
```bash
# Preflight request
curl -X OPTIONS https://api.redoakerguild.com/api/upvote \
  -H "Origin: https://example.com"
```

---

## Configuration Summary

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `upvote` limit | Number | 100/hr | Prevent vote spam |
| `upvote` window | ms | 3600000 | Rate limit duration |
| read limit | Number | 1000/hr | Prevent DoS |
| max payload | Bytes | 1048576 | Prevent upload abuse |
| max ID length | Number | 64 | Input validation |
| token timeout | Varies | Firebase default | Token expiration |
| CORS origin | String | * | Allow all origins |

---

## Support & Questions

Contact: admin@redoakerguild.com  
Documentation: [GitHub Wiki](https://github.com/redoakerguild/api-security-wiki)
