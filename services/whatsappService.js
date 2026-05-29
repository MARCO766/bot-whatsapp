const axios = require("axios");
const rt = require("./realtimeService");
const { prepararImagenParaWhatsApp, mimeCompatibleWhatsApp } = require("./imageWhatsAppService");
const {
  sanitizarUnicodeRoto,
  logEmojiDebug,
} = require("./textoSeguro");

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

/** UTF-8 válido para PostgREST: solo repara sustitutos rotos; conserva emojis. */
function sanitizarContenidoMensajeSupabase(contenido) {
  const raw = typeof contenido === "string" ? contenido : String(contenido ?? "");
  logEmojiDebug("antes guardar supabase (entrada)", raw);
  const out = sanitizarUnicodeRoto(raw);
  logEmojiDebug("antes guardar supabase (seguro)", out);
  return out;
}

function filtroConexionConversacion(conexionWhatsappId) {
  if (!conexionWhatsappId) return "";
  return `&conexion_whatsapp_id=eq.${encodeURIComponent(conexionWhatsappId)}`;
}

async function actualizarConversacionSaliente(
  usuarioId,
  numero,
  texto,
  conexionWhatsappId = null
) {
  if (!usuarioId || !numero || !SUPABASE_URL || !SUPABASE_KEY) return;

  const ultimoMensaje = sanitizarContenidoMensajeSupabase(texto);
  const headers = supabaseHeaders({ "Content-Type": "application/json" });
  const ahora = new Date().toISOString();
  const filtroConexion = filtroConexionConversacion(conexionWhatsappId);

  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/conversaciones?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}${filtroConexion}&select=*`,
      { headers }
    );
    const conv = res.data?.[0];

    if (conv) {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/conversaciones?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}${filtroConexion}`,
        {
          ultimo_mensaje: ultimoMensaje,
          ultimo_mensaje_en: ahora,
          estado: "abierta",
        },
        { headers }
      );
      return;
    }

    const nueva = {
      cliente_numero: numero,
      usuario_id: usuarioId,
      ultimo_mensaje: ultimoMensaje,
      ultimo_mensaje_en: ahora,
      estado: "abierta",
      unread_count: 0,
    };
    if (conexionWhatsappId) {
      nueva.conexion_whatsapp_id = conexionWhatsappId;
    }

    await axios.post(
      `${SUPABASE_URL}/rest/v1/conversaciones`,
      nueva,
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

/**
 * Línea del chat (último mensaje o conversación con conexion_whatsapp_id).
 * Bandeja y webhook pueden pasar conexionWhatsappId explícito.
 */
async function obtenerConexionWhatsappIdDeChat(usuarioId, numero) {
  if (!usuarioId || !numero || !SUPABASE_URL || !SUPABASE_KEY) return null;

  const headers = supabaseHeaders();
  const uid = encodeURIComponent(String(usuarioId).trim());
  const num = encodeURIComponent(String(numero).trim());

  try {
    const msgRes = await axios.get(
      `${SUPABASE_URL}/rest/v1/mensajes?usuario_id=eq.${uid}&cliente_numero=eq.${num}&conexion_whatsapp_id=not.is.null&select=conexion_whatsapp_id&order=creado_en.desc&limit=1`,
      { headers }
    );
    const idMsg = msgRes.data?.[0]?.conexion_whatsapp_id;
    if (idMsg) return String(idMsg).trim();
  } catch (err) {
    console.log("[WhatsApp] conexion desde mensajes:", err.response?.data?.message || err.message);
  }

  try {
    const convRes = await axios.get(
      `${SUPABASE_URL}/rest/v1/conversaciones?usuario_id=eq.${uid}&cliente_numero=eq.${num}&conexion_whatsapp_id=not.is.null&select=conexion_whatsapp_id&order=ultimo_mensaje_en.desc&limit=1`,
      { headers }
    );
    const idConv = convRes.data?.[0]?.conexion_whatsapp_id;
    if (idConv) return String(idConv).trim();
  } catch (err) {
    console.log("[WhatsApp] conexion desde conversaciones:", err.response?.data?.message || err.message);
  }

  return null;
}

async function completarOpcionesEnvio(opciones = {}, numero) {
  if (opciones.strictConexionWhatsappId) return opciones;
  if (opciones.conexionWhatsappId) return opciones;
  if (!opciones.usuarioId || !numero) return opciones;

  const conexionWhatsappId = await obtenerConexionWhatsappIdDeChat(
    opciones.usuarioId,
    numero
  );
  if (!conexionWhatsappId) return opciones;

  return { ...opciones, conexionWhatsappId };
}

async function resolverConexionWhatsappPorId(usuarioId, conexionWhatsappId, { soloSeguimientoStrict = false } = {}) {
  const select = soloSeguimientoStrict
    ? "id,token,phone_id,activo,nombre"
    : "*";
  const responseConexion = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(conexionWhatsappId)}&usuario_id=eq.${encodeURIComponent(usuarioId)}&select=${select}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  return responseConexion.data?.[0] || null;
}

