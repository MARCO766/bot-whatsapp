/**
 * Etiquetas CRM — tabla etiquetas + conteo desde clientes_etiquetas (por nombre).
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

function log(msg, extra) {
  if (extra !== undefined) console.log(`[etiquetasService] ${msg}`, extra);
  else console.log(`[etiquetasService] ${msg}`);
}

async function fetchAsignaciones(usuarioId) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas?usuario_id=eq.${encodeURIComponent(usuarioId)}&select=etiqueta,cliente_numero`,
      { headers: headers() }
    );
    return res.data || [];
  } catch (error) {
    log("fetchAsignaciones:", error.response?.data || error.message);
    return [];
  }
}

function buildLeadCounts(asignaciones) {
  const counts = {};
  (asignaciones || []).forEach((row) => {
    const key = String(row.etiqueta || "").trim();
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

async function listEtiquetas(usuarioId) {
  const uid = encodeURIComponent(usuarioId);
  const [etiquetasRes, asignaciones] = await Promise.all([
    axios.get(
      `${SUPABASE_URL}/rest/v1/etiquetas?usuario_id=eq.${uid}&select=id,nombre,color,creado_en&order=creado_en.desc`,
      { headers: headers() }
    ),
    fetchAsignaciones(usuarioId),
  ]);

  const counts = buildLeadCounts(asignaciones);
  const etiquetas = (etiquetasRes.data || []).map((e) => ({
    id: e.id,
    nombre: e.nombre,
    color: e.color || "#22c55e",
    creado_en: e.creado_en,
    leadsCount: counts[e.nombre] || 0,
  }));

  return {
    ok: true,
    total: etiquetas.length,
    etiquetas,
  };
}

async function createEtiqueta(usuarioId, body) {
  const nombre = String(body?.nombre || "").trim();
  if (!nombre) {
    const err = new Error("Nombre de etiqueta obligatorio");
    err.status = 400;
    throw err;
  }

  const res = await axios.post(
    `${SUPABASE_URL}/rest/v1/etiquetas`,
    {
      nombre,
      color: body?.color || "#22c55e",
      usuario_id: usuarioId,
    },
    {
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
    }
  );

  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  return {
    ok: true,
    etiqueta: { ...row, leadsCount: 0 },
  };
}

async function updateEtiqueta(usuarioId, id, body) {
  const patch = {};
  if (body.nombre !== undefined) patch.nombre = String(body.nombre).trim();
  if (body.color !== undefined) patch.color = String(body.color).trim();

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/etiquetas?id=eq.${encodeURIComponent(id)}&usuario_id=eq.${encodeURIComponent(usuarioId)}`,
    patch,
    { headers: headers({ "Content-Type": "application/json", Prefer: "return=representation" }) }
  );

  const listed = await listEtiquetas(usuarioId);
  const etiqueta = listed.etiquetas.find((e) => e.id === id);
  return { ok: true, etiqueta };
}

async function deleteEtiqueta(usuarioId, id) {
  const listed = await listEtiquetas(usuarioId);
  const tag = listed.etiquetas.find((e) => e.id === id);

  await axios.delete(
    `${SUPABASE_URL}/rest/v1/etiquetas?id=eq.${encodeURIComponent(id)}&usuario_id=eq.${encodeURIComponent(usuarioId)}`,
    { headers: headers() }
  );

  if (tag?.nombre) {
    try {
      await axios.delete(
        `${SUPABASE_URL}/rest/v1/clientes_etiquetas?usuario_id=eq.${encodeURIComponent(usuarioId)}&etiqueta=eq.${encodeURIComponent(tag.nombre)}`,
        { headers: headers() }
      );
    } catch (error) {
      log("delete clientes_etiquetas (opcional):", error.response?.data || error.message);
    }
  }

  return { ok: true };
}

module.exports = {
  listEtiquetas,
  createEtiqueta,
  updateEtiqueta,
  deleteEtiqueta,
};
