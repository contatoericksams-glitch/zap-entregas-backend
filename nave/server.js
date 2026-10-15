"use strict";

const express = require("express");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const { createPassengerFlow } = require("./flow");
const { createDriverPilot } = require("./driver_pilot");

const path = require("node:path");
const app = express();
// Páginas públicas de privacidade e exclusão de dados da NAVE.
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"], index: false }));
const config = {
  port: Number(process.env.PORT || 3000),
  verifyToken: process.env.WA_VERIFY_TOKEN || "",
  appSecret: process.env.META_APP_SECRET || "",
  phoneNumberId: process.env.META_PHONE_NUMBER_ID || "",
  accessToken: process.env.META_ACCESS_TOKEN || "",
  graphVersion: process.env.META_GRAPH_VERSION || "v26.0",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceRole: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
};

const supabase = config.supabaseUrl && config.supabaseServiceRole
  ? createClient(config.supabaseUrl, config.supabaseServiceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;
const driverPilot = supabase ? createDriverPilot(supabase, sendWhatsAppMessage) : null;
const handlePassengerMessage = supabase ? createPassengerFlow(supabase, driverPilot.onQuote) : null;

app.use(express.json({
  limit: "128kb",
  verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf); },
}));

const canReceive = () => process.env.NODE_ENV !== "staging" && Boolean(supabase && config.verifyToken && config.appSecret && config.phoneNumberId && config.accessToken);

app.get("/", (_req, res) => res.status(200).type("text/plain").send("NAVE | Canal WhatsApp em preparacao. Nenhuma corrida comercial habilitada."));
app.get("/healthz", (_req, res) => res.status(200).json({
  service: "nave-whatsapp",
  running: true,
  integrationReady: canReceive(),
  commercialRidesEnabled: false,
}));

app.get("/webhook", (req, res) => {
  if (process.env.NODE_ENV === "staging") return res.sendStatus(404); // Never verify production webhooks in homologation.
  if (!config.verifyToken) return res.sendStatus(503);
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === config.verifyToken && typeof challenge === "string") {
    return res.status(200).type("text/plain").send(challenge);
  }
  return res.sendStatus(403);
});

