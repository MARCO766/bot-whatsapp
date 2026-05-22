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

/**
 * UTF-8 válido para PostgREST: quita sustitutos sueltos (ej. \ude0a sin \ud83d).
 * Mantiene emojis completos; no elimina emojis válidos.
 */
function sanitizarContenidoMensajeSupabase(contenido) {
  let s = typeof contenido === "string" ? contenido : String(contenido ?? "");
  try {
    s = s.normalize("NFC");
  } catch (_) {
    /* ignore */
  }

  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      if (i + 1 < s.length) {
        const c2 = s.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 <= 0xdfff) {
          out += s[i] + s[i + 1];
          i++;
          continue;
        }
      }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) {
      continue;
    }
    if (c === 0) continue;
    out += s[i];
  }

  console.log("[SUPABASE DEBUG] contenido limpio:", out);
  return out;
}

async function actualizarConversacionSaliente(usuarioId, numero, texto) {
  if (!usuarioId || !numero || !SUPABASE_URL || !SUPABASE_KEY) return;

  const ultimoMensaje = sanitizarContenidoMensajeSupabase(texto);
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
          ultimo_mensaje: ultimoMensaje,
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
        ultimo_mensaje: ultimoMensaje,
        ultimo_mensaje_en: ahora,
        estado: "abierta",
        unread_count: 0,
      },
      { headers }
    );
  } catch (err) {
    console.log("[WhatsApp] conversacion saliente (SUPABASE):", {
      code: err.response?.data?.code,
      message: err.response?.data?.message || err.message,
      details: err.response?.data,
      url: err.config?.url,
      bodyEnviado: err.config?.data,
    });
  }
}

