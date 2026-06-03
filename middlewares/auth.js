function protegerPanel(req, res, next) {
  if (req.session && req.session.usuario) {
    return next();
  }

  res.redirect("/login");
}

function protegerApi(req, res, next) {
  if (req.session && req.session.usuario) {
    return next();
  }

  return res.status(401).json({ ok: false, error: "No autenticado" });
}

function warnIfMissingSessionSecret() {
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    console.warn(
      "⚠️ SESSION_SECRET no definido en producción — usando valor por defecto inseguro"
    );
  }
}

module.exports = {
  protegerPanel,
  protegerApi,
  warnIfMissingSessionSecret,
};
