"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { createPreviewRouter } = require("./preview-router");
async function request(body) {
  const app = express();
  app.use("/api/v5", createPreviewRouter());
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const response = await fetch("http://127.0.0.1:" + port + "/api/v5/quote-preview", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  } finally { await new Promise(resolve => server.close(resolve)); }
}
test("app web whatsapp share identical test quote", async () => {
  const results = [];
  for (const channel of ["app", "web", "whatsapp"]) {
    const r = await request({ channel, category: "eco", distanceMeters: 10000, durationSeconds: 600 });
    assert.equal(r.status, 200); assert.equal(r.data.quoteIsTestOnly, true);
    assert.equal(r.data.dispatch, "disabled"); assert.equal(r.data.storage, "none");
    results.push(r.data.fareCents);
  }
  assert.deepEqual(results, [2200, 2200, 2200]);
});
test("rejects malformed request and unexpected channel", async () => {
  assert.equal((await request({channel:"public",category:"eco",distanceMeters:1000,durationSeconds:60})).status, 400);
  assert.equal((await request({channel:"web",category:"eco",distanceMeters:-1,durationSeconds:60})).status, 400);
});
