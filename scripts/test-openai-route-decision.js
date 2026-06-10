/**
 * Prueba: reply no debe continuar por ruta vieja.
 * Ejecutar: node scripts/test-openai-route-decision.js
 */

const { limpiarRutasContexto } = require("../services/openaiAgentService");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function resolverDecision(flowContext, resumeIA) {
  const accionOpenAI = flowContext.openaiAgentAction || null;
  let ctx = { ...flowContext };

  if (resumeIA && accionOpenAI !== "route") {
    const teniaRutasViejas =
      ctx.openaiAgentRouteId || ctx.iaRouteId || ctx.route || ctx.sourceHandle;
    if (teniaRutasViejas) {
      ctx = limpiarRutasContexto(ctx);
      ctx.openaiAgentAction = accionOpenAI;
    }
  }

  const routeHandle =
    accionOpenAI === "route"
      ? ctx.openaiAgentRouteId || ctx.iaRouteId || ctx.route || null
      : null;

  const debeSeguirEsperando =
    ctx.openaiAgentPausar || ctx.openaiPaymentReaderEsperando;

  const debeContinuar =
    resumeIA && accionOpenAI === "route" && !!routeHandle;

  return { accionOpenAI, routeHandle, debeContinuar, debeSeguirEsperando, ctx };
}

// Tras ruta qr, sesión con routeId viejo + reply nuevo
let ctx = {
  openaiAgentRouteId: "qr",
  iaRouteId: "qr",
  route: "qr",
  openaiAgentAction: "reply",
  openaiAgentPausar: true,
};
let d = resolverDecision(ctx, true);
assert(!d.debeContinuar, "reply no debe continuar aunque haya routeId viejo en memoria");
assert(!d.routeHandle, "reply no debe exponer routeHandle");
assert(d.debeSeguirEsperando, "reply debe quedar esperando");

// Ruta explícita
ctx = {
  openaiAgentAction: "route",
  openaiAgentRouteId: "deposito",
  openaiAgentPausar: false,
};
d = resolverDecision(ctx, true);
assert(d.debeContinuar, "action route debe continuar");
assert(d.routeHandle === "deposito", "routeHandle debe ser deposito");

// media_library
ctx = {
  openaiAgentRouteId: "qr",
  openaiAgentAction: "media_library",
  openaiAgentPausar: true,
};
d = resolverDecision(ctx, true);
assert(!d.debeContinuar, "media_library no debe continuar");
assert(!d.ctx.openaiAgentRouteId, "media_library debe limpiar routeId viejo");

console.log("✅ test-openai-route-decision: todos los casos OK");
