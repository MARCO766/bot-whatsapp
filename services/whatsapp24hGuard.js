const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const VENTANA_HORAS = 24;

function obtenerModoGuard() {
  const modo = String(process.env.VENTANA24H_GUARD_MODE || "log_only").trim().toLowerCase();
  return modo === "block" ? "block" : "log_only";
}

function headersSupabase() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

function normalizarId(valor) {
  if (valor == null || String(valor).trim() === "") return null;
  return String(valor).trim();
}

async function obtenerUltimoMensajeEntrante(usuarioId, clienteNumero, conexionWhatsappId) {
  const uid = encodeURIComponent(usuarioId);
  const num = encodeURIComponent(clienteNumero);
  const conn = encodeURIComponent(conexionWhatsappId);

  const url =
    `${SUPABASE_URL}/rest/v1/mensajes?usuario_id=eq.${uid}` +
    `&cliente_numero=eq.${num}` +
    `&conexion_whatsapp_id=eq.${conn}` +
    `&direccion=eq.entrante` +
    `&select=id,creado_en` +
    `&order=creado_en.desc` +
    `&limit=1`;

  const res = await axios.get(url, { headers: headersSupabase() });
  return res.data?.[0] || null;
}

/**
 * PostgREST devuelve timestamptz a veces sin offset (ej. 2026-06-05T18:00:00).
 * Sin Z, JS lo interpreta como hora local → diff negativo. Siempre UTC.
 */
function parseTimestamptzUtc(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }

  let raw = String(value).trim();
  if (!raw) return null;

  if (/[Zz]$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw)) {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? null : t;
  }

  if (raw.includes(" ") && !raw.includes("T")) {
    raw = raw.replace(" ", "T");
  }

  const t = Date.parse(`${raw}Z`);
  return Number.isNaN(t) ? null : t;
}

function horasDesdeUtc(fechaIso, referenciaMs = Date.now()) {
  const ts = parseTimestamptzUtc(fechaIso);
  if (ts == null) return null;
  return (referenciaMs - ts) / (1000 * 60 * 60);
}

function redondearHoras(horas) {
  if (horas == null || Number.isNaN(horas)) return null;
  return Math.round(horas * 100) / 100;
}

function logGuard(tag, payload) {
  console.log(tag, payload);
}

/**
 * Guard global ventana 24h WhatsApp (Fase 1: solo observación / log_only).
 * Futuro modo block: lanzará error WA_24H_GUARD_BLOCK antes de Meta.
 */
async function validarVentana24hAntesDeEnviar({
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
  origen,
  esPlantilla = false,
} = {}) {
  const modo = obtenerModoGuard();
  const uid = normalizarId(usuarioId);
  const num = normalizarId(clienteNumero);
  const conn = normalizarId(conexionWhatsappId);

  const baseLog = {
    usuarioId: uid,
    clienteNumero: num,
    conexionWhatsappId: conn,
    origen: origen ?? null,
    ultima_interaccion: null,
    horas_desde_ultima_interaccion: null,
    modo,
    esPlantilla: Boolean(esPlantilla),
  };

  if (!uid || !num || !conn) {
    logGuard("[WA_24H_GUARD_NO_CONTEXT]", baseLog);
    return { accion: "NO_CONTEXT", bloquear: false, ...baseLog };
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    logGuard("[WA_24H_GUARD_NO_CONTEXT]", { ...baseLog, razon: "sin_supabase" });
    return { accion: "NO_CONTEXT", bloquear: false, ...baseLog };
  }

  try {
    const ultimo = await obtenerUltimoMensajeEntrante(uid, num, conn);

    if (!ultimo?.creado_en) {
      const payload = { ...baseLog, ultima_interaccion: null, horas_desde_ultima_interaccion: null };
      logGuard("[WA_24H_GUARD_WOULD_BLOCK]", payload);
      const bloquear = modo === "block";
      if (bloquear) {
        const err = new Error("WA_24H_GUARD_BLOCK: sin mensaje entrante previo");
        err.code = "WA_24H_GUARD_BLOCK";
        throw err;
      }
      return { accion: "WOULD_BLOCK", bloquear: false, ...payload };
    }

    const horas = horasDesdeUtc(ultimo.creado_en);
    const payload = {
      ...baseLog,
      ultima_interaccion: ultimo.creado_en,
      horas_desde_ultima_interaccion: redondearHoras(horas),
    };

    if (horas == null || horas > VENTANA_HORAS) {
      logGuard("[WA_24H_GUARD_WOULD_BLOCK]", payload);
      const bloquear = modo === "block";
      if (bloquear) {
        const err = new Error(
          `WA_24H_GUARD_BLOCK: última interacción hace ${redondearHoras(horas)}h`
        );
        err.code = "WA_24H_GUARD_BLOCK";
        throw err;
      }
      return { accion: "WOULD_BLOCK", bloquear: false, ...payload };
    }

    logGuard("[WA_24H_GUARD_ALLOW]", payload);
    return { accion: "ALLOW", bloquear: false, ...payload };
  } catch (err) {
    if (err.code === "WA_24H_GUARD_BLOCK") {
      throw err;
    }
    logGuard("[WA_24H_GUARD_NO_CONTEXT]", {
      ...baseLog,
      error: err.response?.data?.message || err.message,
    });
    return { accion: "NO_CONTEXT", bloquear: false, ...baseLog };
  }
}

function esWa24hGuardBlockError(err) {
  return err?.code === "WA_24H_GUARD_BLOCK";
}

module.exports = {
  validarVentana24hAntesDeEnviar,
  obtenerModoGuard,
  esWa24hGuardBlockError,
  parseTimestamptzUtc,
  horasDesdeUtc,
  VENTANA_HORAS,
};
