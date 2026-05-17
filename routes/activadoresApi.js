/**
 * API REST para Activadores (React CRM).
 * Tabla Supabase: activadores (frase, activo, …)
 */
const express = require("express");
const router = express.Router();
const axios = require("axios");
const {
  validateActivadorBody,
  bodyToActivadorFields,
  mapActivadorRow,
} = require("../services/activadorUtils");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const SELECT_BASE =
  "id,usuario_id,nombre,flujo_id,conexion,frase,activo,repetible,creado_en";
const SELECT_EXTENDED = `${SELECT_BASE},prioridad,coincidencia,veces_usado,ultima_ejecucion,tipo_activador,palabras_clave_array`;

function log(msg, extra) {
  if (extra !== undefined) console.log(`[activadoresApi] ${msg}`, extra);
  else console.log(`[activadoresApi] ${msg}`);
}

function protegerApi(req, res, next) {
  if (req.session?.usuario) return next();
  return res.status(401).json({ ok: false, error: "No autenticado" });
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function stripExtendedFields(payload) {
  const { coincidencia, prioridad, tipo_activador, palabras_clave_array, ...core } = payload;
  return core;
}

async function fetchActivadoresRaw(usuarioId) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/activadores?select=${SELECT_EXTENDED}&usuario_id=eq.${usuarioId}&order=creado_en.desc`,
      { headers: supabaseHeaders() }
    );
    return res.data || [];
  } catch (e) {
    log("select extended fallback", e.response?.data?.message || e.message);
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/activadores?select=${SELECT_BASE}&usuario_id=eq.${usuarioId}&order=creado_en.desc`,
      { headers: supabaseHeaders() }
    );
    return res.data || [];
  }
}

async function fetchFlujosMini(usuarioId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder?select=id,nombre&usuario_id=eq.${usuarioId}&order=nombre.asc`,
    { headers: supabaseHeaders() }
  );
  return res.data || [];
}

function computeStats(activadores) {
  const today = new Date().toISOString().slice(0, 10);
  let activos = 0;
  let pausados = 0;
  let usadosHoy = 0;

  for (const a of activadores) {
    if (a.activo) activos++;
    else pausados++;
    if (a.ultima_ejecucion && String(a.ultima_ejecucion).slice(0, 10) === today) {
      usadosHoy++;
    }
  }

  return {
    total: activadores.length,
    activos,
    pausados,
    usados_hoy: usadosHoy,
  };
}

async function verifyOwnership(id, usuarioId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/activadores?select=id&id=eq.${id}&usuario_id=eq.${usuarioId}`,
    { headers: supabaseHeaders() }
  );
  return (res.data || []).length > 0;
}

async function supabaseWrite(method, url, data) {
  const config = {
    method,
    url,
    headers: supabaseHeaders({
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=representation",
    }),
  };
  if (data !== undefined) config.data = data;
  return axios(config);
}

// GET /api/activadores
router.get("/api/activadores", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  try {
    const [rows, flujos] = await Promise.all([
      fetchActivadoresRaw(usuario.id),
      fetchFlujosMini(usuario.id),
    ]);
    const flujosById = Object.fromEntries(flujos.map((f) => [f.id, f]));
    const activadores = rows.map((r) => mapActivadorRow(r, flujosById));
    res.json({
      ok: true,
      activadores,
      stats: computeStats(rows),
      flujos,
    });
  } catch (e) {
    log("GET error", e.response?.data || e.message);
    res.status(500).json({ ok: false, error: "No se pudieron cargar los activadores" });
  }
});

