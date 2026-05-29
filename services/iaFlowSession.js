/**
 * Sesiones de flujo pausadas en nodo IA (espera respuesta del lead).
 * Clave por línea: usuarioId:conexionWhatsappId:numero
 */

const sesiones = new Map();

function claveSesion(usuarioId, conexionWhatsappId, numero) {
  return `${usuarioId || "0"}:${conexionWhatsappId || ""}:${numero || ""}`;
}

function logFlowKey(usuarioId, conexionWhatsappId, numero) {
  const flowKey = claveSesion(usuarioId, conexionWhatsappId, numero);
  console.log("[FLOW KEY]", {
    usuarioId,
    conexionWhatsappId,
    numero,
    flowKey,
  });
  return flowKey;
}

function guardarSesionIAPendiente(payload) {
  const { usuarioId, conexionWhatsappId, numero } = payload;
  const conexionLinea =
    conexionWhatsappId != null && String(conexionWhatsappId).trim() !== ""
      ? String(conexionWhatsappId).trim()
      : payload.flowContext?.conexionWhatsappId != null &&
          String(payload.flowContext.conexionWhatsappId).trim() !== ""
        ? String(payload.flowContext.conexionWhatsappId).trim()
        : null;

  if (!conexionLinea) {
    console.log("[IA_MULTI] sesión omitida sin conexionWhatsappId", {
      usuarioId,
      numero,
    });
    return null;
  }

  const key = claveSesion(usuarioId, conexionLinea, numero);
  if (!numero || key.endsWith(":")) return null;

  logFlowKey(usuarioId, conexionLinea, numero);

  const sesion = {
    ...payload,
    conexionWhatsappId: conexionLinea,
    creadoEn: Date.now(),
  };

  sesiones.set(key, sesion);
  console.log("[IA] Sesión pendiente guardada:", key, "| nodo:", payload.nodoId);
  return sesion;
}

function obtenerSesionIAPendiente(usuarioId, conexionWhatsappId, numero) {
  if (!conexionWhatsappId) return null;

  const key = claveSesion(usuarioId, conexionWhatsappId, numero);
  logFlowKey(usuarioId, conexionWhatsappId, numero);
  return sesiones.get(key) || null;
}

function limpiarSesionIAPendiente(usuarioId, conexionWhatsappId, numero) {
  if (arguments.length === 2) {
    numero = conexionWhatsappId;
    conexionWhatsappId = null;
    const prefix = `${usuarioId || "0"}:`;
    const suffix = `:${numero || ""}`;
    for (const key of sesiones.keys()) {
      if (key.startsWith(prefix) && key.endsWith(suffix)) {
        sesiones.delete(key);
      }
    }
    return;
  }

  const key = claveSesion(usuarioId, conexionWhatsappId, numero);
  logFlowKey(usuarioId, conexionWhatsappId, numero);
  sesiones.delete(key);
}

module.exports = {
  claveSesion,
  logFlowKey,
  guardarSesionIAPendiente,
  obtenerSesionIAPendiente,
  limpiarSesionIAPendiente,
};
