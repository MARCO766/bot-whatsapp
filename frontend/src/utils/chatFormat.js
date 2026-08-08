export function formatPreview(texto) {
  if (!texto) return "";
  if (texto === "image" || texto === "imagen") return "📷 Imagen";
  if (texto === "audio") return "🎧 Audio";
  if (texto === "document") return "📄 Documento";
  if (texto === "video") return "🎥 Video";
  return String(texto).substring(0, 35);
}

const HORA_BO_OPTIONS = {
  timeZone: "America/La_Paz",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * Instante UTC desde Supabase/ISO. Sin offset explícito → UTC (evita usar TZ del navegador).
 */
function parseFechaUtc(fecha) {
  if (fecha == null || fecha === "") return null;
  if (fecha instanceof Date) {
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
  const s = String(fecha).trim();
  if (!s) return null;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (/[Zz]$|[+-]\d{2}:\d{2}$|[+-]\d{4}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)/);
  if (m) {
    const d = new Date(`${m[1]}T${m[2]}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatHora(fecha) {
  const d = parseFechaUtc(fecha);
  if (!d) return "";
  return d.toLocaleTimeString("es-BO", HORA_BO_OPTIONS);
}

/** Fecha+hora para meta de burbujas: hoy → hora; ayer → Ayer · hora; resto → dd/mm/aaaa · hora. */
export function formatFechaHoraMensaje(fecha) {
  const d = parseFechaUtc(fecha);
  if (!d) return "";
  const hora = d.toLocaleTimeString("es-BO", HORA_BO_OPTIONS);
  const tz = { timeZone: "America/La_Paz" };
  const msgYmd = d.toLocaleDateString("en-CA", tz);
  const hoyYmd = new Date().toLocaleDateString("en-CA", tz);
  if (msgYmd === hoyYmd) return hora;
  const [y, m, day] = hoyYmd.split("-").map(Number);
  const ayerYmd = new Date(Date.UTC(y, m - 1, day - 1)).toISOString().slice(0, 10);
  if (msgYmd === ayerYmd) return `Ayer · ${hora}`;
  const fechaStr = d.toLocaleDateString("es-BO", {
    ...tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${fechaStr} · ${hora}`;
}

/** Orden cronológico ASC para render del chat (desempate estable por id). */
export function sortMensajesPorCreadoEn(mensajes) {
  return [...(mensajes || [])].sort((a, b) => {
    const ta = parseFechaUtc(a?.creado_en)?.getTime() ?? 0;
    const tb = parseFechaUtc(b?.creado_en)?.getTime() ?? 0;
    if (ta !== tb) return ta - tb;
    return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
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
