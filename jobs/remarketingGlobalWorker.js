const { procesarRemarketingVencidos } = require("../services/remarketingGlobal/executeRemarketing");

let workerIniciado = false;
let procesando = false;

function startRemarketingGlobalWorker() {
  if (workerIniciado) return;
  workerIniciado = true;

  const intervaloMs = parseInt(
    process.env.REMARKETING_POLL_MS || process.env.SEGUIMIENTO_POLL_MS || "15000",
    10
  );

  setInterval(async () => {
    if (procesando) return;
    procesando = true;

    try {
      const resultado = await procesarRemarketingVencidos();

      if (resultado.procesados > 0) {
        console.log(
          "🔥 Worker remarketing global:",
          resultado.procesados,
          "procesados"
        );
      }
    } catch (error) {
      console.log(
        "ERROR worker remarketing:",
        error.response?.data || error.message
      );
    } finally {
      procesando = false;
    }
  }, intervaloMs);

  console.log(
    "🔥 Worker Remarketing Global activo cada",
    intervaloMs,
    "ms"
  );
}

module.exports = {
  startRemarketingGlobalWorker,
};
