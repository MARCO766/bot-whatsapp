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
  const key = claveSesion(usuarioId, conexionWhatsappId, numero);
  if (!numero || key.endsWith(":")) return null;

  logFlowKey(usuarioId, conexionWhatsappId, numero);

  const sesion = {
    ...payload,
    conexionWhatsappId: conexionWhatsappId || payload.flowContext?.conexionWhatsappId || null,
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
