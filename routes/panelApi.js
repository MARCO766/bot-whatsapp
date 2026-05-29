/**
 * API JSON para pantalla Panel (dashboard operativo CRM).
 */
const express = require("express");
const router = express.Router();
const { computePanelDashboard } = require("../services/panelService");

function protegerApi(req, res, next) {
  if (req.session?.usuario) return next();
  return res.status(401).json({ ok: false, error: "No autenticado" });
}

// GET /api/panel/dashboard
router.get("/api/panel/dashboard", protegerApi, async (req, res) => {
  try {
    const data = await computePanelDashboard(req.session.usuario.id, {
      conexionWhatsappId: req.query.conexion_whatsapp_id || null,
    });
    res.json(data);
  } catch (error) {
    console.log("[panelApi] dashboard:", error.message);
    res.status(500).json({
      ok: false,
      error: "No se pudo cargar el panel",
      sistema: null,
      kpis: null,
      actividad: [],
      leadsSinRespuesta: { total: 0, items: [] },
      embudo: { vacio: true, pasos: [] },
    });
  }
});

module.exports = router;
