const axios = require("axios");
const rt = require("./realtimeService");

const TOKEN = process.env.TOKEN;
const PHONE_ID = process.env.PHONE_ID;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function enviarTextoWhatsApp(numero, texto, opciones = {}) {
  try {

    let tokenEnviar = TOKEN;
    let phoneIdEnviar = PHONE_ID;

    if (opciones.usuarioId) {

      const responseConexion = await axios.get(
        `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${opciones.usuarioId}&activo=eq.true&select=*`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`
          }
        }
      );

      const conexion = responseConexion.data?.[0];

      if (conexion) {
        tokenEnviar = conexion.token;
        phoneIdEnviar = conexion.phone_id;
      }
    }

    const respuestaMeta = await axios.post(
  `https://graph.facebook.com/v19.0/${phoneIdEnviar}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        text: {
          body: texto
        }
      },
      {
        headers: {
          Authorization: `Bearer ${tokenEnviar}`,
          "Content-Type": "application/json"
        }
      }
    );
const whatsappMessageId =
  respuestaMeta.data?.messages?.[0]?.id || null;
    const insertRes = await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      {
        cliente_numero: numero,
        usuario_id: opciones.usuarioId || null,
        direccion: "saliente",
        tipo: "texto",
        contenido: texto,
        imagen_url: null,
        whatsapp_message_id: whatsappMessageId,
        estado_envio: "sent",
      },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
      }
    );

    const row = insertRes.data?.[0];
    if (opciones.usuarioId) {
      rt.nuevoMensaje(null, opciones.usuarioId, {
        id: row?.id,
        cliente_numero: numero,
        usuario_id: opciones.usuarioId,
        direccion: "saliente",
        tipo: "texto",
        contenido: texto,
        imagen_url: null,
        whatsapp_message_id: whatsappMessageId,
        estado_envio: "sent",
        creado_en: row?.creado_en || new Date().toISOString(),
      });
      rt.conversacionActualizada(null, opciones.usuarioId, {
        cliente_numero: numero,
        ultimo_mensaje: texto,
        direccion: "saliente",
      });
    }

    return row;
  } catch (error) {
    console.log("ERROR ENVIANDO WHATSAPP:", error.response?.data || error.message);
    return null;
  }
}


function normalizarNumeroWhatsApp(numero) {
  return String(numero || "").replace(/\D/g, "");
}

function normalizarTipoMediaWhatsApp(tipo) {
  const t = String(tipo || "").toLowerCase().trim();
  if (t === "imagen" || t === "image") return "image";
  if (t === "video") return "video";
  if (t === "audio") return "audio";
  if (t === "document" || t === "doc" || t === "pdf") return "document";
  return t;
}

function nombreArchivoDesdeUrl(mediaUrl, fallback = "archivo.pdf") {
  try {
    const base = new URL(mediaUrl).pathname.split("/").pop();
    return base && base.includes(".") ? base : fallback;
  } catch {
    return fallback;
  }
}

