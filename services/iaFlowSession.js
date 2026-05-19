/**
 * Sesiones de flujo pausadas en nodo IA (espera respuesta del lead).
 */

const sesiones = new Map();

function claveSesion(usuarioId, numero) {
  return `${usuarioId || "0"}:${numero || ""}`;
}

function guardarSesionIAPendiente(payload) {
  const key = claveSesion(payload.usuarioId, payload.numero);
  if (!key || key.endsWith(":")) return null;

  const sesion = {
    ...payload,
    creadoEn: Date.now(),
  };

  sesiones.set(key, sesion);
  console.log("[IA] Sesión pendiente guardada:", key, "| nodo:", payload.nodoId);
  return sesion;
}

function obtenerSesionIAPendiente(usuarioId, numero) {
  const key = claveSesion(usuarioId, numero);
  return sesiones.get(key) || null;
}

function limpiarSesionIAPendiente(usuarioId, numero) {
  const key = claveSesion(usuarioId, numero);
  sesiones.delete(key);
}

module.exports = {
  guardarSesionIAPendiente,
  obtenerSesionIAPendiente,
  limpiarSesionIAPendiente,
};
