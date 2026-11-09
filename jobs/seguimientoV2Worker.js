const { procesarSeguimientosV2Vencidos } = require("../services/seguimientoV2/seguimientoV2Worker");
const { verificarTablaLockDisponible } = require("../services/seguimientoV2/seguimientoV2WorkerLock");
const {
  crearPausaSupabase,
  esFalloSupabase,
  esMotivoPausaSupabase,
} = require("./workerBackoff");

let workerIniciado = false;
let procesando = false;
let intervalId = null;
const pausaSupabase = crearPausaSupabase();

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
      const esperaMs = pausaSupabase.registrarFallo();
      console.log("[SEG_V2_WORKER_LOCK_TRANSIENT]", {
        pid: process.pid,
        timestamp: new Date().toISOString(),
        motivo: lockCheck.motivo || "lock_verificacion_fallida",
        fase: "startup",
        accion: "backoff",
        espera_ms: esperaMs,
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
    if (procesando) {
      console.log("[SEG_V2_WORKER] tick omitido (tick anterior en curso)");
      return;
    }
    if (pausaSupabase.debeOmitir()) {
      console.log("[SEG_V2_WORKER_BACKOFF]", { espera_ms: pausaSupabase.esperaMs() });
      return;
    }
    procesando = true;

    try {
      const resultado = await procesarSeguimientosV2Vencidos({ fromWorker: true });

      if (resultado.lock === "no_lock_db") {
        if (!esMotivoLockPermanente(resultado.motivo)) {
          const esperaMs = esMotivoPausaSupabase(resultado.motivo)
            ? pausaSupabase.registrarFallo()
            : 0;
          console.log("[SEG_V2_WORKER_LOCK_TRANSIENT]", {
            pid: process.pid,
            motivo: resultado.motivo || "lock_verificacion_fallida",
            fase: "tick",
            accion: esperaMs ? "backoff" : "omitir_ciclo_reintentar",
            espera_ms: esperaMs,
          });
          return;
        }
        apagarWorkerSeguimientoV2(resultado.motivo);
        return;
      }

      if (resultado.lock === "skipped") {
        if (esMotivoPausaSupabase(resultado.motivo)) {
          const esperaMs = pausaSupabase.registrarFallo();
          console.log("[SEG_V2_WORKER_BACKOFF_ARMADO]", {
            espera_ms: esperaMs,
            motivo: resultado.motivo,
          });
        } else {
          pausaSupabase.registrarExito();
        }
        return;
      }

      pausaSupabase.registrarExito();

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
      if (esFalloSupabase(error)) {
        const esperaMs = pausaSupabase.registrarFallo();
        console.log("[SEG_V2_WORKER_BACKOFF_ARMADO]", {
          espera_ms: esperaMs,
          motivo: "error_supabase",
        });
      }
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
