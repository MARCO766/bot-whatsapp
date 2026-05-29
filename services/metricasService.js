/**
 * Métricas CRM reales — solo Supabase, sin mocks.
 */
const axios = require("axios");
const { calcTendencia, sumarVentasPorMoneda } = require("./flujosMetricsService");
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

function parseRango(query = {}) {
  const now = new Date();
  const hasta = query.hasta ? new Date(query.hasta).toISOString() : now.toISOString();

  if (query.desde) {
    return {
      desde: new Date(query.desde).toISOString(),
      hasta,
      periodo: query.periodo || "custom",
    };
  }

  const periodo = String(query.periodo || "7d").toLowerCase();
  const d = new Date();
  d.setHours(0, 0, 0, 0);

  if (periodo === "hoy" || periodo === "today") {
    return { desde: d.toISOString(), hasta, periodo: "hoy" };
  }
  if (periodo === "30d" || periodo === "30") {
    d.setDate(d.getDate() - 29);
    return { desde: d.toISOString(), hasta, periodo: "30d" };
  }
  if (periodo === "7d" || periodo === "7") {
    d.setDate(d.getDate() - 6);
    return { desde: d.toISOString(), hasta, periodo: "7d" };
  }

  d.setDate(d.getDate() - 6);
  return { desde: d.toISOString(), hasta, periodo: "7d" };
}

function rangoAnterior(desdeIso, hastaIso) {
  const desde = new Date(desdeIso);
  const hasta = new Date(hastaIso);
  const ms = hasta.getTime() - desde.getTime();
  return {
    desde: new Date(desde.getTime() - ms).toISOString(),
    hasta: desdeIso,
  };
}

function dateKey(iso) {
  if (!iso) return null;
  return String(iso).slice(0, 10);
}

function hourKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours();
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
    console.log(`[metricas] count ${table}:`, e.response?.data || e.message);
    return null;
  }
}

