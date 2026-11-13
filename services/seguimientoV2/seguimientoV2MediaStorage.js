const axios = require("axios");
const path = require("path");
const { randomUUID, createHash } = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = "seguimiento-v2-media";
const BUCKET_COPIA_CONVERSACION = "archivos";
const BUCKETS_ORIGEN_COPIA = new Set([BUCKET, BUCKET_COPIA_CONVERSACION]);

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

const vuelosCopia = new Map();

function segmentoIdentidad(valor) {
  const raw = String(valor || "").trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(raw)) return null;
  return raw;
}

function segmentoNumero(valor) {
  const digits = String(valor || "").replace(/\D/g, "");
  if (!/^\d{8,20}$/.test(digits)) return null;
  return digits;
}

function hashOriginal(bucket, sourceKey) {
  return createHash("sha256").update(`${bucket}/${sourceKey}`).digest("hex").slice(0, 16);
}

function nombreDestinoCopia(hash, sourceKey, jpeg) {
  const base = nombreArchivoSeguro(path.basename(sourceKey)) || "archivo";
  if (!jpeg) return `${hash}-${base.slice(-80)}`;
  const sinExt = base.replace(/\.[^.]+$/, "") || "archivo";
  return `${hash}-${sinExt.slice(-60)}.jpg`;
}

function parseUrlStoragePublica(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  let pathname = "";
  try {
    pathname = new URL(raw).pathname;
  } catch {
    return null;
  }
  const marcador = "/storage/v1/object/public/";
  const idx = pathname.indexOf(marcador);
  if (idx < 0) return null;
  const resto = pathname.slice(idx + marcador.length);
  const slash = resto.indexOf("/");
  if (slash <= 0) return null;
  let bucket = "";
  let key = "";
  try {
    bucket = decodeURIComponent(resto.slice(0, slash));
    key = resto
      .slice(slash + 1)
      .split("/")
      .map((parte) => decodeURIComponent(parte))
      .join("/");
  } catch {
    return null;
  }
  if (!bucket || !key || key.includes("..") || key.startsWith("/")) return null;
  return { bucket, key };
}

function buildRutaCopiaConversacion({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  bucket,
  sourceKey,
  jpeg = false,
}) {
  const usuario = segmentoIdentidad(usuarioId);
  const conexion = segmentoIdentidad(conexionWhatsappId);
  const numero = segmentoNumero(clienteNumero);
  if (!usuario || !conexion || !numero || !bucket || !sourceKey) return null;
  if (sourceKey.includes("..") || sourceKey.startsWith("/")) return null;
  const hash = hashOriginal(bucket, sourceKey);
  const nombre = nombreDestinoCopia(hash, sourceKey, jpeg);
  const key = `whatsapp/${usuario}/segv2/${conexion}/${numero}/${nombre}`;
  const prefijo = `whatsapp/${usuario}/segv2/${conexion}/${numero}/`;
  if (!key.startsWith(prefijo)) return null;
  if (bucket === BUCKET_COPIA_CONVERSACION && key === sourceKey) return null;
  return {
    bucketDestino: BUCKET_COPIA_CONVERSACION,
    key,
    hash,
    usuario,
    conexion,
    numero,
  };
}

function urlPublicaObjeto(supabaseUrl, bucket, key) {
  const base = String(supabaseUrl || "").replace(/\/+$/, "");
  const ruta = key.split("/").map((parte) => encodeURIComponent(parte)).join("/");
  return `${base}/storage/v1/object/public/${bucket}/${ruta}`;
}

function normalizarInfoObjeto(data) {
  if (!data || typeof data !== "object") return null;
  const meta = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
  const size = Number(data.size ?? meta.size);
  const contentType = String(
    data.contentType || data.content_type || meta.mimetype || meta.contentType || ""
  )
    .trim()
    .toLowerCase();
  return {
    size: Number.isFinite(size) ? size : 0,
    contentType,
  };
}

function headersStorage(supabaseKey) {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  };
}

function rutaCodificada(key) {
  return String(key || "")
    .split("/")
    .map((parte) => encodeURIComponent(parte))
    .join("/");
}

