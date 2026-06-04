/**
 * API JSON Planes SaaS — lectura del plan del usuario autenticado.
 */
const express = require("express");
const router = express.Router();
const { protegerApi } = require("../middlewares/auth");
const {
  obtenerPlanUsuario,
  obtenerUsoUsuario,
  buildMiPlanResponse,
} = require("../services/planesService");

function log(msg, extra) {
  if (extra !== undefined) console.log(`[planesApi] ${msg}`, extra);
  else console.log(`[planesApi] ${msg}`);
}

// GET /api/planes/mi-plan
router.get("/api/planes/mi-plan", protegerApi, async (req, res) => {
  try {
    const usuarioId = req.session.usuario.id;
    const [planData, uso] = await Promise.all([
      obtenerPlanUsuario(usuarioId),
      obtenerUsoUsuario(usuarioId),
    ]);
    res.status(200).json(buildMiPlanResponse(planData, uso));
  } catch (error) {
    log("GET /api/planes/mi-plan:", error.message);
    res.status(500).json({
      ok: false,
      error: "No se pudo cargar el plan",
    });
  }
});

module.exports = router;
