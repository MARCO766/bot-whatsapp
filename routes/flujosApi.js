/**
 * API JSON para pantalla Flujos (React CRM).
 * Métricas 100% desde Supabase — sin mocks.
 */
const express = require("express");
const router = express.Router();
const axios = require("axios");
const {
  resolveEstado,
  loadFlujosDashboardData,
  metricasVacias,
  computeHeaderStats,
} = require("../services/flujosMetricsService");
const { registrarConversion } = require("../services/conversionService");

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

function log(msg, extra) {
  if (extra !== undefined) console.log(`[flujosApi] ${msg}`, extra);
  else console.log(`[flujosApi] ${msg}`);
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

function extractMeta(data) {
  const raw = data && typeof data === "object" ? data : {};
  const meta = raw.macbot_meta && typeof raw.macbot_meta === "object" ? raw.macbot_meta : {};
  return {
    estado: resolveEstado(data),
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
          : (n.className || "").includes("conversion-node")
            ? "conversion"
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
  const parts = [flow.nombre, extractMeta(flow.data).carpeta, extractMeta(flow.data).estado];
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
    log("activadores error", e.message);
    return [];
  }
}

// GET /api/flujos/status
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
  const usuario = req.session.usuario;
  log(`GET /api/flujos usuario=${usuario.id} (${usuario.email || usuario.nombre || "—"})`);

  try {
    const [flujos, activadores] = await Promise.all([
      fetchFlujos(usuario.id),
      fetchActivadores(usuario.id),
    ]);

    const { perFlow } = await loadFlujosDashboardData(usuario.id, flujos, activadores);
    log(`flujos encontrados=${flujos.length} activadores=${activadores.length}`);

    const flows = flujos.map((f) => {
      const metaRaw = extractMeta(f.data);
      const acts = activadores.filter((a) => a.flujo_id === f.id);
      const metricas = { ...metricasVacias(), ...(perFlow[f.id] || {}) };

      if (metaRaw.ultima_ejecucion && !metricas.ultimaEjecucion) {
        metricas.ultimaEjecucion = metaRaw.ultima_ejecucion;
      }

      return {
        id: f.id,
        nombre: f.nombre,
        creado_en: f.creado_en,
        meta: {
          ...metaRaw,
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
    log("GET /api/flujos ERROR", error.response?.data || error.message);
    res.status(500).json({
      ok: false,
      error: "No se pudieron cargar los flujos",
      flows: [],
    });
  }
});

// GET /api/flujos/header-stats — KPIs superiores (header Flujos)
router.get("/api/flujos/header-stats", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  log(`GET /api/flujos/header-stats usuario=${usuario.id}`);

  try {
    const flujos = await fetchFlujos(usuario.id);
    const data = await computeHeaderStats(usuario.id, flujos);
    res.json({ ok: true, ...data });
  } catch (error) {
    log("GET header-stats ERROR", error.response?.data || error.message);
    res.status(500).json({
      ok: false,
      error: "No se pudieron cargar estadísticas del header",
      leadsVivos: 0,
      conversaciones: 0,
      ventasCantidad: 0,
      ventasMonto: 0,
      flujosActivos: 0,
      tendenciaLeads: null,
      tendenciaConversaciones: null,
      tendenciaVentas: null,
    });
  }
});

// GET /api/flujos/stats
router.get("/api/flujos/stats", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  log(`GET /api/flujos/stats usuario=${usuario.id}`);

  try {
    const [flujos, activadores] = await Promise.all([
      fetchFlujos(usuario.id),
      fetchActivadores(usuario.id),
    ]);

    await loadFlujosDashboardData(usuario.id, flujos, activadores);
    const stats = await computeHeaderStats(usuario.id, flujos);
    res.json({ ok: true, stats });
  } catch (error) {
    log("GET stats ERROR", error.response?.data || error.message);
    res.status(500).json({
      ok: false,
      error: "No se pudieron calcular estadísticas",
      stats: null,
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

    const data =
      flujo.data && typeof flujo.data === "object"
        ? { ...flujo.data }
        : { nodos: [], conexiones: [] };
    const prev = extractMeta(data);
    const nextMeta = {
      estado: prev.estado,
      carpeta: prev.carpeta,
      etiquetas: prev.etiquetas,
      campanas: prev.campanas,
      ultima_ejecucion: prev.ultima_ejecucion,
      actualizado_en: new Date().toISOString(),
    };

    if (patch.estado && ESTADOS.includes(patch.estado)) nextMeta.estado = patch.estado;
    if (patch.carpeta && FOLDERS.includes(patch.carpeta)) nextMeta.carpeta = patch.carpeta;
    if (Array.isArray(patch.etiquetas)) nextMeta.etiquetas = patch.etiquetas;
    if (Array.isArray(patch.campanas)) nextMeta.campanas = patch.campanas;

    data.macbot_meta = nextMeta;

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${id}&usuario_id=eq.${usuarioId}`,
      { data },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
      }
    );

    log(`meta actualizada flujo=${id} estado=${nextMeta.estado}`);
    res.json({ ok: true, meta: nextMeta });
  } catch (error) {
    log("PATCH meta ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo actualizar el flujo" });
  }
});

// PATCH /api/flujos/:id/nombre
router.patch("/api/flujos/:id/nombre", protegerApi, async (req, res) => {
  try {
    const { id } = req.params;
    const nombre = (req.body?.nombre || "").trim();
    const usuarioId = req.session.usuario.id;

    if (!nombre) return res.status(400).json({ ok: false, error: "Nombre vacío" });

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${id}&usuario_id=eq.${usuarioId}`,
      { nombre },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
      }
    );

    res.json({ ok: true, nombre });
  } catch (error) {
    log("PATCH nombre ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo renombrar" });
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
    log("POST flujo ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo crear el flujo" });
  }
});

