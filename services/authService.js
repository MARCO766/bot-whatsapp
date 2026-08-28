/**
 * Validación de credenciales MacBot — compartida entre login web y API móvil.
 * No normaliza email (mismo comportamiento que POST /login web).
 */
const axios = require("axios");
const bcrypt = require("bcryptjs");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function supabaseHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

function toSessionUsuario(usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
  };
}

async function buscarUsuarioActivoConPassword(email) {
  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?email=eq.${encodeURIComponent(email)}&activo=eq.true&select=*`,
    { headers: supabaseHeaders() }
  );

  return response.data?.[0] || null;
}

/**
 * @returns {Promise<{ ok: true, usuario: { id, nombre, email } } | { ok: false, reason: 'not_found' | 'wrong_password' }>}
 */
async function validarCredenciales(email, password) {
  const usuario = await buscarUsuarioActivoConPassword(email);

  if (!usuario) {
    return { ok: false, reason: "not_found" };
  }

  const passwordCorrecto = await bcrypt.compare(password, usuario.password_hash);

  if (!passwordCorrecto) {
    return { ok: false, reason: "wrong_password" };
  }

  return { ok: true, usuario: toSessionUsuario(usuario) };
}

module.exports = {
  toSessionUsuario,
  validarCredenciales,
};
