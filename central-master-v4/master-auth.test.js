"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createMasterAuth } = require("./master-auth");

function check({ header, user = true, aal = "aal2", nextAal = "aal2", admin = true, roleError = null, mfaError = null }) {
  const req = { get: () => header };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }, sendStatus(code) { this.statusCode = code; return this; } };
  let passed = false;
  const factory = (_url, _key, opts) => {
    assert.equal(opts.auth.persistSession, false);
    return { auth: {
      getUser: async () => ({ data: { user: user ? { id: "test-id" } : null }, error: null }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: aal, nextLevel: nextAal }, error: mfaError }) }
    }, rpc: async () => ({ data: admin, error: roleError }) };
  };
  const middleware = createMasterAuth("https://example.supabase.co", "test-publishable-key", factory);
  return middleware(req, res, () => { passed = true; }).then(() => ({ res, req, passed }));
}
test("missing bearer token is denied", async () => {
  const r = await check({ header: "" }); assert.equal(r.res.statusCode, 401); assert.equal(r.passed, false);
});
test("invalid session is denied", async () => {
  const r = await check({ header: "Bearer abc", user: false }); assert.equal(r.res.statusCode, 401);
});
test("single factor session is denied", async () => {
  const r = await check({ header: "Bearer abc", aal: "aal1" }); assert.equal(r.res.statusCode, 403);
});
test("stale assurance is denied", async () => {
  const r = await check({ header: "Bearer abc", nextAal: "aal1" }); assert.equal(r.res.statusCode, 403);
});
test("non admin is denied", async () => {
  const r = await check({ header: "Bearer abc", admin: false }); assert.equal(r.res.statusCode, 403);
});
test("role-check failure fails closed", async () => {
  const r = await check({ header: "Bearer abc", roleError: { message: "unavailable" } }); assert.equal(r.res.statusCode, 503);
});
test("MFA-check failure fails closed", async () => {
  const r = await check({ header: "Bearer abc", mfaError: { message: "unavailable" } }); assert.equal(r.res.statusCode, 503);
});
test("authenticated MFA admin is allowed", async () => {
  const r = await check({ header: "Bearer abc" }); assert.equal(r.passed, true); assert.equal(r.req.masterUserId, "test-id");
});
