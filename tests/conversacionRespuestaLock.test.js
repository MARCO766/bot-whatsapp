/**
 * Lock de conversación in-process (NO distribuido).
 * Ejecutar: node tests/conversacionRespuestaLock.test.js
 */
const assert = require("assert");
const {
  buildConversacionLockKey,
  acquireConversacionLock,
  _resetConversacionLocksForTests,
} = require("../services/conversacionRespuestaLock");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("✅", name);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testSerializaMismaConversacion() {
  _resetConversacionLocksForTests();
  const order = [];
  const parts = {
    usuarioId: "u1",
    clienteNumero: "591700",
    conexionWhatsappId: "conn-a",
  };

  const p1 = (async () => {
    const lock = await acquireConversacionLock(parts);
    order.push("a-start");
    await sleep(40);
    order.push("a-end");
    lock.release();
  })();

  const p2 = (async () => {
    await sleep(5);
    const lock = await acquireConversacionLock(parts);
    order.push("b-start");
    order.push("b-end");
    lock.release();
  })();

  await Promise.all([p1, p2]);
  assert.deepStrictEqual(order, ["a-start", "a-end", "b-start", "b-end"]);
  ok("dos mensajes misma conversación se serializan (1 proceso)");
}

async function testConexionesDistintasAisladas() {
  _resetConversacionLocksForTests();
  const order = [];
  let bothHolding = false;

  const p1 = (async () => {
    const lock = await acquireConversacionLock({
      usuarioId: "u1",
      clienteNumero: "591700",
      conexionWhatsappId: "conn-a",
    });
    order.push("a");
    await sleep(30);
    bothHolding = order.includes("b");
    lock.release();
  })();

  const p2 = (async () => {
    await sleep(5);
    const lock = await acquireConversacionLock({
      usuarioId: "u1",
      clienteNumero: "591700",
      conexionWhatsappId: "conn-b",
    });
    order.push("b");
    lock.release();
  })();

  await Promise.all([p1, p2]);
  assert.ok(bothHolding, "conn-b no debe esperar a conn-a");
  ok("conexiones distintas no se bloquean entre sí");
}

async function testReleasePermiteSiguiente() {
  _resetConversacionLocksForTests();
  const lock1 = await acquireConversacionLock({
    usuarioId: "u",
    clienteNumero: "1",
    conexionWhatsappId: "c",
  });
  assert.strictEqual(lock1.sigueSiendoTitular(), true);
  assert.strictEqual(lock1.singleProcessOnly, true);
  lock1.release();
  assert.strictEqual(lock1.sigueSiendoTitular(), false);
  const lock2 = await acquireConversacionLock({
    usuarioId: "u",
    clienteNumero: "1",
    conexionWhatsappId: "c",
  });
  assert.strictEqual(lock2.sigueSiendoTitular(), true);
  lock2.release();
  ok("release libera titularidad y permite siguiente");
}

async function testKeyIncluyeTripleta() {
  const k1 = buildConversacionLockKey({
    usuarioId: "u",
    clienteNumero: "1",
    conexionWhatsappId: "a",
  });
  const k2 = buildConversacionLockKey({
    usuarioId: "u",
    clienteNumero: "1",
    conexionWhatsappId: "b",
  });
  const k3 = buildConversacionLockKey({
    usuarioId: "u",
    clienteNumero: "2",
    conexionWhatsappId: "a",
  });
  assert.notStrictEqual(k1, k2);
  assert.notStrictEqual(k1, k3);
  ok("clave incluye usuario|numero|conexion");
}

async function testFalloNoBloqueaPermanentemente() {
  _resetConversacionLocksForTests();
  const parts = {
    usuarioId: "u",
    clienteNumero: "9",
    conexionWhatsappId: "c",
  };
  const lock1 = await acquireConversacionLock(parts);
  try {
    throw new Error("boom durante procesamiento");
  } catch (_e) {
    lock1.release();
  }
  const lock2 = await acquireConversacionLock(parts);
  assert.strictEqual(lock2.sigueSiendoTitular(), true);
  lock2.release();
  ok("fallo + release no deja lock permanente");
}

(async () => {
  await testSerializaMismaConversacion();
  await testConexionesDistintasAisladas();
  await testReleasePermiteSiguiente();
  await testKeyIncluyeTripleta();
  await testFalloNoBloqueaPermanentemente();
  console.log(`\n${passed} tests OK`);
  console.log(
    "NOTA: estos tests NO demuestran coordinación multiinstancia; solo un proceso."
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
