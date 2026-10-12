/**
 * Pruebas del Payment Reader: extracción/validación del beneficiario.
 *
 * TIPO: SIMULADAS (mocks / fixtures de lectura OCR).
 * NO llama a OpenAI Vision, NO envía imágenes, NO toca producción.
 *
 * Verifica:
 *  - Contenido del prompt Vision actualizado (instrucciones de beneficiario).
 *  - Comparación post-OCR con lecturas mock (compararPagoOpenAI / rutas).
 *
 * Ejecutar: node scripts/test-openai-payment-reader-beneficiario.js
 */

const {
  construirPromptComprobanteVision,
  PROMPT_COMPROBANTE_VISION_BASE,
  compararPagoOpenAI,
  normalizarPaymentEsperado,
  evaluarRutasPaymentReaderContraLectura,
  recolectarNombresReferenciaPayment,
} = require("../services/openaiPaymentReaderService");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertIncludes(haystack, needle, msg) {
  assert(String(haystack).includes(needle), msg);
}

function assertNotIncludes(haystack, needle, msg) {
  assert(!String(haystack).includes(needle), msg);
}

function silentEval(rutas, lectura) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return evaluarRutasPaymentReaderContraLectura(rutas, lectura);
  } finally {
    console.log = originalLog;
  }
}

const BENEFICIARIO = "Alex Moises Arias Perez";
const PAGADOR = "Natalia Alejandra Tapia Hueitra";
const OTRO_BENEFICIARIO = "Juan Carlos Mercado";

// ---------------------------------------------------------------------------
// Prompt Vision (sin API): contrato del texto que guía la extracción
// ---------------------------------------------------------------------------

{
  const base = PROMPT_COMPROBANTE_VISION_BASE;
  assertIncludes(base, "DESTINATARIO / BENEFICIARIO / RECEPTOR", "P0: campo nombre = beneficiario");
  assertIncludes(base, "Transferiste a", "P0: etiqueta MP destinatario");
  assertIncludes(base, "Recibiste de", "P0: ignorar remitente MP");
  assertIncludes(
    base,
    'Transferiste a Alex Moises Arias Perez',
    "P0: ejemplo MP con beneficiario visible"
  );
  assertIncludes(
    base,
    '"nombre":"Alex Moises Arias Perez"',
    "P0: ejemplo MP no fuerza nombre null"
  );
  assertIncludes(
    base,
    "Ejemplo solo monto/moneda visibles sin destinatario legible",
    "P0: caso sin beneficiario legible"
  );
  // El ejemplo null-only con solo monto (viejo) no debe ser el único ejemplo MP
  assertNotIncludes(
    base,
    'Ejemplo Argentina Mercado Pago: monto visible "$ 1.490"',
    "P0: eliminado ejemplo MP que enseñaba nombre:null solo con monto"
  );

  const conRef = construirPromptComprobanteVision([BENEFICIARIO]);
  assert(conRef.startsWith(base), "P0: refs = base + bloque");
  assertIncludes(
    conRef,
    "NO implica por sí sola que ese nombre deba ir en \"nombre\"",
    "P0: presencia de referencia no aprueba"
  );
  assertIncludes(
    conRef,
    "no sustituyas por un nombre de la lista",
    "P0: no forzar nombre de referencia"
  );
  assertIncludes(
    conRef,
    "Prefiere el nombre junto a una etiqueta de destinatario",
    "P0: preferir etiqueta destinatario"
  );
}

