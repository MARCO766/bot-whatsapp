/**
 * Prueba: detector de afirmaciones cortas sin OpenAI.
 * Ejecutar: node scripts/test-openai-short-confirmation.js
 */

const {
  resolverShortConfirmation,
  esMensajeAfirmativoCorto,
  esMensajeNegativo,
} = require("../services/openaiShortConfirmation");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const configBase = {
  caminos: [
    { id: "qr", nombre: "QR", enabled: true },
    { id: "deposito", nombre: "Depósito", enabled: true },
    { id: "testimonios", nombre: "Testimonios", enabled: true },
    { id: "muestras", nombre: "Muestras", enabled: true },
  ],
};

function historial(ultimoBot) {
  return [{ role: "assistant", text: ultimoBot }];
}

// Caso QR
let r = resolverShortConfirmation(
  configBase,
  "sí",
  historial("¿Te envío el QR de pago?")
);
assert(r?.action === "route", "QR: debe ser route");
assert(r?.routeId === "qr", "QR: routeId debe ser qr");
assert(r?.source === "openai-short-confirmation", "QR: source correcto");

// Caso depósito
r = resolverShortConfirmation(
  configBase,
  "ok",
  historial("¿Prefieres depósito?")
);
assert(r?.action === "route", "depósito: debe ser route");
assert(r?.routeId === "deposito", "depósito: routeId debe ser deposito");

// Caso ambiguo
r = resolverShortConfirmation(
  configBase,
  "sí",
  historial("¿Qué quieres saber?")
);
assert(r === null, "ambiguo: no debe disparar ruta");

// Caso negativo
r = resolverShortConfirmation(
  configBase,
  "no",
  historial("¿Te envío el QR?")
);
assert(r === null, "negativo: no debe disparar ruta");
assert(esMensajeNegativo("no"), "no debe ser negativo");

// Afirmativos reconocidos
for (const msg of ["si", "sí", "ok", "dale", "claro", "perfecto", "está bien", "de acuerdo", "envíalo", "pásamelo", "mándamelo"]) {
  assert(esMensajeAfirmativoCorto(msg), `afirmativo: ${msg}`);
}

// Mensaje largo no afirmativo
assert(!esMensajeAfirmativoCorto("sí quiero saber más sobre el producto"), "mensaje largo no afirmativo");

// Oferta ambigua (QR y depósito)
r = resolverShortConfirmation(
  configBase,
  "sí",
  historial("¿Prefieres QR o depósito?")
);
assert(r === null, "oferta ambigua: no debe disparar ruta");

console.log("✅ test-openai-short-confirmation: todos los casos OK");
