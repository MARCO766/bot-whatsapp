/**
 * Envío de correo — Brevo API (preferido) o SMTP fallback para reset de contraseña MacBot CRM.
 */
const axios = require("axios");
const nodemailer = require("nodemailer");

const SMTP_REQUIRED_ENV = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
];

const BREVO_REQUIRED_ENV = [
  "BREVO_API_KEY",
  "EMAIL_FROM_ADDRESS",
];

let transporter = null;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function isBrevoApiConfigured() {
  return Boolean(String(process.env.BREVO_API_KEY || "").trim());
}

function getMissingPasswordResetEnv() {
  const missing = [];
  if (!String(process.env.APP_URL || "").trim()) {
    missing.push("APP_URL");
  }

  if (isBrevoApiConfigured()) {
    for (const key of BREVO_REQUIRED_ENV) {
      if (!String(process.env[key] || "").trim()) {
        missing.push(key);
      }
    }
    return missing;
  }

  for (const key of SMTP_REQUIRED_ENV) {
    if (!String(process.env[key] || "").trim()) {
      missing.push(key);
    }
  }

  return missing;
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
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });

  return transporter;
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
async function sendEmailViaBrevoApi({ to, subject, text, html }) {
  const fromAddress = String(process.env.EMAIL_FROM_ADDRESS || "").trim();

  console.log("[BREVO_API_STEP] send_start");
  try {
    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          name: "MacBot",
          email: fromAddress,
        },
        to: [{ email: to }],
        subject,
        htmlContent: html || text,
        textContent: text,
      },
      {
        headers: {
          "api-key": String(process.env.BREVO_API_KEY || "").trim(),
          "Content-Type": "application/json",
        },
      }
    );
    console.log("[BREVO_API_STEP] send_ok");
    return response.data;
  } catch (error) {
    console.log("[BREVO_API_STEP] error", {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      response: error.response?.data,
    });
    throw error;
  }
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
async function sendEmailViaSmtp({ to, subject, text, html }) {
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
    console.log("[SMTP_NETWORK]", {
      host,
      port,
      secure,
    });
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
      errno: error.errno,
      syscall: error.syscall,
      address: error.address,
      port: error.port,
    });
    throw error;
  }
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

  if (isBrevoApiConfigured()) {
    return sendEmailViaBrevoApi({ to, subject, text, html });
  }

  return sendEmailViaSmtp({ to, subject, text, html });
}

module.exports = {
  getAppUrl,
  sendEmail,
  isPasswordResetEmailConfigured,
  warnIfMissingPasswordResetEnv,
  getMissingPasswordResetEnv,
};
