"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const { fixtureTotp } = require("../ci/totp-fixture.cjs");
test("MFA fixture matches RFC 6238 SHA1 vectors reduced to six digits", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(fixtureTotp(secret, 59000), "287082");
  assert.equal(fixtureTotp(secret, 1111111109000), "081804");
  assert.equal(fixtureTotp(secret, 20000000000000), "353130");
  assert.throws(() => fixtureTotp("not-a-secret"));
});
