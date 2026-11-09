const { procesarRemarketing24hWorker } = require("../services/remarketing24h/remarketing24hService");
const { crearPausaSupabase, esFalloSupabase } = require("./workerBackoff");

let workerIniciado = false;
let procesando = false;
const pausaSupabase = crearPausaSupabase();

async function ejecutarTickRm24h() {
  if (procesando) {
    console.log("[RM24H_WORKER] tick omitido (tick anterior en curso)");
    return;
  }
  if (pausaSupabase.debeOmitir()) {
    console.log("[RM24H_WORKER_BACKOFF]", { espera_ms: pausaSupabase.esperaMs() });
    return;
  }
  procesando = true;

  try {
    console.log("[RM24H_WORKER] tick");
    const resultado = await procesarRemarketing24hWorker();
    pausaSupabase.registrarExito();
    console.log("[RM24H_WORKER] tick done", resultado);
  } catch (error) {
    if (esFalloSupabase(error)) {
      const esperaMs = pausaSupabase.registrarFallo();
      console.log("[RM24H_WORKER_BACKOFF_ARMADO]", {
        espera_ms: esperaMs,
        motivo: "error_supabase",
      });
    }
    console.log("[RM24H_WORKER] error", error.response?.data || error.message);
  } finally {
    procesando = false;
  }
}

function startRemarketing24hWorker() {
  if (global.__macbotRemarketing24hWorkerIniciado || workerIniciado) {
    console.log("[RM24H_WORKER] started (ya activo, no se duplica)");
    return;
  }
  global.__macbotRemarketing24hWorkerIniciado = true;
  workerIniciado = true;

  const intervaloMs = parseInt(process.env.RM24H_POLL_MS || "60000", 10);

  console.log("[RM24H_WORKER] started", {
    intervalo_ms: intervaloMs,
    supabase_url: Boolean(process.env.SUPABASE_URL),
    supabase_key: Boolean(process.env.SUPABASE_SECRET_KEY),
  });

  setInterval(() => {
    ejecutarTickRm24h();
  }, intervaloMs);

  ejecutarTickRm24h();
}

module.exports = {
  startRemarketing24hWorker,
};
