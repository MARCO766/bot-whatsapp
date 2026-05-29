/**
 * Métricas reales para pantalla Flujos — solo Supabase, sin mocks.
 */
const axios = require("axios");
const { isSchemaMissingError, logSchemaFallback } = require("./supabaseSafe");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

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
    if (table === "crm_conversiones" && isSchemaMissingError(e)) {
      logSchemaFallback(table, e);
      return 0;
    }
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
    if (table === "crm_conversiones" && isSchemaMissingError(e)) {
      logSchemaFallback(table, e);
      return [];
    }
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

async function countConversacionesReales(usuarioId, conexionWhatsappId = null) {
  const uid = encodeURIComponent(usuarioId);
  const connF = buildConexionFilter(conexionWhatsappId);
  const desdeTabla = await supabaseCount("conversaciones", `usuario_id=eq.${uid}${connF}`);
  if (desdeTabla !== null) return desdeTabla;

  const rows = await supabaseSelect("mensajes", `usuario_id=eq.${uid}${connF}`, "cliente_numero");
  if (!Array.isArray(rows)) return 0;
  return new Set(rows.map((r) => r.cliente_numero).filter(Boolean)).size;
}

async function countConversacionesEnRango(usuarioId, desdeIso, hastaIso, conexionWhatsappId = null) {
  const uid = encodeURIComponent(usuarioId);
  const desde = encodeURIComponent(desdeIso);
  const hasta = encodeURIComponent(hastaIso);
  const connF = buildConexionFilter(conexionWhatsappId);

  const desdeTabla = await supabaseCount(
    "conversaciones",
    `usuario_id=eq.${uid}${connF}&creado_en=gte.${desde}&creado_en=lt.${hasta}`
  );
  if (desdeTabla !== null) return desdeTabla;

  const rows = await supabaseSelect(
    "mensajes",
    `usuario_id=eq.${uid}${connF}&creado_en=gte.${desde}&creado_en=lt.${hasta}`,
    "cliente_numero"
  );
  if (!Array.isArray(rows)) return 0;
  return new Set(rows.map((r) => r.cliente_numero).filter(Boolean)).size;
}

/** Números con actividad en una línea (conversaciones → fallback mensajes). */
async function fetchNumerosEnLinea(usuarioId, conexionWhatsappId) {
  const uid = encodeURIComponent(usuarioId);
  const connF = buildConexionFilter(conexionWhatsappId);
  if (!connF) return null;

  const rows = await supabaseSelect(
    "conversaciones",
    `usuario_id=eq.${uid}${connF}`,
    "cliente_numero"
  );
  if (Array.isArray(rows) && rows.length) {
    return [...new Set(rows.map((r) => r.cliente_numero).filter(Boolean))];
  }

  const msgRows = await supabaseSelect(
    "mensajes",
    `usuario_id=eq.${uid}${connF}`,
    "cliente_numero"
  );
  if (!Array.isArray(msgRows)) return [];
  return [...new Set(msgRows.map((r) => r.cliente_numero).filter(Boolean))];
}

async function countClientesActivosPorNumeros(usuarioId, numeros) {
  if (!numeros?.length) return 0;
  const uid = encodeURIComponent(usuarioId);
  let total = 0;
  for (let i = 0; i < numeros.length; i += 80) {
    const chunk = numeros.slice(i, i + 80);
    const inList = chunk.map((n) => encodeURIComponent(n)).join(",");
    const n = await supabaseCount(
      "clientes",
      `usuario_id=eq.${uid}&estado=neq.bloqueado&numero=in.(${inList})`
    );
    if (n === null) return null;
    total += n;
  }
  return total;
}

/**
 * Leads vivos header: global = clientes no bloqueados.
 * Por línea (sin clientes.conexion_whatsapp_id): clientes activos con conversación/mensaje en esa línea.
 */
async function countLeadsVivos(usuarioId, conexionWhatsappId = null) {
  const uid = encodeURIComponent(usuarioId);
  const connF = buildConexionFilter(conexionWhatsappId);
  if (!connF) {
    return supabaseCount("clientes", `usuario_id=eq.${uid}&estado=neq.bloqueado`);
  }
  const numeros = await fetchNumerosEnLinea(usuarioId, conexionWhatsappId);
  const n = await countClientesActivosPorNumeros(usuarioId, numeros);
  return n ?? 0;
}

/**
 * Tendencia leads header: global = altas en clientes por creado_en.
 * Por línea: conversaciones (o mensajes) nuevas en el rango con conexion_whatsapp_id.
 */
