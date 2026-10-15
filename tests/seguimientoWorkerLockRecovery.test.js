/**
 * Recuperación de workers V1/V2 ante fallo temporal del lock.
 * Mocks locales — sin Meta, sin Supabase real, sin escrituras.
 * Ejecutar: node tests/seguimientoWorkerLockRecovery.test.js
 */
const assert = require("assert");
const path = require("path");
const Module = require("module");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("✅", name);
}

function clearRequireCache(substr) {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(substr)) delete require.cache[key];
  }
}

function withMockedRequires(mocksByResolvedPath, fn) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename) {
      try {
        const resolved = Module._resolveFilename(request, parent, isMain);
        if (mocksByResolvedPath[resolved]) {
          return mocksByResolvedPath[resolved];
        }
      } catch (_) {
        /* ignore resolve errors for builtins */
      }
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    return fn();
  } finally {
    Module._load = originalLoad;
  }
}

function resolveFrom(fromFile, request) {
  return require.resolve(request, { paths: [path.dirname(fromFile)] });
}

/* ─── Clasificación pura exportada por jobs ─── */

function testClasificacionMotivos() {
  clearRequireCache(`${path.sep}jobs${path.sep}seguimientoWorker.js`);
  clearRequireCache(`${path.sep}jobs${path.sep}seguimientoV2Worker.js`);

  const v1 = require("../jobs/seguimientoWorker");
  const v2 = require("../jobs/seguimientoV2Worker");

  assert.strictEqual(v1.esMotivoLockPermanente("sin_supabase"), true);
  assert.strictEqual(v1.esMotivoLockPermanente("lock_tabla_ausente"), true);
  assert.strictEqual(v1.esMotivoLockPermanente("lock_verificacion_fallida"), false);
  assert.strictEqual(v1.esMotivoLockPermanente("lock_vigente"), false);

  assert.strictEqual(v2.esMotivoLockPermanente("sin_supabase"), true);
  assert.strictEqual(v2.esMotivoLockPermanente("lock_tabla_ausente"), true);
  assert.strictEqual(v2.esMotivoLockPermanente("lock_verificacion_fallida"), false);
  assert.strictEqual(v2.esMotivoLockPermanente("lock_vigente"), false);

  ok("V1/V2: clasificación permanente vs temporal independiente e idéntica");
}

/* ─── Contrato procesar* sin lock ─── */

async function testV1ClasificacionLock() {
  const executePath = path.resolve(__dirname, "../services/seguimiento/executeSeguimiento.js");
  const lockPath = resolveFrom(executePath, "./seguimientoWorkerLock");
  const repoPath = resolveFrom(executePath, "./seguimientoRepository");

  const casos = [
    {
      motivo: "lock_verificacion_fallida",
      expectLock: "skipped",
      label: "V1: lock_verificacion_fallida → skipped (no no_lock_db)",
    },
    {
      motivo: "lock_vigente",
      expectLock: "skipped",
      label: "V1: lock_vigente → skipped",
    },
    {
      motivo: "lock_tabla_ausente",
      expectLock: "no_lock_db",
      label: "V1: lock_tabla_ausente → no_lock_db",
    },
    {
      motivo: "sin_supabase",
      expectLock: "no_lock_db",
      label: "V1: sin_supabase → no_lock_db",
    },
  ];

  for (const caso of casos) {
    clearRequireCache(`${path.sep}services${path.sep}seguimiento${path.sep}`);
    let listarLlamado = false;

    const resultado = await withMockedRequires(
      {
        [lockPath]: {
          adquirirLockWorkerSeguimiento: async () => ({
            acquired: false,
            motivo: caso.motivo,
          }),
          liberarLockWorkerSeguimiento: async () => {
            throw new Error("no debe liberar sin acquire");
          },
          verificarTablaLockDisponible: async () => ({ ok: true }),
          LOCK_TTL_MS: 28000,
        },
        [repoPath]: {
          obtenerPendientesVencidos: async () => {
            listarLlamado = true;
            return [{ id: "no-debe-verse" }];
          },
        },
      },
      async () => {
        const { procesarSeguimientosVencidos } = require("../services/seguimiento/executeSeguimiento");
        return procesarSeguimientosVencidos(null, { fromWorker: true });
      }
    );

    assert.strictEqual(resultado.lock, caso.expectLock);
    assert.strictEqual(resultado.procesados, 0);
    assert.strictEqual(resultado.enviados, 0);
    assert.strictEqual(listarLlamado, false, "sin lock no debe listar pendientes");
    if (caso.expectLock === "no_lock_db" || caso.expectLock === "skipped") {
      assert.strictEqual(resultado.motivo, caso.motivo);
    }
    ok(caso.label);
  }
}

