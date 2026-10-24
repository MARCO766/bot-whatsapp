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

function isUniqueViolation(err) {
  const status = err?.response?.status;
  if (status === 409) return true;
  const data = err?.response?.data;
  const code = data?.code || data?.error_code || "";
  if (String(code) === "23505") return true;
  const msg = JSON.stringify(data || err?.message || "");
  return /duplicate|unique|whatsapp_message_id/i.test(msg) && status >= 400;
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
    return { claimed: true, duplicate: false, row: row || null };
  } catch (err) {
    if (isUniqueViolation(err)) {
      console.log("[WA_CLAIM] UNIQUE conflict — skip reproceso", {
        wamid: wamid.slice(0, 16) + "…",
      });
      return { claimed: false, duplicate: true, row: null };
    }
    throw err;
  }
}

module.exports = {
  reclamarMensajeEntrantePorWamid,
  buscarPorWamid,
  isUniqueViolation,
};
