"use strict";

const express = require("express");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const { createPassengerFlow } = require("./flow");

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
const handlePassengerMessage = supabase ? createPassengerFlow(supabase) : null;

app.use(express.json({
  limit: "128kb",
  verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf); },
}));

const canReceive = () => Boolean(supabase && config.verifyToken && config.appSecret && config.phoneNumberId && config.accessToken);

app.get("/", (_req, res) => res.status(200).type("text/plain").send("NAVE | Canal WhatsApp em preparacao. Nenhuma corrida comercial habilitada."));
app.get("/healthz", (_req, res) => res.status(200).json({
  service: "nave-whatsapp",
  running: true,
  integrationReady: canReceive(),
  commercialRidesEnabled: false,
}));

app.get("/webhook", (req, res) => {
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
  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: message },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Meta message API HTTP ${response.status}`);
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

        if (message.type === "text" || message.type === "location") {
          const reply = await handlePassengerMessage(contactId, message);
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

app.listen(config.port, "0.0.0.0", () => console.log("NAVE WhatsApp server ready"));
