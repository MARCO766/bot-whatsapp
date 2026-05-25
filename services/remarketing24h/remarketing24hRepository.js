const axios = require("axios");
const { ESTADOS_RM24H, ESTADOS_ABIERTOS } = require("./constants");
const { coherenciaEstadoRm24h } = require("./estadoCoherencia");
const { nowUtc, toTimestamptzUtc } = require("../seguimiento/timestamps");

/** PostgREST: timestamps con ms llevan '.' — hay que usar lte."ISO" entre comillas. */
function encodeExpiraEnLteFilter(date = new Date()) {
  const iso = toTimestamptzUtc(date);
  return encodeURIComponent(`lte."${iso}"`);
}

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
      `&activo=eq.true` +
      `&select=*&limit=1`,
    { headers: headers() }
  );
  return (response.data || [])[0] || null;
}

/** Corrige filas legacy: estado vivo pero activo=false (p. ej. tras conversión parcial). */
async function buscarInconsistenteActivoApagado({
  usuario_id,
  cliente_numero,
  flujo_id,
}) {
  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/remarketing_global_24h?usuario_id=eq.${usuario_id}` +
      `&cliente_numero=eq.${encodeURIComponent(cliente_numero)}` +
      `&flujo_id=eq.${encodeURIComponent(flujo_id)}` +
      `&estado=eq.${ESTADOS_RM24H.ACTIVO}` +
      `&activo=eq.false` +
      `&select=*&limit=1`,
    { headers: headers() }
  );
  return (response.data || [])[0] || null;
}

async function insertar(row) {
  const coherente = coherenciaEstadoRm24h(row, row);
  const response = await axios.post(
    `${SUPABASE_URL}/rest/v1/remarketing_global_24h`,
    coherente,
    { headers: headers({ Prefer: "return=representation" }) }
  );
  return (response.data || [])[0] || null;
}

async function actualizarPorId(id, payload, filaActual = {}) {
  const coherente = coherenciaEstadoRm24h(payload, filaActual);
  const response = await axios.patch(
    `${SUPABASE_URL}/rest/v1/remarketing_global_24h?id=eq.${id}`,
    { ...coherente, actualizado_en: nowUtc() },
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
  const ahora = new Date();
  const ahoraIso = toTimestamptzUtc(ahora);
  const expiraFilter = encodeExpiraEnLteFilter(ahora);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("[RM24H_WORKER] error", {
      motivo: "falta SUPABASE_URL o SUPABASE_SECRET_KEY",
    });
    return [];
  }

  const url =
    `${SUPABASE_URL}/rest/v1/remarketing_global_24h?estado=eq.${ESTADOS_RM24H.ACTIVO}` +
    `&activo=eq.true&expira_en=${expiraFilter}` +
    `&order=expira_en.asc&limit=${limite}&select=*`;

  console.log("[RM24H_WORKER] now", ahoraIso);

  let response;
  try {
    response = await axios.get(url, { headers: headers() });
  } catch (err) {
    console.log("[RM24H_WORKER] error", err.response?.data || err.message);
    throw err;
  }

  const filas = response.data || [];
  console.log("[RM24H_WORKER] vencidos encontrados", filas.length, {
    filtros: {
      estado: ESTADOS_RM24H.ACTIVO,
      activo: true,
      expira_en_lte: ahoraIso,
    },
    ids: filas.map((f) => f.id),
  });

  return filas;
}

async function marcarPendienteDisparo(id, filaActual = {}) {
  return actualizarPorId(
    id,
    {
      estado: ESTADOS_RM24H.PENDIENTE_DISPARO,
      activo: true,
    },
    filaActual
  );
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
async function reservarParaEnvio(id, filaActual = {}) {
  const payload = coherenciaEstadoRm24h(
    { estado: ESTADOS_RM24H.PROCESANDO, activo: true },
    filaActual
  );
  const response = await axios.patch(
    `${SUPABASE_URL}/rest/v1/remarketing_global_24h?id=eq.${id}&estado=eq.${ESTADOS_RM24H.PENDIENTE_DISPARO}&activo=eq.true`,
    {
      ...payload,
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
  buscarInconsistenteActivoApagado,
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
