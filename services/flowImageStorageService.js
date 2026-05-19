const sharp = require("sharp");
const { resolverMimeImagen } = require("./imageWhatsAppService");

const MAX_OUTPUT_BYTES = 500 * 1024;

const PASOS_OPTIMIZACION = [
  { width: 1600, quality: 82 },
  { quality: 75 },
  { quality: 68 },
  { width: 1400, quality: 68 },
  { width: 1200, quality: 65 },
];

/**
 * Optimiza imagen para storage del nodo Contenido (WEBP, máx ~500KB).
 * WhatsApp sigue convirtiendo desde URL en envío (webp → jpg temporal).
 */
async function optimizarImagenFlujoStorage(buffer, mime, originalname = "") {
  const mimeOriginal = resolverMimeImagen({
    mimetype: mime,
    originalname,
  });

  console.log("📤 preparando imagen");
  console.log("🖼 MIME ORIGINAL:", mimeOriginal);

  if (!mimeOriginal.startsWith("image/")) {
    throw new Error("El archivo no es una imagen válida");
  }

  console.log("🖼 optimizando webp");

  let trabajo = buffer;

  for (let i = 0; i < PASOS_OPTIMIZACION.length; i++) {
    const paso = PASOS_OPTIMIZACION[i];
    let img = sharp(trabajo, { failOn: "none" }).rotate();

    if (paso.width) {
      img = img.resize({ width: paso.width, withoutEnlargement: true });
    } else if (i === 0) {
      const meta = await sharp(trabajo, { failOn: "none" }).metadata();
      if (meta.width && meta.width > 1600) {
        img = img.resize({ width: 1600, withoutEnlargement: true });
      }
    }

    trabajo = await img.webp({ quality: paso.quality, effort: 4 }).toBuffer();

    if (trabajo.length <= MAX_OUTPUT_BYTES) {
      console.log(
        "✅ convertido a webp (" + Math.round(trabajo.length / 1024) + " KB)"
      );
      return {
        buffer: trabajo,
        mimetype: "image/webp",
        extension: "webp",
      };
    }
  }

  trabajo = await sharp(trabajo, { failOn: "none" })
    .rotate()
    .resize({ width: 1000, withoutEnlargement: true })
    .webp({ quality: 55, effort: 4 })
    .toBuffer();

  console.log(
    "✅ convertido a webp (" + Math.round(trabajo.length / 1024) + " KB, fallback)"
  );

  return {
    buffer: trabajo,
    mimetype: "image/webp",
    extension: "webp",
  };
}

module.exports = {
  optimizarImagenFlujoStorage,
  MAX_OUTPUT_BYTES,
};
