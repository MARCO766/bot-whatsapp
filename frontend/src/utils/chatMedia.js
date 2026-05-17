export function isImageType(tipo) {
  const t = (tipo || "").toLowerCase();
  return t === "image" || t === "imagen";
}

export function mediaUrl(msg) {
  return msg?.imagen_url || "";
}

export function mediaKind(msg) {
  const tipo = (msg?.tipo || "").toLowerCase();
  const url = mediaUrl(msg);

  if (isImageType(tipo)) return "image";
  if (tipo === "audio" || /\.(ogg|mp3|m4a|wav)(\?|$)/i.test(url)) return "audio";
  if (tipo.includes("video") || /\.(mp4|mov)(\?|$)/i.test(url)) return "video";
  if (/\.webm(\?|$)/i.test(url)) return tipo === "audio" ? "audio" : "video";
  if (tipo === "document" || /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)(\?|$)/i.test(url)) {
    return "document";
  }

  if (!url) return null;

  if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(url)) return "image";
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return "video";
  if (/\.(ogg|mp3|m4a|wav)(\?|$)/i.test(url)) return "audio";
  if (/\.(pdf|doc|docx|xls|xlsx)(\?|$)/i.test(url)) return "document";

  return null;
}

export function docDisplayName(msg) {
  const contenido = (msg?.contenido || "").trim();
  if (contenido && !contenido.startsWith("http")) {
    return contenido.length > 48 ? `${contenido.slice(0, 45)}…` : contenido;
  }
  try {
    const part = mediaUrl(msg).split("/").pop() || "Documento";
    return decodeURIComponent(part.split("?")[0]) || "Documento";
  } catch {
    return "Documento";
  }
}

export function docExtension(name) {
  const ext = (name || "").split(".").pop()?.toUpperCase();
  return ext && ext.length <= 5 ? ext : "DOC";
}
