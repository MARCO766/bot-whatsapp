/** Validación UI — demora de respuesta por conexión WhatsApp (espejo del backend). */

export const DEMORA_SEGUNDOS_MIN = 1;
export const DEMORA_SEGUNDOS_MAX = 60;
export const DEMORA_SEGUNDOS_DEFAULT = 3;

export const TIMING_DEFAULTS = Object.freeze({
  indicador_escritura: false,
  demora_respuesta_activa: false,
  demora_respuesta_segundos: DEMORA_SEGUNDOS_DEFAULT,
});

/** Filas antiguas o sin campos → funciones OFF. */
export function timingFromConexion(c) {
  const indicador =
    c?.indicador_escritura === true || c?.indicadorEscritura === true;
  const demoraActiva =
    c?.demora_respuesta_activa === true || c?.demoraRespuestaActiva === true;
  const raw =
    c?.demora_respuesta_segundos ?? c?.demoraRespuestaSegundos ?? DEMORA_SEGUNDOS_DEFAULT;
  const n = Number(raw);
  const segundos =
    Number.isInteger(n) && n >= DEMORA_SEGUNDOS_MIN && n <= DEMORA_SEGUNDOS_MAX
      ? n
      : DEMORA_SEGUNDOS_DEFAULT;
  return {
    indicador_escritura: indicador,
    demora_respuesta_activa: demoraActiva,
    demora_respuesta_segundos: segundos,
  };
}

/**
 * @returns {{ ok: true, value: number } | { ok: false, error: string }}
 */
export function validateDemoraSegundosInput(value) {
  if (value === undefined || value === null || value === "") {
    return {
      ok: false,
      error: `Indica la demora en segundos (${DEMORA_SEGUNDOS_MIN}-${DEMORA_SEGUNDOS_MAX})`,
    };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return {
        ok: false,
        error: "La demora debe ser un número entero (sin decimales)",
      };
    }
    if (value < DEMORA_SEGUNDOS_MIN || value > DEMORA_SEGUNDOS_MAX) {
      return {
        ok: false,
        error: `La demora debe estar entre ${DEMORA_SEGUNDOS_MIN} y ${DEMORA_SEGUNDOS_MAX} segundos`,
      };
    }
    return { ok: true, value };
  }
  const trimmed = String(value).trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return {
      ok: false,
      error: "La demora debe ser un número entero (sin decimales)",
    };
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < DEMORA_SEGUNDOS_MIN || n > DEMORA_SEGUNDOS_MAX) {
    return {
      ok: false,
      error: `La demora debe estar entre ${DEMORA_SEGUNDOS_MIN} y ${DEMORA_SEGUNDOS_MAX} segundos`,
    };
  }
  return { ok: true, value: n };
}
