/**
 * Carga y normaliza datos del inbox (Supabase).
 * Usado por /inbox (EJS) y /api/inbox (React Bandeja).
 */
const axios = require("axios");
const { pausaActivaDesdeFilas } = require("./conversaciones/botPauseService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function filtroConexionQuery(conexionWhatsappId) {
  if (!conexionWhatsappId) return "";
  return `&conexion_whatsapp_id=eq.${encodeURIComponent(conexionWhatsappId)}`;
}

function sameConexionId(a, b) {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function chatCompositeKey(numero, conexionWhatsappId) {
  const n = String(numero || "").trim();
  const c = String(conexionWhatsappId || "").trim();
  return `${n}::${c}`;
}

function parseChatCompositeKey(key) {
  const raw = String(key || "");
  const sep = raw.indexOf("::");
  if (sep === -1) {
    return { numero: raw.trim(), conexionWhatsappId: "" };
  }
  return {
    numero: raw.slice(0, sep).trim(),
    conexionWhatsappId: raw.slice(sep + 2).trim(),
  };
}

function horaBolivia(fecha) {
  if (!fecha) return "";
  return new Date(fecha).toLocaleTimeString("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatPreview(texto) {
  if (!texto) return "";
  if (texto === "image" || texto === "imagen") return "📷 Imagen";
  if (texto === "audio") return "🎧 Audio";
  if (texto === "document") return "📄 Documento";
  if (texto === "video") return "🎥 Video";
  return String(texto).substring(0, 35);
}

function botPauseFieldsFromConv(conv) {
  const estado = pausaActivaDesdeFilas(conv || {});
  return {
    bot_pausado: estado.activa,
    bot_pausado_hasta: estado.bot_pausado_hasta,
    bot_pausado_motivo: estado.bot_pausado_motivo,
  };
}

async function loadConexionesInbox(usuarioId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}&select=id,nombre,numero,phone_id,activo,creado_en&order=creado_en.asc`,
    { headers: supabaseHeaders() }
  );
  const filas = Array.isArray(res.data) ? res.data : [];
  return filas.map((c) => ({
    ...c,
    estado: c.activo ? "principal" : "secundaria",
  }));
}

async function loadInboxData(
  usuarioId,
  { etiquetaFiltro = "", conexionWhatsappId = null } = {}
) {
  const filtroConexion = filtroConexionQuery(conexionWhatsappId);

  const [
    responseMensajes,
    responseEtiquetas,
    responseColoresEtiquetas,
    responseClientes,
    responseConversaciones,
    conexionesInbox,
  ] = await Promise.all([
    axios.get(
      `${SUPABASE_URL}/rest/v1/mensajes?usuario_id=eq.${usuarioId}${filtroConexion}&select=*&order=creado_en.desc&limit=200`,
      { headers: supabaseHeaders() }
    ),
    axios.get(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas?usuario_id=eq.${usuarioId}&select=*`,
      { headers: supabaseHeaders() }
    ),
    axios.get(
      `${SUPABASE_URL}/rest/v1/etiquetas?usuario_id=eq.${usuarioId}&select=nombre,color,conexion_whatsapp_id`,
      { headers: supabaseHeaders() }
    ),
    axios.get(
      `${SUPABASE_URL}/rest/v1/clientes?usuario_id=eq.${usuarioId}&select=*`,
      { headers: supabaseHeaders() }
    ),
    axios.get(
      `${SUPABASE_URL}/rest/v1/conversaciones?usuario_id=eq.${usuarioId}${filtroConexion}&select=*&order=ultimo_mensaje_en.desc&limit=20`,
      { headers: supabaseHeaders() }
    ),
    loadConexionesInbox(usuarioId),
  ]);

  // --- FASE 1: instrumentación diagnóstica (temporal) ---
  const conversacionesDataLength = (responseConversaciones.data || []).length;
  const etiquetasDataLength = (responseEtiquetas.data || []).length;
  const mensajesDataLength = (responseMensajes.data || []).length;

  const contentRangeConversaciones =
    responseConversaciones.headers?.["content-range"] ??
    responseConversaciones.headers?.["Content-Range"] ??
    null;
  const contentRangeEtiquetas =
    responseEtiquetas.headers?.["content-range"] ??
    responseEtiquetas.headers?.["Content-Range"] ??
    null;
  const contentRangeMensajes =
    responseMensajes.headers?.["content-range"] ??
    responseMensajes.headers?.["Content-Range"] ??
    null;

  console.log(
    "[inbox] responseConversaciones.data.length:",
    conversacionesDataLength
  );
  console.log("[inbox] conversaciones cargadas:", conversacionesDataLength);
  console.log("[inbox] responseEtiquetas.data.length:", etiquetasDataLength);
  console.log("[inbox] responseMensajes.data.length:", mensajesDataLength);

  if (contentRangeConversaciones != null) {
    console.log(
      "[inbox] conversaciones Content-Range:",
      contentRangeConversaciones
    );
  } else {
    console.log("[inbox] conversaciones Content-Range: (no presente)");
  }
  if (contentRangeEtiquetas != null) {
    console.log("[inbox] clientes_etiquetas Content-Range:", contentRangeEtiquetas);
  } else {
    console.log("[inbox] clientes_etiquetas Content-Range: (no presente)");
  }
  if (contentRangeMensajes != null) {
    console.log("[inbox] mensajes Content-Range:", contentRangeMensajes);
  } else {
    console.log("[inbox] mensajes Content-Range: (no presente)");
  }

  console.log("=============================");
  console.log("INBOX LOAD");
  console.log("=============================");
  console.log("Conversaciones:");
  console.log("- data.length:", conversacionesDataLength);
  console.log(
    "- Content-Range:",
    contentRangeConversaciones != null ? contentRangeConversaciones : "(no presente)"
  );
  console.log("Etiquetas:");
  console.log("- data.length:", etiquetasDataLength);
  console.log(
    "- Content-Range:",
    contentRangeEtiquetas != null ? contentRangeEtiquetas : "(no presente)"
  );
  console.log("Mensajes:");
  console.log("- data.length:", mensajesDataLength);
  console.log(
    "- Content-Range:",
    contentRangeMensajes != null ? contentRangeMensajes : "(no presente)"
  );
  console.log("=============================");
  // --- fin instrumentación FASE 1 ---

  const mapaNombreConexion = {};
  (conexionesInbox || []).forEach((c) => {
    if (c?.id != null) {
      mapaNombreConexion[String(c.id)] =
        (c.nombre && String(c.nombre).trim()) ||
        (c.numero && String(c.numero).trim()) ||
        "";
    }
  });

  const mapaColoresEtiquetas = {};
  (responseColoresEtiquetas.data || []).forEach((e) => {
    mapaColoresEtiquetas[e.nombre] = e.color || "#25d366";
  });

  const etiquetasClientes = responseEtiquetas.data || [];
  const asignacionesParaChips = conexionWhatsappId
    ? etiquetasClientes.filter((e) =>
        sameConexionId(e.conexion_whatsapp_id, conexionWhatsappId)
      )
    : etiquetasClientes;
  const etiquetasUnicas = [
    ...new Set(
      asignacionesParaChips.map((e) => e.etiqueta).filter(Boolean)
    ),
  ];
  const etiquetasDisponibles = responseColoresEtiquetas.data || [];

  const clientes = responseClientes.data || [];
  const mapaClientes = {};
  clientes.forEach((c) => {
    mapaClientes[c.numero] = c;
  });

  const conversacionesDB = responseConversaciones.data || [];
  const mapaUnread = {};
  const mapaConversaciones = {};
  conversacionesDB.forEach((c) => {
    const numero = c.cliente_numero;
    const connId = c.conexion_whatsapp_id;
    if (!numero || !connId) return;
    const key = chatCompositeKey(numero, connId);
    mapaUnread[key] = c.unread_count || 0;
    mapaConversaciones[key] = c;
  });

  const conversaciones = {};
  const mensajes = responseMensajes.data || [];
  mensajes.sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));

  mensajes.forEach((msg) => {
    const numero =
      msg.cliente_numero ||
      msg.numero_de_cliente ||
      msg["número_de_cliente"];
    const connId = msg.conexion_whatsapp_id;
    if (!numero || !connId) return;
    const key = chatCompositeKey(numero, connId);
    if (!conversaciones[key]) conversaciones[key] = [];
    conversaciones[key].push(msg);
  });

  let chatKeys = Object.keys(mapaConversaciones).filter((key) => {
    const { numero, conexionWhatsappId } = parseChatCompositeKey(key);
    return numero && conexionWhatsappId;
  });

  chatKeys.sort((keyA, keyB) => {
    const convA = mapaConversaciones[keyA];
    const convB = mapaConversaciones[keyB];
    const fechaA =
      convA?.ultimo_mensaje_en ||
      conversaciones[keyA]?.[conversaciones[keyA].length - 1]?.creado_en ||
      0;
    const fechaB =
      convB?.ultimo_mensaje_en ||
      conversaciones[keyB]?.[conversaciones[keyB].length - 1]?.creado_en ||
      0;
    return new Date(fechaB).getTime() - new Date(fechaA).getTime();
  });

  if (etiquetaFiltro) {
    const keysConEtiqueta = new Set(
      etiquetasClientes
        .filter((e) => e.etiqueta === etiquetaFiltro && e.cliente_numero)
        .filter(
          (e) =>
            !conexionWhatsappId ||
            sameConexionId(e.conexion_whatsapp_id, conexionWhatsappId)
        )
        .map((e) => chatCompositeKey(e.cliente_numero, e.conexion_whatsapp_id))
        .filter((key) => {
          const { numero, conexionWhatsappId: conn } = parseChatCompositeKey(key);
          return numero && conn;
        })
    );
    chatKeys = chatKeys.filter((key) => keysConEtiqueta.has(key));
  }

  const chats = chatKeys.map((key) => {
    const conv = mapaConversaciones[key];
    const msgs = conversaciones[key] || [];
    const lastMsg = msgs[msgs.length - 1];
    const parsed = parseChatCompositeKey(key);
    const numero =
      conv?.cliente_numero || lastMsg?.cliente_numero || parsed.numero;
    const connId =
      conv?.conexion_whatsapp_id ||
      lastMsg?.conexion_whatsapp_id ||
      parsed.conexionWhatsappId;
    const cliente = mapaClientes[numero];
    const previewRaw =
      conv?.ultimo_mensaje ||
      lastMsg?.contenido ||
      lastMsg?.tipo ||
      "";
    const tags = etiquetasClientes
      .filter(
        (e) =>
          e.cliente_numero === numero &&
          sameConexionId(e.conexion_whatsapp_id, connId)
      )
      .map((e) => ({
        nombre: e.etiqueta,
        color: mapaColoresEtiquetas[e.etiqueta] || "#25d366",
      }));

    return {
      chatKey: chatCompositeKey(numero, connId),
      numero,
      cliente_numero: numero,
      conexion_whatsapp_id: connId,
      conexionWhatsappId: connId,
      conexion_nombre: mapaNombreConexion[String(connId)] || "",
      conversacion_id: conv?.id || null,
      conversacionId: conv?.id || null,
      nombre: cliente?.nombre || numero,
      bloqueado: cliente?.estado === "bloqueado",
      online: true,
      noLeidos: mapaUnread[key] || 0,
      ultimoMensaje: formatPreview(previewRaw),
      ultimoMensajeEn: conv?.ultimo_mensaje_en || lastMsg?.creado_en || null,
      etiquetas: tags,
      ...botPauseFieldsFromConv(conv),
    };
  });

  const totalNoLeidos = chats.reduce((sum, c) => sum + (c.noLeidos || 0), 0);

  return {
    conexionWhatsappId,
    etiquetaFiltro,
    etiquetasUnicas,
    etiquetasDisponibles,
    mapaColoresEtiquetas,
    etiquetasClientes,
    conversaciones,
    mapaConversaciones,
    mapaClientes,
    mapaUnread,
    chatKeys,
    chats,
    totalNoLeidos,
    horaBolivia,
  };
}

