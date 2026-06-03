/**
 * Endpoints internos para cron externo (RM24H 24/7).
 * Protegidos con CRON_SECRET — no usar sesión de usuario.
 */
const express = require("express");
const router = express.Router();
const { procesarRemarketing24hWorker } = require("../services/remarketing24h/remarketing24hService");

function extraerBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function verificarCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.log("[CRON_RM24H] error CRON_SECRET no configurado");
    return res.status(500).json({
      ok: false,
      error: "CRON_SECRET no configurado",
    });
  }

  const token = extraerBearerToken(req);
  if (!token || token !== secret) {
    console.log("[CRON_RM24H] no autorizado");
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  console.log("[CRON_RM24H] autorizado");
  return next();
}

/** Seguimientos CRM: solo worker interno Node — no cron HTTP externo. */
router.post("/seguimientos", verificarCronSecret, (req, res) => {
  console.log("[CRON_SEGUIMIENTO_LEGACY] rechazado — usar jobs/seguimientoWorker.js");
  return res.status(410).json({
    ok: false,
    error:
      "Cron HTTP de seguimientos deshabilitado. El worker corre solo en el proceso Node (jobs/seguimientoWorker.js).",
  });
});

router.post("/rm24h", verificarCronSecret, async (req, res) => {
  if (global.__rm24hCronRunning) {
    return res.status(409).json({
      ok: false,
      error: "Tick RM24H ya en ejecución",
    });
  }

  global.__rm24hCronRunning = true;
  console.log("[CRON_RM24H] ejecutando tick");

  try {
    const result = await procesarRemarketing24hWorker();
    console.log("[CRON_RM24H] terminado", result);

    return res.json({
      ok: true,
      job: "rm24h",
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (error) {
    console.log("[CRON_RM24H] error", error.response?.data || error.message);
    return res.status(500).json({
      ok: false,
      job: "rm24h",
      error: error.message || "Error ejecutando tick RM24H",
    });
  } finally {
    global.__rm24hCronRunning = false;
  }
});

module.exports = router;
