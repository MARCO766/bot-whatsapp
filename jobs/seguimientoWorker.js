const { procesarSeguimientosVencidos } = require("../services/seguimiento/executeSeguimiento");

let workerIniciado = false;
let procesando = false;

function startSeguimientoWorker(app) {
  if (global.__macbotSeguimientoWorkerIniciado || workerIniciado) {
    console.log("⏱️ Worker de seguimientos ya activo — no se duplica");
    return;
  }
  global.__macbotSeguimientoWorkerIniciado = true;
  workerIniciado = true;

  const intervaloMs = parseInt(process.env.SEGUIMIENTO_POLL_MS || "15000", 10);

  setInterval(async () => {
    if (procesando) return;
    procesando = true;

    try {
      const io = app?.get ? app.get("io") : null;
      const resultado = await procesarSeguimientosVencidos(io);

      if (resultado.procesados > 0) {
        console.log("⏱️ Worker seguimientos:", resultado.procesados, "procesados");
      }
    } catch (error) {
      console.log(
        "ERROR worker seguimientos:",
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
