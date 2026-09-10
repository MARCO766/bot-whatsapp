/**
 * Ledger comercial CTWA — registro idempotente en macbot_ctwa_leads.
 *
 * Fase 2B (capacidad): el webhook consulta existencia + cupo de leads antes
 * de llamar registrarEntradaCtwa. Este servicio NO aplica capacidad.
 *
 * Idempotencia durable: UNIQUE(usuario_id, message_id).
 * No consulta clientes, flujos, activadores, country ni planes.
 * No importa routing CTWA.
 */
const axios = require("axios");
const { errorMessage } = require("./supabaseSafe");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const TABLE = "macbot_ctwa_leads";

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function log(msg, extra) {
  if (extra !== undefined) console.log(`[ctwaLead] ${msg}`, extra);
  else console.log(`[ctwaLead] ${msg}`);
}

function validationError(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = "CTWA_LEAD_VALIDATION";
  return err;
}

function supabaseError(message, cause) {
  const err = new Error(message);
  err.status = cause?.response?.status || 500;
  err.code = "CTWA_LEAD_SUPABASE";
  err.cause = cause;
  return err;
}

/**
 * Normaliza y valida el payload del ledger.
 * No usa normalizeAdId (routing). Solo trim de source_id / message.id.
 * @returns {{ usuario_id: string, cliente_numero: string, conexion_whatsapp_id: string|null, message_id: string, ctwa_ad_id: string }}
 */
function normalizarPayloadEntradaCtwa({
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
  messageId,
  ctwaAdId,
} = {}) {
  const usuario_id = String(usuarioId ?? "").trim();
  if (!usuario_id) {
    throw validationError("usuarioId es obligatorio");
  }

  const cliente_numero = String(clienteNumero ?? "").trim();
  if (!cliente_numero) {
    throw validationError("clienteNumero es obligatorio");
  }

  const message_id = String(messageId ?? "").trim();
  if (!message_id) {
    throw validationError("messageId es obligatorio");
  }

  const ctwa_ad_id = String(ctwaAdId ?? "").trim();
  if (!ctwa_ad_id) {
    throw validationError("ctwaAdId es obligatorio");
  }

  let conexion_whatsapp_id = null;
  if (conexionWhatsappId != null && conexionWhatsappId !== "") {
    const c = String(conexionWhatsappId).trim();
    conexion_whatsapp_id = c || null;
  }

  return {
    usuario_id,
    cliente_numero,
    conexion_whatsapp_id,
    message_id,
    ctwa_ad_id,
  };
}

/**
 * ¿Ya existe una fila para (usuario_id, message_id)?
 * Solo lectura; filtrado siempre por usuario_id (nunca COUNT global).
 *
 * @param {string} usuarioId
 * @param {string} messageId
 * @param {{ get?: Function, supabaseUrl?: string }} [deps] solo para tests
 * @returns {Promise<boolean>}
 */
async function existeEntradaCtwa(usuarioId, messageId, deps = {}) {
  const usuario_id = String(usuarioId ?? "").trim();
  const message_id = String(messageId ?? "").trim();
  if (!usuario_id || !message_id) return false;

  const baseUrl = deps.supabaseUrl || SUPABASE_URL;
  const get =
    typeof deps.get === "function"
      ? deps.get
      : (url, cfg) => axios.get(url, cfg);

  if (typeof deps.get !== "function") {
    if (!baseUrl || !SUPABASE_KEY) {
      throw supabaseError("SUPABASE_URL / SUPABASE_SECRET_KEY no configurados");
    }
  }

  const url =
    `${baseUrl || "http://ctwa-lead.test"}/rest/v1/${TABLE}` +
    `?usuario_id=eq.${encodeURIComponent(usuario_id)}` +
    `&message_id=eq.${encodeURIComponent(message_id)}` +
    `&select=id&limit=1`;

  try {
    const res = await get(url, { headers: headers() });
    return Boolean(Array.isArray(res?.data) ? res.data[0] : res?.data);
  } catch (error) {
    const detail = errorMessage(error).slice(0, 200);
    log("error consultando existencia CTWA", {
      usuario_id,
      message_id,
      detail,
    });
    throw supabaseError(`Error consultando entrada CTWA: ${detail}`, error);
  }
}

/**
 * INSERT atómico idempotente por UNIQUE(usuario_id, message_id).
 *
 * @param {object} params
 * @param {string} params.usuarioId
 * @param {string} params.clienteNumero
 * @param {string|null|undefined} [params.conexionWhatsappId]
 * @param {string} params.messageId
 * @param {string} params.ctwaAdId
 * @param {{ post?: Function, supabaseUrl?: string }} [deps] solo para tests
 * @returns {Promise<{ registered: boolean, duplicate: boolean, row?: object|null }>}
 */
async function registrarEntradaCtwa(params, deps = {}) {
  const payload = normalizarPayloadEntradaCtwa(params);

  const baseUrl = deps.supabaseUrl || SUPABASE_URL;
  const post =
    typeof deps.post === "function"
      ? deps.post
      : (url, body, cfg) => axios.post(url, body, cfg);

  if (typeof deps.post !== "function") {
    if (!baseUrl || !SUPABASE_KEY) {
      throw supabaseError("SUPABASE_URL / SUPABASE_SECRET_KEY no configurados");
    }
  }

  const url =
    `${baseUrl || "http://ctwa-lead.test"}/rest/v1/${TABLE}` +
    `?on_conflict=usuario_id,message_id`;

  let res;
  try {
    res = await post(url, payload, {
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=representation",
      }),
    });
  } catch (error) {
    const detail = errorMessage(error).slice(0, 200);
    log("error insertando entrada CTWA", {
      usuario_id: payload.usuario_id,
      message_id: payload.message_id,
      detail,
    });
    throw supabaseError(`Error registrando entrada CTWA: ${detail}`, error);
  }

  const row = Array.isArray(res?.data) ? res.data[0] : res?.data;
  if (row?.id) {
    return { registered: true, duplicate: false, row };
  }

  // ignore-duplicates + return=representation → body vacío si ya existía
  return { registered: false, duplicate: true, row: null };
}

module.exports = {
  registrarEntradaCtwa,
  existeEntradaCtwa,
  normalizarPayloadEntradaCtwa,
};
