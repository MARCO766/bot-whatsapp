const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = "123456";

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('mode=', mode);
  console.log('token recibido=', JSON.stringify(token));
  console.log('verify token railway=', JSON.stringify(VERIFY_TOKEN));

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  } else {
    return res.status(403).send('Forbidden');
  }
});
// 🔥 PON AQUÍ TUS DATOS
const TOKEN = process.env.TOKEN;
const PHONE_ID = process.env.PHONE_ID;

app.post('/webhook', async (req, res) => {
  try {
    const change = req.body.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (!message || message.type !== "text" || !message.text?.body) {
  return res.sendStatus(200);
}

    const from = message.from;
    const text = (message.text?.body || "").trim().toLowerCase();

    let reply = "Hola 😊 escribe *hola*, *precio* o *comprar* para ayudarte";

if (text.includes("hola")) {
  reply = "Hola 😊\n\nTengo un pack de *4000 papercrafts* + 6 bonos 🎁\n\n👉 Escribe *precio* o *comprar* para continuar";
}
else if (text.includes("precio")) {
  reply = "💰 Solo *39 Bs* (pago único)\n\n📥 Acceso inmediato\n⚠️ Oferta por tiempo limitado";
}
else if (text.includes("comprar")) {
  reply = "💳 Métodos de pago:\n\n✅ QR\n✅ Tigo Money\n✅ Depósito bancario\n\n👉 ¿Cuál prefieres?";
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