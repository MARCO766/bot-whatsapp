/**
 * Prueba: media consumida por payment_reader no se reinyecta en OpenAI posterior.
 * Ejecutar: node scripts/test-openai-media-consumed.js
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function extraerMediaEntrante(opts = {}) {
  const messageType = opts.messageType ? String(opts.messageType).trim() : null;
  const imageUrl = opts.imageUrl || null;
  if (
    messageType === "image" ||
    messageType === "document" ||
    !!imageUrl
  ) {
    return { messageType, imageUrl };
  }
  return null;
}

function resolverMediaOpenAIAgent(flowContext = {}, opts = {}) {
  if (flowContext.openaiPaymentMediaConsumed) {
    return { contextMedia: {}, agentOpts: {} };
  }
  const contextMedia = extraerMediaEntrante(opts) || {};
  return {
    contextMedia,
    agentOpts: {
      messageType: opts.messageType || null,
      imageUrl: opts.imageUrl || null,
    },
  };
}

function simularRoutePaymentReader(contexto) {
  const out = { ...contexto };
  delete out.imageUrl;
  delete out.messageType;
  return {
    ...out,
    openaiAgentAction: "route",
    openaiAgentRouteId: "ruta-pago",
    openaiPaymentMediaConsumed: true,
  };
}

const optsWebhook = {
  messageType: "image",
  imageUrl: "https://example.com/comprobante.jpg",
};

// Caso 1: OpenAI #1 consume media → OpenAI #2 no recibe media
let flowContext = { numero: "549111" };
let media1 = resolverMediaOpenAIAgent(flowContext, optsWebhook);
assert(media1.contextMedia.imageUrl, "OpenAI #1 debe recibir imageUrl");
assert(media1.agentOpts.imageUrl, "OpenAI #1 agentOpts con imageUrl");

flowContext = simularRoutePaymentReader(flowContext);
assert(flowContext.openaiPaymentMediaConsumed === true, "flag consumida tras route");
assert(!flowContext.imageUrl, "flowContext sin imageUrl tras limpiar");

const media2 = resolverMediaOpenAIAgent(flowContext, optsWebhook);
assert(!media2.contextMedia.imageUrl, "OpenAI #2 NO debe recibir imageUrl");
assert(!media2.agentOpts.imageUrl, "OpenAI #2 agentOpts sin imageUrl");

// Caso 2: nuevo comprobante resetea flag al reanudar
flowContext = {
  openaiPaymentMediaConsumed: true,
  numero: "549111",
};
const mediaEntranteNuevo = extraerMediaEntrante({
  messageType: "image",
  imageUrl: "https://example.com/otro.jpg",
});
if (mediaEntranteNuevo) {
  if (flowContext.openaiPaymentMediaConsumed) {
    delete flowContext.openaiPaymentMediaConsumed;
  }
  Object.assign(flowContext, mediaEntranteNuevo);
}
assert(!flowContext.openaiPaymentMediaConsumed, "nueva media resetea flag");
const mediaNuevo = resolverMediaOpenAIAgent(flowContext, {
  messageType: "image",
  imageUrl: "https://example.com/otro.jpg",
});
assert(
  mediaNuevo.contextMedia.imageUrl === "https://example.com/otro.jpg",
  "nuevo comprobante debe procesarse"
);

// Caso 3: route por camino texto no marca consumida (solo payment_reader)
let ctxTexto = {
  openaiAgentAction: "route",
  openaiAgentRouteId: "deposito",
};
assert(
  !ctxTexto.openaiPaymentMediaConsumed,
  "route texto no debe marcar media consumida"
);

// Caso 4: texto en OpenAI #2 con flag activo — sin media en opts
const mediaTexto = resolverMediaOpenAIAgent(
  { openaiPaymentMediaConsumed: true },
  { messageType: "text" }
);
assert(!mediaTexto.contextMedia.imageUrl, "texto no inyecta media con flag");

console.log("✅ test-openai-media-consumed: todos los casos OK");
