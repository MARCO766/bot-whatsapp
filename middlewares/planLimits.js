/**
 * Límites de plan — Fase 3A: conexiones WhatsApp.
 * Fase 3C: contactos CRM (solo plan activo; ya no consumen capacidad comercial).
 * Fase 3B: creación de flujos nuevos.
 * Fase 2B: capacidad comercial = leads CTWA (macbot_ctwa_leads vs
 * obtenerCapacidadEfectivaContactos). CRM no gasta ese cupo.
 *
 * Los cupos de WhatsApp/flujos salen de planesService (starter/pro → MACBOT:
 * 2 WhatsApp y 20 flujos). Capacidad comercial reutiliza max_contactos + bloques
 * (solo lectura; no se escribe max_contactos).
 */
const axios = require("axios");
const { getConexionesUsuario } = require("../services/conexionesWhatsappService");
const {
  obtenerPlanUsuario,
  obtenerLimitesUsuario,
  obtenerCapacidadEfectivaContactos,
  esPlanActivo,
  esWhatsappIlimitado,
  esContactosIlimitado,
  esFlujosIlimitado,
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
    return Boolean(resClientes.data?.[0]);
  } catch (error) {
    console.log("[planLimits] existeContactoUsuario:", error.response?.data || error.message);
    return false;
  }
}

/** Error tipado: COUNT de leads no confiable (nunca confundir con 0 real). */
function leadsCountUnavailableError(detail) {
  const err = new Error(
    typeof detail === "string" && detail ? detail : "COUNT macbot_ctwa_leads no disponible"
  );
  err.code = "LEADS_COUNT_UNAVAILABLE";
  return err;
}

/**
 * Leads CTWA por usuario_id en macbot_ctwa_leads (nunca COUNT global).
 * Enforcement: ante error o conteo ambiguo → THROW (no devolver 0).
 * 0 real solo si Content-Range reporta total 0 de forma fiable.
 */
async function contarLeadsCtwaUsuario(usuarioId) {
  if (!usuarioId || !SUPABASE_URL || !SUPABASE_KEY) {
    throw leadsCountUnavailableError("usuarioId/Supabase no configurados para COUNT leads");
  }

  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/macbot_ctwa_leads?usuario_id=eq.${encodeURIComponent(usuarioId)}&select=id`,
      {
        headers: supabaseHeaders({
          Prefer: "count=exact",
          Range: "0-0",
        }),
      }
    );
    const range = res.headers["content-range"] || res.headers["Content-Range"] || "";
    const total = parseInt(String(range).split("/")[1], 10);
    if (!Number.isFinite(total) || total < 0) {
      throw leadsCountUnavailableError(
        `Content-Range inválido para COUNT leads: ${String(range).slice(0, 80)}`
      );
    }
    return total;
  } catch (error) {
    if (error?.code === "LEADS_COUNT_UNAVAILABLE") throw error;
    console.log("[planLimits] contarLeadsCtwaUsuario:", error.response?.data || error.message);
    throw leadsCountUnavailableError(error.response?.data || error.message);
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

  const plan = await obtenerPlanUsuario(usuarioId);

  if (!esPlanActivo(plan)) {
    return {
      ok: false,
      code: "PLAN_INACTIVE",
    };
  }

  // Fase 2B: clientes CRM no consumen capacidad comercial (leads CTWA).
  return { ok: true };
}

/**
 * Webhook: contactos existentes siempre pasan; nuevos solo respetan plan activo.
 * Ya no bloquea por cupo de contactos (capacidad = leads CTWA).
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
    return { permitir: true, existente: true };
  }

  const check = await puedeCrearContacto(usuarioId, numero);
  if (!check.ok) {
    console.log("[PLAN_INACTIVE] contacto nuevo bloqueado (plan no activo)", {
      usuarioId,
      cliente_numero: numero,
      ok: false,
      code: check.code || "PLAN_INACTIVE",
    });
    return {
      permitir: false,
      code: check.code || "PLAN_INACTIVE",
    };
  }

  return { permitir: true, existente: false };
}

/**
 * Lectura ESTRICTA del plan solo para el gate CTWA.
 * No usa obtenerPlanUsuario (que hace fallback a Free/100).
 * Error de red / sin fila → throw o null (caller = fail-closed).
 */
async function fetchPlanRowStrictParaGateLeads(usuarioId) {
  if (!usuarioId || !SUPABASE_URL || !SUPABASE_KEY) {
    const err = new Error("Supabase/usuario no disponible para leer plan (gate leads)");
    err.code = "PLAN_READ_UNAVAILABLE";
    throw err;
  }
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(usuarioId)}` +
      `&select=id,plan,estado_plan,fecha_vencimiento,max_whatsapp,max_contactos,max_flujos,created_plan_at,updated_plan_at`,
    { headers: supabaseHeaders() }
  );
  return res.data?.[0] || null;
}

