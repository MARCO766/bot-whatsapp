/**
 * Reset aislado de automatización por lead (comando resetbot).
 * No borra mensajes, conversaciones, clientes ni etiquetas.
 */

const axios = require("axios");
const { limpiarSesionIAPendiente } = require("./iaFlowSession");
const { limpiarLastReplies: limpiarLastRepliesPro } = require("./iaProService");
const {
  limpiarLastReplies: limpiarLastRepliesOpenAI,
} = require("./openaiAgentService");
const { enviarTextoWhatsApp } = require("./whatsappService");
const {
  cancelarRemarketing24hPorResetbot,
} = require("./remarketing24h/remarketing24hService");
const repoRm24h = require("./remarketing24h/remarketing24hRepository");
const {
  obtenerContextoRemarketingPostEnvio,
} = require("./remarketing24h/rmContextPostEnvio");
const { leerRmContextPolicyDesdeSnapshot } = require("./remarketing24h/rmContextPolicy");
const {
  cancelarEsperaLectorPagoPorResetbot,
} = require("./lectorPagoService");

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

async function cancelarSeguimientosPendientesLead(
  numero,
  usuarioId,
  conexionWhatsappId
) {
  const conexionId = normalizarConexionIdReset(conexionWhatsappId);
  if (!SUPABASE_URL || !SUPABASE_KEY || !numero || !usuarioId || !conexionId) {
    if (numero && usuarioId && !conexionId) {
      console.log(
        "[IA_MULTI] resetbot omitido seguimientos — sin conexion_whatsapp_id",
        { lead: numero, usuario: usuarioId }
      );
    }
    return;
  }

  const ahora = new Date().toISOString();
  let url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?cliente_numero=eq.${encodeURIComponent(numero)}` +
    `&estado=eq.pendiente&usuario_id=eq.${encodeURIComponent(usuarioId)}` +
    `&conexion_whatsapp_id=eq.${encodeURIComponent(conexionId)}`;

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

async function limpiarHistorialFlujoLead(numero, usuarioId, conexionWhatsappId) {
  const conexionId = normalizarConexionIdReset(conexionWhatsappId);
  if (!SUPABASE_URL || !SUPABASE_KEY || !numero || !usuarioId || !conexionId) {
    if (numero && usuarioId && !conexionId) {
      console.log(
        "[IA_MULTI] resetbot omitido historial flujo — sin conexion_whatsapp_id",
        { lead: numero, usuario: usuarioId }
      );
    }
    return;
  }

  try {
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/crm_historial_cliente?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${encodeURIComponent(usuarioId)}&tipo=eq.flujo&conexion_whatsapp_id=eq.${encodeURIComponent(conexionId)}`,
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

/** Diagnóstico temporal: estado RM que ve resetbot vs guard post-envío. */
async function snapshotEstadoRmResetbotDebug(usuarioId, clienteNumero, conexionWhatsappId) {
  const uid =
    usuarioId != null && usuarioId !== "" ? String(usuarioId).trim() : null;
  const num =
    clienteNumero != null && String(clienteNumero).trim() !== ""
      ? String(clienteNumero).trim()
      : null;
  const conexionId = normalizarConexionIdReset(conexionWhatsappId);

  if (!uid || !num) {
    return { omitido: "sin_usuario_o_cliente" };
  }
  if (!conexionId) {
    return { omitido: "sin_conexion_whatsapp_id" };
  }

  const params = {
    usuario_id: uid,
    cliente_numero: num,
    conexion_whatsapp_id: conexionId,
  };

  let filaPostEnvioGuard = null;
  let filasVivasResetbotScope = [];
  let rmContextGuard = null;

  try {
    const fila = await repoRm24h.buscarUltimaPostEnvio(params);
    if (fila) {
      const policy = leerRmContextPolicyDesdeSnapshot(fila.config_snapshot);
      filaPostEnvioGuard = {
        id: fila.id,
        estado: fila.estado,
        activo: fila.activo,
        motivo_cancelacion: fila.motivo_cancelacion,
        disparado_en: fila.disparado_en,
        flujo_id: fila.flujo_id,
        policy_mode: policy?.mode,
      };
    }
  } catch (err) {
    filaPostEnvioGuard = { error: err.response?.data || err.message };
  }

  try {
    filasVivasResetbotScope = (await repoRm24h.listarReinicioPorCliente(
      uid,
      num,
      conexionId
    )).map((f) => ({
      id: f.id,
      estado: f.estado,
      activo: f.activo,
      motivo_cancelacion: f.motivo_cancelacion,
      disparado_en: f.disparado_en,
      flujo_id: f.flujo_id,
    }));
  } catch (err) {
    filasVivasResetbotScope = [{ error: err.response?.data || err.message }];
  }

  try {
    const ctx = await obtenerContextoRemarketingPostEnvio({
      usuarioId: uid,
      clienteNumero: num,
      conexionWhatsappId: conexionId,
    });
    rmContextGuard = ctx
      ? {
          bloquearActivadores: ctx.bloquearActivadores,
          flujo_id: ctx.flujo_id,
          policy_mode: ctx.policy?.mode,
          rm24h_id: ctx.fila?.id,
          fila_estado: ctx.fila?.estado,
          fila_motivo: ctx.fila?.motivo_cancelacion,
        }
      : null;
  } catch (err) {
    rmContextGuard = { error: err.response?.data || err.message };
  }

  return {
    fila_post_envio_usada_por_guard: filaPostEnvioGuard,
    filas_vivas_que_resetbot_puede_tocar: filasVivasResetbotScope,
    obtenerContextoRemarketingPostEnvio: rmContextGuard,
  };
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

  await limpiarHistorialFlujoLead(num, uid, conexionId);

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

  console.log(
    `[RESET_FLUJO_LEAD] numero=${num} usuarioId=${uid} conexionWhatsappId=${conexionId}`
  );

  if (conexionId) {
    limpiarSesionIAPendiente(uid, conexionId, num);
    limpiarLastRepliesPro(uid, conexionId, num);
    limpiarLastRepliesOpenAI(uid, conexionId, num);
  } else {
    console.log(
      "[RM24H_MULTI] resetbot omitido sesión IA — sin conexion_whatsapp_id",
      { lead: num, usuario: uid }
    );
  }

  if (uid) {
    try {
      const estadoRmAntes = await snapshotEstadoRmResetbotDebug(uid, num, conexionId);
      console.log("[RM_RESETBOT_DEBUG] before_reset", {
        numero: num,
        usuarioId: uid,
        conexionWhatsappId: conexionId,
        funciones: [
          "invalidarPostEnvioPorResetbot",
          "cancelarRemarketing24hPorResetbot",
        ],
        estadoRM: estadoRmAntes,
      });

      const filaPostEnvioInvalidada = await repoRm24h.invalidarPostEnvioPorResetbot({
        usuario_id: uid,
        cliente_numero: num,
        conexion_whatsapp_id: conexionId,
      });

      const filasCanceladas = await cancelarRemarketing24hPorResetbot({
        usuario_id: uid,
        cliente_numero: num,
        conexion_whatsapp_id: conexionId,
      });

      const estadoRmDespues = await snapshotEstadoRmResetbotDebug(uid, num, conexionId);
      console.log("[RM_RESETBOT_DEBUG] after_reset", {
        numero: num,
        usuarioId: uid,
        conexionWhatsappId: conexionId,
        fila_post_envio_invalidada: filaPostEnvioInvalidada
          ? {
              id: filaPostEnvioInvalidada.id,
              estado: filaPostEnvioInvalidada.estado,
              activo: filaPostEnvioInvalidada.activo,
              motivo_cancelacion: filaPostEnvioInvalidada.motivo_cancelacion,
            }
          : null,
        filas_vivas_actualizadas_por_resetbot: filasCanceladas.length,
        filas_resetbot_detalle: filasCanceladas.map((f) => ({
          id: f.id,
          estado: f.estado,
          activo: f.activo,
          motivo_cancelacion: f.motivo_cancelacion,
          disparado_en: f.disparado_en,
        })),
        estadoRM: estadoRmDespues,
      });
    } catch (err) {
      console.log(
        "[RESETBOT_RM24H] error:",
        err.response?.data || err.message
      );
      console.log("[RM_RESETBOT_DEBUG] error", err.response?.data || err.message);
    }
  }

  if (uid) {
    try {
      await cancelarEsperaLectorPagoPorResetbot({
        usuarioId: uid,
        clienteNumero: num,
        conexionWhatsappId: conexionId,
      });
    } catch (err) {
      console.log(
        "[LECTOR_PAGO_RESETBOT] error:",
        err.response?.data || err.message
      );
    }
  }

  await cancelarSeguimientosPendientesLead(num, uid, conexionId);
  await limpiarHistorialFlujoLead(num, uid, conexionId);

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
