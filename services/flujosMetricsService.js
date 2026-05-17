/**
 * Métricas reales para pantalla Flujos — solo Supabase, sin mocks.
 */
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const ETIQUETAS_VENTA = ["pagó", "compró", "pago", "pago confirmado", "compro"];

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

function esEtiquetaVenta(etiqueta) {
  const e = String(etiqueta || "").trim().toLowerCase();
  return ETIQUETAS_VENTA.some((t) => e === t || e.includes("pag") || e.includes("compr"));
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

function metricasVacias() {
  return {
    clientesEnFlujo: 0,
    leadsHoy: 0,
    seguimientosEnviados: 0,
    seguimientosRespondidos: 0,
    seguimientosActivos: 0,
    seguimientosProgramados: 0,
    mensajesWhatsapp: 0,
    respuestasWhatsapp: 0,
    ventas: 0,
    ventasSinRelacion: true,
    ultimaEjecucion: null,
  };
}

/**
 * Métricas por flujo: seguimientos + mensajes WA de clientes del flujo + ventas por etiqueta.
 */
function computePerFlowMetrics(flowIds, segRows, etiquetasRows, mensajesRows) {
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
    m.seguimientosProgramados += 1;

    if (row.cliente_numero) {
      clientesPorFlujo[row.flujo_id].add(row.cliente_numero);
    }
    if (row.creado_en && row.creado_en >= hoy && row.cliente_numero) {
      if (!m._leadsHoySet) m._leadsHoySet = new Set();
      m._leadsHoySet.add(row.cliente_numero);
    }
    if (row.estado === "pendiente") m.seguimientosActivos += 1;
    if (row.estado === "enviado") m.seguimientosEnviados += 1;
    if (row.estado === "respondido") m.seguimientosRespondidos += 1;

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

  const clientesConVenta = new Set();
  if (Array.isArray(etiquetasRows)) {
    etiquetasRows.forEach((row) => {
      if (row.cliente_numero && esEtiquetaVenta(row.etiqueta)) {
        clientesConVenta.add(row.cliente_numero);
      }
    });
  }

  flowIds.forEach((fid) => {
    const m = byFlow[fid];
    const clientes = clientesPorFlujo[fid];
    let ventas = 0;
    clientes.forEach((num) => {
      if (clientesConVenta.has(num)) ventas += 1;
    });
    m.ventas = ventas;
    m.ventasSinRelacion = false;

    if (Array.isArray(mensajesRows)) {
      mensajesRows.forEach((msg) => {
        if (!msg.cliente_numero || !clientes.has(msg.cliente_numero)) return;
        if (msg.direccion === "saliente") m.mensajesWhatsapp += 1;
        if (msg.direccion === "entrante") m.respuestasWhatsapp += 1;
      });
    }
  });

  return byFlow;
}

async function fetchMensajesParaClientes(usuarioId, segRows) {
  const uid = encodeURIComponent(usuarioId);
  const numeros = [...new Set(segRows.map((r) => r.cliente_numero).filter(Boolean))];
  if (!numeros.length) return [];

  const chunks = [];
  for (let i = 0; i < numeros.length; i += 80) {
    chunks.push(numeros.slice(i, i + 80));
  }

  const all = [];
  for (const chunk of chunks) {
    const inList = chunk.map((n) => encodeURIComponent(n)).join(",");
    const rows = await supabaseSelect(
      "mensajes",
      `usuario_id=eq.${uid}&cliente_numero=in.(${inList})`,
      "cliente_numero,direccion"
    );
    if (Array.isArray(rows)) all.push(...rows);
  }
  return all;
}

async function computeGlobalStats(usuarioId, flujos, activadores) {
  const uid = encodeURIComponent(usuarioId);
  const hoy = encodeURIComponent(startOfTodayIso());

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
    mensajesHoyRows,
    clientesHoyDb,
    etiquetasVenta,
    seguimientosRows,
  ] = await Promise.all([
    supabaseCount("clientes", `usuario_id=eq.${uid}&estado=neq.bloqueado`),
    supabaseCount("conversaciones", `usuario_id=eq.${uid}`),
    supabaseCount("mensajes", `usuario_id=eq.${uid}&direccion=eq.saliente`),
    supabaseCount("mensajes", `usuario_id=eq.${uid}&direccion=eq.entrante`),
    supabaseSelect("mensajes", `usuario_id=eq.${uid}&creado_en=gte.${hoy}`, "direccion,cliente_numero"),
    supabaseCount("clientes", `usuario_id=eq.${uid}&creado_en=gte.${hoy}`),
    supabaseSelect("clientes_etiquetas", `usuario_id=eq.${uid}`, "cliente_numero,etiqueta"),
    fetchSeguimientosRows(usuarioId),
  ]);

  let clientesPotencialesHoy = clientesHoyDb ?? 0;
  if (Array.isArray(mensajesHoyRows)) {
    const entrantesHoy = new Set();
    mensajesHoyRows.forEach((m) => {
      if (m.direccion === "entrante" && m.cliente_numero) entrantesHoy.add(m.cliente_numero);
    });
    if (!clientesPotencialesHoy && entrantesHoy.size) {
      clientesPotencialesHoy = entrantesHoy.size;
    }
  }

  let ventas = 0;
  let ventasConectadas = false;
  if (Array.isArray(etiquetasVenta)) {
    ventasConectadas = true;
    const unicos = new Set();
    etiquetasVenta.forEach((row) => {
      if (row.cliente_numero && esEtiquetaVenta(row.etiqueta)) {
        unicos.add(row.cliente_numero);
      }
    });
    ventas = unicos.size;
  }

  let seguimientosActivos = 0;
  (seguimientosRows || []).forEach((row) => {
    if (row.estado === "pendiente") seguimientosActivos += 1;
  });

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
    respuestas: resp,
    seguimientosActivos,
    conversionEstimada,
    activadoresTotal: activadores.length,
    activadoresActivos: activadores.filter((a) => a.activo).length,
  };
}

/** Carga datos compartidos para lista + stats en una sola pasada. */
async function loadFlujosDashboardData(usuarioId, flujos, activadores) {
  const flowIds = flujos.map((f) => f.id);
  const [segRows, etiquetasRows] = await Promise.all([
    fetchSeguimientosRows(usuarioId),
    supabaseSelect(
      "clientes_etiquetas",
      `usuario_id=eq.${encodeURIComponent(usuarioId)}`,
      "cliente_numero,etiqueta"
    ),
  ]);

  const mensajesRows = await fetchMensajesParaClientes(usuarioId, segRows || []);
  const perFlow = computePerFlowMetrics(
    flowIds,
    segRows || [],
    etiquetasRows || [],
    mensajesRows
  );
  const stats = await computeGlobalStats(usuarioId, flujos, activadores);

  return { segRows: segRows || [], perFlow, stats, mensajesRows };
}

module.exports = {
  startOfTodayIso,
  resolveEstado,
  fetchSeguimientosRows,
  fetchMensajesParaClientes,
  computePerFlowMetrics,
  computeGlobalStats,
  loadFlujosDashboardData,
  metricasVacias,
  esEtiquetaVenta,
};
