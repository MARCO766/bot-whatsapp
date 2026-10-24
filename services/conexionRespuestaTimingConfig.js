/**
 * Configuración por conexión: indicador de escritura + demora de respuesta.
 * Módulo puro (sin I/O). Etapa 1: persistencia/validación únicamente.
 * No envía typing ni aplica sleeps — eso es Etapa 2.
 */

const DEMORA_SEGUNDOS_MIN = 1;
const DEMORA_SEGUNDOS_MAX = 60;
const DEMORA_SEGUNDOS_DEFAULT = 3;

const DEFAULTS = Object.freeze({
  indicador_escritura: false,
  demora_respuesta_activa: false,
  demora_respuesta_segundos: DEMORA_SEGUNDOS_DEFAULT,
});

function createValidationError(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = "CONEXION_RESPUESTA_TIMING_INVALID";
  return err;
}

/**
 * Interpreta un booleano desde body/API/fila.
 * undefined/null → null (ausente); no convierte strings arbitrarias a true.
 */
function parseOptionalBoolean(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  throw createValidationError(
    "indicador_escritura / demora_respuesta_activa deben ser verdadero o falso"
  );
}

/**
 * Valida demora_respuesta_segundos: entero 1..60.
 * Rechaza decimales, strings no numéricas, NaN, 0, 61, negativos.
 * @returns {number} entero validado
 */
function parseDemoraSegundos(value) {
  if (value === undefined || value === null || value === "") {
    throw createValidationError(
      `demora_respuesta_segundos es obligatorio (${DEMORA_SEGUNDOS_MIN}-${DEMORA_SEGUNDOS_MAX})`
    );
  }
  if (typeof value === "boolean") {
    throw createValidationError("demora_respuesta_segundos debe ser un entero entre 1 y 60");
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw createValidationError(
        "demora_respuesta_segundos debe ser un entero entre 1 y 60 (sin decimales)"
      );
    }
    if (value < DEMORA_SEGUNDOS_MIN || value > DEMORA_SEGUNDOS_MAX) {
      throw createValidationError(
        `demora_respuesta_segundos debe estar entre ${DEMORA_SEGUNDOS_MIN} y ${DEMORA_SEGUNDOS_MAX}`
      );
    }
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw createValidationError(
        "demora_respuesta_segundos debe ser un entero entre 1 y 60 (sin decimales)"
      );
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < DEMORA_SEGUNDOS_MIN || n > DEMORA_SEGUNDOS_MAX) {
      throw createValidationError(
        `demora_respuesta_segundos debe estar entre ${DEMORA_SEGUNDOS_MIN} y ${DEMORA_SEGUNDOS_MAX}`
      );
    }
    return n;
  }
  throw createValidationError("demora_respuesta_segundos debe ser un entero entre 1 y 60");
}

function pickFromBody(body) {
  if (!body || typeof body !== "object") {
    return {
      indicador: undefined,
      demoraActiva: undefined,
      demoraSegundos: undefined,
      hasAny: false,
    };
  }
  const indicadorRaw =
    body.indicador_escritura !== undefined
      ? body.indicador_escritura
      : body.indicadorEscritura;
  const demoraActivaRaw =
    body.demora_respuesta_activa !== undefined
      ? body.demora_respuesta_activa
      : body.demoraRespuestaActiva;
  const demoraSegundosRaw =
    body.demora_respuesta_segundos !== undefined
      ? body.demora_respuesta_segundos
      : body.demoraRespuestaSegundos;

  return {
    indicador: indicadorRaw,
    demoraActiva: demoraActivaRaw,
    demoraSegundos: demoraSegundosRaw,
    hasAny:
      indicadorRaw !== undefined ||
      demoraActivaRaw !== undefined ||
      demoraSegundosRaw !== undefined,
  };
}

/**
 * Lee valores ya persistidos (fila Supabase). Ausentes → defaults seguros (OFF).
 */
function readTimingFromRow(row) {
  if (!row || typeof row !== "object") {
    return { ...DEFAULTS };
  }
  let indicador = DEFAULTS.indicador_escritura;
  let demoraActiva = DEFAULTS.demora_respuesta_activa;
  let demoraSegundos = DEFAULTS.demora_respuesta_segundos;

  try {
    const b = parseOptionalBoolean(row.indicador_escritura);
    if (b !== null) indicador = b;
  } catch {
    indicador = DEFAULTS.indicador_escritura;
  }
  try {
    const b = parseOptionalBoolean(row.demora_respuesta_activa);
    if (b !== null) demoraActiva = b;
  } catch {
    demoraActiva = DEFAULTS.demora_respuesta_activa;
  }
  if (
    row.demora_respuesta_segundos !== undefined &&
    row.demora_respuesta_segundos !== null &&
    row.demora_respuesta_segundos !== ""
  ) {
    try {
      demoraSegundos = parseDemoraSegundos(row.demora_respuesta_segundos);
    } catch {
      demoraSegundos = DEFAULTS.demora_respuesta_segundos;
    }
  }

  return {
    indicador_escritura: indicador,
    demora_respuesta_activa: demoraActiva,
    demora_respuesta_segundos: demoraSegundos,
  };
}

/**
 * Resuelve config a persistir: body sobreescribe fila; ausente en body → conserva fila/default.
 * Si el body envía demora_respuesta_segundos, se valida siempre (1-60).
 * @throws Error status 400 si valores inválidos
 */
function resolveTimingForSave(body, fallbackRow) {
  const base = readTimingFromRow(fallbackRow);
  const picked = pickFromBody(body);

  let indicador_escritura = base.indicador_escritura;
  let demora_respuesta_activa = base.demora_respuesta_activa;
  let demora_respuesta_segundos = base.demora_respuesta_segundos;

  if (picked.indicador !== undefined) {
    const b = parseOptionalBoolean(picked.indicador);
    if (b === null) {
      throw createValidationError("indicador_escritura inválido");
    }
    indicador_escritura = b;
  }
  if (picked.demoraActiva !== undefined) {
    const b = parseOptionalBoolean(picked.demoraActiva);
    if (b === null) {
      throw createValidationError("demora_respuesta_activa inválida");
    }
    demora_respuesta_activa = b;
  }
  if (picked.demoraSegundos !== undefined) {
    demora_respuesta_segundos = parseDemoraSegundos(picked.demoraSegundos);
  }

  return {
    indicador_escritura,
    demora_respuesta_activa,
    demora_respuesta_segundos,
  };
}

/**
 * Forma API pública (snake + camel), siempre con defaults seguros.
 */
function mapTimingToApi(row) {
  const t = readTimingFromRow(row);
  return {
    indicador_escritura: t.indicador_escritura,
    indicadorEscritura: t.indicador_escritura,
    demora_respuesta_activa: t.demora_respuesta_activa,
    demoraRespuestaActiva: t.demora_respuesta_activa,
    demora_respuesta_segundos: t.demora_respuesta_segundos,
    demoraRespuestaSegundos: t.demora_respuesta_segundos,
  };
}

module.exports = {
  DEMORA_SEGUNDOS_MIN,
  DEMORA_SEGUNDOS_MAX,
  DEMORA_SEGUNDOS_DEFAULT,
  DEFAULTS,
  parseOptionalBoolean,
  parseDemoraSegundos,
  readTimingFromRow,
  resolveTimingForSave,
  mapTimingToApi,
};
