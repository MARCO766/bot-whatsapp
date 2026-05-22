const axios = require("axios");
const { ESTADOS_RM24H, ESTADOS_ABIERTOS } = require("./constants");
const { nowUtc, encodeTimestampFilter } = require("../seguimiento/timestamps");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function estadosAbiertosFilter() {
  return ESTADOS_ABIERTOS.join(",");
}

async function buscarAbierto({ usuario_id, cliente_numero, flujo_id }) {
  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/remarketing_global_24h?usuario_id=eq.${usuario_id}` +
      `&cliente_numero=eq.${encodeURIComponent(cliente_numero)}` +
      `&flujo_id=eq.${encodeURIComponent(flujo_id)}` +
      `&estado=in.(${estadosAbiertosFilter()})` +
      `&select=*&limit=1`,
    { headers: headers() }
  );
  return (response.data || [])[0] || null;
}

async function insertar(row) {
  const response = await axios.post(
    `${SUPABASE_URL}/rest/v1/remarketing_global_24h`,
    row,
    { headers: headers({ Prefer: "return=representation" }) }
  );
  return (response.data || [])[0] || null;
}

async function actualizarPorId(id, payload) {
  const response = await axios.patch(
    `${SUPABASE_URL}/rest/v1/remarketing_global_24h?id=eq.${id}`,
    { ...payload, actualizado_en: nowUtc() },
    { headers: headers({ Prefer: "return=representation" }) }
  );
  return (response.data || [])[0] || null;
}

async function listarActivosPorCliente(usuario_id, cliente_numero) {
  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/remarketing_global_24h?usuario_id=eq.${usuario_id}` +
      `&cliente_numero=eq.${encodeURIComponent(cliente_numero)}` +
      `&estado=eq.${ESTADOS_RM24H.ACTIVO}` +
      `&activo=eq.true&select=*`,
    { headers: headers() }
  );
  return response.data || [];
}

async function listarVencidos(limite = 50) {
  const ahoraEncoded = encodeTimestampFilter(new Date());
  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/remarketing_global_24h?estado=eq.${ESTADOS_RM24H.ACTIVO}` +
      `&activo=eq.true&expira_en=lte.${ahoraEncoded}` +
      `&order=expira_en.asc&limit=${limite}&select=*`,
    { headers: headers() }
  );
  return response.data || [];
}

async function marcarPendienteDisparo(id) {
  return actualizarPorId(id, {
    estado: ESTADOS_RM24H.PENDIENTE_DISPARO,
    activo: true,
  });
}

module.exports = {
  buscarAbierto,
  insertar,
  actualizarPorId,
  listarActivosPorCliente,
  listarVencidos,
  marcarPendienteDisparo,
};
