const axios = require("axios");
const rt = require("./realtimeService");
const { prepararImagenParaWhatsApp, mimeCompatibleWhatsApp } = require("./imageWhatsAppService");

const TOKEN = process.env.TOKEN;
const PHONE_ID = process.env.PHONE_ID;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function camposDiagnosticoInbox(payload, trace) {
  return {
    trace,
    usuario_id: payload?.usuario_id ?? null,
    numero: payload?.cliente_numero ?? payload?.numero ?? null,
    telefono: payload?.telefono ?? null,
    phone: payload?.phone ?? null,
    conversation_id: payload?.conversation_id ?? null,
    contacto_id: payload?.contacto_id ?? null,
    body: payload?.body ?? null,
    mensaje: payload?.mensaje ?? null,
    texto: payload?.texto ?? payload?.contenido ?? null,
    tipo: payload?.tipo ?? null,
    direction: payload?.direction ?? null,
    direccion: payload?.direccion ?? null,
    from_me: payload?.from_me ?? null,
    role: payload?.role ?? null,
    estado: payload?.estado ?? null,
    estado_envio: payload?.estado_envio ?? null,
    created_at: payload?.created_at ?? null,
    creado_en: payload?.creado_en ?? null,
    whatsapp_message_id: payload?.whatsapp_message_id ?? null,
  };
}

async function actualizarConversacionSaliente(usuarioId, numero, texto) {
  if (!usuarioId || !numero || !SUPABASE_URL || !SUPABASE_KEY) return;

  const headers = supabaseHeaders({ "Content-Type": "application/json" });
  const ahora = new Date().toISOString();

  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/conversaciones?cliente_numero=eq.${numero}&usuario_id=eq.${usuarioId}&select=*`,
      { headers }
    );
    const conv = res.data?.[0];

    if (conv) {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/conversaciones?cliente_numero=eq.${numero}&usuario_id=eq.${usuarioId}`,
        {
          ultimo_mensaje: texto,
          ultimo_mensaje_en: ahora,
          estado: "abierta",
        },
        { headers }
      );
      return;
    }

    await axios.post(
      `${SUPABASE_URL}/rest/v1/conversaciones`,
      {
        cliente_numero: numero,
        usuario_id: usuarioId,
        ultimo_mensaje: texto,
        ultimo_mensaje_en: ahora,
        estado: "abierta",
        unread_count: 0,
      },
      { headers }
    );
  } catch (err) {
    console.log("[WhatsApp] conversacion saliente:", err.response?.data || err.message);
  }
}

