/**
 * Métricas CRM reales — solo Supabase, sin mocks.
 */
const axios = require("axios");
const { calcTendencia, sumarVentasPorMoneda } = require("./flujosMetricsService");
const { isSchemaMissingError, logSchemaFallback, errorMessage } = require("./supabaseSafe");
const { resolveDateRange } = require("./dateRangeService");

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
  return resolveDateRange(query);
}

function rangoAnterior(desdeIso, hastaIso, periodo = "") {
  const p = String(periodo || "").toLowerCase();

  if (p === "ayer") {
    const inicioAyer = new Date(desdeIso);
    const inicioAnteayer = new Date(inicioAyer);
    inicioAnteayer.setDate(inicioAnteayer.getDate() - 1);
    const finAnteayer = new Date(inicioAyer);
    finAnteayer.setMilliseconds(finAnteayer.getMilliseconds() - 1);
    return {
      desde: inicioAnteayer.toISOString(),
      hasta: finAnteayer.toISOString(),
    };
  }

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

async function supabaseRpc(functionName, params) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;
  try {
    const res = await axios.post(url, params, { headers: headers() });
    const n = Number(res.data);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    if (isSchemaMissingError(e)) {
      logSchemaFallback(`rpc/${functionName}`, e);
      return null;
    }
    const detail = errorMessage(e) || e.message;
    throw new Error(
      `[metricas] RPC ${functionName} falló: ${detail}. ` +
        "Si la función no existe, ejecuta supabase/migrations/create_count_leads_por_linea_rpc.sql"
    );
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

function isResumenTodasLasLineas(conexionWhatsappId) {
  const raw = conexionWhatsappId == null ? "" : String(conexionWhatsappId).trim();
  return !raw || raw === CONEXION_TODAS;
}

async function fetchConexionesActivasUsuario(usuarioId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId) return [];
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}&select=id&order=creado_en.asc`,
      { headers: headers() }
    );
    return Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    console.log("[metricas] fetchConexionesActivas:", e.response?.data || e.message);
    return [];
  }
}

function mergeIngresosResumen(desgloses) {
  const desglose = {};
  desgloses.forEach((d) => {
    Object.entries(d || {}).forEach(([moneda, monto]) => {
      desglose[moneda] = (desglose[moneda] || 0) + (Number(monto) || 0);
    });
  });
  const monedas = Object.keys(desglose);
  if (!monedas.length) return { monto: 0, moneda: "BOB", desglose: {} };
  const rounded = {};
  monedas.forEach((m) => {
    rounded[m] = Math.round(desglose[m] * 100) / 100;
  });
  return { monto: rounded[monedas[0]] || 0, moneda: monedas[0], desglose: rounded };
}

function mergeResumenPorLineas(bases) {
  const first = bases[0];
  const sumKpi = (key) => bases.reduce((s, b) => s + (Number(b.kpis?.[key]) || 0), 0);
  const sumAnt = (key) => bases.reduce((s, b) => s + (Number(b._ant?.[key]) || 0), 0);

  const leads = sumKpi("leads");
  const conversaciones = sumKpi("conversaciones");
  const ventas = sumKpi("ventas");
  const ingresosMerged = mergeIngresosResumen(bases.map((b) => b.kpis?.ingresosDesglose || {}));

  const kpis = {
    leads,
    conversaciones,
    mensajesEnviados: sumKpi("mensajesEnviados"),
    respuestas: sumKpi("respuestas"),
    mensajesEntrantes: sumKpi("mensajesEntrantes"),
    ventas,
    ingresos: ingresosMerged.monto,
    moneda: ingresosMerged.moneda,
    ingresosDesglose: ingresosMerged.desglose,
    seguimientosActivos: sumKpi("seguimientosActivos"),
    seguimientosEnviados: sumKpi("seguimientosEnviados"),
    seguimientosCancelados: sumKpi("seguimientosCancelados"),
    seguimientosRespondidos: sumKpi("seguimientosRespondidos"),
    tasaCierre: pct(ventas, conversaciones),
    conversion: pct(ventas, leads),
    tendenciaLeads: calcTendencia(leads, sumAnt("leads")),
    tendenciaConversaciones: calcTendencia(conversaciones, sumAnt("conversaciones")),
    tendenciaVentas: calcTendencia(ventas, sumAnt("ventas")),
  };

  return {
    rango: first.rango,
    flujoId: first.flujoId,
    kpis,
    salud: computeSalud({ ...kpis, seguimientosActivos: kpis.seguimientosActivos }),
    metaAdsConectado: bases.some((b) => b.metaAdsConectado),
  };
}

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

const FLUJOS_LIST_SELECT_METRICAS = "id,nombre";
const FLUJOS_LIST_SELECT_DEFAULT = "id,nombre,creado_en,data";

async function fetchFlujosList(usuarioId, selectFields = FLUJOS_LIST_SELECT_DEFAULT) {
  const rows = await supabaseSelect(
    "flujos_builder",
    `${buildUsuarioFilter(usuarioId)}&order=nombre.asc`,
    selectFields
  );
  return Array.isArray(rows) ? rows : [];
}

function fetchFlujosListMetricas(usuarioId) {
  return fetchFlujosList(usuarioId, FLUJOS_LIST_SELECT_METRICAS);
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

async function countClientesEnRango(
  usuarioId,
  desdeIso,
  hastaIso,
  flujoId,
  conexionWhatsappId = null
) {
  const baseFilter = `${buildUsuarioFilter(usuarioId)}&${buildDateFilter(desdeIso, hastaIso)}&estado=neq.bloqueado`;

  if (buildConexionFilter(conexionWhatsappId)) {
    const connId = String(conexionWhatsappId).trim();
    const rpcParams = {
      p_usuario_id: usuarioId,
      p_conexion_whatsapp_id: connId,
      p_desde: desdeIso,
      p_hasta: hastaIso,
    };
    if (flujoId) rpcParams.p_flujo_id = flujoId;

    const total = await supabaseRpc("count_leads_por_linea", rpcParams);
    if (total === null) {
      throw new Error(
        "[metricas] RPC count_leads_por_linea no disponible. " +
          "Ejecuta supabase/migrations/create_count_leads_por_linea_rpc.sql en Supabase."
      );
    }
    return total;
  }

  if (!flujoId) {
    const total = await supabaseCount("clientes", baseFilter);
    return total ?? 0;
  }

  const segRows = await supabaseSelect(
    "seguimientos_programados",
    `${buildUsuarioFilter(usuarioId)}&flujo_id=eq.${encodeURIComponent(flujoId)}`,
    "cliente_numero"
  );
  const numeros = [...new Set((segRows || []).map((r) => r.cliente_numero).filter(Boolean))];
  if (!numeros.length) return 0;

  let total = 0;
  for (let i = 0; i < numeros.length; i += 80) {
    const chunk = numeros.slice(i, i + 80);
    const inList = chunk.map((n) => encodeURIComponent(n)).join(",");
    const n = await supabaseCount("clientes", `${baseFilter}&numero=in.(${inList})`);
    if (n === null) return 0;
    total += n;
  }
  return total;
}

async function fetchFlujoClienteNumeros(usuarioId, flujoId) {
  if (!flujoId) return [];
  const segRows = await supabaseSelect(
    "seguimientos_programados",
    `${buildUsuarioFilter(usuarioId)}&flujo_id=eq.${encodeURIComponent(flujoId)}`,
    "cliente_numero"
  );
  return [...new Set((segRows || []).map((r) => r.cliente_numero).filter(Boolean))];
}

async function countMensajesEnRango(
  usuarioId,
  desdeIso,
  hastaIso,
  flujoId,
  conexionWhatsappId = null,
  direccion = null
) {
  const baseFilter = `${buildUsuarioFilter(usuarioId)}${buildConexionFilter(conexionWhatsappId)}&${buildDateFilter(desdeIso, hastaIso)}`;
  const dirF = direccion ? `&direccion=eq.${encodeURIComponent(direccion)}` : "";

  if (!flujoId) {
    const total = await supabaseCount("mensajes", `${baseFilter}${dirF}`);
    return total ?? 0;
  }

  const numeros = await fetchFlujoClienteNumeros(usuarioId, flujoId);
  if (!numeros.length) return 0;

  let total = 0;
  for (let i = 0; i < numeros.length; i += 80) {
    const chunk = numeros.slice(i, i + 80);
    const inList = chunk.map((n) => encodeURIComponent(n)).join(",");
    const n = await supabaseCount("mensajes", `${baseFilter}${dirF}&cliente_numero=in.(${inList})`);
    if (n === null) return 0;
    total += n;
  }
  return total;
}

async function countDistinctClientesMensajesEnRango(
  usuarioId,
  desdeIso,
  hastaIso,
  flujoId,
  conexionWhatsappId = null
) {
  const baseFilter = `${buildUsuarioFilter(usuarioId)}${buildConexionFilter(conexionWhatsappId)}&${buildDateFilter(desdeIso, hastaIso)}`;

  if (!flujoId) {
    const rows = await supabaseSelect("mensajes", baseFilter, "cliente_numero");
    if (!Array.isArray(rows)) return 0;
    return new Set(rows.map((m) => m.cliente_numero).filter(Boolean)).size;
  }

  const numeros = await fetchFlujoClienteNumeros(usuarioId, flujoId);
  if (!numeros.length) return 0;

  const seen = new Set();
  for (let i = 0; i < numeros.length; i += 80) {
    const chunk = numeros.slice(i, i + 80);
    const inList = chunk.map((n) => encodeURIComponent(n)).join(",");
    const rows = await supabaseSelect(
      "mensajes",
      `${baseFilter}&cliente_numero=in.(${inList})`,
      "cliente_numero"
    );
    if (!Array.isArray(rows)) continue;
    rows.forEach((r) => {
      if (r.cliente_numero) seen.add(r.cliente_numero);
    });
  }
  return seen.size;
}

async function countConversacionesEnRango(
  usuarioId,
  desdeIso,
  hastaIso,
  flujoId,
  conexionWhatsappId = null
) {
  const uid = encodeURIComponent(usuarioId);
  const dateF = buildDateFilter(desdeIso, hastaIso);
  const connF = buildConexionFilter(conexionWhatsappId);

  if (!flujoId) {
    const count = await supabaseCount("conversaciones", `usuario_id=eq.${uid}${connF}&${dateF}`);
    if (count !== null && count > 0) return count;
    return countDistinctClientesMensajesEnRango(
      usuarioId,
      desdeIso,
      hastaIso,
      null,
      conexionWhatsappId
    );
  }

  return countDistinctClientesMensajesEnRango(
    usuarioId,
    desdeIso,
    hastaIso,
    flujoId,
    conexionWhatsappId
  );
}

async function countRespuestasEnRango(
  usuarioId,
  desdeIso,
  hastaIso,
  flujoId,
  conexionWhatsappId = null
) {
  const baseFilter = `${buildUsuarioFilter(usuarioId)}${buildConexionFilter(conexionWhatsappId)}&${buildDateFilter(desdeIso, hastaIso)}&direccion=eq.entrante`;

  if (!flujoId) {
    const rows = await supabaseSelect("mensajes", baseFilter, "cliente_numero");
    if (!Array.isArray(rows)) return 0;
    return new Set(rows.map((r) => r.cliente_numero).filter(Boolean)).size;
  }

  const numeros = await fetchFlujoClienteNumeros(usuarioId, flujoId);
  if (!numeros.length) return 0;

  const seen = new Set();
  for (let i = 0; i < numeros.length; i += 80) {
    const chunk = numeros.slice(i, i + 80);
    const inList = chunk.map((n) => encodeURIComponent(n)).join(",");
    const rows = await supabaseSelect(
      "mensajes",
      `${baseFilter}&cliente_numero=in.(${inList})`,
      "cliente_numero"
    );
    if (!Array.isArray(rows)) continue;
    rows.forEach((r) => {
      if (r.cliente_numero) seen.add(r.cliente_numero);
    });
  }
  return seen.size;
}

async function countConversionesEnRango(
  usuarioId,
  desdeIso,
  hastaIso,
  flujoId,
  conexionWhatsappId = null
) {
  let filter = `${buildUsuarioFilter(usuarioId)}${buildConexionFilter(conexionWhatsappId)}&${buildDateFilter(desdeIso, hastaIso)}`;
  if (flujoId) filter += `&flujo_id=eq.${encodeURIComponent(flujoId)}`;
  const total = await supabaseCount("crm_conversiones", filter);
  return total ?? 0;
}

async function sumIngresosConversionesEnRango(
  usuarioId,
  desdeIso,
  hastaIso,
  flujoId,
  conexionWhatsappId = null
) {
  let filter = `${buildUsuarioFilter(usuarioId)}${buildConexionFilter(conexionWhatsappId)}&${buildDateFilter(desdeIso, hastaIso)}`;
  if (flujoId) filter += `&flujo_id=eq.${encodeURIComponent(flujoId)}`;
  const rows = await supabaseSelect("crm_conversiones", filter, "valor,moneda");
  if (!Array.isArray(rows)) return { monto: 0, moneda: "BOB", desglose: {} };
  return sumarIngresos(rows);
}

async function countSeguimientosPorEstadoEnRango(
  usuarioId,
  desdeIso,
  hastaIso,
  flujoId,
  conexionWhatsappId = null
) {
  const base = `${buildUsuarioFilter(usuarioId)}${buildConexionFilter(conexionWhatsappId)}&${buildDateFilter(desdeIso, hastaIso)}`;
  const flujoF = flujoId ? `&flujo_id=eq.${encodeURIComponent(flujoId)}` : "";
  const estados = ["pendiente", "enviado", "cancelado", "respondido"];
  const counts = { pendiente: 0, enviado: 0, cancelado: 0, respondido: 0 };

  await Promise.all(
    estados.map(async (est) => {
      const n = await supabaseCount("seguimientos_programados", `${base}${flujoF}&estado=eq.${est}`);
      counts[est] = n ?? 0;
    })
  );

  return counts;
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

const REVENUE_TIPOS = ["venta", "upsell", "downsell", "recuperacion"];
const REVENUE_ORIGENES = ["flujo", "remarketing"];

const TIPO_LEGACY_BREAKDOWN = {
  venta_remarketing: "venta",
  upsell_remarketing: "upsell",
  downsell_remarketing: "downsell",
  recuperacion_remarketing: "recuperacion",
};

function roundIngresos(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function emptyRevenueCelda() {
  return { cantidad: 0, ingresos: 0 };
}

function emptyRevenueOrigenBucket() {
  const bucket = {};
  REVENUE_TIPOS.forEach((t) => {
    bucket[t] = emptyRevenueCelda();
  });
  return bucket;
}

function emptyRevenueMonedaBucket() {
  return {
    total: emptyRevenueCelda(),
    flujo: emptyRevenueOrigenBucket(),
    remarketing: emptyRevenueOrigenBucket(),
  };
}

function normalizarTipoRevenue(tipo) {
  const t = String(tipo ?? "")
    .trim()
    .toLowerCase();
  if (t === "remarketing") return "venta";
  return REVENUE_TIPOS.includes(t) ? t : "venta";
}

/** Normalización read-only para breakdown (metadata.origen + metadata.tipo). */
function resolveMetadataMetricas(metadata) {
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};

  const tipoRaw = meta.tipo != null && String(meta.tipo).trim() !== "" ? meta.tipo : meta.tipo_venta;
  const tipoLower = String(tipoRaw ?? "")
    .trim()
    .toLowerCase();

  if (TIPO_LEGACY_BREAKDOWN[tipoLower]) {
    return { origen: "remarketing", tipo: TIPO_LEGACY_BREAKDOWN[tipoLower] };
  }
  if (/_remarketing$/.test(tipoLower)) {
    const base = tipoLower.replace(/_remarketing$/, "");
    if (REVENUE_TIPOS.includes(base)) {
      return { origen: "remarketing", tipo: base };
    }
  }

  const origenMeta = String(meta.origen ?? "")
    .trim()
    .toLowerCase();
  const origen = origenMeta === "remarketing" ? "remarketing" : "flujo";
  const tipo = normalizarTipoRevenue(tipoRaw);

  return { origen, tipo };
}

function normalizeConexionWhatsappIdResponse(conexionWhatsappId) {
  const raw =
    conexionWhatsappId == null ? "" : String(conexionWhatsappId).trim();
  if (!raw || raw === CONEXION_TODAS) return null;
  return raw;
}

/** Alias ISO para revenue-breakdown (solo lectura; no modifica filas en DB). */
const MONEDA_CANONICAL_METRICS = {
  BS: "BOB",
  BOB: "BOB",
  USD: "USD",
  CLP: "CLP",
};

function canonicalMonedaForMetrics(raw) {
  const key = String(raw ?? "BOB").trim().toUpperCase() || "BOB";
  if (MONEDA_CANONICAL_METRICS[key]) return MONEDA_CANONICAL_METRICS[key];
  return key;
}

function sumRevenueOrigenBucket(origenBucket) {
  let cantidad = 0;
  let ingresos = 0;
  REVENUE_TIPOS.forEach((tipo) => {
    const cell = origenBucket?.[tipo] || emptyRevenueCelda();
    cantidad += Number(cell.cantidad) || 0;
    ingresos += Number(cell.ingresos) || 0;
  });
  return { cantidad, ingresos: roundIngresos(ingresos) };
}

function revenuePct(part, whole) {
  const p = Number(part) || 0;
  const w = Number(whole) || 0;
  if (w <= 0) return 0;
  return roundIngresos((p / w) * 100);
}

function revenueTicket(ingresos, cantidad) {
  const c = Number(cantidad) || 0;
  if (c <= 0) return 0;
  return roundIngresos((Number(ingresos) || 0) / c);
}

function buildRevenueKpis(bucket) {
  const flujo = sumRevenueOrigenBucket(bucket.flujo);
  const remarketing = sumRevenueOrigenBucket(bucket.remarketing);
  const totalIngresos = roundIngresos(bucket.total.ingresos);
  const totalCantidad = Number(bucket.total.cantidad) || 0;
  const ingresosFlujo = flujo.ingresos;
  const cantidadFlujo = flujo.cantidad;
  const ingresosRemarketing = remarketing.ingresos;
  const cantidadRemarketing = remarketing.cantidad;

  return {
    totalIngresos,
    totalCantidad,
    ingresosFlujo,
    cantidadFlujo,
    ingresosRemarketing,
    cantidadRemarketing,
    porcentajeIngresosRemarketing: revenuePct(ingresosRemarketing, totalIngresos),
    porcentajeCantidadRemarketing: revenuePct(cantidadRemarketing, totalCantidad),
    ticketPromedioTotal: revenueTicket(totalIngresos, totalCantidad),
    ticketPromedioFlujo: revenueTicket(ingresosFlujo, cantidadFlujo),
    ticketPromedioRemarketing: revenueTicket(ingresosRemarketing, cantidadRemarketing),
  };
}

async function fetchConversionesParaBreakdown(
  usuarioId,
  desdeIso,
  hastaIso,
  flujoId,
  conexionWhatsappId = null
) {
  let filter = `${buildUsuarioFilter(usuarioId)}${buildConexionFilter(conexionWhatsappId)}&${buildDateFilter(desdeIso, hastaIso)}&order=creado_en.asc`;
  if (flujoId) filter += `&flujo_id=eq.${encodeURIComponent(flujoId)}`;

  const rows = await supabaseSelect(
    "crm_conversiones",
    filter,
    "id,valor,moneda,creado_en,flujo_id,conexion_whatsapp_id,metadata"
  );
  if (rows === null) return null;
  return Array.isArray(rows) ? rows : [];
}

function aggregateRevenueBreakdown(rows) {
  const porMoneda = {};

  (rows || []).forEach((row) => {
    const { origen, tipo } = resolveMetadataMetricas(row.metadata);
    if (!REVENUE_ORIGENES.includes(origen) || !REVENUE_TIPOS.includes(tipo)) return;

    const moneda = canonicalMonedaForMetrics(row.moneda);

    if (!porMoneda[moneda]) {
      porMoneda[moneda] = emptyRevenueMonedaBucket();
    }

    const v = parseFloat(row.valor);
    const valor = Number.isFinite(v) && v >= 0 ? v : 0;

    const bucket = porMoneda[moneda];
    bucket.total.cantidad += 1;
    bucket.total.ingresos += valor;
    bucket[origen][tipo].cantidad += 1;
    bucket[origen][tipo].ingresos += valor;
  });

  Object.keys(porMoneda).forEach((moneda) => {
    const b = porMoneda[moneda];
    b.total.ingresos = roundIngresos(b.total.ingresos);
    REVENUE_ORIGENES.forEach((origen) => {
      REVENUE_TIPOS.forEach((tipo) => {
        b[origen][tipo].ingresos = roundIngresos(b[origen][tipo].ingresos);
      });
    });
    porMoneda[moneda] = {
      kpis: buildRevenueKpis(b),
      total: b.total,
      flujo: b.flujo,
      remarketing: b.remarketing,
    };
  });

  return porMoneda;
}

async function computeRevenueBreakdown(usuarioId, query = {}) {
  const rango = parseRango(query);
  const flujoId = query.flujo_id || query.flujoId || null;
  const conexionWhatsappId =
    query.conexion_whatsapp_id ?? query.conexionWhatsappId ?? null;

  logMetricasMulti(conexionWhatsappId, "computeRevenueBreakdown");

  const rows = await fetchConversionesParaBreakdown(
    usuarioId,
    rango.desde,
    rango.hasta,
    flujoId,
    conexionWhatsappId
  );

  if (rows === null) {
    throw new Error("No se pudieron cargar conversiones para revenue-breakdown");
  }

  const porMoneda = aggregateRevenueBreakdown(rows);

  return {
    ok: true,
    periodo: rango.periodo,
    desde: rango.desde,
    hasta: rango.hasta,
    flujoId,
    conexionWhatsappId: normalizeConexionWhatsappIdResponse(conexionWhatsappId),
    porMoneda,
    source: "supabase",
  };
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

function metricasBaseRequestKey(usuarioId, query = {}) {
  const flujoId = query.flujo_id || query.flujoId || null;
  const conexionWhatsappId =
    query.conexion_whatsapp_id ?? query.conexionWhatsappId ?? null;
  const conn =
    conexionWhatsappId == null || String(conexionWhatsappId).trim() === ""
      ? null
      : String(conexionWhatsappId).trim();

  if (query.desde) {
    return JSON.stringify({
      u: String(usuarioId),
      periodo: String(query.periodo || "custom").toLowerCase().trim(),
      desde: new Date(query.desde).toISOString(),
      hasta: query.hasta ? new Date(query.hasta).toISOString() : null,
      flujoId: flujoId || null,
      conexionWhatsappId: conn,
    });
  }

  const periodo = String(query.periodo || "7d").toLowerCase().trim();
  return JSON.stringify({
    u: String(usuarioId),
    periodo,
    flujoId: flujoId || null,
    conexionWhatsappId: conn,
  });
}

/** Cargas idénticas en vuelo comparten una sola promesa; no persiste tras completar. */
const metricasBaseInflight = new Map();

async function resolveMetricasBase(usuarioId, query = {}) {
  const key = metricasBaseRequestKey(usuarioId, query);
  const existing = metricasBaseInflight.get(key);
  if (existing) return existing;

  const pending = loadMetricasBase(usuarioId, query).finally(() => {
    metricasBaseInflight.delete(key);
  });
  metricasBaseInflight.set(key, pending);
  return pending;
}

async function loadMetricasBase(usuarioId, query = {}) {
  const rango = parseRango(query);
  const flujoId = query.flujo_id || query.flujoId || null;
  const conexionWhatsappId =
    query.conexion_whatsapp_id ?? query.conexionWhatsappId ?? null;
  logMetricasMulti(conexionWhatsappId, "loadMetricasBase");
  const anterior = rangoAnterior(rango.desde, rango.hasta, rango.periodo);

  const [clientes, mensajes, conversiones, seguimientos, flujos, metaAdsConectado] = await Promise.all([
    fetchClientesEnRango(usuarioId, rango.desde, rango.hasta, flujoId),
    fetchMensajesEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    fetchConversionesEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    fetchSeguimientosEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    fetchFlujosListMetricas(usuarioId),
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

/** Carga agregada solo para resumen — sin arrays completos de métricas base. */
async function loadResumenBase(usuarioId, query = {}) {
  const conexionWhatsappId =
    query.conexion_whatsapp_id ?? query.conexionWhatsappId ?? null;

  if (isResumenTodasLasLineas(conexionWhatsappId)) {
    logMetricasMulti(conexionWhatsappId, "loadResumenBase");
    const rows = await fetchConexionesActivasUsuario(usuarioId);
    const ids = rows.map((r) => String(r.id)).filter(Boolean);
    console.log(
      `[METRICAS_MULTI] resumen Todas las líneas: agregando ${ids.length} conexión(es) activa(s)`
    );
    if (!ids.length) {
      const rango = parseRango(query);
      const flujoId = query.flujo_id || query.flujoId || null;
      const metaAdsConectado = await checkMetaAdsConectado(usuarioId);
      const kpis = {
        leads: 0,
        conversaciones: 0,
        mensajesEnviados: 0,
        respuestas: 0,
        mensajesEntrantes: 0,
        ventas: 0,
        ingresos: 0,
        moneda: "BOB",
        ingresosDesglose: {},
        seguimientosActivos: 0,
        seguimientosEnviados: 0,
        seguimientosCancelados: 0,
        seguimientosRespondidos: 0,
        tasaCierre: 0,
        conversion: 0,
        tendenciaLeads: calcTendencia(0, 0),
        tendenciaConversaciones: calcTendencia(0, 0),
        tendenciaVentas: calcTendencia(0, 0),
      };
      return {
        rango,
        flujoId,
        kpis,
        salud: computeSalud({ ...kpis, seguimientosActivos: 0 }),
        metaAdsConectado,
      };
    }
    const bases = await Promise.all(
      ids.map((id) =>
        loadResumenBase(usuarioId, {
          ...query,
          conexion_whatsapp_id: id,
          conexionWhatsappId: id,
        })
      )
    );
    return mergeResumenPorLineas(bases);
  }

  const rango = parseRango(query);
  const flujoId = query.flujo_id || query.flujoId || null;
  logMetricasMulti(conexionWhatsappId, "loadResumenBase");
  const anterior = rangoAnterior(rango.desde, rango.hasta, rango.periodo);

  const [
    leads,
    leadsAnt,
    conversaciones,
    conversacionesAnt,
    salientes,
    entrantes,
    respuestas,
    ventas,
    ventasAnt,
    ingresos,
    segEstados,
    metaAdsConectado,
  ] = await Promise.all([
    countClientesEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    countClientesEnRango(usuarioId, anterior.desde, anterior.hasta, flujoId, conexionWhatsappId),
    countConversacionesEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    countConversacionesEnRango(
      usuarioId,
      anterior.desde,
      anterior.hasta,
      flujoId,
      conexionWhatsappId
    ),
    countMensajesEnRango(
      usuarioId,
      rango.desde,
      rango.hasta,
      flujoId,
      conexionWhatsappId,
      "saliente"
    ),
    countMensajesEnRango(
      usuarioId,
      rango.desde,
      rango.hasta,
      flujoId,
      conexionWhatsappId,
      "entrante"
    ),
    countRespuestasEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    countConversionesEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    countConversionesEnRango(
      usuarioId,
      anterior.desde,
      anterior.hasta,
      flujoId,
      conexionWhatsappId
    ),
    sumIngresosConversionesEnRango(
      usuarioId,
      rango.desde,
      rango.hasta,
      flujoId,
      conexionWhatsappId
    ),
    countSeguimientosPorEstadoEnRango(
      usuarioId,
      rango.desde,
      rango.hasta,
      flujoId,
      conexionWhatsappId
    ),
    checkMetaAdsConectado(usuarioId),
  ]);

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
    tendenciaLeads: calcTendencia(leads, leadsAnt),
    tendenciaConversaciones: calcTendencia(conversaciones, conversacionesAnt),
    tendenciaVentas: calcTendencia(ventas, ventasAnt),
  };

  const salud = computeSalud({ ...kpis, seguimientosActivos: segEstados.pendiente });

  return {
    rango,
    flujoId,
    kpis,
    salud,
    metaAdsConectado,
    _ant: {
      leads: leadsAnt,
      conversaciones: conversacionesAnt,
      ventas: ventasAnt,
    },
  };
}

function computeResumenFromBase(base) {
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

async function computeResumen(usuarioId, query) {
  const base = await loadResumenBase(usuarioId, query);
  return computeResumenFromBase(base);
}

function computeFunnelFromBase(base) {
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

async function computeFunnel(usuarioId, query) {
  return computeFunnelFromBase(await resolveMetricasBase(usuarioId, query));
}

function computeSeriesFromBase(base) {
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

async function computeSeries(usuarioId, query) {
  return computeSeriesFromBase(await resolveMetricasBase(usuarioId, query));
}

function computeFlujosFromBase(base) {
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

async function computeFlujos(usuarioId, query) {
  return computeFlujosFromBase(await resolveMetricasBase(usuarioId, query));
}

function computeDiagnosticoFromBase(base) {
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

async function computeDiagnostico(usuarioId, query) {
  return computeDiagnosticoFromBase(await resolveMetricasBase(usuarioId, query));
}

function computeHeatmapFromBase(base) {
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

async function computeHeatmap(usuarioId, query) {
  return computeHeatmapFromBase(await resolveMetricasBase(usuarioId, query));
}

module.exports = {
  parseRango,
  rangoAnterior,
  computeResumen,
  computeFunnel,
  computeSeries,
  computeFlujos,
  computeDiagnostico,
  computeHeatmap,
  computeRevenueBreakdown,
  fetchFlujosList,
  fetchFlujosListMetricas,
};
