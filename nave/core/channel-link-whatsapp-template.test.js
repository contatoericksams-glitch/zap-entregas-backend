"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildChannelLinkAuthTemplate } = require("./channel-link-whatsapp-template");

test("builds only an authentication template payload with the same OTP in body and copy-code button", () => {
  const payload = buildChannelLinkAuthTemplate({
    phoneE164: "+5545999999999",
    code: "001234",
    templateName: "nave_auth_code",
    language: "pt_BR",
  });
  assert.equal(payload.type, "template");
  assert.equal(payload.to, "5545999999999");
  assert.equal(payload.template.name, "nave_auth_code");
  assert.equal(payload.template.language.code, "pt_BR");
  assert.deepEqual(payload.template.components, [
    { type: "body", parameters: [{ type: "text", text: "001234" }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "001234" }] },
  ]);
  assert.equal("text" in payload, false);
});

test("rejects malformed phone, OTP, template name, and locale", () => {
  const valid = { phoneE164: "+5545999999999", code: "001234", templateName: "nave_auth_code", language: "pt_BR" };
  for (const update of [
    { phoneE164: "5545999999999" },
    { code: "1234" },
    { templateName: "NAVE AUTH" },
    { language: "pt-br" },
  ]) {
    assert.throws(() => buildChannelLinkAuthTemplate({ ...valid, ...update }), /authentication template configuration required/);
  }
});
