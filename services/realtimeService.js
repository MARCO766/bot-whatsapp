/**
 * Emisión centralizada Socket.IO — sala user_{usuarioId}
 * Eventos con guión bajo; alias legacy con guión para EJS/inbox antiguo.
 */

const LEGACY_ALIASES = {
  nuevo_mensaje: "nuevo-mensaje",
  mensaje_estado: "mensaje-estado",
  seguimiento_actualizado: "seguimiento-estado",
};

let _app = null;

function setApp(app) {
  _app = app;
}

function getIo(source) {
  if (!source) {
    return _app?.get?.("io") || null;
  }
  if (typeof source.emit === "function" && typeof source.to === "function") {
    return source;
  }
  const app = source.app || source;
  if (app?.get) return app.get("io");
  return _app?.get?.("io") || null;
}

function room(usuarioId) {
  return `user_${usuarioId}`;
}

function emitToUser(source, usuarioId, event, payload) {
  const io = getIo(source);
  if (!io || !usuarioId || !event) return false;

  const r = room(usuarioId);
  io.to(r).emit(event, {
    ...payload,
    _ts: Date.now(),
    usuario_id: usuarioId,
  });

  const legacy = LEGACY_ALIASES[event];
  if (legacy && legacy !== event) {
    io.to(r).emit(legacy, payload);
  }
  return true;
}

const EVENTS = {
  NUEVO_MENSAJE: "nuevo_mensaje",
  MENSAJE_ESTADO: "mensaje_estado",
  CLIENTE_ACTUALIZADO: "cliente_actualizado",
  FLUJO_GUARDADO: "flujo_guardado",
  ACTIVADOR_CREADO: "activador_creado",
  ACTIVADOR_ELIMINADO: "activador_eliminado",
  ACTIVADOR_ACTUALIZADO: "activador_actualizado",
  ETIQUETA_ACTUALIZADA: "etiqueta_actualizada",
  CONVERSION_REGISTRADA: "conversion_registrada",
  SEGUIMIENTO_ACTUALIZADO: "seguimiento_actualizado",
  CONEXION_ACTUALIZADA: "conexion_actualizada",
  METRICA_ACTUALIZADA: "metrica_actualizada",
  CHAT_BLOQUEADO: "chat_bloqueado",
  CHAT_DESBLOQUEADO: "chat_desbloqueado",
  CONVERSACION_ACTUALIZADA: "conversacion_actualizada",
  TYPING: "typing",
};

function nuevoMensaje(source, usuarioId, data) {
  return emitToUser(source, usuarioId, EVENTS.NUEVO_MENSAJE, data);
}

function mensajeEstado(source, usuarioId, data) {
  return emitToUser(source, usuarioId, EVENTS.MENSAJE_ESTADO, data);
}

function clienteActualizado(source, usuarioId, data) {
  emitToUser(source, usuarioId, EVENTS.CLIENTE_ACTUALIZADO, data);
  emitToUser(source, usuarioId, EVENTS.METRICA_ACTUALIZADA, { scope: "clientes", ...data });
}

function flujoGuardado(source, usuarioId, data) {
  return emitToUser(source, usuarioId, EVENTS.FLUJO_GUARDADO, data);
}

function activadorCreado(source, usuarioId, data) {
  emitToUser(source, usuarioId, EVENTS.ACTIVADOR_CREADO, data);
  emitToUser(source, usuarioId, EVENTS.METRICA_ACTUALIZADA, { scope: "activadores" });
}

function activadorEliminado(source, usuarioId, data) {
  emitToUser(source, usuarioId, EVENTS.ACTIVADOR_ELIMINADO, data);
  emitToUser(source, usuarioId, EVENTS.METRICA_ACTUALIZADA, { scope: "activadores" });
}

function activadorActualizado(source, usuarioId, data) {
  emitToUser(source, usuarioId, EVENTS.ACTIVADOR_ACTUALIZADO, data);
  emitToUser(source, usuarioId, EVENTS.METRICA_ACTUALIZADA, { scope: "activadores" });
}

function etiquetaActualizada(source, usuarioId, data) {
  return emitToUser(source, usuarioId, EVENTS.ETIQUETA_ACTUALIZADA, data);
}

function conversionRegistrada(source, usuarioId, data) {
  emitToUser(source, usuarioId, EVENTS.CONVERSION_REGISTRADA, data);
  emitToUser(source, usuarioId, EVENTS.METRICA_ACTUALIZADA, { scope: "conversiones", ...data });
}

function seguimientoActualizado(source, usuarioId, data) {
  return emitToUser(source, usuarioId, EVENTS.SEGUIMIENTO_ACTUALIZADO, data);
}

function conexionActualizada(source, usuarioId, data) {
  return emitToUser(source, usuarioId, EVENTS.CONEXION_ACTUALIZADA, data);
}

function metricaActualizada(source, usuarioId, data) {
  return emitToUser(source, usuarioId, EVENTS.METRICA_ACTUALIZADA, data);
}

function chatBloqueado(source, usuarioId, data) {
  emitToUser(source, usuarioId, EVENTS.CHAT_BLOQUEADO, data);
  clienteActualizado(source, usuarioId, { numero: data?.cliente_numero || data?.numero, bloqueado: true });
}

function chatDesbloqueado(source, usuarioId, data) {
  emitToUser(source, usuarioId, EVENTS.CHAT_DESBLOQUEADO, data);
  clienteActualizado(source, usuarioId, { numero: data?.cliente_numero || data?.numero, bloqueado: false });
}

function conversacionActualizada(source, usuarioId, data) {
  return emitToUser(source, usuarioId, EVENTS.CONVERSACION_ACTUALIZADA, data);
}

function typing(source, usuarioId, data) {
  return emitToUser(source, usuarioId, EVENTS.TYPING, data);
}

module.exports = {
  EVENTS,
  LEGACY_ALIASES,
  setApp,
  getIo,
  room,
  emitToUser,
  nuevoMensaje,
  mensajeEstado,
  clienteActualizado,
  flujoGuardado,
  activadorCreado,
  activadorEliminado,
  activadorActualizado,
  etiquetaActualizada,
  conversionRegistrada,
  seguimientoActualizado,
  conexionActualizada,
  metricaActualizada,
  chatBloqueado,
  chatDesbloqueado,
  conversacionActualizada,
  typing,
};
