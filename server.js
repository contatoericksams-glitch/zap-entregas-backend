const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Teste para saber se o servidor está funcionando
app.get("/", (req, res) => {
  res.send("ZAP Entregas Inteligentes - servidor online");
});

// Verificação do webhook pela Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado pela Meta.");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Recebe eventos e mensagens do WhatsApp
app.post("/webhook", (req, res) => {
  console.log("Evento recebido do WhatsApp:");
  console.log(JSON.stringify(req.body, null, 2));

  // Confirma rapidamente o recebimento para a Meta
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Servidor ZAP rodando na porta ${PORT}`);
});
