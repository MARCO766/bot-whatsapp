/**
 * Pausa de sondeo cuando Supabase no acepta consultas.
 * No toca filas de seguimiento ni de remarketing: solo decide si el
 * siguiente tick del mismo proceso puede llamar a la API.
 */

const PASOS_MS = [60_000, 120_000, 240_000, 300_000];

function textoError(error) {
  const data = error && error.response && error.response.data;
  const partes = [
    error && error.code,
    error && error.message,
    data && data.code,
    data && data.message,
    typeof data === "string" ? data : "",
  ];
  return partes.filter(Boolean).join(" ").toLowerCase();
}

function esFalloSupabase(error) {
  if (!error) return false;
  const status = error.response && error.response.status;
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;

  const data = error.response && error.response.data;
  const code = String((data && data.code) || error.code || "").toUpperCase();
  if (code === "PGRST002" || code === "57014" || code === "08P01") return true;
  if (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN"
  ) {
    return true;
  }

  const msg = textoError(error);
  return (
    msg.includes("pgrst002") ||
    msg.includes("schema cache") ||
    msg.includes("57014") ||
    msg.includes("statement timeout") ||
    msg.includes("canceling statement") ||
    msg.includes("08p01") ||
    msg.includes("eof detected") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up") ||
    msg.includes("connection terminated") ||
    msg.includes("connection timeout") ||
    msg.includes("network error") ||
    msg.includes("timeout")
  );
}

function esMotivoPausaSupabase(motivo) {
  return motivo === "lock_verificacion_fallida";
}

function crearPausaSupabase(opciones = {}) {
  const pasos = opciones.pasosMs || PASOS_MS;
  const ahora = opciones.ahora || (() => Date.now());
  let paso = 0;
  let hasta = 0;

  return {
    debeOmitir() {
      return ahora() < hasta;
    },
    esperaMs() {
      return Math.max(0, hasta - ahora());
    },
    registrarFallo() {
      const delay = pasos[Math.min(paso, pasos.length - 1)];
      paso += 1;
      hasta = ahora() + delay;
      return delay;
    },
    registrarExito() {
      paso = 0;
      hasta = 0;
    },
  };
}

module.exports = {
  PASOS_MS,
  esFalloSupabase,
  esMotivoPausaSupabase,
  crearPausaSupabase,
};
