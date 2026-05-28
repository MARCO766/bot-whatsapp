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

export function chatListKey(numero, conexionWhatsappId, conversacionId = null) {
  const n = String(numero || "").trim();
  const c = String(conexionWhatsappId || "").trim();
  const cv = conversacionId != null ? String(conversacionId).trim() : "";
  return `${n}-${c}${cv ? `-${cv}` : ""}`;
}

export function sameChat(a, b) {
  if (!a || !b) return false;
  const numA = String(a.cliente_numero ?? a.numero ?? "").trim();
  const numB = String(b.cliente_numero ?? b.numero ?? "").trim();
  if (!numA || !numB || numA !== numB) return false;

  const connA = String(
    a.conexion_whatsapp_id ?? a.conexionWhatsappId ?? ""
  ).trim();
  const connB = String(
    b.conexion_whatsapp_id ?? b.conexionWhatsappId ?? ""
  ).trim();
  return connA === connB;
}

export function normalizeIncomingMessage(msg) {
  return {
    id: msg.id || `${msg.cliente_numero}-${msg.creado_en}-${Date.now()}`,
    cliente_numero: msg.cliente_numero,
    conexion_whatsapp_id: msg.conexion_whatsapp_id || null,
    conversacion_id: msg.conversacion_id || null,
    direccion: msg.direccion || "entrante",
    tipo: msg.tipo,
    contenido: msg.contenido || "",
    imagen_url: msg.imagen_url,
    media_url: msg.media_url,
    mime_type: msg.mime_type,
    mimeType: msg.mimeType,
    mimetype: msg.mimetype,
    mediaType: msg.mediaType,
    media_type: msg.media_type,
    creado_en: msg.creado_en || new Date().toISOString(),
    whatsapp_message_id: msg.whatsapp_message_id,
    estado_envio: msg.estado_envio,
  };
}
