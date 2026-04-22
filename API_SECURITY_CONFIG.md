# API Security Configuration

This file documents how to configure API security settings for local development and production deployments.

## Environment Variables

Copy the following to your `.env.local` (development) or deployment environment:

### Firebase Configuration
```env
# Required - Firebase service account key (JSON as string)
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"..."}'

# Optional - Firebase project ID (auto-detected from service key)
FIREBASE_PROJECT_ID=your-project-id
```

### Rate Limiting Configuration

```env
# Optional - Redis-based rate limiting for distributed deployments
# If not set, uses in-memory rate limiting (single-server only)
UPSTASH_REDIS_REST_URL=https://your-redis-endpoint.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-upstash-token
```

**Development**: Uses in-memory store (no config needed)  
**Production** (Vercel/Serverless): Enable Redis for distributed rate limiting

### IP Access Control

```env
# Optional - Comma-separated list of allowed IPs (empty = allow all)
# Only applies to admin endpoints
API_IP_WHITELIST=192.168.1.1,10.0.0.1

# Optional - Comma-separated list of blocked IPs
API_IP_BLACKLIST=203.0.113.0,198.51.100.0
```

### Environment Mode

```env
# Set to 'development' or 'production'
NODE_ENV=development

# In development: error responses include errorCode for debugging
# In production: error responses don't expose internal details
```

---

## Default Rate Limits

These are built into the security layer. Adjust in code if needed:

### Write Operations (Protected)
```javascript
// POST /api/upvote
enforceRateLimit(req, res, `upvote:${user.uid}`, {
  limit: 100,           // per user
  windowMs: 3600000     // 1 hour
});
```

### Read Operations (Public)
```javascript
// GET /api/topAnomalies
// GET /api/allAnomalies
enforceRateLimit(req, res, `endpoint:${ip}`, {
  limit: 1000,          // per IP
  windowMs: 3600000     // 1 hour
});
```

To modify defaults, edit the `enforceRateLimit` calls in each endpoint file.

---

## Local Development Setup

1. **Create `.env.local`**:
```bash
# Copy your Firebase service account JSON
FIREBASE_SERVICE_ACCOUNT_KEY='...'
NODE_ENV=development
```

2. **Start development server**:
```bash
npm run dev
```

3. **Test endpoints**:
```bash
# Upvote (requires auth token)
curl -X POST http://localhost:3000/api/upvote \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pageId":"doc-id","pageType":"Anomaly"}'

# Top anomalies (public)
curl http://localhost:3000/api/topAnomalies?limit=10

# All anomalies (public)
curl http://localhost:3000/api/allAnomalies
```

---

## Production Deployment (Vercel)

### 1. Set Environment Variables in Vercel Dashboard:

Go to **Project Settings → Environment Variables** and add:

```
FIREBASE_SERVICE_ACCOUNT_KEY = (paste JSON)
FIREBASE_PROJECT_ID = your-project-id
UPSTASH_REDIS_REST_URL = (if using Redis)
UPSTASH_REDIS_REST_TOKEN = (if using Redis)
NODE_ENV = production
```

### 2. For Redis Rate Limiting (Recommended):

- Sign up at [Upstash](https://upstash.com)
- Create a Redis database
- Copy REST URL and REST Token
- Add to Vercel environment variables

### 3. Deploy:

```bash
git push origin main
# Vercel automatically deploys
```

---

## Monitoring & Debugging

### Response Headers (Every Request)

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1640000000
X-API-Version: 1.0
```

### Check Rate Limit Status

Headers tell you:
- **Limit**: Max requests allowed
- **Remaining**: Requests left in current window
- **Reset**: Unix timestamp when limit resets

### Enable Server Logging

Add to your endpoint:
```javascript
console.log('[ENDPOINT]', {
  method: req.method,
  path: req.path,
  userId: user?.uid,
  ip: security.getRequestIp(req),
  status: res.statusCode
});
```

---

## Security Best Practices

✅ **Do**:
- Keep Firebase keys in environment variables only
- Use HTTPS in production
- Monitor rate limit headers for abuse patterns
- Rotate API keys periodically
- Enable firewall rules on database

❌ **Don't**:
- Commit `.env.local` to git (add to `.gitignore`)
- Expose error details in production
- Allow public write access to sensitive data
- Disable rate limiting
- Use weak authentication tokens

---

## Upgrading to Redis Rate Limiting

When deploying to serverless (Vercel), in-memory rate limiting won't work across function invocations. Upgrade to Redis:

1. **Install package**:
```bash
npm install upstash-redis
```

2. **Update `api/security.js`**:
```javascript
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

async function checkRateLimit(userId, options = {}) {
  const key = `ratelimit:${userId}`;
  const current = await redis.get(key) || 0;
  
  if (current >= options.limit) {
    return { allowed: false, remaining: 0 };
  }
  
  await redis.incr(key);
  await redis.expire(key, Math.ceil(options.windowMs / 1000));
  
  return { allowed: true, remaining: options.limit - current - 1 };
}
```

3. **Test with Vercel**:
```bash
vercel dev
```

---

## Troubleshooting

### "Rate limit exceeded" but haven't made that many requests

**Cause**: Rate limit persists across API calls  
**Solution**: Wait for the `X-RateLimit-Reset` time to pass

### Firebase authentication errors

**Cause**: Invalid or expired token  
**Solution**: Get a fresh token from Firebase:
```javascript
const token = await auth.currentUser.getIdToken(true);
```

### CORS errors in browser

**Cause**: Browser blocks cross-origin requests  
**Solution**: Endpoints already have CORS headers enabled; check Network tab in DevTools

### Large payload rejected

**Cause**: Request body exceeds 1MB  
**Solution**: Reduce payload size or contact admin for limit increase

---

## Questions?

- Check [API_SECURITY.md](./API_SECURITY.md) for detailed documentation
- Review test cases in `/__tests__/api/` (if available)
- Contact: admin@redoakerguild.com
