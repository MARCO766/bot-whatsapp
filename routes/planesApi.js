/**
 * API JSON Planes SaaS — lectura del plan del usuario autenticado.
 */
const express = require("express");
const router = express.Router();
const { protegerApi } = require("../middlewares/auth");
const {
  obtenerPlanUsuario,
  obtenerUsoUsuario,
  obtenerCapacidadEfectivaContactos,
  buildMiPlanResponse,
} = require("../services/planesService");
const { obtenerVistaCompraUsuario } = require("../services/macbotContactosService");

function log(msg, extra) {
  if (extra !== undefined) console.log(`[planesApi] ${msg}`, extra);
  else console.log(`[planesApi] ${msg}`);
}

// GET /api/planes/mi-plan
router.get("/api/planes/mi-plan", protegerApi, async (req, res) => {
  try {
    const usuarioId = req.session.usuario.id;
    const email = req.session.usuario.email;
    const [planData, uso, contactosBloques] = await Promise.all([
      obtenerPlanUsuario(usuarioId),
      obtenerUsoUsuario(usuarioId),
      obtenerVistaCompraUsuario(usuarioId, { email }),
    ]);
    const contactosEfectivos = await obtenerCapacidadEfectivaContactos(usuarioId, planData);
    const body = buildMiPlanResponse(planData, uso, { contactos: contactosEfectivos });
    body.contactos_bloques = contactosBloques;
    res.status(200).json(body);
  } catch (error) {
    log("GET /api/planes/mi-plan:", error.message);
    res.status(500).json({
      ok: false,
      error: "No se pudo cargar el plan",
    });
  }
});

module.exports = router;
