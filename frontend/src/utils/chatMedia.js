export function isImageType(tipo) {
  return tipo === "image" || tipo === "imagen";
}

export function hasMedia(msg) {
  return Boolean(msg?.imagen_url && (msg.tipo || isImageType(msg.tipo)));
}

export function mediaKind(msg) {
  if (!msg?.imagen_url) return null;
  if (isImageType(msg.tipo)) return "image";
  if (msg.tipo === "video" || (msg.imagen_url && msg.imagen_url.includes(".mp4"))) {
    return "video";
  }
  if (msg.tipo === "audio") return "audio";
  if (msg.tipo === "document") return "document";
  return null;
}
