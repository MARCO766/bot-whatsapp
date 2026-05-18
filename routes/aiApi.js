/**
 * API segura — IA híbrida (local + OpenAI opcional).
 */
const express = require("express");
const router = express.Router();
const {
  runAI,
  getIAStatus,
  MODOS_FASE1,
  normalizarConfig,
} = require("../services/aiService");

function protegerApi(req, res, next) {
  if (req.session?.usuario?.id) return next();
  return res.status(401).json({ ok: false, error: "No autenticado" });
}

router.get("/api/ai/status", protegerApi, (req, res) => {
  res.json(getIAStatus());
});

router.post("/api/ai/run", protegerApi, async (req, res) => {
  try {
    const body = req.body || {};
    const modo = body.modo || body.config?.modo;

    if (modo && !MODOS_FASE1.has(modo)) {
      return res.status(400).json({
        ok: false,
        error: "Modo IA no válido",
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

router.post("/api/ai/test", protegerApi, async (req, res) => {
  try {
    const body = req.body || {};
    const config = normalizarConfig(body.config || body);
    const mensaje =
      body.ultimo_mensaje || body.mensaje || body.mensajePrueba || "";

    const result = await runAI({
      config,
      ultimo_mensaje: mensaje,
      nombre: body.nombre || "Cliente prueba",
      telefono: body.telefono || "0000000000",
      intent: body.intent,
      score: body.score,
    });

    res.json({
      ...result,
      mensajePrueba: mensaje,
      deteccion: result.context?.intent || result.context?.ai?.intent,
      score: result.context?.score || result.context?.ai?.score,
    });
  } catch (error) {
    console.log("[aiApi] POST /api/ai/test:", error.message);
    res.status(500).json({
      ok: false,
      error: error.message || "Error en prueba IA",
    });
  }
});

module.exports = router;
