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

  if (mode && token === VERIFY_TOKEN) {
    return res.send(challenge);
  } else {
    res.sendStatus(403);
  }
});
// 🔥 PON AQUÍ TUS DATOS
const TOKEN = 'EAAjXfdJsgp0BRAiwxiXk1EZCHeRko6L9K2ZBPuk8TodylDjEH8RIKvy1s4GLtexEEPvL1YMIZALTKOgHPFVNkcUPsES96ZBRpd6qsDYIpS4TV7UuUfhVc6YDUXMDnNZBWjMBw54kPZCzaU2YXU29lJLIYQVGOdd2TdjL7kWJZCKMxmkI76geDZBES2NT3ZBRZCI2b1wDRwPgj7AgfrGmXAc3EgYatUGI5GPTXIxjOnR5aRAL1Q83EAOGZAQ5tZCedcyiB1mTzVcMWIEYmbFwgnj5kZBL0';
const PHONE_ID = '1154429667735151';

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

app.listen(3000, () => {
    console.log("🚀 Servidor corriendo en puerto 3000");
});