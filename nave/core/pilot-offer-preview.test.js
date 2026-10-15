"use strict";
const assert = require("node:assert/strict");
const {test}=require("node:test");
const {preparePilotOfferPreview}=require("./pilot-offer-preview");
const request={channel:"app",category:"confort",pickupLabel:"Centro",destinationLabel:"Lago",distanceMeters:5000,durationSeconds:600};
test("preview for app Confort has no side effects",()=> {
 const x=preparePilotOfferPreview(request);
 assert.equal(x.testOnly,true);assert.equal(x.whatsappSendEnabled,false);
 assert.equal(x.persistEnabled,false);assert.equal(x.driverDispatchEnabled,false);
 assert.match(x.messagePreview,/NAO SE DESLOQUE/);
});
test("rejects other categories and channels",()=> {
 assert.throws(()=>preparePilotOfferPreview({...request,category:"eco"}),TypeError);
 assert.throws(()=>preparePilotOfferPreview({...request,channel:"web"}),TypeError);
});
test("rejects invalid locations",()=> {
 assert.throws(()=>preparePilotOfferPreview({...request,pickupLabel:""}),TypeError);
});
