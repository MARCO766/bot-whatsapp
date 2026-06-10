/**
 * Bucle conversacional controlado para nodos IA reentrables.
 * Cuando un sub-flujo (contenido, etc.) vuelve al mismo nodo IA,
 * NO re-ejecutar IA con el mensaje anterior — guardar sesión y esperar.
 */

const { detectarTipoNodo } = require("./seguimiento/detectarTipoNodo");
const { parseIAFromNodo, esConfigRouterLocal } = require("./aiService");
const { guardarSesionIAPendiente, logChatHistorySource } = require("./iaFlowSession");
const { limpiarRutasContexto } = require("./openaiAgentService");

const ETIQUETAS_RUTA_IA = new Set(["openai_agent", "ia_pro", "ia"]);

const TIPOS_NODO_BLOQUEADOS_REVISITA = new Set([
  "inicio",
  "conversion",
  "remarketing_global",
  "seguimiento",
  "seguimiento_crm_v2",
  "lector_pago",
]);

function esNodoIAReentrable(nodo) {
  if (!nodo) return false;
  const tipo = detectarTipoNodo(nodo);
  if (tipo === "openai_agent" || tipo === "ia_pro") return true;
  if (tipo === "ia") {
    return esConfigRouterLocal(parseIAFromNodo(nodo));
  }
  return false;
}

function esEtiquetaRutaIA(etiqueta) {
  return ETIQUETAS_RUTA_IA.has(etiqueta);
}

function idConexionDesde(c) {
  return c?.desde || c?.from || c?.source || null;
}

function idConexionHasta(c) {
  return c?.hasta || c?.to || c?.target || c?.targetNode || c?.target_node_id || null;
}

function hijosDirectosIANodo(nodoIAId, conexiones) {
  const hijos = new Set();
  for (const c of conexiones || []) {
    if (idConexionDesde(c) === nodoIAId) {
      const hasta = idConexionHasta(c);
      if (hasta) hijos.add(hasta);
    }
  }
  return hijos;
}

function sanitizarVisitadosSesionIALoop(visitados, nodoIAId, conexiones) {
  const limpio = new Set(visitados || []);
  limpio.delete(nodoIAId);
  for (const hijo of hijosDirectosIANodo(nodoIAId, conexiones)) {
    limpio.delete(hijo);
  }
  return Array.from(limpio);
}

function hayBucleIAActivo(visitados, nodos) {
  for (const id of visitados || []) {
    const n = (nodos || []).find((x) => x.id === id);
    if (n && esNodoIAReentrable(n)) return id;
  }
  return null;
}

function debePermitirRevisitaEnBucleIA(visitados, nodoId, nodos) {
  if (!visitados?.has?.(nodoId)) return false;
  if (!hayBucleIAActivo(visitados, nodos)) return false;

  const nodo = (nodos || []).find((n) => n.id === nodoId);
  if (!nodo || esNodoIAReentrable(nodo)) return false;

  const tipo = detectarTipoNodo(nodo);
  return !TIPOS_NODO_BLOQUEADOS_REVISITA.has(tipo);
}

function prepararFlowContextReentrada(flowContext) {
  const ctx = limpiarRutasContexto({ ...(flowContext || {}) });
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
    conexiones,
  } = payload;

  const tipo = detectarTipoNodo(nodo);
  const visitadosSanitizados = sanitizarVisitadosSesionIALoop(
    visitados,
    nodoId,
    conexiones
  );

  console.log("[IA_LOOP_REENTRY_START]", {
    nodoId,
    tipo,
    numero,
    usuarioId,
    flujoId,
    visitados: Array.from(visitados || []),
    visitadosSanitizados,
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
    visitados: visitadosSanitizados,
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
      visitados: visitadosSanitizados,
    });
  }

  return { handled: true, sesionGuardada: !!sesion };
}

module.exports = {
  esNodoIAReentrable,
  esEtiquetaRutaIA,
  sanitizarVisitadosSesionIALoop,
  hayBucleIAActivo,
  debePermitirRevisitaEnBucleIA,
  prepararFlowContextReentrada,
  manejarReentradaIALoop,
};
