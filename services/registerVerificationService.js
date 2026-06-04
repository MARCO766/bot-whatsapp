/**
 * Registro con verificación por PIN — hashes en BD, PIN/contraseña nunca en logs.
 */
const crypto = require("crypto");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const { sendEmail, isPasswordResetEmailConfigured } = require("./emailService");
const { escapeHtml } = require("../routes/authPageLayout");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const PIN_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const PASSWORD_ERROR_MSG =
  "La contraseña debe tener mínimo 8 caracteres, una letra y un número.";

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function expiresAtIso(msFromNow = PIN_TTL_MS) {
  return new Date(Date.now() + msFromNow).toISOString();
}

function isStrongPassword(password) {
  return PASSWORD_REGEX.test(String(password || ""));
}

function generatePin() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function validateRegistrationFields({ nombre, email, password, confirmPassword }) {
  const errors = {};
  const trimmedNombre = String(nombre || "").trim();
  const normalizedEmail = normalizeEmail(email);

  if (!trimmedNombre || trimmedNombre.length < 2) {
    errors.nombre = "Ingresa tu nombre (mínimo 2 caracteres).";
  }
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    errors.email = "Correo electrónico no válido.";
  }
  if (!isStrongPassword(password)) {
    errors.password = PASSWORD_ERROR_MSG;
  }
  if (String(password || "") !== String(confirmPassword || "")) {
    errors.password_confirm = "Las contraseñas no coinciden.";
  }

  return {
    errors,
    nombre: trimmedNombre,
    email: normalizedEmail,
  };
}

async function emailExistsInCrm(email) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?email=eq.${encodeURIComponent(email)}&select=id`,
    { headers: headers() }
  );
  return (res.data?.length || 0) > 0;
}

async function deletePendingByEmail(email) {
  await axios.delete(
    `${SUPABASE_URL}/rest/v1/register_verifications?email=eq.${encodeURIComponent(email)}`,
    { headers: headers({ Prefer: "return=minimal" }) }
  );
}

async function findPendingByEmail(email) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/register_verifications?email=eq.${encodeURIComponent(email)}&select=id,nombre,email,password_hash,pin_hash,intentos,expires_at,creado_en&limit=1`,
    { headers: headers() }
  );
  return res.data?.[0] || null;
}

async function enviarCorreoPin(email, pin) {
  const subject = "Tu código de verificación MacBot";
  const text = [
    "MacBot CRM",
    "",
    `Tu código es: ${pin}`,
    "",
    "Expira en 10 minutos.",
    "",
    "Si no solicitaste crear una cuenta, ignora este correo.",
  ].join("\n");

  const html = [
    '<div style="font-family:Inter,system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#0f172a">',
    '<p style="margin:0 0 8px;font-weight:600;font-size:18px">MacBot CRM</p>',
    '<p style="margin:0 0 16px;color:#475569">Tu código de verificación:</p>',
    `<p style="margin:0 0 20px;font-size:36px;font-weight:700;letter-spacing:8px;text-align:center">${escapeHtml(pin)}</p>`,
    '<p style="margin:0;color:#64748b;font-size:14px">Expira en 10 minutos.</p>',
    "</div>",
  ].join("");

  await sendEmail({ to: email, subject, text, html });
}

async function upsertPendingVerification({ nombre, email, password }) {
  const password_hash = await bcrypt.hash(password, 10);
  const pin = generatePin();
  const pin_hash = await bcrypt.hash(pin, 10);
  const expires_at = expiresAtIso();

  await deletePendingByEmail(email);

  const insertRes = await axios.post(
    `${SUPABASE_URL}/rest/v1/register_verifications`,
    {
      nombre,
      email,
      password_hash,
      pin_hash,
      intentos: 0,
      expires_at,
    },
    {
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
    }
  );

  const row = insertRes.data?.[0];
  if (!row?.id) {
    const err = new Error("No se pudo guardar la verificación");
    err.status = 500;
    throw err;
  }

  return { pin, verificationId: row.id };
}

/**
 * @returns {{ ok: true, step: "verify", email: string } | { ok: false, status: number, errors?: object, message?: string }}
 */
async function startRegistration(body) {
  const { errors, nombre, email } = validateRegistrationFields({
    nombre: body?.nombre,
    email: body?.email,
    password: body?.password,
    confirmPassword: body?.confirmPassword ?? body?.confirm_password,
  });

  if (Object.keys(errors).length > 0) {
    return { ok: false, status: 400, errors };
  }

  const password = String(body?.password || "");

  if (await emailExistsInCrm(email)) {
    return {
      ok: false,
      status: 400,
      errors: { _global: "Este correo ya está registrado." },
    };
  }

  if (!isPasswordResetEmailConfigured()) {
    console.log("[register] correo no configurado — no se puede enviar PIN");
    return {
      ok: false,
      status: 503,
      errors: {
        _global:
          "El envío de correo no está configurado. Contacta al administrador.",
      },
    };
  }

  try {
    const { pin } = await upsertPendingVerification({ nombre, email, password });
    await enviarCorreoPin(email, pin);
    console.log(`[register] PIN enviado email=${email}`);
    return { ok: true, step: "verify", email };
  } catch (error) {
    console.log("[register] error start:", error.message);
    return {
      ok: false,
      status: 500,
      errors: { _global: "No se pudo iniciar el registro. Intenta de nuevo." },
    };
  }
}

