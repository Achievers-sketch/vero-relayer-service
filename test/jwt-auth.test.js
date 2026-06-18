'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-signing-secret-that-is-long-enough-32ch';
const TEST_ISSUER = 'vero-relayer-service';

function setEnv() {
  process.env.JWT_SIGNING_SECRET = TEST_SECRET;
  process.env.JWT_ISSUER = TEST_ISSUER;
}

function makeToken(payload = {}, options = {}) {
  setEnv();
  const { signJwt } = require('../src/services/jwt');
  return signJwt({ sub: 'service-a', ...payload }, options);
}

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

function serverUrl(server, path) {
  return `http://127.0.0.1:${server.address().port}${path}`;
}

function buildApp() {
  setEnv();
  const { verifyJwtBearer } = require('../src/middleware/jwt-auth');
  const app = express();
  app.use(express.json());
  app.get('/internal/ping', verifyJwtBearer, (req, res) => {
    res.status(200).json({ ok: true, sub: req.jwtPayload.sub });
  });
  return app;
}

// ---------------------------------------------------------------------------
// Unit tests – jwt service
// ---------------------------------------------------------------------------

test('jwt service – signs and verifies a valid token', () => {
  setEnv();
  const { signJwt, verifyJwt } = require('../src/services/jwt');

  const token = signJwt({ sub: 'service-a', role: 'internal' });
  assert.equal(typeof token, 'string');
  assert.equal(token.split('.').length, 3);

  const payload = verifyJwt(token);
  assert.equal(payload.sub, 'service-a');
  assert.equal(payload.role, 'internal');
  assert.equal(payload.iss, TEST_ISSUER);
  assert.ok(typeof payload.iat === 'number');
  assert.ok(typeof payload.exp === 'number');
  assert.ok(payload.exp > payload.iat);
});

test('jwt service – rejects a token with a tampered payload', () => {
  setEnv();
  const { signJwt, verifyJwt } = require('../src/services/jwt');

  const token = signJwt({ sub: 'service-a' });
  const [header, , sig] = token.split('.');

  const fakePayload = Buffer.from(
    JSON.stringify({
      sub: 'attacker',
      iss: TEST_ISSUER,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    })
  )
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const tampered = `${header}.${fakePayload}.${sig}`;

  assert.throws(
    () => verifyJwt(tampered),
    err => err.code === 'INVALID_SIGNATURE'
  );
});

test('jwt service – rejects an expired token', () => {
  setEnv();
  const { signJwt, verifyJwt } = require('../src/services/jwt');

  const token = signJwt({ sub: 'service-a' }, { expiresInSeconds: -1 });

  assert.throws(
    () => verifyJwt(token),
    err => err.code === 'TOKEN_EXPIRED'
  );
});

test('jwt service – rejects a token signed with a different secret', () => {
  const { signJwt, verifyJwt } = require('../src/services/jwt');

  process.env.JWT_SIGNING_SECRET = 'different-secret-that-is-32-characters!!';
  process.env.JWT_ISSUER = TEST_ISSUER;
  const token = signJwt({ sub: 'service-a' });

  process.env.JWT_SIGNING_SECRET = TEST_SECRET;

  assert.throws(
    () => verifyJwt(token),
    err => err.code === 'INVALID_SIGNATURE'
  );
});

test('jwt service – rejects a token with wrong issuer', () => {
  setEnv();
  const { signJwt, verifyJwt } = require('../src/services/jwt');
  const token = signJwt({ sub: 'service-a' });

  assert.throws(
    () => verifyJwt(token, { issuer: 'some-other-service' }),
    err => err.code === 'INVALID_ISSUER'
  );
});

test('jwt service – rejects a malformed token string', () => {
  setEnv();
  const { verifyJwt } = require('../src/services/jwt');

  assert.throws(
    () => verifyJwt('not.a.valid.jwt.at.all'),
    err => err.code === 'MALFORMED_TOKEN'
  );

  assert.throws(
    () => verifyJwt('only.twoparts'),
    err => err.code === 'MALFORMED_TOKEN'
  );
});