/**
 * Capacidad comercial de leads CTWA (Fase 2B).
 * No usa el fallback Free/100 de obtenerPlanUsuario.
 *
 * Orden:
 * 1) Leer plan en modo estricto (error ≠ Free).
 * 2) Capacidad vía obtenerCapacidadEfectivaContactos(usuarioId, planRow) — fórmula intacta.
 * 3) Ilimitado (null/-1) → permitir SIN COUNT.
 * 4) Limitado → COUNT; error COUNT → fail-closed.
 *
 * @param {string} usuarioId
 * @param {{
 *   fetchPlan?: Function,
 *   obtenerCapacidad?: Function,
 *   contarLeads?: Function,
 * }} [deps] solo para tests
 */
async function evaluarCapacidadLeadCtwa(usuarioId, deps = {}) {
  if (!usuarioId) {
    return { permitir: true };
  }

  const fetchPlan =
    typeof deps.fetchPlan === "function"
      ? deps.fetchPlan
      : fetchPlanRowStrictParaGateLeads;
  const obtenerCapacidad =
    typeof deps.obtenerCapacidad === "function"
      ? deps.obtenerCapacidad
      : obtenerCapacidadEfectivaContactos;
  const contarLeads =
    typeof deps.contarLeads === "function" ? deps.contarLeads : contarLeadsCtwaUsuario;

  let planRow;
  try {
    planRow = await fetchPlan(usuarioId);
  } catch (error) {
    console.log(
      "[PLAN_LIMIT_LEADS] error leyendo plan (fail-closed, no Free/100)",
      error?.message || error
    );
    return {
      permitir: false,
      code: "PLAN_LIMIT_LEADS_UNAVAILABLE",
      error: true,
    };
  }

  if (!planRow || typeof planRow !== "object") {
    console.log("[PLAN_LIMIT_LEADS] plan ausente (fail-closed, no Free/100)", {
      usuarioId,
    });
    return {
      permitir: false,
      code: "PLAN_LIMIT_LEADS_UNAVAILABLE",
      error: true,
    };
  }

  let limite;
  try {
    // Preload evita obtenerPlanUsuario y su fallback a DEFAULTS_PLAN.
    limite = await obtenerCapacidad(usuarioId, planRow);
  } catch (error) {
    console.log(
      "[PLAN_LIMIT_LEADS] error obteniendo capacidad efectiva",
      error?.message || error
    );
    return {
      permitir: false,
      code: "PLAN_LIMIT_LEADS_UNAVAILABLE",
      error: true,
    };
  }

  if (esContactosIlimitado(limite)) {
    return { permitir: true, limite, ilimitado: true };
  }

  let usados;
  try {
    usados = await contarLeads(usuarioId);
  } catch (error) {
    console.log(
      "[PLAN_LIMIT_LEADS] error COUNT leads (fail-closed)",
      error?.message || error
    );
    return {
      permitir: false,
      code: "PLAN_LIMIT_LEADS_UNAVAILABLE",
      limite: Number.isFinite(Number(limite)) ? Number(limite) : limite,
      error: true,
    };
  }

  if (typeof usados !== "number" || !Number.isFinite(usados) || usados < 0) {
    return {
      permitir: false,
      code: "PLAN_LIMIT_LEADS_UNAVAILABLE",
      limite: Number.isFinite(Number(limite)) ? Number(limite) : limite,
      error: true,
    };
  }

  const limiteNum = Number(limite);
  const usadosNum = usados;

  if (Number.isFinite(limiteNum) && usadosNum >= limiteNum) {
    return {
      permitir: false,
      code: "PLAN_LIMIT_LEADS",
      limite: limiteNum,
      usados: usadosNum,
      ilimitado: false,
    };
  }

  return {
    permitir: true,
    limite: Number.isFinite(limiteNum) ? limiteNum : limite,
    usados: usadosNum,
    ilimitado: false,
  };
}

