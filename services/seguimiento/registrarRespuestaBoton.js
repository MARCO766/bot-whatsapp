const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function registrarRespuestaBotonSeguimiento({
  clienteNumero,
  usuarioId,
  conexionWhatsappId = null,
  botonId,
  botonTexto,
  whatsappMessageId,
}) {
  if (!clienteNumero || !botonId) return;

  const conexionId =
    conexionWhatsappId != null && String(conexionWhatsappId).trim() !== ""
      ? String(conexionWhatsappId).trim()
      : null;

  const etiqueta = botonTexto || botonId;
  const contenido = "[Seguimiento] Botón: " + etiqueta;

  console.log("[SEGUIMIENTO] Respuesta botón:", {
    cliente: clienteNumero,
    conexion_whatsapp_id: conexionId,
    botonId,
    botonTexto: etiqueta,
  });

  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  if (!conexionId) {
    console.warn(
      "[SEGUIMIENTO] respuesta botón sin conexion_whatsapp_id — no guardar mensaje",
      { cliente: clienteNumero }
    );
    return;
  }

  try {
    await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      {
        cliente_numero: clienteNumero,
        usuario_id: usuarioId || null,
        conexion_whatsapp_id: conexionId,
        direccion: "entrante",
        tipo: "interactive",
        contenido,
        imagen_url: null,
        whatsapp_message_id: whatsappMessageId || null,
        estado_envio: "received",
      },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.log(
      "[SEGUIMIENTO] Error registrando respuesta botón:",
      error.response?.data || error.message
    );
  }
}

module.exports = {
  registrarRespuestaBotonSeguimiento,
};
