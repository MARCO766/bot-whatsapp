/**
 * Fase A — detección diagnóstica de primer mensaje entrante por línea WhatsApp.
 * Solo lectura; no altera comportamiento del CRM.
 */
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function supabaseHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

function normalizarId(valor) {
  if (valor == null || String(valor).trim() === "") return null;
  return String(valor).trim();
}

/**
 * @returns {Promise<{ esPrimerMensaje: boolean, motivo: string }>}
 */
async function calcularEsPrimerMensaje(usuarioId, clienteNumero, conexionWhatsappId) {
  const uid = normalizarId(usuarioId);
  const num = normalizarId(clienteNumero);
  const conn = normalizarId(conexionWhatsappId);

  if (!uid || !num || !conn || !SUPABASE_URL || !SUPABASE_KEY) {
    return { esPrimerMensaje: false, motivo: "datos_incompletos" };
  }

  try {
    const url =
      `${SUPABASE_URL}/rest/v1/mensajes?usuario_id=eq.${encodeURIComponent(uid)}` +
      `&cliente_numero=eq.${encodeURIComponent(num)}` +
      `&conexion_whatsapp_id=eq.${encodeURIComponent(conn)}` +
      `&direccion=eq.entrante` +
      `&select=id` +
      `&limit=1`;

    const res = await axios.get(url, { headers: supabaseHeaders() });
    const existeHistorial = Boolean(res.data?.[0]);

    return {
      esPrimerMensaje: !existeHistorial,
      motivo: existeHistorial ? "historial_existente" : "historial_vacio",
    };
  } catch (err) {
    console.log(
      "[FIRST_MESSAGE_CHECK] error consultando historial:",
      err.response?.data || err.message
    );
    return { esPrimerMensaje: false, motivo: "error_consulta" };
  }
}

module.exports = {
  calcularEsPrimerMensaje,
};