function validSignature(req) {
  if (!config.appSecret || !req.rawBody) return false;
  const signature = req.get("x-hub-signature-256");
  if (!signature || !/^sha256=[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", config.appSecret).update(req.rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected.toLowerCase()));
}

function userPhone(from) {
  if (typeof from !== "string" || !/^[1-9][0-9]{7,14}$/.test(from)) return null;
  return "+" + from;
}

async function sendWhatsAppMessage(to, message) {
  const menu = message && typeof message === "object" && (message.kind === "pilot_availability_menu" || message.kind === "pilot_offer_card");
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  const textPayload = { ...base, type: "text", text: {
    body: menu ? message.text : String(message || ""),
  }};
  const buttonPayload = menu ? {
    ...base, type: "interactive", interactive: {
      type: "button",
      body: { text: message.text },
      action: { buttons: message.buttons.map(b => ({
        type: "reply", reply: { id: b.id, title: b.title }
      })) },
    },
  } : null;
  async function send(payload) {
    return fetch(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
  }
  const response = await send(buttonPayload || textPayload);
  if (response.ok) return;
  if (buttonPayload) {
    // Compatibilidade: se a Meta rejeitar botões, o motorista continua com comandos por texto.
    console.error("NAVE interactive menu unavailable; using text fallback (HTTP " + response.status + ")");
    const fallback = await send(textPayload);
    if (fallback.ok) return;
    throw new Error("Meta message API text fallback HTTP " + fallback.status);
  }
  throw new Error("Meta message API HTTP " + response.status);
}

async function processWebhook(payload) {
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      if (value.metadata?.phone_number_id !== config.phoneNumberId) continue;
      for (const message of value.messages || []) {
        const from = userPhone(message.from);
        if (!from || !message.id) continue;

        const { data: contact, error: contactError } = await supabase
          .from("nave_wa_contacts").upsert(
            { phone_e164: from }, { onConflict: "phone_e164", ignoreDuplicates: true }
          ).select("id").single();

        let contactId = contact?.id;
        if (contactError || !contactId) {
          const found = await supabase.from("nave_wa_contacts").select("id").eq("phone_e164", from).single();
          if (found.error || !found.data) throw new Error("Could not fetch contact");
          contactId = found.data.id;
        }

        const { error: eventError } = await supabase.from("nave_wa_message_events").insert({
          meta_message_id: message.id,
          direction: "incoming",
          contact_id: contactId,
          event_type: message.type || "message",
          delivery_status: "received",
        });
        if (eventError?.code === "23505") continue; // duplicate delivery by Meta
        if (eventError) throw new Error("Could not store WhatsApp event");

        if (message.type === "text" || message.type === "location" || message.type === "interactive") {
          const pilotReply = message.type === "text" || message.type === "interactive"
            ? await driverPilot.handleDriverMessage(from, contactId, message)
            : null;
          const reply = pilotReply || (message.type === "interactive"
            ? "NAVE ⚡ Opção não reconhecida. Envie *STATUS PILOTO* para o menu de disponibilidade."
            : await handlePassengerMessage(contactId, message));
          await sendWhatsAppMessage(message.from, reply);
        } else {
          await sendWhatsAppMessage(message.from, "NAVE ⚡ Envie uma mensagem de texto ou a localização do WhatsApp. Digite 1 para simular uma corrida.");
        }
        await supabase.from("nave_wa_message_events")
          .update({ processed_at: new Date().toISOString(), delivery_status: "processed" })
          .eq("meta_message_id", message.id);
      }
    }
  }
}

app.post("/webhook", async (req, res) => {
  if (process.env.NODE_ENV === "staging") return res.sendStatus(404); // Never process production events in homologation.
  if (!canReceive()) return res.sendStatus(503);
  if (!validSignature(req)) return res.sendStatus(403);
  try {
    await processWebhook(req.body || {});
    return res.sendStatus(200);
  } catch (err) {
    console.error("WhatsApp event processing failed:", err.message); // Never log message content, phone or tokens.
    return res.sendStatus(500); // Meta may retry; event IDs prevent duplicate writes.
  }
});

// V5 staging API: local computations only, no persistence or outbound sends.
if (process.env.NODE_ENV === "staging") {
  const { createPreviewRouter } = require("./core/preview-router");
  app.use("/api/v5", createPreviewRouter());
}

// Safe preflight: booleans only, never return tokens, phone numbers or identities.
if (process.env.NODE_ENV === "staging") {
  app.get("/api/v5/pilot-readiness", (_req, res) => {
    const configured = {
      supabase: Boolean(config.supabaseUrl && process.env.SUPABASE_PUBLISHABLE_KEY),
      adminPublicKey: Boolean(process.env.SUPABASE_PUBLISHABLE_KEY),
      metaSender: Boolean(config.phoneNumberId && config.accessToken && /^\\+[1-9][0-9]{7,14}$/.test(process.env.NAVE_PILOT_TEST_PHONE_E164 || "")),
      optIn: process.env.NAVE_APP_PILOT_TEST_ENABLED === "true"
    };
    res.set("Cache-Control", "no-store").json({
      environment: "staging",
      notificationReady: Object.values(configured).every(Boolean),
      ...configured,
      commercialRidesEnabled: false
    });
  });
}

// V5 restricted test sender: admin MFA session + boolean RPC, no service-role key.
if (process.env.NODE_ENV === "staging" &&
    process.env.NAVE_APP_PILOT_TEST_ENABLED === "true" &&
    process.env.SUPABASE_PUBLISHABLE_KEY && config.phoneNumberId && config.accessToken) {
  const { createMasterAuth } = require("../central-master-v4/master-auth");
  const { createRestrictedPilotRouter } = require("./core/pilot-notify-restricted");
  const guard = createMasterAuth(config.supabaseUrl, process.env.SUPABASE_PUBLISHABLE_KEY);
  app.use("/api/v5", createRestrictedPilotRouter({
    requireMaster:guard, url:config.supabaseUrl,
    publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY,
    pilotPhone:process.env.NAVE_PILOT_TEST_PHONE_E164,
    sendMessage:sendWhatsAppMessage,enabled:true
  }));
}

app.listen(config.port, "0.0.0.0", () => console.log("NAVE WhatsApp server ready"));
