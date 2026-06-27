/**
 * Fuente única de verdad para rangos de fechas.
 * Fase D2.2: 7d/30d/90d usan días calendario completos en TZ explícita (default America/La_Paz).
 */

const DEFAULT_TIMEZONE = "America/La_Paz";

/**
 * Resuelve zona horaria IANA para rangos.
 * Preparado para crm_ajustes_usuario.zona_horaria vía options.zona_horaria.
 * @param {{ timeZone?: string, zona_horaria?: string, zonaHoraria?: string }} [options]
 * @returns {string}
 */
function normalizeTimezone(options = {}) {
  const raw =
    options.timeZone ?? options.zona_horaria ?? options.zonaHoraria ?? DEFAULT_TIMEZONE;
  const tz = String(raw || DEFAULT_TIMEZONE).trim();
  return tz || DEFAULT_TIMEZONE;
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
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
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

/** Convierte wall-clock en timeZone a instante UTC (Intl, sin dependencias externas). */
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

function calendarDateToDayRangeIso(year, month, day, timeZone) {
  const start = zonedWallClockToUtc(year, month, day, 0, 0, 0, 0, timeZone);
  const nextDay = shiftCalendarDate(year, month, day, 1);
  const nextDayStart = zonedWallClockToUtc(
    nextDay.year,
    nextDay.month,
    nextDay.day,
    0,
    0,
    0,
    0,
    timeZone
  );
  const end = new Date(nextDayStart.getTime() - 1);
  return {
    desde: start.toISOString(),
    hasta: end.toISOString(),
  };
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

/**
 * Rango explícito desde/hasta (custom u otro caller con fechas).
 * @param {string|Date} desde
 * @param {string|Date|null|undefined} hasta
 * @param {{ now?: Date, periodo?: string }} [options]
 * @returns {{ desde: string, hasta: string, periodo: string }}
 */
function normalizeCustomRange(desde, hasta, options = {}) {
  const now = options.now ?? new Date();
  const periodo = options.periodo ?? "custom";
  const hastaIso = hasta ? new Date(hasta).toISOString() : now.toISOString();
  return {
    desde: new Date(desde).toISOString(),
    hasta: hastaIso,
    periodo,
  };
}

/**
 * Día calendario actual en timeZone: 00:00:00.000 → 23:59:59.999.
 * @param {{ now?: Date, timeZone?: string, zona_horaria?: string, zonaHoraria?: string }} [context]
 * @returns {{ desde: string, hasta: string, periodo: "hoy" }}
 */
function resolveToday(context = {}) {
  const now = context.now ?? new Date();
  const timeZone = context.timeZone ?? normalizeTimezone(context);
  const { year, month, day } = getZonedCalendarParts(now, timeZone);
  const range = calendarDateToDayRangeIso(year, month, day, timeZone);
  return { ...range, periodo: "hoy" };
}

/**
 * Día calendario anterior en timeZone: 00:00:00.000 → 23:59:59.999.
 * @param {{ now?: Date, timeZone?: string, zona_horaria?: string, zonaHoraria?: string }} [context]
 * @returns {{ desde: string, hasta: string, periodo: "ayer" }}
 */
function resolveYesterday(context = {}) {
  const now = context.now ?? new Date();
  const timeZone = context.timeZone ?? normalizeTimezone(context);
  const today = getZonedCalendarParts(now, timeZone);
  const yesterday = shiftCalendarDate(today.year, today.month, today.day, -1);
  const range = calendarDateToDayRangeIso(
    yesterday.year,
    yesterday.month,
    yesterday.day,
    timeZone
  );
  return { ...range, periodo: "ayer" };
}

/**
 * Últimos n días calendario inclusive en timeZone (7 → hace 6 días 00:00 → hoy 23:59:59.999).
 * @param {number} n
 * @param {{ now?: Date, timeZone?: string, zona_horaria?: string, zonaHoraria?: string, periodo?: string }} [context]
 * @returns {{ desde: string, hasta: string, periodo: string }}
 */
function resolveLastDays(n, context = {}) {
  const now = context.now ?? new Date();
  const timeZone = context.timeZone ?? normalizeTimezone(context);
  const today = getZonedCalendarParts(now, timeZone);
  const startDay = shiftCalendarDate(today.year, today.month, today.day, -(n - 1));
  const desdeRange = calendarDateToDayRangeIso(
    startDay.year,
    startDay.month,
    startDay.day,
    timeZone
  );
  const hastaRange = calendarDateToDayRangeIso(today.year, today.month, today.day, timeZone);
  const periodo =
    context.periodo ??
    (n === 90 ? "90d" : n === 30 ? "30d" : "7d");
  return {
    desde: desdeRange.desde,
    hasta: hastaRange.hasta,
    periodo,
  };
}

/**
 * Resuelve un rango a partir de query estilo métricas API.
 * @param {object} [query]
 * @param {object} [options]
 * @returns {{ desde: string, hasta: string, periodo: string }}
 */
function resolveDateRange(query = {}, options = {}) {
  const now = options.now ?? new Date();
  const timeZone = normalizeTimezone(options);

  if (query.desde) {
    return normalizeCustomRange(query.desde, query.hasta, {
      now,
      periodo: query.periodo || "custom",
    });
  }

  const periodo = String(query.periodo || "7d").toLowerCase().trim();

  if (periodo === "hoy" || periodo === "today") {
    return resolveToday({ now, timeZone });
  }

  if (periodo === "ayer" || periodo === "yesterday") {
    return resolveYesterday({ now, timeZone });
  }

  if (periodo === "90d" || periodo === "90") {
    return resolveLastDays(90, { now, timeZone, periodo: "90d" });
  }
  if (periodo === "30d" || periodo === "30") {
    return resolveLastDays(30, { now, timeZone, periodo: "30d" });
  }
  if (periodo === "7d" || periodo === "7") {
    return resolveLastDays(7, { now, timeZone, periodo: "7d" });
  }

  return resolveLastDays(7, { now, timeZone, periodo: "7d" });
}

module.exports = {
  resolveDateRange,
  normalizeCustomRange,
  resolveToday,
  resolveYesterday,
  resolveLastDays,
  normalizeTimezone,
  DEFAULT_TIMEZONE,
};
