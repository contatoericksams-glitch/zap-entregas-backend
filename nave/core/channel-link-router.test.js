"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const { createChannelLinkRouter } = require("./channel-link-router");

async function request({ enabled = true, tokenValid = true, userId = "123e4567-e89b-42d3-a456-426614174000", channelLink, method = "POST", path = "/api/channel-link/start", body = { phoneE164: "+15551234567" }, authorization = "Bearer test-token" } = {}) {
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use("/api", createChannelLinkRouter({
    enabled,
    url: "https://staging.example",
    publishableKey: "staging-publishable",
    makeClient: (url, key, options) => {
      calls.push({ url, key, options });
      return { auth: { getUser: async token => tokenValid
        ? { data: { user: { id: userId } }, error: null }
        : { data: { user: null }, error: { message: "invalid token" } } } };
    },
    channelLink: channelLink || {
      start: async input => { calls.push({ start: input }); return { accepted: true, challengeId: "123e4567-e89b-42d3-a456-426614174001", expiresAt: "2026-10-23T12:10:00.000Z" }; },
      confirm: async input => { calls.push({ confirm: input }); return { linked: true }; },
    },
  }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization },
      body: method === "GET" ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null), headers: response.headers, calls };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("channel-link API is absent unless explicitly enabled", async () => {
  const result = await request({ enabled: false });
  assert.equal(result.status, 404);
  assert.equal(result.calls.length, 0);
});

test("start requires a Supabase-verified bearer user and binds the server identity", async () => {
  const denied = await request({ tokenValid: false });
  assert.equal(denied.status, 401);
  assert.equal(denied.calls.some(call => call.start), false);

  const accepted = await request();
  assert.equal(accepted.status, 202);
  assert.deepEqual(accepted.calls.find(call => call.start).start, {
    userId: "123e4567-e89b-42d3-a456-426614174000",
    phoneE164: "+15551234567",
  });
  assert.equal(accepted.headers.get("cache-control"), "no-store");
});

test("start rejects caller-supplied user IDs and malformed payloads", async () => {
  const result = await request({ body: { userId: "attacker", phoneE164: "+15551234567" } });
  assert.equal(result.status, 400);
  assert.equal(result.calls.some(call => call.start), false);
});

test("confirm binds to authenticated user and returns only link state", async () => {
  const result = await request({
    path: "/api/channel-link/confirm",
    body: { challengeId: "123e4567-e89b-42d3-a456-426614174001", code: "001234" },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { linked: true });
  assert.deepEqual(result.calls.find(call => call.confirm).confirm, {
    userId: "123e4567-e89b-42d3-a456-426614174000",
    challengeId: "123e4567-e89b-42d3-a456-426614174001",
    code: "001234",
  });
});

test("missing bearer token is rejected before any channel-link operation", async () => {
  const result = await request({ authorization: "" });
  assert.equal(result.status, 401);
  assert.equal(result.calls.some(call => call.start), false);
});

test("router requires isolated staging auth configuration when enabled", () => {
  assert.throws(() => createChannelLinkRouter({ enabled: true }), /staging configuration required/);
});
