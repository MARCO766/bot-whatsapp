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
  desconectarConexionAjustesPorId,
  probarConexionAjustes,
  probarConexionAjustesPorId,
  hacerPrincipalAjustes,
  probarMetaEvento,
  diagnosticoConexionAjustes,
  cambiarPassword,
} = require("../services/ajustesService");
const rt = require("../services/realtimeService");

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
    const body = req.body || {};
    res.json(
      await probarMetaEvento(uid(req), {
        conexionWhatsappId:
          body.conexion_whatsapp_id ?? body.conexionWhatsappId ?? null,
        testEventCode: body.test_event_code ?? body.testEventCode ?? null,
      })
    );
  } catch (error) {
    handleError(res, error, "POST meta probar");
  }
});

/** Misma lógica que POST /guardar-conexion */
router.post("/api/ajustes/conexion/guardar", protegerApi, async (req, res) => {
  try {
    const result = await guardarConexionAjustes(uid(req), req.body);
    rt.conexionActualizada(req, uid(req), { accion: "guardada", conexion: result });
    res.json(result);
  } catch (error) {
    handleError(res, error, "POST conexion guardar");
  }
});

/** Alias para el frontend */
router.post("/api/conexiones/whatsapp", protegerApi, async (req, res) => {
  try {
    const result = await guardarConexionAjustes(uid(req), req.body);
    rt.conexionActualizada(req, uid(req), { accion: "guardada", conexion: result });
    res.json(result);
  } catch (error) {
    handleError(res, error, "POST conexiones/whatsapp");
  }
});

/** Misma lógica que POST /desconectar-whatsapp */
router.post("/api/ajustes/conexion/desconectar", protegerApi, async (req, res) => {
  try {
    const result = await desconectarConexionAjustes(uid(req));
    rt.conexionActualizada(req, uid(req), { accion: "desconectada", conexion: result });
    res.json(result);
  } catch (error) {
    handleError(res, error, "POST desconectar");
  }
});

router.post("/api/ajustes/conexion/:id/desconectar", protegerApi, async (req, res) => {
  try {
    const result = await desconectarConexionAjustesPorId(uid(req), req.params.id);
    rt.conexionActualizada(req, uid(req), { accion: "desconectada", conexionId: req.params.id });
    res.json(result);
  } catch (error) {
    handleError(res, error, "POST desconectar por id");
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

router.post("/api/ajustes/conexion/:id/probar", protegerApi, async (req, res) => {
  try {
    const { numero } = req.body || {};
    res.json(await probarConexionAjustesPorId(uid(req), req.params.id, numero));
  } catch (error) {
    handleError(res, error, "POST probar por id");
  }
});

router.get("/api/ajustes/conexion/:id/diagnostico", protegerApi, async (req, res) => {
  try {
    res.json(await diagnosticoConexionAjustes(uid(req), req.params.id));
  } catch (error) {
    handleError(res, error, "GET diagnostico");
  }
});

router.post("/api/ajustes/conexion/:id/principal", protegerApi, async (req, res) => {
  try {
    const result = await hacerPrincipalAjustes(uid(req), req.params.id);
    rt.conexionActualizada(req, uid(req), { accion: "principal", conexionId: req.params.id });
    res.json(result);
  } catch (error) {
    handleError(res, error, "POST principal");
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

module.exports = router;