async function supabaseSelect(table, filterQuery, selectFields = "*", limit = 50000) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(selectFields)}&${filterQuery}&limit=${limit}`;
  try {
    const res = await axios.get(url, { headers: headers() });
    return res.data || [];
  } catch (e) {
    if (table === "crm_conversiones" && isSchemaMissingError(e)) {
      logSchemaFallback(table, e);
      return [];
    }
    console.log(`[metricas] select ${table}:`, e.response?.data || e.message);
    return null;
  }
}

function buildDateFilter(desdeIso, hastaIso, field = "creado_en") {
  const desde = encodeURIComponent(desdeIso);
  const hasta = encodeURIComponent(hastaIso);
  return `${field}=gte.${desde}&${field}=lte.${hasta}`;
}

function buildUsuarioFilter(usuarioId) {
  return `usuario_id=eq.${encodeURIComponent(usuarioId)}`;
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

async function fetchFlujosList(usuarioId) {
  const rows = await supabaseSelect(
    "flujos_builder",
    `${buildUsuarioFilter(usuarioId)}&order=nombre.asc`,
    "id,nombre,creado_en,data"
  );
  return Array.isArray(rows) ? rows : [];
}

async function fetchClientesEnRango(usuarioId, desdeIso, hastaIso, flujoId) {
  let filter = `${buildUsuarioFilter(usuarioId)}&${buildDateFilter(desdeIso, hastaIso)}&estado=neq.bloqueado`;
  const rows = await supabaseSelect("clientes", filter, "id,numero,creado_en");
  if (!Array.isArray(rows)) return [];

  if (!flujoId) return rows;

  const segRows = await supabaseSelect(
    "seguimientos_programados",
    `${buildUsuarioFilter(usuarioId)}&flujo_id=eq.${encodeURIComponent(flujoId)}`,
    "cliente_numero"
  );
  const numeros = new Set((segRows || []).map((r) => r.cliente_numero).filter(Boolean));
  return rows.filter((c) => numeros.has(c.numero));
}

async function fetchMensajesEnRango(usuarioId, desdeIso, hastaIso, flujoId, conexionWhatsappId = null) {
  let filter = `${buildUsuarioFilter(usuarioId)}${buildConexionFilter(conexionWhatsappId)}&${buildDateFilter(desdeIso, hastaIso)}`;
  const rows = await supabaseSelect(
    "mensajes",
    `${filter}&order=creado_en.asc`,
    "id,cliente_numero,direccion,creado_en,flujo_id"
  );
  if (!Array.isArray(rows)) return [];

  if (!flujoId) return rows;

  const segRows = await supabaseSelect(
    "seguimientos_programados",
    `${buildUsuarioFilter(usuarioId)}&flujo_id=eq.${encodeURIComponent(flujoId)}`,
    "cliente_numero"
  );
  const numeros = new Set((segRows || []).map((r) => r.cliente_numero).filter(Boolean));
  return rows.filter((m) => numeros.has(m.cliente_numero));
}

async function fetchConversacionesEnRango(usuarioId, desdeIso, hastaIso, flujoId, conexionWhatsappId = null) {
  const uid = encodeURIComponent(usuarioId);
  const dateF = buildDateFilter(desdeIso, hastaIso);
  const connF = buildConexionFilter(conexionWhatsappId);

  if (!flujoId) {
    const count = await supabaseCount("conversaciones", `usuario_id=eq.${uid}${connF}&${dateF}`);
    if (count !== null && count > 0) return count;

    const msgs = await fetchMensajesEnRango(usuarioId, desdeIso, hastaIso, null, conexionWhatsappId);
    return new Set(msgs.map((m) => m.cliente_numero).filter(Boolean)).size;
  }

  const msgs = await fetchMensajesEnRango(usuarioId, desdeIso, hastaIso, flujoId, conexionWhatsappId);
  return new Set(msgs.map((m) => m.cliente_numero).filter(Boolean)).size;
}

async function fetchConversionesEnRango(usuarioId, desdeIso, hastaIso, flujoId, conexionWhatsappId = null) {
  let filter = `${buildUsuarioFilter(usuarioId)}${buildConexionFilter(conexionWhatsappId)}&${buildDateFilter(desdeIso, hastaIso)}&order=creado_en.asc`;
  if (flujoId) filter += `&flujo_id=eq.${encodeURIComponent(flujoId)}`;

  const rows = await supabaseSelect("crm_conversiones", filter, "id,valor,moneda,creado_en,flujo_id,cliente_numero");
  return Array.isArray(rows) ? rows : [];
}

async function fetchSeguimientosEnRango(usuarioId, desdeIso, hastaIso, flujoId, conexionWhatsappId = null) {
  let filter = `${buildUsuarioFilter(usuarioId)}${buildConexionFilter(conexionWhatsappId)}&${buildDateFilter(desdeIso, hastaIso)}`;
  if (flujoId) filter += `&flujo_id=eq.${encodeURIComponent(flujoId)}`;

  const rows = await supabaseSelect(
    "seguimientos_programados",
    filter,
    "id,flujo_id,estado,cliente_numero,creado_en,enviado_en,respondido_en,cancelado_en"
  );
  return Array.isArray(rows) ? rows : [];
}

async function checkMetaAdsConectado(usuarioId) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}&activo=eq.true&select=pixel_id,capi_token&limit=1`,
      { headers: headers() }
    );
    const row = res.data?.[0];
    return Boolean(row?.pixel_id && row?.capi_token);
  } catch {
    return false;
  }
}

function countMensajesPorDireccion(mensajes) {
  let salientes = 0;
  let entrantes = 0;
  const clientesRespuesta = new Set();

  mensajes.forEach((m) => {
    if (m.direccion === "saliente") salientes += 1;
    if (m.direccion === "entrante") {
      entrantes += 1;
      if (m.cliente_numero) clientesRespuesta.add(m.cliente_numero);
    }
  });

  return { salientes, entrantes, clientesRespuesta: clientesRespuesta.size };
}

function sumarIngresos(conversiones) {
  const totales = sumarVentasPorMoneda(conversiones);
  const monedas = Object.keys(totales);
  if (!monedas.length) return { monto: 0, moneda: "BOB", desglose: {} };
  const moneda = monedas[0];
  const monto = Math.round((totales[moneda] || 0) * 100) / 100;
  return { monto, moneda, desglose: totales };
}

function countSeguimientosPorEstado(seguimientos) {
  const counts = { pendiente: 0, enviado: 0, cancelado: 0, respondido: 0 };
  seguimientos.forEach((s) => {
    const est = String(s.estado || "").toLowerCase();
    if (counts[est] !== undefined) counts[est] += 1;
  });
  return counts;
}

