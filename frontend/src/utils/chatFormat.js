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

export function normalizeIncomingMessage(msg) {
  return {
    id: msg.id || `${msg.cliente_numero}-${msg.creado_en}-${Date.now()}`,
    cliente_numero: msg.cliente_numero,
    direccion: msg.direccion || "entrante",
    tipo: msg.tipo,
    contenido: msg.contenido || "",
    imagen_url: msg.imagen_url,
    creado_en: msg.creado_en || new Date().toISOString(),
    whatsapp_message_id: msg.whatsapp_message_id,
    estado_envio: msg.estado_envio,
  };
}
