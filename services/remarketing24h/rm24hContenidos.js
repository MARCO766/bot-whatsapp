const { enviarTextoWhatsApp, enviarMediaWhatsApp } = require("../whatsappService");

const EXT_IMAGEN = /\.(jpe?g|png|webp)(\?|$)/i;
const EXT_AUDIO = /\.(mp3|ogg|m4a)(\?|$)/i;
const EXT_VIDEO = /\.(mp4)(\?|$)/i;
const EXT_DOC = /\.(pdf|docx?|doc)(\?|$)/i;

function limpiarStr(v) {
  return String(v ?? "").trim();
}

/**
 * Lista de contenidos desde config de nodo o fila RM24H (snapshot / legacy).
 */
function obtenerContenidosRemarketing(origen) {
  if (!origen || typeof origen !== "object") return [];

  const snapshot = origen.config_snapshot;
  const cfg =
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? snapshot
      : origen;

  if (Array.isArray(cfg.rm24h_contenidos) && cfg.rm24h_contenidos.length) {
    return cfg.rm24h_contenidos
      .map(normalizarItemContenido)
      .filter(Boolean);
  }

  const legacy = limpiarStr(
    origen.mensaje_remarketing || cfg.mensajeRemarketing || cfg.mensaje_remarketing
  );
  if (legacy) {
    return [{ tipo: "texto", texto: legacy }];
  }

  return [];
}

function normalizarItemContenido(item) {
  if (!item || typeof item !== "object") return null;
  const tipo = limpiarStr(item.tipo).toLowerCase();

  if (tipo === "texto") {
    const texto = limpiarStr(item.texto);
    if (!texto) return null;
    return { tipo: "texto", texto };
  }

  if (tipo === "imagen") {
    const url = limpiarStr(item.url);
    if (!url) return null;
    return { tipo: "imagen", url, caption: limpiarStr(item.caption) };
  }

  if (tipo === "audio") {
    const url = limpiarStr(item.url);
    if (!url) return null;
    return { tipo: "audio", url };
  }

  if (tipo === "video") {
    const url = limpiarStr(item.url);
    if (!url) return null;
    return { tipo: "video", url, caption: limpiarStr(item.caption) };
  }

  if (tipo === "documento" || tipo === "pdf" || tipo === "document") {
    const url = limpiarStr(item.url);
    if (!url) return null;
    return {
      tipo: "documento",
      url,
      filename: limpiarStr(item.filename) || "archivo.pdf",
      caption: limpiarStr(item.caption),
    };
  }

  return null;
}

function validarItemContenido(item) {
  if (!item) return "Bloque vacío";
  const tipo = item.tipo;

  if (tipo === "texto") {
    if (!limpiarStr(item.texto)) return "El texto no puede estar vacío";
    return null;
  }

  const url = limpiarStr(item.url);
  if (!url) return "La URL es obligatoria";
  if (!url.startsWith("https://")) {
    return "La URL debe ser HTTPS pública (WhatsApp Cloud API)";
  }

  if (tipo === "imagen" && !EXT_IMAGEN.test(url)) {
    return "Imagen: usa URL .jpg, .png o .webp";
  }
  if (tipo === "audio" && !EXT_AUDIO.test(url)) {
    return "Audio: usa URL .mp3, .ogg o .m4a";
  }
  if (tipo === "video" && !EXT_VIDEO.test(url)) {
    return "Video: usa URL .mp4";
  }
  if (tipo === "documento" && !EXT_DOC.test(url) && !limpiarStr(item.filename)) {
    return "Documento: URL .pdf/.doc/.docx o indica filename";
  }
  if (tipo === "documento" && item.filename && !EXT_DOC.test(item.filename)) {
    return "Documento: extensión .pdf, .doc o .docx";
  }

  return null;
}

function validarListaContenidos(contenidos) {
  const lista = Array.isArray(contenidos) ? contenidos : [];
  if (!lista.length) return { ok: false, error: "Agrega al menos un contenido" };

  for (let i = 0; i < lista.length; i++) {
    const err = validarItemContenido(lista[i]);
    if (err) return { ok: false, error: `Bloque ${i + 1}: ${err}` };
  }
  return { ok: true };
}

function sincronizarMensajeLegacy(config) {
  if (!config || typeof config !== "object") return config;
  const lista = Array.isArray(config.rm24h_contenidos)
    ? config.rm24h_contenidos.map(normalizarItemContenido).filter(Boolean)
    : [];
  const primeroTexto = lista.find((c) => c.tipo === "texto");
  if (primeroTexto) {
    config.mensajeRemarketing = primeroTexto.texto;
  } else if (!lista.length) {
    config.mensajeRemarketing = limpiarStr(config.mensajeRemarketing);
  }
  return config;
}

async function enviarUnContenidoRemarketing(numero, item, opciones) {
  const tipo = item.tipo;

  if (tipo === "texto") {
    await enviarTextoWhatsApp(numero, item.texto, opciones);
    return;
  }

  if (tipo === "imagen") {
    const ok = await enviarMediaWhatsApp(
      numero,
      "image",
      item.url,
      item.caption || "",
      opciones
    );
    if (!ok) throw new Error("Error enviando imagen RM24H");
    return;
  }

  if (tipo === "audio") {
    const ok = await enviarMediaWhatsApp(numero, "audio", item.url, "", opciones);
    if (!ok) throw new Error("Error enviando audio RM24H");
    return;
  }

  if (tipo === "video") {
    const ok = await enviarMediaWhatsApp(
      numero,
      "video",
      item.url,
      item.caption || "",
      opciones
    );
    if (!ok) throw new Error("Error enviando video RM24H");
    return;
  }

  if (tipo === "documento") {
    const ok = await enviarMediaWhatsApp(
      numero,
      "document",
      item.url,
      item.caption || "",
      { ...opciones, filename: item.filename || "archivo.pdf" }
    );
    if (!ok) throw new Error("Error enviando documento RM24H");
    return;
  }

  throw new Error("Tipo de contenido no soportado: " + tipo);
}

/**
 * Envía todos los contenidos en orden (texto + media).
 */
async function enviarContenidosRemarketing(numero, contenidos, opciones = {}) {
  const lista = (contenidos || []).map(normalizarItemContenido).filter(Boolean);
  if (!lista.length) {
    throw new Error("Sin contenidos para enviar");
  }

  for (let i = 0; i < lista.length; i++) {
    console.log("[RM24H] enviando contenido", {
      indice: i + 1,
      total: lista.length,
      tipo: lista[i].tipo,
    });
    await enviarUnContenidoRemarketing(numero, lista[i], opciones);
  }
}

module.exports = {
  obtenerContenidosRemarketing,
  normalizarItemContenido,
  validarItemContenido,
  validarListaContenidos,
  sincronizarMensajeLegacy,
  enviarContenidosRemarketing,
};
