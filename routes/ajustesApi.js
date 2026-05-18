/**
 * API JSON para pantalla Ajustes (MacBot CRM).
 */
const express = require("express");
const router = express.Router();
const {
  getAjustesCompleto,
  patchPerfil,
  patchAjustesGenerales,
  listConexiones,
  createConexion,
  updateConexion,
  deleteConexion,
  probarConexion,
  probarMetaEvento,
  listEtiquetas,
  createEtiqueta,
  updateEtiqueta,
  deleteEtiqueta,
  cambiarPassword,
} = require("../services/ajustesService");

function protegerApi(req, res, next) {
  if (req.session?.usuario) return next();
  return res.status(401).json({ ok: false, error: "No autenticado" });
}

function handleError(res, error, label) {
  console.log(`[ajustesApi] ${label}:`, error.response?.data || error.message);
  const status = error.status || error.response?.status || 500;
  res.status(status >= 400 && status < 600 ? status : 500).json({
    ok: false,
    error: error.message || "Error del servidor",
  });
}

// GET /api/ajustes
router.get("/api/ajustes", protegerApi, async (req, res) => {
  try {
    const data = await getAjustesCompleto(req.session.usuario.id, req);
    res.json(data);
  } catch (error) {
    handleError(res, error, "GET /api/ajustes");
  }
});

// PATCH /api/ajustes/perfil
router.patch("/api/ajustes/perfil", protegerApi, async (req, res) => {
  try {
    const data = await patchPerfil(req.session.usuario.id, req.body);
    res.json(data);
  } catch (error) {
    handleError(res, error, "PATCH perfil");
  }
});

// PATCH /api/ajustes (automatización, notificaciones, meta)
router.patch("/api/ajustes", protegerApi, async (req, res) => {
  try {
    const data = await patchAjustesGenerales(req.session.usuario.id, req.body);
    res.json(data);
  } catch (error) {
    handleError(res, error, "PATCH ajustes");
  }
});

// POST /api/ajustes/password
router.post("/api/ajustes/password", protegerApi, async (req, res) => {
  try {
    const { actual, nueva } = req.body || {};
    const data = await cambiarPassword(req.session.usuario.id, actual, nueva);
    res.json(data);
  } catch (error) {
    handleError(res, error, "POST password");
  }
});

// POST /api/ajustes/meta/probar
router.post("/api/ajustes/meta/probar", protegerApi, async (req, res) => {
  try {
    const data = await probarMetaEvento(req.session.usuario.id);
    res.json(data);
  } catch (error) {
    handleError(res, error, "POST meta probar");
  }
});

// GET /api/conexiones/whatsapp
router.get("/api/conexiones/whatsapp", protegerApi, async (req, res) => {
  try {
    const data = await listConexiones(req.session.usuario.id);
    res.json(data);
  } catch (error) {
    handleError(res, error, "GET conexiones");
  }
});

// POST /api/conexiones/whatsapp
router.post("/api/conexiones/whatsapp", protegerApi, async (req, res) => {
  try {
    const data = await createConexion(req.session.usuario.id, req.body);
    res.json(data);
  } catch (error) {
    handleError(res, error, "POST conexion");
  }
});

// PATCH /api/conexiones/whatsapp/:id
router.patch("/api/conexiones/whatsapp/:id", protegerApi, async (req, res) => {
  try {
    const data = await updateConexion(req.session.usuario.id, req.params.id, req.body);
    res.json(data);
  } catch (error) {
    handleError(res, error, "PATCH conexion");
  }
});

// DELETE /api/conexiones/whatsapp/:id
router.delete("/api/conexiones/whatsapp/:id", protegerApi, async (req, res) => {
  try {
    const data = await deleteConexion(req.session.usuario.id, req.params.id);
    res.json(data);
  } catch (error) {
    handleError(res, error, "DELETE conexion");
  }
});

// POST /api/conexiones/whatsapp/:id/probar
router.post("/api/conexiones/whatsapp/:id/probar", protegerApi, async (req, res) => {
  try {
    const { numero } = req.body || {};
    const data = await probarConexion(req.session.usuario.id, req.params.id, numero);
    res.json(data);
  } catch (error) {
    handleError(res, error, "POST probar conexion");
  }
});

// GET /api/etiquetas
router.get("/api/etiquetas", protegerApi, async (req, res) => {
  try {
    const data = await listEtiquetas(req.session.usuario.id);
    res.json(data);
  } catch (error) {
    handleError(res, error, "GET etiquetas");
  }
});

// POST /api/etiquetas
router.post("/api/etiquetas", protegerApi, async (req, res) => {
  try {
    const data = await createEtiqueta(req.session.usuario.id, req.body);
    res.json(data);
  } catch (error) {
    handleError(res, error, "POST etiqueta");
  }
});

// PATCH /api/etiquetas/:id
router.patch("/api/etiquetas/:id", protegerApi, async (req, res) => {
  try {
    const data = await updateEtiqueta(req.session.usuario.id, req.params.id, req.body);
    res.json(data);
  } catch (error) {
    handleError(res, error, "PATCH etiqueta");
  }
});

// DELETE /api/etiquetas/:id
router.delete("/api/etiquetas/:id", protegerApi, async (req, res) => {
  try {
    const data = await deleteEtiqueta(req.session.usuario.id, req.params.id);
    res.json(data);
  } catch (error) {
    handleError(res, error, "DELETE etiqueta");
  }
});

module.exports = router;
