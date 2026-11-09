/**
 * Ingresos del panel admin: suma de ventas ya registradas en crm_conversiones.
 * Solo lectura. No toca usuarios, planes, límites ni pagos.
 *
 * Una fila de crm_conversiones es una venta del cliente de ese usuario
 * (la misma fuente que los ingresos del CRM). Los comprobantes pendientes
 * o rechazados viven en lector_pagos_estado y no entran en esta tabla.
 * No hay estado de reembolso en crm_conversiones: no se inventa un filtro.
 */
const axios = require("axios");
const { resolveDateRange } = require("./dateRangeService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const ZONA_INGRESOS = "America/La_Paz";
const PERIODOS_PRESET = new Set(["hoy", "ayer", "7d"]);
const RANGO_MAX_DIAS = 365;
const PAGE_SIZE = 1000;
const MAX_FILAS = 20000;

/** Alias de lectura del CRM (metricasService). No es un tipo de cambio. */
const ALIAS_MONEDA = {
  BS: "BOB",
  BOB: "BOB",
  USD: "USD",
  CLP: "CLP",
};

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function canonicalMonedaIngresos(raw) {
  const key = String(raw == null || String(raw).trim() === "" ? "BOB" : raw)
    .trim()
    .toUpperCase();
  return ALIAS_MONEDA[key] || key;
}

function getZonedCalendarParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function zonedWallClockToUtc(year, month, day, hour, minute, second, ms, timeZone) {
  let utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  for (let i = 0; i < 5; i += 1) {
    const parts = getZonedCalendarParts(new Date(utcGuess), timeZone);
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, ms);
    const actualAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const diff = desiredAsUtc - actualAsUtc;
    utcGuess += diff;
    if (diff === 0) break;
  }
  return new Date(utcGuess);
}

function shiftCalendarDate(year, month, day, deltaDays) {
  const anchor = new Date(Date.UTC(year, month - 1, day));
  anchor.setUTCDate(anchor.getUTCDate() + deltaDays);
  return {
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate(),
  };
}

function inicioDiaLaPaz(year, month, day) {
  return zonedWallClockToUtc(year, month, day, 0, 0, 0, 0, ZONA_INGRESOS);
}

function finDiaLaPaz(year, month, day) {
  const next = shiftCalendarDate(year, month, day, 1);
  const nextStart = inicioDiaLaPaz(next.year, next.month, next.day);
  return new Date(nextStart.getTime() - 1);
}

