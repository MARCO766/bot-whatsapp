/**
 * API segura — prueba de nodos IA (solo backend con OPENAI_API_KEY).
 */
const express = require("express");
const router = express.Router();
const { runAI, MODOS_FASE1 } = require("../services/aiService");

function protegerApi(req, res, next) {
  if (req.session?.usuario?.id) return next();
  return res.status(401).json({ ok: false, error: "No autenticado" });
}

router.post("/api/ai/run", protegerApi, async (req, res) => {
  try {
    const body = req.body || {};
    const modo = body.modo || body.config?.modo;

    if (modo && !MODOS_FASE1.has(modo)) {
      return res.status(400).json({
        ok: false,
        error: "Modo IA no válido para fase 1",
        modos: [...MODOS_FASE1],
      });
    }

    const result = await runAI(body);
    res.json(result);
  } catch (error) {
    console.log("[aiApi] POST /api/ai/run:", error.message);
    res.status(500).json({
      ok: false,
      error: error.message || "Error al ejecutar IA",
    });
  }
});

module.exports = router;
