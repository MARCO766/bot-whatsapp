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

/**
 * Tamaño pedido a PostgREST. Una página de este tamaño sigue,
 * también cuando el total es *. Una más corta con inicio-fin/* y
 * tantas filas como anuncia el rango es el final: no se pide otra.
 * Un total numérico sigue hasta cubrirlo. No se sube ningún timeout.
 */
const PAGINA_FILAS_METRICAS = 1000;
/** Tope de seguridad contra un Range ignorado. No publica las filas leídas. */
const PAGINAS_MAX_METRICAS = 2000;

function contentRangeDe(resHeaders) {
  if (!resHeaders) return "";
  return String(resHeaders["content-range"] || resHeaders["Content-Range"] || "").trim();
}

/**
 * id es la clave primaria en mensajes (select=id ya usado en los conteos),
 * seguimientos_programados, crm_conversiones e ia_sessions.
 * creado_en no es único. El mismo order=id.asc va en todas las páginas.
 */
const ORDEN_PAGINACION_METRICAS = {
  mensajes: "id.asc",
  seguimientos_programados: "id.asc",
  crm_conversiones: "id.asc",
  ia_sessions: "id.asc",
};

function filtroConOrdenEstable(table, filterQuery) {
  const orden = ORDEN_PAGINACION_METRICAS[table];
  if (!orden) return null;
  const partes = String(filterQuery || "")
    .replace(/^[?&]/, "")
    .split("&")
    .filter((parte) => parte && !parte.startsWith("order="));
  partes.push(`order=${orden}`);
  return partes.join("&");
}

function selectConId(selectFields) {
  const partes = String(selectFields || "*")
    .split(",")
    .map((campo) => campo.trim())
    .filter(Boolean);
  if (partes.includes("*") || partes.includes("id")) return partes.join(",");
  return ["id", ...partes].join(",");
}

/**
 * Formatos aceptados: inicio-fin/total, inicio-fin con total desconocido,
 * o estrella/0 para un conjunto vacío. estrella/N con filas no describe un rango.
 */
function parseContentRangeMetricas(contentRange) {
  const raw = String(contentRange || "").trim();
  if (!raw) return { ok: false };
  const estrella = raw.match(/^\*\/(\*|\d+)$/);
  if (estrella) {
    if (estrella[1] === "*") return { ok: false };
    const total = Number(estrella[1]);
    if (!Number.isInteger(total) || total < 0) return { ok: false };
    return { ok: true, vacio: true, total };
  }
  const match = raw.match(/^(\d+)-(\d+)\/(\*|\d+)$/);
  if (!match) return { ok: false };
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return { ok: false };
  if (match[3] === "*") return { ok: true, vacio: false, start, end, total: null };
  const total = Number(match[3]);
  if (!Number.isInteger(total) || total < 0 || end >= total) return { ok: false };
  return { ok: true, vacio: false, start, end, total };
}

function lecturaCompleta(filas) {
  return { completo: true, filas, motivo: null };
}

function lecturaIncompleta(motivo) {
  return { completo: false, filas: null, motivo };
}

function idDeFila(fila) {
  if (!fila || typeof fila !== "object" || Array.isArray(fila)) return "";
  if (fila.id == null) return "";
  const id = String(fila.id).trim();
  return id;
}

/**
 * PGRST205 y 42P01 dicen que la relación no está.
 * Un 404 suelto, una columna ausente, un permiso o un timeout no lo son.
 */
function crmConversionesTablaInexistente(err) {
  const code = String(err?.response?.data?.code || "");
  const msg = errorMessage(err).toLowerCase();
  if (code === "42703" || code === "PGRST204" || msg.includes("column")) return false;
  if (code === "PGRST205" || code === "42P01") return true;
  if (msg.includes("could not find the table")) return true;
  if (msg.includes("relation") && msg.includes("does not exist")) return true;
  return false;
}

function reunirPaginas(lotes, tamano = PAGINA_FILAS_METRICAS) {
  if (!Array.isArray(lotes)) return { completo: false, filas: null, motivo: "error" };
  const filas = [];
  for (const lote of lotes) {
    if (!Array.isArray(lote) || lote.length > tamano) {
      return { completo: false, filas: null, motivo: "error" };
    }
    if (lote.length === 0) return { completo: true, filas, motivo: null };
    filas.push(...lote);
    if (lote.length < tamano) return { completo: true, filas, motivo: null };
  }
  return { completo: false, filas: null, motivo: "incompleto" };
}

function rechazarLecturaIncompleta(tabla) {
  const error = new Error(
    `[metricas] lectura de ${tabla} fallida o incompleta. No se publica un conteo parcial ni un cero por error.`
  );
  error.code = "METRICAS_LECTURA_INCOMPLETA";
  throw error;
}

/**
 * 416 cierra solo si el total anunciado ya se cubrió, si el primer rango
 * no tiene filas, o si las páginas anteriores fueron contiguas y nadie
 * anunció un total todavía pendiente. Un total a medio cubrir se rechaza.
 */
function cerrarCon416(responseHeaders, offset, filas, totalAnunciado) {
  if (filas.length !== offset) return lecturaIncompleta("error");
  const cr = parseContentRangeMetricas(contentRangeDe(responseHeaders));
  if (cr.ok && cr.vacio) {
    if (cr.total === 0) {
      if (offset === 0 && filas.length === 0) return lecturaCompleta([]);
      return lecturaIncompleta("error");
    }
    if (offset >= cr.total && filas.length === cr.total) {
      if (totalAnunciado != null && totalAnunciado !== cr.total) return lecturaIncompleta("error");
      return lecturaCompleta(filas);
    }
    return lecturaIncompleta("error");
  }
  if (cr.ok && !cr.vacio) return lecturaIncompleta("error");
  if (offset === 0 && filas.length === 0) return lecturaCompleta([]);
  if (totalAnunciado != null && offset >= totalAnunciado && filas.length === totalAnunciado) {
    return lecturaCompleta(filas);
  }
  if (totalAnunciado != null) return lecturaIncompleta("error");
  if (offset > 0) return lecturaCompleta(filas);
  return lecturaIncompleta("error");
}

/**
 * Cada página tiene que empezar en el offset pedido y traer tantas filas
 * como anuncia Content-Range. Un hueco, un solape, un id repetido o un
 * total sin cubrir descarta lo ya leído. A las 2.000 páginas también.
 */
