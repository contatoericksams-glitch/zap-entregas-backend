"use strict";
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), assert = require("node:assert/strict");
const { createAuthLabApp } = require("../core/auth-lab");
try {
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  const status = JSON.parse(fs.readFileSync(process.env.NAVE_TEST_STATUS_FILE, "utf8"));
  const url = status.API_URL || status.api_url; assert.equal(url, "http://127.0.0.1:54321");
  const app = createAuthLabApp({ url, publishableKey: status.ANON_KEY || status.anon_key, checkpointDirectory: path.join(process.env.RUNNER_TEMP, "nave-room-checkpoint") });
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1", () => process.send({ ready: server.address().port }));
  process.on("message", message => {
    if (message?.type === "stop") server.close(() => { app.locals.closeLab(); process.disconnect(); });
  });
} catch (_) {
  if (process.send) process.send({ error: "isolated_lab_start_failed" });
  process.exitCode = 1;
  if (process.connected) process.disconnect();
}
