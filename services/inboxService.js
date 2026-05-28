/**
 * Carga y normaliza datos del inbox (Supabase).
 * Usado por /inbox (EJS) y /api/inbox (React Bandeja).
 */
const axios = require("axios");

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
  ] = await Promise.all([
    axios.get(
      `${SUPABASE_URL}/rest/v1/mensajes?usuario_id=eq.${usuarioId}${filtroConexion}&select=*&order=creado_en.asc&limit=50`,
      { headers: supabaseHeaders() }
    ),
    axios.get(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas?usuario_id=eq.${usuarioId}&select=*`,
      { headers: supabaseHeaders() }
    ),
    axios.get(
      `${SUPABASE_URL}/rest/v1/etiquetas?usuario_id=eq.${usuarioId}&select=nombre,color`,
      { headers: supabaseHeaders() }
    ),
    axios.get(
      `${SUPABASE_URL}/rest/v1/clientes?usuario_id=eq.${usuarioId}&select=*`,
      { headers: supabaseHeaders() }
    ),
    axios.get(
      `${SUPABASE_URL}/rest/v1/conversaciones?usuario_id=eq.${usuarioId}${filtroConexion}&select=*`,
      { headers: supabaseHeaders() }
    ),
  ]);

  const mapaColoresEtiquetas = {};
  (responseColoresEtiquetas.data || []).forEach((e) => {
    mapaColoresEtiquetas[e.nombre] = e.color || "#25d366";
  });

  const etiquetasClientes = responseEtiquetas.data || [];
  const etiquetasUnicas = [...new Set(etiquetasClientes.map((e) => e.etiqueta))];
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
    mapaUnread[c.cliente_numero] = c.unread_count || 0;
    mapaConversaciones[c.cliente_numero] = c;
  });

  const conversaciones = {};
  const mensajes = responseMensajes.data || [];
  mensajes.sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));

  mensajes.forEach((msg) => {
    const numero =
      msg.cliente_numero ||
      msg.numero_de_cliente ||
      msg["número_de_cliente"];
    if (!numero) return;
    if (!conversaciones[numero]) conversaciones[numero] = [];
    conversaciones[numero].push(msg);
  });

  let numeros = [
    ...new Set([
      ...Object.keys(mapaConversaciones),
      ...Object.keys(conversaciones),
    ]),
  ].filter((numero) => numero && mapaConversaciones[numero]);

  numeros.sort((a, b) => {
    const fechaA =
      mapaConversaciones[a]?.ultimo_mensaje_en ||
      conversaciones[a]?.[conversaciones[a].length - 1]?.creado_en ||
      0;
    const fechaB =
      mapaConversaciones[b]?.ultimo_mensaje_en ||
      conversaciones[b]?.[conversaciones[b].length - 1]?.creado_en ||
      0;
    return new Date(fechaB).getTime() - new Date(fechaA).getTime();
  });

  if (etiquetaFiltro) {
    const numerosConEtiqueta = etiquetasClientes
      .filter((e) => e.etiqueta === etiquetaFiltro)
      .map((e) => e.cliente_numero);
    numeros = numeros.filter((numero) => numerosConEtiqueta.includes(numero));
  }

  const chats = numeros.map((numero) => {
    const cliente = mapaClientes[numero];
    const conv = mapaConversaciones[numero];
    const previewRaw = conv?.ultimo_mensaje || "";
    const tags = etiquetasClientes
      .filter((e) => e.cliente_numero === numero)
      .map((e) => ({
        nombre: e.etiqueta,
        color: mapaColoresEtiquetas[e.etiqueta] || "#25d366",
      }));

    return {
      numero,
      conexionWhatsappId: conexionWhatsappId || conv?.conexion_whatsapp_id || null,
      nombre: cliente?.nombre || numero,
      bloqueado: cliente?.estado === "bloqueado",
      online: true,
      noLeidos: mapaUnread[numero] || 0,
      ultimoMensaje: formatPreview(previewRaw),
      ultimoMensajeEn: conv?.ultimo_mensaje_en || null,
      etiquetas: tags,
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
    numeros,
    chats,
    totalNoLeidos,
    horaBolivia,
  };
}

async function loadChatMessages(usuarioId, numero, conexionWhatsappId = null) {
  const filtroConexion = filtroConexionQuery(conexionWhatsappId);

  const [responseMensajes, responseCliente] = await Promise.all([
    axios.get(
      `${SUPABASE_URL}/rest/v1/mensajes?usuario_id=eq.${usuarioId}&cliente_numero=eq.${encodeURIComponent(numero)}${filtroConexion}&select=*&order=creado_en.asc&limit=1000`,
      { headers: supabaseHeaders() }
    ),
    axios.get(
      `${SUPABASE_URL}/rest/v1/clientes?usuario_id=eq.${usuarioId}&numero=eq.${encodeURIComponent(numero)}&select=*`,
      { headers: supabaseHeaders() }
    ),
  ]);

  const cliente = responseCliente.data?.[0];
  return {
    nombre: cliente?.nombre || numero,
    bloqueado: cliente?.estado === "bloqueado",
    conexionWhatsappId,
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
  horaBolivia,
  formatPreview,
  supabaseHeaders,
  SUPABASE_URL,
  SUPABASE_KEY,
};
