/**
 * Acceso panel admin MacBot — solo emails en ADMIN_EMAILS (coma-separados).
 */
function parseAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function esAdminEmail(email) {
  if (!email) return false;
  const normalized = String(email).trim().toLowerCase();
  return parseAdminEmails().includes(normalized);
}

/** Cuenta en ADMIN_EMAILS — no se puede suspender ni desactivar desde el panel. */
function esAdminProtegido(email) {
  return esAdminEmail(email);
}

function protegerAdmin(req, res, next) {
  if (!req.session?.usuario) {
    const acceptsJson =
      req.path.startsWith("/api/") ||
      req.get("accept")?.includes("application/json");
    if (acceptsJson) {
      return res.status(401).json({ ok: false, error: "No autenticado" });
    }
    return res.redirect("/login");
  }

  if (!esAdminEmail(req.session.usuario.email)) {
    return res.status(403).json({ ok: false, error: "Acceso denegado" });
  }

  return next();
}

module.exports = {
  parseAdminEmails,
  esAdminEmail,
  esAdminProtegido,
  protegerAdmin,
};
