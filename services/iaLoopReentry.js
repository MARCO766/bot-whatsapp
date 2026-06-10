/**
 * Bucle conversacional controlado para nodos IA reentrables.
 * Cuando un sub-flujo (contenido, etc.) vuelve al mismo nodo IA,
 * NO re-ejecutar IA con el mensaje anterior — guardar sesión y esperar.
 */

const { detectarTipoNodo } = require("./seguimiento/detectarTipoNodo");
const { parseIAFromNodo, esConfigRouterLocal } = require("./aiService");
const { guardarSesionIAPendiente, logChatHistorySource } = require("./iaFlowSession");

function esNodoIAReentrable(nodo) {
  if (!nodo) return false;
  const tipo = detectarTipoNodo(nodo);
  if (tipo === "openai_agent" || tipo === "ia_pro") return true;
  if (tipo === "ia") {
    return esConfigRouterLocal(parseIAFromNodo(nodo));
  }
  return false;
}

function prepararFlowContextReentrada(flowContext) {
  const ctx = { ...(flowContext || {}) };
  ctx.ultimo_mensaje = "";
  ctx.ultimoMensaje = "";
  ctx.mensaje = "";
  ctx.texto = "";
  ctx.body = "";
  return ctx;
}

function manejarReentradaIALoop(payload) {
  const {
    nodo,
    nodoId,
    visitados,
    flowContext,
    usuarioId,
    numero,
    flujoId,
    conexionWhatsappId,
  } = payload;

  const tipo = detectarTipoNodo(nodo);

  console.log("[IA_LOOP_REENTRY_START]", {
    nodoId,
    tipo,
    numero,
    usuarioId,
    flujoId,
    visitados: Array.from(visitados || []),
  });

  const flowContextGuardar = prepararFlowContextReentrada(flowContext);

  logChatHistorySource(
    `ia_loop_reentry_antes_guardar:nodo=${nodoId}`,
    flowContextGuardar.chat_history
  );

  const sesion = guardarSesionIAPendiente({
    usuarioId,
    conexionWhatsappId,
    numero,
    flujoId,
    nodoId,
    visitados: Array.from(visitados || []),
    flowContext: flowContextGuardar,
    iaLoopReentry: true,
  });

  console.log("[IA_LOOP_REENTRY_WAITING]", {
    nodoId,
    tipo,
    numero,
    sesionGuardada: !!sesion,
  });

  if (sesion) {
    console.log("[IA_LOOP_REENTRY_SESSION_SAVED]", {
      nodoId,
      tipo,
      numero,
      flujoId,
    });
  }

  return { handled: true, sesionGuardada: !!sesion };
}

module.exports = {
  esNodoIAReentrable,
  prepararFlowContextReentrada,
  manejarReentradaIALoop,
};
