/**
 * API JSON para pantalla Flujos (React CRM).
 * No modifica builder ni worker. Meta vive en data.macbot_meta sin migración.
 */
const express = require("express");
const router = express.Router();
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const FOLDERS = [
  "ventas_automaticas",
  "lanzamientos",
  "recuperacion",
  "atencion",
  "retargeting",
  "evergreen",
  "sin_carpeta",
];

const ESTADOS = ["activo", "pausado", "borrador", "error"];

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

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function extractMeta(data) {
  const raw = data && typeof data === "object" ? data : {};
  const meta = raw.macbot_meta && typeof raw.macbot_meta === "object" ? raw.macbot_meta : {};
  return {
    estado: ESTADOS.includes(meta.estado) ? meta.estado : "borrador",
    carpeta: FOLDERS.includes(meta.carpeta) ? meta.carpeta : "sin_carpeta",
    etiquetas: Array.isArray(meta.etiquetas) ? meta.etiquetas : [],
    campanas: Array.isArray(meta.campanas) ? meta.campanas : [],
    actualizado_en: meta.actualizado_en || null,
    ultima_ejecucion: meta.ultima_ejecucion || null,
  };
}

function buildPreview(data) {
  const raw = data && typeof data === "object" ? data : {};
  const nodos = Array.isArray(raw.nodos) ? raw.nodos : [];
  const conexiones = Array.isArray(raw.conexiones) ? raw.conexiones : [];

  const previewNodes = nodos.slice(0, 24).map((n, i) => {
    const tipo =
      (n.className || "").includes("node-start") || n.id === "nodo_inicio"
        ? "inicio"
        : (n.className || "").includes("follow-node")
          ? "seguimiento"
          : (n.className || "").includes("wait")
            ? "espera"
            : (n.dataset && n.dataset.tipo) || "contenido";

    const left = parseInt(String(n.left || "0").replace("px", ""), 10) || i * 40;
    const top = parseInt(String(n.top || "0").replace("px", ""), 10) || i * 28;

    return {
      id: n.id || `n${i}`,
      tipo,
      x: Math.max(0, Math.min(left, 400)),
      y: Math.max(0, Math.min(top, 280)),
    };
  });

  return {
    nodos: previewNodes,
    conexiones: conexiones
      .slice(0, 40)
      .map((c) => ({ desde: c.desde, hasta: c.hasta }))
      .filter((c) => c.desde && c.hasta),
  };
}

function searchableText(flow, activadores) {
  const parts = [
    flow.nombre,
    extractMeta(flow.data).carpeta,
    extractMeta(flow.data).estado,
    ...(extractMeta(flow.data).etiquetas || []),
  ];
  const nodos = flow.data?.nodos || [];
  nodos.forEach((n) => {
    if (n.html) parts.push(String(n.html).replace(/<[^>]+>/g, " "));
  });
  activadores
    .filter((a) => a.flujo_id === flow.id)
    .forEach((a) => {
      parts.push(a.nombre, a.frase, a.conexion);
    });
  return parts.join(" ").toLowerCase();
}

async function fetchFlujos(usuarioId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder?select=id,nombre,creado_en,data,usuario_id&usuario_id=eq.${usuarioId}&order=creado_en.desc`,
    { headers: supabaseHeaders() }
  );
  return res.data || [];
}

async function fetchActivadores(usuarioId) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/activadores?select=id,nombre,flujo_id,conexion,frase,activo,repetible,creado_en&usuario_id=eq.${usuarioId}`,
      { headers: supabaseHeaders() }
    );
    return res.data || [];
  } catch (e) {
    console.log("[flujosApi] activadores no disponibles:", e.message);
    return [];
  }
}

