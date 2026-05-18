/**
 * API JSON Ajustes — misma lógica que admin Conexiones (/guardar-conexion, etc.)
 */
const express = require("express");
const router = express.Router();
const {
  getAjustesCompleto,
  buildAjustesVacio,
  patchPerfil,
  patchAjustesGenerales,
  guardarConexionAjustes,
  desconectarConexionAjustes,
  probarConexionAjustes,
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
  return res.status(401).json({ ok: false, error: "No autenticado" });
}

function uid(req) {
  return req.session.usuario.id;
}

function handleError(res, error, label) {
  const status = error.status || error.response?.status || 500;
  log(`${label} (${status}):`, error.response?.data || error.message);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    ok: false,
    error: error.message || "Error del servidor",
  });
}

// GET /api/ajustes — siempre 200
router.get("/api/ajustes", protegerApi, async (req, res) => {
  try {
    const data = await getAjustesCompleto(uid(req), req, req.session.usuario);
    res.status(200).json(data);
  } catch (error) {
    log("GET /api/ajustes fallback:", error.message);
    res.status(200).json(buildAjustesVacio(req, req.session.usuario));
  }
});

router.patch("/api/ajustes/perfil", protegerApi, async (req, res) => {
  try {
    res.json(await patchPerfil(uid(req), req.body, req.session.usuario));
  } catch (error) {
    handleError(res, error, "PATCH perfil");
  }
});

router.patch("/api/ajustes", protegerApi, async (req, res) => {
  try {
    res.json(await patchAjustesGenerales());
  } catch (error) {
    handleError(res, error, "PATCH ajustes");
  }
});

router.post("/api/ajustes/password", protegerApi, async (req, res) => {
  try {
    const { actual, nueva } = req.body || {};
    res.json(await cambiarPassword(uid(req), actual, nueva));
  } catch (error) {
    handleError(res, error, "POST password");
  }
});

router.post("/api/ajustes/meta/probar", protegerApi, async (req, res) => {
  try {
    res.json(await probarMetaEvento(uid(req)));
  } catch (error) {
    handleError(res, error, "POST meta probar");
  }
});

/** Misma lógica que POST /guardar-conexion */
router.post("/api/ajustes/conexion/guardar", protegerApi, async (req, res) => {
  try {
    res.json(await guardarConexionAjustes(uid(req), req.body));
  } catch (error) {
    handleError(res, error, "POST conexion guardar");
  }
});

/** Alias para el frontend */
router.post("/api/conexiones/whatsapp", protegerApi, async (req, res) => {
  try {
    res.json(await guardarConexionAjustes(uid(req), req.body));
  } catch (error) {
    handleError(res, error, "POST conexiones/whatsapp");
  }
});

/** Misma lógica que POST /desconectar-whatsapp */
router.post("/api/ajustes/conexion/desconectar", protegerApi, async (req, res) => {
  try {
    res.json(await desconectarConexionAjustes(uid(req)));
  } catch (error) {
    handleError(res, error, "POST desconectar");
  }
});

/** Misma lógica que POST /probar-whatsapp */
router.post("/api/ajustes/conexion/probar", protegerApi, async (req, res) => {
  try {
    const { numero } = req.body || {};
    res.json(await probarConexionAjustes(uid(req), numero));
  } catch (error) {
    handleError(res, error, "POST probar");
  }
});

router.post("/api/conexiones/whatsapp/:id/probar", protegerApi, async (req, res) => {
  try {
    const { numero } = req.body || {};
    res.json(await probarConexionAjustes(uid(req), numero));
  } catch (error) {
    handleError(res, error, "POST probar conexion");
  }
});

router.get("/api/etiquetas", protegerApi, async (req, res) => {
  try {
    res.json(await listEtiquetas(uid(req)));
  } catch (error) {
    handleError(res, error, "GET etiquetas");
  }
});

router.post("/api/etiquetas", protegerApi, async (req, res) => {
  try {
    res.json(await createEtiqueta(uid(req), req.body));
  } catch (error) {
    handleError(res, error, "POST etiqueta");
  }
});

router.patch("/api/etiquetas/:id", protegerApi, async (req, res) => {
  try {
    res.json(await updateEtiqueta(uid(req), req.params.id, req.body));
  } catch (error) {
    handleError(res, error, "PATCH etiqueta");
  }
});

router.delete("/api/etiquetas/:id", protegerApi, async (req, res) => {
  try {
    res.json(await deleteEtiqueta(uid(req), req.params.id));
  } catch (error) {
    handleError(res, error, "DELETE etiqueta");
  }
});

module.exports = router;
