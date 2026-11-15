/**
 * Claim durable de mensaje entrante por wamid sobre public.mensajes.
 * No crea tablas nuevas: reutiliza whatsapp_message_id.
 *
 * Recuperación: NO. Si el proceso falla tras INSERT exitoso y antes de responder,
 * un reintento de Meta encontrará el wamid y no reejecutará el bot (posible
 * respuesta automática perdida). Ver migración add_mensajes_whatsapp_message_id_unique.sql.
 */

const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function codigoSql(err) {
  const data = err?.response?.data;
  if (!data || typeof data !== "object") return "";
  return String(data.code || data.error_code || "");
}

function isUniqueViolation(err) {
  if (codigoSql(err) === "23505") return true;
  return Number(err?.response?.status) === 409;
}

function esTimeoutClaim(err) {
  if (!err) return false;
  const code = String(err.code || "");
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") return true;
  return /timeout/i.test(String(err.message || ""));
}

function esPerdidaDeConexion(err) {
  const code = String(err?.code || "");
  if ([
    "ECONNRESET",
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EPIPE",
    "ENETUNREACH",
    "EHOSTUNREACH",
  ].includes(code)) return true;
  return /socket hang up/i.test(String(err?.message || ""));
}

function esResultadoIncierto(err) {
  if (!err || isUniqueViolation(err)) return false;
  const status = Number(err?.response?.status);
  if (status >= 400 && status < 500) return false;
  if (status >= 500) return true;
  return esTimeoutClaim(err) || esPerdidaDeConexion(err);
}

function esRechazoAntesDeGuardar(err) {
  if (!err || esResultadoIncierto(err) || isUniqueViolation(err)) return false;
  const status = Number(err?.response?.status);
  return status >= 400 && status < 500;
}

function clasificarFalloClaim(err) {
  if (isUniqueViolation(err)) {
    return { claimed: false, duplicate: true, confirmado: true, incierto: false, guardado: false };
  }
  if (esResultadoIncierto(err)) {
    return {
      claimed: false,
      duplicate: false,
      incierto: true,
      confirmado: false,
      guardado: null,
      error: true,
      reason: "claim_incierto",
    };
  }
  if (esRechazoAntesDeGuardar(err)) {
    return {
      claimed: false,
      duplicate: false,
      incierto: false,
      confirmado: false,
      guardado: false,
      error: true,
      rechazado: true,
      reason: "claim_rechazado",
    };
  }
  return {
    claimed: false,
    duplicate: false,
    incierto: true,
    confirmado: false,
    guardado: null,
    error: true,
    reason: "claim_incierto",
  };
}

async function buscarPorWamid(whatsappMessageId, deps = {}) {
  const http = deps.axios || axios;
  const base = deps.supabaseUrl || SUPABASE_URL;
  const key = deps.supabaseKey || SUPABASE_KEY;
  if (!base || !key || !whatsappMessageId) return null;
  const res = await http.get(
    `${base}/rest/v1/mensajes?whatsapp_message_id=eq.${encodeURIComponent(
      whatsappMessageId
    )}&select=id,whatsapp_message_id,cliente_numero,usuario_id,direccion&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    }
  );
  return Array.isArray(res.data) ? res.data[0] || null : null;
}

/**
 * Intenta reclamar el wamid insertando la fila entrante.
 * @returns {Promise<{ claimed: boolean, duplicate?: boolean, row?: object|null, error?: boolean }>}
 */
async function reclamarMensajeEntrantePorWamid(fila, deps = {}) {
  const http = deps.axios || axios;
  const base = deps.supabaseUrl || SUPABASE_URL;
  const key = deps.supabaseKey || SUPABASE_KEY;
  const wamid =
    fila?.whatsapp_message_id != null
      ? String(fila.whatsapp_message_id).trim()
      : "";

  if (!wamid) {
    return { claimed: false, duplicate: false, error: true, reason: "no_wamid" };
  }
  if (!base || !key) {
    return { claimed: false, error: true, reason: "no_supabase" };
  }

  try {
    const existente = await buscarPorWamid(wamid, deps);
    if (existente) {
      console.log("[WA_CLAIM] wamid ya persistido — skip reproceso", {
        wamid: wamid.slice(0, 16) + "…",
        mensaje_id: existente.id || null,
      });
      return { claimed: false, duplicate: true, row: existente };
    }
  } catch (errLookup) {
    const falloLookup = clasificarFalloClaim(errLookup);
    if (falloLookup.duplicate) {
      return { ...falloLookup, fase: "lookup" };
    }
    console.log(
      "[WA_CLAIM] lookup previo falló — se intenta INSERT",
      errLookup.response?.data || errLookup.message
    );
  }

  try {
    const res = await http.post(`${base}/rest/v1/mensajes`, fila, {
      headers: supabaseHeaders({ Prefer: "return=representation" }),
    });
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    return { claimed: true, duplicate: false, confirmado: true, incierto: false, guardado: true, row: row || null };
  } catch (err) {
    const fallo = clasificarFalloClaim(err);
    if (fallo.duplicate) {
      console.log("[WA_CLAIM] UNIQUE conflict — skip reproceso", {
        wamid: wamid.slice(0, 16) + "…",
      });
      return { ...fallo, row: null, fase: "insert" };
    }
    if (fallo.incierto || fallo.rechazado) {
      return { ...fallo, fase: "insert" };
    }
    throw err;
  }
}

module.exports = {
  reclamarMensajeEntrantePorWamid,
  buscarPorWamid,
  isUniqueViolation,
  clasificarFalloClaim,
  esResultadoIncierto,
};
