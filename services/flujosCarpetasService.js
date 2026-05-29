/**
 * Carpetas premium de flujos — por usuario y línea WhatsApp.
 * No modifica el motor de flujos ni flowService.
 */
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const CONEXION_TODAS = "__todas__";

const CARPETA_CATEGORIAS = [
  "ventas_automaticas",
  "lanzamientos",
  "recuperacion",
  "atencion",
  "retargeting",
  "evergreen",
];

const CARPETA_SLUGS = [...CARPETA_CATEGORIAS, "sin_carpeta"];

const SISTEMA_CARPETAS = [
  { slug: "ventas_automaticas", categoria: "ventas_automaticas", nombre: "Ventas automáticas", orden: 10 },
  { slug: "lanzamientos", categoria: "lanzamientos", nombre: "Lanzamientos", orden: 20 },
  { slug: "recuperacion", categoria: "recuperacion", nombre: "Recuperación", orden: 30 },
  { slug: "atencion", categoria: "atencion", nombre: "Atención", orden: 40 },
  { slug: "retargeting", categoria: "retargeting", nombre: "Retargeting", orden: 50 },
  { slug: "evergreen", categoria: "evergreen", nombre: "Evergreen", orden: 60 },
];

const CATEGORIA_UI = {
  ventas_automaticas: { label: "Ventas automáticas", icon: "💰", accent: "#22c55e" },
  lanzamientos: { label: "Lanzamientos", icon: "🚀", accent: "#a855f7" },
  recuperacion: { label: "Recuperación", icon: "🛒", accent: "#f59e0b" },
  atencion: { label: "Atención", icon: "🎧", accent: "#3b82f6" },
  retargeting: { label: "Retargeting", icon: "🎯", accent: "#f43f5e" },
  evergreen: { label: "Evergreen", icon: "♾️", accent: "#14b8a6" },
  sin_carpeta: { label: "Sin carpeta", icon: "📂", accent: "#94a3b8" },
};

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function sameConexionId(a, b) {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function isCategoriaValida(categoria) {
  return CARPETA_CATEGORIAS.includes(categoria);
}

function isSlugCarpeta(slug) {
  return CARPETA_SLUGS.includes(slug);
}

function mapCarpetaRow(row) {
  if (!row) return null;
  const categoria = row.categoria || row.slug || "evergreen";
  const ui = CATEGORIA_UI[categoria] || CATEGORIA_UI.evergreen;
  return {
    id: row.id,
    usuario_id: row.usuario_id,
    conexion_whatsapp_id: row.conexion_whatsapp_id,
    categoria,
    nombre: row.nombre,
    slug: row.slug || null,
    es_sistema: !!row.es_sistema,
    orden: row.orden ?? 0,
    creado_en: row.creado_en,
    actualizado_en: row.actualizado_en,
    label: ui.label,
    icon: ui.icon,
    accent: ui.accent,
    flujos_count: 0,
  };
}

function virtualSinCarpeta() {
  const ui = CATEGORIA_UI.sin_carpeta;
  return {
    id: "sin_carpeta",
    virtual: true,
    categoria: "sin_carpeta",
    nombre: ui.label,
    slug: "sin_carpeta",
    es_sistema: true,
    orden: 999,
    label: ui.label,
    icon: ui.icon,
    accent: ui.accent,
    flujos_count: 0,
  };
}

async function validarConexionUsuario(usuarioId, conexionId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(conexionId)}&usuario_id=eq.${usuarioId}&select=id`,
    { headers: supabaseHeaders() }
  );
  return Boolean(res.data?.[0]);
}

async function fetchCarpetasRaw(usuarioId, conexionId) {
  let url =
    `${SUPABASE_URL}/rest/v1/flujos_carpetas?usuario_id=eq.${usuarioId}` +
    `&select=id,usuario_id,conexion_whatsapp_id,categoria,nombre,slug,es_sistema,orden,creado_en,actualizado_en` +
    `&order=orden.asc,creado_en.asc`;
  if (conexionId) {
    url += `&conexion_whatsapp_id=eq.${encodeURIComponent(conexionId)}`;
  }
  const res = await axios.get(url, { headers: supabaseHeaders() });
  return res.data || [];
}

async function ensureSistemaCarpetas(usuarioId, conexionId) {
  const existentes = await fetchCarpetasRaw(usuarioId, conexionId);
  const slugs = new Set((existentes || []).map((c) => c.slug).filter(Boolean));
  const inserts = SISTEMA_CARPETAS.filter((s) => !slugs.has(s.slug)).map((s) => ({
    usuario_id: usuarioId,
    conexion_whatsapp_id: conexionId,
    categoria: s.categoria,
    nombre: s.nombre,
    slug: s.slug,
    es_sistema: true,
    orden: s.orden,
    actualizado_en: new Date().toISOString(),
  }));

  if (!inserts.length) return existentes;

  await axios.post(`${SUPABASE_URL}/rest/v1/flujos_carpetas`, inserts, {
    headers: supabaseHeaders({
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
  });

  return fetchCarpetasRaw(usuarioId, conexionId);
}

function extractFlowMeta(data) {
  const raw = data && typeof data === "object" ? data : {};
  const meta = raw.macbot_meta && typeof raw.macbot_meta === "object" ? raw.macbot_meta : {};
  const carpeta_id =
    typeof meta.carpeta_id === "string" && meta.carpeta_id.trim() ? meta.carpeta_id.trim() : null;
  const carpeta = isSlugCarpeta(meta.carpeta) ? meta.carpeta : "sin_carpeta";
  return { carpeta_id, carpeta };
}

function buildCarpetasIndex(carpetas) {
  const byId = {};
  const bySlugConn = {};
  (carpetas || []).forEach((c) => {
    byId[c.id] = c;
    if (c.slug && c.conexion_whatsapp_id) {
      bySlugConn[`${c.conexion_whatsapp_id}:${c.slug}`] = c;
    }
  });
  return { byId, bySlugConn };
}

function resolveFlowFolderKey(flow, index) {
  const { carpeta_id, carpeta } = extractFlowMeta(flow.data);
  const connId = flow.conexion_whatsapp_id || null;

  if (carpeta_id && index.byId[carpeta_id]) {
    return carpeta_id;
  }

  if (carpeta === "sin_carpeta" && !carpeta_id) {
    return "sin_carpeta";
  }

  if (connId && carpeta !== "sin_carpeta") {
    const found = index.bySlugConn[`${connId}:${carpeta}`];
    if (found) return found.id;
  }

  if (!carpeta_id && (carpeta === "sin_carpeta" || !isSlugCarpeta(carpeta))) {
    return "sin_carpeta";
  }

  return carpeta;
}

function attachCounts(carpetas, flujos, scope) {
  const index = buildCarpetasIndex(carpetas);
  const counts = { all: flujos.length, sin_carpeta: 0 };

  carpetas.forEach((c) => {
    counts[c.id] = 0;
    if (c.slug) counts[c.slug] = 0;
  });

  flujos.forEach((f) => {
    const key = resolveFlowFolderKey(f, index);
    if (key === "sin_carpeta") {
      counts.sin_carpeta += 1;
      return;
    }
    if (counts[key] !== undefined) counts[key] += 1;
    const carpeta = index.byId[key];
    if (carpeta?.slug) counts[carpeta.slug] = (counts[carpeta.slug] || 0) + 1;
  });

  const mapped = carpetas.map((c) => ({
    ...c,
    flujos_count: counts[c.id] || 0,
  }));

  const sinCarpeta = {
    ...virtualSinCarpeta(),
    flujos_count: counts.sin_carpeta || 0,
    conexion_whatsapp_id: scope?.id || null,
  };

  return { carpetas: mapped, sinCarpeta, counts };
}

async function listCarpetasConConteos(usuarioId, scope, flujos) {
  let rows = [];

  if (scope?.id) {
    await ensureSistemaCarpetas(usuarioId, scope.id);
    rows = await fetchCarpetasRaw(usuarioId, scope.id);
  } else {
    rows = await fetchCarpetasRaw(usuarioId, null);
  }

  const carpetas = rows.map(mapCarpetaRow).filter(Boolean);
  const { carpetas: conConteo, sinCarpeta, counts } = attachCounts(carpetas, flujos || [], scope);

  return {
    carpetas: conConteo,
    sin_carpeta: sinCarpeta,
    counts,
    categorias: CARPETA_CATEGORIAS,
    slugs: CARPETA_SLUGS,
  };
}

async function obtenerCarpetaUsuario(usuarioId, carpetaId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_carpetas?id=eq.${encodeURIComponent(carpetaId)}&usuario_id=eq.${usuarioId}&select=id,usuario_id,conexion_whatsapp_id,categoria,nombre,slug,es_sistema,orden,creado_en,actualizado_en`,
    { headers: supabaseHeaders() }
  );
  return mapCarpetaRow(res.data?.[0]);
}

