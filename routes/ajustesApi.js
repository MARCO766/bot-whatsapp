/**
 * API JSON para pantalla Ajustes (MacBot CRM).
 */
const express = require("express");
const router = express.Router();
const {
  getAjustesCompleto,
  buildAjustesVacio,
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

function log(msg, extra) {
  if (extra !== undefined) console.log(`[ajustesApi] ${msg}`, extra);
  else console.log(`[ajustesApi] ${msg}`);
}

function protegerApi(req, res, next) {
  if (req.session?.usuario?.id) return next();
  log("401 — sin sesión", { path: req.path });
  return res.status(401).json({ ok: false, error: "No autenticado" });
}

function getUsuarioId(req) {
  return req.session?.usuario?.id || null;
}

function handleError(res, error, label) {
  const status = error.status || error.response?.status || 500;
  const detail = error.response?.data || error.message;
  log(`${label} error (${status}):`, detail);

  if (status === 400 && label.startsWith("GET /api/ajustes")) {
    return null;
  }

  res.status(status >= 400 && status < 600 ? status : 500).json({
    ok: false,
    error: error.message || "Error del servidor",
  });
}

// GET /api/ajustes — siempre 200 con estructura válida
router.get("/api/ajustes", protegerApi, async (req, res) => {
  const usuarioId = getUsuarioId(req);
  const sessionUsuario = req.session.usuario;

  log("GET /api/ajustes", { usuarioId, email: sessionUsuario?.email });

  try {
    const data = await getAjustesCompleto(usuarioId, req, sessionUsuario);
    return res.status(200).json(data);
  } catch (error) {
    log("GET /api/ajustes excepción — devolviendo vacío:", error.message);
    const fallback = buildAjustesVacio(req, sessionUsuario, [
      error.message || "Error cargando ajustes",
    ]);
    return res.status(200).json(fallback);
  }
});

// PATCH /api/ajustes/perfil
router.patch("/api/ajustes/perfil", protegerApi, async (req, res) => {
  try {
    const data = await patchPerfil(getUsuarioId(req), req.body, req.session.usuario);
    res.json(data);
  } catch (error) {
    handleError(res, error, "PATCH perfil");
  }
});

// PATCH /api/ajustes
router.patch("/api/ajustes", protegerApi, async (req, res) => {
  try {
    const data = await patchAjustesGenerales(getUsuarioId(req), req.body);
    res.json(data);
  } catch (error) {
    handleError(res, error, "PATCH ajustes");
  }
});

// POST /api/ajustes/password
router.post("/api/ajustes/password", protegerApi, async (req, res) => {
  try {
    const { actual, nueva } = req.body || {};
    const data = await cambiarPassword(getUsuarioId(req), actual, nueva);
    res.json(data);
  } catch (error) {
    handleError(res, error, "POST password");
  }
});

// POST /api/ajustes/meta/probar
router.post("/api/ajustes/meta/probar", protegerApi, async (req, res) => {
  try {
    const data = await probarMetaEvento(getUsuarioId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "POST meta probar");
  }
});

// GET /api/conexiones/whatsapp
router.get("/api/conexiones/whatsapp", protegerApi, async (req, res) => {
  try {
    const data = await listConexiones(getUsuarioId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "GET conexiones");
  }
});

// POST /api/conexiones/whatsapp
router.post("/api/conexiones/whatsapp", protegerApi, async (req, res) => {
  try {
    const data = await createConexion(getUsuarioId(req), req.body);
    res.json(data);
  } catch (error) {
    handleError(res, error, "POST conexion");
  }
});

// PATCH /api/conexiones/whatsapp/:id
router.patch("/api/conexiones/whatsapp/:id", protegerApi, async (req, res) => {
  try {
    const data = await updateConexion(getUsuarioId(req), req.params.id, req.body);
    res.json(data);
  } catch (error) {
    handleError(res, error, "PATCH conexion");
  }
});

// DELETE /api/conexiones/whatsapp/:id
router.delete("/api/conexiones/whatsapp/:id", protegerApi, async (req, res) => {
  try {
    const data = await deleteConexion(getUsuarioId(req), req.params.id);
    res.json(data);
  } catch (error) {
    handleError(res, error, "DELETE conexion");
  }
});

// POST /api/conexiones/whatsapp/:id/probar
router.post("/api/conexiones/whatsapp/:id/probar", protegerApi, async (req, res) => {
  try {
    const { numero } = req.body || {};
    const data = await probarConexion(getUsuarioId(req), req.params.id, numero);
    res.json(data);
  } catch (error) {
    handleError(res, error, "POST probar conexion");
  }
});

// GET /api/etiquetas
router.get("/api/etiquetas", protegerApi, async (req, res) => {
  try {
    const data = await listEtiquetas(getUsuarioId(req));
    res.json(data);
  } catch (error) {
    handleError(res, error, "GET etiquetas");
  }
});

// POST /api/etiquetas
router.post("/api/etiquetas", protegerApi, async (req, res) => {
  try {
    const data = await createEtiqueta(getUsuarioId(req), req.body);
    res.json(data);
  } catch (error) {
    handleError(res, error, "POST etiqueta");
  }
});

// PATCH /api/etiquetas/:id
router.patch("/api/etiquetas/:id", protegerApi, async (req, res) => {
  try {
    const data = await updateEtiqueta(getUsuarioId(req), req.params.id, req.body);
    res.json(data);
  } catch (error) {
    handleError(res, error, "PATCH etiqueta");
  }
});

// DELETE /api/etiquetas/:id
router.delete("/api/etiquetas/:id", protegerApi, async (req, res) => {
  try {
    const data = await deleteEtiqueta(getUsuarioId(req), req.params.id);
    res.json(data);
  } catch (error) {
    handleError(res, error, "DELETE etiqueta");
  }
});

module.exports = router;
