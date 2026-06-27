/**
 * Copia de seguridad en Supabase para sesiones IA (Fase 2).
 * Solo escritura; la RAM sigue siendo la fuente oficial.
 */

const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const IA_SESSION_READ_TIMEOUT_MS = 2000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function uuidValido(valor) {
  if (valor == null || String(valor).trim() === "") return null;
  const s = String(valor).trim();
  return UUID_RE.test(s) ? s : null;
}

function jsonSeguro(valor, fallback) {
  try {
    return JSON.parse(JSON.stringify(valor ?? fallback));
  } catch {
    return fallback;
  }
}

async function upsertIaSession({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId,
  nodoId,
  flowContext,
  chatHistory,
  lastReplies,
  paymentReaderStatus,
}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase no configurado");
  }

  const usuario_id = uuidValido(usuarioId);
  const conexion_whatsapp_id = uuidValido(conexionWhatsappId);
  const cliente_numero = String(clienteNumero || "").trim();

  if (!usuario_id || !conexion_whatsapp_id || !cliente_numero) {
    throw new Error("Clave de sesión IA inválida para Supabase");
  }

  const row = {
    usuario_id,
    conexion_whatsapp_id,
    cliente_numero,
    flujo_id: uuidValido(flujoId),
    nodo_id: nodoId != null && String(nodoId).trim() !== "" ? String(nodoId).trim() : null,
    flow_context: jsonSeguro(flowContext, {}),
    chat_history: jsonSeguro(chatHistory, []),
    last_replies: jsonSeguro(lastReplies, []),
    payment_reader_status:
      paymentReaderStatus != null && String(paymentReaderStatus).trim() !== ""
        ? String(paymentReaderStatus).trim()
        : null,
    updated_at: new Date().toISOString(),
  };

  await axios.post(
    `${SUPABASE_URL}/rest/v1/ia_sessions?on_conflict=usuario_id,conexion_whatsapp_id,cliente_numero`,
    row,
    {
      headers: supabaseHeaders({
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
    }
  );
}

async function obtenerIaSession({ usuarioId, conexionWhatsappId, clienteNumero }) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }

  const usuario_id = uuidValido(usuarioId);
  const conexion_whatsapp_id = uuidValido(conexionWhatsappId);
  const cliente_numero = String(clienteNumero || "").trim();

  if (!usuario_id || !conexion_whatsapp_id || !cliente_numero) {
    return null;
  }

  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/ia_sessions` +
      `?usuario_id=eq.${encodeURIComponent(usuario_id)}` +
      `&conexion_whatsapp_id=eq.${encodeURIComponent(conexion_whatsapp_id)}` +
      `&cliente_numero=eq.${encodeURIComponent(cliente_numero)}` +
      "&select=flow_context,chat_history,flujo_id,nodo_id,last_replies,payment_reader_status,created_at,updated_at" +
      "&limit=1",
    {
      headers: supabaseHeaders(),
      timeout: IA_SESSION_READ_TIMEOUT_MS,
    }
  );

  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!row) return null;

  return {
    flow_context: row.flow_context,
    chat_history: row.chat_history,
    flujo_id: row.flujo_id,
    nodo_id: row.nodo_id,
    last_replies: row.last_replies,
    payment_reader_status: row.payment_reader_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = {
  upsertIaSession,
  obtenerIaSession,
  uuidValido,
  jsonSeguro,
};
