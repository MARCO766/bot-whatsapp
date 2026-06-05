const { procesarSeguimientosVencidos } = require("../services/seguimiento/executeSeguimiento");
const { verificarTablaLockDisponible } = require("../services/seguimiento/seguimientoWorkerLock");

let workerIniciado = false;
let procesando = false;
let intervalId = null;

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
    console.log("[SEG_WORKER_NO_LOCK_DISABLED]", {
      pid: process.pid,
      timestamp: new Date().toISOString(),
      motivo: lockCheck.motivo,
    });
    return;
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
        console.log("[SEG_WORKER_NO_LOCK_DISABLED]", {
          pid: process.pid,
          motivo: resultado.motivo || "lock_perdido",
        });
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        global.__macbotSeguimientoWorkerIniciado = false;
        workerIniciado = false;
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
};
