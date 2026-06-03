const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

function normalizarConexionId(conexionWhatsappId) {
  if (conexionWhatsappId == null || String(conexionWhatsappId).trim() === "") {
    return null;
  }
  return String(conexionWhatsappId).trim();
}

async function existeMensajePorSeguimientoId(seguimientoId, conexionWhatsappId = null) {
  const id = seguimientoId != null ? String(seguimientoId).trim() : "";
  if (!id || !SUPABASE_URL || !SUPABASE_KEY) return null;

  const conexionEsperada = normalizarConexionId(conexionWhatsappId);

  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/mensajes?seguimiento_id=eq.${encodeURIComponent(id)}` +
        `&select=id,conexion_whatsapp_id,whatsapp_message_id,cliente_numero,usuario_id,creado_en&limit=1`,
      { headers: headers() }
    );
    const row = res.data?.[0] || null;
    if (!row) return null;

    if (conexionEsperada) {
      const connRow = normalizarConexionId(row.conexion_whatsapp_id);
      if (!connRow || connRow !== conexionEsperada) {
        console.error("[SEGUIMIENTO_IDEMPOTENTE] mensaje con otra línea", {
          seguimiento_id: id,
          conexion_esperada: conexionEsperada,
          conexion_mensaje: connRow,
          mensaje_id: row.id,
        });
        return null;
      }
    }

    if (!row.conexion_whatsapp_id) {
      console.error("[SEGUIMIENTO_IDEMPOTENTE] mensaje sin conexion_whatsapp_id", {
        seguimiento_id: id,
        mensaje_id: row.id,
      });
      return null;
    }

    return row;
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
