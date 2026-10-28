"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createChannelLinkService } = require("./channel-link");

const userId = "123e4567-e89b-42d3-a456-426614174000";
const challengeId = "123e4567-e89b-42d3-a456-426614174001";
const phone = "+15551234567";
const secret = "test-only-secret-with-at-least-32-bytes";
function service(overrides = {}) {
  const calls = { saved: [], sent: [], verified: [] };
  const instance = createChannelLinkService({
    secret,
    enabled: true,
    findContactByPhone: async value => value === phone ? { id: "contact-1" } : null,
    createChallenge: async value => calls.saved.push(value),
    deliverCode: async value => calls.sent.push(value),
    invalidateChallenge: async value => { calls.invalidated = value; },
    confirmChallengeAtomic: async value => { calls.verified.push(value); return { linked: true }; },
    now: () => Date.parse("2026-10-23T12:00:00Z"),
    randomInt: () => 42,
    randomUUID: () => challengeId,
    ...overrides,
  });
  return { instance, calls };
}

test("disabled by default and sends nothing", async () => {
  const s = createChannelLinkService({
    secret, findContactByPhone: async () => ({ id: "c" }),
    createChallenge: async () => {}, deliverCode: async () => {}, invalidateChallenge: async () => {},
    confirmChallengeAtomic: async () => ({ linked: true }),
  });
  assert.deepEqual(await s.start({ userId, phoneE164: phone }), { accepted: false, reason: "disabled" });
});

test("stores only a digest and sends a six-digit code to a server-resolved contact", async () => {
  const { instance, calls } = service();
  const result = await instance.start({ userId, phoneE164: phone });
  assert.equal(result.accepted, true);
  assert.equal(result.challengeId, challengeId);
  assert.equal(calls.saved[0].contactId, "contact-1");
  assert.match(calls.saved[0].codeDigest, /^[a-f0-9]{64}$/);
  assert.equal("code" in calls.saved[0], false);
  assert.deepEqual(calls.sent[0], { contactId: "contact-1", phoneE164: phone, code: "000042" });
  assert.equal(Date.parse(calls.saved[0].expiresAt) - Date.parse("2026-10-23T12:00:00Z"), 600000);
});

test("does not reveal whether the WhatsApp contact exists", async () => {
  const { instance } = service({ findContactByPhone: async () => null });
  const result = await instance.start({ userId, phoneE164: phone });
  assert.deepEqual(result, { accepted: true, challengeId, expiresAt: "2026-10-23T12:10:00.000Z" });
});

test("rejects malformed app identity or phone before lookup", async () => {
  let lookups = 0;
  const { instance } = service({ findContactByPhone: async () => { lookups++; return null; } });
  assert.equal((await instance.start({ userId: "fake", phoneE164: phone })).accepted, false);
  assert.equal((await instance.start({ userId, phoneE164: "+12" })).accepted, false);
  assert.equal(lookups, 0);
});

test("does not return a code or link when delivery fails", async () => {
  const { instance, calls } = service({ deliverCode: async () => { throw new Error("provider unavailable"); } });
  assert.deepEqual(await instance.start({ userId, phoneE164: phone }), { accepted: false, reason: "delivery_failed" });
  assert.equal(calls.sent.length, 0);
  assert.deepEqual(calls.invalidated, { challengeId, userId });
});

test("confirmation is bound to the authenticated user and sends only a digest to atomic storage", async () => {
  const { instance, calls } = service();
  assert.deepEqual(await instance.confirm({ userId, challengeId, code: "000042" }), { linked: true });
  const [attempt] = calls.verified;
  assert.equal(attempt.userId, userId);
  assert.equal(attempt.challengeId, challengeId);
  assert.match(attempt.codeDigest, /^[a-f0-9]{64}$/);
  assert.equal("code" in attempt, false);
  assert.equal("contactId" in attempt, false);
});

test("rejects malformed confirmation and never invokes persistence", async () => {
  const { instance, calls } = service();
  const result = await instance.confirm({ userId: "fake", challengeId, code: "bad" });
  assert.deepEqual(result, { linked: false, reason: "invalid_request" });
  assert.equal(calls.verified.length, 0);
});

test("requires a high-entropy server secret", () => {
  assert.throws(() => createChannelLinkService({
    secret: "short", findContactByPhone() {}, createChallenge() {}, deliverCode() {}, invalidateChallenge() {}, confirmChallengeAtomic() {},
  }), /at least 32 bytes/);
});
