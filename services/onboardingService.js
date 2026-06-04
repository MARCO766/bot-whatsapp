/**
 * Estado de onboarding MacBot — conexión WhatsApp inicial.
 */
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

/**
 * Cuenta filas en conexiones_whatsapp por usuario_id.
 */
async function contarConexionesWhatsapp(usuarioId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}&select=id`,
    { headers: headers() }
  );
  return Array.isArray(res.data) ? res.data.length : 0;
}

/**
 * @returns {{ tiene_conexion_whatsapp: boolean, total_conexiones: number, paso_actual: 'conectar_whatsapp'|'listo' }}
 */
async function obtenerEstadoOnboarding(usuarioId) {
  const total_conexiones = await contarConexionesWhatsapp(usuarioId);
  const tiene_conexion_whatsapp = total_conexiones > 0;
  return {
    tiene_conexion_whatsapp,
    total_conexiones,
    paso_actual: tiene_conexion_whatsapp ? "listo" : "conectar_whatsapp",
  };
}

module.exports = {
  contarConexionesWhatsapp,
  obtenerEstadoOnboarding,
};
