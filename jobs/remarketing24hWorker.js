const { procesarVencidosFase1 } = require("../services/remarketing24h/remarketing24hService");

let workerIniciado = false;
let procesando = false;

function startRemarketing24hWorker() {
  if (global.__macbotRemarketing24hWorkerIniciado || workerIniciado) {
    console.log("🔥 Worker RM24H ya activo — no se duplica");
    return;
  }
  global.__macbotRemarketing24hWorkerIniciado = true;
  workerIniciado = true;

  const intervaloMs = parseInt(process.env.RM24H_POLL_MS || "60000", 10);

  setInterval(async () => {
    if (procesando) return;
    procesando = true;

    try {
      const vencidos = await procesarVencidosFase1();
      if (vencidos.length > 0) {
        console.log("🔥 Worker RM24H:", vencidos.length, "contador(es) vencido(s)");
      }
    } catch (error) {
      console.log(
        "ERROR worker RM24H:",
        error.response?.data || error.message
      );
    } finally {
      procesando = false;
    }
  }, intervaloMs);

  console.log("🔥 Worker Remarketing Global 24h activo cada", intervaloMs, "ms (Fase 1: solo logs)");
}

module.exports = {
  startRemarketing24hWorker,
};
