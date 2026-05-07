const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const seguimientos = {};
const seguimientoDescuento = {};
const mensajesProcesados = new Set();
app.use(bodyParser.json());

app.use(express.urlencoded({ extended: true }));

// 🔑 VARIABLES (Railway)
const TOKEN = process.env.TOKEN;
const PHONE_ID = process.env.PHONE_ID;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function obtenerFlujo() {
  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos?producto=eq.Amigurumis&select=*`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  return response.data[0];
}

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

if (message.type === "text") {
  text = message.text.body.toLowerCase();
}

await axios.post(
  `${SUPABASE_URL}/rest/v1/clientes?on_conflict=numero`,
  {
    numero: from,
    estado: "nuevo"
  },
  {
    headers: {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates,return=minimal"
}
  }
);

await axios.post(
  `${SUPABASE_URL}/rest/v1/mensajes`,
  {
    cliente_numero: from,
    direccion: "entrante",
    tipo: message.type,
    contenido: text || "",
    imagen_url: message.image ? message.image.id : null
  },
  {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json"
    }
  }
);

await axios.post(
  `${SUPABASE_URL}/rest/v1/conversaciones`,
  {
    cliente_numero: from,
    ultimo_mensaje: text || message.type,
    ultimo_mensaje_en: new Date().toISOString(),
    estado: "abierta"
  },
  {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    }
  }
);


if (text.includes("reset")) {
  delete seguimientos[from];
  delete seguimientoDescuento[from];

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      text: { body: "🔄 Conversación reiniciada. Ya puedes probar como cliente nuevo." }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );

  return res.sendStatus(200);
}

if (message.type === "interactive") {
  text = message.interactive.button_reply.id.toLowerCase();
}

if (
  text.includes("ya pague") ||
  text.includes("ya pagué") ||
  text.includes("comprobante")
) {
  delete seguimientos[from];
  delete seguimientoDescuento[from];
}
    // =============================
    // 💬 BLOQUE PRINCIPAL (HOLA)
    // =============================
    if (
  (text.includes("hola") || text.includes("informacion") || text.includes("más información") || text.includes("mas informacion")) &&
  !seguimientos[from] &&
  !seguimientoDescuento[from]
) {

if (seguimientos[from]) {
  return res.sendStatus(200);
}

seguimientos[from] = true;

const flujo = await obtenerFlujo();

      // 🥇 MENSAJE 1
      await axios.post(
        `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: {
            body: flujo.mensaje_1
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
}, 5 * 60 * 1000);


// ⏱️ Seguimiento 2 (15 min)
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
}, 15 * 60 * 1000);


// ⏱️ Seguimiento 3 (40 min)
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
}, 40 * 60 * 1000);


// ⏱️ Seguimiento 4 (90 min)
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
}, 90 * 60 * 1000);


// ⏱️ Seguimiento 5 (180 min)
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
}, 3 * 60 * 60 * 1000);

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
}, 22 * 60 * 60 * 1000);

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
  caption: "Escanea este QR y despues mandame el comprobante con la palabra: *YA PAGUÉ*"
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

📩 Una vez hecho el pago envíame tu comprobante con la palabra: *YA PAGUÉ*`;
} 
    else if (text.includes("tigo")) {
  reply = `Perfecto 👍 este es el número para Tigo Money:

📱 NÚMERO: 65818913
👤 NOMBRE: MARCO ARIAS

📩 Una vez hecho el pago envíame tu comprobante con la palabra: *YA PAGUÉ*`;
}

else if (
  message.type === "image" ||
  text.includes("ya pague") ||
  text.includes("ya pagué") ||
  text.includes("pague") ||
  text.includes("comprobante")
) {
delete seguimientos[from];
delete seguimientoDescuento[from];
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

👉 Escanea el QR y envíame el comprobante con la palabra: *YA PAGUÉ*`
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
}, 5 * 60 * 1000);


// Seguimiento descuento 2 - 20 minutos
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
}, 20 * 60 * 1000);


// Seguimiento descuento 3 - 60 minutos
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
}, 60 * 60 * 1000);

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

