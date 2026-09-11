/**
 * Prueba: modoMonto sobrevive a normalizarPaymentCamino / normalizarCaminosOpenAI
 * y llega a compararPagoOpenAI con el valor correcto.
 * Ejecutar: node scripts/test-openai-payment-reader-modo-monto-normalize.js
 */

const {
  normalizarPaymentCamino,
  normalizarCaminosOpenAI,
} = require("../services/openaiCaminoMatcher");

const {
  compararPagoOpenAI,
  normalizarPaymentEsperado,
} = require("../services/openaiPaymentReaderService");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function lectura(monto, moneda = "ARS", nombre = "") {
  return { monto, moneda, nombre };
}

function rutaPago(payment) {
  return {
    id: "route_pago_test",
    nombre: "pago",
    type: "payment_reader",
    enabled: true,
    payment,
  };
}

// 1) normalizarPaymentCamino preserva "cualquiera"
{
  const payment = {
    montoEsperado: 1490,
    monedaEsperada: "ARS",
    nombreEsperado: "",
    modoMonto: "cualquiera",
  };
  const norm = normalizarPaymentCamino({ payment });
  assert(norm.modoMonto === "cualquiera", "1: modoMonto debe seguir siendo cualquiera");
  assert(norm.montoEsperado === 1490, "1: montoEsperado preservado");
  assert(norm.monedaEsperada === "ARS", "1: monedaEsperada preservada");
  assert(norm.nombreEsperado === "", "1: nombreEsperado preservado");
}

// 2) normalizarCaminosOpenAI preserva "cualquiera" en la ruta
{
  const cfg = normalizarCaminosOpenAI({
    caminos: [
      rutaPago({
        montoEsperado: 1490,
        monedaEsperada: "ARS",
        nombreEsperado: "",
        modoMonto: "cualquiera",
      }),
    ],
  });
  const route = cfg.caminos[0];
  assert(route.payment.modoMonto === "cualquiera", "2: caminos OpenAI conservan cualquiera");
}

// 3) modoMonto ausente => exacto (retrocompat)
{
  const norm = normalizarPaymentCamino({
    payment: { montoEsperado: 1490, monedaEsperada: "ARS", nombreEsperado: "" },
  });
  assert(norm.modoMonto === "exacto", "3: ausente → exacto en matcher");
  const esperado = normalizarPaymentEsperado(norm);
  assert(esperado.modoMonto === "exacto", "3: ausente → exacto en payment reader");
  assert(
    compararPagoOpenAI(esperado, lectura(1490)).valido === true,
    "3: 1490 válido en exacto"
  );
  assert(
    compararPagoOpenAI(esperado, lectura(1500)).valido === false,
    "3: 1500 inválido en exacto"
  );
}

// 4) modoMonto "exacto" => exacto
{
  const norm = normalizarPaymentCamino({
    payment: {
      montoEsperado: 1490,
      monedaEsperada: "ARS",
      nombreEsperado: "",
      modoMonto: "exacto",
    },
  });
  assert(norm.modoMonto === "exacto", "4: exacto preservado");
  const esperado = normalizarPaymentEsperado(norm);
  assert(
    compararPagoOpenAI(esperado, lectura(1500)).valido === false,
    "4: 1500 inválido con exacto"
  );
}

// 5) Pipeline completo: cualquiera + OCR 1500 / 1600 / >0 => válido
{
  const cfg = normalizarCaminosOpenAI({
    caminos: [
      rutaPago({
        montoEsperado: 1490,
        monedaEsperada: "ARS",
        nombreEsperado: "",
        modoMonto: "cualquiera",
      }),
    ],
  });
  const esperado = normalizarPaymentEsperado(cfg.caminos[0].payment);
  assert(esperado.modoMonto === "cualquiera", "5: pipeline modoMonto cualquiera");
  for (const monto of [1, 1500, 1600]) {
    const r = compararPagoOpenAI(esperado, lectura(monto));
    assert(r.valido === true, `5: OCR ${monto} debe ser válido`);
  }
}

// 6) cualquiera + moneda incorrecta => inválido
{
  const esperado = normalizarPaymentEsperado(
    normalizarPaymentCamino({
      payment: {
        montoEsperado: 1490,
        monedaEsperada: "ARS",
        nombreEsperado: "",
        modoMonto: "cualquiera",
      },
    })
  );
  const r = compararPagoOpenAI(esperado, lectura(1500, "BOB"));
  assert(r.valido === false, "6: moneda incorrecta inválida");
  assert(r.motivo === "moneda_no_coincide", "6: motivo moneda_no_coincide");
}

// 7) cualquiera + monto <= 0 / sin monto => inválido
{
  const esperado = normalizarPaymentEsperado(
    normalizarPaymentCamino({
      payment: {
        montoEsperado: 1490,
        monedaEsperada: "ARS",
        nombreEsperado: "",
        modoMonto: "cualquiera",
      },
    })
  );
  assert(
    compararPagoOpenAI(esperado, lectura(0)).motivo === "sin_monto",
    "7: monto 0 → sin_monto"
  );
  assert(
    compararPagoOpenAI(esperado, null).motivo === "sin_monto",
    "7: lectura null → sin_monto"
  );
}

console.log(
  "✅ test-openai-payment-reader-modo-monto-normalize: todos los casos OK"
);
