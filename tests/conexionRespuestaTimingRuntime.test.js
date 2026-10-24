/**
 * Runtime timing (typing + demora + lock single-process) — mocks.
 * Ejecutar: node tests/conexionRespuestaTimingRuntime.test.js
 */
const assert = require("assert");
const {
  aplicarTimingAntesDeRespuestaAutomatica,
  timingEstaActivo,
} = require("../services/conexionRespuestaTimingRuntime");
const { DEFAULTS } = require("../services/conexionRespuestaTimingConfig");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("✅", name);
}

function mockAcquire(opts = {}) {
  let titular = opts.titular !== false;
  const lock = {
    singleProcessOnly: true,
    skipped: false,
    token: "tok-test",
    key: "u|n|c",
    sigueSiendoTitular: () => titular,
    release: () => {
      titular = false;
    },
    _perderTitularidad: () => {
      titular = false;
    },
  };
  return {
    lock,
    acquireConversacionLock: async () => lock,
  };
}

async function testAmbasOffNoOp() {
  let typingCalls = 0;
  let sleepCalls = 0;
  let pauseCalls = 0;
  let acquireCalls = 0;
  const r = await aplicarTimingAntesDeRespuestaAutomatica(
    {
      timing: { ...DEFAULTS },
      messageId: "wamid.X",
      usuarioId: "u",
      clienteNumero: "591",
      conexionWhatsappId: "c",
    },
    {
      acquireConversacionLock: async () => {
        acquireCalls += 1;
        return { release: () => {}, sigueSiendoTitular: () => true };
      },
      intentarEnviarIndicadorEscritura: async () => {
        typingCalls += 1;
        return { ok: true };
      },
      esperarSegundos: async () => {
        sleepCalls += 1;
      },
      estaBotPausado: async () => {
        pauseCalls += 1;
        return false;
      },
    }
  );
  assert.strictEqual(r.skipped, true);
  assert.strictEqual(acquireCalls, 0);
  assert.strictEqual(typingCalls, 0);
  assert.strictEqual(sleepCalls, 0);
  assert.strictEqual(pauseCalls, 0);
  ok("ambas OFF → sin lock, sin typing, sin espera");
}

