const express = require("express");

const { protegerPanel } = require("../middlewares/auth");
const {
  crearUploadPorTipo,
  recibirArchivo,
  limiteSubidaPanel,
} = require("../middlewares/uploadMemoriaLimitada");
const { LIMITE_VIDEO_BYTES } = require("../services/mediaRamLimits");
const {
  subirArchivoSeguimientoV2Media,
  verificarEstadoStorageSeguimientoV2,
} = require("../services/seguimientoV2/seguimientoV2MediaStorage");

const router = express.Router();

const upload = crearUploadPorTipo(limiteSubidaPanel, LIMITE_VIDEO_BYTES);

function responderLimiteSeguimiento(req, res) {
  const file = {
    mimetype: req._mediaUploadMime,
    originalname: req._mediaUploadName,
  };
  const mb = Math.round(limiteSubidaPanel(file) / (1024 * 1024));
  return res.status(400).json({
    ok: false,
    error: `El archivo supera el máximo de ${mb} MB`,
  });
}

function leerConexionWhatsappId(req) {
  const raw =
    req.body?.conexion_whatsapp_id ??
    req.body?.conexionWhatsappId ??
    req.query?.conexion_whatsapp_id;
  if (raw == null || String(raw).trim() === "") return null;
  return String(raw).trim();
}

router.get("/api/seguimiento-v2/storage-status", protegerPanel, async (_req, res) => {
  try {
    const estado = await verificarEstadoStorageSeguimientoV2();
    res.json({
      bucketExists: !!estado.bucketExists,
      publicUrlReady: !!estado.publicUrlReady,
      configured: estado.configured !== false,
      bucket: estado.bucket,
      message: estado.message || null,
    });
  } catch (error) {
    console.error("[SEGV2_STORAGE] error:", error.message);
    res.status(500).json({
      bucketExists: false,
      publicUrlReady: false,
      configured: false,
      message: error.message || "Error verificando Storage",
    });
  }
});

router.post(
  "/api/seguimiento-v2/upload-media",
  protegerPanel,
  recibirArchivo(upload, responderLimiteSeguimiento, {
    campo: "file",
    onMulter(err, _req, res) {
      return res.status(400).json({
        ok: false,
        error: err.message || "Error al subir archivo",
      });
    },
  }),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, error: "No se recibió archivo" });
      }

      const tipo = String(req.body?.tipo || "").toLowerCase();
      if (!["imagen", "video", "audio", "documento"].includes(tipo)) {
        return res.status(400).json({ ok: false, error: "Tipo de media inválido" });
      }

      const conexionWhatsappId = leerConexionWhatsappId(req);
      if (!conexionWhatsappId) {
        return res.status(400).json({
          ok: false,
          error: "Falta conexion_whatsapp_id",
        });
      }

      const resultado = await subirArchivoSeguimientoV2Media(
        req.file,
        tipo,
        req.session.usuario.id,
        conexionWhatsappId
      );

      res.json(resultado);
    } catch (error) {
      const status = error.status || 500;
      console.error("[SEGV2_UPLOAD] error:", error.message);
      res.status(status).json({
        ok: false,
        error: error.message || "Error subiendo archivo",
      });
    }
  }
);

module.exports = router;
