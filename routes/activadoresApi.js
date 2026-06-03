/**
 * API REST para Activadores (React CRM).
 * Tabla Supabase: activadores (frase, activo, conexion_whatsapp_id, …)
 */
const express = require("express");
const router = express.Router();
const axios = require("axios");
const {
  validateActivadorBody,
  bodyToActivadorFields,
  mapActivadorRow,
  sameConexionId,
} = require("../services/activadorUtils");
const rt = require("../services/realtimeService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const CONEXION_TODAS = "__todas__";

const SELECT_BASE =
  "id,usuario_id,nombre,flujo_id,conexion,conexion_whatsapp_id,frase,activo,repetible,creado_en";
const SELECT_EXTENDED = `${SELECT_BASE},prioridad,coincidencia,veces_usado,ultima_ejecucion,tipo_activador,palabras_clave_array`;

const { protegerApi } = require("../middlewares/auth");

function log(msg, extra) {
  if (extra !== undefined) console.log(`[activadoresApi] ${msg}`, extra);
  else console.log(`[activadoresApi] ${msg}`);
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function leerConexionScope(req) {
  const raw =
    req.body?.conexion_whatsapp_id ??
    req.body?.conexionWhatsappId ??
    req.query?.conexion_whatsapp_id;
  if (raw == null || String(raw).trim() === "") {
    return { todas: true, id: null };
  }
  const id = String(raw).trim();
  if (id === CONEXION_TODAS) return { todas: true, id: null };
  return { todas: false, id };
}

function requiereConexionEscribir(scope) {
  if (!scope?.id) {
    return {
      error:
        "Selecciona una línea WhatsApp (no «Todas las líneas») para crear o editar activadores",
    };
  }
  return null;
}

function stripExtendedFields(payload) {
  const { coincidencia, prioridad, tipo_activador, palabras_clave_array, ...core } = payload;
  return core;
}

async function fetchActivadoresRaw(usuarioId, scope) {
  let url =
    `${SUPABASE_URL}/rest/v1/activadores?select=${SELECT_EXTENDED}` +
    `&usuario_id=eq.${usuarioId}`;
  if (scope?.id) {
    url += `&conexion_whatsapp_id=eq.${encodeURIComponent(scope.id)}`;
  }
  url += "&order=creado_en.desc";

  try {
    const res = await axios.get(url, { headers: supabaseHeaders() });
    return res.data || [];
  } catch (e) {
    log("select extended fallback", e.response?.data?.message || e.message);
    let fallbackUrl =
      `${SUPABASE_URL}/rest/v1/activadores?select=${SELECT_BASE}` +
      `&usuario_id=eq.${usuarioId}`;
    if (scope?.id) {
      fallbackUrl += `&conexion_whatsapp_id=eq.${encodeURIComponent(scope.id)}`;
    }
    fallbackUrl += "&order=creado_en.desc";
    const res = await axios.get(fallbackUrl, { headers: supabaseHeaders() });
    return res.data || [];
  }
}

async function fetchFlujosMini(usuarioId, scope) {
  let url =
    `${SUPABASE_URL}/rest/v1/flujos_builder?select=id,nombre,conexion_whatsapp_id` +
    `&usuario_id=eq.${usuarioId}`;
  if (scope?.id) {
    url += `&conexion_whatsapp_id=eq.${encodeURIComponent(scope.id)}`;
  }
  url += "&order=nombre.asc";
  const res = await axios.get(url, { headers: supabaseHeaders() });
  return res.data || [];
}

async function obtenerFlujoUsuario(usuarioId, flujoId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${encodeURIComponent(flujoId)}&usuario_id=eq.${usuarioId}&select=id,nombre,conexion_whatsapp_id`,
    { headers: supabaseHeaders() }
  );
  return res.data?.[0] || null;
}

async function assertFlujoEnLinea(usuarioId, flujoId, conexionId) {
  const flujo = await obtenerFlujoUsuario(usuarioId, flujoId);
  if (!flujo) {
    return { ok: false, status: 404, error: "Flujo no encontrado" };
  }
  if (!flujo.conexion_whatsapp_id || !sameConexionId(flujo.conexion_whatsapp_id, conexionId)) {
    return {
      ok: false,
      status: 403,
      error: "El flujo no pertenece a esta línea WhatsApp",
    };
  }
  return { ok: true, flujo };
}

async function obtenerActivadorUsuario(usuarioId, id) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/activadores?select=${SELECT_EXTENDED}&id=eq.${id}&usuario_id=eq.${usuarioId}`,
    { headers: supabaseHeaders() }
  );
  return res.data?.[0] || null;
}

async function assertActivadorEnScope(usuarioId, id, scope) {
  const row = await obtenerActivadorUsuario(usuarioId, id);
  if (!row) {
    return { ok: false, status: 404, error: "Activador no encontrado" };
  }
  if (scope?.id) {
    if (!row.conexion_whatsapp_id || !sameConexionId(row.conexion_whatsapp_id, scope.id)) {
      return { ok: false, status: 403, error: "Activador no pertenece a esta línea" };
    }
  }
  return { ok: true, row };
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

// GET /api/activadores?conexion_whatsapp_id=<uuid>|__todas__
router.get("/api/activadores", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  const scope = leerConexionScope(req);

  try {
    const [rows, flujos] = await Promise.all([
      fetchActivadoresRaw(usuario.id, scope),
      fetchFlujosMini(usuario.id, scope),
    ]);
    const flujosById = Object.fromEntries(flujos.map((f) => [f.id, f]));
    const activadores = rows.map((r) => mapActivadorRow(r, flujosById));
    res.json({
      ok: true,
      activadores,
      stats: computeStats(rows),
      flujos,
      conexion_whatsapp_id: scope.todas ? CONEXION_TODAS : scope.id,
    });
  } catch (e) {
    log("GET error", e.response?.data || e.message);
    res.status(500).json({ ok: false, error: "No se pudieron cargar los activadores" });
  }
});

// POST /api/activadores
router.post("/api/activadores", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  const scope = leerConexionScope(req);
  const scopeErr = requiereConexionEscribir(scope);
  if (scopeErr) {
    return res.status(400).json({ ok: false, error: scopeErr.error });
  }

  const validation = validateActivadorBody(req.body);
  if (!validation.ok) {
    return res.status(400).json({ ok: false, error: validation.error });
  }

  const flujoCheck = await assertFlujoEnLinea(usuario.id, req.body.flujo_id, scope.id);
  if (!flujoCheck.ok) {
    return res.status(flujoCheck.status).json({ ok: false, error: flujoCheck.error });
  }

  try {
    const payload = {
      ...bodyToActivadorFields(req.body, usuario.id, scope.id),
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

    const flujos = await fetchFlujosMini(usuario.id, scope);
    const flujosById = Object.fromEntries(flujos.map((f) => [f.id, f]));
    log(
      `creado id=${created?.id} tipo=${payload.tipo_activador || "palabra_unica"} conexion=${scope.id}`
    );
    const activadorMapped = mapActivadorRow(created, flujosById);
    rt.activadorCreado(req, usuario.id, { activador: activadorMapped });
    res.status(201).json({ ok: true, activador: activadorMapped });
  } catch (e) {
    log("POST error", e.response?.data || e.message);
    res.status(500).json({ ok: false, error: "No se pudo crear el activador" });
  }
});

// PATCH /api/activadores/:id
router.patch("/api/activadores/:id", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  const { id } = req.params;
  const scope = leerConexionScope(req);
  const scopeErr = requiereConexionEscribir(scope);
  if (scopeErr) {
    return res.status(400).json({ ok: false, error: scopeErr.error });
  }

  try {
    const acceso = await assertActivadorEnScope(usuario.id, id, scope);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ ok: false, error: acceso.error });
    }

    const validation = validateActivadorBody(req.body);
    if (!validation.ok) {
      return res.status(400).json({ ok: false, error: validation.error });
    }

    const flujoCheck = await assertFlujoEnLinea(usuario.id, req.body.flujo_id, scope.id);
    if (!flujoCheck.ok) {
      return res.status(flujoCheck.status).json({ ok: false, error: flujoCheck.error });
    }

    const payload = bodyToActivadorFields(req.body, usuario.id, scope.id);
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

    const flujos = await fetchFlujosMini(usuario.id, scope);
    const flujosById = Object.fromEntries(flujos.map((f) => [f.id, f]));
    const activadorMapped = mapActivadorRow(updated, flujosById);
    rt.activadorActualizado(req, usuario.id, { activador: activadorMapped });
    res.json({ ok: true, activador: activadorMapped });
  } catch (e) {
    log("PATCH error", e.response?.data || e.message);
    res.status(500).json({ ok: false, error: "No se pudo actualizar el activador" });
  }
});