async function testIndicadorOnLlamaTyping() {
  const { acquireConversacionLock, lock } = mockAcquire();
  let typingArgs = null;
  const r = await aplicarTimingAntesDeRespuestaAutomatica(
    {
      timing: {
        indicador_escritura: true,
        demora_respuesta_activa: false,
        demora_respuesta_segundos: 3,
      },
      messageId: "wamid.OK",
      usuarioId: "u1",
      conexionWhatsappId: "c1",
      metaToken: "tok",
      metaPhoneId: "ph",
      clienteNumero: "591700",
    },
    {
      acquireConversacionLock,
      intentarEnviarIndicadorEscritura: async (p) => {
        typingArgs = p;
        return { ok: true };
      },
      esperarSegundos: async () => {
        throw new Error("no debe dormir");
      },
      estaBotPausado: async () => false,
    }
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(typingArgs, "typing debió invocarse");
  assert.strictEqual(typingArgs.habilitado, true);
  assert.strictEqual(typingArgs.messageId, "wamid.OK");
  assert.strictEqual(typingArgs.conexionWhatsappId, "c1");
  assert.strictEqual(r.ok, true);
  r.releaseLock();
  assert.strictEqual(lock.sigueSiendoTitular(), false);
  ok("indicador ON → typing + lock; sin demora");
}

async function testTypingErrorNoBloquea() {
  const { acquireConversacionLock } = mockAcquire();
  let slept = false;
  const r = await aplicarTimingAntesDeRespuestaAutomatica(
    {
      timing: {
        indicador_escritura: true,
        demora_respuesta_activa: true,
        demora_respuesta_segundos: 2,
      },
      messageId: "wamid.E",
      usuarioId: "u",
      clienteNumero: "1",
      conexionWhatsappId: "c",
    },
    {
      acquireConversacionLock,
      intentarEnviarIndicadorEscritura: async () => ({ ok: false, error: true }),
      esperarSegundos: async (s) => {
        assert.strictEqual(s, 2);
        slept = true;
      },
      estaBotPausado: async () => false,
    }
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(slept, true);
  r.releaseLock();
  ok("error typing → demora/respuesta siguen");
}

async function testDemoraOffSinEspera() {
  let sleepCalls = 0;
  await aplicarTimingAntesDeRespuestaAutomatica(
    {
      timing: {
        indicador_escritura: false,
        demora_respuesta_activa: false,
        demora_respuesta_segundos: 30,
      },
    },
    {
      esperarSegundos: async () => {
        sleepCalls += 1;
      },
    }
  );
  assert.strictEqual(sleepCalls, 0);
  ok("demora OFF → no añade espera");
}

async function testDemoraOnUsaSegundos() {
  const { acquireConversacionLock } = mockAcquire();
  let secs = null;
  const r = await aplicarTimingAntesDeRespuestaAutomatica(
    {
      timing: {
        indicador_escritura: false,
        demora_respuesta_activa: true,
        demora_respuesta_segundos: 7,
      },
      usuarioId: "u",
      clienteNumero: "591",
      conexionWhatsappId: "c",
    },
    {
      acquireConversacionLock,
      intentarEnviarIndicadorEscritura: async () => {
        throw new Error("no typing");
      },
      esperarSegundos: async (s) => {
        secs = s;
      },
      estaBotPausado: async () => false,
    }
  );
  assert.strictEqual(secs, 7);
  r.releaseLock();
  ok("demora ON → espera los segundos configurados");
}

async function testSegundosInvalidosSinEspera() {
  const { acquireConversacionLock } = mockAcquire();
  let sleepCalls = 0;
  const r = await aplicarTimingAntesDeRespuestaAutomatica(
    {
      timing: {
        indicador_escritura: false,
        demora_respuesta_activa: true,
        demora_respuesta_segundos: 99,
      },
      usuarioId: "u",
      clienteNumero: "591",
    },
    {
      acquireConversacionLock,
      esperarSegundos: async () => {
        sleepCalls += 1;
      },
      estaBotPausado: async () => false,
    }
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(sleepCalls, 0);
  r.releaseLock();
  ok("segundos inválidos → no espera inesperada");
}

async function testPausaTrasDemoraAborta() {
  const { acquireConversacionLock } = mockAcquire();
  const r = await aplicarTimingAntesDeRespuestaAutomatica(
    {
      timing: {
        indicador_escritura: false,
        demora_respuesta_activa: true,
        demora_respuesta_segundos: 1,
      },
      usuarioId: "u",
      clienteNumero: "591",
      conexionWhatsappId: "c",
    },
    {
      acquireConversacionLock,
      esperarSegundos: async () => {},
      estaBotPausado: async () => true,
    }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, "bot_pausado");
  ok("pausa durante/tras espera → no continuar respuesta");
}

async function testPierdeTitularidadTrasDemora() {
  const { acquireConversacionLock, lock } = mockAcquire();
  const r = await aplicarTimingAntesDeRespuestaAutomatica(
    {
      timing: {
        indicador_escritura: false,
        demora_respuesta_activa: true,
        demora_respuesta_segundos: 1,
      },
      usuarioId: "u",
      clienteNumero: "591",
      conexionWhatsappId: "c",
    },
    {
      acquireConversacionLock,
      esperarSegundos: async () => {
        lock._perderTitularidad();
      },
      estaBotPausado: async () => false,
    }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, "lock_titularidad_perdida");
  ok("titularidad perdida tras demora → aborta");
}

async function testTypingNoRetrasaRespuesta() {
  const { acquireConversacionLock } = mockAcquire();
  let demoraHecha = false;
  const r = await aplicarTimingAntesDeRespuestaAutomatica(
    {
      timing: {
        indicador_escritura: true,
        demora_respuesta_activa: true,
        demora_respuesta_segundos: 1,
      },
      messageId: "wamid.SLOW",
      usuarioId: "u",
      clienteNumero: "591",
      conexionWhatsappId: "c",
    },
    {
      acquireConversacionLock,
      intentarEnviarIndicadorEscritura: () => new Promise(() => {}),
      esperarSegundos: async (s) => {
        assert.strictEqual(s, 1);
        demoraHecha = true;
      },
      estaBotPausado: async () => false,
    }
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(demoraHecha, true);
  r.releaseLock();
  ok("typing colgado no retrasa demora ni respuesta");
}

async function testTimingActivoPorConexion() {
  assert.strictEqual(
    timingEstaActivo({
      indicador_escritura: true,
      demora_respuesta_activa: false,
      demora_respuesta_segundos: 3,
    }),
    true
  );
  assert.strictEqual(timingEstaActivo({ ...DEFAULTS }), false);
  ok("timingEstaActivo por conexión");
}

(async () => {
  await testAmbasOffNoOp();
  await testIndicadorOnLlamaTyping();
  await testTypingErrorNoBloquea();
  await testDemoraOffSinEspera();
  await testDemoraOnUsaSegundos();
  await testSegundosInvalidosSinEspera();
  await testPausaTrasDemoraAborta();
  await testPierdeTitularidadTrasDemora();
  await testTypingNoRetrasaRespuesta();
  await testTimingActivoPorConexion();
  console.log(`\n${passed} tests OK`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
