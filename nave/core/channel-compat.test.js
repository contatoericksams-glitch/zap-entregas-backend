"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeOrigin, normalizePreview, existingRecordReference } = require("./channel-compat");
test("WhatsApp requires contact identity", () => {
  assert.deepEqual(normalizeOrigin({channel:"whatsapp",contactId:"contact-1"}),{channel:"whatsapp",identityKind:"contact",identityId:"contact-1"});
  assert.throws(()=>normalizeOrigin({channel:"whatsapp",authUserId:"user-1"}), TypeError);
});
test("app and web require authenticated identity", () => {
  for (const channel of ["app","web"]) {
    assert.equal(normalizeOrigin({channel,authUserId:"user-1"}).identityKind,"auth_user");
    assert.throws(()=>normalizeOrigin({channel,contactId:"contact-1"}),TypeError);
  }
});
test("preview cannot become commercial ride", () => {
  const q=normalizePreview({channel:"web",authUserId:"user-1",category:"eco",distanceMeters:10000,durationSeconds:600});
  assert.equal(q.fareCents,2200);
  assert.equal(q.canonicalRideId,null);
  assert.equal(q.persist,false);
  assert.equal(q.dispatchEnabled,false);
  assert.equal(q.paymentEnabled,false);
});
test("source references do not fabricate canonical rides", () => {
  for (const channel of ["whatsapp","app","web"]) {
    const ref=existingRecordReference({channel,sourceId:"source-1"});
    assert.equal(ref.canonicalRideId,null);
    assert.equal(ref.sourceTable,channel==="whatsapp"?"nave_wa_ride_requests":"ride_quotes");
  }
});
test("invalid source and channel rejected", () => {
  assert.throws(()=>existingRecordReference({channel:"external",sourceId:"x"}),TypeError);
  assert.throws(()=>normalizeOrigin({channel:"external",authUserId:"x"}),RangeError);
});