function pct(num, den) {
  const n = Number(num) || 0;
  const d = Number(den) || 0;
  if (d <= 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function computeSalud(kpis) {
  const { leads, conversaciones, respuestas, ventas, seguimientosActivos, tasaCierre, conversion } = kpis;
  if (leads === 0 && conversaciones === 0 && ventas === 0) return 0;

  let pts = 0;
  if (leads > 0) pts += Math.min(25, (conversaciones / leads) * 50);
  if (conversaciones > 0) pts += Math.min(25, (respuestas / conversaciones) * 50);
  pts += Math.min(20, tasaCierre * 2);
  pts += Math.min(15, conversion * 1.5);
  if (ventas > 0) pts += Math.min(15, Math.min(ventas * 3, 15));
  if (seguimientosActivos > 20) pts -= Math.min(20, seguimientosActivos / 3);
  else if (seguimientosActivos > 10) pts -= 8;

  return Math.max(0, Math.min(100, Math.round(pts)));
}

function saludLabel(score) {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Buena";
  if (score >= 40) return "Regular";
  return "Revisar";
}

function buildDiagnosticoItems(kpis) {
  const items = [];
  const { leads, conversaciones, respuestas, ventas, seguimientosActivos } = kpis;

  if (leads > 0 && conversaciones === 0) {
    items.push({ tipo: "alerta", texto: "Hay leads pero no inician conversación" });
  }
  if (conversaciones > 0) {
    const respRate = respuestas / conversaciones;
    if (respRate < 0.3) {
      items.push({ tipo: "alerta", texto: "La respuesta del lead está baja" });
    }
  }
  if (ventas === 0 && conversaciones >= 5) {
    items.push({ tipo: "alerta", texto: "Hay interés pero no hay cierre" });
  }
  if (seguimientosActivos >= 10) {
    items.push({ tipo: "info", texto: "Hay muchos seguimientos pendientes" });
  }
  if (ventas > 0) {
    items.push({ tipo: "ok", texto: "Hay conversiones reales registradas" });
  }
  if (!items.length) {
    items.push({ tipo: "info", texto: "Sin datos suficientes para diagnóstico en este periodo" });
  }
  return items;
}

function buildSeriesDiarias(desdeIso, hastaIso, clientes, mensajes, conversiones) {
  const days = {};
  const cursor = new Date(desdeIso);
  const end = new Date(hastaIso);
  cursor.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    const key = dateKey(cursor.toISOString());
    days[key] = { fecha: key, leads: 0, mensajes: 0, ventas: 0, ingresos: 0 };
    cursor.setDate(cursor.getDate() + 1);
  }

  clientes.forEach((c) => {
    const k = dateKey(c.creado_en);
    if (k && days[k]) days[k].leads += 1;
  });

  mensajes.forEach((m) => {
    const k = dateKey(m.creado_en);
    if (k && days[k]) days[k].mensajes += 1;
  });

  conversiones.forEach((c) => {
    const k = dateKey(c.creado_en);
    if (k && days[k]) {
      days[k].ventas += 1;
      const v = parseFloat(c.valor);
      if (Number.isFinite(v)) days[k].ingresos += v;
    }
  });

  return Object.values(days).map((d) => ({
    ...d,
    ingresos: Math.round(d.ingresos * 100) / 100,
  }));
}

function buildHeatmap(mensajes, clientes) {
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hora: h,
    mensajes: 0,
    leads: 0,
    total: 0,
  }));

  mensajes.forEach((m) => {
    const h = hourKey(m.creado_en);
    if (h === null) return;
    hours[h].mensajes += 1;
    hours[h].total += 1;
  });

  clientes.forEach((c) => {
    const h = hourKey(c.creado_en);
    if (h === null) return;
    hours[h].leads += 1;
    hours[h].total += 1;
  });

  const max = Math.max(...hours.map((x) => x.total), 0);
  return { horas: hours, max };
}

