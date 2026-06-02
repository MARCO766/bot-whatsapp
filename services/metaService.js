const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function supabaseHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

function maskId(value) {
  if (!value || typeof value !== "string") return null;
  const s = String(value).trim();
  if (s.length <= 6) return "******";
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}

function normalizeConexionWhatsappId(opciones = {}) {
  const raw =
    opciones.conexionWhatsappId ?? opciones.conexion_whatsapp_id ?? null;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

async function fetchConexionMeta(usuarioId, conexionWhatsappId) {
  if (!usuarioId || !SUPABASE_URL || !SUPABASE_KEY) return null;

  const headers = supabaseHeaders();
  const connId = normalizeConexionWhatsappId({ conexionWhatsappId });

  if (connId) {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}&id=eq.${encodeURIComponent(connId)}&select=id,pixel_id,capi_token&limit=1`,
      { headers }
    );
    return res.data?.[0] || null;
  }

  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}&activo=eq.true&select=id,pixel_id,capi_token&limit=1`,
    { headers }
  );
  return res.data?.[0] || null;
}

async function enviarEventoMeta(usuarioId, nombreEvento, telefono, opciones = {}) {
  try {
    if (!usuarioId) return;

    const conexionWhatsappId = normalizeConexionWhatsappId(opciones);
    const conexion = await fetchConexionMeta(usuarioId, conexionWhatsappId);
    const conexionIdLog = conexion?.id || conexionWhatsappId || null;

    if (!conexion?.pixel_id?.trim() || !conexion?.capi_token?.trim()) {
      console.log("[META] Pixel/CAPI no configurado para esta línea", {
        conexion_whatsapp_id: conexionIdLog,
      });
      return;
    }

    const crypto = require("crypto");

    const telefonoHash = crypto
      .createHash("sha256")
      .update(String(telefono).replace(/\D/g, ""))
      .digest("hex");

    await axios.post(
      `https://graph.facebook.com/v19.0/${conexion.pixel_id}/events?access_token=${conexion.capi_token}`,
      {
        data: [
          {
            event_name: nombreEvento,
            event_time: Math.floor(Date.now() / 1000),
            action_source: "system_generated",
            user_data: {
              ph: [telefonoHash],
            },
            custom_data: {
              currency: opciones.currency || "BOB",
              value: opciones.value || 0,
            },
          },
        ],
      }
    );

    console.log("[META] evento enviado", {
      evento: nombreEvento,
      pixel_id_masked: maskId(conexion.pixel_id),
      conexion_whatsapp_id: conexionIdLog,
    });
  } catch (error) {
    console.log("[META] error", error.response?.data || error.message);
  }
}

module.exports = {
  enviarEventoMeta,
};
