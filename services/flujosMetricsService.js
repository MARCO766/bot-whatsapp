/**
 * Métricas reales para pantalla Flujos — solo Supabase, sin mocks.
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

function startOfYesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function calcTendencia(hoy, ayer) {
  const a = Number(hoy) || 0;
  const b = Number(ayer) || 0;
  if (a === 0 && b === 0) return null;
  if (b === 0) return a > 0 ? 100 : null;
  return Math.round(((a - b) / b) * 1000) / 10;
}

function sumarVentasPorMoneda(rows) {
  const totales = {};
  (rows || []).forEach((row) => {
    const mon = String(row.moneda || "BOB").toUpperCase();
    const v = parseFloat(row.valor);
    if (!Number.isFinite(v)) return;
    totales[mon] = (totales[mon] || 0) + v;
  });
  return totales;
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

function countFlujosActivos(flujos) {
  let n = 0;
  (flujos || []).forEach((f) => {
    if (resolveEstado(f.data) === "activo") n += 1;
  });
  return n;
}

async function countConversacionesReales(usuarioId) {
  const uid = encodeURIComponent(usuarioId);
  const desdeTabla = await supabaseCount("conversaciones", `usuario_id=eq.${uid}`);
  if (desdeTabla !== null) return desdeTabla;

  const rows = await supabaseSelect("mensajes", `usuario_id=eq.${uid}`, "cliente_numero");
  if (!Array.isArray(rows)) return 0;
  return new Set(rows.map((r) => r.cliente_numero).filter(Boolean)).size;
}

async function countConversacionesEnRango(usuarioId, desdeIso, hastaIso) {
  const uid = encodeURIComponent(usuarioId);
  const desde = encodeURIComponent(desdeIso);
  const hasta = encodeURIComponent(hastaIso);

  const desdeTabla = await supabaseCount(
    "conversaciones",
    `usuario_id=eq.${uid}&creado_en=gte.${desde}&creado_en=lt.${hasta}`
  );
  if (desdeTabla !== null) return desdeTabla;

  const rows = await supabaseSelect(
    "mensajes",
    `usuario_id=eq.${uid}&creado_en=gte.${desde}&creado_en=lt.${hasta}`,
    "cliente_numero"
  );
  if (!Array.isArray(rows)) return 0;
  return new Set(rows.map((r) => r.cliente_numero).filter(Boolean)).size;
}

async function sumarVentasEnRango(usuarioId, desdeIso, hastaIso) {
  const uid = encodeURIComponent(usuarioId);
  const desde = encodeURIComponent(desdeIso);
  const hasta = encodeURIComponent(hastaIso);
  const rows = await supabaseSelect(
    "crm_conversiones",
    `usuario_id=eq.${uid}&creado_en=gte.${desde}&creado_en=lt.${hasta}`,
    "valor,moneda"
  );
  if (!Array.isArray(rows)) return 0;
  const totales = sumarVentasPorMoneda(rows);
  const monedas = Object.keys(totales);
  if (!monedas.length) return 0;
  return totales[monedas[0]];
}

async function fetchSeguimientosRows(usuarioId) {
  const uid = encodeURIComponent(usuarioId);
  return (
    (await supabaseSelect(
      "seguimientos_programados",
      `usuario_id=eq.${uid}`,
      "flujo_id,estado,cliente_numero,creado_en,actualizado_en,enviado_en,respondido_en"
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

async function fetchMensajesParaClientes(usuarioId, segRows) {
  const uid = encodeURIComponent(usuarioId);
  const numeros = [...new Set(segRows.map((r) => r.cliente_numero).filter(Boolean))];
  if (!numeros.length) return [];

  const all = [];
  for (let i = 0; i < numeros.length; i += 80) {
    const chunk = numeros.slice(i, i + 80);
    const inList = chunk.map((n) => encodeURIComponent(n)).join(",");
    const rows = await supabaseSelect(
      "mensajes",
      `usuario_id=eq.${uid}&cliente_numero=in.(${inList})&order=creado_en.desc`,
      "cliente_numero,direccion,creado_en"
    );
    if (Array.isArray(rows)) all.push(...rows);
  }
  return all;
}

function metricasVacias() {
  return {
    clientesEnFlujo: 0,
    leadsHoy: 0,
    respuestas: 0,
    conversiones: 0,
    seguimientosActivos: 0,
    ultimaActividad: null,
    ultimoLead: null,
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

/**
 * Métricas por card de flujo (5 KPIs + actividad reciente).
 */
