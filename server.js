const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    return res.send(challenge);
  } else {
    res.sendStatus(403);
  }
});
// 🔥 PON AQUÍ TUS DATOS
const TOKEN = process.env.TOKEN;
const PHONE_ID = process.env.PHONE_ID;

app.post('/webhook', async (req, res) => {
  try {
    const change = req.body.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = (message.text?.body || "").trim().toLowerCase();

    let reply = "No entendí 🤔\n\nEscribe:\n1 Ver contenido\n2 Precio\n3 Métodos de pago";

    if (text === "hola") {
      reply = "Hola 👋\n\nEscribe:\n1 Ver contenido\n2 Precio\n3 Métodos de pago";
    } else if (text === "1") {
      reply = "📁 El contenido incluye plantillas y material digital listo para usar.";
    } else if (text === "2") {
      reply = "💰 El precio es 29 Bs, pago único.";
    } else if (text === "3") {
      reply = "💳 Puedes pagar por QR, depósito bancario o Tigo Money.";
    }

    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply }
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.sendStatus(200);
  } catch (error) {
    console.log("Error:", error.response?.data || error.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Servidor corriendo en puerto", PORT);
});