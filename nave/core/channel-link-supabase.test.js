"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createChannelLinkSupabaseAdapters } = require("./channel-link-supabase");

function fakeClient() {
  const calls = [];
  const client = {
    from(table) {
      const query = {
        select(columns) { calls.push({ kind: "select", table, columns }); return query; },
        eq(column, value) { calls.push({ kind: "eq", column, value }); return query; },
        async maybeSingle() { calls.push({ kind: "maybeSingle" }); return { data: { id: "contact-1" }, error: null }; },
      };
      return query;
    },
    async rpc(name, args) { calls.push({ kind: "rpc", name, args }); return { data: { linked: true }, error: null }; },
  };
  return { client, calls };
}

test("adapters resolve contacts server-side and map atomic SQL RPCs", async () => {
  const { client, calls } = fakeClient();
  const delivered = [];
  const adapters = createChannelLinkSupabaseAdapters({ supabase: client, deliverCode: async value => delivered.push(value) });

  assert.deepEqual(await adapters.findContactByPhone("+15551234567"), { id: "contact-1" });
  await adapters.createChallenge({
    challengeId: "123e4567-e89b-42d3-a456-426614174001",
    userId: "123e4567-e89b-42d3-a456-426614174000",
    contactId: "contact-1",
    codeDigest: "a".repeat(64),
    expiresAt: "2026-10-23T12:10:00.000Z",
    maxAttempts: 5,
  });
  await adapters.invalidateChallenge({ challengeId: "challenge", userId: "user" });
  const result = await adapters.confirmChallengeAtomic({
    challengeId: "challenge", userId: "user", codeDigest: "b".repeat(64), now: "2026-10-23T12:01:00.000Z",
  });
  await adapters.deliverCode({ contactId: "contact-1", code: "000042" });

  assert.equal(result.linked, true);
  assert.deepEqual(delivered, [{ contactId: "contact-1", code: "000042" }]);
  assert.deepEqual(calls.filter(call => call.kind === "rpc").map(call => call.name), [
    "nave_channel_link_create_challenge",
    "nave_channel_link_invalidate_challenge",
    "nave_channel_link_confirm_challenge",
  ]);
  assert.deepEqual(calls.filter(call => call.kind === "eq").map(call => [call.column, call.value]), [
    ["phone_e164", "+15551234567"], ["is_driver", false],
  ]);
  const create = calls.find(call => call.name === "nave_channel_link_create_challenge");
  assert.equal(create.args.p_code_digest, "a".repeat(64));
  assert.equal("p_code" in create.args, false);
  const confirm = calls.find(call => call.name === "nave_channel_link_confirm_challenge");
  assert.equal(confirm.args.p_code_digest, "b".repeat(64));
  assert.equal("p_code" in confirm.args, false);
  assert.equal("p_contact_id" in confirm.args, false);
});

test("adapter surfaces Supabase lookup and RPC failures", async () => {
  const { client } = fakeClient();
  client.rpc = async () => ({ data: null, error: { message: "db unavailable" } });
  client.from = () => ({
    select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: null, error: { message: "lookup failed" } }; },
  });
  const adapters = createChannelLinkSupabaseAdapters({ supabase: client, deliverCode: async () => {} });

  await assert.rejects(adapters.findContactByPhone("+15551234567"), /contact lookup failed/);
  await assert.rejects(adapters.invalidateChallenge({ challengeId: "x", userId: "y" }), /db unavailable/);
});

test("adapter requires a server client and an explicit delivery adapter", () => {
  assert.throws(() => createChannelLinkSupabaseAdapters({ supabase: {}, deliverCode() {} }), /server client required/);
  assert.throws(() => createChannelLinkSupabaseAdapters({ supabase: fakeClient().client }), /delivery adapter required/);
});