async function testV1LockAdquiridoProcesa() {
  const executePath = path.resolve(__dirname, "../services/seguimiento/executeSeguimiento.js");
  const lockPath = resolveFrom(executePath, "./seguimientoWorkerLock");
  const repoPath = resolveFrom(executePath, "./seguimientoRepository");

  clearRequireCache(`${path.sep}services${path.sep}seguimiento${path.sep}`);
  let liberarLlamado = false;
  let listarLlamado = false;

  const resultado = await withMockedRequires(
    {
      [lockPath]: {
        adquirirLockWorkerSeguimiento: async () => ({
          acquired: true,
          workerId: "test-worker-1",
        }),
        liberarLockWorkerSeguimiento: async (id) => {
          assert.strictEqual(id, "test-worker-1");
          liberarLlamado = true;
        },
        verificarTablaLockDisponible: async () => ({ ok: true }),
        LOCK_TTL_MS: 28000,
      },
      [repoPath]: {
        obtenerPendientesVencidos: async () => {
          listarLlamado = true;
          return [];
        },
      },
    },
    async () => {
      const { procesarSeguimientosVencidos } = require("../services/seguimiento/executeSeguimiento");
      return procesarSeguimientosVencidos(null, { fromWorker: true });
    }
  );

  assert.strictEqual(resultado.lock, "acquired");
  assert.strictEqual(listarLlamado, true);
  assert.strictEqual(liberarLlamado, true);
  ok("V1: lock adquirido → lista pendientes y libera lock");
}

async function testV2ClasificacionLock() {
  const workerPath = path.resolve(__dirname, "../services/seguimientoV2/seguimientoV2Worker.js");
  const lockPath = resolveFrom(workerPath, "./seguimientoV2WorkerLock");
  const repoPath = resolveFrom(workerPath, "./seguimientoV2Repository");

  const casos = [
    {
      motivo: "lock_verificacion_fallida",
      expectLock: "skipped",
      label: "V2: lock_verificacion_fallida → skipped (no no_lock_db)",
    },
    {
      motivo: "lock_vigente",
      expectLock: "skipped",
      label: "V2: lock_vigente → skipped",
    },
    {
      motivo: "lock_tabla_ausente",
      expectLock: "no_lock_db",
      label: "V2: lock_tabla_ausente → no_lock_db",
    },
    {
      motivo: "sin_supabase",
      expectLock: "no_lock_db",
      label: "V2: sin_supabase → no_lock_db",
    },
  ];

  for (const caso of casos) {
    clearRequireCache(`${path.sep}services${path.sep}seguimientoV2${path.sep}`);
    let listarLlamado = false;

    const resultado = await withMockedRequires(
      {
        [lockPath]: {
          adquirirLockWorkerSeguimientoV2: async () => ({
            acquired: false,
            motivo: caso.motivo,
          }),
          liberarLockWorkerSeguimientoV2: async () => {
            throw new Error("no debe liberar sin acquire");
          },
          verificarTablaLockDisponible: async () => ({ ok: true }),
          LOCK_TTL_MS: 28000,
        },
        [repoPath]: {
          obtenerPendientesVencidos: async () => {
            listarLlamado = true;
            return [{ id: "no-debe-verse" }];
          },
        },
      },
      async () => {
        const { procesarSeguimientosV2Vencidos } = require("../services/seguimientoV2/seguimientoV2Worker");
        return procesarSeguimientosV2Vencidos({ fromWorker: true });
      }
    );

    assert.strictEqual(resultado.lock, caso.expectLock);
    assert.strictEqual(resultado.procesados, 0);
    assert.strictEqual(listarLlamado, false);
    assert.strictEqual(resultado.motivo, caso.motivo);
    ok(caso.label);
  }
}

