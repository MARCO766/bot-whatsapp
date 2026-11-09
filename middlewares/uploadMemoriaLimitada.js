const path = require("path");
const multer = require("multer");
const { esArchivoImagen } = require("../services/imageWhatsAppService");
const {
  LIMITE_IMAGEN_BYTES,
  LIMITE_AUDIO_BYTES,
  LIMITE_VIDEO_BYTES,
  LIMITE_DOCUMENTO_BYTES,
  LIMITE_INBOX_BYTES,
} = require("../services/mediaRamLimits");

const EXT_VIDEO_RM24H = new Set([".mp4"]);
const EXT_AUDIO_RM24H = new Set([".mp3", ".ogg", ".m4a"]);

function anotarArchivo(req, file, cb) {
  req._mediaUploadMime = file.mimetype || "";
  req._mediaUploadName = file.originalname || "";
  cb(null, true);
}

/**
 * Busboy emite límite al alcanzar el tope, también cuando el archivo mide justo eso.
 * Un byte de más permite conservar el máximo exacto y cortar desde el siguiente.
 */
function techoParser(maxBytes) {
  return maxBytes + 1;
}

function crearUploadMemoria(maxBytes) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: techoParser(maxBytes) },
    fileFilter: anotarArchivo,
  });
}

/**
 * Deja de conservar bytes en cuanto el archivo supera el tope de su tipo.
 * El tope de busboy queda un byte por encima del máximo del endpoint, para
 * aceptar un archivo que mide exactamente ese máximo y rechazar el resto
 * mientras todavía llega.
 */
function almacenamientoConTope(resolverMaxBytes) {
  return {
    _handleFile(req, file, cb) {
      const max = resolverMaxBytes(file, req);
      const chunks = [];
      let size = 0;
      let cerrado = false;

      const terminar = (err, info) => {
        if (cerrado) return;
        cerrado = true;
        if (err) cb(err);
        else cb(null, info);
      };

      const rechazar = () => {
        chunks.length = 0;
        size = 0;
        terminar(new multer.MulterError("LIMIT_FILE_SIZE", file.fieldname));
        file.stream.resume();
      };

      file.stream.on("data", (chunk) => {
        if (cerrado) return;
        if (!Number.isFinite(max) || size + chunk.length > max) {
          rechazar();
          return;
        }
        const copia = Buffer.allocUnsafe(chunk.length);
        chunk.copy(copia);
        chunks.push(copia);
        size += copia.length;
      });

      file.stream.on("limit", () => {
        rechazar();
      });

      file.stream.on("error", (err) => {
        chunks.length = 0;
        terminar(err);
      });

      file.stream.on("end", () => {
        if (cerrado) return;
        const buffer = Buffer.concat(chunks, size);
        chunks.length = 0;
        terminar(null, { buffer, size: buffer.length });
      });
    },
    _removeFile(_req, file, cb) {
      if (file) delete file.buffer;
      cb(null);
    },
  };
}

function crearUploadPorTipo(resolverMaxBytes, topeBytes) {
  return multer({
    storage: almacenamientoConTope(resolverMaxBytes),
    limits: { fileSize: techoParser(topeBytes) },
    fileFilter: anotarArchivo,
  });
}

function clasificarSubida(file) {
  const mime = String(file?.mimetype || "").toLowerCase();
  if (mime.startsWith("image/") || esArchivoImagen(file)) return "imagen";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "documento";
}

function limiteSubidaPanel(file) {
  const tipo = clasificarSubida(file);
  if (tipo === "imagen") return LIMITE_IMAGEN_BYTES;
  if (tipo === "video") return LIMITE_VIDEO_BYTES;
  if (tipo === "audio") return LIMITE_AUDIO_BYTES;
  return LIMITE_DOCUMENTO_BYTES;
}

function limiteSubidaInbox(file) {
  if (clasificarSubida(file) === "imagen") return LIMITE_IMAGEN_BYTES;
  return LIMITE_INBOX_BYTES;
}

function limiteSubidaRm24h(file) {
  const tipo = clasificarSubida(file);
  if (tipo !== "documento") return limiteSubidaPanel(file);
  const ext = path.extname(String(file?.originalname || "")).toLowerCase();
  if (EXT_VIDEO_RM24H.has(ext)) return LIMITE_VIDEO_BYTES;
  if (EXT_AUDIO_RM24H.has(ext)) return LIMITE_AUDIO_BYTES;
  return LIMITE_DOCUMENTO_BYTES;
}

function esLimiteMulter(err) {
  return err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
}

/**
 * El tope corre mientras llega el archivo: no entrega req.file al handler
 * si el tipo ya superó su límite.
 */
function recibirArchivo(upload, onLimite, opciones) {
  const campo =
    typeof opciones === "string"
      ? opciones
      : opciones && opciones.campo
        ? opciones.campo
        : "archivo";
  const onMulter =
    opciones && typeof opciones.onMulter === "function" ? opciones.onMulter : null;
  const middleware = upload.single(campo);
  return function uploadConTope(req, res, next) {
    middleware(req, res, (err) => {
      if (!err) return next();
      if (esLimiteMulter(err)) return onLimite(req, res);
      if (err instanceof multer.MulterError) {
        if (onMulter) return onMulter(err, req, res);
        return res.status(400).json({
          error: err.message || "Error al subir archivo",
        });
      }
      return next(err);
    });
  };
}

module.exports = {
  crearUploadMemoria,
  crearUploadPorTipo,
  clasificarSubida,
  limiteSubidaPanel,
  limiteSubidaInbox,
  limiteSubidaRm24h,
  esLimiteMulter,
  recibirArchivo,
};
