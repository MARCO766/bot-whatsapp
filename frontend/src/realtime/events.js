/** Eventos Socket.IO (canónico: snake_case) */
export const RT = {
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

/** Alias legacy (EJS) → canónico */
const LEGACY = {
  "nuevo-mensaje": RT.NUEVO_MENSAJE,
  "mensaje-estado": RT.MENSAJE_ESTADO,
  "seguimiento-estado": RT.SEGUIMIENTO_ACTUALIZADO,
};

export function normalizeEvent(name) {
  return LEGACY[name] || name;
}

export const ALL_SOCKET_EVENTS = [
  ...Object.values(RT),
  ...Object.keys(LEGACY),
];
