const {
  obtenerPendientesVencidos,
} = require("../services/remarketingGlobal/remarketingRepository");
const {
  procesarRemarketingItem,
} = require("../services/remarketingGlobal/executeRemarketing");

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

    const now = new Date().toISOString();

    console.log("[RM WORKER] tick");
    console.log("[RM WORKER] now=" + now);
    console.log(
      "[RM WORKER] buscando estado=pendiente y correr_en <= now"
    );

    try {
      const pendientes = await obtenerPendientesVencidos(40);
      console.log(
        "[RM WORKER] pendientes encontrados=" + pendientes.length
      );

      if (!pendientes.length) {
        console.log("[RM WORKER] sin pendientes vencidos para enviar");
      } else {
        for (const item of pendientes) {
          console.log("[RM WORKER] procesando id=" + (item.id || "—"));
          console.log(
            "[RM WORKER] enviando cliente=" + (item.cliente_numero || "—")
          );
          console.log(
            "[RM WORKER] payload=" +
              JSON.stringify(item.mensaje_payload || {})
          );
          console.log(
            "[RM WORKER] correr_en=" +
              (item.correr_en || item.run_at || "—")
          );

          const resultado = await procesarRemarketingItem(item);

          if (resultado?.ok) {
            console.log("[RM WORKER] enviado OK");
          } else {
            console.log(
              "[RM WORKER] no enviado | motivo=" + (resultado?.motivo || "—")
            );
          }
        }
      }
    } catch (error) {
      console.log(
        "[RM WORKER] ERROR tick:",
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
