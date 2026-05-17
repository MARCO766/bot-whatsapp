const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function registrarRespuestaBotonSeguimiento({
  clienteNumero,
  usuarioId,
  botonId,
  botonTexto,
  whatsappMessageId,
}) {
  if (!clienteNumero || !botonId) return;

  const etiqueta = botonTexto || botonId;
  const contenido = "[Seguimiento] Botón: " + etiqueta;

  console.log("[SEGUIMIENTO] Respuesta botón:", {
    cliente: clienteNumero,
    botonId,
    botonTexto: etiqueta,
  });

  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  try {
    await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      {
        cliente_numero: clienteNumero,
        usuario_id: usuarioId || null,
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