// ---------------------------------------------------------------------------
// CASO 1 — nombre esperado = beneficiario extraído → válido
// Fixture: OCR devolvió correctamente el destinatario.
// ---------------------------------------------------------------------------
{
  const esperado = normalizarPaymentEsperado({
    montoEsperado: 1600,
    monedaEsperada: "ARS",
    nombreEsperado: BENEFICIARIO,
  });
  // Mock de lectura Vision (no es llamada real)
  const lectura = {
    monto: 1600,
    moneda: "ARS",
    nombre: BENEFICIARIO,
  };
  const r = compararPagoOpenAI(esperado, lectura);
  assert(r.valido === true, "C1: beneficiario coincide → válido");
  assert(r.montoOk && r.monedaOk && r.nombreOk, "C1: monto/moneda/nombre OK");

  const ganadora = silentEval(
    [
      {
        id: "ruta_benef",
        nombre: "Pago beneficiario",
        type: "payment_reader",
        enabled: true,
        payment: {
          montoEsperado: 1600,
          monedaEsperada: "ARS",
          nombreEsperado: BENEFICIARIO,
        },
      },
    ],
    lectura
  );
  assert(ganadora?.route?.id === "ruta_benef", "C1: ruta gana con beneficiario");
}

// ---------------------------------------------------------------------------
// CASO 2 — pagador ≠ beneficiario esperado
// Si OCR pone al PAGADOR en "nombre" (error) o el beneficiario real es otro,
// no debe validarse contra el esperado.
// También: extracción correcta del beneficiario con pagador distinto en el
// comprobante se simula con lectura.nombre = beneficiario (C1).
// Aquí simulamos OCR que devolvió al pagador → rechazo.
// ---------------------------------------------------------------------------
{
  const esperado = normalizarPaymentEsperado({
    montoEsperado: 1600,
    monedaEsperada: "ARS",
    nombreEsperado: BENEFICIARIO,
  });
  const lecturaPagadorComoNombre = {
    monto: 1600,
    moneda: "ARS",
    nombre: PAGADOR, // mock: Vision confundió pagador con beneficiario
  };
  const r = compararPagoOpenAI(esperado, lecturaPagadorComoNombre);
  assert(r.valido === false, "C2: pagador ≠ esperado → inválido");
  assert(r.motivo === "nombre_no_coincide", "C2: motivo nombre_no_coincide");
  assert(r.montoOk === true && r.monedaOk === true, "C2: monto/moneda siguen OK");
  assert(r.nombreOk === false, "C2: nombreOk false");

  // Prompt debe pedir ignorar pagador/remitente
  const prompt = construirPromptComprobanteVision([BENEFICIARIO]);
  assertIncludes(prompt, "Pagador", "C2: prompt menciona Pagador a ignorar");
  assertIncludes(
    prompt,
    "solo como remitente/ordenante/pagador, NO lo pongas en \"nombre\"",
    "C2: prompt no usar referencia si es solo remitente"
  );
}

// ---------------------------------------------------------------------------
// CASO 3 — monto/moneda OK, beneficiario ilegible (nombre vacío / null)
// ---------------------------------------------------------------------------
{
  const esperado = normalizarPaymentEsperado({
    montoEsperado: 1490,
    monedaEsperada: "ARS",
    nombreEsperado: BENEFICIARIO,
  });
  for (const nombre of ["", null]) {
    const r = compararPagoOpenAI(esperado, {
      monto: 1490,
      moneda: "ARS",
      nombre,
    });
    assert(r.valido === false, `C3: nombre ${JSON.stringify(nombre)} → inválido`);
    assert(r.motivo === "nombre_no_coincide", `C3: ${JSON.stringify(nombre)} motivo`);
    assert(r.montoOk === true && r.monedaOk === true, `C3: monto/moneda OK`);
    assert(r.nombreOk === false, `C3: nombreOk false`);
  }

  assert(
    silentEval(
      [
        {
          id: "r1",
          nombre: "Con nombre",
          type: "payment_reader",
          enabled: true,
          payment: {
            montoEsperado: 1490,
            monedaEsperada: "ARS",
            nombreEsperado: BENEFICIARIO,
          },
        },
      ],
      { monto: 1490, moneda: "ARS", nombre: "" }
    ) === null,
    "C3: ninguna ruta gana sin beneficiario legible"
  );
}