async function crearCarpeta(usuarioId, conexionId, { nombre, categoria }) {
  const nombreTrim = String(nombre || "").trim();
  if (!nombreTrim) return { error: "Nombre de carpeta vacío" };
  if (!isCategoriaValida(categoria)) return { error: "Categoría inválida" };

  const ok = await validarConexionUsuario(usuarioId, conexionId);
  if (!ok) return { error: "Línea WhatsApp no válida" };

  const existentes = await fetchCarpetasRaw(usuarioId, conexionId);
  const maxOrden = existentes.reduce((m, c) => Math.max(m, c.orden || 0), 0);

  const res = await axios.post(
    `${SUPABASE_URL}/rest/v1/flujos_carpetas`,
    {
      usuario_id: usuarioId,
      conexion_whatsapp_id: conexionId,
      categoria,
      nombre: nombreTrim,
      slug: null,
      es_sistema: false,
      orden: maxOrden + 10,
      actualizado_en: new Date().toISOString(),
    },
    {
      headers: supabaseHeaders({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
    }
  );

  return { carpeta: mapCarpetaRow(res.data?.[0]) };
}

async function actualizarCarpeta(usuarioId, carpetaId, patch) {
  const actual = await obtenerCarpetaUsuario(usuarioId, carpetaId);
  if (!actual) return { error: "Carpeta no encontrada" };
  if (actual.es_sistema) {
    return { error: "Las carpetas del sistema no se pueden renombrar" };
  }

  const body = { actualizado_en: new Date().toISOString() };
  if (patch.nombre != null) {
    const nombreTrim = String(patch.nombre).trim();
    if (!nombreTrim) return { error: "Nombre de carpeta vacío" };
    body.nombre = nombreTrim;
  }
  if (patch.categoria != null) {
    if (!isCategoriaValida(patch.categoria)) return { error: "Categoría inválida" };
    body.categoria = patch.categoria;
  }
  if (patch.orden != null && Number.isFinite(Number(patch.orden))) {
    body.orden = Number(patch.orden);
  }

  const res = await axios.patch(
    `${SUPABASE_URL}/rest/v1/flujos_carpetas?id=eq.${encodeURIComponent(carpetaId)}&usuario_id=eq.${usuarioId}`,
    body,
    {
      headers: supabaseHeaders({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
    }
  );

  return { carpeta: mapCarpetaRow(res.data?.[0]) };
}

async function liberarFlujosDeCarpeta(usuarioId, carpetaId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder?usuario_id=eq.${usuarioId}&select=id,data`,
    { headers: supabaseHeaders() }
  );
  const flujos = res.data || [];
  const updates = [];

  for (const f of flujos) {
    const meta = extractFlowMeta(f.data);
    if (meta.carpeta_id !== carpetaId) continue;
    const data =
      f.data && typeof f.data === "object"
        ? { ...f.data, macbot_meta: { ...(f.data.macbot_meta || {}) } }
        : { nodos: [], conexiones: [], macbot_meta: {} };
    data.macbot_meta.carpeta_id = null;
    data.macbot_meta.carpeta = "sin_carpeta";
    data.macbot_meta.actualizado_en = new Date().toISOString();
    updates.push({ id: f.id, data });
  }

  for (const u of updates) {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${u.id}&usuario_id=eq.${usuarioId}`,
      { data: u.data },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
      }
    );
  }

  return updates.length;
}

async function eliminarCarpeta(usuarioId, carpetaId) {
  const actual = await obtenerCarpetaUsuario(usuarioId, carpetaId);
  if (!actual) return { error: "Carpeta no encontrada" };
  if (actual.es_sistema) return { error: "No se puede eliminar una carpeta del sistema" };

  await liberarFlujosDeCarpeta(usuarioId, carpetaId);

  await axios.delete(
    `${SUPABASE_URL}/rest/v1/flujos_carpetas?id=eq.${encodeURIComponent(carpetaId)}&usuario_id=eq.${usuarioId}`,
    { headers: supabaseHeaders() }
  );

  return { ok: true };
}

function metaFromCarpeta(carpeta) {
  if (!carpeta) {
    return { carpeta_id: null, carpeta: "sin_carpeta" };
  }
  if (carpeta === "sin_carpeta" || carpeta.id === "sin_carpeta") {
    return { carpeta_id: null, carpeta: "sin_carpeta" };
  }
  return {
    carpeta_id: carpeta.id,
    carpeta: carpeta.slug || carpeta.categoria || "sin_carpeta",
  };
}

module.exports = {
  CONEXION_TODAS,
  CARPETA_CATEGORIAS,
  CARPETA_SLUGS,
  SISTEMA_CARPETAS,
  CATEGORIA_UI,
  isCategoriaValida,
  isSlugCarpeta,
  listCarpetasConConteos,
  obtenerCarpetaUsuario,
  crearCarpeta,
  actualizarCarpeta,
  eliminarCarpeta,
  ensureSistemaCarpetas,
  resolveFlowFolderKey,
  extractFlowMeta,
  metaFromCarpeta,
  buildCarpetasIndex,
  attachCounts,
};
