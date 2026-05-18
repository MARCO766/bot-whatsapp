/**
 * API JSON — CRM Clientes (leads, embudo, timeline).
 * Montar en server.js: app.use("/api/clientes", clientesApiRoutes)
 */
const express = require("express");
const router = express.Router();
const {
  getDashboard,
  listClientes,
  getKanban,
  getCliente,
  getTimeline,
  createCliente,
  updateCliente,
  patchEmbudo,
  addEtiqueta,
  removeEtiqueta,
  registrarCompraManual,
  crearRecordatorio,
  bloquearCliente,
  desbloquearCliente,
  archivarCliente,
  eliminarCliente,
  iniciarFlujo,
  cancelarSeguimientos,
  listFlujos,
  getMetaFilters,
} = require("../services/clientesService");

function protegerApi(req, res, next) {
  if (req.session?.usuario?.id) return next();
  return res.status(401).json({ ok: false, error: "No autenticado" });
}

function uid(req) {
  return req.session.usuario.id;
}

function handleError(res, error, label) {
  const status = error.status || error.response?.status || 500;
  console.log(`[clientesApi] ${label}:`, error.response?.data || error.message);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    ok: false,
    error: error.message || "Error del servidor",
  });
}

// Rutas fijas primero (evitar que :numero capture "dashboard", "meta", etc.)
router.get("/meta", protegerApi, async (req, res) => {
  try {
    res.json(await getMetaFilters(uid(req)));
  } catch (error) {
    handleError(res, error, "meta");
  }
});

router.get("/dashboard", protegerApi, async (req, res) => {
  try {
    res.json(await getDashboard(uid(req)));
  } catch (error) {
    handleError(res, error, "dashboard");
  }
});

router.get("/kanban", protegerApi, async (req, res) => {
  try {
    res.json(await getKanban(uid(req)));
  } catch (error) {
    handleError(res, error, "kanban");
  }
});

router.get("/flujos", protegerApi, async (req, res) => {
  try {
    res.json(await listFlujos(uid(req)));
  } catch (error) {
    handleError(res, error, "flujos");
  }
});

router.get("/", protegerApi, async (req, res) => {
  try {
    res.json(await listClientes(uid(req), req.query));
  } catch (error) {
    handleError(res, error, "list");
  }
});

router.post("/", protegerApi, async (req, res) => {
  try {
    res.status(201).json(await createCliente(uid(req), req.body));
  } catch (error) {
    handleError(res, error, "create");
  }
});

// Sub-rutas de :numero antes del GET genérico
router.get("/:numero/timeline", protegerApi, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 40;
    const offset = parseInt(req.query.offset, 10) || 0;
    res.json(await getTimeline(uid(req), req.params.numero, { limit, offset }));
  } catch (error) {
    handleError(res, error, "timeline");
  }
});

router.patch("/:numero/embudo", protegerApi, async (req, res) => {
  try {
    const { estado_embudo } = req.body || {};
    res.json(await patchEmbudo(uid(req), req.params.numero, estado_embudo));
  } catch (error) {
    handleError(res, error, "embudo");
  }
});

router.post("/:numero/etiqueta", protegerApi, async (req, res) => {
  try {
    const { etiqueta } = req.body || {};
    if (!etiqueta) return res.status(400).json({ ok: false, error: "Falta etiqueta" });
    res.json(await addEtiqueta(uid(req), req.params.numero, etiqueta));
  } catch (error) {
    handleError(res, error, "etiqueta");
  }
});

router.delete("/:numero/etiqueta", protegerApi, async (req, res) => {
  try {
    res.json(await removeEtiqueta(uid(req), req.params.numero));
  } catch (error) {
    handleError(res, error, "quitar-etiqueta");
  }
});

router.post("/:numero/compra", protegerApi, async (req, res) => {
  try {
    res.json(await registrarCompraManual(uid(req), req.params.numero, req.body));
  } catch (error) {
    handleError(res, error, "compra");
  }
});

router.post("/:numero/recordatorio", protegerApi, async (req, res) => {
  try {
    res.json(await crearRecordatorio(uid(req), req.params.numero, req.body));
  } catch (error) {
    handleError(res, error, "recordatorio");
  }
});

router.post("/:numero/bloquear", protegerApi, async (req, res) => {
  try {
    res.json(await bloquearCliente(uid(req), req.params.numero));
  } catch (error) {
    handleError(res, error, "bloquear");
  }
});

router.post("/:numero/desbloquear", protegerApi, async (req, res) => {
  try {
    res.json(await desbloquearCliente(uid(req), req.params.numero));
  } catch (error) {
    handleError(res, error, "desbloquear");
  }
});

router.post("/:numero/archivar", protegerApi, async (req, res) => {
  try {
    const archivado = req.body?.archivado !== false;
    res.json(await archivarCliente(uid(req), req.params.numero, archivado));
  } catch (error) {
    handleError(res, error, "archivar");
  }
});

router.post("/:numero/flujo/cancelar", protegerApi, async (req, res) => {
  try {
    res.json(await cancelarSeguimientos(uid(req), req.params.numero));
  } catch (error) {
    handleError(res, error, "cancelar-flujo");
  }
});

router.post("/:numero/flujo", protegerApi, async (req, res) => {
  try {
    const { flujo_id } = req.body || {};
    if (!flujo_id) return res.status(400).json({ ok: false, error: "Falta flujo_id" });
    res.json(await iniciarFlujo(uid(req), req.params.numero, flujo_id));
  } catch (error) {
    handleError(res, error, "flujo");
  }
});

router.get("/:numero", protegerApi, async (req, res) => {
  try {
    res.json(await getCliente(uid(req), req.params.numero));
  } catch (error) {
    handleError(res, error, "get");
  }
});

router.patch("/:numero", protegerApi, async (req, res) => {
  try {
    res.json(await updateCliente(uid(req), req.params.numero, req.body));
  } catch (error) {
    handleError(res, error, "patch");
  }
});

router.delete("/:numero", protegerApi, async (req, res) => {
  try {
    res.json(await eliminarCliente(uid(req), req.params.numero));
  } catch (error) {
    handleError(res, error, "delete");
  }
});

module.exports = router;
