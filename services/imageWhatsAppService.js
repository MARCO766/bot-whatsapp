const path = require("path");
const sharp = require("sharp");

const EXTENSIONES_IMAGEN = new Set([
  "jpg",
  "jpeg",
  "jfif",
  "png",
  "webp",
  "bmp",
  "heic",
  "heif",
  "gif",
]);

const MIME_POR_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
};

function extensionDesdeNombre(nombre) {
  return path.extname(String(nombre || "")).slice(1).toLowerCase();
}

function normalizarMimeImagen(mime) {
  const m = String(mime || "").toLowerCase().trim();
  if (m === "image/jpg") return "image/jpeg";
  if (m === "image/pjpeg") return "image/jpeg";
  if (m === "image/x-png") return "image/png";
  if (m === "image/x-ms-bmp") return "image/bmp";
  return m;
}

function resolverMimeImagen(file) {
  const porMime = normalizarMimeImagen(file?.mimetype);
  if (porMime.startsWith("image/")) return porMime;

  const ext = extensionDesdeNombre(file?.originalname);
  if (porMime === "application/octet-stream" && MIME_POR_EXTENSION[ext]) {
    return MIME_POR_EXTENSION[ext];
  }
  return MIME_POR_EXTENSION[ext] || porMime;
}

function esArchivoImagen(file) {
  const mime = resolverMimeImagen(file);
  if (mime.startsWith("image/")) return true;
  return EXTENSIONES_IMAGEN.has(extensionDesdeNombre(file?.originalname));
}

function mimeCompatibleWhatsApp(mime) {
  const m = normalizarMimeImagen(mime);
  return m === "image/jpeg" || m === "image/png";
}

/**
 * Prepara buffer/mimetype para WhatsApp Cloud API (jpeg o png).
 * Convierte webp, bmp, heic, heif, gif → jpeg.
 */
async function prepararImagenParaWhatsApp(buffer, mime, originalname = "") {
  const mimeOriginal = resolverMimeImagen({
    mimetype: mime,
    originalname,
  });

  console.log("🖼 MIME ORIGINAL:", mimeOriginal);

  if (!mimeOriginal.startsWith("image/")) {
    throw new Error("El archivo no es una imagen compatible");
  }

  if (mimeCompatibleWhatsApp(mimeOriginal)) {
    const extension = mimeOriginal === "image/png" ? "png" : "jpg";
    console.log("📤 enviando imagen compatible");
    return {
      buffer,
      mimetype: mimeOriginal,
      extension,
    };
  }

  console.log("🔄 convirtiendo imagen:", mimeOriginal);

  try {
    const output = await sharp(buffer, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();

    console.log("✅ convertido a jpg");
    console.log("📤 enviando imagen compatible");

    return {
      buffer: output,
      mimetype: "image/jpeg",
      extension: "jpg",
    };
  } catch (error) {
    const detalle = error.message || "formato no soportado";
    throw new Error(
      `No se pudo convertir la imagen (${mimeOriginal}) a JPG: ${detalle}`
    );
  }
}

module.exports = {
  esArchivoImagen,
  prepararImagenParaWhatsApp,
  resolverMimeImagen,
};
