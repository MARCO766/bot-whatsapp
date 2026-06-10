/**
 * Prueba unitaria del patrón Contenido → OpenAI repetible.
 * Ejecutar: node scripts/test-ia-loop-reentry.js
 */

const {
  sanitizarVisitadosSesionIALoop,
  esEtiquetaRutaIA,
  debePermitirRevisitaEnBucleIA,
  esNodoIAReentrable,
} = require("../services/iaLoopReentry");

const NODOS = [
  { id: "nodo_inicio", type: "inicio" },
  { id: "openai_1", type: "openai_agent" },
  { id: "content_qr", type: "contenido" },
  { id: "content_deposito", type: "contenido" },
  { id: "content_producto", type: "contenido" },
];

const CONEXIONES = [
  { desde: "nodo_inicio", hasta: "openai_1" },
  { desde: "openai_1", hasta: "content_qr", sourceHandle: "qr" },
  { desde: "openai_1", hasta: "content_deposito", sourceHandle: "deposito" },
  { desde: "openai_1", hasta: "content_producto", sourceHandle: "pago" },
  { desde: "content_qr", hasta: "openai_1" },
  { desde: "content_deposito", hasta: "openai_1" },
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Ciclo 1: qr → content_qr → openai (reentry)
let visitados = new Set(["nodo_inicio", "openai_1", "content_qr"]);
let sanitizados = sanitizarVisitadosSesionIALoop(visitados, "openai_1", CONEXIONES);
assert(
  JSON.stringify(sanitizados) === JSON.stringify(["nodo_inicio"]),
  `sesión ciclo 1: esperado [nodo_inicio], got ${JSON.stringify(sanitizados)}`
);

// Ciclo 2: resume con sesión sanitizada, deposito → content_deposito → openai
visitados = new Set(sanitizados);
visitados.add("openai_1");
visitados.add("content_deposito");
sanitizados = sanitizarVisitadosSesionIALoop(visitados, "openai_1", CONEXIONES);
assert(
  JSON.stringify(sanitizados) === JSON.stringify(["nodo_inicio"]),
  `sesión ciclo 2: esperado [nodo_inicio], got ${JSON.stringify(sanitizados)}`
);

// Ciclo 3: qr otra vez — content_qr NO debe estar en visitados de sesión
visitados = new Set(sanitizados);
visitados.add("openai_1");
assert(
  !visitados.has("content_qr"),
  "content_qr no debe bloquear en ciclo 3 (no está en visitados de sesión)"
);

// Simular ruta IA con visitados sucios del mismo mensaje (defensa en continuarASiguientes)
visitados = new Set(["nodo_inicio", "openai_1", "content_qr", "content_deposito"]);
const targetQr = "content_qr";
const visitadosRuta = new Set(visitados);
if (esEtiquetaRutaIA("openai_agent") && visitadosRuta.has(targetQr)) {
  visitadosRuta.delete(targetQr);
}
assert(
  !visitadosRuta.has("content_qr"),
  "ruta IA qr debe desbloquear content_qr aunque ya fue visitado"
);

// Revisita contenido en bucle IA activo
visitados = new Set(["nodo_inicio", "openai_1", "content_qr"]);
assert(
  debePermitirRevisitaEnBucleIA(visitados, "content_qr", NODOS),
  "debe permitir re-visita de content_qr con bucle IA activo"
);

assert(esNodoIAReentrable(NODOS[1]), "openai_agent es reentrable");

console.log("✅ test-ia-loop-reentry: todos los casos OK");