test('jwt service – throws when secret is missing or too short', () => {
  setEnv();
  const { signJwt, verifyJwt } = require('../src/services/jwt');

  // Create a valid token while secret is set
  const validToken = signJwt({ sub: 'test' });

  // Now remove the secret — verifyJwt should fail fast
  delete process.env.JWT_SIGNING_SECRET;
  assert.throws(
    () => verifyJwt(validToken),
    err => err.message.includes('JWT_SIGNING_SECRET')
  );

  // Too-short secret
  process.env.JWT_SIGNING_SECRET = 'short';
  assert.throws(
    () => verifyJwt(validToken),
    err => err.message.includes('JWT_SIGNING_SECRET')
  );

  // Restore
  process.env.JWT_SIGNING_SECRET = TEST_SECRET;
});

// ---------------------------------------------------------------------------
// Integration tests – jwt-auth middleware
// ---------------------------------------------------------------------------

test('jwt middleware – allows requests with a valid Bearer token', async t => {
  const app = buildApp();
  const server = await listen(app);
  t.after(() => close(server));

  const token = makeToken();
  const response = await fetch(serverUrl(server, '/internal/ping'), {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.sub, 'service-a');
});

test('jwt middleware – rejects requests with no Authorization header', async t => {
  const app = buildApp();
  const server = await listen(app);
  t.after(() => close(server));

  const response = await fetch(serverUrl(server, '/internal/ping'));
  assert.equal(response.status, 401);

  const body = await response.json();
  assert.equal(body.code, 'MISSING_TOKEN');
});

test('jwt middleware – rejects requests with non-Bearer scheme', async t => {
  const app = buildApp();
  const server = await listen(app);
  t.after(() => close(server));

  const response = await fetch(serverUrl(server, '/internal/ping'), {
    headers: { Authorization: 'Basic dXNlcjpwYXNz' },
  });
  assert.equal(response.status, 401);

  const body = await response.json();
  assert.equal(body.code, 'MALFORMED_TOKEN');
});

test('jwt middleware – rejects requests with an expired token', async t => {
  const app = buildApp();
  const server = await listen(app);
  t.after(() => close(server));

  const expiredToken = makeToken({}, { expiresInSeconds: -1 });
  const response = await fetch(serverUrl(server, '/internal/ping'), {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  assert.equal(response.status, 401);

  const body = await response.json();
  assert.equal(body.code, 'TOKEN_EXPIRED');
});

test('jwt middleware – rejects requests with a tampered token', async t => {
  const app = buildApp();
  const server = await listen(app);
  t.after(() => close(server));

  const token = makeToken();
  const [h, , s] = token.split('.');
  const maliciousPayload = Buffer.from(
    JSON.stringify({
      sub: 'attacker',
      iss: TEST_ISSUER,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    })
  )
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const tampered = `${h}.${maliciousPayload}.${s}`;
  const response = await fetch(serverUrl(server, '/internal/ping'), {
    headers: { Authorization: `Bearer ${tampered}` },
  });
  assert.equal(response.status, 401);

  const body = await response.json();
  assert.equal(body.code, 'INVALID_SIGNATURE');
});

test('jwt middleware – rejects empty Bearer token', async t => {
  const app = buildApp();
  const server = await listen(app);
  t.after(() => close(server));

  const response = await fetch(serverUrl(server, '/internal/ping'), {
    headers: { Authorization: 'Bearer ' },
  });
  assert.equal(response.status, 401);

  const body = await response.json();
  // Express may trim trailing whitespace from header values, causing 'Bearer '
  // to be received as 'Bearer' (no space) which hits the scheme check instead.
  // Both codes correctly reject the request with 401.
  assert.ok(
    body.code === 'MISSING_TOKEN' || body.code === 'MALFORMED_TOKEN',
    `Expected a 401 auth error code, got: ${body.code}`
  );
});
