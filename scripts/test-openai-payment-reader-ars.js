/**
 * Prueba: ARS / LATAM amounts / símbolo $ en Lector de pago OpenAI.
 * Ejecutar: node scripts/test-openai-payment-reader-ars.js
 */

const {
  toNumber,
  compararMonedaFlexible,
  compararPagoOpenAI,
  normalizarPaymentEsperado,
} = require("../services/openaiPaymentReaderService");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertClose(actual, expected, msg) {
  if (Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${msg} (got ${actual}, expected ${expected})`);
  }
}

// A) toNumber
{
  const cases = [
    ["1490", 1490],
    ["1.490", 1490],
    ["$ 1.490", 1490],
    ["$1.490", 1490],
    ["1.490,00", 1490],
    ["1490,00", 1490],
    ["1490,50", 1490.5],
    ["1490.00", 1490],
    ["$ 1490.00", 1490],
    ["1,490", 1490],
  ];
  for (const [input, expected] of cases) {
    assertClose(toNumber(input), expected, `toNumber(${JSON.stringify(input)})`);
  }
  assertClose(toNumber(1490), 1490, "toNumber(number 1490)");
  assertClose(toNumber(1490.5), 1490.5, "toNumber(number 1490.5)");
}

// B) monedas ARS aliases
{
  for (const alias of [
    "ARS",
    "ars",
    "peso argentino",
    "pesos argentinos",
    "arg",
  ]) {
    assert(
      compararMonedaFlexible("ARS", alias) === true,
      `ARS vs ${JSON.stringify(alias)} debe coincidir`
    );
  }
}

// C) símbolo $
{
  assert(compararMonedaFlexible("ARS", "$") === true, 'ARS + "$" → true');
  assert(compararMonedaFlexible("USD", "$") === true, 'USD + "$" → true');
  assert(compararMonedaFlexible("ARS", "USD") === false, 'ARS + "USD" → false');
  assert(compararMonedaFlexible("ARS", "BOB") === false, 'ARS + "BOB" → false');
  assert(compararMonedaFlexible("ARS", "Bs") === false, 'ARS + "Bs" → false');
}

// D) caso real Mercado Pago AR
{
  const esperado = normalizarPaymentEsperado({
    montoEsperado: 1490,
    monedaEsperada: "ARS",
  });
  const r = compararPagoOpenAI(esperado, { monto: "$ 1.490", moneda: "$", nombre: "" });
  assert(r.valido === true, "D: $ 1.490 / $ vs 1490 ARS debe ser válido");
  assert(r.montoOk && r.monedaOk, "D: montoOk y monedaOk");
}

// E) regresión Bolivia
{
  const esperado = normalizarPaymentEsperado({
    montoEsperado: 12,
    monedaEsperada: "BOB",
  });
  const r = compararPagoOpenAI(esperado, { monto: 12, moneda: "Bs", nombre: "" });
  assert(r.valido === true, 'E: 12 Bs vs 12 BOB debe ser válido');
}

// F) regresión USD
{
  const esperado = normalizarPaymentEsperado({
    montoEsperado: 10,
    monedaEsperada: "USD",
  });
  const r = compararPagoOpenAI(esperado, { monto: "$ 10", moneda: "$", nombre: "" });
  assert(r.valido === true, 'F: $ 10 / $ vs 10 USD debe ser válido');
}

// G) monto incorrecto rechazado; monto correcto aceptado
{
  const esperado = normalizarPaymentEsperado({
    montoEsperado: 1490,
    monedaEsperada: "ARS",
  });
  const ok = compararPagoOpenAI(esperado, { monto: "$ 1.490", moneda: "$", nombre: "" });
  assert(ok.valido === true, "G: $ 1.490 debe validar");
  const bad = compararPagoOpenAI(esperado, { monto: "$ 149", moneda: "$", nombre: "" });
  assert(bad.valido === false, "G: $ 149 no debe validar");
  assert(bad.motivo === "monto_no_coincide", "G: motivo monto_no_coincide");
}

// Extra: decimales reales no se convierten en miles
{
  assertClose(toNumber("1.49"), 1.49, "1.49 sigue siendo decimal");
  assertClose(toNumber("12.34"), 12.34, "12.34 sigue siendo decimal");
}

console.log("✅ test-openai-payment-reader-ars: todos los casos OK");
