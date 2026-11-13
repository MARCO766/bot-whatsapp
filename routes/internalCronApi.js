/**
 * Endpoints internos para cron externo (RM24H 24/7).
 * Protegidos con CRON_SECRET — no usar sesión de usuario.
 */
const express = require("express");
const router = express.Router();
const { procesarRemarketing24hWorker } = require("../services/remarketing24h/remarketing24hService");
const { ejecutarLimpiezaMedia } = require("../services/limpiezaMedia/limpiezaMediaService");
const limpiezaLock = require("../services/limpiezaMedia/limpiezaMediaLock");

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

/**
 * Dry-run manual de limpieza multimedia. No borra objetos ni filas.
 * El recorrido diario es `node scripts/limpieza-media-cron.js`, no esta ruta.
 * Usa el mismo candado durable. Si no puede adquirirlo, no inicia otra pasada.
 */
router.post("/limpieza-media", verificarCronSecret, async (req, res) => {
  if (global.__limpiezaMediaCronRunning) {
    return res.status(409).json({
      ok: false,
      error: "Limpieza de multimedia ya en ejecución",
    });
  }

  const candado = await limpiezaLock.adquirirLockLimpiezaMedia();
  if (!candado.acquired) {
    const ocupado = candado.motivo === "candado_ocupado";
    return res.status(ocupado ? 409 : 503).json({
      ok: false,
      error: ocupado
        ? "Limpieza de multimedia ya en ejecución"
        : "Candado de limpieza no disponible",
      motivo: candado.motivo,
    });
  }

  global.__limpiezaMediaCronRunning = true;
  const vigilancia = { perdido: null };
  const timer = setInterval(() => {
    limpiezaLock.renovarLockLimpiezaMedia(candado.workerId).then((renovacion) => {
      if (!renovacion.ok) vigilancia.perdido = renovacion;
    }).catch((error) => {
      vigilancia.perdido = { ok: false, motivo: error.message || "renovacion_fallida" };
    });
  }, limpiezaLock.RENOVACION_MS);
  if (typeof timer.unref === "function") timer.unref();
  console.log("[LIMPIEZA_MEDIA] ejecutando pasada dry-run");

  try {
    if (vigilancia.perdido) {
      return res.status(409).json({
        ok: false,
        error: "Candado de limpieza perdido",
        motivo: vigilancia.perdido.motivo,
      });
    }
    const result = await ejecutarLimpiezaMedia({
      reiniciar: req.body?.reiniciar === true,
    });
    if (vigilancia.perdido) {
      return res.status(409).json({
        ok: false,
        error: "Candado de limpieza perdido",
        motivo: vigilancia.perdido.motivo,
      });
    }
    return res.json({
      ok: true,
      job: "limpieza-media",
      modo: "dry-run",
      eliminacionReal: "bloqueada",
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (error) {
    console.log("[LIMPIEZA_MEDIA] error", error.message);
    return res.status(500).json({
      ok: false,
      job: "limpieza-media",
      error: error.message || "Error en la simulación de limpieza",
    });
  } finally {
    clearInterval(timer);
    global.__limpiezaMediaCronRunning = false;
    if (!vigilancia.perdido) {
      await limpiezaLock.liberarLockLimpiezaMedia(candado.workerId);
    }
  }
});

module.exports = router;
