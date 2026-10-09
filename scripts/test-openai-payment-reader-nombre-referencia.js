/**
 * Prueba: nombres de referencia opcionales en OCR Payment Reader.
 * No llama a Vision; valida prompt, recolección y comparación post-OCR.
 * Ejecutar: node scripts/test-openai-payment-reader-nombre-referencia.js
 */

const {
  construirPromptComprobanteVision,
  PROMPT_COMPROBANTE_VISION_BASE,
  normalizarListaNombresReferencia,
  recolectarNombresReferenciaPayment,
  compararPagoOpenAI,
  normalizarPaymentEsperado,
  evaluarRutasPaymentReaderContraLectura,
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

// A) Sin nombre esperado → prompt base idéntico
{
  assert(
    construirPromptComprobanteVision([]) === PROMPT_COMPROBANTE_VISION_BASE,
    "A: [] → prompt base"
  );
  assert(
    construirPromptComprobanteVision(null) === PROMPT_COMPROBANTE_VISION_BASE,
    "A: null → prompt base"
  );
  assert(
    construirPromptComprobanteVision(undefined) === PROMPT_COMPROBANTE_VISION_BASE,
    "A: undefined → prompt base"
  );
  assert(
    construirPromptComprobanteVision([""]) === PROMPT_COMPROBANTE_VISION_BASE,
    "A: [''] → prompt base"
  );
  assertNotIncludes(
    construirPromptComprobanteVision([]),
    "NOMBRES DE REFERENCIA",
    "A: sin bloque de referencia"
  );
}

// B) Con nombre esperado → referencia incluida sin forzar coincidencia
{
  const prompt = construirPromptComprobanteVision([
    "Alex Moises Arias Perez",
  ]);
  assert(prompt.startsWith(PROMPT_COMPROBANTE_VISION_BASE), "B: base + bloque");
  assertIncludes(prompt, "NOMBRES DE REFERENCIA", "B: bloque referencia");
  assertIncludes(prompt, "Alex Moises Arias Perez", "B: nombre en lista");
  assertIncludes(
    prompt,
    "solo ayuda de búsqueda visual",
    "B: no es prueba de pago"
  );
  assertIncludes(
    prompt,
    "NO inventes ni devuelvas un nombre solo porque figura",
    "B: no inventar"
  );
  assertIncludes(
    prompt,
    "NO implica por sí sola",
    "B: presencia textual no aprueba"
  );
  assertNotIncludes(
    prompt,
    "considera el pago válido",
    "B: sin instrucción de aprobación automática"
  );
  assertNotIncludes(
    prompt,
    "si aparece el nombre de referencia el pago es válido",
    "B: sin match forzado"
  );
}

// C) Varias rutas → referencias únicas, sin elegir una sola arbitrariamente
{
  const refs = recolectarNombresReferenciaPayment([
    {
      id: "r1",
      payment: { nombreEsperado: "Alex Moises Arias Perez" },
    },
    {
      id: "r2",
      payment: { nombreEsperado: "Alex Moises Arias Perez" },
    },
    {
      id: "r3",
      payment: { nombreEsperado: "Otro Beneficiario" },
    },
    { id: "r4", payment: { nombreEsperado: "" } },
    { id: "r5", payment: {} },
  ]);
  assert(refs.length === 2, "C: dos referencias únicas");
  assert(refs[0] === "Alex Moises Arias Perez", "C: primer nombre");
  assert(refs[1] === "Otro Beneficiario", "C: segundo nombre");

  const prompt = construirPromptComprobanteVision(refs);
  assertIncludes(prompt, "Alex Moises Arias Perez", "C: ambos en prompt");
  assertIncludes(prompt, "Otro Beneficiario", "C: ambos en prompt 2");
  assert(
    JSON.stringify(normalizarListaNombresReferencia(refs)) ===
      JSON.stringify(refs),
    "C: normalizar preserva lista única"
  );
}

// D) Nombre correcto extraído → validación actual acepta
{
  const esperado = normalizarPaymentEsperado({
    montoEsperado: 1600,
    monedaEsperada: "ARS",
    nombreEsperado: "Alex Moises Arias Perez",
  });
  const r = compararPagoOpenAI(esperado, {
    monto: 1600,
    moneda: "ARS",
    nombre: "Alex Moises Arias Perez",
  });
  assert(r.valido === true, "D: Alex destinatario → válido");
  assert(r.nombreOk === true, "D: nombreOk");
}

// E) Natalia destinataria + Alex como referencia → sigue rechazándose
{
  const esperado = normalizarPaymentEsperado({
    montoEsperado: 1600,
    monedaEsperada: "ARS",
    nombreEsperado: "Alex Moises Arias Perez",
  });
  const r = compararPagoOpenAI(esperado, {
    monto: 1600,
    moneda: "ARS",
    nombre: "Natalia Alejandra Tapia Hueitra",
  });
  assert(r.valido === false, "E: Natalia ≠ Alex → inválido");
  assert(r.motivo === "nombre_no_coincide", "E: motivo nombre_no_coincide");
  assert(r.montoOk === true && r.monedaOk === true, "E: monto/moneda OK");
  assert(r.nombreOk === false, "E: nombreOk false");
}

// F) Alex destinatario + Natalia remitente (lectura.nombre = Alex) → acepta
//    (simula extracción correcta; no es prueba Vision con imagen real)
{
  const esperado = normalizarPaymentEsperado({
    montoEsperado: 1600,
    monedaEsperada: "ARS",
    nombreEsperado: "Alex Moises Arias Perez",
  });
  const lectura = {
    monto: 1600,
    moneda: "ARS",
    nombre: "Alex Moises Arias Perez",
  };
  const r = compararPagoOpenAI(esperado, lectura);
  assert(r.valido === true, "F: destinatario Alex → válido");

  const originalLog = console.log;
  console.log = () => {};
  const ganadora = evaluarRutasPaymentReaderContraLectura(
    [
      {
        id: "pago_alex",
        nombre: "Pago Alex",
        type: "payment_reader",
        enabled: true,
        payment: {
          montoEsperado: 1600,
          monedaEsperada: "ARS",
          nombreEsperado: "Alex Moises Arias Perez",
        },
      },
    ],
    lectura
  );
  console.log = originalLog;
  assert(ganadora?.route?.id === "pago_alex", "F: ruta gana con Alex");
}

// G) Prompt con referencia sigue exigiendo destinatario, no remitente
{
  const prompt = construirPromptComprobanteVision([
    "Alex Moises Arias Perez",
  ]);
  assertIncludes(prompt, "destinatario/beneficiario real", "G: destinatario");
  assertIncludes(
    prompt,
    "solo como remitente/ordenante/pagador, NO lo pongas en \"nombre\"",
    "G: no usar remitente"
  );
}

console.log(
  "✅ test-openai-payment-reader-nombre-referencia: todos los casos OK"
);
console.log(
  "ℹ️  Extracción real Vision no probada aquí (sin imagen / sin API)."
);
