const { procesarSeguimientosVencidos } = require("../services/seguimiento/executeSeguimiento");
const { verificarTablaLockDisponible } = require("../services/seguimiento/seguimientoWorkerLock");

let workerIniciado = false;
let procesando = false;
let intervalId = null;

/** Fallos de config/esquema: apagan el worker. Errores temporales no. */
const MOTIVOS_LOCK_PERMANENTE = ["sin_supabase", "lock_tabla_ausente"];

function esMotivoLockPermanente(motivo) {
  return MOTIVOS_LOCK_PERMANENTE.includes(motivo);
}

function apagarWorkerSeguimiento(motivo) {
  console.log("[SEG_WORKER_NO_LOCK_DISABLED]", {
    pid: process.pid,
    motivo: motivo || "lock_perdido",
  });
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  global.__macbotSeguimientoWorkerIniciado = false;
  workerIniciado = false;
}

async function startSeguimientoWorker(app) {
  if (global.__macbotSeguimientoWorkerIniciado || workerIniciado) {
    console.log("⏱️ Worker de seguimientos ya activo — no se duplica", {
      pid: process.pid,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const lockCheck = await verificarTablaLockDisponible();
  if (!lockCheck.ok) {
    if (!esMotivoLockPermanente(lockCheck.motivo)) {
      console.log("[SEG_WORKER_LOCK_TRANSIENT]", {
        pid: process.pid,
        timestamp: new Date().toISOString(),
        motivo: lockCheck.motivo || "lock_verificacion_fallida",
        fase: "startup",
        accion: "continuar_arranque_intervalo",
      });
    } else {
      console.log("[SEG_WORKER_NO_LOCK_DISABLED]", {
        pid: process.pid,
        timestamp: new Date().toISOString(),
        motivo: lockCheck.motivo,
      });
      return;
    }
  }

  global.__macbotSeguimientoWorkerIniciado = true;
  workerIniciado = true;
  global.__macbotSeguimientoWorkerInstanceId = `seg-${process.pid}-${Date.now()}`;

  const intervaloMs = parseInt(process.env.SEGUIMIENTO_POLL_MS || "15000", 10);

  console.log("[SEG_WORKER_START]", {
    pid: process.pid,
    timestamp: new Date().toISOString(),
    intervalo_ms: intervaloMs,
    worker_instance_id: global.__macbotSeguimientoWorkerInstanceId,
  });

  intervalId = setInterval(async () => {
    if (procesando) return;
    procesando = true;

    try {
      const io = app?.get ? app.get("io") : null;
      const resultado = await procesarSeguimientosVencidos(io, { fromWorker: true });

      if (resultado.lock === "no_lock_db") {
        if (!esMotivoLockPermanente(resultado.motivo)) {
          console.log("[SEG_WORKER_LOCK_TRANSIENT]", {
            pid: process.pid,
            motivo: resultado.motivo || "lock_verificacion_fallida",
            fase: "tick",
            accion: "omitir_ciclo_reintentar",
          });
          return;
        }
        apagarWorkerSeguimiento(resultado.motivo);
        return;
      }

      if (resultado.lock === "skipped") return;

      if (resultado.procesados > 0) {
        console.log(
          "[SEGUIMIENTO_WORKER] tick done:",
          resultado.procesados,
          "procesados,",
          resultado.enviados,
          "enviados"
        );
      }
    } catch (error) {
      console.log(
        "[SEGUIMIENTO_WORKER] error:",
        error.response?.data || error.message
      );
    } finally {
      procesando = false;
    }
  }, intervaloMs);

  console.log("⏱️ Worker de seguimientos activo cada", intervaloMs, "ms");
}

module.exports = {
  startSeguimientoWorker,
  esMotivoLockPermanente,
  MOTIVOS_LOCK_PERMANENTE,
};
