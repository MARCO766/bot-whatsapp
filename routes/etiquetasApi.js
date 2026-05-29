/**
 * API JSON — Etiquetas (organización de leads/chats) por línea WhatsApp.
 */
const express = require("express");
const router = express.Router();
const {
  listEtiquetas,
  createEtiqueta,
  updateEtiqueta,
  deleteEtiqueta,
  parseScope,
} = require("../services/etiquetasService");
const rt = require("../services/realtimeService");

function protegerApi(req, res, next) {
  if (req.session?.usuario?.id) return next();
  return res.status(401).json({ ok: false, error: "No autenticado" });
}

function uid(req) {
  return req.session.usuario.id;
}

function leerConexionScope(req) {
  const raw =
    req.body?.conexion_whatsapp_id ??
    req.body?.conexionWhatsappId ??
    req.query?.conexion_whatsapp_id;
  return parseScope(raw);
}

function handleError(res, error, label) {
  const status = error.status || error.response?.status || 500;
  console.log(`[etiquetasApi] ${label}:`, error.response?.data || error.message);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    ok: false,
    error: error.message || "Error del servidor",
  });
}

// GET /api/etiquetas?conexion_whatsapp_id=<uuid>|__todas__
router.get("/api/etiquetas", protegerApi, async (req, res) => {
  try {
    const scope = leerConexionScope(req);
    res.json(await listEtiquetas(uid(req), scope));
  } catch (error) {
    handleError(res, error, "GET");
  }
});

router.post("/api/etiquetas", protegerApi, async (req, res) => {
  try {
    const scope = leerConexionScope(req);
    const result = await createEtiqueta(uid(req), req.body, scope);
    rt.etiquetaActualizada(req, uid(req), { accion: "creada", etiqueta: result?.etiqueta || result });
    res.json(result);
  } catch (error) {
    handleError(res, error, "POST");
  }
});

router.patch("/api/etiquetas/:id", protegerApi, async (req, res) => {
  try {
    const scope = leerConexionScope(req);
    const result = await updateEtiqueta(uid(req), req.params.id, req.body, scope);
    rt.etiquetaActualizada(req, uid(req), {
      accion: "actualizada",
      id: req.params.id,
      etiqueta: result?.etiqueta || result,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error, "PATCH");
  }
});

router.delete("/api/etiquetas/:id", protegerApi, async (req, res) => {
  try {
    const scope = leerConexionScope(req);
    const result = await deleteEtiqueta(uid(req), req.params.id, scope);
    rt.etiquetaActualizada(req, uid(req), { accion: "eliminada", id: req.params.id });
    res.json(result);
  } catch (error) {
    handleError(res, error, "DELETE");
  }
});

module.exports = router;
