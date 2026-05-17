/**
 * Métricas reales para pantalla Flujos — solo Supabase, sin mocks.
 */
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const ETIQUETAS_VENTA = ["Pagó", "Compró", "Pago", "pago", "compró", "pagó"];

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

/**
 * Estado guardado en data.macbot_meta — sin inferir "activo" por activadores.
 */
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

function aggregateSeguimientosPorFlujo(rows) {
  const hoy = startOfTodayIso();
  const map = {};

  rows.forEach((row) => {
    if (!row.flujo_id) return;
    if (!map[row.flujo_id]) {
      map[row.flujo_id] = {
        clientesEnFlujo: new Set(),
        leadsHoy: new Set(),
        seguimientosActivos: 0,
        mensajesEnviados: 0,
        respuestas: 0,
        ultimaEjecucion: null,
      };
    }
    const m = map[row.flujo_id];
    if (row.cliente_numero) m.clientesEnFlujo.add(row.cliente_numero);
    if (row.creado_en && row.creado_en >= hoy && row.cliente_numero) {
      m.leadsHoy.add(row.cliente_numero);
    }
    if (row.estado === "pendiente") m.seguimientosActivos += 1;
    if (row.estado === "enviado") m.mensajesEnviados += 1;
    if (row.estado === "respondido") m.respuestas += 1;
    const execAt = row.enviado_en || row.actualizado_en;
    if (execAt && (!m.ultimaEjecucion || execAt > m.ultimaEjecucion)) {
      m.ultimaEjecucion = execAt;
    }
  });

  const out = {};
  Object.keys(map).forEach((fid) => {
    const m = map[fid];
    out[fid] = {
      clientesEnFlujo: m.clientesEnFlujo.size,
      leadsHoy: m.leadsHoy.size,
      seguimientosActivos: m.seguimientosActivos,
      mensajesEnviados: m.mensajesEnviados,
      respuestas: m.respuestas,
      conversiones: 0,
      ultimaEjecucion: m.ultimaEjecucion,
      ventasPendiente: true,
      mensajesFlujoPendiente: false,
    };
  });
  return out;
}

async function computeGlobalStats(usuarioId, flujos, activadores) {
  const uid = encodeURIComponent(usuarioId);
  const hoy = startOfTodayIso();

  const porEstado = { activo: 0, pausado: 0, borrador: 0, error: 0 };
  flujos.forEach((f) => {
    const est = resolveEstado(f.data);
    porEstado[est] = (porEstado[est] || 0) + 1;
  });

  const [
    leadsVivos,
    conversaciones,
    mensajesEnviados,
    respuestas,
    mensajesHoy,
    clientesHoyDb,
    seguimientosRows,
    etiquetasVenta,
  ] = await Promise.all([
    supabaseCount("clientes", `usuario_id=eq.${uid}&estado=neq.bloqueado`),
    supabaseCount("conversaciones", `usuario_id=eq.${uid}`),
    supabaseCount("mensajes", `usuario_id=eq.${uid}&direccion=eq.saliente`),
    supabaseCount("mensajes", `usuario_id=eq.${uid}&direccion=eq.entrante`),
    supabaseSelect(
      "mensajes",
      `usuario_id=eq.${uid}&creado_en=gte.${hoy}&select=direccion,cliente_numero`,
      "direccion,cliente_numero"
    ),
    supabaseCount("clientes", `usuario_id=eq.${uid}&creado_en=gte.${hoy}`),
    fetchSeguimientosRows(usuarioId),
    supabaseSelect(
      "clientes_etiquetas",
      `usuario_id=eq.${uid}&select=cliente_numero,etiqueta`,
      "cliente_numero,etiqueta"
    ),
  ]);

  let clientesPotencialesHoy = clientesHoyDb ?? 0;
  let mensajesEnviadosHoy = 0;

  if (Array.isArray(mensajesHoy)) {
    const entrantes = new Set();
    mensajesHoy.forEach((m) => {
      if (m.direccion === "saliente") mensajesEnviadosHoy += 1;
      if (m.direccion === "entrante" && m.cliente_numero) entrantes.add(m.cliente_numero);
    });
    if (!clientesPotencialesHoy && entrantes.size) {
      clientesPotencialesHoy = entrantes.size;
    }
  }

  let ventas = 0;
  let ventasConectadas = false;
  if (Array.isArray(etiquetasVenta)) {
    ventasConectadas = true;
    const unicos = new Set();
    etiquetasVenta.forEach((row) => {
      if (ETIQUETAS_VENTA.some((t) => String(row.etiqueta || "").toLowerCase() === t.toLowerCase())) {
        unicos.add(row.cliente_numero);
      }
    });
    ventas = unicos.size;
  }

  const segMap = {};
  (seguimientosRows || []).forEach((row) => {
    if (row.estado === "pendiente") {
      segMap._total = (segMap._total || 0) + 1;
    }
  });
  const seguimientosActivos = segMap._total || 0;

  const enviados = mensajesEnviados ?? 0;
  const resp = respuestas ?? 0;
  const conversionEstimada =
    enviados > 0 && resp > 0 ? Math.round((resp / enviados) * 1000) / 10 : 0;

  return {
    total: flujos.length,
    activos: porEstado.activo,
    pausados: porEstado.pausado,
    borradores: porEstado.borrador,
    errores: porEstado.error,
    leadsVivos: leadsVivos ?? 0,
    conversaciones: conversaciones ?? 0,
    ventas,
    ventasConectadas,
    clientesPotencialesHoy,
    mensajesEnviados: enviados,
    mensajesEnviadosHoy,
    respuestas: resp,
    seguimientosActivos,
    conversionEstimada,
    activadoresTotal: activadores.length,
    activadoresActivos: activadores.filter((a) => a.activo).length,
  };
}

function metricasVacias() {
  return {
    clientesEnFlujo: 0,
    leadsHoy: 0,
    mensajesEnviados: 0,
    respuestas: 0,
    conversiones: 0,
    seguimientosActivos: 0,
    ultimaEjecucion: null,
    ventasPendiente: true,
    mensajesFlujoPendiente: true,
  };
}

module.exports = {
  startOfTodayIso,
  resolveEstado,
  aggregateSeguimientosPorFlujo,
  fetchSeguimientosRows,
  computeGlobalStats,
  metricasVacias,
};