async function incrementAttempts(id, currentIntentos) {
  await axios.patch(
    `${SUPABASE_URL}/rest/v1/register_verifications?id=eq.${encodeURIComponent(id)}`,
    { intentos: currentIntentos + 1 },
    {
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
    }
  );
}

/**
 * @returns {{ ok: true, usuario: object } | { ok: false, status: number, message: string }}
 */
async function verifyRegistration(body) {
  const email = normalizeEmail(body?.email);
  const pin = String(body?.pin || "").replace(/\D/g, "");

  if (!email || pin.length !== 6) {
    return { ok: false, status: 400, message: "Ingresa un código de 6 dígitos válido." };
  }

  const pending = await findPendingByEmail(email);
  if (!pending) {
    return {
      ok: false,
      status: 400,
      message: "No hay verificación pendiente. Vuelve a crear tu cuenta.",
    };
  }

  if (pending.expires_at <= nowIso()) {
    await deletePendingByEmail(email);
    return {
      ok: false,
      status: 400,
      message: "El código expiró. Solicita uno nuevo.",
    };
  }

  if (pending.intentos >= MAX_ATTEMPTS) {
    await deletePendingByEmail(email);
    return {
      ok: false,
      status: 400,
      message: "Demasiados intentos. Vuelve a crear tu cuenta.",
    };
  }

  const pinOk = await bcrypt.compare(pin, pending.pin_hash);
  if (!pinOk) {
    const nextAttempts = pending.intentos + 1;
    await incrementAttempts(pending.id, pending.intentos);
    if (nextAttempts >= MAX_ATTEMPTS) {
      await deletePendingByEmail(email);
      return {
        ok: false,
        status: 400,
        message: "Demasiados intentos. Vuelve a crear tu cuenta.",
      };
    }
    return { ok: false, status: 400, message: "Código incorrecto. Intenta de nuevo." };
  }

  if (await emailExistsInCrm(email)) {
    await deletePendingByEmail(email);
    return {
      ok: false,
      status: 400,
      message: "Este correo ya está registrado.",
    };
  }

  const { DEFAULTS_PLAN } = require("./planesService");
  const payload = {
    nombre: pending.nombre,
    email: pending.email,
    password_hash: pending.password_hash,
    activo: true,
    plan: DEFAULTS_PLAN.plan,
    estado_plan: DEFAULTS_PLAN.estado_plan,
    max_whatsapp: DEFAULTS_PLAN.max_whatsapp,
    max_contactos: DEFAULTS_PLAN.max_contactos,
    max_flujos: DEFAULTS_PLAN.max_flujos,
  };

  try {
    const insertRes = await axios.post(
      `${SUPABASE_URL}/rest/v1/crm_usuarios`,
      payload,
      {
        headers: headers({
          "Content-Type": "application/json",
          Prefer: "return=representation",
        }),
      }
    );

    const usuario = insertRes.data?.[0];
    if (!usuario?.id) {
      return {
        ok: false,
        status: 500,
        message: "No se pudo crear la cuenta. Intenta de nuevo.",
      };
    }

    await deletePendingByEmail(email);
    console.log(`[register] cuenta activada usuarioId=${usuario.id} plan=free`);
    return { ok: true, usuario };
  } catch (error) {
    const pgCode = error.response?.data?.code;
    if (pgCode === "23505" || error.response?.status === 409) {
      await deletePendingByEmail(email);
      return {
        ok: false,
        status: 400,
        message: "Este correo ya está registrado.",
      };
    }
    console.log("[register] error verify:", error.response?.data || error.message);
    return {
      ok: false,
      status: 500,
      message: "No se pudo crear la cuenta. Intenta de nuevo.",
    };
  }
}

/**
 * @returns {{ ok: true, email: string, cooldownSeconds?: number } | { ok: false, status: number, message: string, cooldownSeconds?: number }}
 */
async function resendPin(body) {
  const email = normalizeEmail(body?.email);
  if (!email) {
    return { ok: false, status: 400, message: "Correo no válido." };
  }

  const pending = await findPendingByEmail(email);
  if (!pending) {
    return {
      ok: false,
      status: 400,
      message: "No hay verificación pendiente. Vuelve a crear tu cuenta.",
    };
  }

  const elapsed = Date.now() - new Date(pending.creado_en).getTime();
  if (elapsed < RESEND_COOLDOWN_MS) {
    const cooldownSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
    return {
      ok: false,
      status: 429,
      message: `Espera ${cooldownSeconds} segundos antes de reenviar.`,
      cooldownSeconds,
    };
  }

  if (!isPasswordResetEmailConfigured()) {
    return {
      ok: false,
      status: 503,
      message: "El envío de correo no está configurado.",
    };
  }

  try {
    const pin = generatePin();
    const pin_hash = await bcrypt.hash(pin, 10);
    const expires_at = expiresAtIso();

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/register_verifications?id=eq.${encodeURIComponent(pending.id)}`,
      {
        pin_hash,
        intentos: 0,
        expires_at,
        creado_en: nowIso(),
      },
      {
        headers: headers({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
      }
    );

    await enviarCorreoPin(email, pin);
    console.log(`[register] PIN reenviado email=${email}`);
    return { ok: true, email };
  } catch (error) {
    console.log("[register] error resend:", error.message);
    return {
      ok: false,
      status: 500,
      message: "No se pudo reenviar el código. Intenta de nuevo.",
    };
  }
}

module.exports = {
  PASSWORD_REGEX,
  PASSWORD_ERROR_MSG,
  isStrongPassword,
  validateRegistrationFields,
  startRegistration,
  verifyRegistration,
  resendPin,
};
