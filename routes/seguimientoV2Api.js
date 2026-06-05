const express = require("express");
const multer = require("multer");

const { protegerPanel } = require("../middlewares/auth");
const { subirArchivoSeguimientoV2Media } = require("../services/seguimientoV2/seguimientoV2MediaStorage");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

function leerConexionWhatsappId(req) {
  const raw =
    req.body?.conexion_whatsapp_id ??
    req.body?.conexionWhatsappId ??
    req.query?.conexion_whatsapp_id;
  if (raw == null || String(raw).trim() === "") return null;
  return String(raw).trim();
}

router.post(
  "/api/seguimiento-v2/upload-media",
  protegerPanel,
  upload.single("file"),
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