async function testV2LockAdquiridoProcesa() {
  const workerPath = path.resolve(__dirname, "../services/seguimientoV2/seguimientoV2Worker.js");
  const lockPath = resolveFrom(workerPath, "./seguimientoV2WorkerLock");
  const repoPath = resolveFrom(workerPath, "./seguimientoV2Repository");

  clearRequireCache(`${path.sep}services${path.sep}seguimientoV2${path.sep}`);
  let liberarLlamado = false;
  let listarLlamado = false;

  const resultado = await withMockedRequires(
    {
      [lockPath]: {
        adquirirLockWorkerSeguimientoV2: async () => ({
          acquired: true,
          workerId: "segv2-test",
        }),
        liberarLockWorkerSeguimientoV2: async (id) => {
          assert.strictEqual(id, "segv2-test");
          liberarLlamado = true;
        },
        verificarTablaLockDisponible: async () => ({ ok: true }),
        LOCK_TTL_MS: 28000,
      },
      [repoPath]: {
        obtenerPendientesVencidos: async () => {
          listarLlamado = true;
          return [];
        },
      },
    },
    async () => {
      const { procesarSeguimientosV2Vencidos } = require("../services/seguimientoV2/seguimientoV2Worker");
      return procesarSeguimientosV2Vencidos({ fromWorker: true });
    }
  );

  assert.strictEqual(resultado.lock, "acquired");
  assert.strictEqual(listarLlamado, true);
  assert.strictEqual(liberarLlamado, true);
  ok("V2: lock adquirido → lista pendientes y libera lock");
}

/* ─── Job: intervalo no se apaga ante transient; sí ante permanente ─── */