function computeFlujosRanking(flujos, seguimientos, conversiones, mensajes) {
  const byFlow = {};
  flujos.forEach((f) => {
    byFlow[f.id] = {
      flujoId: f.id,
      nombre: f.nombre,
      leads: 0,
      respuestas: 0,
      conversiones: 0,
      seguimientosPendientes: 0,
      actividad: 0,
    };
  });

  const leadsPorFlujo = {};
  flujos.forEach((f) => {
    leadsPorFlujo[f.id] = new Set();
  });

  seguimientos.forEach((s) => {
    if (!s.flujo_id || !byFlow[s.flujo_id]) return;
    if (s.cliente_numero) leadsPorFlujo[s.flujo_id].add(s.cliente_numero);
    if (s.estado === "pendiente") byFlow[s.flujo_id].seguimientosPendientes += 1;
    if (s.estado === "respondido" && s.cliente_numero) {
      byFlow[s.flujo_id].respuestas += 1;
    }
    byFlow[s.flujo_id].actividad += 1;
  });

  conversiones.forEach((c) => {
    if (!c.flujo_id || !byFlow[c.flujo_id]) return;
    byFlow[c.flujo_id].conversiones += 1;
    byFlow[c.flujo_id].actividad += 1;
  });

  Object.keys(byFlow).forEach((fid) => {
    byFlow[fid].leads = leadsPorFlujo[fid]?.size || 0;
  });

  const lista = Object.values(byFlow);
  const pickMax = (key) => {
    const sorted = [...lista].sort((a, b) => (b[key] || 0) - (a[key] || 0));
    return sorted[0]?.[key] > 0 ? sorted[0] : null;
  };

  const sinActividad = lista.filter((f) => f.actividad === 0 && f.leads === 0);

  return {
    flujos: lista,
    destacados: {
      masLeads: pickMax("leads"),
      masRespuestas: pickMax("respuestas"),
      masConversiones: pickMax("conversiones"),
      masPendientes: pickMax("seguimientosPendientes"),
    },
    sinActividad,
  };
}

async function loadMetricasBase(usuarioId, query = {}) {
  const rango = parseRango(query);
  const flujoId = query.flujo_id || query.flujoId || null;
  const conexionWhatsappId =
    query.conexion_whatsapp_id ?? query.conexionWhatsappId ?? null;
  logMetricasMulti(conexionWhatsappId, "loadMetricasBase");
  const anterior = rangoAnterior(rango.desde, rango.hasta);

  const [clientes, mensajes, conversiones, seguimientos, flujos, metaAdsConectado] = await Promise.all([
    fetchClientesEnRango(usuarioId, rango.desde, rango.hasta, flujoId),
    fetchMensajesEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    fetchConversionesEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    fetchSeguimientosEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    fetchFlujosList(usuarioId),
    checkMetaAdsConectado(usuarioId),
  ]);

  const [clientesAnt, mensajesAnt, conversionesAnt, conversaciones, conversacionesAnt] = await Promise.all([
    fetchClientesEnRango(usuarioId, anterior.desde, anterior.hasta, flujoId),
    fetchMensajesEnRango(usuarioId, anterior.desde, anterior.hasta, flujoId, conexionWhatsappId),
    fetchConversionesEnRango(usuarioId, anterior.desde, anterior.hasta, flujoId, conexionWhatsappId),
    fetchConversacionesEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    fetchConversacionesEnRango(usuarioId, anterior.desde, anterior.hasta, flujoId, conexionWhatsappId),
  ]);

  const { salientes, entrantes, clientesRespuesta } = countMensajesPorDireccion(mensajes);
  const segEstados = countSeguimientosPorEstado(seguimientos);
  const ingresos = sumarIngresos(conversiones);

  const leads = clientes.length;
  const ventas = conversiones.length;
  const respuestas = clientesRespuesta;
  const tasaCierre = pct(ventas, conversaciones);
  const conversion = pct(ventas, leads);

  const kpis = {
    leads,
    conversaciones,
    mensajesEnviados: salientes,
    respuestas,
    mensajesEntrantes: entrantes,
    ventas,
    ingresos: ingresos.monto,
    moneda: ingresos.moneda,
    ingresosDesglose: ingresos.desglose,
    seguimientosActivos: segEstados.pendiente,
    seguimientosEnviados: segEstados.enviado,
    seguimientosCancelados: segEstados.cancelado,
    seguimientosRespondidos: segEstados.respondido,
    tasaCierre,
    conversion,
    tendenciaLeads: calcTendencia(leads, clientesAnt.length),
    tendenciaConversaciones: calcTendencia(conversaciones, conversacionesAnt),
    tendenciaVentas: calcTendencia(ventas, conversionesAnt.length),
  };

  const salud = computeSalud({ ...kpis, seguimientosActivos: segEstados.pendiente });

  return {
    rango,
    flujoId,
    flujos,
    clientes,
    mensajes,
    conversiones,
    seguimientos,
    metaAdsConectado,
    kpis,
    salud,
    segEstados,
  };
}

