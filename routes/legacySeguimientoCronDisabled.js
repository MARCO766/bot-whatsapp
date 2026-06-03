/**
 * Bloquea rutas HTTP legacy de worker de seguimientos (cron-job.org, scripts viejos).
 * El único worker válido es jobs/seguimientoWorker.js en el proceso Node.
 */
const express = require("express");
const router = express.Router();

const RUTAS_LEGACY = [
  "/procesar-seguimientos",
  "/cron/seguimientos",
  "/seguimientos/worker",
  "/api/procesar-seguimientos",
  "/api/cron/seguimientos",
  "/api/seguimientos/worker",
];

function bloquearLegacySeguimientoCron(req, res) {
  console.log("[SEGUIMIENTO_CRON_LEGACY] bloqueado", {
    path: req.path,
    method: req.method,
    ip: req.ip,
  });
  return res.status(410).json({
    ok: false,
    error:
      "Worker de seguimientos CRM deshabilitado por HTTP. Usar worker interno (jobs/seguimientoWorker.js).",
  });
}

for (const ruta of RUTAS_LEGACY) {
  router.all(ruta, bloquearLegacySeguimientoCron);
}

module.exports = router;
