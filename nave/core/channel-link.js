"use strict";

// Domain boundary for linking an authenticated app user to an existing WhatsApp
// contact. Persistence and delivery are injected so tests never touch Supabase
// or Meta. The production adapter must implement confirmation atomically.
const crypto = require("node:crypto");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const E164 = /^\+[1-9][0-9]{7,14}$/;
const CODE = /^[0-9]{6}$/;

function createChannelLinkService({
  secret,
  findContactByPhone,
  createChallenge,
  deliverCode,
  invalidateChallenge,
  confirmChallengeAtomic,
  now = () => Date.now(),
  randomInt = crypto.randomInt,
  randomUUID = crypto.randomUUID,
  enabled = false,
}) {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
    throw new TypeError("Channel-link secret must contain at least 32 bytes");
  }
  for (const [name, fn] of Object.entries({
    findContactByPhone, createChallenge, deliverCode, invalidateChallenge, confirmChallengeAtomic,
  })) {
    if (typeof fn !== "function") throw new TypeError(`${name} adapter required`);
  }

  const digest = (challengeId, userId, code) => crypto
    .createHmac("sha256", secret)
    .update(`${challengeId}:${userId.toLowerCase()}:${code}`)
    .digest("hex");

  return Object.freeze({
    async start({ userId, phoneE164 }) {
      if (!enabled) return { accepted: false, reason: "disabled" };
      if (typeof userId !== "string" || !UUID.test(userId) ||
          typeof phoneE164 !== "string" || !E164.test(phoneE164)) {
        return { accepted: false, reason: "invalid_request" };
      }

      // Phone ownership is proved by entering the code in the signed-in app.
      // The contact lookup and Meta destination must stay server-side.
      const contact = await findContactByPhone(phoneE164);
      const challengeId = randomUUID();
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const expiresAt = new Date(now() + 10 * 60 * 1000).toISOString();

      await createChallenge({
        challengeId,
        userId: userId.toLowerCase(),
        contactId: contact?.id ?? null,
        codeDigest: digest(challengeId, userId, code),
        expiresAt,
        maxAttempts: 5,
      });

      // Keep the HTTP response identical whether a matching WhatsApp contact
      // exists, to avoid exposing contact registration state.
      if (contact?.id) {
        try {
          await deliverCode({ contactId: contact.id, phoneE164, code });
        } catch {
          // Do not leave a usable challenge when delivery fails.
          await invalidateChallenge({ challengeId, userId: userId.toLowerCase() });
          return { accepted: false, reason: "delivery_failed" };
        }
      }
      return { accepted: true, challengeId, expiresAt };
    },

    async confirm({ userId, challengeId, code }) {
      if (!enabled) return { linked: false, reason: "disabled" };
      if (typeof userId !== "string" || !UUID.test(userId) ||
          typeof challengeId !== "string" || !UUID.test(challengeId) ||
          typeof code !== "string" || !CODE.test(code)) {
        return { linked: false, reason: "invalid_request" };
      }
      // The adapter must lock the challenge row, count failed attempts, reject
      // expired/consumed challenges, and insert the unique user/contact link in
      // the same transaction. A caller-supplied contact ID is never accepted.
      return confirmChallengeAtomic({
        challengeId,
        userId: userId.toLowerCase(),
        codeDigest: digest(challengeId, userId, code),
        now: new Date(now()).toISOString(),
      });
    },
  });
}

module.exports = { createChannelLinkService };