async function testJobV1IntervaloAnteLocks() {
  const jobFile = path.resolve(__dirname, "../jobs/seguimientoWorker.js");
  const executePath = resolveFrom(jobFile, "../services/seguimiento/executeSeguimiento");
  const lockModPath = resolveFrom(jobFile, "../services/seguimiento/seguimientoWorkerLock");

  async function runScenario({ tickResults, expectIntervalAlive, label }) {
    clearRequireCache(`${path.sep}jobs${path.sep}seguimientoWorker.js`);
    clearRequireCache(`${path.sep}services${path.sep}seguimiento${path.sep}`);
    delete global.__macbotSeguimientoWorkerIniciado;
    delete global.__macbotSeguimientoWorkerInstanceId;

    const realSetInterval = global.setInterval;
    const realClearInterval = global.clearInterval;
    let tickFn = null;
    let intervalCleared = false;
    let acquireAttempts = 0;

    global.setInterval = (fn) => {
      tickFn = fn;
      return { __fakeInterval: true };
    };
    global.clearInterval = (id) => {
      if (id && id.__fakeInterval) intervalCleared = true;
    };

    let tickIndex = 0;
    try {
      await withMockedRequires(
        {
          [lockModPath]: {
            verificarTablaLockDisponible: async () => ({ ok: true }),
            adquirirLockWorkerSeguimiento: async () => ({ acquired: false }),
            liberarLockWorkerSeguimiento: async () => {},
            LOCK_TTL_MS: 28000,
          },
          [executePath]: {
            procesarSeguimientosVencidos: async () => {
              acquireAttempts += 1;
              const r = tickResults[Math.min(tickIndex, tickResults.length - 1)];
              tickIndex += 1;
              return r;
            },
          },
        },
        async () => {
          const { startSeguimientoWorker } = require("../jobs/seguimientoWorker");
          await startSeguimientoWorker({ get: () => null });
          assert.ok(tickFn, "debe registrar setInterval");
          await tickFn();
          await tickFn();
        }
      );
    } finally {
      global.setInterval = realSetInterval;
      global.clearInterval = realClearInterval;
      delete global.__macbotSeguimientoWorkerIniciado;
      delete global.__macbotSeguimientoWorkerInstanceId;
    }

    assert.strictEqual(acquireAttempts, 2, "segundo tick debe reintentar");
    assert.strictEqual(intervalCleared, !expectIntervalAlive, label);
    ok(label);
  }

  await runScenario({
    tickResults: [
      { procesados: 0, enviados: 0, lock: "skipped", motivo: "lock_verificacion_fallida" },
      { procesados: 0, enviados: 0, lock: "acquired" },
    ],
    expectIntervalAlive: true,
    label: "V1 job: transient skipped no hace clearInterval; 2º tick reintenta",
  });

  await runScenario({
    tickResults: [
      { procesados: 0, enviados: 0, lock: "skipped", motivo: "lock_vigente" },
      { procesados: 0, enviados: 0, lock: "skipped", motivo: "lock_vigente" },
    ],
    expectIntervalAlive: true,
    label: "V1 job: lock_vigente omite ciclo sin apagar",
  });

  await runScenario({
    tickResults: [
      { procesados: 0, enviados: 0, lock: "no_lock_db", motivo: "lock_tabla_ausente" },
      { procesados: 0, enviados: 0, lock: "no_lock_db", motivo: "lock_tabla_ausente" },
    ],
    expectIntervalAlive: false,
    label: "V1 job: lock_tabla_ausente hace clearInterval",
  });

  // Defensa en profundidad: si aún llegara no_lock_db con motivo temporal, no apagar.
  await runScenario({
    tickResults: [
      {
        procesados: 0,
        enviados: 0,
        lock: "no_lock_db",
        motivo: "lock_verificacion_fallida",
      },
      { procesados: 0, enviados: 0, lock: "acquired" },
    ],
    expectIntervalAlive: true,
    label: "V1 job: no_lock_db+lock_verificacion_fallida NO apaga (defensa)",
  });
}

async function testJobV2IntervaloAnteLocks() {
  const jobFile = path.resolve(__dirname, "../jobs/seguimientoV2Worker.js");
  const servicePath = resolveFrom(jobFile, "../services/seguimientoV2/seguimientoV2Worker");
  const lockModPath = resolveFrom(jobFile, "../services/seguimientoV2/seguimientoV2WorkerLock");

  async function runScenario({ tickResults, expectIntervalAlive, label }) {
    clearRequireCache(`${path.sep}jobs${path.sep}seguimientoV2Worker.js`);
    clearRequireCache(`${path.sep}services${path.sep}seguimientoV2${path.sep}`);
    delete global.__macbotSeguimientoV2WorkerIniciado;
    delete global.__macbotSeguimientoV2WorkerInstanceId;

    const realSetInterval = global.setInterval;
    const realClearInterval = global.clearInterval;
    let tickFn = null;
    let intervalCleared = false;
    let acquireAttempts = 0;

    global.setInterval = (fn) => {
      tickFn = fn;
      return { __fakeInterval: true };
    };
    global.clearInterval = (id) => {
      if (id && id.__fakeInterval) intervalCleared = true;
    };

    let tickIndex = 0;
    try {
      await withMockedRequires(
        {
          [lockModPath]: {
            verificarTablaLockDisponible: async () => ({ ok: true }),
            adquirirLockWorkerSeguimientoV2: async () => ({ acquired: false }),
            liberarLockWorkerSeguimientoV2: async () => {},
            LOCK_TTL_MS: 28000,
          },
          [servicePath]: {
            procesarSeguimientosV2Vencidos: async () => {
              acquireAttempts += 1;
              const r = tickResults[Math.min(tickIndex, tickResults.length - 1)];
              tickIndex += 1;
              return r;
            },
          },
        },
        async () => {
          const { startSeguimientoV2Worker } = require("../jobs/seguimientoV2Worker");
          await startSeguimientoV2Worker({ get: () => null });
          assert.ok(tickFn, "debe registrar setInterval");
          await tickFn();
          await tickFn();
        }
      );
    } finally {
      global.setInterval = realSetInterval;
      global.clearInterval = realClearInterval;
      delete global.__macbotSeguimientoV2WorkerIniciado;
      delete global.__macbotSeguimientoV2WorkerInstanceId;
    }

    assert.strictEqual(acquireAttempts, 2, "segundo tick debe reintentar");
    assert.strictEqual(intervalCleared, !expectIntervalAlive, label);
    ok(label);
  }

  await runScenario({
    tickResults: [
      { procesados: 0, enviados: 0, lock: "skipped", motivo: "lock_verificacion_fallida" },
      { procesados: 0, enviados: 0, lock: "acquired" },
    ],
    expectIntervalAlive: true,
    label: "V2 job: transient skipped no hace clearInterval; 2º tick reintenta",
  });

  await runScenario({
    tickResults: [
      { procesados: 0, enviados: 0, lock: "no_lock_db", motivo: "sin_supabase" },
      { procesados: 0, enviados: 0, lock: "no_lock_db", motivo: "sin_supabase" },
    ],
    expectIntervalAlive: false,
    label: "V2 job: sin_supabase hace clearInterval",
  });
}

