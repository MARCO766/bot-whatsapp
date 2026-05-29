/**
 * API JSON para pantalla Métricas (React CRM).
 * Datos 100% desde Supabase — sin mocks.
 */
const express = require("express");
const router = express.Router();
const {
  computeResumen,
  computeFunnel,
  computeSeries,
  computeFlujos,
  computeDiagnostico,
  computeHeatmap,
  fetchFlujosList,
} = require("../services/metricasService");

function protegerApi(req, res, next) {
  if (req.session?.usuario) return next();
  return res.status(401).json({ ok: false, error: "No autenticado" });
}

function queryOpts(req) {
  return {
    periodo: req.query.periodo,
    desde: req.query.desde,
    hasta: req.query.hasta,
    flujo_id: req.query.flujo_id || req.query.flujoId || null,
    conexion_whatsapp_id: req.query.conexion_whatsapp_id || null,
  };
}

// GET /api/metricas/resumen
router.get("/api/metricas/resumen", protegerApi, async (req, res) => {
  try {
    const data = await computeResumen(req.session.usuario.id, queryOpts(req));
    res.json(data);
  } catch (error) {
    console.log("[metricasApi] resumen:", error.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar el resumen de métricas" });
  }
});

// GET /api/metricas/funnel
router.get("/api/metricas/funnel", protegerApi, async (req, res) => {
  try {
    const data = await computeFunnel(req.session.usuario.id, queryOpts(req));
    res.json(data);
  } catch (error) {
    console.log("[metricasApi] funnel:", error.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar el embudo" });
  }
});

// GET /api/metricas/series
router.get("/api/metricas/series", protegerApi, async (req, res) => {
  try {
    const data = await computeSeries(req.session.usuario.id, queryOpts(req));
    res.json(data);
  } catch (error) {
    console.log("[metricasApi] series:", error.message);
    res.status(500).json({ ok: false, error: "No se pudieron cargar las series" });
  }
});

// GET /api/metricas/flujos
router.get("/api/metricas/flujos", protegerApi, async (req, res) => {
  try {
    const data = await computeFlujos(req.session.usuario.id, queryOpts(req));
    res.json(data);
  } catch (error) {
    console.log("[metricasApi] flujos:", error.message);
    res.status(500).json({ ok: false, error: "No se pudieron cargar métricas por flujo" });
  }
});

// GET /api/metricas/diagnostico
router.get("/api/metricas/diagnostico", protegerApi, async (req, res) => {
  try {
    const data = await computeDiagnostico(req.session.usuario.id, queryOpts(req));
    res.json(data);
  } catch (error) {
    console.log("[metricasApi] diagnostico:", error.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar el diagnóstico" });
  }
});

// GET /api/metricas/heatmap
router.get("/api/metricas/heatmap", protegerApi, async (req, res) => {
  try {
    const data = await computeHeatmap(req.session.usuario.id, queryOpts(req));
    res.json(data);
  } catch (error) {
    console.log("[metricasApi] heatmap:", error.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar el heatmap" });
  }
});

// GET /api/metricas/flujos-lista (selector)
router.get("/api/metricas/flujos-lista", protegerApi, async (req, res) => {
  try {
    const flujos = await fetchFlujosList(req.session.usuario.id);
    res.json({
      ok: true,
      flujos: flujos.map((f) => ({ id: f.id, nombre: f.nombre })),
    });
  } catch (error) {
    console.log("[metricasApi] flujos-lista:", error.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar la lista de flujos" });
  }
});

module.exports = router;
