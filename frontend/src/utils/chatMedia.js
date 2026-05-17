const AUDIO_MIME =
  /^audio\/(ogg|mpeg|mp3|webm|aac|mp4|x-m4a|wav|opus|x-wav)/i;
const VIDEO_MIME =
  /^video\/(mp4|webm|quicktime|x-msvideo|mpeg|3gpp)/i;
const IMAGE_MIME = /^image\//i;

const AUDIO_EXT = /\.(ogg|oga|opus|mp3|mpeg|m4a|aac|wav)(\?|$)/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|qt|3gp)(\?|$)/i;
const WEBM_EXT = /\.webm(\?|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic)(\?|$)/i;
const DOC_EXT =
  /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf)(\?|$)/i;

const PLACEHOLDER_TEXT = new Set([
  "audio",
  "video",
  "image",
  "imagen",
  "document",
  "documento",
  "archivo",
  "file",
]);

export function mediaUrl(msg) {
  return (
    msg?.imagen_url ||
    msg?.media_url ||
    msg?.mediaUrl ||
    msg?.url ||
    msg?._localPreview?.url ||
    ""
  );
}

function pickMime(msg) {
  return String(
    msg?.mime_type ||
      msg?.mimeType ||
      msg?.mimetype ||
      msg?.mediaType ||
      msg?.media_type ||
      msg?._localPreview?.mimeType ||
      ""
  )
    .trim()
    .toLowerCase();
}

function pickType(msg) {
  return String(msg?.tipo || msg?.type || msg?.message_type || "")
    .trim()
    .toLowerCase();
}

function extensionFrom(src) {
  if (!src) return "";
  const clean = String(src).split("?")[0];
  const parts = clean.split(".");
  if (parts.length < 2) return "";
  return parts.pop().toLowerCase();
}

export function isPlaceholderContent(text) {
  return PLACEHOLDER_TEXT.has(String(text || "").trim().toLowerCase());
}

function mimeImpliesAudio(mime) {
  return Boolean(mime && (AUDIO_MIME.test(mime) || mime.startsWith("audio/")));
}

function mimeImpliesVideo(mime) {
  return Boolean(mime && (VIDEO_MIME.test(mime) || mime.startsWith("video/")));
}

function mimeImpliesImage(mime) {
  return Boolean(mime && IMAGE_MIME.test(mime));
}

function mimeImpliesDocument(mime) {
  if (!mime) return false;
  if (
    mime === "application/pdf" ||
    mime.includes("word") ||
    mime.includes("excel") ||
    mime.includes("spreadsheet") ||
    mime.includes("msword") ||
    mime.includes("officedocument")
  ) {
    return true;
  }
  return (
    !mime.startsWith("audio/") &&
    !mime.startsWith("video/") &&
    !mime.startsWith("image/")
  );
}

function urlImpliesAudio(url) {
  return AUDIO_EXT.test(url) || (WEBM_EXT.test(url) && /audio/i.test(url));
}

function urlImpliesVideo(url, tipo, mime) {
  if (VIDEO_EXT.test(url)) return true;
  if (WEBM_EXT.test(url)) {
    if (mimeImpliesAudio(mime) || tipo === "audio" || tipo === "voice" || tipo === "ptt") {
      return false;
    }
    return true;
  }
  return false;
}

function typeImpliesAudio(tipo) {
  return tipo === "audio" || tipo === "voice" || tipo === "ptt";
}

function typeImpliesVideo(tipo) {
  return tipo === "video";
}

function typeImpliesImage(tipo) {
  return tipo === "image" || tipo === "imagen" || tipo === "sticker";
}

/** Normaliza mensaje con tipo visual correcto (audio/video/image/document) */
function contentTypeHint(msg) {
  const hint = String(msg?.contenido || "").trim().toLowerCase();
  if (hint === "audio") return "audio";
  if (hint === "video") return "video";
  if (hint === "image" || hint === "imagen") return "image";
  return null;
}

export function resolveMediaKind(msg) {
  const mime = pickMime(msg);
  let tipo = pickType(msg);
  const url = mediaUrl(msg);
  const ext = extensionFrom(url) || extensionFrom(msg?.contenido);
  const hint = contentTypeHint(msg);

  const previewKind = msg?._localPreview?.kind;
  if (previewKind === "file") {
    /* legacy local preview */
  } else if (previewKind === "image" || previewKind === "audio" || previewKind === "video") {
    return previewKind;
  } else if (previewKind === "document") {
    return "document";
  }

  if (hint && !tipo) tipo = hint;
  if (hint && (tipo === "document" || tipo === "file")) tipo = hint;

  if (url || tipo || mime) {
    console.log("[Bandeja media]", {
      mimeType: mime || null,
      type: tipo || null,
      mediaUrl: url || null,
      extension: ext || null,
    });
  }

  if (!url && !mime && !tipo && !hint) return null;

  if (mimeImpliesAudio(mime)) return "audio";
  if (mimeImpliesVideo(mime)) return "video";
  if (mimeImpliesImage(mime)) return "image";

  if (typeImpliesAudio(tipo)) return url || mime ? "audio" : null;
  if (typeImpliesVideo(tipo)) return url || mime ? "video" : null;
  if (typeImpliesImage(tipo)) return url || mime ? "image" : null;

  if (url) {
    if (urlImpliesAudio(url)) return "audio";
    if (urlImpliesVideo(url, tipo, mime)) return "video";
    if (IMAGE_EXT.test(url)) return "image";
  }

  if (ext) {
    const dotExt = `.${ext}`;
    if (AUDIO_EXT.test(dotExt) || ext === "webm" && typeImpliesAudio(tipo)) return "audio";
    if (VIDEO_EXT.test(dotExt) || (ext === "webm" && !typeImpliesAudio(tipo))) return "video";
    if (IMAGE_EXT.test(dotExt)) return "image";
    if (DOC_EXT.test(dotExt)) return "document";
  }

  if (tipo === "document" || tipo === "file") {
    if (mimeImpliesAudio(mime) || urlImpliesAudio(url) || hint === "audio") return "audio";
    if (mimeImpliesVideo(mime) || urlImpliesVideo(url, tipo, mime) || hint === "video") {
      return "video";
    }
    if (mimeImpliesImage(mime) || (url && IMAGE_EXT.test(url)) || hint === "image") {
      return "image";
    }
    if (
      (url && DOC_EXT.test(url)) ||
      (ext && DOC_EXT.test(`.${ext}`)) ||
      mimeImpliesDocument(mime)
    ) {
      return "document";
    }
    return null;
  }

  if (hint === "audio") return url || mime ? "audio" : null;
  if (hint === "video") return url || mime ? "video" : null;
  if (hint === "image") return url || mime ? "image" : null;

  if (mimeImpliesDocument(mime) && url && DOC_EXT.test(url)) return "document";

  return null;
}

export function mediaKind(msg) {
  return resolveMediaKind(msg);
}

export function docDisplayName(msg) {
  const contenido = (msg?.contenido || "").trim();
  if (contenido && !contenido.startsWith("http") && !isPlaceholderContent(contenido)) {
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

export function visibleCaption(msg, kind) {
  const text = (msg?.contenido || "").trim();
  if (!text || text.startsWith("http") || isPlaceholderContent(text)) return null;
  if (kind === "document") {
    const docName = docDisplayName(msg);
    if (text === docName) return null;
  }
  return text;
}

export function previewKindFromFile(file) {
  const mime = (file?.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

export function tipoFromFile(file) {
  const kind = previewKindFromFile(file);
  if (kind === "image") return "image";
  if (kind === "audio") return "audio";
  if (kind === "video") return "video";
  return "document";
}