// ---------------------------------------------------------------------------
// CASO 4 — sin nombreEsperado: solo monto + moneda
// ---------------------------------------------------------------------------
{
  const esperado = normalizarPaymentEsperado({
    montoEsperado: 1490,
    monedaEsperada: "ARS",
    nombreEsperado: "",
  });
  assert(esperado.nombreEsperado === "", "C4: nombre vacío normalizado");

  // Beneficiario cualquiera (o vacío): no debe importar
  for (const nombre of [BENEFICIARIO, PAGADOR, "", null, "Cualquier Comercio SA"]) {
    const r = compararPagoOpenAI(esperado, {
      monto: 1490,
      moneda: "ARS",
      nombre,
    });
    assert(r.valido === true, `C4: sin nombreEsperado, nombre=${JSON.stringify(nombre)} → válido`);
    assert(r.nombreOk === true, `C4: nombreOk true (bypass)`);
  }

  // Monto incorrecto sigue fallando
  const malo = compararPagoOpenAI(esperado, {
    monto: 100,
    moneda: "ARS",
    nombre: BENEFICIARIO,
  });
  assert(malo.valido === false, "C4: monto incorrecto → inválido");
  assert(malo.motivo === "monto_no_coincide", "C4: motivo monto");

  // Sin refs en prompt cuando no hay nombres en rutas
  const refs = recolectarNombresReferenciaPayment([
    {
      id: "solo_monto",
      payment: { montoEsperado: 1490, monedaEsperada: "ARS", nombreEsperado: "" },
    },
  ]);
  assert(refs.length === 0, "C4: sin nombres de referencia");
  assert(
    construirPromptComprobanteVision(refs) === PROMPT_COMPROBANTE_VISION_BASE,
    "C4: prompt base sin bloque referencia"
  );
}

// ---------------------------------------------------------------------------
// CASO 5 — nombre esperado aparece en otra parte; beneficiario real es otro
// Mock: OCR (correcto) extrajo OTRO_BENEFICIARIO; esperado era BENEFICIARIO
// (p.ej. BENEFICIARIO solo como remitente / texto suelto en la imagen).
// ---------------------------------------------------------------------------
{
  const esperado = normalizarPaymentEsperado({
    montoEsperado: 1600,
    monedaEsperada: "ARS",
    nombreEsperado: BENEFICIARIO,
  });
  const lectura = {
    monto: 1600,
    moneda: "ARS",
    nombre: OTRO_BENEFICIARIO, // destinatario real distinto
  };
  const r = compararPagoOpenAI(esperado, lectura);
  assert(r.valido === false, "C5: beneficiario distinto → inválido");
  assert(r.motivo === "nombre_no_coincide", "C5: motivo nombre_no_coincide");
  assert(r.montoOk && r.monedaOk, "C5: monto/moneda OK");
  assert(r.nombreOk === false, "C5: nombreOk false");

  // No aprobar solo porque la referencia esté en el prompt
  const prompt = construirPromptComprobanteVision([BENEFICIARIO]);
  assertIncludes(prompt, BENEFICIARIO, "C5: referencia en prompt");
  assertIncludes(
    prompt,
    "La presencia textual de un nombre de referencia en cualquier parte de la imagen",
    "C5: presencia textual no basta"
  );
  assertIncludes(
    prompt,
    "Si el destinatario visible NO es ninguno de los nombres de referencia, igual extrae",
    "C5: extraer destinatario real aunque no sea la referencia"
  );

  assert(
    silentEval(
      [
        {
          id: "espera_alex",
          nombre: "Espera Alex",
          type: "payment_reader",
          enabled: true,
          payment: {
            montoEsperado: 1600,
            monedaEsperada: "ARS",
            nombreEsperado: BENEFICIARIO,
          },
        },
      ],
      lectura
    ) === null,
    "C5: ruta no gana si beneficiario OCR ≠ esperado"
  );
}

console.log(
  "✅ test-openai-payment-reader-beneficiario: todos los casos OK (SIMULADOS)"
);
console.log(
  "ℹ️  Sin llamadas a Vision/API. Casos 1–5 usan fixtures de lectura OCR."
);
console.log(
  "ℹ️  El prompt se valida por contenido textual; no hay prueba real con imagen."
);
