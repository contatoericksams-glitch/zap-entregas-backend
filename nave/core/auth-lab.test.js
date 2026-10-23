"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createAuthLabApp, roleFor } = require("./auth-lab");

test("lab rejects hosted projects and user-editable role/approval metadata", () => {
  assert.throws(() => createAuthLabApp({ url: "https://example.supabase.co", publishableKey: "test" }));
  assert.equal(roleFor({ user_metadata: { nave_lab_role: "driver", nave_lab_driver_approved: true } }), null);
  assert.equal(roleFor({ app_metadata: { nave_lab_role: "driver" }, user_metadata: { nave_lab_driver_approved: true } }), null);
  assert.equal(roleFor({ app_metadata: { nave_lab_role: "driver", nave_lab_driver_approved: true } }), "driver");
});

test("Central requires admin plus MFA, remains read-only, and rechecks revoked role", async () => {
  const admin = { id: "admin-fixture", app_metadata: { nave_lab_role: "admin" } };
  const app = createAuthLabApp({ url: "http://127.0.0.1:54321", publishableKey: "test", makeClient: () => ({ auth: {
    getUser: async token => ({ data: { user: token.startsWith("admin-") ? admin : { id: "p", app_metadata: { nave_lab_role: "passenger" }, user_metadata: { nave_lab_role: "admin" } } } }),
    signInWithPassword: async () => ({ data: { user: admin, session: { access_token: "admin-aal1" } } }),
    mfa: {
      getAuthenticatorAssuranceLevel: async token => ({ data: { currentLevel: token === "admin-aal2" ? "aal2" : "aal1", nextLevel: "aal2" } }),
      listFactors: async () => ({ data: { totp: [{ id: "fixture-factor", status: "verified" }] } }),
      challengeAndVerify: async ({ code }) => code === "123456" ? { data: { access_token: "admin-aal2" } } : { error: true },
    },
  } }) });
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const call = (token, method = "GET", body) => fetch(base + "/api/auth-lab/room", { method, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: body ? JSON.stringify({ requestKey: require("node:crypto").randomUUID(), ...body }) : undefined });
  const login = code => fetch(base + "/api/auth-lab/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@example.invalid", password: "fixture-only", ...(code ? { code } : {}) }) });
  try {
    assert.equal((await call("admin-aal1")).status, 403);
    assert.equal((await login()).status, 403);
    assert.equal((await login("000000")).status, 403);
    const loggedIn = await login("123456"); assert.equal(loggedIn.status, 200); assert.equal((await loggedIn.json()).role, "observer");
    const initial = await (await call("admin-aal2")).json();
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.equal((await call("admin-aal2", method, { role: "driver", action: "availability", available: true, roomId: initial.roomId, version: -1 })).status, 403);
    }
    assert.deepEqual(await (await call("admin-aal2")).json(), initial);
    admin.app_metadata.nave_lab_role = null;
    assert.equal((await call("admin-aal2")).status, 403);
    assert.equal(roleFor({ user_metadata: { nave_lab_role: "admin" } }), null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("authenticated room binds roles and ownership before disclosing conflicts", async () => {
  const users = { p: { id: "passenger", app_metadata: { nave_lab_role: "passenger" } }, other: { id: "other", app_metadata: { nave_lab_role: "passenger" } }, d: { id: "driver", app_metadata: { nave_lab_role: "driver", nave_lab_driver_approved: true } }, pending: { id: "pending", app_metadata: { nave_lab_role: "driver" } } };
  const app = createAuthLabApp({ url: "http://127.0.0.1:54321", publishableKey: "test", makeClient: () => ({ auth: { getUser: async token => ({ data: { user: users[token] } }), signInWithPassword: async ({ password }) => ({ data: { user: users[password], session: users[password] ? { access_token: password } : null } }) } }) });
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (token, body) => {
    const r = await fetch(base + "/api/auth-lab/room", { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: body ? JSON.stringify({ requestKey: require("node:crypto").randomUUID(), ...body }) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  try {
    assert.equal((await call("invalid")).status, 401);
    assert.equal((await call("pending")).status, 403);
    const { roomId } = (await call("p")).data;
    assert.equal((await call("p", { roomId, role: "driver", action: "availability", available: true, version: 0 })).status, 403);
    assert.equal((await call("d", { roomId, role: "driver", action: "availability", available: true, version: 0 })).status, 200);
    assert.equal((await call("p", { roomId, role: "passenger", action: "start", category: "eco", version: 1 })).status, 200);
    assert.equal((await call("other")).status, 403);
    assert.equal((await call("other", { roomId, role: "passenger", action: "cancel", version: 0 })).status, 403);
    for (const [i, action] of ["accept", "arrive", "board", "complete"].entries()) assert.equal((await call("d", { roomId, role: "driver", action, version: 2 + i })).status, 200);
    assert.equal((await call("p")).data.journey.phase, "completed");
    users.d.app_metadata.nave_lab_driver_approved = false;
    assert.equal((await call("d")).status, 403, "Approval is checked again using current getUser result");
    const cross = await fetch(base + "/api/auth-lab/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://other.example" }, body: JSON.stringify({ email: "test@example.invalid", password: "p" }) });
    assert.equal(cross.status, 403);
    const login = async body => fetch(base + "/api/auth-lab/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await login({ email: "test@example.invalid", password: "p", role: "driver" })).status, 400);
    assert.equal((await login({ email: "real@example.com", password: "p" })).status, 400);
    const success = await login({ email: "test@example.invalid", password: "p" });
    assert.deepEqual(Object.keys(await success.json()).sort(), ["accessToken", "role", "testOnly"]);
    for (let i = 0; i < 11; i++) assert.equal((await login({ email: "test@example.invalid", password: "wrong" })).status, 401);
    assert.equal((await login({ email: "test@example.invalid", password: "p" })).status, 429);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