// DELETE /api/activadores/:id
router.delete("/api/activadores/:id", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  const { id } = req.params;
  const scope = leerConexionScope(req);

  try {
    const acceso = await assertActivadorEnScope(usuario.id, id, scope);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ ok: false, error: acceso.error });
    }

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/activadores?id=eq.${id}&usuario_id=eq.${usuario.id}`,
      { headers: supabaseHeaders() }
    );
    log(`eliminado id=${id}`);
    rt.activadorEliminado(req, usuario.id, { id });
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
  const scope = leerConexionScope(req);

  try {
    const acceso = await assertActivadorEnScope(usuario.id, id, scope);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ ok: false, error: acceso.error });
    }

    const row = acceso.row;
    const nuevoActivo = !row.activo;
    const r = await supabaseWrite(
      "PATCH",
      `${SUPABASE_URL}/rest/v1/activadores?id=eq.${id}&usuario_id=eq.${usuario.id}`,
      { activo: nuevoActivo }
    );
    const updated = r.data?.[0];
    const flujos = await fetchFlujosMini(usuario.id, scope);
    const flujosById = Object.fromEntries(flujos.map((f) => [f.id, f]));
    const activadorMapped = mapActivadorRow(updated, flujosById);
    rt.activadorActualizado(req, usuario.id, {
      activador: activadorMapped,
      estado: nuevoActivo ? "activo" : "pausado",
    });
    res.json({
      ok: true,
      activador: activadorMapped,
      estado: nuevoActivo ? "activo" : "pausado",
    });
  } catch (e) {
    log("toggle error", e.response?.data || e.message);
    res.status(500).json({ ok: false, error: "No se pudo cambiar el estado" });
  }
});

module.exports = router;
