/**
 * Prueba: límites de fallback del Agente Rápido (texto y payment reader).
 * Ejecutar: node scripts/test-ia-fallback-limit.js
 */

const {
  normalizarFallbackLimite,
  resolverAccionFallbackLimite,
  leerEstadoFallbackContadores,
  reiniciarContadorFallbackTexto,
  reiniciarContadorFallbackPayment,
  crearFallbackLimitePorDefecto,
  FALLBACK_LIMITE_MIN,
  FALLBACK_LIMITE_MAX,
} = require("../services/aiService");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Normalización runtime
const normLow = normalizarFallbackLimite({ ilimitado: false, maximo: 0 });
assert(normLow.maximo === FALLBACK_LIMITE_MIN, "maximo clamp mínimo");

const normHigh = normalizarFallbackLimite({ ilimitado: false, maximo: 500 });
assert(normHigh.maximo === FALLBACK_LIMITE_MAX, "maximo clamp máximo");

const normDefault = normalizarFallbackLimite({});
assert(normDefault.ilimitado === true, "default ilimitado");

// Ilimitado
let r = resolverAccionFallbackLimite({
  configLimite: crearFallbackLimitePorDefecto(),
  estadoParcial: { usados: 99, soporteEnviado: false },
  mensajeNormal: "fallback normal",
});
assert(r.enviar === true, "ilimitado envía siempre");
assert(r.nuevoEstado.usados === 99, "ilimitado no incrementa usados");

// Limitado max=2
const cfgLim = { ilimitado: false, maximo: 2, alSuperarLimite: "nada" };
let estado = { usados: 0, soporteEnviado: false };

r = resolverAccionFallbackLimite({
  configLimite: cfgLim,
  estadoParcial: estado,
  mensajeNormal: "fb1",
});
assert(r.enviar && r.nuevoEstado.usados === 1, "fallback 1");

estado = r.nuevoEstado;
r = resolverAccionFallbackLimite({
  configLimite: cfgLim,
  estadoParcial: estado,
  mensajeNormal: "fb2",
});
assert(r.enviar && r.nuevoEstado.usados === 2, "fallback 2");

estado = r.nuevoEstado;
r = resolverAccionFallbackLimite({
  configLimite: cfgLim,
  estadoParcial: estado,
  mensajeNormal: "fb3",
});
assert(r.enviar === false, "tercer fallback bloqueado (nada)");

// Soporte una sola vez
const cfgSoporte = {
  ilimitado: false,
  maximo: 1,
  alSuperarLimite: "soporte",
  soporteNombre: "Ana",
  soporteNumero: "59170000001",
};
estado = { usados: 1, soporteEnviado: false };

r = resolverAccionFallbackLimite({
  configLimite: cfgSoporte,
  estadoParcial: estado,
  mensajeNormal: "fb",
});
assert(r.enviar === true, "envía soporte al superar límite");
assert(r.mensaje.includes("Ana"), "mensaje soporte con nombre");
assert(r.mensaje.includes("59170000001"), "mensaje soporte con número");
assert(r.nuevoEstado.soporteEnviado === true, "soporteEnviado true");

estado = r.nuevoEstado;
r = resolverAccionFallbackLimite({
  configLimite: cfgSoporte,
  estadoParcial: estado,
  mensajeNormal: "fb",
});
assert(r.enviar === false, "soporte no se reenvía");

// Contadores independientes en flowContext
const ctx = {
  iaFallbackContadores: {
    texto: { usados: 4, soporteEnviado: true },
    paymentReader: { usados: 1, soporteEnviado: false },
  },
};
const leido = leerEstadoFallbackContadores(ctx);
assert(leido.texto.usados === 4, "lee contador texto");
assert(leido.paymentReader.usados === 1, "lee contador payment");

reiniciarContadorFallbackTexto(leido);
assert(leido.texto.usados === 0 && leido.texto.soporteEnviado === false, "reset texto");
assert(leido.paymentReader.usados === 1, "payment intacto tras reset texto");

reiniciarContadorFallbackPayment(leido);
assert(leido.paymentReader.usados === 0, "reset payment");

console.log("✅ test-ia-fallback-limit: todos los casos OK");
