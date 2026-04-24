const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const mensajesProcesados = new Set();
app.use(bodyParser.json());

// 🔑 VARIABLES (Railway)
const TOKEN = process.env.TOKEN;
const PHONE_ID = process.env.PHONE_ID;

// 🔐 VERIFICACIÓN WEBHOOK
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = "123456";

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// 📩 RECIBIR MENSAJES
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

// 🚫 Ignorar estados (read, delivered, etc)
if (value?.statuses) {
  return res.sendStatus(200);
}
// 🚫 evitar errores y duplicados
if (!value || !value.messages || !value.messages[0]) {
  return res.sendStatus(200);
}

    const message = value.messages[0];
if (mensajesProcesados.has(message.id)) {
  return res.sendStatus(200);
}
mensajesProcesados.add(message.id);

    // 🚫 solo texto
    if (message.type !== "text" || !message.text?.body) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text.body.toLowerCase();

    // =============================
    // 💬 BLOQUE PRINCIPAL (HOLA)
    // =============================
    if (text.includes("hola") || text.includes("info")) {

      // 🥇 MENSAJE 1
      await axios.post(
        `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: {
            body: `Hola 😊 ¡Gracias por escribirnos!

Te cuento lo que incluye nuestro pack especial 🔥🔥👇👇

📘 +10.000 patrones de amigurumis listos para tejer
🎁 Perfecto para vender o emprender
🧶 Para principiantes y avanzados
⚡ Acceso digital inmediato`
          }
        },
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      // ⏱️ ESPERA 2 SEGUNDOS
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 🥈 MENSAJE 2
      await axios.post(
        `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: {
            body: `Y además del pack principal, hoy te llevas 5 BONOS DE REGALO 🎁 totalmente GRATIS:

🎁 Bono 1: guía para leer patrones en otros idiomas y traductores
🎁 Bono 2: 5000+ patrones extra en diferentes idiomas fáciles de leer con la guía multilenguas
🎁 Bono 3: videoclases desde cero para principiantes explicado paso a paso
🎁 Bono 4: patrones de llaveros 
🎁 Bono 5: e-book y guía para aprender a tejer puntos

✨ Todo se desbloquea automáticamente después del pago
⚡ Acceso digital inmediato
🔥 Sin costos extra
👉 Aprovecha ahora antes que termine la promo
ANTES 150bs 
🔥🔥 *AHORA 29bs* 🔥🔥
👉 Elige método de pago:

QR
DEPOSITO BANCARIO
TIGO MONEY`
          }
        },
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      return res.sendStatus(200);
    }

    // =============================
    // 💳 RESPUESTAS SEGÚN OPCIÓN
    // =============================

    let reply = "";

    if (text.includes("qr")) {
      reply = "Perfecto 👍 aquí tienes el QR para pagar:";
    } 
    else if (text.includes("deposito")) {
      reply = "Perfecto 👍 estos son los datos bancarios:";
    } 
    else if (text.includes("tigo")) {
      reply = "Perfecto 👍 este es el número para Tigo Money:";
    }

    if (reply !== "") {
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
    }

    res.sendStatus(200);

  } catch (error) {
    console.log("ERROR:", error.response?.data || error.message);
    res.sendStatus(200);
  }
});

// 🚀 SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Servidor corriendo en puerto", PORT);
});