function logResolverCredenciales(opciones, conexion, phoneIdEnviar) {
  console.log("[RESOLVER CREDENCIALES]", {
    origin: opciones.origen || null,
    strictConexionWhatsappId: Boolean(opciones.strictConexionWhatsappId),
    conexionWhatsappId_solicitada: opciones.conexionWhatsappId || null,
    conexion_encontrada_id: conexion?.id || null,
    conexion_encontrada_nombre: conexion?.nombre || null,
    conexion_encontrada_activo: conexion?.activo ?? null,
    phone_id_usado: phoneIdEnviar || null,
  });
}

function logMetaSendFinal(opcionesEnvio, numero, phoneIdEnviar) {
  console.log("[META SEND FINAL]", {
    to: String(numero || "").trim(),
    phone_number_id: phoneIdEnviar || null,
    origin: opcionesEnvio?.origen || null,
    seguimiento_id: opcionesEnvio?.seguimientoId || null,
    conexion_whatsapp_id: opcionesEnvio?.conexionWhatsappId || null,
  });
}

async function resolverCredencialesEnvio(opciones = {}) {
  let tokenEnviar = TOKEN;
  let phoneIdEnviar = PHONE_ID;
  let conexionUsada = null;
  const strictConexion = Boolean(opciones.strictConexionWhatsappId);

  if (strictConexion) {
    if (!opciones.conexionWhatsappId || !opciones.usuarioId) {
      throw new Error("Seguimiento estricto requiere conexion_whatsapp_id y usuario_id");
    }

    const conexion = await resolverConexionWhatsappPorId(
      opciones.usuarioId,
      opciones.conexionWhatsappId,
      { soloSeguimientoStrict: true }
    );

    if (!conexion?.token || !conexion?.phone_id) {
      throw new Error(
        "No se encontró la conexión WhatsApp del seguimiento (id + usuario, sin filtro activo)"
      );
    }

    console.log("[STRICT CONEXION RESUELTA]", {
      conexion_whatsapp_id: conexion.id || opciones.conexionWhatsappId,
      activo: conexion.activo,
      phone_id: conexion.phone_id,
    });

    logResolverCredenciales(opciones, conexion, conexion.phone_id);

    return {
      tokenEnviar: conexion.token,
      phoneIdEnviar: conexion.phone_id,
    };
  }

  if (opciones.conexionWhatsappId && opciones.usuarioId) {
    const conexion = await resolverConexionWhatsappPorId(
      opciones.usuarioId,
      opciones.conexionWhatsappId
    );
    if (conexion) {
      conexionUsada = conexion;
      tokenEnviar = conexion.token;
      phoneIdEnviar = conexion.phone_id;
      logResolverCredenciales(opciones, conexionUsada, phoneIdEnviar);
      return { tokenEnviar, phoneIdEnviar };
    }
  }

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
      conexionUsada = conexion;
      tokenEnviar = conexion.token;
      phoneIdEnviar = conexion.phone_id;
    }
  }

  logResolverCredenciales(opciones, conexionUsada, phoneIdEnviar);
  return { tokenEnviar, phoneIdEnviar };
}