async function fetchSeguimientosActivos(usuarioId) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/seguimientos_programados?select=flujo_id,estado&usuario_id=eq.${usuarioId}&estado=eq.pendiente`,
      { headers: supabaseHeaders() }
    );
    const map = {};
    (res.data || []).forEach((row) => {
      if (row.flujo_id) map[row.flujo_id] = (map[row.flujo_id] || 0) + 1;
    });
    return map;
  } catch (e) {
    console.log("[flujosApi] seguimientos no disponibles:", e.message);
    return {};
  }
}

async function fetchMetricasPorFlujo(usuarioId, flowIds) {
  const metricas = {};
  flowIds.forEach((id) => {
    metricas[id] = {
      leadsHoy: 0,
      mensajesEnviados: 0,
      respuestas: 0,
      conversiones: 0,
      seguimientosActivos: 0,
      ultimaEjecucion: null,
    };
  });

  if (!flowIds.length) return metricas;

  try {
    const segMap = await fetchSeguimientosActivos(usuarioId);
    flowIds.forEach((id) => {
      metricas[id].seguimientosActivos = segMap[id] || 0;
    });
  } catch (_) {
    /* fallback ya en 0 */
  }

  return metricas;
}

function inferEstado(flow, meta, activadoresDelFlujo) {
  if (meta.estado && meta.estado !== "borrador") return meta.estado;
  const nodos = flow.data?.nodos || [];
  if (!nodos.length) return "borrador";
  const tieneActivo = activadoresDelFlujo.some((a) => a.activo);
  if (tieneActivo) return "activo";
  return meta.estado || "borrador";
}

// GET /api/flujos/status — diagnóstico (sin auth)
router.get("/api/flujos/status", (req, res) => {
  res.json({
    ok: true,
    authenticated: Boolean(req.session?.usuario),
    usuario_id: req.session?.usuario?.id || null,
    supabase: Boolean(SUPABASE_URL && SUPABASE_KEY),
    timestamp: new Date().toISOString(),
  });
});

// GET /api/flujos
router.get("/api/flujos", protegerApi, async (req, res) => {
  try {
    const usuarioId = req.session.usuario.id;
    const [flujos, activadores, segMap] = await Promise.all([
      fetchFlujos(usuarioId),
      fetchActivadores(usuarioId),
      fetchSeguimientosActivos(usuarioId),
    ]);

    const ids = flujos.map((f) => f.id);
    const metricasBase = await fetchMetricasPorFlujo(usuarioId, ids);

    const flows = flujos.map((f) => {
      const metaRaw = extractMeta(f.data);
      const acts = activadores.filter((a) => a.flujo_id === f.id);
      const estado = inferEstado(f, metaRaw, acts);
      const metricas = {
        ...metricasBase[f.id],
        seguimientosActivos: segMap[f.id] || metricasBase[f.id]?.seguimientosActivos || 0,
        ultimaEjecucion: metaRaw.ultima_ejecucion,
      };

      return {
        id: f.id,
        nombre: f.nombre,
        creado_en: f.creado_en,
        meta: {
          ...metaRaw,
          estado,
          actualizado_en: metaRaw.actualizado_en || f.creado_en,
        },
        metricas,
        preview: buildPreview(f.data),
        activadores: acts.map((a) => ({
          id: a.id,
          nombre: a.nombre,
          frase: a.frase,
          conexion: a.conexion,
          activo: !!a.activo,
        })),
        nodosCount: (f.data?.nodos || []).length,
        conexionesCount: (f.data?.conexiones || []).length,
        searchText: searchableText(f, activadores),
      };
    });

    res.json({
      ok: true,
      flows,
      folders: FOLDERS,
      estados: ESTADOS,
      source: "supabase",
    });
  } catch (error) {
    console.log("[flujosApi] GET /api/flujos:", error.response?.data || error.message);
    res.status(500).json({
      ok: false,
      error: "No se pudieron cargar los flujos",
      flows: [],
      source: "fallback",
    });
  }
});

// GET /api/flujos/stats
router.get("/api/flujos/stats", protegerApi, async (req, res) => {
  try {
    const usuarioId = req.session.usuario.id;
    const [flujos, activadores, segMap] = await Promise.all([
      fetchFlujos(usuarioId),
      fetchActivadores(usuarioId),
      fetchSeguimientosActivos(usuarioId),
    ]);

    const porEstado = { activo: 0, pausado: 0, borrador: 0, error: 0 };
    flujos.forEach((f) => {
      const meta = extractMeta(f.data);
      const acts = activadores.filter((a) => a.flujo_id === f.id);
      const est = inferEstado(f, meta, acts);
      porEstado[est] = (porEstado[est] || 0) + 1;
    });

    const seguimientosActivos = Object.values(segMap).reduce((a, b) => a + b, 0);

    let mensajesEnviados = 0;
    let respuestas = 0;
    let leadsHoy = 0;

    try {
      const hoy = startOfTodayIso();
      const msgRes = await axios.get(
        `${SUPABASE_URL}/rest/v1/mensajes?select=direccion,cliente_numero&usuario_id=eq.${usuarioId}&creado_en=gte.${hoy}`,
        { headers: supabaseHeaders() }
      );
      const msgs = msgRes.data || [];
      mensajesEnviados = msgs.filter((m) => m.direccion === "saliente").length;
      respuestas = msgs.filter((m) => m.direccion === "entrante").length;
      leadsHoy = new Set(
        msgs.filter((m) => m.direccion === "entrante" && m.cliente_numero).map((m) => m.cliente_numero)
      ).size;
    } catch (e) {
      console.log("[flujosApi] métricas mensajes:", e.message);
    }

    const conversionEstimada =
      mensajesEnviados > 0
        ? Math.round((respuestas / Math.max(mensajesEnviados, 1)) * 1000) / 10
        : 0;

    res.json({
      ok: true,
      stats: {
        total: flujos.length,
        activos: porEstado.activo,
        pausados: porEstado.pausado,
        borradores: porEstado.borrador,
        errores: porEstado.error,
        leadsHoy,
        mensajesEnviados,
        respuestas,
        seguimientosActivos,
        conversionEstimada,
      },
    });
  } catch (error) {
    console.log("[flujosApi] GET stats:", error.message);
    res.json({
      ok: true,
      stats: {
        total: 0,
        activos: 0,
        pausados: 0,
        borradores: 0,
        errores: 0,
        leadsHoy: 0,
        mensajesEnviados: 0,
        respuestas: 0,
        seguimientosActivos: 0,
        conversionEstimada: 0,
      },
      fallback: true,
    });
  }
});

// PATCH /api/flujos/:id/meta
router.patch("/api/flujos/:id/meta", protegerApi, async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.session.usuario.id;
    const patch = req.body || {};

    const flujoRes = await axios.get(
      `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${id}&usuario_id=eq.${usuarioId}&select=id,data`,
      { headers: supabaseHeaders() }
    );

    const flujo = flujoRes.data?.[0];
    if (!flujo) return res.status(404).json({ ok: false, error: "Flujo no encontrado" });

    const data = flujo.data && typeof flujo.data === "object" ? { ...flujo.data } : { nodos: [], conexiones: [] };
    const prev = extractMeta(data);
    const nextMeta = { ...prev };

    if (patch.estado && ESTADOS.includes(patch.estado)) nextMeta.estado = patch.estado;
    if (patch.carpeta && FOLDERS.includes(patch.carpeta)) nextMeta.carpeta = patch.carpeta;
    if (Array.isArray(patch.etiquetas)) nextMeta.etiquetas = patch.etiquetas;
    if (Array.isArray(patch.campanas)) nextMeta.campanas = patch.campanas;
    nextMeta.actualizado_en = new Date().toISOString();

    data.macbot_meta = nextMeta;

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${id}`,
      { data },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
      }
    );

    res.json({ ok: true, meta: nextMeta });
  } catch (error) {
    console.log("[flujosApi] PATCH meta:", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo actualizar el flujo" });
  }
});