async function countLeadsNuevosEnRango(usuarioId, desdeIso, hastaIso, conexionWhatsappId = null) {
  const uid = encodeURIComponent(usuarioId);
  const connF = buildConexionFilter(conexionWhatsappId);
  const desde = encodeURIComponent(desdeIso);
  const hasta = encodeURIComponent(hastaIso);
  if (!connF) {
    return supabaseCount(
      "clientes",
      `usuario_id=eq.${uid}&creado_en=gte.${desde}&creado_en=lt.${hasta}`
    );
  }
  return countConversacionesEnRango(usuarioId, desdeIso, hastaIso, conexionWhatsappId);
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

async function fetchSeguimientosRows(usuarioId, conexionWhatsappId = null) {
  const uid = encodeURIComponent(usuarioId);
  const connF = buildConexionFilter(conexionWhatsappId);
  return (
    (await supabaseSelect(
      "seguimientos_programados",
      `usuario_id=eq.${uid}${connF}`,
      "flujo_id,estado,cliente_numero,creado_en,actualizado_en,enviado_en,respondido_en"
    )) || []
  );
}

async function fetchConversionesRows(usuarioId, conexionWhatsappId = null) {
  const uid = encodeURIComponent(usuarioId);
  const connF = buildConexionFilter(conexionWhatsappId);
  const rows = await supabaseSelect(
    "crm_conversiones",
    `usuario_id=eq.${uid}${connF}&order=creado_en.desc`,
    "flujo_id,valor,moneda,cliente_numero,creado_en,origen"
  );
  if (rows === null) return [];
  return rows;
}

async function fetchMensajesParaClientes(usuarioId, segRows, conexionWhatsappId = null) {
  const uid = encodeURIComponent(usuarioId);
  const connF = buildConexionFilter(conexionWhatsappId);
  const numeros = [...new Set(segRows.map((r) => r.cliente_numero).filter(Boolean))];
  if (!numeros.length) return [];

  const all = [];
  for (let i = 0; i < numeros.length; i += 80) {
    const chunk = numeros.slice(i, i + 80);
    const inList = chunk.map((n) => encodeURIComponent(n)).join(",");
    const rows = await supabaseSelect(
      "mensajes",
      `usuario_id=eq.${uid}${connF}&cliente_numero=in.(${inList})&order=creado_en.desc`,
      "cliente_numero,direccion,creado_en"
    );
    if (Array.isArray(rows)) all.push(...rows);
  }
  return all;
}

function metricasVacias() {
  return {
    clientesEnFlujo: 0,
    conversaciones: 0,
    leadsHoy: 0,
    respuestas: 0,
    conversiones: 0,
    ventas: 0,
    ingresos: 0,
    ingresosMoneda: "BOB",
    seguimientosActivos: 0,
    seguimientosPendientes: 0,
    seguimientosEnviados: 0,
    tasaCierre: 0,
    ultimaActividad: null,
    ultimaConversion: null,
    ultimoLead: null,
    ultimaEjecucion: null,
  };
}

function pctTasaCierre(ventas, conversaciones) {
  const v = Number(ventas) || 0;
  const c = Number(conversaciones) || 0;
  if (c <= 0) return 0;
  return Math.round((v / c) * 1000) / 10;
}

function resolverIngresosFlujo(totalesPorMoneda) {
  const totales = totalesPorMoneda && typeof totalesPorMoneda === "object" ? totalesPorMoneda : {};
  const monedas = Object.keys(totales);
  if (!monedas.length) return { ingresos: 0, ingresosMoneda: "BOB" };
  const ingresosMoneda = monedas.reduce(
    (best, mon) => ((totales[mon] || 0) > (totales[best] || 0) ? mon : best),
    monedas[0]
  );
  const ingresos = Math.round(
    Object.values(totales).reduce((acc, val) => acc + (Number(val) || 0), 0) * 100
  ) / 100;
  return { ingresos, ingresosMoneda };
}

function agregarMetricasConversiones(byFlow, conversionesRows) {
  if (!Array.isArray(conversionesRows)) return;
  conversionesRows.forEach((row) => {
    if (!row.flujo_id || !byFlow[row.flujo_id]) return;
    const m = byFlow[row.flujo_id];
    m.conversiones += 1;
    m.ventas += 1;

    const mon = String(row.moneda || "BOB").toUpperCase();
    const v = parseFloat(row.valor);
    if (Number.isFinite(v) && v > 0) {
      if (!m._ingresosPorMoneda) m._ingresosPorMoneda = {};
      m._ingresosPorMoneda[mon] = (m._ingresosPorMoneda[mon] || 0) + v;
    }

    if (row.creado_en && (!m.ultimaConversion || row.creado_en > m.ultimaConversion)) {
      m.ultimaConversion = row.creado_en;
    }
  });
}

/**
 * Métricas por card de flujo (KPIs premium + actividad reciente).
 * Conversaciones = proxy: clientes únicos del flujo con mensajes (sin query extra).
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
    if (row.estado === "enviado") m.seguimientosEnviados += 1;
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

        if (!m._conversacionesSet) m._conversacionesSet = new Set();
        m._conversacionesSet.add(msg.cliente_numero);

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
    m.conversaciones = m._conversacionesSet ? m._conversacionesSet.size : 0;
    m.leadsHoy = m._hoySet ? m._hoySet.size : 0;
    m.respuestas = m._respuestasSet ? m._respuestasSet.size : 0;
    m.seguimientosPendientes = m.seguimientosActivos;
    delete m._hoySet;
    delete m._respuestasSet;
    delete m._conversacionesSet;
    delete m._ultimoLeadAt;
  });

  agregarMetricasConversiones(byFlow, conversionesRows);

  flowIds.forEach((fid) => {
    const m = byFlow[fid];
    const { ingresos, ingresosMoneda } = resolverIngresosFlujo(m._ingresosPorMoneda);
    m.ingresos = ingresos;
    m.ingresosMoneda = ingresosMoneda;
    m.tasaCierre = pctTasaCierre(m.ventas, m.conversaciones);
    delete m._ingresosPorMoneda;
  });

  return byFlow;
}

async function computeHeaderStats(usuarioId, flujos = [], conexionWhatsappId = null) {
  logMetricasMulti(conexionWhatsappId, "computeHeaderStats");
  const uid = encodeURIComponent(usuarioId);
  const connF = buildConexionFilter(conexionWhatsappId);
  const hoy = startOfTodayIso();
  const ayer = startOfYesterdayIso();

  const [
    leadsVivos,
    conversaciones,
    clientesHoy,
    clientesAyer,
    conversacionesHoy,
    conversacionesAyer,
    conversionesCount,
    conversionesCountHoy,
    conversionesCountAyer,
    conversionesRows,
  ] = await Promise.all([
    countLeadsVivos(usuarioId, conexionWhatsappId),
    countConversacionesReales(usuarioId, conexionWhatsappId),
    countLeadsNuevosEnRango(usuarioId, hoy, new Date().toISOString(), conexionWhatsappId),
    countLeadsNuevosEnRango(usuarioId, ayer, hoy, conexionWhatsappId),
    countConversacionesEnRango(usuarioId, hoy, new Date().toISOString(), conexionWhatsappId),
    countConversacionesEnRango(usuarioId, ayer, hoy, conexionWhatsappId),
    supabaseCount("crm_conversiones", `usuario_id=eq.${uid}${connF}`),
    supabaseCount(
      "crm_conversiones",
      `usuario_id=eq.${uid}${connF}&creado_en=gte.${encodeURIComponent(hoy)}`
    ),
    supabaseCount(
      "crm_conversiones",
      `usuario_id=eq.${uid}${connF}&creado_en=gte.${encodeURIComponent(ayer)}&creado_en=lt.${encodeURIComponent(hoy)}`
    ),
    fetchConversionesRows(usuarioId, conexionWhatsappId),
  ]);

  let ventasMonto = 0;
  if (Array.isArray(conversionesRows) && conversionesRows.length) {
    const totales = sumarVentasPorMoneda(conversionesRows);
    ventasMonto = Math.round(
      Object.values(totales).reduce((acc, v) => acc + v, 0) * 100
    ) / 100;
  }

  let ventasCantidad = conversionesCount ?? 0;
  if (conversionesCount === null && Array.isArray(conversionesRows)) {
    ventasCantidad = conversionesRows.length;
  }

  return {
    leadsVivos: leadsVivos ?? 0,
    conversaciones: conversaciones ?? 0,
    ventasCantidad,
    ventasMonto,
    flujosActivos: countFlujosActivos(flujos),
    tendenciaLeads: calcTendencia(clientesHoy ?? 0, clientesAyer ?? 0),
    tendenciaConversaciones: calcTendencia(conversacionesHoy ?? 0, conversacionesAyer ?? 0),
    tendenciaVentas: calcTendencia(conversionesCountHoy ?? 0, conversionesCountAyer ?? 0),
  };
}

async function loadFlujosDashboardData(usuarioId, flujos, activadores, conexionWhatsappId = null) {
  logMetricasMulti(conexionWhatsappId, "loadFlujosDashboardData");
  const flowIds = flujos.map((f) => f.id);
  const [segRows, conversionesRows] = await Promise.all([
    fetchSeguimientosRows(usuarioId, conexionWhatsappId),
    fetchConversionesRows(usuarioId, conexionWhatsappId),
  ]);

  const mensajesRows = await fetchMensajesParaClientes(usuarioId, segRows || [], conexionWhatsappId);
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
  sumarVentasPorMoneda,
};
