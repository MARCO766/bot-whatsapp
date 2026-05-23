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

async function listarPendientesDisparo(limite = 40) {
  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/remarketing_global_24h?estado=eq.${ESTADOS_RM24H.PENDIENTE_DISPARO}` +
      `&activo=eq.true&order=expira_en.asc&limit=${limite}&select=*`,
    { headers: headers() }
  );
  return response.data || [];
}

/** Reserva atómica pendiente_disparo → procesando (evita duplicados). */
async function reservarParaEnvio(id) {
  const response = await axios.patch(
    `${SUPABASE_URL}/rest/v1/remarketing_global_24h?id=eq.${id}&estado=eq.${ESTADOS_RM24H.PENDIENTE_DISPARO}`,
    {
      estado: ESTADOS_RM24H.PROCESANDO,
      actualizado_en: nowUtc(),
    },
    { headers: headers({ Prefer: "return=representation" }) }
  );
  return (response.data || [])[0] || null;
}

/** Nombre del flujo (builder o legacy) para rellenar flujo_nombre en cancelación. */
async function obtenerNombreFlujo(usuario_id, flujo_id) {
  if (!usuario_id || !flujo_id) return null;

  const idEnc = encodeURIComponent(String(flujo_id));
  const uidEnc = encodeURIComponent(String(usuario_id));

  try {
    const builder = await axios.get(
      `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${idEnc}` +
        `&usuario_id=eq.${uidEnc}&select=nombre&limit=1`,
      { headers: headers() }
    );
    const nombreBuilder = (builder.data || [])[0]?.nombre;
    if (nombreBuilder && String(nombreBuilder).trim()) {
      return String(nombreBuilder).trim();
    }
  } catch {
    /* fallback flujos */
  }

  try {
    const legacy = await axios.get(
      `${SUPABASE_URL}/rest/v1/flujos?id=eq.${idEnc}` +
        `&usuario_id=eq.${uidEnc}&select=nombre&limit=1`,
      { headers: headers() }
    );
    const nombreLegacy = (legacy.data || [])[0]?.nombre;
    if (nombreLegacy && String(nombreLegacy).trim()) {
      return String(nombreLegacy).trim();
    }
  } catch {
    /* sin nombre */
  }

  return null;
}

async function listarReinicioPorCliente(usuario_id, cliente_numero) {
  const estados = [
    ESTADOS_RM24H.ACTIVO,
    ESTADOS_RM24H.PENDIENTE_DISPARO,
    ESTADOS_RM24H.PROCESANDO,
  ].join(",");

  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/remarketing_global_24h?usuario_id=eq.${usuario_id}` +
      `&cliente_numero=eq.${encodeURIComponent(cliente_numero)}` +
      `&estado=in.(${estados})&activo=eq.true&select=*`,
    { headers: headers() }
  );
  return response.data || [];
}

module.exports = {
  buscarAbierto,
  insertar,
  actualizarPorId,
  obtenerNombreFlujo,
  listarActivosPorCliente,
  listarReinicioPorCliente,
  listarVencidos,
  marcarPendienteDisparo,
  listarPendientesDisparo,
  reservarParaEnvio,
};
