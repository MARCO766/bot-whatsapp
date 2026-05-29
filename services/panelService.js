/**
 * Dashboard operativo Panel — solo Supabase, sin mocks.
 */
const axios = require("axios");
const { computeHeaderStats, countFlujosActivos } = require("./flujosMetricsService");
const { isSchemaMissingError, logSchemaFallback } = require("./supabaseSafe");
const { computeResumen, fetchFlujosList } = require("./metricasService");
const { loadInboxData, formatPreview } = require("./inboxService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const CONEXION_TODAS = "__todas__";

function buildConexionFilter(conexionWhatsappId) {
  const raw = conexionWhatsappId == null ? "" : String(conexionWhatsappId).trim();
  if (!raw || raw === CONEXION_TODAS) return "";
  return `&conexion_whatsapp_id=eq.${encodeURIComponent(raw)}`;
}

function logMetricasMulti(conexionWhatsappId, ctx = "") {
  const raw = conexionWhatsappId == null ? "" : String(conexionWhatsappId).trim();
  const scope = !raw || raw === CONEXION_TODAS ? "todas" : "uuid";
  const id = scope === "uuid" ? raw : "";
  console.log(
    `[METRICAS_MULTI]${ctx ? ` ${ctx}` : ""} conexion_whatsapp_id=${id || "(none)"} scope=${scope}`
  );
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

async function supabaseSelect(table, filterQuery, selectFields = "*", limit = 30) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(selectFields)}&${filterQuery}&limit=${limit}`;
  try {
    const res = await axios.get(url, { headers: headers() });
    return res.data || [];
  } catch (e) {
    if (table === "crm_conversiones" && isSchemaMissingError(e)) {
      logSchemaFallback(table, e);
      return [];
    }
    console.log(`[panel] select ${table}:`, e.response?.data || e.message);
    return null;
  }
}

async function supabasePing() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    const res = await axios.get(`${SUPABASE_URL}/rest/v1/clientes?select=id&limit=1`, {
      headers: headers({ Prefer: "count=exact", Range: "0-0" }),
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

async function fetchConexionWhatsapp(usuarioId) {
  const uid = encodeURIComponent(usuarioId);
  const rows = await supabaseSelect(
    "conexiones_whatsapp",
    `usuario_id=eq.${uid}&activo=eq.true`,
    "numero,phone_id,token,pixel_id,capi_token,activo",
    1
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function buildSistema(usuarioId) {
  const [conexion, supabaseOk] = await Promise.all([
    fetchConexionWhatsapp(usuarioId),
    supabasePing(),
  ]);

  const hasToken = Boolean(conexion?.token?.trim());
  const hasPhoneId = Boolean(conexion?.phone_id?.trim());
  const whatsappOk = Boolean(conexion && hasToken && hasPhoneId);

  const webhookOk = whatsappOk;
  const webhookWarning = !whatsappOk
    ? "Conecta WhatsApp para recibir mensajes vía webhook"
    : !process.env.VERIFY_TOKEN
      ? "Configura VERIFY_TOKEN en el servidor para verificación Meta"
      : null;

  return {
    whatsapp: {
      ok: whatsappOk,
      label: whatsappOk ? "Conectado" : conexion ? "Incompleto" : "Sin conexión",
      numero: conexion?.numero || null,
      warning: !whatsappOk
        ? "Guarda token y Phone ID en Ajustes o panel admin"
        : null,
    },
    api: {
      ok: true,
      label: "Online",
      warning: null,
    },
    supabase: {
      ok: supabaseOk,
      label: supabaseOk ? "Conectado" : "Sin conexión",
      warning: !supabaseOk ? "Revisa SUPABASE_URL y SUPABASE_SECRET_KEY" : null,
    },
    webhook: {
      ok: webhookOk,
      label: webhookOk ? "Activo" : hasPhoneId ? "Pendiente" : "Inactivo",
      warning: webhookWarning,
    },
  };
}

function previewMensaje(row) {
  const tipo = String(row.tipo || "").toLowerCase();
  if (tipo === "audio") return "Audio recibido";
  if (tipo === "image" || tipo === "imagen") return "Imagen recibida";
  if (tipo === "video") return "Video recibido";
  if (tipo === "document") return "Documento recibido";
  const txt = formatPreview(row.contenido || "");
  return txt ? `"${txt}"` : "Mensaje recibido";
}

function buildActividadEventos(mensajes, seguimientos, conversiones, flujosMap) {
  const events = [];

  (mensajes || []).forEach((row) => {
    if (row.direccion !== "entrante") return;
    const preview = previewMensaje(row);
    events.push({
      tipo: "mensaje_entrante",
      titulo: `Cliente escribió ${preview}`,
      detalle: row.cliente_numero || "",
      fecha: row.creado_en,
      dot: "green",
    });
  });

  (seguimientos || []).forEach((row) => {
    let titulo = "Seguimiento actualizado";
    let dot = "cyan";

    if (row.estado === "enviado") {
      titulo = "Seguimiento enviado";
      dot = "orange";
    } else if (row.estado === "pendiente") {
      titulo = "Flujo / seguimiento programado";
      dot = "purple";
    } else if (row.estado === "respondido") {
      titulo = "Lead respondió en flujo";
      dot = "green";
    }

    const flujoNombre = flujosMap[row.flujo_id];
    events.push({
      tipo: "seguimiento",
      titulo,
      detalle: [
        row.cliente_numero ? `Cliente ${row.cliente_numero}` : null,
        flujoNombre ? `Flujo: ${flujoNombre}` : null,
        row.mensaje_tipo === "audio" ? "Audio" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      fecha: row.enviado_en || row.actualizado_en || row.creado_en,
      dot,
    });
  });

  (conversiones || []).forEach((row) => {
    const valor = parseFloat(row.valor);
    const monto =
      Number.isFinite(valor) && valor > 0
        ? `${valor} ${row.moneda || "BOB"}`
        : null;
    events.push({
      tipo: "conversion",
      titulo: "Conversión registrada",
      detalle: [
        row.cliente_numero ? `Cliente ${row.cliente_numero}` : null,
        monto,
      ]
        .filter(Boolean)
        .join(" · "),
      fecha: row.creado_en,
      dot: "purple",
    });
  });

  return events
    .filter((e) => e.fecha)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 20);
}

async function fetchActividadReciente(usuarioId, flujos, conexionWhatsappId = null) {
  const uid = encodeURIComponent(usuarioId);
  const connF = buildConexionFilter(conexionWhatsappId);
  const flujosMap = {};
  (flujos || []).forEach((f) => {
    flujosMap[f.id] = f.nombre;
  });

  const [mensajes, seguimientos, conversiones] = await Promise.all([
    supabaseSelect(
      "mensajes",
      `usuario_id=eq.${uid}${connF}&direccion=eq.entrante&order=creado_en.desc`,
      "cliente_numero,direccion,tipo,contenido,creado_en",
      12
    ),
    supabaseSelect(
      "seguimientos_programados",
      `usuario_id=eq.${uid}${connF}&order=creado_en.desc`,
      "estado,cliente_numero,flujo_id,creado_en,actualizado_en,enviado_en,mensaje_tipo",
      12
    ),
    supabaseSelect(
      "crm_conversiones",
      `usuario_id=eq.${uid}${connF}&order=creado_en.desc`,
      "cliente_numero,valor,moneda,creado_en",
      8
    ),
  ]);

  return buildActividadEventos(
    mensajes || [],
    seguimientos || [],
    conversiones || [],
    flujosMap
  );
}

async function buildLeadsSinRespuesta(usuarioId, conexionWhatsappId = null) {
  const inbox = await loadInboxData(usuarioId, { conexionWhatsappId });
  const pendientes = (inbox.chats || [])
    .filter((c) => !c.bloqueado && (c.noLeidos || 0) > 0)
    .sort((a, b) => {
      const ta = new Date(a.ultimoMensajeEn || 0).getTime();
      const tb = new Date(b.ultimoMensajeEn || 0).getTime();
      return tb - ta;
    });

  return {
    total: pendientes.length,
    items: pendientes.slice(0, 8).map((c) => ({
      numero: c.numero,
      nombre: c.nombre,
      ultimoMensaje: c.ultimoMensaje,
      ultimoMensajeEn: c.ultimoMensajeEn,
      noLeidos: c.noLeidos,
    })),
  };
}

function embudoDesdeMetricas(kpis) {
  const leads = kpis.leads ?? 0;
  const conversaciones = kpis.conversaciones ?? 0;
  const ventas = kpis.ventas ?? 0;
  const max = Math.max(leads, conversaciones, ventas, 1);

  return {
    leads,
    conversaciones,
    ventas,
    vacio: leads === 0 && conversaciones === 0 && ventas === 0,
    pasos: [
      { nombre: "Leads", cantidad: leads, pct: Math.round((leads / max) * 100) },
      { nombre: "Conversaciones", cantidad: conversaciones, pct: Math.round((conversaciones / max) * 100) },
      { nombre: "Ventas", cantidad: ventas, pct: Math.round((ventas / max) * 100) },
    ],
  };
}

async function computePanelDashboard(usuarioId, opts = {}) {
  const conexionWhatsappId =
    opts.conexionWhatsappId ?? opts.conexion_whatsapp_id ?? null;
  logMetricasMulti(conexionWhatsappId, "computePanelDashboard");
  const flujos = await fetchFlujosList(usuarioId);

  const [sistema, resumenHoy, headerStats, actividad, leadsSinRespuesta] = await Promise.all([
    buildSistema(usuarioId),
    computeResumen(usuarioId, { periodo: "hoy", conexion_whatsapp_id: conexionWhatsappId }),
    computeHeaderStats(usuarioId, flujos, conexionWhatsappId),
    fetchActividadReciente(usuarioId, flujos, conexionWhatsappId),
    buildLeadsSinRespuesta(usuarioId, conexionWhatsappId),
  ]);

  const kpisHoy = resumenHoy?.kpis || {};

  return {
    ok: true,
    source: "supabase",
    sistema,
    kpis: {
      leadsHoy: kpisHoy.leads ?? 0,
      conversacionesActivas: headerStats.conversaciones ?? kpisHoy.conversaciones ?? 0,
      ventasHoy: kpisHoy.ventas ?? 0,
      flujosActivos: headerStats.flujosActivos ?? countFlujosActivos(flujos),
      tendenciaLeads: kpisHoy.tendenciaLeads ?? headerStats.tendenciaLeads,
      tendenciaConversaciones: kpisHoy.tendenciaConversaciones ?? headerStats.tendenciaConversaciones,
      tendenciaVentas: kpisHoy.tendenciaVentas ?? headerStats.tendenciaVentas,
      ingresosHoy: kpisHoy.ingresos ?? 0,
      moneda: kpisHoy.moneda || "BOB",
    },
    actividad,
    leadsSinRespuesta,
    embudo: embudoDesdeMetricas(kpisHoy),
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  computePanelDashboard,
};
