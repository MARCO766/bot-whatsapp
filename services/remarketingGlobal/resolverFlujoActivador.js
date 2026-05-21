/**
 * Resuelve flujo por activador SIN ejecutar el grafo.
 * Usado por webhook (remarketing) antes de procesarMensajeEntrante.
 */
const axios = require("axios");
const { sortActivadores, matchActivador } = require("../activadorUtils");

function normalizarTextoActivador(texto) {
  return String(texto || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function obtenerDatosFlujo(flujo) {
  if (!flujo) return null;
  return flujo.data || flujo.datos || null;
}

function flujoEstaActivo(flujo) {
  const datos = obtenerDatosFlujo(flujo);
  if (!datos) return false;
  const meta = datos.macbot_meta;
  if (meta && typeof meta.estado === "string") {
    return meta.estado === "activo";
  }
  return Array.isArray(datos.nodos) && datos.nodos.length > 0;
}

async function resolverFlujoActivadorPorTexto(textoCliente, usuarioId) {
  if (!textoCliente || !usuarioId) {
    return { ok: false, motivo: "sin_texto_o_usuario" };
  }

  const textoNorm = normalizarTextoActivador(textoCliente);
  if (!textoNorm) return { ok: false, motivo: "texto_vacio" };

  let activadores = [];
  try {
    const responseActivadores = await axios.get(
      `${SUPABASE_URL}/rest/v1/activadores?select=id,frase,flujo_id,activo,prioridad,coincidencia,veces_usado,repetible,tipo_activador,palabras_clave_array&activo=eq.true&usuario_id=eq.${usuarioId}`,
      { headers: supabaseHeaders() }
    );
    activadores = responseActivadores.data || [];
  } catch (e) {
    const responseActivadores = await axios.get(
      `${SUPABASE_URL}/rest/v1/activadores?select=id,frase,flujo_id,activo,repetible&activo=eq.true&usuario_id=eq.${usuarioId}`,
      { headers: supabaseHeaders() }
    );
    activadores = (responseActivadores.data || []).map((a) => ({
      ...a,
      prioridad: 0,
      coincidencia: "contiene",
      veces_usado: 0,
      tipo_activador: "palabra_unica",
      palabras_clave_array: [],
    }));
  }

  if (!activadores.length) {
    return { ok: false, motivo: "sin_activadores" };
  }

  const ordenados = sortActivadores(activadores);
  let activador = null;
  let matchInfo = null;

  for (const a of ordenados) {
    const result = matchActivador(textoNorm, a);
    if (result.matched) {
      activador = a;
      matchInfo = result;
      break;
    }
  }

  if (!activador) {
    return { ok: false, motivo: "activador_no_match" };
  }

  const flowId = activador.flujo_id;
  if (!flowId) {
    return { ok: false, motivo: "flujo_id_invalido" };
  }

  const responseFlujo = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${flowId}&usuario_id=eq.${usuarioId}&select=*`,
    { headers: supabaseHeaders() }
  );

  const flujo = responseFlujo.data?.[0];
  const flujoDatos = obtenerDatosFlujo(flujo);

  if (!flujo || !flujoDatos) {
    return { ok: false, motivo: "flujo_no_encontrado" };
  }

  if (!flujoEstaActivo(flujo)) {
    return { ok: false, motivo: "flujo_inactivo" };
  }

  return {
    ok: true,
    activador,
    flujo,
    flujoDatos,
    matchInfo,
  };
}

async function obtenerFlujoPorId(flujoId, usuarioId) {
  if (!flujoId || !usuarioId) return null;

  const responseFlujo = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${flujoId}&usuario_id=eq.${usuarioId}&select=*`,
    { headers: supabaseHeaders() }
  );

  const flujo = responseFlujo.data?.[0];
  const flujoDatos = obtenerDatosFlujo(flujo);
  if (!flujo || !flujoDatos || !flujoEstaActivo(flujo)) return null;

  return { flujo, flujoDatos };
}

module.exports = {
  resolverFlujoActivadorPorTexto,
  obtenerFlujoPorId,
};
