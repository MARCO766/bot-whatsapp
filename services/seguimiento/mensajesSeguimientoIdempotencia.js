const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

async function existeMensajePorSeguimientoId(seguimientoId) {
  const id = seguimientoId != null ? String(seguimientoId).trim() : "";
  if (!id || !SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/mensajes?seguimiento_id=eq.${encodeURIComponent(id)}` +
        `&select=id,conexion_whatsapp_id,whatsapp_message_id,cliente_numero,usuario_id,creado_en&limit=1`,
      { headers: headers() }
    );
    return res.data?.[0] || null;
  } catch (err) {
    const msg = err.response?.data?.message || err.message || "";
    if (String(msg).includes("seguimiento_id")) {
      console.error(
        "[SEGUIMIENTO_IDEMPOTENTE] columna mensajes.seguimiento_id ausente — ejecuta add_mensajes_seguimiento_id.sql"
      );
      throw new Error("mensajes.seguimiento_id no existe en Supabase");
    }
    throw err;
  }
}

module.exports = {
  existeMensajePorSeguimientoId,
};
