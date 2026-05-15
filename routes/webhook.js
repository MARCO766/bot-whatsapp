const express = require("express");
const router = express.Router();

const axios = require("axios");

const { enviarEventoMeta } = require("../services/metaService");
const { buscarYEjecutarActivador } = require("../services/flowService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const TOKEN = process.env.TOKEN;
const PHONE_ID = process.env.PHONE_ID;

const mensajesProcesados = new Set();

setInterval(() => {
  mensajesProcesados.clear();
}, 1000 * 60 * 10);
// 🔐 VERIFICACIÓN WEBHOOK
router.get('/webhook', (req, res) => {
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
router.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const phoneNumberIdWebhook = value?.metadata?.phone_number_id;
    console.log("PHONE_ID WEBHOOK:", phoneNumberIdWebhook);

let usuarioIdWebhook = null;
let conexionWebhook = null;

if (phoneNumberIdWebhook) {
  const responseConexionWebhook = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?phone_id=eq.${phoneNumberIdWebhook}&activo=eq.true&select=*`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  conexionWebhook = responseConexionWebhook.data?.[0];
  console.log("CONEXION ENCONTRADA:", conexionWebhook);

  if (conexionWebhook) {
    usuarioIdWebhook = conexionWebhook.usuario_id;
  }
}

// 🚫 Ignorar estados (read, delivered, etc)
// ✅ estados WhatsApp (sent, delivered, read)

if (value?.statuses) {

  for (const status of value.statuses) {

    const whatsappMessageId = status.id;

    const estado = status.status;

    if (!whatsappMessageId || !estado) continue;

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/mensajes?whatsapp_message_id=eq.${whatsappMessageId}`,
      {
        estado_envio: estado
      },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
const io = req.app.get("io");

if (io && usuarioIdWebhook) {
  io.to("user-" + usuarioIdWebhook).emit("mensaje-estado", {
    whatsapp_message_id: whatsappMessageId,
    estado_envio: estado
  });
}
  }

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

const responseClienteBloqueado = await axios.get(
  `${SUPABASE_URL}/rest/v1/clientes?numero=eq.${from}&usuario_id=eq.${usuarioIdWebhook}&select=estado`,
  {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  }
);

const clienteBloqueado = responseClienteBloqueado.data?.[0];

if (clienteBloqueado?.estado === "bloqueado") {
  console.log("🚫 Mensaje ignorado de contacto bloqueado:", from);
  return res.sendStatus(200);
}


    let text = "";

if (message.type === "text") {
  text = message.text.body.toLowerCase();
}

await axios.post(
  `${SUPABASE_URL}/rest/v1/clientes?on_conflict=numero`,
  {
  numero: from,
  usuario_id: usuarioIdWebhook,
  nombre: nombre,
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

let mediaUrlFinal = null;

if (message.audio && message.audio.id && conexionWebhook?.token) {

  try {

    const audioInfo = await axios.get(
      `https://graph.facebook.com/v19.0/${message.audio.id}`,
      {
        headers: {
          Authorization: `Bearer ${conexionWebhook.token}`
        }
      }
    );

    const audioUrlMeta = audioInfo.data.url;

    const audioFile = await axios.get(audioUrlMeta, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${conexionWebhook.token}`
      }
    });

    const nombreAudio = Date.now() + "-audio.ogg";
    text = "audio";

    const rutaAudio =
      `whatsapp/${usuarioIdWebhook}/${nombreAudio}`;

    await axios.post(
      `${SUPABASE_URL}/storage/v1/object/archivos/${rutaAudio}`,
      audioFile.data,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "audio/ogg",
          "x-upsert": "true"
        }
      }
    );

    mediaUrlFinal =
      `${SUPABASE_URL}/storage/v1/object/public/archivos/${rutaAudio}`;

  } catch (error) {

    console.log(
      "ERROR DESCARGANDO AUDIO:",
      error.response?.data || error.message
    );

  }

}

await axios.post(
  `${SUPABASE_URL}/rest/v1/mensajes`,
  
  {
    cliente_numero: from,
    usuario_id: usuarioIdWebhook,
    direccion: "entrante",
    tipo: message.type,
    contenido: text || "",
    imagen_url: mediaUrlFinal || null,
  },
  {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json"
    }
  }
);

const io = req.app.get("io");

if (io && usuarioIdWebhook) {
  io.to("user_" + usuarioIdWebhook).emit("nuevo-mensaje", {
    cliente_numero: from,
    usuario_id: usuarioIdWebhook,
    direccion: "entrante",
    tipo: message.type,
    contenido: text || "",
    imagen_url: mediaUrlFinal || null,
    creado_en: new Date().toISOString()
  });
}

await axios.post(
  `${SUPABASE_URL}/rest/v1/conversaciones`,
  {
  cliente_numero: from,
  usuario_id: usuarioIdWebhook,
  ultimo_mensaje: text || message.type,
  ultimo_mensaje_en: new Date().toISOString(),
  estado: "abierta",
  unread_count: 1
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

await enviarEventoMeta(usuarioIdWebhook, "Lead", from);

await buscarYEjecutarActivador(from, text, usuarioIdWebhook);

return res.sendStatus(200);

  } catch (error) {
    console.log("ERROR:", error.response?.data || error.message);
    res.sendStatus(200);
  }
});

module.exports = router;