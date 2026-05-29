/**
 * Versiones / snapshots de flujos_builder (Fase 3).
 * Sin dependencia de flowService (motor de ejecución).
 */
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const MAX_VERSIONS_PER_FLOW = 20;
const DEFAULT_META = {
  estado: "borrador",
  carpeta: "sin_carpeta",
  etiquetas: [],
  campanas: [],
};

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function log(msg, extra) {
  if (extra !== undefined) console.log(`[flujosVersion] ${msg}`, extra);
  else console.log(`[flujosVersion] ${msg}`);
}

function normalizeDataBlock(raw) {
  const block = raw && typeof raw === "object" ? raw : {};
  return {
    nodos: Array.isArray(block.nodos) ? block.nodos : [],
    conexiones: Array.isArray(block.conexiones) ? block.conexiones : [],
    macbot_meta:
      block.macbot_meta && typeof block.macbot_meta === "object"
        ? { ...block.macbot_meta }
        : null,
  };
}

/** Fusiona guardado del builder con meta CRM existente. */
function mergeFlowDataForSave(existingData, incomingData) {
  const existing = normalizeDataBlock(existingData);
  const incoming = normalizeDataBlock(incomingData);
  const meta = existing.macbot_meta
    ? { ...existing.macbot_meta }
    : { ...DEFAULT_META };

  if (meta.actualizado_en !== undefined) {
    meta.actualizado_en = new Date().toISOString();
  } else {
    meta.actualizado_en = new Date().toISOString();
  }

  return {
    nodos: incoming.nodos,
    conexiones: incoming.conexiones,
    macbot_meta: meta,
  };
}

/** Solo grafo para snapshot / restaurar. */
function extractGraphSnapshot(data) {
  const block = normalizeDataBlock(data);
  return {
    nodos: block.nodos,
    conexiones: block.conexiones,
  };
}

/** Aplica grafo de versión preservando macbot_meta actual del flujo. */
function applyGraphToFlowData(currentData, graphSnapshot) {
  const current = normalizeDataBlock(currentData);
  const graph = extractGraphSnapshot(graphSnapshot);
  const meta = current.macbot_meta
    ? { ...current.macbot_meta }
    : { ...DEFAULT_META };

  meta.actualizado_en = new Date().toISOString();

  return {
    nodos: graph.nodos,
    conexiones: graph.conexiones,
    macbot_meta: meta,
  };
}

async function insertVersion({
  flujoId,
  usuarioId,
  conexionWhatsappId,
  nombre,
  dataSnapshot,
  motivo,
}) {
  const graph = extractGraphSnapshot(dataSnapshot);
  const payload = {
    flujo_id: flujoId,
    usuario_id: usuarioId,
    conexion_whatsapp_id: conexionWhatsappId || null,
    nombre: String(nombre || "Flujo").trim().slice(0, 200) || "Flujo",
    data_snapshot: graph,
    motivo: motivo || "guardado_builder",
  };

  const res = await axios.post(
    `${SUPABASE_URL}/rest/v1/flujos_builder_versiones`,
    payload,
    {
      headers: supabaseHeaders({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
    }
  );

  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  await pruneVersions(flujoId);
  return row;
}

async function pruneVersions(flujoId) {
  const listRes = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder_versiones?flujo_id=eq.${encodeURIComponent(flujoId)}&select=id&order=creado_en.desc`,
    { headers: supabaseHeaders() }
  );

  const rows = listRes.data || [];
  if (rows.length <= MAX_VERSIONS_PER_FLOW) return;

  const toDelete = rows.slice(MAX_VERSIONS_PER_FLOW).map((r) => r.id);
  for (const vid of toDelete) {
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/flujos_builder_versiones?id=eq.${encodeURIComponent(vid)}`,
      { headers: supabaseHeaders() }
    );
  }
  log(`podadas ${toDelete.length} versiones flujo=${flujoId}`);
}

/**
 * Crea versión sin lanzar error al caller (guardado builder no debe fallar).
 */
async function createVersionSafe(params) {
  try {
    return await insertVersion(params);
  } catch (err) {
    log("createVersionSafe ERROR", err.response?.data || err.message);
    return null;
  }
}

async function listVersions(usuarioId, flujoId, { limit = 20 } = {}) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder_versiones?flujo_id=eq.${encodeURIComponent(flujoId)}&usuario_id=eq.${usuarioId}&select=id,flujo_id,nombre,motivo,creado_en,data_snapshot&order=creado_en.desc&limit=${Math.min(limit, 50)}`,
    { headers: supabaseHeaders() }
  );

  return (res.data || []).map((row) => {
    const snap = row.data_snapshot || {};
    const nodos = Array.isArray(snap.nodos) ? snap.nodos : [];
    const conexiones = Array.isArray(snap.conexiones) ? snap.conexiones : [];
    return {
      id: row.id,
      flujo_id: row.flujo_id,
      nombre: row.nombre,
      motivo: row.motivo,
      creado_en: row.creado_en,
      nodos_count: nodos.length,
      conexiones_count: conexiones.length,
    };
  });
}

async function getVersion(usuarioId, flujoId, versionId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder_versiones?id=eq.${encodeURIComponent(versionId)}&flujo_id=eq.${encodeURIComponent(flujoId)}&usuario_id=eq.${usuarioId}&select=*`,
    { headers: supabaseHeaders() }
  );
  return res.data?.[0] || null;
}

async function restoreVersion(usuarioId, flujoId, versionId) {
  const version = await getVersion(usuarioId, flujoId, versionId);
  if (!version) {
    return { ok: false, status: 404, error: "Versión no encontrada" };
  }

  const flujoRes = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${encodeURIComponent(flujoId)}&usuario_id=eq.${usuarioId}&select=id,nombre,data,conexion_whatsapp_id`,
    { headers: supabaseHeaders() }
  );

  const flujo = flujoRes.data?.[0];
  if (!flujo) {
    return { ok: false, status: 404, error: "Flujo no encontrado" };
  }

  await createVersionSafe({
    flujoId,
    usuarioId,
    conexionWhatsappId: flujo.conexion_whatsapp_id,
    nombre: flujo.nombre,
    dataSnapshot: flujo.data,
    motivo: "pre_restaurar",
  });

  const mergedData = applyGraphToFlowData(flujo.data, version.data_snapshot);

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${encodeURIComponent(flujoId)}&usuario_id=eq.${usuarioId}`,
    { data: mergedData },
    {
      headers: supabaseHeaders({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
    }
  );

  await createVersionSafe({
    flujoId,
    usuarioId,
    conexionWhatsappId: flujo.conexion_whatsapp_id,
    nombre: flujo.nombre,
    dataSnapshot: mergedData,
    motivo: "restaurado",
  });

  return {
    ok: true,
    flujo: { id: flujo.id, nombre: flujo.nombre, data: mergedData },
    version_id: versionId,
  };
}

module.exports = {
  MAX_VERSIONS_PER_FLOW,
  mergeFlowDataForSave,
  extractGraphSnapshot,
  applyGraphToFlowData,
  createVersionSafe,
  listVersions,
  getVersion,
  restoreVersion,
  pruneVersions,
};