// POST /api/flujos/import
router.post("/api/flujos/import", protegerApi, async (req, res) => {
  try {
    const templateId = req.body?.templateId;
    const templates = {
      venta_automatica: { nombre: "Venta automática", carpeta: "ventas_automaticas", etiquetas: ["ventas"] },
      lanzamiento_domingo: { nombre: "Lanzamiento domingo", carpeta: "lanzamientos", etiquetas: ["lanzamiento"] },
      recuperacion_carrito: { nombre: "Recuperación carrito", carpeta: "recuperacion", etiquetas: ["recuperacion"] },
      seguimiento_whatsapp: { nombre: "Seguimiento WhatsApp", carpeta: "evergreen", etiquetas: ["seguimiento"] },
      retargeting: { nombre: "Retargeting", carpeta: "retargeting", etiquetas: ["retargeting"] },
      atencion_cliente: { nombre: "Atención al cliente", carpeta: "atencion", etiquetas: ["soporte"] },
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
    log("import ERROR", error.message);
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
    const usuarioId = req.session.usuario.id;

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${id}&usuario_id=eq.${usuarioId}`,
      { headers: supabaseHeaders() }
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error eliminando" });
  }
});

// POST /api/flujos/conversiones — registro manual o webhook (Hotmart, Stripe, etc.)
router.post("/api/flujos/conversiones", protegerApi, async (req, res) => {
  try {
    const usuarioId = req.session.usuario.id;
    const body = req.body || {};
    const clienteNumero = (body.cliente_numero || body.clienteNumero || "").trim();

    if (!clienteNumero) {
      return res.status(400).json({ ok: false, error: "cliente_numero requerido" });
    }

    let flujoId = body.flujo_id || body.flujoId || null;
    if (flujoId) {
      const owned = await axios.get(
        `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${flujoId}&usuario_id=eq.${usuarioId}&select=id`,
        { headers: supabaseHeaders() }
      );
      if (!owned.data?.[0]) flujoId = null;
    }

    const row = await registrarConversion({
      usuarioId,
      flujoId,
      nodoId: body.nodo_id || body.nodoId || null,
      clienteNumero,
      valor: body.valor,
      moneda: body.moneda,
      origen: body.origen || "manual",
      metadata: body.metadata || {},
    });

    if (!row) {
      return res.status(500).json({
        ok: false,
        error: "No se pudo registrar (¿tabla crm_conversiones creada en Supabase?)",
      });
    }

    res.json({ ok: true, conversion: row });
  } catch (error) {
    log("POST conversiones ERROR", error.message);
    res.status(500).json({ ok: false, error: "Error registrando conversión" });
  }
});

// GET /api/flujos/:id/timeline
router.get("/api/flujos/:id/timeline", protegerApi, async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.session.usuario.id;

    const owned = await axios.get(
      `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${id}&usuario_id=eq.${usuarioId}&select=id`,
      { headers: supabaseHeaders() }
    );
    if (!owned.data?.[0]) {
      return res.status(404).json({ ok: false, error: "Flujo no encontrado", events: [] });
    }

    const [resSeg, resConv] = await Promise.all([
      axios.get(
        `${SUPABASE_URL}/rest/v1/seguimientos_programados?flujo_id=eq.${id}&usuario_id=eq.${usuarioId}&order=creado_en.desc&limit=15&select=estado,nodo_id,cliente_numero,creado_en,actualizado_en,enviado_en,mensaje_tipo`,
        { headers: supabaseHeaders() }
      ),
      axios
        .get(
          `${SUPABASE_URL}/rest/v1/crm_conversiones?flujo_id=eq.${id}&usuario_id=eq.${usuarioId}&order=creado_en.desc&limit=10&select=valor,moneda,origen,cliente_numero,nodo_id,creado_en`,
          { headers: supabaseHeaders() }
        )
        .catch(() => ({ data: [] })),
    ]);

    const eventsSeg = (resSeg.data || []).map((row) => {
      let tipo = "nodo_ejecutado";
      let titulo = `Seguimiento: ${row.estado}`;

      if (row.estado === "enviado") {
        tipo = "seguimiento_enviado";
        titulo = "Seguimiento enviado";
      } else if (row.estado === "pendiente") {
        tipo = "seguimiento_programado";
        titulo = "Seguimiento programado";
      } else if (row.estado === "respondido") {
        tipo = "lead_respondio";
        titulo = "Lead respondió";
      } else if (row.estado === "cancelado") {
        tipo = "nodo_ejecutado";
        titulo = "Seguimiento cancelado";
      }

      return {
        tipo,
        titulo,
        detalle: row.cliente_numero
          ? `Cliente ${row.cliente_numero}${row.nodo_id ? ` · nodo ${row.nodo_id}` : ""}`
          : row.nodo_id || "",
        fecha: row.enviado_en || row.actualizado_en || row.creado_en,
      };
    });

    const eventsConv = (resConv.data || []).map((row) => {
      const valor = parseFloat(row.valor);
      const monto =
        Number.isFinite(valor) && valor > 0
          ? `${valor} ${row.moneda || "USD"}`
          : row.moneda || "";
      return {
        tipo: "conversion_registrada",
        titulo: "💰 Conversión registrada",
        detalle: [
          row.cliente_numero ? `Cliente ${row.cliente_numero}` : null,
          monto ? monto : null,
          row.origen && row.origen !== "flujo" ? `Origen: ${row.origen}` : null,
          row.nodo_id ? `Nodo ${row.nodo_id}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        fecha: row.creado_en,
      };
    });

    const events = [...eventsSeg, ...eventsConv]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 20);

    res.json({ ok: true, events });
  } catch (error) {
    log("timeline ERROR", error.message);
    res.json({ ok: true, events: [] });
  }
});

module.exports = router;
