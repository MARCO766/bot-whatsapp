const axios = require("axios");
const path = require("path");

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
  return path.extname(String(name || "")).toLowerCase();
}

function nombreArchivoSeguro(originalname) {
  return String(originalname || "archivo").replace(/[^a-zA-Z0-9._-]+/g, "-");
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
  const mimeOk = reglas.mimes.some((m) => mime === m);

  if (!extOk && !mimeOk) {
    return {
      ok: false,
      error: `Formato no permitido. Usa: ${reglas.exts.join(", ")}`,
    };
  }

  return { ok: true };
}

function mensajeErrorSupabase(err) {
  const body = err?.response?.data;
  if (typeof body === "string" && body.trim()) return body;
  if (body && typeof body === "object") {
    return body.message || body.error || body.statusCode || JSON.stringify(body);
  }
  return err?.message || "Error subiendo a Storage";
}

function buildUploadPath(originalname) {
  const safeName = nombreArchivoSeguro(originalname);
  return `rm24h/test-${Date.now()}-${safeName}`;
}

async function subirArchivoRm24hMedia(file, tipo) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase no configurado en el servidor");
  }

  const validacion = validarArchivoRm24h(file, tipo);
  if (!validacion.ok) {
    const err = new Error(validacion.error);
    err.status = 400;
    throw err;
  }

  const bucketName = BUCKET;
  const uploadPath = buildUploadPath(file.originalname);
  const mime = file.mimetype || "application/octet-stream";

  console.log("[RM24H_UPLOAD] file:", {
    name: file.originalname,
    size: file.size,
    mimetype: mime,
    tipo,
  });
  console.log("[RM24H_UPLOAD] bucket:", bucketName);
  console.log("[RM24H_UPLOAD] path:", uploadPath);

  try {
    await axios.post(
      `${SUPABASE_URL}/storage/v1/object/${bucketName}/${uploadPath}`,
      file.buffer,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": mime,
          "x-upsert": "false",
        },
      }
    );
  } catch (uploadErr) {
    const detail = mensajeErrorSupabase(uploadErr);
    console.error("[RM24H_UPLOAD] error:", detail, uploadErr.response?.data);
    const err = new Error(detail);
    err.status = uploadErr.response?.status || 500;
    throw err;
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${uploadPath}`;
  const result = {
    ok: true,
    url: publicUrl,
    path: uploadPath,
    filename: file.originalname || path.basename(uploadPath),
    mimetype: mime,
    tipo,
  };

  console.log("[RM24H_UPLOAD] result:", result);
  return result;
}

module.exports = {
  BUCKET_RM24H_MEDIA: BUCKET,
  LIMITES_RM24H_MEDIA: LIMITES,
  validarArchivoRm24h,
  subirArchivoRm24hMedia,
};
