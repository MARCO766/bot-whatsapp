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

async function testTimeoutLookupIntentaInsert() {
  const deps = mockStore();
  let posts = 0;
  deps.axios.get = async () => {
    const error = new Error("timeout of 500ms exceeded");
    error.code = "ECONNABORTED";
    throw error;
  };
  deps.axios.post = async (_url, body) => {
    posts += 1;
    const row = { id: "id-to", ...body };
    deps.byWamid.set(body.whatsapp_message_id, row);
    return { data: [row] };
  };
  const resultado = await reclamarMensajeEntrantePorWamid(
    { whatsapp_message_id: "wamid.TO", direccion: "entrante" },
    deps
  );
  assert.strictEqual(posts, 1);
  assert.strictEqual(resultado.claimed, true);
  assert.strictEqual(resultado.incierto, false);
  assert.strictEqual(resultado.guardado, true);
  ok("timeout de lookup intenta el insert y lo guarda");
}

async function testInsert5xxEsIncierto() {
  const deps = mockStore();
  deps.axios.post = async () => {
    const error = new Error("upstream");
    error.response = { status: 503, data: { message: "timeout" } };
    throw error;
  };
  const resultado = await reclamarMensajeEntrantePorWamid(
    { whatsapp_message_id: "wamid.5XX", direccion: "entrante" },
    deps
  );
  assert.strictEqual(resultado.incierto, true);
  assert.strictEqual(resultado.claimed, false);
  assert.strictEqual(resultado.guardado, null);
  assert.strictEqual(resultado.fase, "insert");
  assert.strictEqual(resultado.duplicate, false);
  ok("5xx en el insert queda incierto y no es duplicado");
}

async function testConexionPerdidaEnInsert() {
  const deps = mockStore();
  deps.axios.post = async () => {
    const error = new Error("socket hang up");
    error.code = "ECONNRESET";
    throw error;
  };
  const resultado = await reclamarMensajeEntrantePorWamid(
    { whatsapp_message_id: "wamid.RESET", direccion: "entrante" },
    deps
  );
  assert.strictEqual(resultado.incierto, true);
  assert.strictEqual(resultado.guardado, null);
  assert.strictEqual(resultado.fase, "insert");
  assert.strictEqual(resultado.claimed, false);
  ok("pérdida de conexión en el insert queda incierta");
}

async function testCodigoDeConexionIncierto(code) {
  const deps = mockStore();
  deps.axios.post = async () => {
    const error = new Error(code);
    error.code = code;
    throw error;
  };
  const resultado = await reclamarMensajeEntrantePorWamid(
    { whatsapp_message_id: `wamid.${code}`, direccion: "entrante" },
    deps
  );
  assert.strictEqual(resultado.incierto, true, code);
  assert.strictEqual(resultado.duplicate, false, code);
  assert.strictEqual(resultado.claimed, false, code);
  assert.strictEqual(resultado.guardado, null, code);
  assert.strictEqual(resultado.fase, "insert", code);
  assert.strictEqual(resultado.reason, "claim_incierto", code);
  ok(`${code} en el insert queda incierto`);
}

async function testHttp5xxIncierto(status) {
  const deps = mockStore();
  deps.axios.post = async () => {
    const error = new Error(`HTTP ${status}`);
    error.response = {
      status,
      data: { message: "duplicate key on whatsapp_message_id unique constraint" },
    };
    throw error;
  };
  const resultado = await reclamarMensajeEntrantePorWamid(
    { whatsapp_message_id: `wamid.http${status}`, direccion: "entrante" },
    deps
  );
  assert.strictEqual(isUniqueViolation({
    response: { status, data: { message: "duplicate key on whatsapp_message_id unique constraint" } },
  }), false, String(status));
  assert.strictEqual(resultado.incierto, true, String(status));
  assert.strictEqual(resultado.duplicate, false, String(status));
  assert.strictEqual(resultado.fase, "insert", String(status));
  ok(`HTTP ${status} con texto de duplicado queda incierto`);
}