function logSeguimientoEnvio(opcionesEnvio, numero, phoneIdEnviar) {
  if (opcionesEnvio?.origen !== "seguimiento") return;
  console.log("[SEGUIMIENTO ENVIO]", {
    cliente_numero: String(numero || "").trim(),
    conexion_whatsapp_id: opcionesEnvio.conexionWhatsappId || null,
    phone_number_id: phoneIdEnviar || null,
    seguimiento_id: opcionesEnvio.seguimientoId || null,
  });
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
  conexionWhatsappId = null,
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

  const body = {
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
  if (conexionWhatsappId) {
    body.conexion_whatsapp_id = String(conexionWhatsappId).trim();
  }
  return body;
}

async function registrarMensajeSalienteEnInbox({
  usuarioId,
  numero,
  texto,
  wamid,
  tipo = "texto",
  conexionWhatsappId = null,
}) {
  const insertPayload = normalizarBodyMensajeSupabase({
    usuarioId,
    numero,
    texto,
    wamid,
    tipo,
    conexionWhatsappId,
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
    insertPayload.contenido,
    conexionWhatsappId
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
    conexion_whatsapp_id: conexionWhatsappId || null,
    creado_en: row?.creado_en || new Date().toISOString(),
  };

  rt.nuevoMensaje(null, usuarioId, payloadMensaje);
  rt.conversacionActualizada(null, usuarioId, {
    cliente_numero: numero,
    conexion_whatsapp_id: conexionWhatsappId || null,
    ultimo_mensaje: insertPayload.contenido,
    ultimo_mensaje_en: payloadMensaje.creado_en,
    direccion: "saliente",
  });

  return row;
}

async function enviarTextoWhatsApp(numero, texto, opciones = {}) {
  const opcionesEnvio = await completarOpcionesEnvio(opciones, numero);
  const textoEnvio =
    texto != null && typeof texto !== "string" ? String(texto) : String(texto ?? "");
  const payloadWhatsapp = {
    messaging_product: "whatsapp",
    to: numero,
    text: { body: textoEnvio },
  };

  try {
    const { tokenEnviar, phoneIdEnviar } = await resolverCredencialesEnvio(opcionesEnvio);
    logSeguimientoEnvio(opcionesEnvio, numero, phoneIdEnviar);

    logEmojiDebug("antes enviar whatsapp", textoEnvio);
    console.log("[SEND DEBUG] payload whatsapp:", payloadWhatsapp);
    logMetaSendFinal(opcionesEnvio, numero, phoneIdEnviar);

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
    const usuarioId = opcionesEnvio.usuarioId ?? null;

    try {
      if (usuarioId) {
        return await registrarMensajeSalienteEnInbox({
          usuarioId,
          numero,
          texto: textoEnvio,
          wamid,
          tipo: "texto",
          conexionWhatsappId: opcionesEnvio.conexionWhatsappId || null,
        });
      }

      return await registrarMensajeSalienteEnInbox({
        usuarioId: null,
        numero,
        texto: textoEnvio,
        wamid,
        tipo: "texto",
        conexionWhatsappId: opcionesEnvio.conexionWhatsappId || null,
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
  return resolverCredencialesEnvio(opciones);
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
  const numeroDestino = normalizarNumeroWhatsApp(numero);
  const opcionesEnvio = await completarOpcionesEnvio(opciones, numeroDestino);
  const urlOriginal = String(mediaUrl || "").trim();
  const tipoApi = normalizarTipoMediaWhatsApp(tipo);

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

      urlEnvio = await resolverLinkImagenWhatsApp(urlOriginal, opcionesEnvio);

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

    const { tokenEnviar, phoneIdEnviar } = await resolverCredencialesWhatsApp(opcionesEnvio);
    logSeguimientoEnvio(opcionesEnvio, numeroDestino, phoneIdEnviar);

    if (!tokenEnviar || !phoneIdEnviar) {
      console.error("?? FALTAN CREDENCIALES WHATSAPP (token o phone_id)");
      return false;
    }

    const payload = construirPayloadMediaWhatsApp(
      numeroDestino,
      tipoApi,
      urlEnvio,
      caption,
      opcionesEnvio
    );

    if (!payload) {
      console.error("?? NO SE PUDO CONSTRUIR PAYLOAD MEDIA:", tipoApi);
      return false;
    }

    logMetaSendFinal(opcionesEnvio, numeroDestino, phoneIdEnviar);

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
      usuarioId: opcionesEnvio.usuarioId,
      numero: numeroDestino,
      texto: caption || urlOriginal,
      wamid: whatsappMessageId,
      tipo: tipoApi,
      imagen_url: urlEnvio,
      conexionWhatsappId: opcionesEnvio.conexionWhatsappId || null,
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
    if (opcionesEnvio.usuarioId && row) {
      await actualizarConversacionSaliente(
        opcionesEnvio.usuarioId,
        numeroDestino,
        insertPayload.contenido,
        opcionesEnvio.conexionWhatsappId || null
      );

      rt.nuevoMensaje(null, opcionesEnvio.usuarioId, {
        id: row.id,
        cliente_numero: numeroDestino,
        usuario_id: opcionesEnvio.usuarioId,
        direccion: "saliente",
        tipo: tipoApi,
        contenido: insertPayload.contenido,
        imagen_url: urlEnvio,
        whatsapp_message_id: whatsappMessageId,
        estado_envio: "sent",
        conexion_whatsapp_id: opcionesEnvio.conexionWhatsappId || null,
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
    const opcionesEnvio = await completarOpcionesEnvio(opciones, numero);
    const { tokenEnviar, phoneIdEnviar } = await resolverCredencialesEnvio(opcionesEnvio);
    logSeguimientoEnvio(opcionesEnvio, numero, phoneIdEnviar);

    const lista = (botones || []).slice(0, 3).filter(function (b) {
      return b && String(b.texto || "").trim();
    });

    if (!lista.length) {
      await enviarTextoWhatsApp(numero, texto, opcionesEnvio);
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

    logMetaSendFinal(opcionesEnvio, numero, phoneIdEnviar);

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
      usuarioId: opcionesEnvio.usuarioId,
      numero,
      texto,
      wamid: whatsappMessageId,
      tipo: "interactive",
      conexionWhatsappId: opcionesEnvio.conexionWhatsappId || null,
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
    if (opcionesEnvio.usuarioId) {
      await actualizarConversacionSaliente(
        opcionesEnvio.usuarioId,
        numero,
        insertPayload.contenido,
        opcionesEnvio.conexionWhatsappId || null
      );

      rt.nuevoMensaje(null, opcionesEnvio.usuarioId, {
        id: row?.id,
        cliente_numero: numero,
        usuario_id: opcionesEnvio.usuarioId,
        direccion: "saliente",
        tipo: "interactive",
        contenido: insertPayload.contenido,
        whatsapp_message_id: whatsappMessageId,
        estado_envio: "sent",
        conexion_whatsapp_id: opcionesEnvio.conexionWhatsappId || null,
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