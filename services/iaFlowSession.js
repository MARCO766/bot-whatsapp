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

function logChatHistorySource(origen, chatHistory) {
  const historial = (Array.isArray(chatHistory) ? chatHistory : []).map((t) => ({
    role: t.role || "?",
    text: String(t.text || t.content || "").slice(0, 300),
  }));
  const cantidadUser = historial.filter((t) => t.role === "user").length;
  const cantidadAssistant = historial.filter(
    (t) => t.role === "assistant" || t.role === "bot" || t.role === "ia"
  ).length;

  console.log(
    "[CHAT_HISTORY_SOURCE]",
    JSON.stringify(
      {
        origen,
        total: historial.length,
        cantidadUser,
        cantidadAssistant,
        chat_history: historial,
      },
      null,
      2
    )
  );
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
  logChatHistorySource(
    `sesion_guardada:nodo=${payload.nodoId || "?"}`,
    payload.flowContext?.chat_history
  );
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
        console.log("[IA_SESSION_CLEARED]", {
          usuarioId,
          numero,
          key,
        });
      }
    }
    return;
  }

  const key = claveSesion(usuarioId, conexionWhatsappId, numero);
  logFlowKey(usuarioId, conexionWhatsappId, numero);
  const teniaSesion = sesiones.has(key);
  sesiones.delete(key);
  if (teniaSesion) {
    console.log("[IA_SESSION_CLEARED]", {
      usuarioId,
      conexionWhatsappId,
      numero,
      key,
    });
  }
}

module.exports = {
  claveSesion,
  logFlowKey,
  logChatHistorySource,
  guardarSesionIAPendiente,
  obtenerSesionIAPendiente,
  limpiarSesionIAPendiente,
};
