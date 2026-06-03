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
  normalizeNumero,
} = require("../services/clientesService");
const rt = require("../services/realtimeService");
const { protegerApi } = require("../middlewares/auth");

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
    const result = await createCliente(uid(req), req.body);
    rt.clienteActualizado(req, uid(req), { accion: "creado", cliente: result?.cliente || result });
    res.status(201).json(result);
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
    const result = await patchEmbudo(uid(req), req.params.numero, estado_embudo);
    rt.clienteActualizado(req, uid(req), {
      numero: req.params.numero,
      estado_embudo,
      accion: "embudo",
      cliente: result?.cliente || result,
    });
    res.json(result);
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
  const raw = req.params.numero;
  console.log("[clientesApi] perfil numero recibido:", raw);

  let decoded = raw;
  try {
    decoded = decodeURIComponent(String(raw || ""));
  } catch {
    decoded = String(raw || "");
  }

  const numero = normalizeNumero(decoded);
  if (!numero) {
    console.log("[clientesApi] error perfil: número vacío o inválido");
    return res.status(400).json({
      ok: false,
      error: "Número de cliente inválido",
    });
  }

  try {
    const result = await getCliente(uid(req), numero);
    console.log("[clientesApi] cliente encontrado:", result?.cliente?.numero || numero);
    res.json(result);
  } catch (error) {
    console.log(
      "[clientesApi] error perfil:",
      error.message,
      error.response?.data || ""
    );
    if (error.status === 404) {
      return res.status(404).json({
        ok: false,
        error: error.message || "Cliente no encontrado",
      });
    }
    if (error.status === 400) {
      return res.status(400).json({
        ok: false,
        error: error.message || "Solicitud inválida",
      });
    }
    handleError(res, error, "get");
  }
});

router.patch("/:numero", protegerApi, async (req, res) => {
  try {
    const result = await updateCliente(uid(req), req.params.numero, req.body);
    rt.clienteActualizado(req, uid(req), {
      numero: req.params.numero,
      accion: "actualizado",
      cliente: result?.cliente || result,
    });
    res.json(result);
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
