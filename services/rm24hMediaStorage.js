const axios = require("axios");
const path = require("path");
const { esArchivoImagen, prepararImagenParaWhatsApp } = require("./imageWhatsAppService");
const { optimizarImagenFlujoStorage } = require("./flowImageStorageService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = "rm24h-media";

const LIMITES = {
  imagen: {
    maxBytes: 2 * 1024 * 1024,
    mimes: ["image/jpeg", "image/png", "image/webp"],
    exts: [".jpg", ".jpeg", ".png", ".webp"],
  },
  video: {
    maxBytes: 15 * 1024 * 1024,
    mimes: ["video/mp4"],
    exts: [".mp4"],
  },
  audio: {
    maxBytes: 5 * 1024 * 1024,
    mimes: ["audio/mpeg", "audio/mp3", "audio/ogg", "audio/mp4", "audio/x-m4a"],
    exts: [".mp3", ".ogg", ".m4a"],
  },
  documento: {
    maxBytes: 8 * 1024 * 1024,
    mimes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    exts: [".pdf", ".doc", ".docx"],
  },
};

function extnameSeguro(name) {
  const ext = path.extname(String(name || "")).toLowerCase();
  return ext || "";
}

function nombreSeguro(originalname) {
  const base = path
    .basename(String(originalname || "archivo"), extnameSeguro(originalname))
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 80);
  return base || "archivo";
}

function validarArchivoRm24h(file, tipo) {
  const reglas = LIMITES[tipo];
  if (!reglas) {
    return { ok: false, error: "Tipo de media no soportado" };
  }
  if (!file) {
    return { ok: false, error: "No se recibió archivo" };
  }

  const ext = extnameSeguro(file.originalname);
  const mime = String(file.mimetype || "").toLowerCase();

  if (file.size > reglas.maxBytes) {
    const mb = Math.round(reglas.maxBytes / (1024 * 1024));
    return { ok: false, error: `El archivo supera el máximo de ${mb} MB` };
  }

  const extOk = reglas.exts.includes(ext);
  const mimeOk = reglas.mimes.some((m) => mime === m || mime.startsWith(m.split("/")[0] + "/"));

  if (tipo === "imagen" && esArchivoImagen(file)) {
    return { ok: true };
  }

  if (!extOk && !mimeOk) {
    return {
      ok: false,
      error: `Formato no permitido. Usa: ${reglas.exts.join(", ")}`,
    };
  }

  return { ok: true };
}

async function prepararBufferSubida(file, tipo) {
  if (tipo === "imagen") {
    if (file.size <= LIMITES.imagen.maxBytes && extnameSeguro(file.originalname) === ".webp") {
      try {
        return await optimizarImagenFlujoStorage(
          file.buffer,
          file.mimetype,
          file.originalname
        );
      } catch {
        /* fallback preparar */
      }
    }
    try {
      const prep = await prepararImagenParaWhatsApp(
        file.buffer,
        file.mimetype,
        file.originalname
      );
      if (prep.buffer.length > LIMITES.imagen.maxBytes) {
        return optimizarImagenFlujoStorage(file.buffer, file.mimetype, file.originalname);
      }
      return {
        buffer: prep.buffer,
        mimetype: prep.mimetype,
        extension: prep.extension,
      };
    } catch {
      return optimizarImagenFlujoStorage(file.buffer, file.mimetype, file.originalname);
    }
  }

  const ext = extnameSeguro(file.originalname) || LIMITES[tipo].exts[0];
  return {
    buffer: file.buffer,
    mimetype: file.mimetype || "application/octet-stream",
    extension: ext.replace(/^\./, ""),
  };
}

async function subirArchivoRm24hMedia(file, tipo, usuarioId) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase no configurado en el servidor");
  }

  const validacion = validarArchivoRm24h(file, tipo);
  if (!validacion.ok) {
    const err = new Error(validacion.error);
    err.status = 400;
    throw err;
  }

  const preparado = await prepararBufferSubida(file, tipo);
  const uid = usuarioId ? String(usuarioId).trim() : "";
  const carpeta = uid ? `rm24h/${uid}` : "rm24h/global";
  const nombreArchivo =
    Date.now() +
    "-" +
    Math.random().toString(36).slice(2, 8) +
    "-" +
    nombreSeguro(file.originalname) +
    "." +
    preparado.extension;

  const ruta = `${carpeta}/${nombreArchivo}`;

  await axios.post(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${ruta}`,
    preparado.buffer,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": preparado.mimetype,
        "x-upsert": "true",
      },
    }
  );

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${ruta}`;

  return {
    ok: true,
    url: publicUrl,
    path: ruta,
    filename: file.originalname || nombreArchivo,
    mimetype: preparado.mimetype,
    tipo,
  };
}

module.exports = {
  BUCKET_RM24H_MEDIA: BUCKET,
  LIMITES_RM24H_MEDIA: LIMITES,
  validarArchivoRm24h,
  subirArchivoRm24hMedia,
};