async function computeResumen(usuarioId, query) {
  const base = await loadMetricasBase(usuarioId, query);
  const { kpis, salud, rango, flujoId, metaAdsConectado } = base;

  return {
    ok: true,
    periodo: rango.periodo,
    desde: rango.desde,
    hasta: rango.hasta,
    flujoId,
    kpis,
    salud: {
      score: salud,
      label: saludLabel(salud),
    },
    metaAds: {
      conectado: metaAdsConectado,
      mensaje: metaAdsConectado
        ? "Pixel Meta configurado. Métricas de anuncios (CTR, CPC, ROAS) requieren integración Ads API."
        : "Conecta Meta Ads para ver CTR, CPC, CPM, ROAS y frecuencia.",
    },
    source: "supabase",
  };
}

async function computeFunnel(usuarioId, query) {
  const base = await loadMetricasBase(usuarioId, query);
  const { kpis, segEstados, rango, flujoId } = base;

  const pasos = [
    { nombre: "Leads", cantidad: kpis.leads, color: "blue" },
    { nombre: "Conversaciones", cantidad: kpis.conversaciones, color: "cyan" },
    { nombre: "Respuestas", cantidad: kpis.respuestas, color: "green" },
    { nombre: "Seguimientos enviados", cantidad: segEstados.enviado, color: "orange" },
    { nombre: "Ventas", cantidad: kpis.ventas, color: "purple" },
  ];

  const max = Math.max(...pasos.map((p) => p.cantidad), 1);
  const etapas = pasos.map((p) => ({
    ...p,
    porcentaje: max > 0 ? Math.round((p.cantidad / max) * 100) : 0,
    tasaVsLeads: kpis.leads > 0 ? pct(p.cantidad, kpis.leads) : 0,
  }));

  return {
    ok: true,
    periodo: rango.periodo,
    desde: rango.desde,
    hasta: rango.hasta,
    flujoId,
    etapas,
    vacio: pasos.every((p) => p.cantidad === 0),
    source: "supabase",
  };
}

async function computeSeries(usuarioId, query) {
  const base = await loadMetricasBase(usuarioId, query);
  const { clientes, mensajes, conversiones, rango, flujoId } = base;

  const diario = buildSeriesDiarias(rango.desde, rango.hasta, clientes, mensajes, conversiones);
  const vacio = diario.every((d) => d.leads === 0 && d.mensajes === 0 && d.ventas === 0);

  const porFlujo = {};
  conversiones.forEach((c) => {
    if (!c.flujo_id) return;
    if (!porFlujo[c.flujo_id]) porFlujo[c.flujo_id] = 0;
    porFlujo[c.flujo_id] += 1;
  });

  return {
    ok: true,
    periodo: rango.periodo,
    desde: rango.desde,
    hasta: rango.hasta,
    flujoId,
    diario,
    conversionesPorFlujo: porFlujo,
    vacio,
    source: "supabase",
  };
}

async function computeFlujos(usuarioId, query) {
  const base = await loadMetricasBase(usuarioId, query);
  const ranking = computeFlujosRanking(
    base.flujos,
    base.seguimientos,
    base.conversiones,
    base.mensajes
  );

  return {
    ok: true,
    periodo: base.rango.periodo,
    desde: base.rango.desde,
    hasta: base.rango.hasta,
    ...ranking,
    source: "supabase",
  };
}

async function computeDiagnostico(usuarioId, query) {
  const base = await loadMetricasBase(usuarioId, query);
  const items = buildDiagnosticoItems(base.kpis);

  return {
    ok: true,
    periodo: base.rango.periodo,
    desde: base.rango.desde,
    hasta: base.rango.hasta,
    flujoId: base.flujoId,
    items,
    salud: {
      score: base.salud,
      label: saludLabel(base.salud),
    },
    recomendacion:
      base.salud >= 60
        ? "Mantén el ritmo de seguimiento y optimiza los flujos con más respuestas."
        : "Prioriza respuesta rápida y seguimientos antes de escalar campañas.",
    source: "supabase",
  };
}

async function computeHeatmap(usuarioId, query) {
  const base = await loadMetricasBase(usuarioId, query);
  const heatmap = buildHeatmap(base.mensajes, base.clientes);

  return {
    ok: true,
    periodo: base.rango.periodo,
    desde: base.rango.desde,
    hasta: base.rango.hasta,
    flujoId: base.flujoId,
    heatmap,
    vacio: heatmap.max === 0,
    source: "supabase",
  };
}

module.exports = {
  parseRango,
  computeResumen,
  computeFunnel,
  computeSeries,
  computeFlujos,
  computeDiagnostico,
  computeHeatmap,
  fetchFlujosList,
};
