/**
 * Indicador oficial de escritura WhatsApp Cloud API (typing_indicator).
 * Independiente del envío de mensajes y del Socket.IO TYPING del CRM.
 *
 * Contrato Meta (Cloud API):
 * POST /{phone-number-id}/messages
 * {
 *   messaging_product: "whatsapp",
 *   status: "read",
 *   message_id: "<wamid entrante>",
 *   typing_indicator: { type: "text" }
 * }
 * Efecto: también marca el mensaje entrante (y anteriores del hilo) como leídos.
 * El indicador se oculta al responder o tras ~25s.
 *
 * Nunca lanza: errores/timeouts se tragan y se registran sin token.
 */

const axios = require("axios");
const { getConexionPorId } = require("./conexionesWhatsappService");

const GRAPH_VERSION = "v19.0";
const DEFAULT_TIMEOUT_MS = 2500;

function logTyping(msg, extra) {
  if (extra !== undefined) console.log(`[WA_TYPING] ${msg}`, extra);
  else console.log(`[WA_TYPING] ${msg}`);
}

function redactMessageId(messageId) {
  const s = String(messageId || "");
  if (s.length <= 20) return s ? `${s.slice(0, 8)}…` : null;
  return `${s.slice(0, 16)}…`;
}

/**
 * @param {object} params
 * @param {string} [params.messageId] wamid entrante
 * @param {string} [params.usuarioId]
 * @param {string} [params.conexionWhatsappId]
 * @param {string} [params.token] opcional si ya se resolvió
 * @param {string} [params.phoneId] phone_number_id opcional
 * @param {boolean} params.habilitado debe ser === true
 * @param {number} [params.timeoutMs]
 * @param {object} [deps] inyección para tests
 * @returns {Promise<{ ok: boolean, skipped?: string, error?: boolean }>}
 */
async function intentarEnviarIndicadorEscritura(params = {}, deps = {}) {
  try {
    if (params.habilitado !== true) {
      return { ok: false, skipped: "disabled" };
    }

    const messageId =
      params.messageId != null && String(params.messageId).trim() !== ""
        ? String(params.messageId).trim()
        : null;
    if (!messageId) {
      logTyping("omitido — sin message_id (wamid)");
      return { ok: false, skipped: "no_message_id" };
    }

    const http = deps.axios || axios;
    const resolverConexion = deps.getConexionPorId || getConexionPorId;
    const timeoutMs =
      typeof params.timeoutMs === "number" && params.timeoutMs > 0
        ? params.timeoutMs
        : DEFAULT_TIMEOUT_MS;

    let tokenEnviar =
      params.token != null && String(params.token).trim() !== ""
        ? String(params.token).trim()
        : null;
    let phoneIdEnviar =
      params.phoneId != null && String(params.phoneId).trim() !== ""
        ? String(params.phoneId).trim()
        : null;

    if (!tokenEnviar || !phoneIdEnviar) {
      const usuarioId = params.usuarioId || null;
      const conexionWhatsappId = params.conexionWhatsappId || null;
      if (!usuarioId || !conexionWhatsappId) {
        logTyping("omitido — sin credenciales ni conexion");
        return { ok: false, skipped: "no_credentials" };
      }
      const conexion = await resolverConexion(usuarioId, conexionWhatsappId);
      tokenEnviar = conexion?.token?.trim() || null;
      phoneIdEnviar = conexion?.phone_id?.trim() || null;
    }

    if (!tokenEnviar || !phoneIdEnviar) {
      logTyping("omitido — credenciales incompletas", {
        phoneId: phoneIdEnviar || null,
        messageId: redactMessageId(messageId),
      });
      return { ok: false, skipped: "no_credentials" };
    }

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneIdEnviar}/messages`;
    await http.post(
      url,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" },
      },
      {
        headers: {
          Authorization: `Bearer ${tokenEnviar}`,
          "Content-Type": "application/json",
        },
        timeout: timeoutMs,
      }
    );

    logTyping("ok", {
      phoneId: phoneIdEnviar,
      messageId: redactMessageId(messageId),
    });
    return { ok: true };
  } catch (err) {
    const status = err.response?.status;
    const code = err.code;
    logTyping("error (no bloquea respuesta)", {
      status: status || null,
      code: code || null,
      message: err.message || null,
      messageId: redactMessageId(params.messageId),
    });
    return { ok: false, error: true };
  }
}

module.exports = {
  intentarEnviarIndicadorEscritura,
  GRAPH_VERSION,
  DEFAULT_TIMEOUT_MS,
};