async function leerInfoObjeto(http, supabaseUrl, supabaseKey, bucket, key) {
  const headers = headersStorage(supabaseKey);
  const infoUrl = `${supabaseUrl}/storage/v1/object/info/${bucket}/${rutaCodificada(key)}`;
  try {
    const res = await http.get(infoUrl, {
      headers,
      validateStatus: (status) => status < 500,
    });
    if (res && res.status === 200) {
      const info = normalizarInfoObjeto(res.data);
      if (info && info.size > 0) return info;
    }
  } catch {
    /* el listado de abajo cubre APIs que no exponen /object/info */
  }

  const slash = key.lastIndexOf("/");
  const dir = slash >= 0 ? key.slice(0, slash) : "";
  const name = slash >= 0 ? key.slice(slash + 1) : key;
  try {
    const res = await http.post(
      `${supabaseUrl}/storage/v1/object/list/${bucket}`,
      {
        prefix: dir,
        limit: 100,
        search: name,
        sortBy: { column: "name", order: "asc" },
      },
      {
        headers: { ...headers, "Content-Type": "application/json" },
        validateStatus: (status) => status < 500,
      }
    );
    if (res && res.status === 200 && Array.isArray(res.data)) {
      const item = res.data.find((row) => row && row.name === name && row.id != null);
      const info = normalizarInfoObjeto(item);
      if (info && info.size > 0) return info;
    }
  } catch {
    /* sigue el HEAD público */
  }

  if (typeof http.head !== "function") return null;
  try {
    const res = await http.head(urlPublicaObjeto(supabaseUrl, bucket, key), {
      validateStatus: (status) => status < 500,
      maxRedirects: 5,
    });
    if (!res || res.status < 200 || res.status >= 300) return null;
    const headers = res.headers || {};
    const size = Number(headers["content-length"] || headers["Content-Length"]);
    const contentType = String(headers["content-type"] || headers["Content-Type"] || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!Number.isFinite(size) || size <= 0) return null;
    return { size, contentType };
  } catch {
    return null;
  }
}

function debeConvertirAJpeg(tipo, info, sourceKey) {
  if (tipo !== "image") return false;
  const mime = String(info?.contentType || "").toLowerCase();
  if (mime === "image/jpeg" || mime === "image/jpg" || mime === "image/png") return false;
  if (mime.startsWith("image/")) return true;
  const ext = path.extname(sourceKey).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".png") return false;
  if (ext === ".webp" || ext === ".bmp" || ext === ".heic" || ext === ".heif" || ext === ".gif") {
    return true;
  }
  return false;
}

function copiaByteCorrecta(infoDestino, infoOrigen) {
  if (!infoDestino || !infoOrigen) return false;
  if (!(infoDestino.size > 0) || infoDestino.size !== infoOrigen.size) return false;
  if (infoDestino.contentType && infoOrigen.contentType) {
    return infoDestino.contentType === infoOrigen.contentType;
  }
  return true;
}

function jpegCorrecto(infoDestino) {
  return Boolean(infoDestino && infoDestino.size > 0 && infoDestino.contentType === "image/jpeg");
}

function esImagenListaParaMeta(info, sourceKey) {
  const mime = String(info?.contentType || "").toLowerCase();
  if (mime === "image/jpeg" || mime === "image/jpg" || mime === "image/png") return true;
  if (mime) return false;
  const ext = path.extname(sourceKey || "").toLowerCase();
  return ext === ".jpg" || ext === ".jpeg" || ext === ".png";
}

function resultadoOriginal(mediaUrl, motivo) {
  console.log("[SEG_V2_MEDIA]", { resultado: "original", motivo });
  return {
    ok: false,
    lista: false,
    usoOriginal: true,
    publicUrl: String(mediaUrl || ""),
    motivo,
    enlaceListo: false,
    reutilizada: false,
  };
}

function resultadoCopia(publicUrl, { reutilizada, enlaceListo }) {
  console.log("[SEG_V2_MEDIA]", { resultado: "copia", reutilizada: Boolean(reutilizada) });
  return {
    ok: true,
    lista: true,
    usoOriginal: false,
    publicUrl,
    motivo: reutilizada ? "reutilizada" : "creada",
    enlaceListo: Boolean(enlaceListo),
    reutilizada: Boolean(reutilizada),
  };
}

function esConflictoCopia(status, data) {
  if (status === 409) return true;
  const texto = typeof data === "string" ? data : JSON.stringify(data || "");
  return /already exists|duplicate|resource already/i.test(texto);
}

async function conVueloCopia(clave, tarea) {
  const previo = vuelosCopia.get(clave);
  if (previo) return previo;
  const promesa = Promise.resolve()
    .then(tarea)
    .finally(() => {
      if (vuelosCopia.get(clave) === promesa) vuelosCopia.delete(clave);
    });
  vuelosCopia.set(clave, promesa);
  return promesa;
}

function resetVuelosCopiaSeguimientoV2() {
  vuelosCopia.clear();
}

