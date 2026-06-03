/**
 * Envío de correo SMTP — infraestructura para reset de contraseña MacBot CRM.
 */
const nodemailer = require("nodemailer");

const REQUIRED_ENV = [
  "APP_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
];

let transporter = null;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getMissingPasswordResetEnv() {
  return REQUIRED_ENV.filter((key) => !String(process.env[key] || "").trim());
}

function isPasswordResetEmailConfigured() {
  return getMissingPasswordResetEnv().length === 0;
}

function warnIfMissingPasswordResetEnv() {
  const missing = getMissingPasswordResetEnv();
  if (missing.length === 0) return;

  const scope = isProduction() ? "producción" : "desarrollo";
  console.warn(
    `⚠️ Recuperación de contraseña (${scope}): faltan variables de entorno: ${missing.join(", ")}`
  );
}

function getAppUrl() {
  const raw = String(process.env.APP_URL || "").trim();
  return raw.replace(/\/+$/, "");
}

function getSmtpSecure(port) {
  const explicit = String(process.env.SMTP_SECURE || "").trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  if (port === 465) return true;
  if (port === 587) return false;
  return false;
}

function getTransporter() {
  if (transporter) return transporter;

  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number.isFinite(Number(process.env.SMTP_PORT))
    ? Number(process.env.SMTP_PORT)
    : 587;
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();

  if (!host || !user || !pass) {
    const err = new Error("SMTP no configurado");
    err.code = "SMTP_NOT_CONFIGURED";
    throw err;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: getSmtpSecure(port),
    auth: { user, pass },
  });

  return transporter;
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
async function sendEmail({ to, subject, text, html }) {
  if (!isPasswordResetEmailConfigured()) {
    const err = new Error("Correo no configurado para recuperación de contraseña");
    err.code = "SMTP_NOT_CONFIGURED";
    throw err;
  }

  const from = String(process.env.SMTP_FROM || "").trim();
  const mailer = getTransporter();

  return mailer.sendMail({
    from,
    to,
    subject,
    text,
    html: html || text,
  });
}

module.exports = {
  getAppUrl,
  sendEmail,
  isPasswordResetEmailConfigured,
  warnIfMissingPasswordResetEnv,
  getMissingPasswordResetEnv,
};