async function supabaseSelectCompleto(table, filterQuery, selectFields = "*") {
  const filtro = filtroConOrdenEstable(table, filterQuery);
  if (!filtro) return lecturaIncompleta("error");
  const campos = selectConId(selectFields);
  const filas = [];
  const ids = new Set();
  let offset = 0;
  let totalAnunciado = null;
  for (let pagina = 0; pagina < PAGINAS_MAX_METRICAS; pagina += 1) {
    const hasta = offset + PAGINA_FILAS_METRICAS - 1;
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(campos)}&${filtro}`;
    let res;
    try {
      res = await axios.get(url, {
        headers: headers({ Range: `${offset}-${hasta}` }),
      });
    } catch (e) {
      if (e.response?.status === 416) {
        return cerrarCon416(e.response.headers, offset, filas, totalAnunciado);
      }
      if (
        table === "crm_conversiones" &&
        offset === 0 &&
        filas.length === 0 &&
        crmConversionesTablaInexistente(e)
      ) {
        logSchemaFallback(table, e);
        return lecturaCompleta([]);
      }
      console.log(`[metricas] select ${table}:`, e.response?.data || e.message);
      return lecturaIncompleta("error");
    }
    const lote = res.data;
    if (!Array.isArray(lote)) return lecturaIncompleta("error");
    const cr = parseContentRangeMetricas(contentRangeDe(res.headers));
    if (!cr.ok) return lecturaIncompleta("error");
    if (lote.length === 0) {
      if (!cr.vacio) return lecturaIncompleta("error");
      if (cr.total === 0) {
        if (offset === 0 && filas.length === 0) return lecturaCompleta([]);
        return lecturaIncompleta("error");
      }
      if (filas.length !== offset) return lecturaIncompleta("error");
      if (totalAnunciado != null && totalAnunciado !== cr.total) return lecturaIncompleta("error");
      if (offset === cr.total && filas.length === cr.total) return lecturaCompleta(filas);
      return lecturaIncompleta("error");
    }
    if (cr.vacio) return lecturaIncompleta("error");
    if (cr.start !== offset) return lecturaIncompleta("error");
    const anunciadas = cr.end - cr.start + 1;
    if (lote.length !== anunciadas) return lecturaIncompleta("error");
    if (cr.total != null && totalAnunciado != null && cr.total !== totalAnunciado) {
      return lecturaIncompleta("error");
    }
    if (cr.total != null) totalAnunciado = cr.total;
    if (totalAnunciado != null && cr.end >= totalAnunciado) return lecturaIncompleta("error");
    for (const fila of lote) {
      const id = idDeFila(fila);
      if (!id || ids.has(id)) return lecturaIncompleta("error");
      ids.add(id);
    }
    filas.push(...lote);
    const siguiente = cr.end + 1;
    if (filas.length !== siguiente) return lecturaIncompleta("error");
    if (totalAnunciado != null && siguiente === totalAnunciado) return lecturaCompleta(filas);
    if (totalAnunciado != null && siguiente > totalAnunciado) return lecturaIncompleta("error");
    if (
      totalAnunciado == null &&
      lote.length < PAGINA_FILAS_METRICAS &&
      lote.length === anunciadas
    ) {
      return lecturaCompleta(filas);
    }
    offset = siguiente;
  }
  console.log(
    `[metricas] ${table} no cerró la lectura tras ${PAGINAS_MAX_METRICAS} páginas. No se publica un parcial.`
  );
  return lecturaIncompleta("incompleto");
}

function distintosDeFilas(filas, { soloEntrantes = false } = {}) {
  const vistos = new Set();
  (filas || []).forEach((fila) => {
    if (soloEntrantes && fila?.direccion !== "entrante") return;
    if (!telefonoCuentaParaDistinto(fila?.cliente_numero)) return;
    vistos.add(fila.cliente_numero);
  });
  return vistos.size;
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

function cuerpoRpcJson(data) {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

/**
 * Lectura de RPC que conserva el JSON completo (objeto, lista o número).
 * Serie y diagnóstico la usan solo con METRICAS_RPC_SERIES_DIAGNOSTICO=1.
 * metricas_resumen_conteos la usa solo con METRICAS_RPC_RESUMEN_CONTEOS=1.
 * Sin esas variables, ninguna ruta la llama. supabaseRpc sigue siendo el lector numérico.
 * null = la función no está en la base.
 */
async function supabaseRpcJson(functionName, params) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;
  try {
    const res = await axios.post(url, params, {
      headers: headers({ "Content-Type": "application/json" }),
    });
    return cuerpoRpcJson(res.data);
  } catch (e) {
    if (isSchemaMissingError(e)) {
      logSchemaFallback(`rpc/${functionName}`, e);
      return null;
    }
    const detail = errorMessage(e) || e.message;
    throw new Error(`[metricas] RPC ${functionName} falló: ${detail}`);
  }
}

/**
 * Apagada salvo METRICAS_RPC_RESUMEN_CONTEOS=1.
 * El resumen de producción no llama a metricas_resumen_conteos.
 * Si la RPC falta, falla, hace timeout o devuelve una fila incompleta,
 * se usa el cálculo anterior. Ese fallo no se convierte en cero.
 */
function metricasRpcResumenConteosActiva() {
  return String(process.env.METRICAS_RPC_RESUMEN_CONTEOS || "").trim() === "1";
}

const CAMPOS_FILA_RESUMEN_CONTEOS = [
  "salientes",
  "entrantes",
  "respuestas",
  "clientes_con_mensaje",
  "conversaciones",
  "conversaciones_anterior",
];

function normalizarIdConexion(id) {
  if (id == null) return "";
  return String(id).trim().toLowerCase();
}

function enteroConteo(valor) {
  if (typeof valor === "boolean" || valor == null) return null;
  if (typeof valor === "string" && valor.trim() === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

/** null y '' no entran en un distinto. Un espacio sí entra, igual que el filtro JS. */
function telefonoCuentaParaDistinto(numero) {
  return numero != null && numero !== "";
}

/** Extremos inclusivos: creado_en >= desde y creado_en <= hasta. */
function instanteEnRangoInclusivo(iso, desdeIso, hastaIso) {
  const t = new Date(iso).getTime();
  const desde = new Date(desdeIso).getTime();
  const hasta = new Date(hastaIso).getTime();
  if (![t, desde, hasta].every(Number.isFinite)) return false;
  return t >= desde && t <= hasta;
}

/**
 * Misma regla que metricas_resumen_conteos.
 * Con flujo, conversaciones es el distinto de mensajes.
 * Sin flujo, un conteo de tabla mayor que cero gana; cero usa el distinto.
 */
function conversacionesSegunRegla(flujoActivo, conteoTabla, clientesConMensaje) {
  if (flujoActivo) return clientesConMensaje;
  if (Number(conteoTabla) > 0) return conteoTabla;
  return clientesConMensaje;
}

/**
 * Referencia en memoria de una fila de metricas_resumen_conteos.
 * flujoNumeros null: sin filtro de flujo. Un Set o array, aunque esté vacío, sí filtra.
 */
function simularConteoLinea(mensajes, conversaciones, params) {
  const flujo =
    params.flujoNumeros == null ? null : new Set(params.flujoNumeros);
  const deLinea = (desdeIso, hastaIso) =>
    (mensajes || []).filter(
      (m) =>
        m.usuario_id === params.usuarioId &&
        m.conexion_whatsapp_id === params.conexionId &&
        instanteEnRangoInclusivo(m.creado_en, desdeIso, hastaIso) &&
        (flujo == null || flujo.has(m.cliente_numero))
    );
  const distintosSi = (rows, pred) => {
    const vistos = new Set();
    rows.forEach((m) => {
      if (!pred(m) || !telefonoCuentaParaDistinto(m.cliente_numero)) return;
      vistos.add(m.cliente_numero);
    });
    return vistos.size;
  };
  const contarTabla = (desdeIso, hastaIso) =>
    (conversaciones || []).filter(
      (c) =>
        c.usuario_id === params.usuarioId &&
        c.conexion_whatsapp_id === params.conexionId &&
        instanteEnRangoInclusivo(c.creado_en, desdeIso, hastaIso)
    ).length;
  const actual = deLinea(params.desde, params.hasta);
  const clientes = distintosSi(actual, () => true);
  const hayAnterior = params.desdeAnterior && params.hastaAnterior;
  const anterior = hayAnterior ? deLinea(params.desdeAnterior, params.hastaAnterior) : [];
  const clientesAnterior = distintosSi(anterior, () => true);
  return {
    conexion_whatsapp_id: params.conexionId,
    salientes: actual.filter((m) => m.direccion === "saliente").length,
    entrantes: actual.filter((m) => m.direccion === "entrante").length,
    respuestas: distintosSi(actual, (m) => m.direccion === "entrante"),
    clientes_con_mensaje: clientes,
    conversaciones: conversacionesSegunRegla(
      flujo != null,
      contarTabla(params.desde, params.hasta),
      clientes
    ),
    conversaciones_anterior: hayAnterior
      ? conversacionesSegunRegla(
          flujo != null,
          contarTabla(params.desdeAnterior, params.hastaAnterior),
          clientesAnterior
        )
      : 0,
  };
}

function filasResumenConteosPorConexion(filas, conexionIds) {
  if (!Array.isArray(filas)) return null;
  const pedidos = [
    ...new Set((conexionIds || []).map(normalizarIdConexion).filter(Boolean)),
  ];
  if (!pedidos.length) return null;
  const mapa = new Map();
  for (const fila of filas) {
    if (!fila || typeof fila !== "object" || Array.isArray(fila)) return null;
    const id = normalizarIdConexion(fila.conexion_whatsapp_id);
    if (!id || mapa.has(id)) return null;
    const normalizada = { conexion_whatsapp_id: id };
    for (const campo of CAMPOS_FILA_RESUMEN_CONTEOS) {
      const n = enteroConteo(fila[campo]);
      if (n == null) return null;
      normalizada[campo] = n;
    }
    mapa.set(id, normalizada);
  }
  for (const id of pedidos) {
    if (!mapa.has(id)) return null;
  }
  return mapa;
}

function sumarFilasResumenConteos(mapa, conexionIds) {
  const ids = [
    ...new Set((conexionIds || []).map(normalizarIdConexion).filter(Boolean)),
  ];
  if (!mapa || !ids.length) return null;
  const suma = {
    salientes: 0,
    entrantes: 0,
    respuestas: 0,
    conversaciones: 0,
    conversacionesAnterior: 0,
  };
  for (const id of ids) {
    const fila = mapa.get(id);
    if (!fila) return null;
    suma.salientes += fila.salientes;
    suma.entrantes += fila.entrantes;
    suma.respuestas += fila.respuestas;
    suma.conversaciones += fila.conversaciones;
    suma.conversacionesAnterior += fila.conversaciones_anterior;
  }
  return suma;
}

/**
 * null: bandera apagada, RPC ausente, error, timeout o filas incompletas.
 * El llamador sigue con countMensajesEnRango, countRespuestasEnRango
 * y countConversacionesEnRango. No rellena esos indicadores con cero.
 */
async function leerResumenConteosONull(usuarioId, conexionIds, rango, anterior, flujoId) {
  if (!metricasRpcResumenConteosActiva()) return null;
  const ids = [
    ...new Set((conexionIds || []).map(normalizarIdConexion).filter(Boolean)),
  ];
  if (!usuarioId || !ids.length || !rango?.desde || !rango?.hasta) return null;
  let data;
  try {
    data = await supabaseRpcJson("metricas_resumen_conteos", {
      p_usuario_id: usuarioId,
      p_conexiones: ids,
      p_desde: rango.desde,
      p_hasta: rango.hasta,
      p_desde_anterior: anterior?.desde || null,
      p_hasta_anterior: anterior?.hasta || null,
      p_flujo_id: flujoId || null,
    });
  } catch (e) {
    console.log(
      `[metricas] metricas_resumen_conteos falló: ${errorMessage(e) || e.message}. Se usa el cálculo actual.`
    );
    return null;
  }
  if (data == null) return null;
  const mapa = filasResumenConteosPorConexion(data, ids);
  if (!mapa) {
    console.log("[metricas] metricas_resumen_conteos incompleta. Se usa el cálculo actual.");
    return null;
  }
  return mapa;
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

async function fetchClientesEnRango(
  usuarioId,
  desdeIso,
  hastaIso,
  flujoId,
  conexionWhatsappId = null
) {
  let filter = `${buildUsuarioFilter(usuarioId)}&${buildDateFilter(desdeIso, hastaIso)}&estado=neq.bloqueado`;
  const rows = await supabaseSelect("clientes", filter, "id,numero,creado_en");
  if (!Array.isArray(rows)) rechazarLecturaIncompleta("clientes");

  if (!flujoId) {
    if (!buildConexionFilter(conexionWhatsappId)) return rows;
    const numerosLinea = await fetchNumerosEnLinea(usuarioId, conexionWhatsappId);
    if (!numerosLinea?.length) return [];
    const lineaSet = new Set(numerosLinea);
    return rows.filter((c) => lineaSet.has(c.numero));
  }

  const numeros = new Set(
    await fetchFlujoClienteNumeros(usuarioId, flujoId, conexionWhatsappId)
  );
  if (!numeros.size) return [];
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

  if (flujoId) {
    const numeros = await fetchFlujoClienteNumeros(usuarioId, flujoId, conexionWhatsappId);
    if (!numeros.length) return 0;

    let total = 0;
    for (let i = 0; i < numeros.length; i += 80) {
      const chunk = numeros.slice(i, i + 80);
      const inList = chunk.map((n) => encodeURIComponent(n)).join(",");
      const n = await supabaseCount("clientes", `${baseFilter}&numero=in.(${inList})`);
      if (n === null) rechazarLecturaIncompleta("clientes");
      total += n;
    }
    return total;
  }

  if (buildConexionFilter(conexionWhatsappId)) {
    const connId = String(conexionWhatsappId).trim();
    const rpcParams = {
      p_usuario_id: usuarioId,
      p_conexion_whatsapp_id: connId,
      p_desde: desdeIso,
      p_hasta: hastaIso,
    };

    const total = await supabaseRpc("count_leads_por_linea", rpcParams);
    if (total === null) {
      throw new Error(
        "[metricas] RPC count_leads_por_linea no disponible. " +
          "Ejecuta supabase/migrations/create_count_leads_por_linea_rpc.sql en Supabase."
      );
    }
    return total;
  }

  const total = await supabaseCount("clientes", baseFilter);
  return total ?? 0;
}

/**
 * Números de un flujo durante una carga de Métricas.
 * La clave sigue el mismo criterio que buildConexionFilter: null, vacío y
 * «Todas las líneas» comparten el alcance sin filtro; un id de línea no.
 * El resultado solo se reutiliza mientras loadResumenBase o loadMetricasBase
 * siguen en curso. Al terminar se borra, así un filtro nuevo no hereda números viejos.
 */
const flujoNumerosInflight = new Map();
const flujoNumerosMemo = new Map();
const flujoNumerosRetain = new Map();

function flujoNumerosCacheKey(usuarioId, flujoId, conexionWhatsappId) {
  const filtro = buildConexionFilter(conexionWhatsappId);
  const conexion = filtro
    ? decodeURIComponent(filtro.slice("&conexion_whatsapp_id=eq.".length))
    : "";
  return JSON.stringify({
    u: String(usuarioId),
    f: String(flujoId),
    c: conexion,
  });
}

function retainFlujoClienteNumeros(usuarioId, flujoId, conexionWhatsappId) {
  if (!flujoId) return () => {};
  let key;
  try {
    key = flujoNumerosCacheKey(usuarioId, flujoId, conexionWhatsappId);
    flujoNumerosRetain.set(key, (flujoNumerosRetain.get(key) || 0) + 1);
  } catch (err) {
    console.log("[metricas] retain numeros flujo:", err.message);
    return () => {};
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      const left = (flujoNumerosRetain.get(key) || 1) - 1;
      if (left <= 0) {
        flujoNumerosRetain.delete(key);
        flujoNumerosMemo.delete(key);
      } else {
        flujoNumerosRetain.set(key, left);
      }
    } catch (err) {
      console.log("[metricas] release numeros flujo:", err.message);
    }
  };
}

/** Misma unión de siempre. complete=false si alguna tabla falló: ese resultado no se guarda. */
async function queryFlujoClienteNumeros(usuarioId, flujoId, conexionWhatsappId) {
  const base = buildUsuarioFilter(usuarioId);
  const flujoF = `&flujo_id=eq.${encodeURIComponent(flujoId)}`;
  const connF = buildConexionFilter(conexionWhatsappId);
  const numeros = new Set();

  const lecturas = await Promise.all([
    supabaseSelectCompleto(
      "seguimientos_programados",
      `${base}${flujoF}${connF}`,
      "cliente_numero"
    ),
    supabaseSelectCompleto("crm_conversiones", `${base}${flujoF}${connF}`, "cliente_numero"),
    supabaseSelectCompleto("ia_sessions", `${base}${flujoF}${connF}`, "cliente_numero"),
  ]);

  if (lecturas.some((resultado) => !resultado?.completo || !Array.isArray(resultado.filas))) {
    return { numeros: null, complete: false, paginacionIncompleta: true };
  }

  lecturas.forEach((resultado) => {
    resultado.filas.forEach((r) => {
      if (r?.cliente_numero) numeros.add(r.cliente_numero);
    });
  });

  return { numeros: [...numeros], complete: true, paginacionIncompleta: false };
}

async function leerFlujoClienteNumeros(usuarioId, flujoId, conexionWhatsappId) {
  const key = flujoNumerosCacheKey(usuarioId, flujoId, conexionWhatsappId);
  if ((flujoNumerosRetain.get(key) || 0) > 0) {
    const memo = flujoNumerosMemo.get(key);
    if (memo?.complete && Array.isArray(memo.numeros)) return memo;
  }

  const existing = flujoNumerosInflight.get(key);
  if (existing) return existing;

  const promise = queryFlujoClienteNumeros(usuarioId, flujoId, conexionWhatsappId)
    .then(({ numeros, complete }) => {
      if (!complete || !Array.isArray(numeros)) {
        rechazarLecturaIncompleta("números de flujo");
      }
      const estado = {
        numeros,
        paginacionIncompleta: false,
        complete: true,
      };
      try {
        if ((flujoNumerosRetain.get(key) || 0) > 0) {
          flujoNumerosMemo.set(key, estado);
        }
      } catch (err) {
        console.log("[metricas] memo numeros flujo:", err.message);
      }
      return estado;
    })
    .finally(() => {
      try {
        if (flujoNumerosInflight.get(key) === promise) flujoNumerosInflight.delete(key);
      } catch (err) {
        console.log("[metricas] inflight numeros flujo:", err.message);
      }
    });

  try {
    flujoNumerosInflight.set(key, promise);
  } catch (err) {
    console.log("[metricas] cache numeros flujo:", err.message);
  }
  return promise;
}

/** Números de lead asociados a un flujo (misma fuente que ventas: seguimientos + conversiones + sesiones IA). */
async function estadoNumerosDeFlujo(usuarioId, flujoId, conexionWhatsappId = null) {
  if (!flujoId) return { numeros: [], paginacionIncompleta: false, complete: true };
  try {
    const estado = await leerFlujoClienteNumeros(usuarioId, flujoId, conexionWhatsappId);
    if (!estado?.complete || !Array.isArray(estado.numeros)) {
      rechazarLecturaIncompleta("números de flujo");
    }
    return estado;
  } catch (err) {
    if (err?.code === "METRICAS_LECTURA_INCOMPLETA") throw err;
    console.log("[metricas] cache numeros flujo, consulta directa:", err.message);
    const directo = await queryFlujoClienteNumeros(usuarioId, flujoId, conexionWhatsappId);
    if (!directo.complete || !Array.isArray(directo.numeros)) {
      rechazarLecturaIncompleta("números de flujo");
    }
    return {
      numeros: directo.numeros,
      paginacionIncompleta: false,
      complete: true,
    };
  }
}

async function fetchFlujoClienteNumeros(usuarioId, flujoId, conexionWhatsappId = null) {
  if (!flujoId) return [];
  const estado = await estadoNumerosDeFlujo(usuarioId, flujoId, conexionWhatsappId);
  if (!estado?.complete || !Array.isArray(estado.numeros)) {
    rechazarLecturaIncompleta("números de flujo");
  }
  return estado.numeros.slice();
}

function numerosDeFlujoParaConteo(estado) {
  if (!estado?.complete || estado.paginacionIncompleta || !Array.isArray(estado.numeros)) {
    rechazarLecturaIncompleta("números de flujo");
  }
  return estado.numeros;
}

/** Números con conversación/mensaje en una línea WhatsApp. */
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
    if (total === null) rechazarLecturaIncompleta("mensajes");
    return total;
  }

  const numeros = numerosDeFlujoParaConteo(
    await estadoNumerosDeFlujo(usuarioId, flujoId, conexionWhatsappId)
  );
  if (!numeros.length) return 0;

  let total = 0;
  for (let i = 0; i < numeros.length; i += 80) {
    const chunk = numeros.slice(i, i + 80);
    const inList = chunk.map((n) => encodeURIComponent(n)).join(",");
    const n = await supabaseCount("mensajes", `${baseFilter}${dirF}&cliente_numero=in.(${inList})`);
    if (n === null) rechazarLecturaIncompleta("mensajes");
    total += n;
  }
  return total;
}

async function filasMensajeCompletas(filter) {
  const resultado = await supabaseSelectCompleto("mensajes", filter, "cliente_numero");
  if (!resultado?.completo || !Array.isArray(resultado.filas)) {
    rechazarLecturaIncompleta("mensajes");
  }
  return resultado.filas;
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
    return distintosDeFilas(await filasMensajeCompletas(baseFilter));
  }

  const numeros = numerosDeFlujoParaConteo(
    await estadoNumerosDeFlujo(usuarioId, flujoId, conexionWhatsappId)
  );
  if (!numeros.length) return 0;

  const seen = new Set();
  for (let i = 0; i < numeros.length; i += 80) {
    const chunk = numeros.slice(i, i + 80);
    const inList = chunk.map((n) => encodeURIComponent(n)).join(",");
    const rows = await filasMensajeCompletas(`${baseFilter}&cliente_numero=in.(${inList})`);
    rows.forEach((r) => {
      if (telefonoCuentaParaDistinto(r.cliente_numero)) seen.add(r.cliente_numero);
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
    return distintosDeFilas(await filasMensajeCompletas(baseFilter));
  }

  const numeros = numerosDeFlujoParaConteo(
    await estadoNumerosDeFlujo(usuarioId, flujoId, conexionWhatsappId)
  );
  if (!numeros.length) return 0;

  const seen = new Set();
  for (let i = 0; i < numeros.length; i += 80) {
    const chunk = numeros.slice(i, i + 80);
    const inList = chunk.map((n) => encodeURIComponent(n)).join(",");
    const rows = await filasMensajeCompletas(`${baseFilter}&cliente_numero=in.(${inList})`);
    rows.forEach((r) => {
      if (telefonoCuentaParaDistinto(r.cliente_numero)) seen.add(r.cliente_numero);
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

function buildConexionInFilter(ids) {
  const list = ids.map((id) => encodeURIComponent(String(id))).join(",");
  return `&conexion_whatsapp_id=in.(${list})`;
}

async function sumarMensajesPorLinea(usuarioId, desdeIso, hastaIso, ids, direccion) {
  const partes = await Promise.all(
    ids.map((id) =>
      countMensajesEnRango(usuarioId, desdeIso, hastaIso, null, id, direccion)
    )
  );
  return partes.reduce((total, n) => total + (Number(n) || 0), 0);
}

async function countConversionesEnLineas(usuarioId, desdeIso, hastaIso, ids) {
  const filter = `${buildUsuarioFilter(usuarioId)}${buildConexionInFilter(ids)}&${buildDateFilter(desdeIso, hastaIso)}`;
  const total = await supabaseCount("crm_conversiones", filter);
  return total ?? 0;
}

async function countSeguimientosPorEstadoEnLineas(usuarioId, desdeIso, hastaIso, ids) {
  const agrupado = `${buildUsuarioFilter(usuarioId)}${buildConexionInFilter(ids)}&${buildDateFilter(desdeIso, hastaIso)}`;
  const estados = ["pendiente", "enviado", "cancelado", "respondido"];
  const counts = { pendiente: 0, enviado: 0, cancelado: 0, respondido: 0 };

  await Promise.all(
    estados.map(async (est) => {
      const n = await supabaseCount("seguimientos_programados", `${agrupado}&estado=eq.${est}`);
      // null: el agrupado falló. El cero es un conteo válido y no se reemplaza.
      if (n !== null) {
        counts[est] = n;
        return;
      }
      const partes = await Promise.all(
        ids.map((id) =>
          supabaseCount(
            "seguimientos_programados",
            `${buildUsuarioFilter(usuarioId)}${buildConexionFilter(id)}&${buildDateFilter(desdeIso, hastaIso)}&estado=eq.${est}`
          )
        )
      );
      counts[est] = partes.reduce((total, parte) => total + (parte ?? 0), 0);
    })
  );

  return counts;
}

/**
 * La misma lectura de valor y moneda que el resumen por línea.
 * Prefer: count=exact cambia el orden de esas filas y, con ello, la moneda principal.
 * Si la página no viene llena, el número de filas es el conteo exacto.
 * Si viene llena, un HEAD evita contar de menos sin tocar el orden.
 */
async function ventasEIngresosLinea(usuarioId, desdeIso, hastaIso, conexionWhatsappId) {
  const filter = `${buildUsuarioFilter(usuarioId)}${buildConexionFilter(conexionWhatsappId)}&${buildDateFilter(desdeIso, hastaIso)}`;
  const limit = 50000;
  const rows = await supabaseSelect("crm_conversiones", filter, "valor,moneda", limit);
  if (!Array.isArray(rows)) {
    return { ventas: 0, ingresos: { monto: 0, moneda: "BOB", desglose: {} } };
  }
  const ingresos = sumarIngresos(rows);
  const paginaLlena = rows.length >= limit || rows.length >= 1000;
  if (!paginaLlena) return { ventas: rows.length, ingresos };
  const ventas = (await supabaseCount("crm_conversiones", filter)) ?? 0;
  return { ventas, ingresos };
}

async function fetchMensajesEnRango(usuarioId, desdeIso, hastaIso, flujoId, conexionWhatsappId = null) {
  let filter = `${buildUsuarioFilter(usuarioId)}${buildConexionFilter(conexionWhatsappId)}&${buildDateFilter(desdeIso, hastaIso)}`;
  const rows = await supabaseSelect(
    "mensajes",
    `${filter}&order=creado_en.asc`,
    "id,cliente_numero,direccion,creado_en"
  );
  if (!Array.isArray(rows)) return [];

  if (!flujoId) return rows;

  const numeros = new Set(
    await fetchFlujoClienteNumeros(usuarioId, flujoId, conexionWhatsappId)
  );
  if (!numeros.size) return [];
  return rows.filter((m) => numeros.has(m.cliente_numero));
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
  const flujoId = query.flujo_id || query.flujoId || null;
  const conexionWhatsappId =
    query.conexion_whatsapp_id ?? query.conexionWhatsappId ?? null;
  const releaseNumeros = retainFlujoClienteNumeros(
    usuarioId,
    flujoId,
    conexionWhatsappId
  );
  try {
    return await loadMetricasBaseEnCurso(usuarioId, query);
  } finally {
    releaseNumeros();
  }
}

async function loadMetricasBaseEnCurso(usuarioId, query = {}) {
  const rango = parseRango(query);
  const flujoId = query.flujo_id || query.flujoId || null;
  const conexionWhatsappId =
    query.conexion_whatsapp_id ?? query.conexionWhatsappId ?? null;
  logMetricasMulti(conexionWhatsappId, "loadMetricasBase");
  const anterior = rangoAnterior(rango.desde, rango.hasta, rango.periodo);

  const conteosPromise = isResumenTodasLasLineas(conexionWhatsappId)
    ? Promise.resolve(null)
    : leerResumenConteosONull(
        usuarioId,
        [conexionWhatsappId],
        rango,
        anterior,
        flujoId
      );

  const [clientes, mensajes, conversiones, seguimientos, flujos, metaAdsConectado, conteosMap] =
    await Promise.all([
    fetchClientesEnRango(
      usuarioId,
      rango.desde,
      rango.hasta,
      flujoId,
      conexionWhatsappId
    ),
    fetchMensajesEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    fetchConversionesEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    fetchSeguimientosEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    fetchFlujosListMetricas(usuarioId),
    checkMetaAdsConectado(usuarioId),
    conteosPromise,
  ]);

  const filaConteo =
    conteosMap && conteosMap.get(normalizarIdConexion(conexionWhatsappId));

  const [clientesAnt, conversionesAnt, conteosLinea] = await Promise.all([
    fetchClientesEnRango(
      usuarioId,
      anterior.desde,
      anterior.hasta,
      flujoId,
      conexionWhatsappId
    ),
    fetchConversionesEnRango(usuarioId, anterior.desde, anterior.hasta, flujoId, conexionWhatsappId),
    filaConteo
      ? Promise.resolve(null)
      : Promise.all([
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
          countRespuestasEnRango(
            usuarioId,
            rango.desde,
            rango.hasta,
            flujoId,
            conexionWhatsappId
          ),
          countConversacionesEnRango(
            usuarioId,
            rango.desde,
            rango.hasta,
            flujoId,
            conexionWhatsappId
          ),
          countConversacionesEnRango(
            usuarioId,
            anterior.desde,
            anterior.hasta,
            flujoId,
            conexionWhatsappId
          ),
        ]),
  ]);

  const salientes = filaConteo ? filaConteo.salientes : conteosLinea[0];
  const entrantes = filaConteo ? filaConteo.entrantes : conteosLinea[1];
  const respuestas = filaConteo ? filaConteo.respuestas : conteosLinea[2];
  const conversaciones = filaConteo ? filaConteo.conversaciones : conteosLinea[3];
  const conversacionesAnt = filaConteo
    ? filaConteo.conversaciones_anterior
    : conteosLinea[4];
  const segEstados = countSeguimientosPorEstado(seguimientos);
  const ingresos = sumarIngresos(conversiones);

  const leads = clientes.length;
  const ventas = conversiones.length;
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

/**
 * Todas las líneas con flujo no llama a la RPC. La suma por conexión no
 * equivale al distinto global que siguen usando embudo y diagnóstico.
 */
async function loadResumenTodasPorFanout(usuarioId, query, ids) {
  const [metaAdsConectado, bases] = await Promise.all([
    checkMetaAdsConectado(usuarioId),
    Promise.all(
      ids.map((id) =>
        loadResumenBase(usuarioId, {
          ...query,
          conexion_whatsapp_id: id,
          conexionWhatsappId: id,
          _skipMetaAdsCheck: true,
          _conteosYaResueltos: true,
          _conteosCompartidos: null,
        })
      )
    ),
  ]);
  return { ...mergeResumenPorLineas(bases), metaAdsConectado };
}

async function resumenParcialDeLinea(usuarioId, rango, anterior, conexionWhatsappId, conteo) {
  const fila = conteo || null;
  const [leads, leadsAnt, conversaciones, conversacionesAnt, respuestas, ventasIngresos] =
    await Promise.all([
      countClientesEnRango(usuarioId, rango.desde, rango.hasta, null, conexionWhatsappId),
      countClientesEnRango(usuarioId, anterior.desde, anterior.hasta, null, conexionWhatsappId),
      fila
        ? Promise.resolve(fila.conversaciones)
        : countConversacionesEnRango(usuarioId, rango.desde, rango.hasta, null, conexionWhatsappId),
      fila
        ? Promise.resolve(fila.conversaciones_anterior)
        : countConversacionesEnRango(
            usuarioId,
            anterior.desde,
            anterior.hasta,
            null,
            conexionWhatsappId
          ),
      fila
        ? Promise.resolve(fila.respuestas)
        : countRespuestasEnRango(usuarioId, rango.desde, rango.hasta, null, conexionWhatsappId),
      ventasEIngresosLinea(usuarioId, rango.desde, rango.hasta, conexionWhatsappId),
    ]);

  return {
    leads,
    leadsAnt,
    conversaciones,
    conversacionesAnt,
    respuestas,
    ventas: ventasIngresos.ventas,
    ingresos: ventasIngresos.ingresos,
  };
}

/**
 * Todas las líneas sin flujo. No usa la RPC: embudo y diagnóstico cuentan
 * el distinto global, y esa suma por línea no está demostrada como equivalente.
 * Seguimientos y ventas anteriores se leen una vez para la lista de conexiones.
 * Ventas e ingresos del período salen de una lectura por línea.
 * Leads, conversaciones y respuestas se suman por el mismo arreglo de ids.
 */
async function loadResumenTodasLineasAgrupado(usuarioId, query, ids) {
  const rango = parseRango(query);
  const anterior = rangoAnterior(rango.desde, rango.hasta, rango.periodo);
  const conteos = null;
  const sumaConteos = conteos ? sumarFilasResumenConteos(conteos, ids) : null;
  const lineasPromise = Promise.all(
    ids.map((id) =>
      resumenParcialDeLinea(
        usuarioId,
        rango,
        anterior,
        id,
        conteos ? conteos.get(normalizarIdConexion(id)) : null
      )
    )
  );

  const [metaAdsConectado, lineas, salientes, entrantes, ventasAnt, segEstados] =
    await Promise.all([
      checkMetaAdsConectado(usuarioId),
      lineasPromise,
      sumaConteos
        ? Promise.resolve(sumaConteos.salientes)
        : sumarMensajesPorLinea(usuarioId, rango.desde, rango.hasta, ids, "saliente"),
      sumaConteos
        ? Promise.resolve(sumaConteos.entrantes)
        : sumarMensajesPorLinea(usuarioId, rango.desde, rango.hasta, ids, "entrante"),
      countConversionesEnLineas(usuarioId, anterior.desde, anterior.hasta, ids),
      countSeguimientosPorEstadoEnLineas(usuarioId, rango.desde, rango.hasta, ids),
    ]);

  const bases = lineas.map((line) => ({
    rango,
    flujoId: null,
    metaAdsConectado: false,
    kpis: {
      leads: line.leads,
      conversaciones: line.conversaciones,
      mensajesEnviados: 0,
      respuestas: line.respuestas,
      mensajesEntrantes: 0,
      ventas: line.ventas,
      ingresos: line.ingresos.monto,
      moneda: line.ingresos.moneda,
      ingresosDesglose: line.ingresos.desglose,
      seguimientosActivos: 0,
      seguimientosEnviados: 0,
      seguimientosCancelados: 0,
      seguimientosRespondidos: 0,
      tasaCierre: 0,
      conversion: 0,
      tendenciaLeads: null,
      tendenciaConversaciones: null,
      tendenciaVentas: null,
    },
    _ant: {
      leads: line.leadsAnt,
      conversaciones: line.conversacionesAnt,
      ventas: 0,
    },
  }));

  const merged = mergeResumenPorLineas(bases);
  const kpis = {
    ...merged.kpis,
    mensajesEnviados: salientes,
    mensajesEntrantes: entrantes,
    seguimientosActivos: segEstados.pendiente,
    seguimientosEnviados: segEstados.enviado,
    seguimientosCancelados: segEstados.cancelado,
    seguimientosRespondidos: segEstados.respondido,
    tendenciaVentas: calcTendencia(merged.kpis.ventas, ventasAnt),
  };

  return {
    rango: merged.rango,
    flujoId: merged.flujoId,
    kpis,
    salud: computeSalud({ ...kpis, seguimientosActivos: kpis.seguimientosActivos }),
    metaAdsConectado,
  };
}

/** Carga agregada solo para resumen — sin arrays completos de métricas base. */
async function loadResumenBase(usuarioId, query = {}) {
  const conexionWhatsappId =
    query.conexion_whatsapp_id ?? query.conexionWhatsappId ?? null;
  const flujoId = query.flujo_id || query.flujoId || null;
  const releaseNumeros = retainFlujoClienteNumeros(
    usuarioId,
    flujoId,
    conexionWhatsappId
  );
  try {
    return await loadResumenBaseEnCurso(usuarioId, query);
  } finally {
    releaseNumeros();
  }
}

async function loadResumenBaseEnCurso(usuarioId, query = {}) {
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
    const flujoId = query.flujo_id || query.flujoId || null;
    if (flujoId) {
      return loadResumenTodasPorFanout(usuarioId, query, ids);
    }
    return loadResumenTodasLineasAgrupado(usuarioId, query, ids);
  }

  const rango = parseRango(query);
  const flujoId = query.flujo_id || query.flujoId || null;
  logMetricasMulti(conexionWhatsappId, "loadResumenBase");
  const anterior = rangoAnterior(rango.desde, rango.hasta, rango.periodo);
  const skipMetaAdsCheck = query._skipMetaAdsCheck === true;
  let conteos;
  if (query._conteosYaResueltos) {
    conteos = query._conteosCompartidos || null;
    if (conteos && !conteos.get(normalizarIdConexion(conexionWhatsappId))) {
      throw new Error(
        "[metricas] conteo compartido sin esta conexión. No se mezcla con el cálculo anterior."
      );
    }
  } else {
    conteos = await leerResumenConteosONull(
      usuarioId,
      [conexionWhatsappId],
      rango,
      anterior,
      flujoId
    );
  }
  const filaConteo = conteos
    ? conteos.get(normalizarIdConexion(conexionWhatsappId))
    : null;

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
    filaConteo
      ? Promise.resolve(filaConteo.conversaciones)
      : countConversacionesEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
    filaConteo
      ? Promise.resolve(filaConteo.conversaciones_anterior)
      : countConversacionesEnRango(
          usuarioId,
          anterior.desde,
          anterior.hasta,
          flujoId,
          conexionWhatsappId
        ),
    filaConteo
      ? Promise.resolve(filaConteo.salientes)
      : countMensajesEnRango(
          usuarioId,
          rango.desde,
          rango.hasta,
          flujoId,
          conexionWhatsappId,
          "saliente"
        ),
    filaConteo
      ? Promise.resolve(filaConteo.entrantes)
      : countMensajesEnRango(
          usuarioId,
          rango.desde,
          rango.hasta,
          flujoId,
          conexionWhatsappId,
          "entrante"
        ),
    filaConteo
      ? Promise.resolve(filaConteo.respuestas)
      : countRespuestasEnRango(usuarioId, rango.desde, rango.hasta, flujoId, conexionWhatsappId),
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
    skipMetaAdsCheck ? Promise.resolve(false) : checkMetaAdsConectado(usuarioId),
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

/**
 * Apagada salvo METRICAS_RPC_SERIES_DIAGNOSTICO=1.
 * Serie y diagnóstico prueban la RPC y, si falta o falla, vuelven al cálculo actual.
 * Embudo, resumen, ingresos, heatmap y flujos no leen esta variable.
 */
function metricasRpcSeriesDiagnosticoActiva() {
  return String(process.env.METRICAS_RPC_SERIES_DIAGNOSTICO || "").trim() === "1";
}

function parametrosRpcMetricas(usuarioId, query = {}) {
  const rango = parseRango(query);
  const flujoId = query.flujo_id || query.flujoId || null;
  const raw = query.conexion_whatsapp_id ?? query.conexionWhatsappId ?? null;
  const texto = raw == null ? "" : String(raw).trim();
  const conexion = !texto || texto === CONEXION_TODAS ? null : texto;

  return {
    rango,
    flujoId: flujoId || null,
    params: {
      p_usuario_id: usuarioId,
      p_desde: rango.desde,
      p_hasta: rango.hasta,
      p_conexion_whatsapp_id: conexion,
      p_flujo_id: flujoId || null,
    },
  };
}

function esNumeroRpc(valor) {
  return typeof valor === "number" && Number.isFinite(valor);
}

const CAMPOS_DIAGNOSTICO_RPC = [
  "leads",
  "conversaciones",
  "respuestas",
  "ventas",
  "seguimientos_activos",
];

function diagnosticoRpcEsValido(rpc) {
  if (!rpc || typeof rpc !== "object" || Array.isArray(rpc)) return false;
  return CAMPOS_DIAGNOSTICO_RPC.every(
    (campo) => Object.prototype.hasOwnProperty.call(rpc, campo) && esNumeroRpc(rpc[campo])
  );
}

const CAMPOS_DIA_RPC = ["leads", "mensajes", "ventas", "ingresos_centavos"];

function serieRpcEsValida(rpc, desdeIso, hastaIso) {
  if (!rpc || typeof rpc !== "object" || Array.isArray(rpc)) return false;
  if (!Array.isArray(rpc.diario) || !Array.isArray(rpc.conversiones_por_flujo)) return false;

  const esperadas = new Set(esqueletoDiario(desdeIso, hastaIso).map((dia) => dia.fecha));
  const vistas = new Set();
  for (const row of rpc.diario) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const fecha = row.fecha == null ? "" : String(row.fecha);
    if (!fecha || !esperadas.has(fecha) || vistas.has(fecha)) return false;
    vistas.add(fecha);
    const diaValido = CAMPOS_DIA_RPC.every(
      (campo) => Object.prototype.hasOwnProperty.call(row, campo) && esNumeroRpc(row[campo])
    );
    if (!diaValido) return false;
  }
  if (vistas.size !== esperadas.size) return false;

  for (const row of rpc.conversiones_por_flujo) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    if (row.flujo_id == null || String(row.flujo_id).trim() === "") return false;
    if (!Object.prototype.hasOwnProperty.call(row, "ventas") || !esNumeroRpc(row.ventas)) return false;
  }

  return true;
}

function alcanceLogRpc(params) {
  const conexion = params && params.p_conexion_whatsapp_id;
  if (conexion == null || String(conexion).trim() === "") return "todas";
  return String(conexion);
}

async function serieDesdeRpcONull(usuarioId, query) {
  const { rango, flujoId, params } = parametrosRpcMetricas(usuarioId, query);
  try {
    const rpc = await supabaseRpcJson("metricas_series_diarias", params);
    if (!serieRpcEsValida(rpc, rango.desde, rango.hasta)) {
      console.log(
        "[metricas] metricas_series_diarias con estructura o fechas inválidas. Se usa el cálculo actual."
      );
      return null;
    }
    const serie = armarSerieDesdeRpc(
      {
        periodo: rango.periodo,
        desde: rango.desde,
        hasta: rango.hasta,
        flujoId,
      },
      rpc
    );
    return serie;
  } catch (e) {
    console.log(
      `[metricas] metricas_series_diarias falló: ${errorMessage(e) || e.message}. Se usa el cálculo actual.`
    );
    return null;
  }
}

async function diagnosticoDesdeRpcONull(usuarioId, query) {
  const { rango, flujoId, params } = parametrosRpcMetricas(usuarioId, query);
  try {
    const rpc = await supabaseRpcJson("metricas_diagnostico_kpis", params);
    if (!diagnosticoRpcEsValido(rpc)) {
      console.log(
        "[metricas] metricas_diagnostico_kpis con campos inválidos. Se usa el cálculo actual."
      );
      return null;
    }
    const diagnostico = armarDiagnosticoDesdeRpc(
      {
        periodo: rango.periodo,
        desde: rango.desde,
        hasta: rango.hasta,
        flujoId,
      },
      rpc
    ).respuesta;
    return diagnostico;
  } catch (e) {
    console.log(
      `[metricas] metricas_diagnostico_kpis falló: ${errorMessage(e) || e.message}. Se usa el cálculo actual.`
    );
    return null;
  }
}

async function computeSeries(usuarioId, query) {
  if (metricasRpcSeriesDiagnosticoActiva()) {
    const porRpc = await serieDesdeRpcONull(usuarioId, query);
    if (porRpc) return porRpc;
  }
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
  if (metricasRpcSeriesDiagnosticoActiva()) {
    const porRpc = await diagnosticoDesdeRpcONull(usuarioId, query);
    if (porRpc) return porRpc;
  }
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

function ingresosVisiblesDesdeCentavos(centavos) {
  const n = Number(centavos) || 0;
  return Math.round(n) / 100;
}

const ZONA_CALENDARIO_METRICAS = "America/La_Paz";

function fechaCivilLaPaz(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_CALENDARIO_METRICAS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  if (!map.year || !map.month || !map.day) return null;
  return `${map.year}-${map.month}-${map.day}`;
}

/** Días civiles de America/La_Paz entre desde y hasta, inclusive. No usa la zona del proceso ni reemplaza a buildSeriesDiarias. */
function esqueletoDiario(desdeIso, hastaIso) {
  const inicio = fechaCivilLaPaz(desdeIso);
  const fin = fechaCivilLaPaz(hastaIso);
  if (!inicio || !fin || inicio > fin) return [];

  const days = [];
  const cursor = new Date(`${inicio}T12:00:00.000Z`);
  const end = new Date(`${fin}T12:00:00.000Z`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    days.push({ fecha: key, leads: 0, mensajes: 0, ventas: 0, ingresos: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

/**
 * Arma la respuesta de serie desde metricas_series_diarias.
 * computeSeries la usa solo con METRICAS_RPC_SERIES_DIAGNOSTICO=1.
 * Sin esa variable, la serie sigue en computeSeriesFromBase.
 */
function armarSerieDesdeRpc(meta, rpcSeries) {
  const rpc =
    rpcSeries && typeof rpcSeries === "object" && !Array.isArray(rpcSeries) ? rpcSeries : {};
  const porFecha = new Map();
  (Array.isArray(rpc.diario) ? rpc.diario : []).forEach((row) => {
    if (!row || row.fecha == null) return;
    porFecha.set(String(row.fecha), row);
  });

  const diario = esqueletoDiario(meta.desde, meta.hasta).map((dia) => {
    const row = porFecha.get(dia.fecha);
    const centavos = row ? Number(row.ingresos_centavos) || 0 : 0;
    return {
      fecha: dia.fecha,
      leads: row ? Number(row.leads) || 0 : 0,
      mensajes: row ? Number(row.mensajes) || 0 : 0,
      ventas: row ? Number(row.ventas) || 0 : 0,
      ingresos: ingresosVisiblesDesdeCentavos(centavos),
    };
  });
  const vacio = diario.every((d) => d.leads === 0 && d.mensajes === 0 && d.ventas === 0);
  const conversionesPorFlujo = {};
  (Array.isArray(rpc.conversiones_por_flujo) ? rpc.conversiones_por_flujo : []).forEach((row) => {
    if (!row || !row.flujo_id) return;
    const ventas = Number(row.ventas);
    if (!Number.isFinite(ventas) || ventas <= 0) return;
    conversionesPorFlujo[String(row.flujo_id)] = ventas;
  });

  return {
    ok: true,
    periodo: meta.periodo,
    desde: meta.desde,
    hasta: meta.hasta,
    flujoId: meta.flujoId ?? null,
    diario,
    conversionesPorFlujo,
    vacio,
    source: "supabase",
  };
}

function indicadoresDiagnosticoDesdeRpc(rpcKpis) {
  const src = rpcKpis && typeof rpcKpis === "object" ? rpcKpis : {};
  const indicadores = {
    leads: Number(src.leads) || 0,
    conversaciones: Number(src.conversaciones) || 0,
    respuestas: Number(src.respuestas) || 0,
    ventas: Number(src.ventas) || 0,
    seguimientosActivos: Number(src.seguimientos_activos) || 0,
  };
  indicadores.tasaCierre = pct(indicadores.ventas, indicadores.conversaciones);
  indicadores.conversion = pct(indicadores.ventas, indicadores.leads);
  indicadores.salud = computeSalud(indicadores);
  return indicadores;
}

/**
 * Arma el diagnóstico desde metricas_diagnostico_kpis.
 * respuesta tiene la forma de computeDiagnosticoFromBase.
 * indicadores sirve solo para la comparación en sombra.
 * computeDiagnostico devuelve respuesta solo con METRICAS_RPC_SERIES_DIAGNOSTICO=1.
 */
function armarDiagnosticoDesdeRpc(meta, rpcKpis) {
  const indicadores = indicadoresDiagnosticoDesdeRpc(rpcKpis);
  const score = indicadores.salud;
  return {
    respuesta: {
      ok: true,
      periodo: meta.periodo,
      desde: meta.desde,
      hasta: meta.hasta,
      flujoId: meta.flujoId ?? null,
      items: buildDiagnosticoItems(indicadores),
      salud: {
        score,
        label: saludLabel(score),
      },
      recomendacion:
        score >= 60
          ? "Mantén el ritmo de seguimiento y optimiza los flujos con más respuestas."
          : "Prioriza respuesta rápida y seguimientos antes de escalar campañas.",
      source: "supabase",
    },
    indicadores,
  };
}

/**
 * Lectura del cálculo actual para scripts/test-metricas-shadow.js.
 * No la usa ninguna ruta HTTP.
 */
async function snapshotMetricasActual(usuarioId, query) {
  const base = await resolveMetricasBase(usuarioId, query);
  return {
    series: computeSeriesFromBase(base),
    diagnostico: computeDiagnosticoFromBase(base),
    kpis: {
      leads: base.kpis.leads,
      conversaciones: base.kpis.conversaciones,
      respuestas: base.kpis.respuestas,
      ventas: base.kpis.ventas,
      seguimientosActivos: base.kpis.seguimientosActivos,
      tasaCierre: base.kpis.tasaCierre,
      conversion: base.kpis.conversion,
      salud: base.salud,
    },
  };
}

module.exports = {
  parseRango,
  rangoAnterior,
  pct,
  computeSalud,
  saludLabel,
  buildDiagnosticoItems,
  computeResumen,
  computeFunnel,
  computeSeries,
  computeFlujos,
  computeDiagnostico,
  computeHeatmap,
  computeRevenueBreakdown,
  fetchFlujosList,
  fetchFlujosListMetricas,
  fetchFlujoClienteNumeros,
  fetchConexionesActivasUsuario,
  snapshotMetricasActual,
  supabaseRpcJson,
  armarSerieDesdeRpc,
  armarDiagnosticoDesdeRpc,
  metricasRpcResumenConteosActiva,
  telefonoCuentaParaDistinto,
  instanteEnRangoInclusivo,
  conversacionesSegunRegla,
  simularConteoLinea,
  filasResumenConteosPorConexion,
  sumarFilasResumenConteos,
  leerResumenConteosONull,
  PAGINA_FILAS_METRICAS,
  PAGINAS_MAX_METRICAS,
  reunirPaginas,
  distintosDeFilas,
};