function parseYmd(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function diasInclusivos(desde, hasta) {
  const a = Date.UTC(desde.year, desde.month - 1, desde.day);
  const b = Date.UTC(hasta.year, hasta.month - 1, hasta.day);
  return Math.floor((b - a) / 86400000) + 1;
}

function resolverRangoIngresos(query = {}, options = {}) {
  const periodo = String(query.periodo || "hoy").toLowerCase().trim();
  const now = options.now;

  if (periodo === "custom") {
    const desde = parseYmd(query.desde);
    const hasta = parseYmd(query.hasta);
    if (!desde || !hasta) {
      return { error: "Indica la fecha inicial y la final" };
    }
    const desdeKey = `${query.desde}`.trim();
    const hastaKey = `${query.hasta}`.trim();
    if (desdeKey > hastaKey) {
      return { error: "La fecha inicial no puede ser posterior a la final" };
    }
    const dias = diasInclusivos(desde, hasta);
    if (dias > RANGO_MAX_DIAS) {
      return { error: `El rango máximo es ${RANGO_MAX_DIAS} días` };
    }
    return {
      periodo: "custom",
      desde: inicioDiaLaPaz(desde.year, desde.month, desde.day).toISOString(),
      hasta: finDiaLaPaz(hasta.year, hasta.month, hasta.day).toISOString(),
      zona: ZONA_INGRESOS,
    };
  }

  if (!PERIODOS_PRESET.has(periodo)) {
    return { error: "Periodo no válido" };
  }

  const rango = resolveDateRange({ periodo }, { now, timeZone: ZONA_INGRESOS });
  return {
    periodo: rango.periodo,
    desde: rango.desde,
    hasta: rango.hasta,
    zona: ZONA_INGRESOS,
  };
}

/**
 * Suma valor por usuario y por moneda. Cada id de venta entra una sola vez.
 * No convierte entre monedas.
 */
function agregarIngresos(rows) {
  const cents = new Map();
  const vistos = new Set();
  let ventas = 0;

  for (const row of rows || []) {
    if (!row || typeof row !== "object") continue;
    const id = row.id != null ? String(row.id).trim() : "";
    if (id) {
      if (vistos.has(id)) continue;
      vistos.add(id);
    }
    const uid = row.usuario_id != null ? String(row.usuario_id).trim() : "";
    if (!uid) continue;
    const valor = Number(row.valor);
    if (!Number.isFinite(valor) || valor < 0) continue;

    const moneda = canonicalMonedaIngresos(row.moneda);
    if (!cents.has(uid)) cents.set(uid, new Map());
    const bag = cents.get(uid);
    bag.set(moneda, (bag.get(moneda) || 0) + Math.round(valor * 100));
    ventas += 1;
  }

  const ingresos = {};
  for (const [uid, bag] of cents) {
    const desglose = {};
    for (const [moneda, total] of bag) {
      desglose[moneda] = Math.round(total) / 100;
    }
    ingresos[uid] = desglose;
  }

  return { ingresos, ventas };
}

function errorLectura(mensaje) {
  const err = new Error(mensaje);
  err.code = "INGRESOS_LECTURA";
  return err;
}

function errorDemasiadasFilas() {
  const err = new Error("Demasiadas ventas en el periodo para totalizarlas sin recorte");
  err.code = "INGRESOS_DEMASIADAS_FILAS";
  return err;
}

/** Content-Range de PostgREST. Sin total numérico no se puede cerrar la suma. */
function parseContentRange(header) {
  const raw = String(header || "").trim();
  const match = /^(\*|(\d+)-(\d+))\/(\*|\d+)$/.exec(raw);
  if (!match || match[4] === "*") return null;
  const total = parseInt(match[4], 10);
  if (!Number.isFinite(total) || total < 0) return null;
  if (match[1] === "*") return { start: null, end: null, total };
  const start = parseInt(match[2], 10);
  const end = parseInt(match[3], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return { start, end, total };
}

function indiceHasta(siguiente, total) {
  if (total == null) return siguiente + PAGE_SIZE - 1;
  return Math.min(siguiente + PAGE_SIZE - 1, total - 1);
}

async function solicitarPaginaSupabase({ desde, hasta, desdeIdx, hastaIdx }) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw errorLectura("Supabase no configurado");
  }
  const url =
    `${SUPABASE_URL}/rest/v1/crm_conversiones?select=id,usuario_id,valor,moneda` +
    `&creado_en=gte.${encodeURIComponent(desde)}` +
    `&creado_en=lte.${encodeURIComponent(hasta)}` +
    "&order=id.asc";
  try {
    const res = await axios.get(url, {
      headers: headers({
        Range: `${desdeIdx}-${hastaIdx}`,
        Prefer: "count=exact",
        Accept: "application/json",
      }),
      validateStatus: (status) => (status >= 200 && status < 300) || status === 416,
    });
    return {
      status: res.status,
      data: res.data,
      contentRange: res.headers["content-range"] || res.headers["Content-Range"] || "",
    };
  } catch (error) {
    console.log(
      "[adminIngresos] lectura:",
      error.response?.status || error.code || error.message
    );
    throw errorLectura("No se pudieron leer las ventas");
  }
}

/**
 * Recorre el rango indicado por Content-Range. Cada página empieza en el
 * índice siguiente al último aceptado. Un hueco, un solapamiento, un id
 * repetido o un total distinto aborta la lectura y no deja una suma parcial.
 * Termina solo cuando los índices cubiertos y las filas únicas coinciden
 * con el total anunciado.
 */