// POST /api/flujos
router.post("/api/flujos", protegerApi, async (req, res) => {
  try {
    const nombre = (req.body?.nombre || "").trim() || "Nuevo flujo";
    const meta = req.body?.meta || {};
    const usuarioId = req.session.usuario.id;

    const data = {
      nodos: [],
      conexiones: [],
      macbot_meta: {
        estado: "borrador",
        carpeta: FOLDERS.includes(meta.carpeta) ? meta.carpeta : "sin_carpeta",
        etiquetas: [],
        campanas: [],
        actualizado_en: new Date().toISOString(),
      },
    };

    const created = await axios.post(
      `${SUPABASE_URL}/rest/v1/flujos_builder`,
      { nombre, usuario_id: usuarioId, data },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=representation",
        }),
      }
    );

    const row = Array.isArray(created.data) ? created.data[0] : created.data;
    res.json({ ok: true, flow: row });
  } catch (error) {
    console.log("[flujosApi] POST flujo:", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo crear el flujo" });
  }
});

// POST /api/flujos/import
router.post("/api/flujos/import", protegerApi, async (req, res) => {
  try {
    const templateId = req.body?.templateId;
    const templates = {
      venta_automatica: {
        nombre: "Venta automática",
        carpeta: "ventas_automaticas",
        etiquetas: ["ventas"],
      },
      lanzamiento_domingo: {
        nombre: "Lanzamiento domingo",
        carpeta: "lanzamientos",
        etiquetas: ["lanzamiento"],
      },
      recuperacion_carrito: {
        nombre: "Recuperación carrito",
        carpeta: "recuperacion",
        etiquetas: ["recuperacion"],
      },
      seguimiento_whatsapp: {
        nombre: "Seguimiento WhatsApp",
        carpeta: "evergreen",
        etiquetas: ["seguimiento"],
      },
      retargeting: {
        nombre: "Retargeting",
        carpeta: "retargeting",
        etiquetas: ["retargeting"],
      },
      atencion_cliente: {
        nombre: "Atención al cliente",
        carpeta: "atencion",
        etiquetas: ["soporte"],
      },
    };

    const tpl = templates[templateId];
    if (!tpl) return res.status(400).json({ ok: false, error: "Plantilla no válida" });

    const usuarioId = req.session.usuario.id;
    const data = {
      nodos: [],
      conexiones: [],
      macbot_meta: {
        estado: "borrador",
        carpeta: tpl.carpeta,
        etiquetas: tpl.etiquetas,
        campanas: [],
        plantilla: templateId,
        actualizado_en: new Date().toISOString(),
      },
    };

    const created = await axios.post(
      `${SUPABASE_URL}/rest/v1/flujos_builder`,
      { nombre: tpl.nombre, usuario_id: usuarioId, data },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=representation",
        }),
      }
    );

    const row = Array.isArray(created.data) ? created.data[0] : created.data;
    res.json({ ok: true, flow: row });
  } catch (error) {
    console.log("[flujosApi] import:", error.message);
    res.status(500).json({ ok: false, error: "No se pudo importar" });
  }
});