async function resolverCredencialesWhatsApp(opciones = {}) {
  let tokenEnviar = TOKEN;
  let phoneIdEnviar = PHONE_ID;

  if (opciones.usuarioId) {
    const responseConexion = await axios.get(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${opciones.usuarioId}&activo=eq.true&select=*`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    const conexion = responseConexion.data?.[0];
    if (conexion) {
      tokenEnviar = conexion.token;
      phoneIdEnviar = conexion.phone_id;
    }
  }

  return { tokenEnviar, phoneIdEnviar };
}

function construirPayloadMediaWhatsApp(numeroDestino, tipoApi, mediaUrl, caption, opciones = {}) {
  const payload = {
    messaging_product: "whatsapp",
    to: numeroDestino,
    type: tipoApi,
  };

  if (tipoApi === "image") {
    payload.image = {
      link: mediaUrl,
      caption: caption || "",
    };
    return payload;
  }

  if (tipoApi === "video") {
    payload.video = {
      link: mediaUrl,
      caption: caption || "",
    };
    return payload;
  }

  if (tipoApi === "audio") {
    payload.audio = {
      link: mediaUrl,
    };
    return payload;
  }

  if (tipoApi === "document") {
    payload.document = {
      link: mediaUrl,
      filename:
        opciones.filename ||
        nombreArchivoDesdeUrl(mediaUrl, "archivo.pdf"),
      caption: caption || "",
    };
    return payload;
  }

  return null;
}

async function enviarMediaWhatsApp(numero, tipo, mediaUrl, caption = "", opciones = {}) {
  const url = String(mediaUrl || "").trim();
  const tipoApi = normalizarTipoMediaWhatsApp(tipo);
  const numeroDestino = normalizarNumeroWhatsApp(numero);

  console.log("📤 ENVIANDO MEDIA A META:", {
    numero: numeroDestino,
    tipo: tipoApi,
    mediaUrl: url,
    caption: caption || "",
  });

  if (!url || !url.startsWith("https://")) {
    console.error("❌ MEDIA URL INVÁLIDA:", url);
    return false;
  }

  if (!numeroDestino) {
    console.error("❌ NÚMERO DESTINO INVÁLIDO:", numero);
    return false;
  }

  if (!["image", "video", "audio", "document"].includes(tipoApi)) {
    console.error("❌ TIPO MEDIA NO SOPORTADO:", tipo);
    return false;
  }

  try {
    const { tokenEnviar, phoneIdEnviar } = await resolverCredencialesWhatsApp(opciones);

    if (!tokenEnviar || !phoneIdEnviar) {
      console.error("❌ FALTAN CREDENCIALES WHATSAPP (token o phone_id)");
      return false;
    }

    const payload = construirPayloadMediaWhatsApp(
      numeroDestino,
      tipoApi,
      url,
      caption,
      opciones
    );

    if (!payload) {
      console.error("❌ NO SE PUDO CONSTRUIR PAYLOAD MEDIA:", tipoApi);
      return false;
    }

    const respuestaMeta = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneIdEnviar}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${tokenEnviar}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ RESPUESTA META MEDIA:", respuestaMeta.data);

    if (respuestaMeta.data?.error) {
      console.error("❌ ERROR META MEDIA:", respuestaMeta.data.error);
      return false;
    }

    const whatsappMessageId = respuestaMeta.data?.messages?.[0]?.id || null;

    if (!whatsappMessageId) {
      console.error("❌ META NO DEVOLVIÓ MESSAGE ID:", respuestaMeta.data);
      return false;
    }

    console.log("✅ MEDIA REALMENTE ENVIADA:", whatsappMessageId);
    console.log("📎 WAMID MEDIA (comparar con webhook statuses):", whatsappMessageId, {
      numero: numeroDestino,
      tipo: tipoApi,
      mediaUrl: url,
      caption: caption || "",
    });

    const insertRes = await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      {
        cliente_numero: numeroDestino,
        usuario_id: opciones.usuarioId || null,
        direccion: "saliente",
        tipo: tipoApi,
        contenido: caption || url,
        imagen_url: url,
        whatsapp_message_id: whatsappMessageId,
        estado_envio: "sent",
      },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
      }
    );

    const row = insertRes.data?.[0];
    if (opciones.usuarioId) {
      rt.nuevoMensaje(null, opciones.usuarioId, {
        id: row?.id,
        cliente_numero: numeroDestino,
        usuario_id: opciones.usuarioId,
        direccion: "saliente",
        tipo: tipoApi,
        contenido: caption || url,
        imagen_url: url,
        whatsapp_message_id: whatsappMessageId,
        estado_envio: "sent",
        creado_en: row?.creado_en || new Date().toISOString(),
      });
    }

    return row;
  } catch (error) {
    console.error("❌ ERROR META MEDIA:", error.response?.data || error.message);
    return false;
  }
}

async function enviarBotonesWhatsApp(numero, texto, botones, opciones = {}) {
  try {
    let tokenEnviar = TOKEN;
    let phoneIdEnviar = PHONE_ID;

    if (opciones.usuarioId) {
      const responseConexion = await axios.get(
        `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${opciones.usuarioId}&activo=eq.true&select=*`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        }
      );

      const conexion = responseConexion.data?.[0];
      if (conexion) {
        tokenEnviar = conexion.token;
        phoneIdEnviar = conexion.phone_id;
      }
    }

    const lista = (botones || []).slice(0, 3).filter(function (b) {
      return b && String(b.texto || "").trim();
    });

    if (!lista.length) {
      await enviarTextoWhatsApp(numero, texto, opciones);
      return;
    }

    const payload = {
      messaging_product: "whatsapp",
      to: numero,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: texto },
        action: {
          buttons: lista.map(function (btn) {
            return {
              type: "reply",
              reply: {
                id: String(btn.id || btn.texto).slice(0, 128),
                title: String(btn.texto).trim().slice(0, 20),
              },
            };
          }),
        },
      },
    };

    const respuestaMeta = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneIdEnviar}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${tokenEnviar}`,
          "Content-Type": "application/json",
        },
      }
    );

    const whatsappMessageId = respuestaMeta.data?.messages?.[0]?.id || null;

    const insertRes = await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      {
        cliente_numero: numero,
        usuario_id: opciones.usuarioId || null,
        direccion: "saliente",
        tipo: "interactive",
        contenido: texto,
        imagen_url: null,
        whatsapp_message_id: whatsappMessageId,
        estado_envio: "sent",
      },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
      }
    );

    const row = insertRes.data?.[0];
    if (opciones.usuarioId) {
      rt.nuevoMensaje(null, opciones.usuarioId, {
        id: row?.id,
        cliente_numero: numero,
        usuario_id: opciones.usuarioId,
        direccion: "saliente",
        tipo: "interactive",
        contenido: texto,
        whatsapp_message_id: whatsappMessageId,
        estado_envio: "sent",
        creado_en: row?.creado_en || new Date().toISOString(),
      });
    }
    return row;
  } catch (error) {
    console.log(
      "ERROR ENVIANDO BOTONES WHATSAPP:",
      error.response?.data || error.message
    );
    throw error;
  }
}

module.exports = {
  enviarTextoWhatsApp,
  enviarMediaWhatsApp,
  enviarBotonesWhatsApp,
};