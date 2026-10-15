"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createVerifiedPilotPreview}=require("./verified-pilot");
const input={accessToken:"token",category:"confort",pickupLabel:"Centro Toledo",destinationLabel:"Lago Toledo",distanceMeters:999999,durationSeconds:999999};
const make=(verifyAccessToken,resolveRoute)=>createVerifiedPilotPreview({verifyAccessToken,resolveRoute});
test("authenticated preview ignores forged route inputs",async()=>{
 const handler=make(async()=>({userId:"test-user-123"}),async()=>({distanceMeters:5000,durationSeconds:600}));
 const x=await handler(input);
 assert.equal(x.identityVerified,true);assert.equal(x.fareCents,1635);
 assert.equal(x.persistEnabled,false);assert.equal(x.whatsappSendEnabled,false);
});
test("missing authenticated identity denied before routing",async()=>{
 let called=false;const handler=make(async()=>null,async()=>{called=true;return {distanceMeters:5000,durationSeconds:600}});
 await assert.rejects(handler(input),/Unauthenticated/);assert.equal(called,false);
});
test("invalid category and route refused",async()=>{
 const handler=make(async()=>({userId:"test-user-123"}),async()=>({distanceMeters:0,durationSeconds:600}));
 await assert.rejects(handler(input),RangeError);
 await assert.rejects(handler({...input,category:"eco"}),TypeError);
});
test("required server callbacks",()=>assert.throws(()=>createVerifiedPilotPreview({}),TypeError));