// POST /api/activadores
router.post("/api/activadores", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  const validation = validateActivadorBody(req.body);
  if (!validation.ok) {
    return res.status(400).json({ ok: false, error: validation.error });
  }

  try {
    const payload = {
      ...bodyToActivadorFields(req.body, usuario.id),
      creado_en: new Date().toISOString(),
    };
    let created;
    try {
      const r = await supabaseWrite(
        "POST",
        `${SUPABASE_URL}/rest/v1/activadores`,
        payload
      );
      created = r.data?.[0];
    } catch (e) {
      const r = await supabaseWrite(
        "POST",
        `${SUPABASE_URL}/rest/v1/activadores`,
        stripExtendedFields(payload)
      );
      created = r.data?.[0];
    }

    const flujos = await fetchFlujosMini(usuario.id);
    const flujosById = Object.fromEntries(flujos.map((f) => [f.id, f]));
    log(`creado id=${created?.id} tipo=${payload.tipo_activador || "palabra_unica"}`);
    res.status(201).json({ ok: true, activador: mapActivadorRow(created, flujosById) });
  } catch (e) {
    log("POST error", e.response?.data || e.message);
    res.status(500).json({ ok: false, error: "No se pudo crear el activador" });
  }
});

// PATCH /api/activadores/:id
router.patch("/api/activadores/:id", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  const { id } = req.params;

  try {
    if (!(await verifyOwnership(id, usuario.id))) {
      return res.status(404).json({ ok: false, error: "Activador no encontrado" });
    }

    const validation = validateActivadorBody(req.body);
    if (!validation.ok) {
      return res.status(400).json({ ok: false, error: validation.error });
    }

    const payload = bodyToActivadorFields(req.body, usuario.id);
    delete payload.usuario_id;

    let updated;
    try {
      const r = await supabaseWrite(
        "PATCH",
        `${SUPABASE_URL}/rest/v1/activadores?id=eq.${id}&usuario_id=eq.${usuario.id}`,
        payload
      );
      updated = r.data?.[0];
    } catch (e) {
      const r = await supabaseWrite(
        "PATCH",
        `${SUPABASE_URL}/rest/v1/activadores?id=eq.${id}&usuario_id=eq.${usuario.id}`,
        stripExtendedFields(payload)
      );
      updated = r.data?.[0];
    }

    const flujos = await fetchFlujosMini(usuario.id);
    const flujosById = Object.fromEntries(flujos.map((f) => [f.id, f]));
    res.json({ ok: true, activador: mapActivadorRow(updated, flujosById) });
  } catch (e) {
    log("PATCH error", e.response?.data || e.message);
    res.status(500).json({ ok: false, error: "No se pudo actualizar el activador" });
  }
});

// DELETE /api/activadores/:id
router.delete("/api/activadores/:id", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  const { id } = req.params;

  try {
    if (!(await verifyOwnership(id, usuario.id))) {
      return res.status(404).json({ ok: false, error: "Activador no encontrado" });
    }

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/activadores?id=eq.${id}&usuario_id=eq.${usuario.id}`,
      { headers: supabaseHeaders() }
    );
    log(`eliminado id=${id}`);
    res.json({ ok: true });
  } catch (e) {
    log("DELETE error", e.response?.data || e.message);
    res.status(500).json({ ok: false, error: "No se pudo eliminar el activador" });
  }
});

// POST /api/activadores/:id/toggle
router.post("/api/activadores/:id/toggle", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  const { id } = req.params;

  try {
    const rows = await axios.get(
      `${SUPABASE_URL}/rest/v1/activadores?select=id,activo&usuario_id=eq.${usuario.id}&id=eq.${id}`,
      { headers: supabaseHeaders() }
    );
    const row = rows.data?.[0];
    if (!row) {
      return res.status(404).json({ ok: false, error: "Activador no encontrado" });
    }

    const nuevoActivo = !row.activo;
    const r = await supabaseWrite(
      "PATCH",
      `${SUPABASE_URL}/rest/v1/activadores?id=eq.${id}&usuario_id=eq.${usuario.id}`,
      { activo: nuevoActivo }
    );
    const updated = r.data?.[0];
    const flujos = await fetchFlujosMini(usuario.id);
    const flujosById = Object.fromEntries(flujos.map((f) => [f.id, f]));
    res.json({
      ok: true,
      activador: mapActivadorRow(updated, flujosById),
      estado: nuevoActivo ? "activo" : "pausado",
    });
  } catch (e) {
    log("toggle error", e.response?.data || e.message);
    res.status(500).json({ ok: false, error: "No se pudo cambiar el estado" });
  }
});

module.exports = router;
