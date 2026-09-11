/**
 * Prueba: modoMonto exacto | cualquiera en Lector de pago interno.
 * Ejecutar: node scripts/test-openai-payment-reader-modo-monto.js
 */

const {
  compararPagoOpenAI,
  normalizarPaymentEsperado,
  normalizarModoMonto,
} = require("../services/openaiPaymentReaderService");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function esperadoBase(extra = {}) {
  return normalizarPaymentEsperado({
    montoEsperado: 1490,
    monedaEsperada: "ARS",
    ...extra,
  });
}

function lectura(monto, moneda = "ARS", nombre = "") {
  return { monto, moneda, nombre };
}

// Normalización modoMonto
{
  assert(normalizarModoMonto(undefined) === "exacto", "undefined → exacto");
  assert(normalizarModoMonto(null) === "exacto", "null → exacto");
  assert(normalizarModoMonto("") === "exacto", "'' → exacto");
  assert(normalizarModoMonto("exacto") === "exacto", "exacto → exacto");
  assert(normalizarModoMonto("cualquiera") === "cualquiera", "cualquiera → cualquiera");
  assert(normalizarModoMonto("CUALQUIERA") === "exacto", "mayúsculas desconocidas → exacto");
  assert(normalizarModoMonto("otro") === "exacto", "desconocido → exacto");
  assert(
    normalizarPaymentEsperado({ montoEsperado: 10 }).modoMonto === "exacto",
    "payment sin modoMonto → exacto"
  );
  assert(
    normalizarPaymentEsperado({ montoEsperado: 10, modo_monto: "cualquiera" })
      .modoMonto === "cualquiera",
    "modo_monto snake_case → cualquiera"
  );
}

// A) Sin modoMonto: comportamiento actual (exacto)
{
  const esperado = esperadoBase();
  assert(esperado.modoMonto === "exacto", "A: default exacto");
  assert(
    compararPagoOpenAI(esperado, lectura(1490)).valido === true,
    "A: 1490 → válido"
  );
  assert(
    compararPagoOpenAI(esperado, lectura(1489)).valido === false,
    "A: 1489 → inválido"
  );
  assert(
    compararPagoOpenAI(esperado, lectura(1489)).motivo === "monto_no_coincide",
    "A: 1489 motivo monto_no_coincide"
  );
  assert(
    compararPagoOpenAI(esperado, lectura(1491)).valido === false,
    "A: 1491 → inválido"
  );
  assert(
    compararPagoOpenAI(esperado, lectura(1491)).motivo === "monto_no_coincide",
    "A: 1491 motivo monto_no_coincide"
  );
}

// B) modoMonto="exacto"
{
  const esperado = esperadoBase({ modoMonto: "exacto" });
  assert(
    compararPagoOpenAI(esperado, lectura(1490)).valido === true,
    "B: 1490 → válido"
  );
  assert(
    compararPagoOpenAI(esperado, lectura(1489)).valido === false,
    "B: 1489 → inválido"
  );
  assert(
    compararPagoOpenAI(esperado, lectura(1491)).valido === false,
    "B: 1491 → inválido"
  );
}

// C) modoMonto="cualquiera": cualquier monto > 0
{
  const esperado = esperadoBase({ modoMonto: "cualquiera" });
  for (const monto of [1, 1489, 1490, 1491, 1500]) {
    const r = compararPagoOpenAI(esperado, lectura(monto));
    assert(r.valido === true, `C: ${monto} → válido`);
    assert(r.montoOk === true, `C: ${monto} montoOk`);
  }
}

// D) cualquiera + moneda incorrecta → inválido
{
  const esperado = esperadoBase({ modoMonto: "cualquiera" });
  const r = compararPagoOpenAI(esperado, lectura(1500, "BOB"));
  assert(r.valido === false, "D: moneda incorrecta → inválido");
  assert(r.motivo === "moneda_no_coincide", "D: motivo moneda_no_coincide");
  assert(r.montoOk === true, "D: montoOk sigue true en cualquiera");
}

// E) cualquiera + nombre incorrecto cuando nombre configurado → inválido
{
  const esperado = esperadoBase({
    modoMonto: "cualquiera",
    nombreEsperado: "Marco Antonio",
  });
  const r = compararPagoOpenAI(
    esperado,
    lectura(1500, "ARS", "Juan Perez")
  );
  assert(r.valido === false, "E: nombre incorrecto → inválido");
  assert(r.motivo === "nombre_no_coincide", "E: motivo nombre_no_coincide");
  const ok = compararPagoOpenAI(
    esperado,
    lectura(1, "ARS", "Marco Antonio Arias")
  );
  assert(ok.valido === true, "E: nombre flexible correcto → válido");
}

// F) monto OCR <= 0 → inválido aunque cualquiera
{
  const esperado = esperadoBase({ modoMonto: "cualquiera" });
  for (const monto of [0, -1, null]) {
    const r = compararPagoOpenAI(esperado, lectura(monto));
    assert(r.valido === false, `F: monto ${monto} → inválido`);
    assert(r.motivo === "sin_monto", `F: monto ${monto} motivo sin_monto`);
  }
  const sinLectura = compararPagoOpenAI(esperado, null);
  assert(sinLectura.valido === false, "F: lectura null → inválido");
  assert(sinLectura.motivo === "sin_monto", "F: lectura null motivo sin_monto");
}

// G) modoMonto desconocido → tratar como exacto
{
  const esperado = esperadoBase({ modoMonto: "desconocido" });
  assert(esperado.modoMonto === "exacto", "G: desconocido normaliza a exacto");
  assert(
    compararPagoOpenAI(esperado, lectura(1490)).valido === true,
    "G: 1490 → válido"
  );
  assert(
    compararPagoOpenAI(esperado, lectura(1489)).valido === false,
    "G: 1489 → inválido"
  );
}

// H) nodos antiguos sin modoMonto → idéntico al actual
{
  const antiguo = normalizarPaymentEsperado({
    montoEsperado: 1490,
    monedaEsperada: "ARS",
  });
  const explicito = normalizarPaymentEsperado({
    montoEsperado: 1490,
    monedaEsperada: "ARS",
    modoMonto: "exacto",
  });
  assert(antiguo.modoMonto === "exacto", "H: sin campo → exacto");
  for (const monto of [1489, 1490, 1491]) {
    const a = compararPagoOpenAI(antiguo, lectura(monto));
    const e = compararPagoOpenAI(explicito, lectura(monto));
    assert(
      a.valido === e.valido && a.motivo === e.motivo,
      `H: monto ${monto} antiguo === exacto`
    );
  }
}

console.log("✅ test-openai-payment-reader-modo-monto: todos los casos OK");
