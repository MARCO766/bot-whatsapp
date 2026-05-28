export function formatPreview(texto) {
  if (!texto) return "";
  if (texto === "image" || texto === "imagen") return "📷 Imagen";
  if (texto === "audio") return "🎧 Audio";
  if (texto === "document") return "📄 Documento";
  if (texto === "video") return "🎥 Video";
  return String(texto).substring(0, 35);
}

export function formatHora(fecha) {
  if (!fecha) return "";
  return new Date(fecha).toLocaleTimeString("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function messageChecks(estadoEnvio) {
  if (estadoEnvio === "read") return { className: "read", text: "✓✓" };
  if (estadoEnvio === "delivered") return { className: "delivered", text: "✓✓" };
  return { className: "sent", text: "✓" };
}

/** Misma clave que inboxService.chatCompositeKey: cliente_numero::conexion_whatsapp_id */
export function chatListKey(numero, conexionWhatsappId) {
  const n = String(numero || "").trim();
  const c = String(conexionWhatsappId || "").trim();
  if (!n || !c) return "";
  return `${n}::${c}`;
}

export function resolveChatKey(entity) {
  if (!entity) return "";
  if (entity.chatKey) return String(entity.chatKey);
  return chatListKey(
    entity.cliente_numero ?? entity.numero,
    entity.conexion_whatsapp_id ?? entity.conexionWhatsappId
  );
}

export function sameChatKey(a, b) {
  const keyA = resolveChatKey(a);
  const keyB = resolveChatKey(b);
  return Boolean(keyA && keyB && keyA === keyB);
}

export function sameChat(a, b) {
  return sameChatKey(a, b);
}

export function normalizeIncomingMessage(msg) {
  const cliente_numero = String(
    msg?.cliente_numero ?? msg?.numero ?? ""
  ).trim();
  const conexion_whatsapp_id = String(
    msg?.conexion_whatsapp_id ?? msg?.conexionWhatsappId ?? ""
  ).trim();
  const conversacion_id =
    msg?.conversacion_id ?? msg?.conversacionId ?? null;
  const chatKey =
    msg?.chatKey ||
    (cliente_numero && conexion_whatsapp_id
      ? chatListKey(cliente_numero, conexion_whatsapp_id)
      : null);

  return {
    id:
      msg?.id ||
      `${chatKey || cliente_numero}-${msg?.creado_en || "t"}-${Date.now()}`,
    cliente_numero,
    conexion_whatsapp_id: conexion_whatsapp_id || null,
    conversacion_id,
    conversacionId: conversacion_id,
    chatKey,
    direccion: msg?.direccion || "entrante",
    tipo: msg?.tipo,
    contenido: msg?.contenido || "",
    imagen_url: msg?.imagen_url,
    media_url: msg?.media_url,
    mime_type: msg?.mime_type,
    mimeType: msg?.mimeType,
    mimetype: msg?.mimetype,
    mediaType: msg?.mediaType,
    media_type: msg?.media_type,
    creado_en: msg?.creado_en || new Date().toISOString(),
    whatsapp_message_id: msg?.whatsapp_message_id,
    estado_envio: msg?.estado_envio,
  };
}
