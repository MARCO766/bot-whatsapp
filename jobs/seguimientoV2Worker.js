const { procesarSeguimientosV2Vencidos } = require("../services/seguimientoV2/seguimientoV2Worker");
const { verificarTablaLockDisponible } = require("../services/seguimientoV2/seguimientoV2WorkerLock");

let workerIniciado = false;
let procesando = false;
let intervalId = null;

/** Fallos de config/esquema: apagan el worker. Errores temporales no. */
const MOTIVOS_LOCK_PERMANENTE = ["sin_supabase", "lock_tabla_ausente"];

function esMotivoLockPermanente(motivo) {
  return MOTIVOS_LOCK_PERMANENTE.includes(motivo);
}

function apagarWorkerSeguimientoV2(motivo) {
  console.log("[SEG_V2_WORKER_NO_LOCK_DISABLED]", {
    pid: process.pid,
    motivo: motivo || "lock_perdido",
  });
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  global.__macbotSeguimientoV2WorkerIniciado = false;
  workerIniciado = false;
}

async function startSeguimientoV2Worker(app) {
  if (global.__macbotSeguimientoV2WorkerIniciado || workerIniciado) {
    console.log("⏱️ Worker Seguimiento V2 ya activo — no se duplica", {
      pid: process.pid,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const lockCheck = await verificarTablaLockDisponible();
  if (!lockCheck.ok) {
    if (!esMotivoLockPermanente(lockCheck.motivo)) {
      console.log("[SEG_V2_WORKER_LOCK_TRANSIENT]", {
        pid: process.pid,
        timestamp: new Date().toISOString(),
        motivo: lockCheck.motivo || "lock_verificacion_fallida",
        fase: "startup",
        accion: "continuar_arranque_intervalo",
      });
    } else {
      console.log("[SEG_V2_WORKER_NO_LOCK_DISABLED]", {
        pid: process.pid,
        timestamp: new Date().toISOString(),
        motivo: lockCheck.motivo,
      });
      return;
    }
  }

  global.__macbotSeguimientoV2WorkerIniciado = true;
  workerIniciado = true;
  global.__macbotSeguimientoV2WorkerInstanceId = `segv2-${process.pid}-${Date.now()}`;

  const intervaloMs = parseInt(process.env.SEGUIMIENTO_V2_POLL_MS || "15000", 10);

  console.log("[SEG_V2_WORKER_START]", {
    pid: process.pid,
    timestamp: new Date().toISOString(),
    intervalo_ms: intervaloMs,
    worker_instance_id: global.__macbotSeguimientoV2WorkerInstanceId,
  });

  intervalId = setInterval(async () => {
    if (procesando) return;
    procesando = true;

    try {
      const resultado = await procesarSeguimientosV2Vencidos({ fromWorker: true });

      if (resultado.lock === "no_lock_db") {
        if (!esMotivoLockPermanente(resultado.motivo)) {
          console.log("[SEG_V2_WORKER_LOCK_TRANSIENT]", {
            pid: process.pid,
            motivo: resultado.motivo || "lock_verificacion_fallida",
            fase: "tick",
            accion: "omitir_ciclo_reintentar",
          });
          return;
        }
        apagarWorkerSeguimientoV2(resultado.motivo);
        return;
      }

      if (resultado.lock === "skipped") return;

      if (resultado.procesados > 0) {
        console.log(
          "[SEG_V2_WORKER] tick done:",
          resultado.procesados,
          "procesados,",
          resultado.enviados,
          "enviados"
        );
      }
    } catch (error) {
      console.log(
        "[SEG_V2_WORKER] error:",
        error.response?.data || error.message
      );
    } finally {
      procesando = false;
    }
  }, intervaloMs);

  console.log("⏱️ Worker Seguimiento V2 activo cada", intervaloMs, "ms");
}

module.exports = {
  startSeguimientoV2Worker,
  esMotivoLockPermanente,
  MOTIVOS_LOCK_PERMANENTE,
};