async function enviarTextoWhatsApp(numero, texto, opciones = {}) {
  const inboxTrace =
    opciones._inboxTrace || (opciones._debugOpenAI ? "openai" : null);
  const usuarioId = opciones.usuarioId ?? null;

  try {
    let tokenEnviar = TOKEN;
    let phoneIdEnviar = PHONE_ID;

    if (usuarioId) {
      const responseConexion = await axios.get(
        `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${usuarioId}&activo=eq.true&select=*`,
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

    const respuestaMeta = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneIdEnviar}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        text: {
          body: texto,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${tokenEnviar}`,
          "Content-Type": "application/json",
        },
      }
    );
    const whatsappMessageId =
      respuestaMeta.data?.messages?.[0]?.id || null;

    const insertPayload = {
      cliente_numero: numero,
      usuario_id: usuarioId || null,
      direccion: "saliente",
      tipo: "texto",
      contenido: texto,
      imagen_url: null,
      whatsapp_message_id: whatsappMessageId,
      estado_envio: "sent",
    };

    if (inboxTrace === "manual") {
      console.log("? MANUAL INSERT PAYLOAD:", insertPayload);
      console.log("? MANUAL INSERT CAMPOS:", camposDiagnosticoInbox(insertPayload, "manual"));
    } else if (inboxTrace === "openai") {
      console.log("?? OPENAI INSERT PAYLOAD:", insertPayload);
      console.log("?? OPENAI INSERT CAMPOS:", camposDiagnosticoInbox(insertPayload, "openai"));
    }

    if (!usuarioId && inboxTrace) {
      console.warn(
        `[INBOX] ${inboxTrace.toUpperCase()} sin usuarioId ? INSERT sin due?o y sin socket`
      );
    }

    const insertRes = await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      insertPayload,
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
    if (usuarioId) {
      await actualizarConversacionSaliente(usuarioId, numero, texto);

      const payloadMensaje = {
        id: row?.id,
        cliente_numero: numero,
        usuario_id: usuarioId,
        direccion: "saliente",
        tipo: "texto",
        contenido: texto,
        imagen_url: null,
        whatsapp_message_id: whatsappMessageId,
        estado_envio: "sent",
        creado_en: row?.creado_en || new Date().toISOString(),
      };

      const socketRoom = `user_${usuarioId}`;
      const convPayload = {
        cliente_numero: numero,
        ultimo_mensaje: texto,
        ultimo_mensaje_en: payloadMensaje.creado_en,
        direccion: "saliente",
      };

      if (inboxTrace === "manual") {
        console.log("? MANUAL SOCKET EVENT:", "nuevo_mensaje", socketRoom, payloadMensaje);
        console.log(
          "? MANUAL SOCKET EVENT:",
          "conversacion_actualizada",
          socketRoom,
          convPayload
        );
      } else if (inboxTrace === "openai") {
        console.log("?? OPENAI SOCKET EVENT:", "nuevo_mensaje", socketRoom, payloadMensaje);
        console.log(
          "?? OPENAI SOCKET EVENT:",
          "conversacion_actualizada",
          socketRoom,
          convPayload
        );
      }

      rt.nuevoMensaje(null, usuarioId, payloadMensaje);
      rt.conversacionActualizada(null, usuarioId, convPayload);
    }

    return row;
  } catch (error) {
    const detalle = error.response?.data || error.message || error;
    if (inboxTrace === "manual") {
      console.error("? MANUAL enviarTextoWhatsApp:", detalle);
    } else if (inboxTrace === "openai") {
      console.error("? OPENAI enviarTextoWhatsApp:", detalle);
    }
    console.log("ERROR ENVIANDO WHATSAPP:", detalle);
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

function esUrlPublicaHttps(url) {
  const u = String(url || "").trim();
  if (!u.startsWith("https://")) return false;
  if (u.includes("/object/sign/")) return false;
  if (/[?&]token=/.test(u)) return false;
  return true;
}

function pareceUrlWebp(url, contentType) {
  const u = String(url || "").toLowerCase();
  const ct = String(contentType || "").toLowerCase();
  return u.includes(".webp") || ct.includes("webp");
}

async function verificarUrlAccesible(url) {
  try {
    const head = await axios.head(url, {
      timeout: 12000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    return true;
  } catch {
    try {
      const get = await axios.get(url, {
        timeout: 12000,
        responseType: "arraybuffer",
        maxContentLength: 512 * 1024,
      });
      return !!get.data?.byteLength;
    } catch {
      return false;
    }
  }
}

async function obtenerContentTypeRemoto(url) {
  try {
    const head = await axios.head(url, { timeout: 12000, maxRedirects: 5 });
    return head.headers["content-type"] || "";
  } catch {
    return "";
  }
}

async function rehostImagenJpegPublica(urlOrigen, opciones = {}) {
  console.log("???? Convirtiendo imagen a JPEG p?blico para Meta:", urlOrigen);

  const res = await axios.get(urlOrigen, {
    responseType: "arraybuffer",
    timeout: 45000,
    maxContentLength: 12 * 1024 * 1024,
  });

  const prep = await prepararImagenParaWhatsApp(
    Buffer.from(res.data),
    res.headers["content-type"],
    urlOrigen
  );

  const uid = opciones.usuarioId || "flow";
  const ruta = `whatsapp-meta/${uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.${prep.extension}`;

  await axios.post(`${SUPABASE_URL}/storage/v1/object/archivos/${ruta}`, prep.buffer, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": prep.mimetype,
      "x-upsert": "true",
    },
  });

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/archivos/${ruta}`;
  console.log("??? URL JPEG p?blica para Meta:", publicUrl);
  return publicUrl;
}

async function resolverLinkImagenWhatsApp(mediaUrl, opciones = {}) {
  let url = String(mediaUrl || "").trim();

  if (!esUrlPublicaHttps(url)) {
    throw new Error(
      "La URL de imagen debe ser HTTPS p?blica (sin token firmado). Usa /storage/v1/object/public/..."
    );
  }

  const contentType = await obtenerContentTypeRemoto(url);
  const necesitaConversion =
    pareceUrlWebp(url, contentType) ||
    (contentType && !mimeCompatibleWhatsApp(contentType));

  if (necesitaConversion) {
    console.log("????? Imagen WEBP/incompatible ??? convirtiendo antes de Meta");
    return rehostImagenJpegPublica(url, opciones);
  }

  const accesible = await verificarUrlAccesible(url);
  if (!accesible) {
    console.warn("???? Meta no podr?a leer la URL ??? rehost JPEG:", url);
    return rehostImagenJpegPublica(url, opciones);
  }

  return url;
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
      ...(caption ? { caption: String(caption) } : {}),
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
  const urlOriginal = String(mediaUrl || "").trim();
  const tipoApi = normalizarTipoMediaWhatsApp(tipo);
  const numeroDestino = normalizarNumeroWhatsApp(numero);

  if (!numeroDestino) {
    console.error("?? N??MERO DESTINO INV?LIDO:", numero);
    return false;
  }

  if (!["image", "video", "audio", "document"].includes(tipoApi)) {
    console.error("?? TIPO MEDIA NO SOPORTADO:", tipo);
    return false;
  }

  let urlEnvio = urlOriginal;

  try {
    if (tipoApi === "image") {
      console.log("????? ENVIANDO IMAGEN A META:", {
        numero: numeroDestino,
        mediaUrl: urlOriginal,
        caption: caption || "",
      });

      if (!urlOriginal) {
        console.error("?? IMAGEN SIN URL");
        return false;
      }

      urlEnvio = await resolverLinkImagenWhatsApp(urlOriginal, opciones);

      if (urlEnvio !== urlOriginal) {
        console.log("????? URL FINAL PARA META (JPEG):", urlEnvio);
      }
    } else {
      console.log("???? ENVIANDO MEDIA A META:", {
        numero: numeroDestino,
        tipo: tipoApi,
        mediaUrl: urlOriginal,
        caption: caption || "",
      });

      if (!urlOriginal || !esUrlPublicaHttps(urlOriginal)) {
        console.error("?? MEDIA URL INV?LIDA:", urlOriginal);
        return false;
      }
      urlEnvio = urlOriginal;
    }

    const { tokenEnviar, phoneIdEnviar } = await resolverCredencialesWhatsApp(opciones);

    if (!tokenEnviar || !phoneIdEnviar) {
      console.error("?? FALTAN CREDENCIALES WHATSAPP (token o phone_id)");
      return false;
    }

    const payload = construirPayloadMediaWhatsApp(
      numeroDestino,
      tipoApi,
      urlEnvio,
      caption,
      opciones
    );

    if (!payload) {
      console.error("?? NO SE PUDO CONSTRUIR PAYLOAD MEDIA:", tipoApi);
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

    if (tipoApi === "image") {
      console.log("??? RESPUESTA META IMAGEN:", respuestaMeta.data);
    } else {
      console.log("??? RESPUESTA META MEDIA:", respuestaMeta.data);
    }

    if (respuestaMeta.data?.error) {
      if (tipoApi === "image") {
        console.error("?? ERROR META IMAGEN:", respuestaMeta.data.error);
      } else {
        console.error("?? ERROR META MEDIA:", respuestaMeta.data.error);
      }
      return false;
    }

    const whatsappMessageId = respuestaMeta.data?.messages?.[0]?.id || null;

    if (!whatsappMessageId) {
      console.error("?? META NO DEVOLVI?? message_id ??? NO se guarda en bandeja:", respuestaMeta.data);
      return false;
    }

    console.log("??? message_id Meta:", whatsappMessageId);

    const insertRes = await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      {
        cliente_numero: numeroDestino,
        usuario_id: opciones.usuarioId || null,
        direccion: "saliente",
        tipo: tipoApi,
        contenido: caption || urlOriginal,
        imagen_url: urlEnvio,
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
    if (opciones.usuarioId && row) {
      rt.nuevoMensaje(null, opciones.usuarioId, {
        id: row.id,
        cliente_numero: numeroDestino,
        usuario_id: opciones.usuarioId,
        direccion: "saliente",
        tipo: tipoApi,
        contenido: caption || urlOriginal,
        imagen_url: urlEnvio,
        whatsapp_message_id: whatsappMessageId,
        estado_envio: "sent",
        creado_en: row.creado_en || new Date().toISOString(),
      });
    }

    return row;
  } catch (error) {
    if (tipoApi === "image") {
      console.error("?? ERROR META IMAGEN:", error.response?.data || error.message);
    } else {
      console.error("?? ERROR META MEDIA:", error.response?.data || error.message);
    }
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