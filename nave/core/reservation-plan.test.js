"use strict";
const assert=require("node:assert/strict");
const {test}=require("node:test");
const {prepareTestReservation}=require("./reservation-plan");
const request={channel:"whatsapp",contactId:"contact-1",idempotencyKey:"client-request-0001"};
test("same request yields same hash",()=>{
 const a=prepareTestReservation(request),b=prepareTestReservation(request);
 assert.equal(a.keyDigest,b.keyDigest); assert.equal(a.keyDigest.length,64);
});
test("different identity cannot collide through same request key",()=>{
 const a=prepareTestReservation(request);
 const b=prepareTestReservation({...request,contactId:"contact-2"});
 assert.notEqual(a.keyDigest,b.keyDigest);
});
test("different channel separated",()=>{
 const a=prepareTestReservation(request);
 const b=prepareTestReservation({channel:"web",authUserId:"contact-1",idempotencyKey:"client-request-0001"});
 assert.notEqual(a.keyDigest,b.keyDigest);
});
test("unsafe or missing keys rejected",()=>{
 assert.throws(()=>prepareTestReservation({...request,idempotencyKey:""}),TypeError);
 assert.throws(()=>prepareTestReservation({...request,idempotencyKey:"bad key"}),TypeError);
});
test("persisting remains impossible",()=>{
 const plan=prepareTestReservation(request);
 assert.equal(plan.writeAllowed,false); assert.equal(plan.destinationTable,null);
 assert.equal(plan.commercialEnabled,false);assert.equal(plan.quoteIsTestOnly,true);
});
