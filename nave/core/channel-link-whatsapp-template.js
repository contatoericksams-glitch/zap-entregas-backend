"use strict";

const E164 = /^\+[1-9][0-9]{7,14}$/;
const CODE = /^[0-9]{6}$/;
const TEMPLATE = /^[a-z0-9_]{1,512}$/;
const LANGUAGE = /^[a-z]{2,3}(?:_[A-Z]{2})?$/;

function buildChannelLinkAuthTemplate({ phoneE164, code, templateName, language }) {
  if (typeof phoneE164 !== "string" || !E164.test(phoneE164) ||
      typeof code !== "string" || !CODE.test(code) ||
      typeof templateName !== "string" || !TEMPLATE.test(templateName) ||
      typeof language !== "string" || !LANGUAGE.test(language)) {
    throw new TypeError("Approved WhatsApp authentication template configuration required");
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phoneE164.slice(1),
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: code }],
        },
      ],
    },
  };
}

module.exports = { buildChannelLinkAuthTemplate };
