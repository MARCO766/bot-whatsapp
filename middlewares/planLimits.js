/**
 * Límites de plan — Fase 3A: solo creación de nuevas conexiones WhatsApp.
 */
const { getConexionesUsuario } = require("../services/conexionesWhatsappService");
const {
  obtenerPlanUsuario,
  obtenerLimitesUsuario,
  esPlanActivo,
  esWhatsappIlimitado,
} = require("../services/planesService");

async function contarConexionesWhatsappUsuario(usuarioId) {
  const list = await getConexionesUsuario(usuarioId);
  return Array.isArray(list) ? list.length : 0;
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
  puedeCrearConexionWhatsapp,
  verificarLimiteNuevaConexionWhatsapp,
};
