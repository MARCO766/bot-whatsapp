const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function maskId(value) {
  if (!value || typeof value !== "string") return null;
  const s = String(value).trim();
  if (s.length <= 6) return "******";
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}

async function enviarEventoMeta(usuarioId, nombreEvento, telefono, opciones = {}) {
  try {
    if (!usuarioId) return;

    const responseConexion = await axios.get(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${usuarioId}&activo=eq.true&select=pixel_id,capi_token`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    const conexion = responseConexion.data?.[0];

    if (!conexion?.pixel_id || !conexion?.capi_token) {
      console.log("[META] PIXEL/CAPI no configurado");
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
    });
  } catch (error) {
    console.log("[META] error", error.response?.data || error.message);
  }
}

module.exports = {
  enviarEventoMeta,
};
