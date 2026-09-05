const axios = require("axios");
const path = require("path");
const { randomUUID } = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = "seguimiento-v2-media";

const LIMITES = {
  imagen: { maxBytes: 2 * 1024 * 1024 },
  audio: { maxBytes: 5 * 1024 * 1024 },
  video: { maxBytes: 15 * 1024 * 1024 },
  documento: { maxBytes: 5 * 1024 * 1024 },
};

const EXT_BLOQUEADAS = [".exe", ".bat", ".cmd", ".js", ".sh"];

const MIME_BLOQUEADOS = new Set([
  "application/javascript",
  "application/x-javascript",
  "text/javascript",
  "application/x-sh",
  "application/x-bat",
  "application/x-msdownload",
]);

function extnameSeguro(name) {
  return path.extname(String(name || "")).toLowerCase();
}

function nombreArchivoSeguro(originalname) {
  return String(originalname || "archivo").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function esExtensionBloqueada(filename) {
  const ext = extnameSeguro(filename);
  return EXT_BLOQUEADAS.includes(ext);
}

function mimePermitidoPorTipo(mime, tipo) {
  const m = String(mime || "").toLowerCase();
  if (!m || MIME_BLOQUEADOS.has(m)) return false;

  if (tipo === "imagen") return m.startsWith("image/");
  if (tipo === "audio") return m.startsWith("audio/");
  if (tipo === "video") return m.startsWith("video/");
  if (tipo === "documento") {
    return m.startsWith("application/") || m.startsWith("text/");
  }
  return false;
}

function validarArchivoSeguimientoV2(file, tipo) {
  const reglas = LIMITES[tipo];
  if (!reglas) {
    return { ok: false, error: "Tipo de media no soportado" };
  }
  if (!file) {
    return { ok: false, error: "No se recibió archivo" };
  }

  const nombre = String(file.originalname || "");
  if (esExtensionBloqueada(nombre)) {
    return { ok: false, error: "Tipo de archivo no permitido" };
  }

  if (file.size > reglas.maxBytes) {
    const mb = Math.round(reglas.maxBytes / (1024 * 1024));
    return { ok: false, error: `El archivo supera el máximo de ${mb} MB` };
  }

  const mime = String(file.mimetype || "").toLowerCase();
  if (!mimePermitidoPorTipo(mime, tipo)) {
    return { ok: false, error: `Formato no permitido para ${tipo}` };
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

function buildUploadPath(usuarioId, conexionWhatsappId, originalname) {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const safeName = nombreArchivoSeguro(originalname);
  const uuid = randomUUID();
  return `${usuarioId}/${conexionWhatsappId}/${yyyy}/${mm}/${uuid}-${safeName}`;
}

async function subirArchivoSeguimientoV2Media(file, tipo, usuarioId, conexionWhatsappId) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase no configurado en el servidor");
  }
  if (!usuarioId) {
    const err = new Error("Falta usuario autenticado");
    err.status = 401;
    throw err;
  }
  if (!conexionWhatsappId) {
    const err = new Error("Falta conexion_whatsapp_id");
    err.status = 400;
    throw err;
  }

  const validacion = validarArchivoSeguimientoV2(file, tipo);
  if (!validacion.ok) {
    const err = new Error(validacion.error);
    err.status = 400;
    throw err;
  }

  const uploadPath = buildUploadPath(usuarioId, conexionWhatsappId, file.originalname);
  const mime = file.mimetype || "application/octet-stream";

  try {
    await axios.post(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${uploadPath}`,
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
    console.error("[SEGV2_UPLOAD] error:", detail, uploadErr.response?.data);
    const err = new Error(detail);
    err.status = uploadErr.response?.status || 500;
    throw err;
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${uploadPath}`;

  return {
    ok: true,
    publicUrl,
    path: uploadPath,
    filename: file.originalname || path.basename(uploadPath),
    size: file.size,
    mimeType: mime,
  };
}

async function verificarEstadoStorageSeguimientoV2() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return {
      bucketExists: false,
      publicUrlReady: false,
      configured: false,
      message: "Supabase no configurado en el servidor",
    };
  }

  let bucketExists = false;
  let bucketPublic = false;

  try {
    const res = await axios.get(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      validateStatus: function (status) {
        return status < 500;
      },
    });

    if (res.status === 200 && res.data) {
      bucketExists = true;
      bucketPublic = res.data.public === true;
    }
  } catch (err) {
    const status = err?.response?.status;
    if (status !== 404) {
      console.error("[SEGV2_STORAGE] error verificando bucket:", mensajeErrorSupabase(err));
    }
  }

  return {
    bucketExists,
    publicUrlReady: bucketExists && bucketPublic,
    configured: true,
    bucket: BUCKET,
    message: !bucketExists
      ? `Bucket ${BUCKET} no encontrado. Créalo como público en Supabase Storage.`
      : !bucketPublic
        ? `Bucket ${BUCKET} existe pero no es público. Configúralo como público en Supabase Storage.`
        : null,
  };
}

module.exports = {
  BUCKET_SEGUIMIENTO_V2_MEDIA: BUCKET,
  LIMITES_SEGUIMIENTO_V2_MEDIA: LIMITES,
  EXT_BLOQUEADAS_SEGUIMIENTO_V2: EXT_BLOQUEADAS,
  validarArchivoSeguimientoV2,
  subirArchivoSeguimientoV2Media,
  verificarEstadoStorageSeguimientoV2,
};