async function loadChatMessages(usuarioId, numero, conexionWhatsappId = null) {
  const filtroConexion = filtroConexionQuery(conexionWhatsappId);

  const [responseMensajes, responseCliente, responseConv] = await Promise.all([
    axios.get(
      `${SUPABASE_URL}/rest/v1/mensajes?usuario_id=eq.${usuarioId}&cliente_numero=eq.${encodeURIComponent(numero)}${filtroConexion}&select=*&order=creado_en.asc&limit=1000`,
      { headers: supabaseHeaders() }
    ),
    axios.get(
      `${SUPABASE_URL}/rest/v1/clientes?usuario_id=eq.${usuarioId}&numero=eq.${encodeURIComponent(numero)}&select=*`,
      { headers: supabaseHeaders() }
    ),
    conexionWhatsappId
      ? axios.get(
          `${SUPABASE_URL}/rest/v1/conversaciones?usuario_id=eq.${usuarioId}&cliente_numero=eq.${encodeURIComponent(numero)}${filtroConexion}&select=id,conexion_whatsapp_id,bot_pausado,bot_pausado_hasta,bot_pausado_motivo&limit=1`,
          { headers: supabaseHeaders() }
        )
      : Promise.resolve({ data: [] }),
  ]);

  const cliente = responseCliente.data?.[0];
  const conv = responseConv.data?.[0];
  const pauseFields = botPauseFieldsFromConv(conv);
  return {
    nombre: cliente?.nombre || numero,
    bloqueado: cliente?.estado === "bloqueado",
    numero,
    cliente_numero: numero,
    conexionWhatsappId,
    conexion_whatsapp_id: conexionWhatsappId,
    conversacionId: conv?.id || null,
    conversacion_id: conv?.id || null,
    ...pauseFields,
    mensajes: responseMensajes.data || [],
  };
}

async function marcarLeido(usuarioId, numero, conexionWhatsappId = null) {
  const filtroConexion = filtroConexionQuery(conexionWhatsappId);
  await axios.patch(
    `${SUPABASE_URL}/rest/v1/conversaciones?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}${filtroConexion}`,
    { unread_count: 0 },
    {
      headers: supabaseHeaders({
        "Content-Type": "application/json",
      }),
    }
  );
}

module.exports = {
  loadInboxData,
  loadChatMessages,
  marcarLeido,
  loadConexionesInbox,
  filtroConexionQuery,
  chatCompositeKey,
  parseChatCompositeKey,
  horaBolivia,
  formatPreview,
  supabaseHeaders,
  SUPABASE_URL,
  SUPABASE_KEY,
};
