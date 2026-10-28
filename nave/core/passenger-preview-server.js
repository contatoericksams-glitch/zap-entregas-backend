"use strict";
// Loopback-only preview. Does not load server.js, credentials, Supabase or Meta.
const express = require("express");
const path = require("node:path");
const { createPreviewRouter } = require("./preview-router");
const { createLocalDemoRouter } = require("./local-demo-router");
const app = express();
app.use(express.static(path.join(__dirname, "../public"), { index: false }));
app.use("/api/v5", createPreviewRouter());
app.use("/api/local-demo", createLocalDemoRouter());
app.listen(4317, "127.0.0.1", () => console.log("NAVE passageiro: http://127.0.0.1:4317/passageiro.html"));