async function ejecutarCopiaConversacion(params, deps) {
  const mediaUrl = String(params.mediaUrl || "").trim();
  const http = deps.http || axios;
  const supabaseUrl = String(deps.supabaseUrl || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const supabaseKey = deps.supabaseKey || process.env.SUPABASE_SECRET_KEY;
  const preparar = deps.prepararImagenParaWhatsApp || require("../imageWhatsAppService").prepararImagenParaWhatsApp;

  if (!supabaseUrl || !supabaseKey) return resultadoOriginal(mediaUrl, "fallback_config");

  const parsed = parseUrlStoragePublica(mediaUrl);
  if (!parsed || !BUCKETS_ORIGEN_COPIA.has(parsed.bucket)) {
    return resultadoOriginal(mediaUrl, "fallback_url");
  }

  const infoOrigen = await leerInfoObjeto(
    http,
    supabaseUrl,
    supabaseKey,
    parsed.bucket,
    parsed.key
  );
  if (!infoOrigen || !(infoOrigen.size > 0)) {
    return resultadoOriginal(mediaUrl, "fallback_origen");
  }

  const jpeg = debeConvertirAJpeg(params.tipo, infoOrigen, parsed.key);
  const ruta = buildRutaCopiaConversacion({
    usuarioId: params.usuarioId,
    conexionWhatsappId: params.conexionWhatsappId,
    clienteNumero: params.clienteNumero,
    bucket: parsed.bucket,
    sourceKey: parsed.key,
    jpeg,
  });
  if (!ruta || ruta.bucketDestino !== BUCKET_COPIA_CONVERSACION) {
    return resultadoOriginal(mediaUrl, "fallback_destino");
  }
  if (parsed.bucket === BUCKET_COPIA_CONVERSACION && parsed.key === ruta.key) {
    return resultadoOriginal(mediaUrl, "fallback_destino");
  }
  if (!ruta.key.startsWith("whatsapp/") || ruta.key.includes("..")) {
    return resultadoOriginal(mediaUrl, "fallback_destino");
  }

  const infoDestino = await leerInfoObjeto(
    http,
    supabaseUrl,
    supabaseKey,
    ruta.bucketDestino,
    ruta.key
  );
  const correcta = jpeg ? jpegCorrecto(infoDestino) : copiaByteCorrecta(infoDestino, infoOrigen);
  if (infoDestino && !correcta) {
    return resultadoOriginal(mediaUrl, "fallback_no_verificada");
  }
  if (infoDestino && correcta) {
    return resultadoCopia(urlPublicaObjeto(supabaseUrl, ruta.bucketDestino, ruta.key), {
      reutilizada: true,
      enlaceListo: params.tipo === "image" && (jpeg || esImagenListaParaMeta(infoDestino, parsed.key)),
    });
  }

  const headers = {
    ...headersStorage(supabaseKey),
    "x-upsert": "false",
  };

  if (jpeg) {
    let descargado;
    try {
      descargado = await http.get(
        `${supabaseUrl}/storage/v1/object/${parsed.bucket}/${rutaCodificada(parsed.key)}`,
        {
          headers: headersStorage(supabaseKey),
          responseType: "arraybuffer",
          validateStatus: (status) => status < 500,
        }
      );
    } catch {
      return resultadoOriginal(mediaUrl, "fallback_copia");
    }
    if (!descargado || descargado.status !== 200 || !descargado.data) {
      return resultadoOriginal(mediaUrl, "fallback_copia");
    }
    let preparado;
    try {
      const buffer = Buffer.isBuffer(descargado.data)
        ? descargado.data
        : Buffer.from(descargado.data);
      preparado = await preparar(buffer, infoOrigen.contentType, path.basename(parsed.key));
    } catch {
      return resultadoOriginal(mediaUrl, "fallback_copia");
    }
    if (!preparado || preparado.mimetype !== "image/jpeg" || !preparado.buffer) {
      return resultadoOriginal(mediaUrl, "fallback_copia");
    }
    let subida;
    try {
      subida = await http.post(
        `${supabaseUrl}/storage/v1/object/${ruta.bucketDestino}/${rutaCodificada(ruta.key)}`,
        preparado.buffer,
        {
          headers: { ...headers, "Content-Type": "image/jpeg" },
          validateStatus: (status) => status < 500,
        }
      );
    } catch {
      return resultadoOriginal(mediaUrl, "fallback_copia");
    }
    const status = subida?.status || 0;
    const conflicto = esConflictoCopia(status, subida?.data);
    if (!(status >= 200 && status < 300) && !conflicto) {
      return resultadoOriginal(mediaUrl, "fallback_copia");
    }
    const verificada = await leerInfoObjeto(
      http,
      supabaseUrl,
      supabaseKey,
      ruta.bucketDestino,
      ruta.key
    );
    if (conflicto) {
      if (!jpegCorrecto(verificada)) {
        return resultadoOriginal(mediaUrl, "fallback_no_verificada");
      }
      return resultadoCopia(urlPublicaObjeto(supabaseUrl, ruta.bucketDestino, ruta.key), {
        reutilizada: true,
        enlaceListo: true,
      });
    }
    if (verificada && !jpegCorrecto(verificada)) {
      return resultadoOriginal(mediaUrl, "fallback_no_verificada");
    }
    return resultadoCopia(urlPublicaObjeto(supabaseUrl, ruta.bucketDestino, ruta.key), {
      reutilizada: false,
      enlaceListo: true,
    });
  }

  let copiado;
  try {
    copiado = await http.post(
      `${supabaseUrl}/storage/v1/object/copy`,
      {
        bucketId: parsed.bucket,
        sourceKey: parsed.key,
        destinationBucket: ruta.bucketDestino,
        destinationKey: ruta.key,
      },
      {
        headers: { ...headers, "Content-Type": "application/json" },
        validateStatus: (status) => status < 500,
      }
    );
  } catch {
    return resultadoOriginal(mediaUrl, "fallback_copia");
  }

  const status = copiado?.status || 0;
  const conflicto = esConflictoCopia(status, copiado?.data);
  if (!(status >= 200 && status < 300) && !conflicto) {
    return resultadoOriginal(mediaUrl, "fallback_copia");
  }

  const verificada = await leerInfoObjeto(
    http,
    supabaseUrl,
    supabaseKey,
    ruta.bucketDestino,
    ruta.key
  );
  if (conflicto) {
    if (!copiaByteCorrecta(verificada, infoOrigen)) {
      return resultadoOriginal(mediaUrl, "fallback_no_verificada");
    }
    return resultadoCopia(urlPublicaObjeto(supabaseUrl, ruta.bucketDestino, ruta.key), {
      reutilizada: true,
      enlaceListo: params.tipo === "image" && esImagenListaParaMeta(verificada, parsed.key),
    });
  }
  if (verificada && !copiaByteCorrecta(verificada, infoOrigen)) {
    return resultadoOriginal(mediaUrl, "fallback_no_verificada");
  }
  return resultadoCopia(urlPublicaObjeto(supabaseUrl, ruta.bucketDestino, ruta.key), {
    reutilizada: false,
    enlaceListo: params.tipo === "image" && esImagenListaParaMeta(verificada || infoOrigen, parsed.key),
  });
}

async function asegurarCopiaConversacionSeguimientoV2(params = {}, deps = {}) {
  const mediaUrl = String(params.mediaUrl || "").trim();
  try {
    const parsed = parseUrlStoragePublica(mediaUrl);
    if (!parsed || !BUCKETS_ORIGEN_COPIA.has(parsed.bucket)) {
      return resultadoOriginal(mediaUrl, "fallback_url");
    }
    const ruta = buildRutaCopiaConversacion({
      usuarioId: params.usuarioId,
      conexionWhatsappId: params.conexionWhatsappId,
      clienteNumero: params.clienteNumero,
      bucket: parsed.bucket,
      sourceKey: parsed.key,
      jpeg: false,
    });
    if (!ruta) return resultadoOriginal(mediaUrl, "fallback_identidad");
    return await conVueloCopia(`${ruta.key}|${params.tipo || ""}`, () =>
      ejecutarCopiaConversacion(params, deps)
    );
  } catch {
    return resultadoOriginal(mediaUrl, "fallback_copia");
  }
}

module.exports = {
  BUCKET_SEGUIMIENTO_V2_MEDIA: BUCKET,
  BUCKET_COPIA_CONVERSACION,
  LIMITES_SEGUIMIENTO_V2_MEDIA: LIMITES,
  EXT_BLOQUEADAS_SEGUIMIENTO_V2: EXT_BLOQUEADAS,
  validarArchivoSeguimientoV2,
  subirArchivoSeguimientoV2Media,
  verificarEstadoStorageSeguimientoV2,
  parseUrlStoragePublica,
  buildRutaCopiaConversacion,
  asegurarCopiaConversacionSeguimientoV2,
  resetVuelosCopiaSeguimientoV2,
};
