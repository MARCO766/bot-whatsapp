const { procesarSeguimientosV2Vencidos } = require("../services/seguimientoV2/seguimientoV2Worker");
const { verificarTablaLockDisponible } = require("../services/seguimientoV2/seguimientoV2WorkerLock");

let workerIniciado = false;
let procesando = false;
let intervalId = null;

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
    console.log("[SEG_V2_WORKER_NO_LOCK_DISABLED]", {
      pid: process.pid,
      timestamp: new Date().toISOString(),
      motivo: lockCheck.motivo,
    });
    return;
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
        console.log("[SEG_V2_WORKER_NO_LOCK_DISABLED]", {
          pid: process.pid,
          motivo: resultado.motivo || "lock_perdido",
        });
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        global.__macbotSeguimientoV2WorkerIniciado = false;
        workerIniciado = false;
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
};
