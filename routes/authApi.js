/**
 * API JSON de autenticación MacBot — sesión express-session (app Android).
 */
const express = require("express");
const router = express.Router();
const { protegerApi } = require("../middlewares/auth");
const { validarCredenciales } = require("../services/authService");

function log(msg, extra) {
  if (extra !== undefined) console.log(`[authApi] ${msg}`, extra);
  else console.log(`[authApi] ${msg}`);
}

// POST /api/auth/login
router.post("/api/auth/login", async (req, res) => {
  const email = req.body?.email;
  const password = req.body?.password;

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      error: "Email y contraseña son requeridos",
    });
  }

  try {
    const result = await validarCredenciales(email, password);

    if (!result.ok) {
      return res.status(401).json({
        ok: false,
        error: "Credenciales inválidas",
      });
    }

    req.session.usuario = result.usuario;

    return res.status(200).json({
      ok: true,
      usuario: result.usuario,
    });
  } catch (error) {
    log("POST /api/auth/login:", error.response?.data || error.message);
    return res.status(500).json({
      ok: false,
      error: "Error iniciando sesión",
    });
  }
});

// GET /api/auth/me
router.get("/api/auth/me", protegerApi, (req, res) => {
  res.status(200).json({
    ok: true,
    usuario: req.session.usuario,
  });
});

// POST /api/auth/logout
router.post("/api/auth/logout", (req, res) => {
  const finishLogout = () => {
    res.clearCookie("connect.sid");
    res.status(200).json({ ok: true });
  };

  if (!req.session) {
    return finishLogout();
  }

  req.session.destroy((err) => {
    if (err) {
      log("POST /api/auth/logout:", err.message);
    }
    finishLogout();
  });
});

module.exports = router;
