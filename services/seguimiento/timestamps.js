/**
 * Timestamps UTC válidos para PostgreSQL timestamptz vía PostgREST.
 * Siempre formato: 2026-05-17T07:00:12.995Z
 * En URLs hay que encodeURIComponent para no convertir "+" en espacio.
 */

function toTimestamptzUtc(value) {
  if (value === null || value === undefined || value === "") {
    return new Date().toISOString();
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    console.warn("[SEGUIMIENTO] Timestamp inválido, usando now():", value);
    return new Date().toISOString();
  }

  return date.toISOString();
}

function nowUtc() {
  return new Date().toISOString();
}

/**
 * Valor para filtros PostgREST: run_at=lte.{valor}, creado_en=gt.{valor}
 */
function encodeTimestampFilter(value) {
  return encodeURIComponent(toTimestamptzUtc(value));
}

/**
 * Objeto listo para INSERT/PATCH (body JSON).
 */
function timestampsPayload(fields) {
  const out = {};
  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined && val !== null) {
      out[key] = toTimestamptzUtc(val);
    }
  }
  return out;
}

module.exports = {
  toTimestamptzUtc,
  nowUtc,
  encodeTimestampFilter,
  timestampsPayload,
};
