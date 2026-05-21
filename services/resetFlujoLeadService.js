/**
 * Reset aislado de automatización por lead (comando resetbot).
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

  console.log("[RESETBOT DEBUG] limpiando tabla seguimientos_programados");

  const ahora = new Date().toISOString();
  const estadosIn = "pendiente,enviado,cancelado,respondido";
  let url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?cliente_numero=eq.${encodeURIComponent(numero)}` +
    `&estado=in.(${estadosIn})`;
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
    console.log("[RESETBOT DEBUG] seguimientos:", err.response?.data || err.message);
  }
}

async function resetearFlujoLead(numero, usuarioId) {
  const num = String(numero || "").trim();
  const uid =
    usuarioId != null && usuarioId !== "" ? String(usuarioId).trim() : null;

  if (!num) return { ok: false, motivo: "sin_numero" };

  try {
    const { resetearEmbudoLeadParaResetbot } = require("./remarketingGlobal/embudoMode");
    await resetearEmbudoLeadParaResetbot(uid, num);
  } catch (err) {
    console.log("[RESETBOT DEBUG] embudo:", err.message);
  }

  try {
    const { resetRemarketingLeadPorResetbot } = require("./remarketingGlobal/remarketingRepository");
    console.log("[RESETBOT DEBUG] limpiando tabla remarketing_global_programados");
    await resetRemarketingLeadPorResetbot(num, uid);
  } catch (err) {
    console.log("[RESETBOT DEBUG] remarketing programados:", err.message);
  }

  await cancelarSeguimientosPendientesLead(num, uid);

  limpiarSesionIAPendiente(uid, num);

  try {
    await enviarTextoWhatsApp(num, MENSAJE_CONFIRMACION, {
      usuarioId: uid,
      _soloEnvioMeta: true,
    });
  } catch (err) {
    console.log("[RESETBOT DEBUG] WhatsApp confirmación:", err.message || err);
  }

  return { ok: true };
}

module.exports = {
  esComandoResetFlujo,
  resetearFlujoLead,
  MENSAJE_CONFIRMACION,
};
