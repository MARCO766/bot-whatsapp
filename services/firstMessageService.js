/**
 * Detección de "Primer mensaje" por línea WhatsApp.
 *
 * Nueva semántica (Fase 4):
 *   Primer mensaje = no hay flow_session que todavía bloquee el reingreso.
 *
 * Compatibilidad leads antiguos (sin flow_session):
 *   se conserva la lógica por historial de mensajes entrantes.
 */
const axios = require("axios");
const {
  obtenerSesion,
  STATUS_DEFAULT,
  STATUS_FINISHED,
  STATUS_CANCELLED,
  STATUS_EXPIRED,
} = require("./flowSessionService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function supabaseHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

function normalizarId(valor) {
  if (valor == null || String(valor).trim() === "") return null;
  return String(valor).trim();
}

function textoStatus(valor) {
  if (valor == null) return null;
  const s = String(valor).trim().toLowerCase();
  return s !== "" ? s : null;
}

function expiresAtYaVencio(expiresAt) {
  if (expiresAt == null || String(expiresAt).trim() === "") return false;
  const ms = new Date(expiresAt).getTime();
  if (!Number.isFinite(ms)) return false;
  return ms <= Date.now();
}

/**
 * ¿La sesión más reciente todavía bloquea reingreso por "Primer mensaje"?
 * - expired / cancelled → no bloquea
 * - active / finished con expires_at ya vencido → no bloquea (equivalente a expired; Phase 3)
 * - active / finished con ventana vigente o sin expires_at → bloquea
 */
function sesionBloqueaReingreso(sesion) {
  const status = textoStatus(sesion?.status);

  if (status === STATUS_EXPIRED || status === STATUS_CANCELLED) {
    return false;
  }

  if (status === STATUS_DEFAULT || status === STATUS_FINISHED) {
    if (expiresAtYaVencio(sesion.expires_at)) {
      return false;
    }
    return true;
  }

  // Status desconocido: no abrir primer mensaje por seguridad.
  return true;
}

/**
 * Lógica histórica: primer mensaje absoluto = sin mensajes entrantes previos.
 * @returns {Promise<{ esPrimerMensaje: boolean, motivo: string }>}
 */
async function calcularPorHistorialMensajes(usuarioId, clienteNumero, conexionWhatsappId) {
  const url =
    `${SUPABASE_URL}/rest/v1/mensajes?usuario_id=eq.${encodeURIComponent(usuarioId)}` +
    `&cliente_numero=eq.${encodeURIComponent(clienteNumero)}` +
    `&conexion_whatsapp_id=eq.${encodeURIComponent(conexionWhatsappId)}` +
    `&direccion=eq.entrante` +
    `&select=id` +
    `&limit=1`;

  const res = await axios.get(url, { headers: supabaseHeaders() });
  const existeHistorial = Boolean(res.data?.[0]);

  return {
    esPrimerMensaje: !existeHistorial,
    motivo: existeHistorial ? "historial_existente" : "historial_vacio",
  };
}

/**
 * @returns {Promise<{ esPrimerMensaje: boolean, motivo: string }>}
 */
async function calcularEsPrimerMensaje(usuarioId, clienteNumero, conexionWhatsappId) {
  const uid = normalizarId(usuarioId);
  const num = normalizarId(clienteNumero);
  const conn = normalizarId(conexionWhatsappId);

  if (!uid || !num || !conn || !SUPABASE_URL || !SUPABASE_KEY) {
    return { esPrimerMensaje: false, motivo: "datos_incompletos" };
  }

  try {
    const sesion = await obtenerSesion({
      usuarioId: uid,
      conexionWhatsappId: conn,
      clienteNumero: num,
    });

    // Sin flow_session → compatibilidad: historial de mensajes (leads antiguos).
    if (!sesion) {
      return calcularPorHistorialMensajes(uid, num, conn);
    }

    const status = textoStatus(sesion.status);
    const bloquea = sesionBloqueaReingreso(sesion);

    if (bloquea) {
      const motivo =
        status === STATUS_DEFAULT
          ? "sesion_active"
          : status === STATUS_FINISHED
            ? "sesion_finished"
            : "sesion_bloquea_reingreso";
      return { esPrimerMensaje: false, motivo };
    }

    const motivo =
      status === STATUS_EXPIRED
        ? "sesion_expired"
        : status === STATUS_CANCELLED
          ? "sesion_cancelled"
          : expiresAtYaVencio(sesion.expires_at)
            ? "sesion_expires_at_vencido"
            : "sesion_permite_reingreso";

    return { esPrimerMensaje: true, motivo };
  } catch (err) {
    console.log(
      "[FIRST_MESSAGE_CHECK] error:",
      err.response?.data || err.message
    );
    return { esPrimerMensaje: false, motivo: "error_consulta" };
  }
}

module.exports = {
  calcularEsPrimerMensaje,
};
