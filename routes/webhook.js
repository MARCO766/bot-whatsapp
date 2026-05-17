const express = require("express");
const router = express.Router();

const axios = require("axios");

const { enviarEventoMeta } = require("../services/metaService");
const { buscarYEjecutarActivador } = require("../services/flowService");
const {
  cancelarSeguimientosPorRespuesta,
} = require("../services/seguimiento/cancelOnReply");

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
  io.to("user_" + usuarioIdWebhook).emit("mensaje-estado", {
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

    const creadoEn = message.timestamp
  ? new Date(Number(message.timestamp) * 1000).toISOString()
  : new Date().toISOString();

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
  text = message.text.body;
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

    const audioSizeMB =
  audioFile.data.byteLength / 1024 / 1024;

if (audioSizeMB > 5) {
  console.log("🚫 Audio mayor a 5MB");
  return res.sendStatus(200);
}

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

if (message.image && message.image.id && conexionWebhook?.token) {

  try {

    const imageInfo = await axios.get(
      `https://graph.facebook.com/v19.0/${message.image.id}`,
      {
        headers: {
          Authorization: `Bearer ${conexionWebhook.token}`
        }
      }
    );

    const imageUrlMeta = imageInfo.data.url;

    const imageFile = await axios.get(imageUrlMeta, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${conexionWebhook.token}`
      }
    });

    const imageSizeMB =
      imageFile.data.byteLength / 1024 / 1024;

    if (imageSizeMB > 2) {
      console.log("🚫 Imagen mayor a 2MB");
      return res.sendStatus(200);
    }

    const nombreImagen =
      Date.now() + "-imagen.jpg";

    const rutaImagen =
      `whatsapp/${usuarioIdWebhook}/${nombreImagen}`;

    await axios.post(
      `${SUPABASE_URL}/storage/v1/object/archivos/${rutaImagen}`,
      imageFile.data,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "image/jpeg",
          "x-upsert": "true"
        }
      }
    );

    mediaUrlFinal =
      `${SUPABASE_URL}/storage/v1/object/public/archivos/${rutaImagen}`;

    text = message.image.caption || "imagen";

  } catch (error) {

    console.log(
      "ERROR DESCARGANDO IMAGEN:",
      error.response?.data || error.message
    );

  }

}

if (message.document && message.document.id && conexionWebhook?.token) {

  try {

    const docInfo = await axios.get(
      `https://graph.facebook.com/v19.0/${message.document.id}`,
      {
        headers: {
          Authorization: `Bearer ${conexionWebhook.token}`
        }
      }
    );

    const docUrlMeta = docInfo.data.url;

    const docFile = await axios.get(docUrlMeta, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${conexionWebhook.token}`
      }
    });

    const docSizeMB =
      docFile.data.byteLength / 1024 / 1024;

    if (docSizeMB > 8) {
      console.log("🚫 Documento mayor a 8MB");
      return res.sendStatus(200);
    }

    const extension =
      message.document.filename?.split(".").pop() || "pdf";

    const nombreDoc =
      Date.now() + "-doc." + extension;

    const rutaDoc =
      `whatsapp/${usuarioIdWebhook}/${nombreDoc}`;

    await axios.post(
      `${SUPABASE_URL}/storage/v1/object/archivos/${rutaDoc}`,
      docFile.data,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type":
            message.document.mime_type || "application/pdf",
          "x-upsert": "true"
        }
      }
    );

    mediaUrlFinal =
      `${SUPABASE_URL}/storage/v1/object/public/archivos/${rutaDoc}`;

    text =
      message.document.filename || "documento";

  } catch (error) {

    console.log(
      "ERROR DESCARGANDO DOCUMENTO:",
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
    nombre: nombre,
    usuario_id: usuarioIdWebhook,
    direccion: "entrante",
    tipo: message.type,
    contenido: text || "",
    imagen_url: mediaUrlFinal || null,
    creado_en: creadoEn
  });
}

const responseConversacionActual = await axios.get(
  `${SUPABASE_URL}/rest/v1/conversaciones?cliente_numero=eq.${from}&usuario_id=eq.${usuarioIdWebhook}&select=*`,
  {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  }
);

const conversacionActual = responseConversacionActual.data?.[0];

if (conversacionActual) {

  const unreadActual = conversacionActual.unread_count || 0;

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/conversaciones?cliente_numero=eq.${from}&usuario_id=eq.${usuarioIdWebhook}`,
    {
      ultimo_mensaje:
  text && text.trim() !== ""
    ? text
    : message.type,
      ultimo_mensaje_en: new Date().toISOString(),
      estado: "abierta",
      unread_count: unreadActual + 1
    },
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

} else {

  await axios.post(
    `${SUPABASE_URL}/rest/v1/conversaciones`,
    {
      cliente_numero: from,
      usuario_id: usuarioIdWebhook,
      ultimo_mensaje:
  text && text.trim() !== ""
    ? text
    : message.type,
      ultimo_mensaje_en: new Date().toISOString(),
      estado: "abierta",
      unread_count: 1
    },
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

}

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

const io = req.app.get("io");
await cancelarSeguimientosPorRespuesta(from, usuarioIdWebhook, io);

await buscarYEjecutarActivador(from, text, usuarioIdWebhook);

return res.sendStatus(200);

  } catch (error) {
    console.log("ERROR:", error.response?.data || error.message);
    res.sendStatus(200);
  }
});

module.exports = router;