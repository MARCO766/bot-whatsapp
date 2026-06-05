const axios = require("axios");
const { normalizarConexionId } = require("./seguimientoV2Repository");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

function obtenerConexionItem(item) {
  return normalizarConexionId(item?.conexion_whatsapp_id);
}

async function existeMensajePorSeguimientoV2Id(seguimientoV2Id) {
  const id = seguimientoV2Id != null ? String(seguimientoV2Id).trim() : "";
  if (!id || !SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/mensajes?seguimiento_v2_id=eq.${encodeURIComponent(id)}` +
        `&select=id,conexion_whatsapp_id,whatsapp_message_id,cliente_numero,usuario_id,creado_en&limit=1`,
      { headers: headers() }
    );
    return res.data?.[0] || null;
  } catch (err) {
    const msg = err.response?.data?.message || err.message || "";
    if (String(msg).includes("seguimiento_v2_id")) {
      throw new Error("mensajes.seguimiento_v2_id no existe en Supabase");
    }
    throw err;
  }
}

async function resolverConexionV2(usuarioId, conexionWhatsappId) {
  const conexionId = normalizarConexionId(conexionWhatsappId);
  const usuario = usuarioId != null ? String(usuarioId).trim() : "";

  if (!conexionId || !usuario || !SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }

  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(conexionId)}` +
      `&usuario_id=eq.${encodeURIComponent(usuario)}` +
      `&select=id,token,phone_id,activo,nombre&limit=1`,
    { headers: headers() }
  );

  const conexion = response.data?.[0] || null;
  if (!conexion?.token || !conexion?.phone_id) {
    return null;
  }

  const idResuelto = normalizarConexionId(conexion.id);
  if (idResuelto !== conexionId) {
    return null;
  }

  return {
    id: idResuelto,
    token: conexion.token,
    phone_id: conexion.phone_id,
    nombre: conexion.nombre || null,
    activo: conexion.activo ?? null,
  };
}

module.exports = {
  obtenerConexionItem,
  existeMensajePorSeguimientoV2Id,
  resolverConexionV2,
};
