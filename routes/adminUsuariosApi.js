const express = require("express");
const router = express.Router();
const { protegerAdmin } = require("../middlewares/adminAuth");
const {
  listarUsuarios,
  actualizarPlanUsuario,
  actualizarEstadoUsuario,
} = require("../services/adminUsuariosService");

router.get("/api/admin/usuarios", protegerAdmin, async (req, res) => {
  try {
    const usuarios = await listarUsuarios();
    res.json({ ok: true, usuarios });
  } catch (error) {
    console.log("[adminUsuariosApi] GET usuarios:", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo cargar usuarios" });
  }
});

router.patch("/api/admin/usuarios/:id/plan", protegerAdmin, async (req, res) => {
  try {
    const result = await actualizarPlanUsuario(req.params.id, req.body);
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }
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
      return res.status(result.status).json({ ok: false, error: result.error });
    }
    res.json({ ok: true, usuario: result.usuario });
  } catch (error) {
    console.log("[adminUsuariosApi] PATCH estado:", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo actualizar el estado" });
  }
});

module.exports = router;