async function resolverCredencialesEnvio(opciones = {}) {
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

/**
 * Mismo guardado + socket que bandeja manual (POST /inbox/responder texto).
 */
function normalizarBodyMensajeSupabase({
  usuarioId,
  numero,
  texto,
  wamid,
  tipo,
  imagen_url = null,
}) {
  const tipoDb = tipo === "text" ? "texto" : tipo || "texto";
  let contenido = texto;
  if (contenido != null && typeof contenido !== "string") {
    try {
      contenido = JSON.stringify(contenido);
    } catch {
      contenido = String(contenido);
    }
  }
  const contenidoSeguro = sanitizarContenidoMensajeSupabase(String(contenido ?? ""));

  return {
    cliente_numero: String(numero || "").trim(),
    usuario_id:
      usuarioId != null && usuarioId !== "" ? String(usuarioId).trim() : null,
    direccion: "saliente",
    tipo: tipoDb,
    contenido: contenidoSeguro,
    imagen_url: imagen_url ?? null,
    whatsapp_message_id: wamid != null && wamid !== "" ? String(wamid) : null,
    estado_envio: "sent",
  };
}

async function registrarMensajeSalienteEnInbox({
  usuarioId,
  numero,
  texto,
  wamid,
  tipo = "texto",
}) {
  const insertPayload = normalizarBodyMensajeSupabase({
    usuarioId,
    numero,
    texto,
    wamid,
    tipo,
  });

  let bodyJson = "";
  try {
    bodyJson = JSON.stringify(insertPayload);
  } catch (serialErr) {
    console.log("[SEND DEBUG] payload supabase NO serializable:", insertPayload);
    console.log("[SEND DEBUG] error JSON:", serialErr.message);
    throw serialErr;
  }

  console.log("[SEND DEBUG] payload supabase:", insertPayload);
  console.log("[SEND DEBUG] body JSON length:", bodyJson.length);

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
  if (!usuarioId) return row;

  await actualizarConversacionSaliente(
    usuarioId,
    numero,
    insertPayload.contenido
  );

  const payloadMensaje = {
    id: row?.id,
    cliente_numero: numero,
    usuario_id: usuarioId,
    direccion: "saliente",
    tipo: insertPayload.tipo,
    contenido: insertPayload.contenido,
    imagen_url: insertPayload.imagen_url,
    whatsapp_message_id: wamid || null,
    estado_envio: "sent",
    creado_en: row?.creado_en || new Date().toISOString(),
  };

  rt.nuevoMensaje(null, usuarioId, payloadMensaje);
  rt.conversacionActualizada(null, usuarioId, {
    cliente_numero: numero,
    ultimo_mensaje: insertPayload.contenido,
    ultimo_mensaje_en: payloadMensaje.creado_en,
    direccion: "saliente",
  });

  return row;
}

async function enviarTextoWhatsApp(numero, texto, opciones = {}) {
  const textoEnvio =
    texto != null && typeof texto !== "string" ? String(texto) : String(texto ?? "");
  const payloadWhatsapp = {
    messaging_product: "whatsapp",
    to: numero,
    text: { body: textoEnvio },
  };

  try {
    const { tokenEnviar, phoneIdEnviar } = await resolverCredencialesEnvio(opciones);

    console.log("[SEND DEBUG] respuesta openai:", textoEnvio.slice(0, 200));
    console.log("[SEND DEBUG] payload whatsapp:", payloadWhatsapp);

    const respuestaMeta = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneIdEnviar}/messages`,
      payloadWhatsapp,
      {
        headers: {
          Authorization: `Bearer ${tokenEnviar}`,
          "Content-Type": "application/json",
        },
      }
    );

    const meta = respuestaMeta.data;

    if (opciones._soloEnvioMeta) {
      return meta;
    }

    const wamid = meta?.messages?.[0]?.id || null;
    const usuarioId = opciones.usuarioId ?? null;

    try {
      if (usuarioId) {
        return await registrarMensajeSalienteEnInbox({
          usuarioId,
          numero,
          texto: textoEnvio,
          wamid,
          tipo: "texto",
        });
      }

      return await registrarMensajeSalienteEnInbox({
        usuarioId: null,
        numero,
        texto: textoEnvio,
        wamid,
        tipo: "texto",
      });
    } catch (supabaseErr) {
      console.log("ERROR ENVIANDO WHATSAPP (SUPABASE mensajes):", {
        code: supabaseErr.response?.data?.code,
        message: supabaseErr.response?.data?.message,
        details: supabaseErr.response?.data,
        url: supabaseErr.config?.url,
        bodyEnviado: supabaseErr.config?.data,
      });
      throw supabaseErr;
    }
  } catch (error) {
    const esSupabase =
      String(error.config?.url || "").includes(SUPABASE_URL) ||
      error.response?.data?.code === "PGRST102";
    console.log(
      esSupabase ? "ERROR ENVIANDO WHATSAPP (SUPABASE):" : "ERROR ENVIANDO WHATSAPP (META):",
      {
        code: error.response?.data?.code,
        message: error.response?.data?.message || error.message,
        details: error.response?.data,
        url: error.config?.url,
        bodyEnviado: error.config?.data,
      }
    );
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

    const insertPayload = normalizarBodyMensajeSupabase({
      usuarioId: opciones.usuarioId,
      numero: numeroDestino,
      texto: caption || urlOriginal,
      wamid: whatsappMessageId,
      tipo: tipoApi,
      imagen_url: urlEnvio,
    });

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
    if (opciones.usuarioId && row) {
      rt.nuevoMensaje(null, opciones.usuarioId, {
        id: row.id,
        cliente_numero: numeroDestino,
        usuario_id: opciones.usuarioId,
        direccion: "saliente",
        tipo: tipoApi,
        contenido: insertPayload.contenido,
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

    const insertPayload = normalizarBodyMensajeSupabase({
      usuarioId: opciones.usuarioId,
      numero,
      texto,
      wamid: whatsappMessageId,
      tipo: "interactive",
    });

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
    if (opciones.usuarioId) {
      rt.nuevoMensaje(null, opciones.usuarioId, {
        id: row?.id,
        cliente_numero: numero,
        usuario_id: opciones.usuarioId,
        direccion: "saliente",
        tipo: "interactive",
        contenido: insertPayload.contenido,
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
  registrarMensajeSalienteEnInbox,
  enviarMediaWhatsApp,
  enviarBotonesWhatsApp,
};