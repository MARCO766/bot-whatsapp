/**
 * FASE 2 — Pruebas de threading CTWA Ad ID (sin routing).
 * Ejecutar: node scripts/test-ctwa-ad-id-thread.js
 *
 * No hay harness HTTP/runtime completo para webhook→flowService.
 * Estas pruebas cubren extracción + paso de opts hasta el shape que
 * recibe resolverActivadorEntrante (vía buscarYEjecutarActivador spread).
 */
const {
  extractCtwaAdIdFromMessage,
  normalizeCtwaAdId,
} = require("../services/ctwaAdIdThread");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let passed = 0;
function check(name, cond) {
  assert(cond, name);
  passed += 1;
  console.log("OK:", name);
}

// --- 1. CTWA con source_id ---
check(
  "1. source_id string → extract",
  extractCtwaAdIdFromMessage({
    referral: { source_id: "120251260803260234" },
  }) === "120251260803260234"
);
check(
  "1. source_id number (safe int) → string",
  extractCtwaAdIdFromMessage({
    referral: { source_id: 123456789 },
  }) === "123456789"
);

// Simula el opts que webhook agrega y buscarYEjecutarActivador reenvía:
// resolverActivadorEntrante(texto, uid, conn, { ...matchOpts, clienteNumero })
function simulateThreadToResolver(message, matchOptsBase = {}) {
  const ctwaAdId = extractCtwaAdIdFromMessage(message);
  const matchOpts = { ...matchOptsBase, ctwaAdId };
  const resolverOpts = { ...matchOpts, clienteNumero: "56912345678" };
  return normalizeCtwaAdId(resolverOpts.ctwaAdId);
}

check(
  "1. threading llega a shape de resolverActivadorEntrante",
  simulateThreadToResolver({
    referral: { source_id: "120251260803260234" },
  }) === "120251260803260234"
);

// --- 2. Sin referral ---
check(
  "2. sin referral → undefined",
  extractCtwaAdIdFromMessage({ type: "text", text: { body: "hola" } }) ===
    undefined
);
check(
  "2. message null → undefined",
  extractCtwaAdIdFromMessage(null) === undefined
);
check(
  "2. threading sin referral → undefined en resolver",
  simulateThreadToResolver({ type: "text" }) === undefined
);

// --- 3. source_id vacío / ausente ---
check(
  "3. referral sin source_id → undefined",
  extractCtwaAdIdFromMessage({ referral: { source_type: "ad" } }) === undefined
);
check(
  "3. source_id '' → undefined",
  extractCtwaAdIdFromMessage({ referral: { source_id: "" } }) === undefined
);
check(
  "3. source_id solo espacios → undefined",
  extractCtwaAdIdFromMessage({ referral: { source_id: "   " } }) === undefined
);
check(
  "3. normalizeCtwaAdId('') → undefined",
  normalizeCtwaAdId("") === undefined
);
check(
  "3. normalizeCtwaAdId(null) → undefined",
  normalizeCtwaAdId(null) === undefined
);

// --- 4. Selección no cambia: ctwaAdId es opt extra; matchActivador solo lee esPrimerMensaje ---
const { matchActivador } = require("../services/activadorUtils");
const activadorPalabra = {
  tipo_activador: "palabra_unica",
  frase: "hola",
  coincidencia: "contiene",
};
const matchSin = matchActivador("hola mundo", activadorPalabra, {
  esPrimerMensaje: false,
});
const matchCon = matchActivador("hola mundo", activadorPalabra, {
  esPrimerMensaje: false,
  ctwaAdId: "120251260803260234",
});
check(
  "4. matchActivador idéntico con/sin ctwaAdId",
  matchSin.matched === matchCon.matched &&
    matchSin.tipo === matchCon.tipo &&
    matchSin.detalle === matchCon.detalle
);

const matchPrimerSin = matchActivador("x", {
  tipo_activador: "primer_mensaje",
  frase: "*",
}, { esPrimerMensaje: true });
const matchPrimerCon = matchActivador("x", {
  tipo_activador: "primer_mensaje",
  frase: "*",
}, { esPrimerMensaje: true, ctwaAdId: "999" });
check(
  "4. primer_mensaje idéntico con/sin ctwaAdId",
  matchPrimerSin.matched === true &&
    matchPrimerCon.matched === true &&
    matchPrimerSin.tipo === matchPrimerCon.tipo
);

// Otras opts del threading no se pierden
check(
  "4. esPrimerMensaje se conserva al threadear",
  (() => {
    const opts = {
      esPrimerMensaje: true,
      ctwaAdId: extractCtwaAdIdFromMessage({
        referral: { source_id: "1" },
      }),
    };
    return opts.esPrimerMensaje === true && opts.ctwaAdId === "1";
  })()
);

console.log(`\nTodas las pruebas OK (${passed})`);
console.log(
  "Nota: no hay harness e2e webhook→resolver; threading verificado por extract + spread de opts."
);
