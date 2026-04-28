const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const seguimientos = {};
const seguimientoDescuento = {};
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
const nombre = value.contacts?.[0]?.profile?.name || "amiga";
if (mensajesProcesados.has(message.id)) {
  return res.sendStatus(200);
}
mensajesProcesados.add(message.id);

    
    const from = message.from;

    let text = "";

if (text.includes("reset")) {

  seguimientos[from] = false;
  seguimientoDescuento[from] = false;

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      text: {
        body: "🔄 Conversación reiniciada. Ya puedes probar como cliente nuevo."
      }
    },
    {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }
  );

  return res.sendStatus(200);
}

if (message.type === "text") {
  text = message.text.body.toLowerCase();
}

if (message.type === "interactive") {
  text = message.interactive.button_reply.id.toLowerCase();
}

if (
  text.includes("ya pague") ||
  text.includes("ya pagué") ||
  text.includes("comprobante")
) {
  seguimientos[from] = false;
}
    // =============================
    // 💬 BLOQUE PRINCIPAL (HOLA)
    // =============================
    if (
  (text.includes("HOLA") || text.includes("INFORMACION")) &&
  !seguimientos[from] &&
  !seguimientoDescuento[from]
) {

      // 🥇 MENSAJE 1
      await axios.post(
        `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: {
            body: `Hola ${nombre} 😊 ¡Gracias por escribirnos!

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

// ⏳ espera
await new Promise(r => setTimeout(r, 1500));


// 🔹 IMAGEN 1
await axios.post(
  `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
  {
    messaging_product: "whatsapp",
    to: from,
    type: "image",
    image: {
      link: "https://i.ibb.co/pBmztCJy/Whats-App-Image-2026-04-24-at-9-13-39-PM.jpg"
    }
  },
  { headers: { Authorization: `Bearer ${TOKEN}` } }
);

// ⏳ espera
await new Promise(r => setTimeout(r, 1500));


// 🔹 IMAGEN 2
await axios.post(
  `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
  {
    messaging_product: "whatsapp",
    to: from,
    type: "image",
    image: {
      link: "https://i.ibb.co/0pTs97nP/Whats-App-Image-2026-04-24-at-9-13-46-PM.jpg"
    }
  },
  { headers: { Authorization: `Bearer ${TOKEN}` } }
);

// ⏳ espera
await new Promise(r => setTimeout(r, 1500));


// 🔹 IMAGEN 3
await axios.post(
  `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
  {
    messaging_product: "whatsapp",
    to: from,
    type: "image",
    image: {
      link: "https://i.ibb.co/FqzxpS5F/Whats-App-Image-2026-04-24-at-9-13-47-PM-1.jpg"
    }
  },
  { headers: { Authorization: `Bearer ${TOKEN}` } }
);

// ⏳ espera
await new Promise(r => setTimeout(r, 1500));


// 🔹 IMAGEN 4
await axios.post(
  `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
  {
    messaging_product: "whatsapp",
    to: from,
    type: "image",
    image: {
      link: "https://i.ibb.co/zTThJgmj/Whats-App-Image-2026-04-24-at-9-13-47-PM-2.jpg"
    }
  },
  { headers: { Authorization: `Bearer ${TOKEN}` } }
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
ANTES 100bs 
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

seguimientos[from] = true;

// ⏱️ Seguimiento 1 (5 min)
setTimeout(async () => {
  if (!seguimientos[from]) return;

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      text: { body: "👀 ¿Sigues interesada? Este pack está ayudando a muchas personas a generar ingresos 🔥" }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}, 1 * 60 * 1000);


// ⏱️ Seguimiento 2 (10 min)
setTimeout(async () => {
  if (!seguimientos[from]) return;

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      text: { body: "💡 Puedes empezar desde cero y vender amigurumis fácilmente 😏" }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}, 2 * 60 * 1000);


// ⏱️ Seguimiento 3 (20 min)
setTimeout(async () => {
  if (!seguimientos[from]) return;

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      text: { body: "🔥 Hoy está en solo 29 Bs\n\n👉 Escribe tu metodo de pago si quieres aprovechar la oferta" }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}, 3 * 60 * 1000);


// ⏱️ Seguimiento 4 (30 min)
setTimeout(async () => {
  if (!seguimientos[from]) return;

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      text: { body: "⚠️ La promo puede subir de precio en cualquier momento" }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}, 4 * 60 * 1000);


// ⏱️ Seguimiento 5 (60 min)
setTimeout(async () => {
  if (!seguimientos[from]) return;

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      text: { body: "😢 Último aviso\n\n¿Quieres que te pase el QR para pagar ahora?" }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}, 5 * 60 * 1000);

// ⏱️ REMARKETING FINAL (22 horas)
setTimeout(async () => {
  if (!seguimientos[from]) return;

// 🖼️ ENVÍA IMAGEN PRIMERO
await axios.post(
  `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
  {
    messaging_product: "whatsapp",
    to: from,
    type: "image",
    image: {
      link: "https://i.ibb.co/S73YCqqH/Gemini-Generated-Image-5hmq935hmq935hmq.png",
      caption: "🔥 SOLO POR HOY🔥"
    }
  },
  {
    headers: { Authorization: `Bearer ${TOKEN}` }
  }
);

// pequeña pausa
await new Promise(r => setTimeout(r, 2000));

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: `🔥 SOLO POR HOY 🔥

ANTES: 29 Bs
HOY: 19 Bs 💸

Toca el botón para activar tu descuento 👇`
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: {
                id: "descuento",
                title: "Descuento"
              }
            }
          ]
        }
      }
    },
    {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }
  );
}, 6 * 60 * 1000);

      return res.sendStatus(200);
    }



    // =============================
    // 💳 RESPUESTAS SEGÚN OPCIÓN
    // =============================

    let reply = "";

if (text.includes("pagar_19")) {

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      type: "image",
      image: {
        link: "https://i.ibb.co/KchxNgHg/Whats-App-Image-2026-04-25-at-4-44-41-PM.jpg",
        caption: "🔥 Aquí tienes el QR de 19 Bs.\n\nCuando pagues escribe: YA PAGUÉ"
      }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );

  return res.sendStatus(200);
}

    if (text.includes("qr")) {
      if (text.includes("qr")) {

  // 🥇 MENSAJE TEXTO
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      text: {
        body: "Perfecto 👍 aquí tienes el QR para pagar:"
      }
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );

  // ⏱️ espera 2 segundo
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 🥈 MENSAJE IMAGEN
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      type: "image",
      image: {
  link: "https://i.ibb.co/xKCNJCsd/qr-code-1777073787629.png",
  caption: "Escanea este QR y despues mandame el comprobante porfavor 🏦"
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
    } 
    else if (text.includes("deposito")) {
  reply = `Perfecto 👍 estos son los datos bancarios:

🏦 BANCO UNION
📄 NRO DE CUENTA: 10000042106208
👤 NOMBRE: MARCO ARIAS

📩 Una vez hecho el pago envíame tu comprobante por favor`;
} 
    else if (text.includes("tigo")) {
  reply = `Perfecto 👍 este es el número para Tigo Money:

📱 NÚMERO: 65818913
👤 NOMBRE: MARCO ARIAS

📩 Una vez hecho el pago envíame tu comprobante por favor`;
}

else if (
  text.includes("ya pague") ||
  text.includes("ya pagué") ||
  text.includes("pague") ||
  text.includes("comprobante")
) {
seguimientoDescuento[from] = false;
  reply = `🎉 ¡Perfecto! Ya recibimos tu aviso de pago 🙌

Para validar tu comprobante y entregarte el pack completo, escríbeme aquí:

👉 https://wa.me/59176187797

Envíame:
1. Captura del pago
2. Nombre con el que pagaste

Apenas lo verifique, te envío el acceso completo ✅`;
}

else if (text === "descuento") {
seguimientoDescuento[from] = true;
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      type: "image",
      image: {
        link: "https://i.ibb.co/KchxNgHg/Whats-App-Image-2026-04-25-at-4-44-41-PM.jpg",
        caption: `🔥 DESCUENTO ACTIVADO 🔥

Ahora puedes pagar solo 19 Bs 💸

👉 Escanea el QR y envíame el comprobante con: *YA PAGUÉ*`
      }
    },
    {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }
  );

// Seguimiento descuento 1 - 5 minutos
setTimeout(async () => {
  if (!seguimientoDescuento[from]) return;

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "🔥 Tu descuento de 19 Bs sigue activo.\n\n¿Quieres pagar ahora?"
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: {
                id: "pagar_19",
                title: "💸 Pagar ahora"
              }
            }
          ]
        }
      }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}, 1 * 60 * 1000);


// Seguimiento descuento 2 - 15 minutos
setTimeout(async () => {
  if (!seguimientoDescuento[from]) return;

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "⚠️ Recuerda que el precio especial de 19 Bs es por tiempo limitado.\n\n¿Deseas aprovecharlo?"
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: {
                id: "pagar_19",
                title: "💸 Pagar ahora"
              }
            }
          ]
        }
      }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}, 2 * 60 * 1000);


// Seguimiento descuento 3 - 30 minutos
setTimeout(async () => {
  if (!seguimientoDescuento[from]) return;

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "🚨 Último aviso.\n\nEl descuento puede volver a 29 Bs en cualquier momento.\n\n¿Quieres pagar con 19 Bs ahora?"
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: {
                id: "pagar_19",
                title: "💸 Pagar ahora"
              }
            }
          ]
        }
      }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}, 3 * 60 * 1000);

  return res.sendStatus(200);
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