/** Flujos en flujos_builder por usuario_id */
async function contarFlujosUsuario(usuarioId) {
  if (!usuarioId || !SUPABASE_URL || !SUPABASE_KEY) return 0;

  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/flujos_builder?usuario_id=eq.${encodeURIComponent(usuarioId)}&select=id`,
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
    console.log("[planLimits] contarFlujosUsuario:", error.response?.data || error.message);
    return 0;
  }
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
async function puedeCrearFlujo(usuarioId) {
  const [plan, limites, usados] = await Promise.all([
    obtenerPlanUsuario(usuarioId),
    obtenerLimitesUsuario(usuarioId),
    contarFlujosUsuario(usuarioId),
  ]);

  if (!esPlanActivo(plan)) {
    return {
      ok: false,
      error: "Tu plan no está activo. No puedes crear nuevos flujos.",
      code: "PLAN_INACTIVE",
      limite: limites.flujos,
      usados,
    };
  }

  const limite = limites.flujos;

  if (esFlujosIlimitado(limite)) {
    return { ok: true, limite, usados };
  }

  if (usados >= limite) {
    return {
      ok: false,
      error: "Límite de flujos alcanzado",
      code: "PLAN_LIMIT_FLUJOS",
      limite,
      usados,
    };
  }

  return { ok: true, limite, usados };
}

function esCreacionNuevoFlujo(req) {
  const id = req.body?.id ?? req.body?.flujoId ?? req.body?.flujo_id;
  return !id;
}

async function responderVerificacionLimiteFlujo(req, res, next, opts = {}) {
  const siempreCreacion = Boolean(opts.siempreCreacion);
  if (!siempreCreacion && !esCreacionNuevoFlujo(req)) {
    return next();
  }

  const usuarioId = req.session?.usuario?.id;
  if (!usuarioId) {
    return res.status(401).json({ ok: false, error: "No autenticado" });
  }

  try {
    const check = await puedeCrearFlujo(usuarioId);
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
    console.log("[planLimits] verificarLimiteNuevoFlujo:", error.message);
    return res.status(500).json({
      ok: false,
      error: "No se pudo validar el límite del plan",
    });
  }
}

/**
 * Solo bloquea INSERT (sin id en body). Guardar/editar flujo existente no se toca.
 */
async function verificarLimiteNuevoFlujo(req, res, next) {
  return responderVerificacionLimiteFlujo(req, res, next);
}

/** Rutas que siempre INSERT — ignoran body.id / flujoId / flujo_id. */
async function verificarLimiteNuevoFlujoSiempre(req, res, next) {
  return responderVerificacionLimiteFlujo(req, res, next, { siempreCreacion: true });
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

async function responderVerificacionLimiteConexionWhatsapp(req, res, next, opts = {}) {
  const siempreCreacion = Boolean(opts.siempreCreacion);
  if (!siempreCreacion && !esCreacionNuevaConexion(req)) {
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

/**
 * Solo bloquea INSERT (sin id en body). Updates y conexiones existentes no se tocan.
 */
async function verificarLimiteNuevaConexionWhatsapp(req, res, next) {
  return responderVerificacionLimiteConexionWhatsapp(req, res, next);
}

/** Rutas que siempre INSERT — ignoran body.id / conexionId / conexion_id. */
async function verificarLimiteNuevaConexionWhatsappSiempre(req, res, next) {
  return responderVerificacionLimiteConexionWhatsapp(req, res, next, { siempreCreacion: true });
}

module.exports = {
  contarConexionesWhatsappUsuario,
  contarContactosUsuario,
  contarLeadsCtwaUsuario,
  contarFlujosUsuario,
  existeContactoUsuario,
  puedeCrearContacto,
  evaluarLimiteContactoEntrante,
  evaluarCapacidadLeadCtwa,
  puedeCrearFlujo,
  verificarLimiteNuevoFlujo,
  verificarLimiteNuevoFlujoSiempre,
  puedeCrearConexionWhatsapp,
  verificarLimiteNuevaConexionWhatsapp,
  verificarLimiteNuevaConexionWhatsappSiempre,
};