async function listarConversionesEnRango(rango, options = {}) {
  const solicitar = options.solicitarPagina || solicitarPaginaSupabase;
  const filas = [];
  const vistos = new Set();
  let total = null;
  let siguiente = 0;
  let pasos = 0;

  for (;;) {
    if (pasos > MAX_FILAS) throw errorLectura("La lectura de ventas no terminó");
    pasos += 1;
    if (total != null && siguiente >= total) break;

    let pagina;
    try {
      pagina = await solicitar({
        desde: rango.desde,
        hasta: rango.hasta,
        desdeIdx: siguiente,
        hastaIdx: indiceHasta(siguiente, total),
      });
    } catch (error) {
      if (error && (error.code === "INGRESOS_LECTURA" || error.code === "INGRESOS_DEMASIADAS_FILAS")) {
        throw error;
      }
      console.log("[adminIngresos] lectura:", error?.response?.status || error?.message);
      throw errorLectura("No se pudieron leer las ventas");
    }

    const anunciado = parseContentRange(pagina && pagina.contentRange);
    if (!anunciado) throw errorLectura("La respuesta no indica cuántas ventas hay");
    if (anunciado.total > MAX_FILAS) throw errorDemasiadasFilas();

    if (total == null) total = anunciado.total;
    else if (anunciado.total !== total) {
      throw errorLectura("El total de ventas cambió durante la lectura");
    }

    if (total === 0) {
      const vacio = Array.isArray(pagina.data) ? pagina.data : [];
      if (vacio.length > 0) throw errorLectura("Respuesta de ventas vacía inconsistente");
      return [];
    }

    if (pagina.status === 416 || anunciado.start == null || anunciado.end == null) {
      throw errorLectura("No se pudo continuar la lectura de ventas");
    }
    if (anunciado.start !== siguiente) {
      throw errorLectura(
        anunciado.start > siguiente
          ? "La lectura de ventas omitió registros"
          : "La lectura de ventas se solapó"
      );
    }
    if (anunciado.end >= total) throw errorLectura("Content-Range fuera del total");

    const data = Array.isArray(pagina.data) ? pagina.data : null;
    if (!data) throw errorLectura("Respuesta de ventas inválida");
    if (data.length !== anunciado.end - anunciado.start + 1) {
      throw errorLectura("La página de ventas no coincide con Content-Range");
    }

    for (const row of data) {
      if (!row || typeof row !== "object" || row.id == null || String(row.id).trim() === "") {
        throw errorLectura("Una venta no tiene identificador");
      }
      const id = String(row.id).trim();
      if (vistos.has(id)) throw errorLectura("La lectura de ventas repitió un identificador");
      vistos.add(id);
      filas.push(row);
    }

    siguiente = anunciado.end + 1;
    if (filas.length !== siguiente) {
      throw errorLectura("La cantidad de ventas no coincide con el rango leído");
    }
  }

  if (siguiente !== total || filas.length !== total) {
    throw errorLectura("No se recuperaron todas las ventas");
  }
  return filas;
}

async function obtenerIngresosAdmin(query = {}, options = {}) {
  const rango = resolverRangoIngresos(query, options);
  if (rango.error) {
    return { ok: false, status: 400, error: rango.error };
  }

  const listar = options.listarConversiones
    || ((rangoLeido) => listarConversionesEnRango(rangoLeido, options));
  const rows = await listar(rango);
  const agregado = agregarIngresos(rows);

  return {
    ok: true,
    periodo: rango.periodo,
    desde: rango.desde,
    hasta: rango.hasta,
    zona: rango.zona,
    ingresos: agregado.ingresos,
    ventas: agregado.ventas,
  };
}

module.exports = {
  ZONA_INGRESOS,
  RANGO_MAX_DIAS,
  canonicalMonedaIngresos,
  resolverRangoIngresos,
  agregarIngresos,
  listarConversionesEnRango,
  obtenerIngresosAdmin,
};
