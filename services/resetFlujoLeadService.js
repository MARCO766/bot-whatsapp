/**
 * Reset aislado de automatización por lead (comando resetbot).
 * No borra mensajes, conversaciones, clientes ni etiquetas.
 */

const axios = require("axios");
const { limpiarSesionIAPendiente } = require("./iaFlowSession");
const { enviarTextoWhatsApp } = require("./whatsappService");
const {
  cancelarRemarketing24hPorResetbot,
} = require("./remarketing24h/remarketing24hService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const MENSAJE_CONFIRMACION =
  "✅ Flujo reiniciado. Escribe un activador válido para comenzar de nuevo.";

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function esComandoResetFlujo(texto) {
  return String(texto || "").trim().toLowerCase() === "resetbot";
}

async function cancelarSeguimientosPendientesLead(numero, usuarioId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !numero) return;

  const ahora = new Date().toISOString();
  let url = `${SUPABASE_URL}/rest/v1/seguimientos_programados?cliente_numero=eq.${encodeURIComponent(numero)}&estado=eq.pendiente`;
  if (usuarioId) {
    url += `&usuario_id=eq.${encodeURIComponent(usuarioId)}`;
  }

  try {
    await axios.patch(
      url,
      {
        estado: "cancelado",
        cancelado_en: ahora,
        actualizado_en: ahora,
        error_detalle: "resetbot",
      },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
      }
    );
  } catch (err) {
    console.log("[RESETBOT] seguimientos:", err.response?.data || err.message);
  }
}

async function limpiarHistorialFlujoLead(numero, usuarioId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !numero || !usuarioId) return;

  try {
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/crm_historial_cliente?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${encodeURIComponent(usuarioId)}&tipo=eq.flujo`,
      { headers: supabaseHeaders() }
    );
  } catch (err) {
    console.log("[RESETBOT] historial flujo:", err.response?.data || err.message);
  }
}

function normalizarConexionIdReset(conexionWhatsappId) {
  if (conexionWhatsappId == null || String(conexionWhatsappId).trim() === "") {
    return null;
  }
  return String(conexionWhatsappId).trim();
}

/**
 * Tras envío exitoso de RM24H: corta automatización sin mensaje WA ni cancelar seguimientos CRM.
 */
async function finalizarFlujoLeadTrasRemarketing(
  numero,
  usuarioId,
  conexionWhatsappId = null
) {
  const num = String(numero || "").trim();
  const uid =
    usuarioId != null && usuarioId !== "" ? String(usuarioId).trim() : null;
  const conexionId = normalizarConexionIdReset(conexionWhatsappId);

  if (!num) return { ok: false, motivo: "sin_numero" };

  if (conexionId) {
    limpiarSesionIAPendiente(uid, conexionId, num);
  } else {
    console.log(
      "[RM24H_MULTI] finalizar flujo omitido sesión IA — sin conexion_whatsapp_id",
      { lead: num, usuario: uid }
    );
  }

  await limpiarHistorialFlujoLead(num, uid);

  console.log("[RM24H] flujo finalizado tras remarketing", {
    lead: num,
    usuario: uid,
    conexion_whatsapp_id: conexionId,
  });

  return { ok: true };
}

/**
 * Limpia solo estado de automatización (memoria IA + seguimientos + historial flujo).
 */
async function resetearFlujoLead(numero, usuarioId, conexionWhatsappId = null) {
  const num = String(numero || "").trim();
  const uid =
    usuarioId != null && usuarioId !== "" ? String(usuarioId).trim() : null;
  const conexionId = normalizarConexionIdReset(conexionWhatsappId);

  if (!num) return { ok: false, motivo: "sin_numero" };

  console.log("[RESETBOT] detectado", {
    lead: num,
    usuario: uid,
    conexion_whatsapp_id: conexionId,
  });

  if (conexionId) {
    limpiarSesionIAPendiente(uid, conexionId, num);
  } else {
    console.log(
      "[RM24H_MULTI] resetbot omitido sesión IA — sin conexion_whatsapp_id",
      { lead: num, usuario: uid }
    );
  }

  if (uid) {
    try {
      await cancelarRemarketing24hPorResetbot({
        usuario_id: uid,
        cliente_numero: num,
        conexion_whatsapp_id: conexionId,
      });
    } catch (err) {
      console.log(
        "[RESETBOT_RM24H] error:",
        err.response?.data || err.message
      );
    }
  }

  await cancelarSeguimientosPendientesLead(num, uid);
  await limpiarHistorialFlujoLead(num, uid);

  console.log("[RESETBOT] flujo cancelado");
  console.log("[RESETBOT] esperando nuevo activador");

  try {
    const opEnvio = { usuarioId: uid, _soloEnvioMeta: true };
    if (conexionId) {
      opEnvio.conexionWhatsappId = conexionId;
      opEnvio.strictConexionWhatsappId = true;
    }
    await enviarTextoWhatsApp(num, MENSAJE_CONFIRMACION, opEnvio);
  } catch (err) {
    console.log("[RESETBOT] WhatsApp confirmación:", err.message || err);
  }

  console.log("[RESETBOT] Automatización reiniciada | lead:", num, "| usuario:", uid);
  return { ok: true };
}

module.exports = {
  esComandoResetFlujo,
  resetearFlujoLead,
  finalizarFlujoLeadTrasRemarketing,
  MENSAJE_CONFIRMACION,
};
