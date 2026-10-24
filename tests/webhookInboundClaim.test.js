/**
 * Claim durable por wamid — mocks HTTP, sin Supabase real.
 * Ejecutar: node tests/webhookInboundClaim.test.js
 *
 * Nota: "otra instancia" se SIMULA con un store compartido en el mock
 * (mismo proceso). No demuestra multi-proceso real.
 */
const assert = require("assert");
const {
  reclamarMensajeEntrantePorWamid,
  isUniqueViolation,
} = require("../services/webhookInboundClaim");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("✅", name);
}

function mockStore() {
  const byWamid = new Map();
  const axios = {
    get: async (url) => {
      const m = /whatsapp_message_id=eq\.([^&]+)/.exec(url);
      const wamid = m ? decodeURIComponent(m[1]) : null;
      const row = wamid && byWamid.has(wamid) ? byWamid.get(wamid) : null;
      return { data: row ? [row] : [] };
    },
    post: async (_url, body) => {
      const wamid = body.whatsapp_message_id;
      if (byWamid.has(wamid)) {
        const err = new Error("duplicate");
        err.response = { status: 409, data: { code: "23505" } };
        throw err;
      }
      const row = { id: `id-${byWamid.size + 1}`, ...body };
      byWamid.set(wamid, row);
      return { data: [row] };
    },
  };
  return {
    axios,
    supabaseUrl: "https://example.supabase.co",
    supabaseKey: "key",
    byWamid,
  };
}

async function testClaimNuevo() {
  const deps = mockStore();
  const r = await reclamarMensajeEntrantePorWamid(
    {
      cliente_numero: "591",
      usuario_id: "u1",
      direccion: "entrante",
      whatsapp_message_id: "wamid.NEW1",
      contenido: "hola",
    },
    deps
  );
  assert.strictEqual(r.claimed, true);
  assert.strictEqual(r.duplicate, false);
  assert.ok(deps.byWamid.has("wamid.NEW1"));
  ok("primer wamid → claimed");
}

async function testRetryMismoWamidMientrasActivo() {
  const deps = mockStore();
  const fila = {
    cliente_numero: "591",
    usuario_id: "u1",
    direccion: "entrante",
    whatsapp_message_id: "wamid.DUP",
    contenido: "hola",
  };
  const first = await reclamarMensajeEntrantePorWamid(fila, deps);
  assert.strictEqual(first.claimed, true);
  // Simula reintento Meta / "otra instancia" leyendo el mismo store
  const second = await reclamarMensajeEntrantePorWamid(fila, deps);
  assert.strictEqual(second.claimed, false);
  assert.strictEqual(second.duplicate, true);
  assert.strictEqual(deps.byWamid.size, 1);
  ok("mismo wamid activo/persistido → duplicate (simulación store compartido)");
}

async function testUniqueConflictEnInsert() {
  const deps = mockStore();
  // Fuerza carrera: GET vacío pero POST choca
  deps.axios.get = async () => ({ data: [] });
  let posts = 0;
  const realPost = deps.axios.post;
  deps.axios.post = async (url, body) => {
    posts += 1;
    if (posts === 1) return realPost(url, body);
    const err = new Error("dup");
    err.response = { status: 409, data: { code: "23505" } };
    throw err;
  };
  await reclamarMensajeEntrantePorWamid(
    { whatsapp_message_id: "wamid.RACE", direccion: "entrante" },
    deps
  );
  const r2 = await reclamarMensajeEntrantePorWamid(
    { whatsapp_message_id: "wamid.RACE", direccion: "entrante" },
    deps
  );
  assert.strictEqual(r2.duplicate, true);
  ok("conflicto UNIQUE en INSERT → duplicate");
}

async function testSinWamid() {
  const r = await reclamarMensajeEntrantePorWamid(
    { direccion: "entrante", contenido: "x" },
    mockStore()
  );
  assert.strictEqual(r.claimed, false);
  assert.strictEqual(r.error, true);
  ok("sin wamid → no claim");
}

async function testFalloProcesamientoTrasClaimDocumentado() {
  // Tras claim OK, un fallo posterior NO libera el wamid.
  // Un reintento verá duplicate → no reejecuta bot (posible reply perdido).
  const deps = mockStore();
  const claim = await reclamarMensajeEntrantePorWamid(
    {
      whatsapp_message_id: "wamid.CRASH",
      direccion: "entrante",
      usuario_id: "u",
      cliente_numero: "1",
    },
    deps
  );
  assert.strictEqual(claim.claimed, true);
  // "crash" simulado: no hacemos nada más
  const retry = await reclamarMensajeEntrantePorWamid(
    {
      whatsapp_message_id: "wamid.CRASH",
      direccion: "entrante",
      usuario_id: "u",
      cliente_numero: "1",
    },
    deps
  );
  assert.strictEqual(retry.duplicate, true);
  ok("fallo post-claim → retry no reprocesa (sin recuperación automática)");
}

function testIsUniqueViolation() {
  const err = new Error("x");
  err.response = { status: 409, data: { code: "23505" } };
  assert.strictEqual(isUniqueViolation(err), true);
  ok("detecta violación UNIQUE PostgREST");
}

(async () => {
  await testClaimNuevo();
  await testRetryMismoWamidMientrasActivo();
  await testUniqueConflictEnInsert();
  await testSinWamid();
  await testFalloProcesamientoTrasClaimDocumentado();
  testIsUniqueViolation();
  console.log(`\n${passed} tests OK`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