// 🖥 PANEL ADMIN
app.get("/admin", async (req, res) => {
  res.send(`
    <h1>MacBot CRM</h1>

    <form method="POST" action="/admin/guardar">

<label>Número WhatsApp</label><br>
<input type="text" name="numero_whatsapp"><br><br>

<label>Producto</label><br>
<input type="text" name="producto"><br><br>

      <label>Mensaje 1</label><br>
      <textarea name="mensaje_1" rows="5" cols="50"></textarea><br><br>

      <label>Mensaje 2</label><br>
      <textarea name="mensaje_2" rows="5" cols="50"></textarea><br><br>

      <label>Seguimiento</label><br>
      <textarea name="seguimiento_1" rows="5" cols="50"></textarea><br><br>

<label>Tiempo seguimiento en segundos</label><br>
<input type="number" name="tiempo_seguimiento"><br><br>

      <button type="submit">
        Guardar
      </button>

    </form>
  `);
});

app.post("/admin/guardar", async (req, res) => {
  const {
  numero_whatsapp,
  producto,
  mensaje_1,
  mensaje_2,
  seguimiento_1,
  tiempo_seguimiento
} = req.body;

  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/flujos?numero_whatsapp=eq.${numero_whatsapp}`,
        {
  numero_whatsapp,
  producto,
  mensaje_1,
  mensaje_2,
  seguimiento_1,
tiempo_seguimiento
},
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.send(`
      <h1>✅ Guardado correctamente</h1>
      <a href="/admin">Volver al panel</a>
    `);

  } catch (error) {
    console.log(error.response?.data || error.message);

    res.send(`
      <h1>❌ Error al guardar</h1>
      <p>Revisa Railway logs.</p>
      <a href="/admin">Volver</a>
    `);
  }
});

// 🚀 SERVIDOR
const PORT = process.env.PORT || 3000;

// =========================
// ✍️ RESPONDER MANUAL
// =========================

app.post("/inbox/responder", async (req, res) => {
try {
  const { numero, respuesta } = req.body;

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: numero,
      text: {
        body: respuesta
      }
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );

await axios.post(
  `${SUPABASE_URL}/rest/v1/mensajes`,
  {
    numero_de_cliente: numero,
    direccion: "saliente",
    tipo: "texto",
    contenido: respuesta,
    imagen_url: null
  },
  {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json"
    }
  }
);
    res.redirect("/inbox");
} catch (error) {
  console.log("ERROR RESPONDER DETALLADO:");
  console.log(error.response?.data || error.message);

  res.send("Error enviando o guardando");
}
});

app.listen(PORT, () => {
  console.log("🚀 Servidor corriendo en puerto", PORT);
});

// =========================
// 📥 INBOX VISUAL
// =========================

app.get("/inbox", async (req, res) => {

  try {

    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/mensajes?select=*`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );
const conversaciones = {};
const mensajes = response.data || [];

mensajes.forEach(msg => {

  const numero =
    msg.cliente_numero ||
    msg.numero_de_cliente ||
    msg["número_de_cliente"];

  if (!numero) return;

  if (!conversaciones[numero]) {
    conversaciones[numero] = [];
  }

  conversaciones[numero].push(msg);

});
const numeros = Object.keys(conversaciones);
const chatActual = numeros[0] || "";
function horaBolivia(fecha) {

  if (!fecha) return "";

  return new Date(fecha).toLocaleTimeString("es-BO", {
    hour: "2-digit",
    minute: "2-digit"
  });

}
    let html = `
<style>
*{
  margin:0;
  padding:0;
  box-sizing:border-box;
  font-family:Arial,sans-serif;
}

body{
  background:#0b141a;
  height:100vh;
  overflow:hidden;
  color:white;
}

/* APP */
.whatsapp{
  display:flex;
  height:100vh;
}

/* SIDEBAR */
.sidebar{
  width:32%;
  background:#111b21;
  border-right:1px solid #222d34;
  display:flex;
  flex-direction:column;
}

.sidebar-top{
  height:70px;
  background:#202c33;
  display:flex;
  align-items:center;
  padding:15px;
  font-size:24px;
  font-weight:bold;
  color:#25d366;
}

.search{
  padding:10px;
  background:#111b21;
}

.search input{
  width:100%;
  padding:12px;
  border:none;
  border-radius:10px;
  background:#202c33;
  color:white;
  outline:none;
}

.chat-list{
  overflow-y:auto;
  flex:1;
}

.chat-item{
  display:flex;
  gap:12px;
  padding:15px;
  border-bottom:1px solid #202c33;
  cursor:pointer;
  transition:0.2s;
}

.chat-item:hover{
  background:#202c33;
}

.avatar{
  width:50px;
  height:50px;
  border-radius:50%;
  background:#2a3942;
}

.chat-info{
  flex:1;
}

.chat-info h4{
  color:#25d366;
  font-size:18px;
}

.chat-info p{
  color:#b1b3b5;
  margin-top:5px;
}

/* CHAT */
.chat{
  flex:1;
  display:flex;
  flex-direction:column;
  background:#0b141a;
}

.chat-top{
  height:70px;
  background:#202c33;
  display:flex;
  align-items:center;
  padding:15px;
  gap:15px;
  border-left:1px solid #2a3942;
}

.chat-top h3{
  color:#25d366;
}

.chat-messages{
  flex:1;
  overflow-y:auto;
  padding:20px;
  background:#0b141a;
  display:flex;
flex-direction:column;
}

.message{
  max-width:65%;
  width:fit-content;
  padding:12px;
  border-radius:12px;
  margin-bottom:15px;
  position:relative;
  word-wrap:break-word;
  display:inline-block;
}

.entrante{
  background:#202c33;
  color:white;
}

.saliente{
  background:#005c4b;
  color:white;
  margin-left:auto;
}

.time{
  display:block;
  font-size:11px;
  opacity:.7;
  margin-top:6px;
  text-align:right;
}

/* INPUT */
.chat-bottom{
  background:#202c33;
  padding:15px;
}

.chat-bottom form{
  display:flex;
  gap:10px;
}

.chat-bottom textarea{
  flex:1;
  resize:none;
  border:none;
  border-radius:30px;
  padding:14px 20px;
  background:#2a3942;
  color:white;
  outline:none;
  height:55px;
}

.chat-bottom button{
  width:55px;
  border:none;
  border-radius:50%;
  background:#25d366;
  color:white;
  font-size:22px;
  cursor:pointer;
}

/* MOBILE */
@media(max-width:900px){
  .sidebar{
    width:40%;
  }
}

@media(max-width:700px){
  .sidebar{
    display:none;
  }
}
</style>

<div class="whatsapp">

  <!-- SIDEBAR -->
  <div class="sidebar">

    <div class="sidebar-top">
      MacBot Inbox
    </div>

    <div class="search">
      <input type="text" placeholder="Buscar chat...">
    </div>

    <div class="chat-list">

      ${numeros.map(numero => `
        <div class="chat-item" onclick="abrirChat('${numero}')">

          <div class="avatar"></div>

          <div class="chat-info">
            <h4>${numero}</h4>
            <p>
              ${(conversaciones[numero][conversaciones[numero].length - 1]?.contenido || "").substring(0,30)}
            </p>
          </div>

        </div>
      `).join("")}

    </div>

  </div>

  <!-- CHAT -->
  <div class="chat">

    <div class="chat-top">
      <div class="avatar"></div>

      <div>
        <h3>${chatActual || "Selecciona un chat"}</h3>
        <small style="color:#25d366;">en línea</small>
      </div>
    </div>

    <div class="chat-messages" id="mensajes">

      ${
        chatActual && conversaciones[chatActual]
        ? conversaciones[chatActual].map(msg => `

          <div class="message ${msg.direccion === "saliente" ? "saliente" : "entrante"}">

            ${msg.contenido || ""}

            <span class="time">
              ${horaBolivia(msg.creado_en)}
            </span>

          </div>

        `).join("")
        : ""
      }

    </div>

    ${
      chatActual
      ? `
      <div class="chat-bottom">

        <form action="/inbox/responder" method="POST">

          <input
            type="hidden"
            name="numero"
            value="${chatActual}"
          >

          <textarea
            name="respuesta"
            placeholder="Escribe un mensaje"
          ></textarea>

          <button type="submit">➤</button>

        </form>

      </div>
     `
: ""
}
  </div>

</div>
      `;


    res.send(html);

  } catch (error) {

    res.send(error.message);

  }

});