function computePerFlowMetrics(flowIds, segRows, conversionesRows, mensajesRows) {
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
    const fid = row.flujo_id;

    if (row.cliente_numero) {
      clientesPorFlujo[fid].add(row.cliente_numero);
    }
    if (row.estado === "pendiente") m.seguimientosActivos += 1;
    if (row.estado === "respondido") {
      if (!m._respuestasSet) m._respuestasSet = new Set();
      if (row.cliente_numero) m._respuestasSet.add(row.cliente_numero);
    }

    const actAt = row.creado_en;
    if (actAt && row.cliente_numero && actAt >= hoy) {
      if (!m._hoySet) m._hoySet = new Set();
      m._hoySet.add(row.cliente_numero);
    }

    const execAt = row.enviado_en || row.respondido_en || row.actualizado_en;
    if (execAt && (!m.ultimaEjecucion || execAt > m.ultimaEjecucion)) {
      m.ultimaEjecucion = execAt;
    }
    if (execAt && (!m.ultimaActividad || execAt > m.ultimaActividad)) {
      m.ultimaActividad = execAt;
    }
  });

  if (Array.isArray(mensajesRows)) {
    mensajesRows.forEach((msg) => {
      if (!msg.cliente_numero || !msg.creado_en) return;

      flowIds.forEach((fid) => {
        if (!clientesPorFlujo[fid].has(msg.cliente_numero)) return;
        const m = byFlow[fid];

        if (msg.creado_en >= hoy) {
          if (!m._hoySet) m._hoySet = new Set();
          m._hoySet.add(msg.cliente_numero);
        }

        if (msg.direccion === "entrante") {
          if (!m._respuestasSet) m._respuestasSet = new Set();
          m._respuestasSet.add(msg.cliente_numero);

          if (!m._ultimoLeadAt || msg.creado_en > m._ultimoLeadAt) {
            m._ultimoLeadAt = msg.creado_en;
            m.ultimoLead = msg.cliente_numero;
          }
        }

        if (!m.ultimaActividad || msg.creado_en > m.ultimaActividad) {
          m.ultimaActividad = msg.creado_en;
        }
      });
    });
  }

  flowIds.forEach((fid) => {
    const m = byFlow[fid];
    m.clientesEnFlujo = clientesPorFlujo[fid].size;
    m.leadsHoy = m._hoySet ? m._hoySet.size : 0;
    m.respuestas = m._respuestasSet ? m._respuestasSet.size : 0;
    delete m._hoySet;
    delete m._respuestasSet;
    delete m._ultimoLeadAt;
  });

  agregarMetricasConversiones(byFlow, conversionesRows);
  return byFlow;
}

async function computeHeaderStats(usuarioId, flujos = []) {
  const uid = encodeURIComponent(usuarioId);
  const hoy = startOfTodayIso();
  const ayer = startOfYesterdayIso();

  const [
    leadsVivos,
    conversaciones,
    clientesHoy,
    clientesAyer,
    conversacionesHoy,
    conversacionesAyer,
    conversionesRows,
    ventasHoy,
    ventasAyer,
  ] = await Promise.all([
    supabaseCount("clientes", `usuario_id=eq.${uid}&estado=neq.bloqueado`),
    countConversacionesReales(usuarioId),
    supabaseCount("clientes", `usuario_id=eq.${uid}&creado_en=gte.${encodeURIComponent(hoy)}`),
    supabaseCount(
      "clientes",
      `usuario_id=eq.${uid}&creado_en=gte.${encodeURIComponent(ayer)}&creado_en=lt.${encodeURIComponent(hoy)}`
    ),
    countConversacionesEnRango(usuarioId, hoy, new Date().toISOString()),
    countConversacionesEnRango(usuarioId, ayer, hoy),
    fetchConversionesRows(usuarioId),
    sumarVentasEnRango(usuarioId, hoy, new Date().toISOString()),
    sumarVentasEnRango(usuarioId, ayer, hoy),
  ]);

  let ventasTotal = 0;
  let moneda = "BOB";
  if (Array.isArray(conversionesRows) && conversionesRows.length) {
    const totales = sumarVentasPorMoneda(conversionesRows);
    const entries = Object.entries(totales).sort((a, b) => b[1] - a[1]);
    if (entries.length) {
      moneda = entries[0][0];
      ventasTotal = Math.round(entries[0][1] * 100) / 100;
    }
  }

  return {
    leadsVivos: leadsVivos ?? 0,
    conversaciones: conversaciones ?? 0,
    ventasTotal,
    moneda,
    flujosActivos: countFlujosActivos(flujos),
    tendenciaLeads: calcTendencia(clientesHoy ?? 0, clientesAyer ?? 0),
    tendenciaConversaciones: calcTendencia(conversacionesHoy ?? 0, conversacionesAyer ?? 0),
    tendenciaVentas: calcTendencia(ventasHoy ?? 0, ventasAyer ?? 0),
  };
}

async function loadFlujosDashboardData(usuarioId, flujos, activadores) {
  const flowIds = flujos.map((f) => f.id);
  const [segRows, conversionesRows] = await Promise.all([
    fetchSeguimientosRows(usuarioId),
    fetchConversionesRows(usuarioId),
  ]);

  const mensajesRows = await fetchMensajesParaClientes(usuarioId, segRows || []);
  const perFlow = computePerFlowMetrics(
    flowIds,
    segRows || [],
    conversionesRows === null ? [] : conversionesRows,
    mensajesRows
  );

  return {
    segRows: segRows || [],
    conversionesRows: conversionesRows || [],
    perFlow,
    mensajesRows,
  };
}

module.exports = {
  startOfTodayIso,
  startOfYesterdayIso,
  resolveEstado,
  fetchSeguimientosRows,
  fetchConversionesRows,
  fetchMensajesParaClientes,
  computePerFlowMetrics,
  computeHeaderStats,
  loadFlujosDashboardData,
  metricasVacias,
  calcTendencia,
};
