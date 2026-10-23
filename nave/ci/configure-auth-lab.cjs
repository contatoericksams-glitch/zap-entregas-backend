"use strict";
// Enable TOTP only in the newly generated, unlinked runner fixture.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
assert.equal(process.env.GITHUB_ACTIONS, "true");
const target = path.resolve(process.argv[2]);
assert.equal(target, path.resolve(process.env.RUNNER_TEMP, "nave-auth-lab/supabase/config.toml"));
const source = fs.readFileSync(target, "utf8");
const pattern = /(\[auth\.mfa\.totp\]\r?\n)enroll_enabled = false\r?\nverify_enabled = false/g;
assert.equal([...source.matchAll(pattern)].length, 1, "Expected pinned CLI TOTP section");
fs.writeFileSync(target, source.replace(pattern, "$1enroll_enabled = true\nverify_enabled = true"));
