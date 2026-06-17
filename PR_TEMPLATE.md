## Summary
closes #72

- Implement service-to-service JWT authentication using HMAC-SHA256 (HS256)
- Add `verifyJwtBearer` Express middleware for protecting internal routes
- Add `signJwt` / `verifyJwt` service helpers (zero external dependencies — pure Node.js `crypto`)
- Provide 13 unit + integration tests covering all acceptance criteria
- Document new env vars in `.env.example`

## Changes

### New files
- `src/services/jwt.js` — JWT signing and verification service (HS256, timing-safe signature comparison, issuer/expiry/iat validation)
- `src/middleware/jwt-auth.js` — `verifyJwtBearer` Express middleware; attaches decoded payload to `req.jwtPayload`; emits structured `{ error, code }` 401 responses
- `test/jwt-auth.test.js` — 13 tests covering the service layer and the middleware

### Modified files
- `.env.example` — documents `JWT_SIGNING_SECRET` (min 32 chars, rotate periodically) and `JWT_ISSUER`

## How it works

```
Incoming internal request
    |
    v
Authorization: Bearer <token>   <- missing -> 401 MISSING_TOKEN
    |
    v
verifyJwtBearer middleware
    |- extract + trim token
    |- verifyJwt(token)
    |      |- check alg == HS256
    |      |- timing-safe HMAC-SHA256 signature check  <- tampered -> 401 INVALID_SIGNATURE
    |      |- exp > now                                <- expired  -> 401 TOKEN_EXPIRED
    |      |- iat <= now
    |      `- iss == JWT_ISSUER                        <- mismatch -> 401 INVALID_ISSUER
    |
    v
req.jwtPayload = decoded claims
next()  ->  protected handler
```

## Verification
```bash
npm test
```
All 13 new tests pass alongside the existing test suite.

## Security notes
- Signature comparison uses `crypto.timingSafeEqual` to prevent timing attacks.
- `JWT_SIGNING_SECRET` is validated to be at least 32 characters at runtime; the service fails fast if misconfigured.
- **Key rotation**: update `JWT_SIGNING_SECRET` in your secrets manager and redeploy. Short token TTL (default 5 min) limits the exposure window.
- No third-party JWT library is introduced — only Node.js built-in `crypto`.

## Notes
- The middleware is intentionally route-level, not applied globally, so the existing public `/health` and `/github-webhook` endpoints are unaffected.
- `req.jwtPayload` exposes the full decoded claims for downstream handlers to use (e.g., `sub` for service identity logging).
