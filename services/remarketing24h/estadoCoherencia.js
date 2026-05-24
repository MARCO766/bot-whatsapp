const { ESTADOS_RM24H } = require("./constants");

const ESTADOS_CON_ACTIVO_TRUE = new Set([
  ESTADOS_RM24H.ACTIVO,
  ESTADOS_RM24H.PENDIENTE_DISPARO,
  ESTADOS_RM24H.PROCESANDO,
]);

const ESTADOS_CON_ACTIVO_FALSE = new Set([
  ESTADOS_RM24H.CERRADO_SIN_RESPUESTA,
  ESTADOS_RM24H.CANCELADO_CONVERSION,
  ESTADOS_RM24H.CANCELADO_RESPUESTA,
  ESTADOS_RM24H.EXPIRADO_VENTANA,
  ESTADOS_RM24H.CONVERTIDO,
  ESTADOS_RM24H.CANCELADO,
  ESTADOS_RM24H.CANCELADO_RESETBOT,
]);

function inferirEstadoCerrado(payload = {}, filaActual = {}) {
  const motivo = String(
    payload.motivo_cancelacion ?? filaActual.motivo_cancelacion ?? ""
  ).trim();

  if (motivo === "resetbot") {
    return ESTADOS_RM24H.CANCELADO_RESETBOT;
  }
  if (motivo === "conversion") {
    return ESTADOS_RM24H.CANCELADO_CONVERSION;
  }
  if (
    motivo === "max_intentos_tras_envio" ||
    motivo === "max_intentos" ||
    filaActual.ultimo_disparo_en
  ) {
    return ESTADOS_RM24H.CERRADO_SIN_RESPUESTA;
  }
  if (motivo === "ventana_whatsapp_cerrada") {
    return ESTADOS_RM24H.EXPIRADO_VENTANA;
  }
  if (motivo) {
    return ESTADOS_RM24H.CANCELADO_RESPUESTA;
  }
  if (filaActual.estado === ESTADOS_RM24H.CONVERTIDO) {
    return ESTADOS_RM24H.CANCELADO_CONVERSION;
  }
  return ESTADOS_RM24H.CANCELADO_RESPUESTA;
}

/**
 * Garantiza que estado y activo no queden inconsistentes (p. ej. activo + activo=false).
 */
function coherenciaEstadoRm24h(payload = {}, filaActual = {}) {
  const out = { ...payload };
  let estado = out.estado ?? filaActual.estado;
  let activo = out.activo;

  if (typeof activo !== "boolean") {
    activo = filaActual.activo;
  }

  if (typeof activo !== "boolean") {
    return out;
  }

  const antes = `${filaActual.estado || "?"}|activo=${filaActual.activo}`;

  if (activo === true) {
    if (!estado || !ESTADOS_CON_ACTIVO_TRUE.has(estado)) {
      console.log("[RM24H] normalizando estado", {
        de: antes,
        motivo: "activo=true requiere estado vivo",
      });
      estado =
        estado === ESTADOS_RM24H.PENDIENTE_DISPARO ||
        estado === ESTADOS_RM24H.PROCESANDO
          ? estado
          : ESTADOS_RM24H.ACTIVO;
    }
  } else {
    if (!estado || ESTADOS_CON_ACTIVO_TRUE.has(estado)) {
      const inferido = inferirEstadoCerrado(out, filaActual);
      console.log("[RM24H] normalizando estado", {
        de: antes,
        a: `${inferido}|activo=false`,
        motivo: "activo=false requiere estado terminal",
      });
      estado = inferido;
    } else if (!ESTADOS_CON_ACTIVO_FALSE.has(estado)) {
      const inferido = inferirEstadoCerrado(out, filaActual);
      console.log("[RM24H] normalizando estado", {
        de: antes,
        a: `${inferido}|activo=false`,
      });
      estado = inferido;
    }
  }

  out.estado = estado;
  out.activo = activo;
  return out;
}

module.exports = {
  coherenciaEstadoRm24h,
  ESTADOS_CON_ACTIVO_TRUE,
  ESTADOS_CON_ACTIVO_FALSE,
};
