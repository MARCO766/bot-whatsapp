/**
 * Tokens de reset de contraseña — SHA-256 en BD, token plano solo en memoria/email.
 */
const crypto = require("crypto");
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const RESET_TTL_MS = 60 * 60 * 1000;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

function generateRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

function expiresAtIso(msFromNow = RESET_TTL_MS) {
  return new Date(Date.now() + msFromNow).toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Genera token de un solo uso, guarda SHA-256 + expiración en crm_usuarios.
 * @returns {{ token: string, expiresAt: string }}
 */
async function generarTokenReset(usuarioId) {
  if (!usuarioId) {
    const err = new Error("usuarioId requerido");
    err.status = 400;
    throw err;
  }

  const token = generateRawToken();
  const password_reset_token_hash = hashToken(token);
  const password_reset_expires_at = expiresAtIso();

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(usuarioId)}`,
    { password_reset_token_hash, password_reset_expires_at },
    {
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
    }
  );

  return { token, expiresAt: password_reset_expires_at };
}

/**
 * Valida token contra hash almacenado y expiración.
 * @returns {{ valid: true, usuarioId: string, email: string, nombre: string } | { valid: false }}
 */
async function validarTokenReset(token) {
  if (!token || typeof token !== "string") {
    return { valid: false };
  }

  const password_reset_token_hash = hashToken(token);
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?password_reset_token_hash=eq.${encodeURIComponent(password_reset_token_hash)}&password_reset_expires_at=gt.${encodeURIComponent(nowIso())}&activo=eq.true&select=id,email,nombre,password_reset_expires_at`,
    { headers: headers() }
  );

  const usuario = res.data?.[0];
  if (!usuario) {
    return { valid: false };
  }

  return {
    valid: true,
    usuarioId: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    expiresAt: usuario.password_reset_expires_at,
  };
}

/** Limpia columnas de reset tras cambio de contraseña o cancelación. */
async function limpiarTokenReset(usuarioId) {
  if (!usuarioId) {
    const err = new Error("usuarioId requerido");
    err.status = 400;
    throw err;
  }

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(usuarioId)}`,
    {
      password_reset_token_hash: null,
      password_reset_expires_at: null,
    },
    {
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
    }
  );

  return { ok: true };
}

module.exports = {
  generarTokenReset,
  validarTokenReset,
  limpiarTokenReset,
};