async function testProcesandoSeLiberaTrasTransient() {
  const jobFile = path.resolve(__dirname, "../jobs/seguimientoWorker.js");
  const executePath = resolveFrom(jobFile, "../services/seguimiento/executeSeguimiento");
  const lockModPath = resolveFrom(jobFile, "../services/seguimiento/seguimientoWorkerLock");

  clearRequireCache(`${path.sep}jobs${path.sep}seguimientoWorker.js`);
  delete global.__macbotSeguimientoWorkerIniciado;

  const realSetInterval = global.setInterval;
  const realClearInterval = global.clearInterval;
  let tickFn = null;
  let calls = 0;

  global.setInterval = (fn) => {
    tickFn = fn;
    return { __fakeInterval: true };
  };
  global.clearInterval = () => {};

  try {
    await withMockedRequires(
      {
        [lockModPath]: {
          verificarTablaLockDisponible: async () => ({ ok: true }),
          LOCK_TTL_MS: 28000,
        },
        [executePath]: {
          procesarSeguimientosVencidos: async () => {
            calls += 1;
            return {
              procesados: 0,
              enviados: 0,
              lock: "skipped",
              motivo: "lock_verificacion_fallida",
            };
          },
        },
      },
      async () => {
        const { startSeguimientoWorker } = require("../jobs/seguimientoWorker");
        await startSeguimientoWorker({ get: () => null });
        await tickFn();
        await tickFn();
        await tickFn();
      }
    );
  } finally {
    global.setInterval = realSetInterval;
    global.clearInterval = realClearInterval;
    delete global.__macbotSeguimientoWorkerIniciado;
  }

  assert.strictEqual(calls, 3, "procesando debe liberarse en finally tras cada tick");
  ok("V1 job: procesando se libera tras transient (3 ticks ejecutados)");
}

async function main() {
  console.log("=== seguimientoWorkerLockRecovery ===\n");
  testClasificacionMotivos();
  await testV1ClasificacionLock();
  await testV1LockAdquiridoProcesa();
  await testV2ClasificacionLock();
  await testV2LockAdquiridoProcesa();
  await testJobV1IntervaloAnteLocks();
  await testJobV2IntervaloAnteLocks();
  await testProcesandoSeLiberaTrasTransient();
  console.log(`\n✅ ${passed} aserciones OK`);
}

main().catch((err) => {
  console.error("❌ FAIL", err);
  process.exit(1);
});