async function testHttp4xxEsRechazo(status) {
  const deps = mockStore();
  deps.axios.post = async () => {
    const error = new Error(`HTTP ${status} timeout duplicate whatsapp_message_id`);
    error.code = "ECONNRESET";
    error.response = {
      status,
      data: { message: "timeout duplicate whatsapp_message_id" },
    };
    throw error;
  };
  const resultado = await reclamarMensajeEntrantePorWamid(
    { whatsapp_message_id: `wamid.http${status}`, direccion: "entrante" },
    deps
  );
  assert.strictEqual(resultado.incierto, false, String(status));
  assert.strictEqual(resultado.duplicate, false, String(status));
  assert.strictEqual(resultado.rechazado, true, String(status));
  assert.strictEqual(resultado.reason, "claim_rechazado", String(status));
  assert.strictEqual(resultado.guardado, false, String(status));
  ok(`HTTP ${status} queda como rechazo definitivo`);
}

async function testDuplicado409() {
  const deps = mockStore();
  deps.axios.post = async () => {
    const error = new Error("conflict");
    error.response = { status: 409, data: { message: "conflict" } };
    throw error;
  };
  const resultado = await reclamarMensajeEntrantePorWamid(
    { whatsapp_message_id: "wamid.409", direccion: "entrante" },
    deps
  );
  assert.strictEqual(resultado.duplicate, true);
  assert.strictEqual(resultado.incierto, false);
  assert.strictEqual(resultado.confirmado, true);
  ok("HTTP 409 es duplicado confirmado");
}

async function testDuplicado23505En5xx() {
  const deps = mockStore();
  deps.axios.post = async () => {
    const error = new Error("unique");
    error.response = { status: 500, data: { code: "23505", message: "unique violation" } };
    throw error;
  };
  const resultado = await reclamarMensajeEntrantePorWamid(
    { whatsapp_message_id: "wamid.23505", direccion: "entrante" },
    deps
  );
  assert.strictEqual(resultado.duplicate, true);
  assert.strictEqual(resultado.incierto, false);
  ok("SQLSTATE 23505 es duplicado aunque el HTTP sea 500");
}

function testIsUniqueViolation() {
  const confirmado = new Error("x");
  confirmado.response = { status: 409, data: { code: "23505" } };
  assert.strictEqual(isUniqueViolation(confirmado), true);

  const solo409 = new Error("conflict");
  solo409.response = { status: 409, data: { message: "conflict" } };
  assert.strictEqual(isUniqueViolation(solo409), true);

  const codigoEn500 = new Error("unique");
  codigoEn500.response = { status: 500, data: { error_code: "23505" } };
  assert.strictEqual(isUniqueViolation(codigoEn500), true);

  const textoEn500 = new Error("duplicate whatsapp_message_id");
  textoEn500.response = { status: 500, data: { message: "23505 duplicate unique whatsapp_message_id" } };
  assert.strictEqual(isUniqueViolation(textoEn500), false);

  const textoEn400 = new Error("bad");
  textoEn400.response = { status: 400, data: { message: "duplicate whatsapp_message_id" } };
  assert.strictEqual(isUniqueViolation(textoEn400), false);
  ok("duplicado solo con HTTP 409 o SQLSTATE 23505");
}

(async () => {
  await testClaimNuevo();
  await testRetryMismoWamidMientrasActivo();
  await testUniqueConflictEnInsert();
  await testSinWamid();
  await testFalloProcesamientoTrasClaimDocumentado();
  await testTimeoutLookupIntentaInsert();
  await testConexionPerdidaEnInsert();
  await testInsert5xxEsIncierto();
  for (const code of ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ECONNABORTED"]) {
    await testCodigoDeConexionIncierto(code);
  }
  for (const status of [500, 502, 503, 504]) {
    await testHttp5xxIncierto(status);
  }
  for (const status of [400, 401, 403, 404, 408, 422, 429]) {
    await testHttp4xxEsRechazo(status);
  }
  await testDuplicado409();
  await testDuplicado23505En5xx();
  testIsUniqueViolation();
  console.log(`\n${passed} tests OK`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