// POST /api/flujos/:id/duplicate
router.post("/api/flujos/:id/duplicate", protegerApi, async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.session.usuario.id;

    const flujo = await axios.get(
      `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${id}&usuario_id=eq.${usuarioId}&select=*`,
      { headers: supabaseHeaders() }
    );

    const original = flujo.data?.[0];
    if (!original) return res.status(404).json({ ok: false, error: "No encontrado" });

    const created = await axios.post(
      `${SUPABASE_URL}/rest/v1/flujos_builder`,
      {
        nombre: `${original.nombre} - copia`,
        usuario_id: usuarioId,
        data: original.data,
      },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=representation",
        }),
      }
    );

    const row = Array.isArray(created.data) ? created.data[0] : created.data;
    res.json({ ok: true, flow: row });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error duplicando" });
  }
});

// DELETE /api/flujos/:id
router.delete("/api/flujos/:id", protegerApi, async (req, res) => {
  try {
    const { id } = req.params;
    await axios.delete(`${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${id}`, {
      headers: supabaseHeaders(),
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error eliminando" });
  }
});

// GET /api/flujos/:id/timeline
router.get("/api/flujos/:id/timeline", protegerApi, async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.session.usuario.id;

    const resSeg = await axios.get(
      `${SUPABASE_URL}/rest/v1/seguimientos_programados?flujo_id=eq.${id}&usuario_id=eq.${usuarioId}&order=creado_en.desc&limit=15&select=estado,nodo_id,cliente_numero,creado_en,actualizado_en,mensaje_tipo`,
      { headers: supabaseHeaders() }
    );

    const events = (resSeg.data || []).map((row) => ({
      tipo:
        row.estado === "enviado"
          ? "seguimiento_enviado"
          : row.estado === "pendiente"
            ? "seguimiento_programado"
            : "nodo_ejecutado",
      titulo:
        row.estado === "enviado"
          ? "Seguimiento enviado"
          : row.estado === "pendiente"
            ? "Seguimiento programado"
            : `Seguimiento: ${row.estado}`,
      detalle: row.cliente_numero ? `Cliente ${row.cliente_numero}` : row.nodo_id || "",
      fecha: row.actualizado_en || row.creado_en,
    }));

    res.json({ ok: true, events });
  } catch (error) {
    console.log("[flujosApi] timeline:", error.message);
    res.json({ ok: true, events: [], fallback: true });
  }
});

module.exports = router;
