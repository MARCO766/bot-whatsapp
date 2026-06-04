/**
 * Límites de plan — Fase 3A: conexiones WhatsApp.
 * Fase 3C: contactos nuevos vía webhook.
 */
const axios = require("axios");
const { getConexionesUsuario } = require("../services/conexionesWhatsappService");
const {
  obtenerPlanUsuario,
  obtenerLimitesUsuario,
  esPlanActivo,
  esWhatsappIlimitado,
  esContactosIlimitado,
} = require("../services/planesService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function normalizarNumeroContacto(numero) {
  const digits = String(numero || "").replace(/\D/g, "");
  return digits || String(numero || "").trim();
}

async function contarConexionesWhatsappUsuario(usuarioId) {
  const list = await getConexionesUsuario(usuarioId);
  return Array.isArray(list) ? list.length : 0;
}

/** Contactos únicos por usuario_id + numero en tabla clientes */
async function contarContactosUsuario(usuarioId) {
  if (!usuarioId || !SUPABASE_URL || !SUPABASE_KEY) return 0;

  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/clientes?usuario_id=eq.${encodeURIComponent(usuarioId)}&select=id`,
      {
        headers: supabaseHeaders({
          Prefer: "count=exact",
          Range: "0-0",
        }),
      }
    );
    const range = res.headers["content-range"] || res.headers["Content-Range"] || "";
    const total = parseInt(String(range).split("/")[1], 10);
    return Number.isFinite(total) ? total : (Array.isArray(res.data) ? res.data.length : 0);
  } catch (error) {
    console.log("[planLimits] contarContactosUsuario:", error.response?.data || error.message);
    return 0;
  }
}

async function existeContactoUsuario(usuarioId, clienteNumero) {
  if (!usuarioId || !clienteNumero) return false;

  const numero = normalizarNumeroContacto(clienteNumero);
  if (!numero) return false;

  try {
    const resClientes = await axios.get(
      `${SUPABASE_URL}/rest/v1/clientes?usuario_id=eq.${encodeURIComponent(usuarioId)}&numero=eq.${encodeURIComponent(numero)}&select=id&limit=1`,
      { headers: supabaseHeaders() }
    );
    if (resClientes.data?.[0]) return true;

    const resConv = await axios.get(
      `${SUPABASE_URL}/rest/v1/conversaciones?usuario_id=eq.${encodeURIComponent(usuarioId)}&cliente_numero=eq.${encodeURIComponent(numero)}&select=cliente_numero&limit=1`,
      { headers: supabaseHeaders() }
    );
    return Boolean(resConv.data?.[0]);
  } catch (error) {
    console.log("[planLimits] existeContactoUsuario:", error.response?.data || error.message);
    return false;
  }
}

/**
 * @returns {Promise<{
 *   ok: boolean,
 *   existente?: boolean,
 *   error?: string,
 *   code?: string,
 *   limite?: number|null,
 *   usados?: number
 * }>}
 */
async function puedeCrearContacto(usuarioId, clienteNumero) {
  if (!usuarioId) {
    return { ok: true };
  }

  const existente = await existeContactoUsuario(usuarioId, clienteNumero);
  if (existente) {
    return { ok: true, existente: true };
  }

  const [plan, limites, usados] = await Promise.all([
    obtenerPlanUsuario(usuarioId),
    obtenerLimitesUsuario(usuarioId),
    contarContactosUsuario(usuarioId),
  ]);

  if (!esPlanActivo(plan)) {
    return {
      ok: false,
      code: "PLAN_INACTIVE",
      limite: limites.contactos,
      usados,
    };
  }

  const limite = limites.contactos;

  if (esContactosIlimitado(limite)) {
    return { ok: true, limite, usados };
  }

  if (usados >= limite) {
    return {
      ok: false,
      code: "PLAN_LIMIT_CONTACTOS",
      limite,
      usados,
    };
  }

  return { ok: true, limite, usados };
}

/**
 * Webhook: contactos existentes siempre pasan; nuevos respetan max_contactos.
 * @returns {Promise<{ permitir: boolean, existente?: boolean, code?: string, limite?: number, usados?: number }>}
 */
async function evaluarLimiteContactoEntrante(usuarioId, clienteNumero, opts = {}) {
  if (!usuarioId || !clienteNumero) {
    return { permitir: true };
  }

  const numero = normalizarNumeroContacto(clienteNumero);
  let existente = Boolean(opts.clienteRow);

  if (!existente) {
    existente = await existeContactoUsuario(usuarioId, numero);
  }

  if (existente) {
    console.log("[PLAN_LIMIT_CONTACTOS] contacto existente permitido", {
      usuarioId,
      cliente_numero: numero,
    });
    return { permitir: true, existente: true };
  }

  const check = await puedeCrearContacto(usuarioId, numero);
  if (!check.ok) {
    console.log("[PLAN_LIMIT_CONTACTOS] contacto nuevo bloqueado", {
      usuarioId,
      cliente_numero: numero,
      ok: false,
      code: check.code || "PLAN_LIMIT_CONTACTOS",
      limite: check.limite,
      usados: check.usados,
    });
    return {
      permitir: false,
      code: check.code || "PLAN_LIMIT_CONTACTOS",
      limite: check.limite,
      usados: check.usados,
    };
  }

  return { permitir: true, existente: false };
}

/**
 * @returns {Promise<{
 *   ok: boolean,
 *   error?: string,
 *   code?: string,
 *   limite?: number|null,
 *   usados?: number
 * }>}
 */
async function puedeCrearConexionWhatsapp(usuarioId) {
  const [plan, limites, usados] = await Promise.all([
    obtenerPlanUsuario(usuarioId),
    obtenerLimitesUsuario(usuarioId),
    contarConexionesWhatsappUsuario(usuarioId),
  ]);

  if (!esPlanActivo(plan)) {
    return {
      ok: false,
      error: "Tu plan no está activo. No puedes crear nuevas conexiones WhatsApp.",
      code: "PLAN_INACTIVE",
      limite: limites.whatsapp,
      usados,
    };
  }

  const limite = limites.whatsapp;

  if (esWhatsappIlimitado(limite)) {
    return { ok: true, limite, usados };
  }

  if (usados >= limite) {
    return {
      ok: false,
      error: "Límite de conexiones WhatsApp alcanzado",
      code: "PLAN_LIMIT_WHATSAPP",
      limite,
      usados,
    };
  }

  return { ok: true, limite, usados };
}

function esCreacionNuevaConexion(req) {
  const id = req.body?.id ?? req.body?.conexionId ?? req.body?.conexion_id;
  return !id;
}

/**
 * Solo bloquea INSERT (sin id en body). Updates y conexiones existentes no se tocan.
 */
async function verificarLimiteNuevaConexionWhatsapp(req, res, next) {
  if (!esCreacionNuevaConexion(req)) {
    return next();
  }

  const usuarioId = req.session?.usuario?.id;
  if (!usuarioId) {
    return res.status(401).json({ ok: false, error: "No autenticado" });
  }

  try {
    const check = await puedeCrearConexionWhatsapp(usuarioId);
    if (!check.ok) {
      const body = {
        ok: false,
        error: check.error,
        code: check.code,
      };
      if (check.limite !== undefined) body.limite = check.limite;
      if (check.usados !== undefined) body.usados = check.usados;
      return res.status(403).json(body);
    }
    return next();
  } catch (error) {
    console.log("[planLimits] verificarLimiteNuevaConexionWhatsapp:", error.message);
    return res.status(500).json({
      ok: false,
      error: "No se pudo validar el límite del plan",
    });
  }
}

module.exports = {
  contarConexionesWhatsappUsuario,
  contarContactosUsuario,
  existeContactoUsuario,
  puedeCrearContacto,
  evaluarLimiteContactoEntrante,
  puedeCrearConexionWhatsapp,
  verificarLimiteNuevaConexionWhatsapp,
};
