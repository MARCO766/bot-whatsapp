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
  const numericPort = Number(port);
  if (numericPort === 465) return true;
  return false;
}

function getTransporter() {
  if (transporter) return transporter;

  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();

  if (!host || !user || !pass) {
    const err = new Error("SMTP no configurado");
    err.code = "SMTP_NOT_CONFIGURED";
    throw err;
  }

  console.log("[SMTP_SECURE_ENV]", {
    SMTP_SECURE_RAW: process.env.SMTP_SECURE ? "SET" : "EMPTY",
    SMTP_SECURE_NORMALIZED: String(process.env.SMTP_SECURE || "").trim().toLowerCase(),
    port,
  });
  const secure = getSmtpSecure(port);
  console.log("[SMTP_SECURE_RESOLVED]", { port, secure });

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
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
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  console.log("[SMTP_SECURE_ENV]", {
    SMTP_SECURE_RAW: process.env.SMTP_SECURE ? "SET" : "EMPTY",
    SMTP_SECURE_NORMALIZED: String(process.env.SMTP_SECURE || "").trim().toLowerCase(),
    port,
  });
  const secure = getSmtpSecure(port);
  console.log("[SMTP_SECURE_RESOLVED]", { port, secure });

  console.log("[SMTP_CONFIG_CHECK]", {
    host,
    port,
    secure,
    user: Boolean(user),
    pass: Boolean(pass),
    from: Boolean(process.env.SMTP_FROM),
  });

  const mailer = getTransporter();

  try {
    console.log("[SMTP_STEP] verify_start");
    await mailer.verify();
    console.log("[SMTP_STEP] verify_ok");

    console.log("[SMTP_STEP] send_start");
    const result = await mailer.sendMail({
      from,
      to,
      subject,
      text,
      html: html || text,
    });
    console.log("[SMTP_STEP] send_ok");
    return result;
  } catch (error) {
    console.log("[SMTP_STEP] error", {
      message: error.message,
      code: error.code,
      response: error.response,
    });
    throw error;
  }
}

module.exports = {
  getAppUrl,
  sendEmail,
  isPasswordResetEmailConfigured,
  warnIfMissingPasswordResetEnv,
  getMissingPasswordResetEnv,
};
