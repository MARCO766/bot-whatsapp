const express = require("express");
const router = express.Router();
const { protegerAdmin } = require("../middlewares/adminAuth");
const {
  obtenerDashboardAdmin,
  obtenerResumenAdmin,
  actualizarPlanUsuario,
  actualizarEstadoUsuario,
} = require("../services/adminUsuariosService");
const {
  registrarLogsCambioPlan,
  registrarLogEstadoUsuario,
  registrarAdminLog,
  listarAdminLogs,
} = require("../services/adminLogsService");
const {
  obtenerPanelAdminContactos,
  acreditarBloqueManual,
} = require("../services/macbotContactosService");

router.get("/api/admin/usuarios", protegerAdmin, async (req, res) => {
  try {
    const { resumen, usuarios } = await obtenerDashboardAdmin();
    res.json({ ok: true, resumen, usuarios });
  } catch (error) {
    console.log("[adminUsuariosApi] GET usuarios:", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar usuarios" });
  }
});

router.get("/api/admin/resumen", protegerAdmin, async (req, res) => {
  try {
    const resumen = await obtenerResumenAdmin();
    res.json({ ok: true, resumen });
  } catch (error) {
    console.log("[adminUsuariosApi] GET resumen:", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar el resumen" });
  }
});

router.get("/api/admin/logs", protegerAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = await listarAdminLogs({ limit });
    res.json({ ok: true, logs });
  } catch (error) {
    console.log("[adminUsuariosApi] GET logs:", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar el historial" });
  }
});

router.get("/api/admin/usuarios/:id/contactos-bloques", protegerAdmin, async (req, res) => {
  try {
    const result = await obtenerPanelAdminContactos(req.params.id);
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }
    res.json(result);
  } catch (error) {
    console.log("[adminUsuariosApi] GET contactos-bloques:", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar los bloques de contactos" });
  }
});

router.post("/api/admin/usuarios/:id/contactos-bloques", protegerAdmin, async (req, res) => {
  try {
    const result = await acreditarBloqueManual(req.params.id, {
      sku: req.body?.sku,
      cantidad: req.body?.cantidad,
      adminEmail: req.session.usuario?.email || null,
    });
    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        error: result.error,
        plan: result.plan,
      });
    }
    await registrarAdminLog({
      adminUsuario: req.session.usuario,
      usuarioAfectado: result.usuario,
      accion: "acreditar_bloque_contactos",
      detalle: {
        sku: result.bloque?.sku,
        cantidad: result.bloque?.cantidad,
        precio_usd: result.bloque?.precio_usd,
        origen: result.bloque?.origen,
        capacidad_comprada: result.capacidad_comprada,
        max_contactos_sin_cambio: true,
      },
    });
    res.json({
      ok: true,
      bloque: result.bloque,
      capacidad_comprada: result.capacidad_comprada,
    });
  } catch (error) {
    console.log("[adminUsuariosApi] POST contactos-bloques:", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo acreditar el bloque" });
  }
});

router.patch("/api/admin/usuarios/:id/plan", protegerAdmin, async (req, res) => {
  try {
    const result = await actualizarPlanUsuario(req.params.id, req.body);
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }
    await registrarLogsCambioPlan(req.session.usuario, result.anterior, result.usuario);
    res.json({ ok: true, usuario: result.usuario });
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    console.log("[ADMIN_PLAN_UPDATE] error", { message: msg });
    res.status(500).json({ ok: false, error: "No se pudo actualizar el plan" });
  }
});

router.patch("/api/admin/usuarios/:id/estado", protegerAdmin, async (req, res) => {
  try {
    const result = await actualizarEstadoUsuario(req.params.id, req.body?.activo);
    if (!result.ok) {
      if (result.code === "ADMIN_PROTECTED") {
        console.log("[ADMIN_PROTECTED_BLOCK]", {
          admin: req.session.usuario?.email || null,
          target: result.targetEmail || null,
        });
      }
      return res.status(result.status).json({
        ok: false,
        code: result.code,
        error: result.error,
      });
    }
    await registrarLogEstadoUsuario(req.session.usuario, result.anterior, result.usuario);
    res.json({ ok: true, usuario: result.usuario });
  } catch (error) {
    console.log("[adminUsuariosApi] PATCH estado:", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo actualizar el estado" });
  }
});

module.exports = router;
