/**
 * API onboarding MacBot — estado de primera conexión WhatsApp.
 */
const express = require("express");
const router = express.Router();
const { protegerApi } = require("../middlewares/auth");
const { obtenerEstadoOnboarding } = require("../services/onboardingService");

function log(msg, extra) {
  if (extra !== undefined) console.log(`[onboardingApi] ${msg}`, extra);
  else console.log(`[onboardingApi] ${msg}`);
}

// GET /api/onboarding/estado
router.get("/api/onboarding/estado", protegerApi, async (req, res) => {
  try {
    const usuarioId = req.session.usuario.id;
    const onboarding = await obtenerEstadoOnboarding(usuarioId);
    res.status(200).json({ ok: true, onboarding });
  } catch (error) {
    log("GET /api/onboarding/estado:", error.response?.data || error.message);
    res.status(500).json({
      ok: false,
      error: "No se pudo cargar el estado de onboarding",
    });
  }
});

module.exports = router;
