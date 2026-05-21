/**
 * Reset aislado de automatización por lead (comando resetbot).
 * No borra mensajes, conversaciones, clientes ni etiquetas.
 */

const axios = require("axios");
const { limpiarSesionIAPendiente } = require("./iaFlowSession");
const { enviarTextoWhatsApp } = require("./whatsappService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const MENSAJE_CONFIRMACION =
  '✅ Reset completo. Escribe "hola" para empezar desde cero.';

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

async function limpiarHistorialAutomatizacionLead(numero, usuarioId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !numero || !usuarioId) return;

  const base = `cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${encodeURIComponent(usuarioId)}`;

  try {
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/crm_historial_cliente?${base}&tipo=eq.flujo`,
      { headers: supabaseHeaders() }
    );
  } catch (err) {
    console.log("[RESETBOT] historial flujo:", err.response?.data || err.message);
  }

  try {
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/crm_historial_cliente?${base}&tipo=eq.remarketing_embudo`,
      { headers: supabaseHeaders() }
    );
  } catch (err) {
    console.log(
      "[RESETBOT] historial remarketing:",
      err.response?.data || err.message
    );
  }
}

/**
 * Limpia automatización completa (flujo + remarketing + sesiones) para pruebas.
 */
async function resetearFlujoLead(numero, usuarioId) {
  const num = String(numero || "").trim();
  const uid =
    usuarioId != null && usuarioId !== "" ? String(usuarioId).trim() : null;

  if (!num) return { ok: false, motivo: "sin_numero" };

  limpiarSesionIAPendiente(uid, num);

  try {
    const { resetearEmbudoLeadParaResetbot } = require("./remarketingGlobal/embudoMode");
    await resetearEmbudoLeadParaResetbot(uid, num);
  } catch (err) {
    console.log("[RESETBOT] embudo:", err.message);
  }

  try {
    const { resetRemarketingLeadPorResetbot } = require("./remarketingGlobal/remarketingRepository");
    await resetRemarketingLeadPorResetbot(num, uid);
  } catch (err) {
    console.log("[RESETBOT] remarketing programados:", err.message);
  }

  await cancelarSeguimientosPendientesLead(num, uid);
  await limpiarHistorialAutomatizacionLead(num, uid);

  try {
    await enviarTextoWhatsApp(num, MENSAJE_CONFIRMACION, {
      usuarioId: uid,
      _soloEnvioMeta: true,
    });
  } catch (err) {
    console.log("[RESETBOT] WhatsApp confirmación:", err.message || err);
  }

  console.log("[RESETBOT] reset completo OK | lead:", num, "| usuario:", uid);
  return { ok: true };
}

module.exports = {
  esComandoResetFlujo,
  resetearFlujoLead,
  MENSAJE_CONFIRMACION,
};
