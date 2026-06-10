/**
 * Prueba: mensajes absorbidos mientras payment_reader valida OCR.
 * Ejecutar: node scripts/test-openai-payment-reader-absorb.js
 */

const {
  getPaymentReaderStatus,
  setPaymentReaderStatus,
  limpiarPaymentReaderStatus,
  absorberMensajePaymentReaderValidating,
} = require("../services/openaiAgentService");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const uid = "user-test";
const conexion = "conn-test";
const numero = "59170000001";

limpiarPaymentReaderStatus(uid, conexion, numero);
assert(getPaymentReaderStatus(uid, conexion, numero) === null, "inicio sin estado");

assert(
  !absorberMensajePaymentReaderValidating({
    usuarioId: uid,
    conexionWhatsappId: conexion,
    numero,
    messageType: "text",
    texto: "ya pagué",
  }),
  "sin validating no absorbe"
);

setPaymentReaderStatus(uid, conexion, numero, "validating");
assert(
  getPaymentReaderStatus(uid, conexion, numero) === "validating",
  "estado validating"
);

assert(
  absorberMensajePaymentReaderValidating({
    usuarioId: uid,
    conexionWhatsappId: conexion,
    numero,
    messageType: "text",
    texto: "ya pagué",
  }),
  "texto absorbido durante validating"
);

assert(
  absorberMensajePaymentReaderValidating({
    usuarioId: uid,
    conexionWhatsappId: conexion,
    numero,
    messageType: "image",
    texto: "",
  }),
  "imagen también absorbida durante validating"
);

setPaymentReaderStatus(uid, conexion, numero, "waiting");
assert(
  !absorberMensajePaymentReaderValidating({
    usuarioId: uid,
    conexionWhatsappId: conexion,
    numero,
    messageType: "text",
    texto: "ok",
  }),
  "waiting no absorbe (solo validating)"
);

setPaymentReaderStatus(uid, conexion, numero, null);
assert(getPaymentReaderStatus(uid, conexion, numero) === null, "null tras pago válido");

limpiarPaymentReaderStatus(uid, conexion, numero);

console.log("✅ test-openai-payment-reader-absorb: todos los casos OK");
