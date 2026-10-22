/**
 * Manejo minimo de webhooks Meta con type === "unsupported".
 * Meta no entrega el cuerpo del mensaje; solo errors + unsupported.type.
 * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/unsupported
 */

/** Etiquetas legibles para unsupported.type documentados por Meta (no inventa tipos). */
const ETIQUETA_SUBTIPO = {
  button: "botón",
  edit: "edición",
  errors: "error",
  gif: "GIF",
  group_invite: "invitación a grupo",
  hsm: "plantilla",
  image: "imagen",
  interactive: "interactivo",
  keep_in_chat: "keep in chat",
  link_preview: "vista previa de enlace",
  list: "lista",
  location: "ubicación",
  media_placeholder: "multimedia",
  order: "pedido",
  pin: "pin",
  poll_creation: "encuesta",
  poll_update: "encuesta",
  product: "producto",
  reaction: "reacción",
};

const CONTENIDO_GENERICO = "Mensaje no soportado por WhatsApp";

/**
 * @param {unknown} message — objeto messages[] del webhook Meta
 * @returns {{ contenido: string, subtipo: string|null, errorCode: number|null }}
 */
function resolverContenidoUnsupported(message) {
  const subtipoRaw =
    message &&
    typeof message === "object" &&
    message.unsupported &&
    typeof message.unsupported === "object"
      ? message.unsupported.type
      : null;
  const subtipo =
    subtipoRaw != null && String(subtipoRaw).trim() !== ""
      ? String(subtipoRaw).trim().toLowerCase()
      : null;

  const errors = Array.isArray(message?.errors) ? message.errors : [];
  const firstErr = errors[0] && typeof errors[0] === "object" ? errors[0] : null;
  const errorCode =
    firstErr && typeof firstErr.code === "number" ? firstErr.code : null;

  let contenido = CONTENIDO_GENERICO;
  if (subtipo) {
    const etiqueta = ETIQUETA_SUBTIPO[subtipo];
    contenido = etiqueta
      ? `Mensaje no soportado (${etiqueta})`
      : `Mensaje no soportado (${subtipo})`;
  } else if (errorCode === 131060) {
    contenido = "Mensaje no disponible temporalmente";
  } else if (errorCode === 131051) {
    contenido = CONTENIDO_GENERICO;
  }

  return { contenido, subtipo, errorCode };
}

/**
 * Texto seguro para Bandeja cuando tipo unsupported y contenido vacío (filas históricas).
 * No inventa el cuerpo original; solo etiqueta de UI.
 * @param {{ tipo?: string, type?: string, contenido?: string|null }} msg
 * @returns {string|null} texto a mostrar, o null si no aplica fallback
 */
function etiquetaUiMensajeVacioOUnsupported(msg) {
  const tipo = String(msg?.tipo || msg?.type || "")
    .trim()
    .toLowerCase();
  const contenido = String(msg?.contenido ?? "").trim();

  if (tipo === "unsupported" && !contenido) {
    return CONTENIDO_GENERICO;
  }
  return null;
}

module.exports = {
  CONTENIDO_GENERICO,
  ETIQUETA_SUBTIPO,
  resolverContenidoUnsupported,
  etiquetaUiMensajeVacioOUnsupported,
};
