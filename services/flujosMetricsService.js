/**
 * Métricas reales para pantalla Flujos — solo Supabase, sin mocks.
 * Ventas/conversiones: tabla crm_conversiones (nunca etiquetas).
 */
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function supabaseCount(table, filterQuery) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id&${filterQuery}`;
  try {
    const res = await axios.get(url, {
      headers: headers({ Prefer: "count=exact", Range: "0-0" }),
    });
    const range = res.headers["content-range"] || res.headers["Content-Range"] || "";
    const part = String(range).split("/")[1];
    const n = parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    console.log(`[flujosMetrics] count ${table}:`, e.response?.data || e.message);
    return null;
  }
}

async function supabaseSelect(table, filterQuery, selectFields = "*") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(selectFields)}&${filterQuery}`;
  try {
    const res = await axios.get(url, { headers: headers() });
    return res.data || [];
  } catch (e) {
    console.log(`[flujosMetrics] select ${table}:`, e.response?.data || e.message);
    return null;
  }
}

function resolveEstado(data) {
  const raw = data && typeof data === "object" ? data : {};
  const meta = raw.macbot_meta && typeof raw.macbot_meta === "object" ? raw.macbot_meta : {};
  const nodos = Array.isArray(raw.nodos) ? raw.nodos : [];
  const estados = ["activo", "pausado", "borrador", "error"];

  if (estados.includes(meta.estado)) return meta.estado;
  if (!nodos.length) return "borrador";
  return "borrador";
}

async function fetchSeguimientosRows(usuarioId) {
  const uid = encodeURIComponent(usuarioId);
  return (
    (await supabaseSelect(
      "seguimientos_programados",
      `usuario_id=eq.${uid}`,
      "flujo_id,estado,cliente_numero,creado_en,actualizado_en,enviado_en"
    )) || []
  );
}

async function fetchConversionesRows(usuarioId) {
  const uid = encodeURIComponent(usuarioId);
  const rows = await supabaseSelect(
    "crm_conversiones",
    `usuario_id=eq.${uid}&order=creado_en.desc`,
    "flujo_id,valor,moneda,cliente_numero,creado_en,origen"
  );
  if (rows === null) return null;
  return rows;
}

function metricasVacias() {
  return {
    clientesEnFlujo: 0,
    leadsHoy: 0,
    respuestas: 0,
    conversiones: 0,
    ultimaEjecucion: null,
  };
}

function agregarMetricasConversiones(byFlow, conversionesRows) {
  if (!Array.isArray(conversionesRows)) return;

  conversionesRows.forEach((row) => {
    if (!row.flujo_id || !byFlow[row.flujo_id]) return;
    byFlow[row.flujo_id].conversiones += 1;
  });
}

/** Métricas por flujo para la UI simplificada (4 valores por card). */
function computePerFlowMetrics(flowIds, segRows, conversionesRows) {
  const hoy = startOfTodayIso();
  const byFlow = {};
  flowIds.forEach((id) => {
    byFlow[id] = metricasVacias();
  });

  const clientesPorFlujo = {};
  flowIds.forEach((id) => {
    clientesPorFlujo[id] = new Set();
  });

  segRows.forEach((row) => {
    if (!row.flujo_id || !byFlow[row.flujo_id]) return;
    const m = byFlow[row.flujo_id];

    if (row.cliente_numero) {
      clientesPorFlujo[row.flujo_id].add(row.cliente_numero);
    }
    if (row.creado_en && row.creado_en >= hoy && row.cliente_numero) {
      if (!m._leadsHoySet) m._leadsHoySet = new Set();
      m._leadsHoySet.add(row.cliente_numero);
    }
    if (row.estado === "respondido") m.respuestas += 1;

    const execAt = row.enviado_en || row.actualizado_en;
    if (execAt && (!m.ultimaEjecucion || execAt > m.ultimaEjecucion)) {
      m.ultimaEjecucion = execAt;
    }
  });

  flowIds.forEach((fid) => {
    const m = byFlow[fid];
    m.clientesEnFlujo = clientesPorFlujo[fid].size;
    m.leadsHoy = m._leadsHoySet ? m._leadsHoySet.size : 0;
    delete m._leadsHoySet;
  });

  agregarMetricasConversiones(byFlow, conversionesRows);

  return byFlow;
}

async function computeGlobalStats(usuarioId, flujos) {
  const uid = encodeURIComponent(usuarioId);

  const porEstado = { activo: 0, pausado: 0, borrador: 0, error: 0 };
  flujos.forEach((f) => {
    const est = resolveEstado(f.data);
    porEstado[est] = (porEstado[est] || 0) + 1;
  });

  const [leadsVivos, conversaciones, conversionesCount] = await Promise.all([
    supabaseCount("clientes", `usuario_id=eq.${uid}&estado=neq.bloqueado`),
    supabaseCount("conversaciones", `usuario_id=eq.${uid}`),
    supabaseCount("crm_conversiones", `usuario_id=eq.${uid}`),
  ]);

  const ventas = conversionesCount === null ? 0 : conversionesCount;

  return {
    leadsVivos: leadsVivos ?? 0,
    conversaciones: conversaciones ?? 0,
    activos: porEstado.activo,
    ventas,
    conversiones: ventas,
  };
}

/** Carga datos compartidos para lista + stats en una sola pasada. */
async function loadFlujosDashboardData(usuarioId, flujos, activadores) {
  const flowIds = flujos.map((f) => f.id);
  const [segRows, conversionesRows] = await Promise.all([
    fetchSeguimientosRows(usuarioId),
    fetchConversionesRows(usuarioId),
  ]);

  const perFlow = computePerFlowMetrics(
    flowIds,
    segRows || [],
    conversionesRows === null ? [] : conversionesRows
  );
  const stats = await computeGlobalStats(usuarioId, flujos, activadores);

  return {
    segRows: segRows || [],
    conversionesRows: conversionesRows || [],
    perFlow,
    stats,
  };
}

module.exports = {
  startOfTodayIso,
  resolveEstado,
  fetchSeguimientosRows,
  fetchConversionesRows,
  computePerFlowMetrics,
  computeGlobalStats,
  loadFlujosDashboardData,
  metricasVacias,
};
