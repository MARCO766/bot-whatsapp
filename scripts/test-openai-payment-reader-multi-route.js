/**
 * Prueba: evaluación multi-ruta payment_reader (sin OCR).
 * Ejecutar: node scripts/test-openai-payment-reader-multi-route.js
 */

const {
  evaluarRutasPaymentReaderContraLectura,
} = require("../services/openaiPaymentReaderService");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function ruta(id, nombre, payment) {
  return {
    id,
    nombre,
    type: "payment_reader",
    enabled: true,
    payment,
  };
}

function evaluar(rutas, lectura) {
  const originalLog = console.log;
  console.log = () => {};
  const ganadora = evaluarRutasPaymentReaderContraLectura(rutas, lectura);
  console.log = originalLog;
  return ganadora;
}

// CASO A: pago1=19, pago2=29, comprobante=29 → pago2
{
  const rutas = [
    ruta("pago1", "Pago 19", { montoEsperado: 19, monedaEsperada: "bs" }),
    ruta("pago2", "Pago 29", { montoEsperado: 29, monedaEsperada: "bs" }),
  ];
  const lectura = { monto: 29, moneda: "bs", nombre: "" };
  const g = evaluar(rutas, lectura);
  assert(g?.route?.id === "pago2", "CASO A: debe elegir pago2");
}

// CASO B: pago1=19 Marco, pago2=19 Alejandro, comprobante=Alejandro+19 → pago2
{
  const rutas = [
    ruta("pago1", "Pago Marco", {
      montoEsperado: 19,
      monedaEsperada: "bs",
      nombreEsperado: "Marco",
    }),
    ruta("pago2", "Pago Alejandro", {
      montoEsperado: 19,
      monedaEsperada: "bs",
      nombreEsperado: "Alejandro",
    }),
  ];
  const lectura = { monto: 19, moneda: "bs", nombre: "Alejandro" };
  const g = evaluar(rutas, lectura);
  assert(g?.route?.id === "pago2", "CASO B: debe elegir pago2");
}

// CASO C: pago1=19, pago2=19, comprobante=19 → pago1 por orden
{
  const rutas = [
    ruta("pago1", "Pago 19 A", { montoEsperado: 19, monedaEsperada: "bs" }),
    ruta("pago2", "Pago 19 B", { montoEsperado: 19, monedaEsperada: "bs" }),
  ];
  const lectura = { monto: 19, moneda: "bs", nombre: "" };
  const g = evaluar(rutas, lectura);
  assert(g?.route?.id === "pago1", "CASO C: debe elegir pago1 por orden");
}

// CASO D: pago1=19, pago2=29, comprobante=10 → ninguna
{
  const rutas = [
    ruta("pago1", "Pago 19", { montoEsperado: 19, monedaEsperada: "bs" }),
    ruta("pago2", "Pago 29", { montoEsperado: 29, monedaEsperada: "bs" }),
  ];
  const lectura = { monto: 10, moneda: "bs", nombre: "" };
  const g = evaluar(rutas, lectura);
  assert(g === null, "CASO D: ninguna ruta debe coincidir");
}

// CASO E: una sola ruta payment_reader → misma que antes
{
  const rutas = [
    ruta("pago1", "Pago único", { montoEsperado: 19, monedaEsperada: "bs" }),
  ];
  const lectura = { monto: 19, moneda: "bs", nombre: "" };
  const g = evaluar(rutas, lectura);
  assert(g?.route?.id === "pago1", "CASO E: ruta única debe coincidir");
}

// CASO extra: nombre más específico gana sobre monto+moneda sin nombre
{
  const rutas = [
    ruta("pago1", "Solo monto", { montoEsperado: 19, monedaEsperada: "bs" }),
    ruta("pago2", "Con nombre", {
      montoEsperado: 19,
      monedaEsperada: "bs",
      nombreEsperado: "Alejandro",
    }),
  ];
  const lectura = { monto: 19, moneda: "bs", nombre: "Alejandro" };
  const g = evaluar(rutas, lectura);
  assert(g?.route?.id === "pago2", "CASO extra: ruta con nombre gana por especificidad");
}

console.log("✅ test-openai-payment-reader-multi-route: todos los casos OK");
