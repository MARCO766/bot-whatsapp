/**
 * FASE 2B — Tests del ledger CTWA (servicio aislado).
 * Ejecutar: node scripts/test-ctwa-lead-ledger.js
 *
 * Usa mock HTTP (deps.post). NO inserta en Supabase real / producción.
 * La constraint UNIQUE(usuario_id, message_id) se simula en el mock;
 * la verificación real queda para un entorno de prueba dedicado (no ejecutada aquí).
 */
const {
  registrarEntradaCtwa,
  normalizarPayloadEntradaCtwa,
} = require("../services/ctwaLeadService");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let passed = 0;
function check(name, cond) {
  assert(cond, name);
  passed += 1;
  console.log("OK:", name);
}

async function checkAsync(name, fn) {
  await fn();
  passed += 1;
  console.log("OK:", name);
}

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const NUM_A = "56911111111";
const NUM_B = "56922222222";
const AD1 = "120251260803260234";
const AD2 = "999999999999999999";
const WAMID_1 = "wamid.TEST_AAA";
const WAMID_2 = "wamid.TEST_BBB";
const WAMID_3 = "wamid.TEST_CCC";
const WAMID_4 = "wamid.TEST_DDD";
const WAMID_5 = "wamid.TEST_EEE";

/** Mock PostgREST ignore-duplicates: almacena por `${usuario_id}|${message_id}`. */
function createIdempotentPostMock() {
  const store = new Map();
  const calls = [];

  async function post(url, body) {
    calls.push({ url, body });
    assert(
      String(url).includes("on_conflict=usuario_id,message_id"),
      "URL debe incluir on_conflict=usuario_id,message_id"
    );
    const key = `${body.usuario_id}|${body.message_id}`;
    if (store.has(key)) {
      return { data: [] };
    }
    const row = {
      id: `row-${store.size + 1}`,
      ...body,
      created_at: new Date().toISOString(),
    };
    store.set(key, row);
    return { data: [row] };
  }

  post.calls = calls;
  post.store = store;
  return post;
}

function baseParams(overrides = {}) {
  return {
    usuarioId: U1,
    clienteNumero: NUM_A,
    conexionWhatsappId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    messageId: WAMID_1,
    ctwaAdId: AD1,
    ...overrides,
  };
}

(async () => {
  // --- Validación pura ---
  check(
    "payload válido se normaliza (trim)",
    (() => {
      const p = normalizarPayloadEntradaCtwa(
        baseParams({
          messageId: `  ${WAMID_1}  `,
          ctwaAdId: `  ${AD1}  `,
          clienteNumero: `  ${NUM_A}  `,
        })
      );
      return (
        p.message_id === WAMID_1 &&
        p.ctwa_ad_id === AD1 &&
        p.cliente_numero === NUM_A
      );
    })()
  );

  check(
    "conexionWhatsappId null → null en payload",
    normalizarPayloadEntradaCtwa(baseParams({ conexionWhatsappId: null }))
      .conexion_whatsapp_id === null
  );

  // --- TEST 1 ---
  await checkAsync("1. entrada CTWA válida → registered=true", async () => {
    const post = createIdempotentPostMock();
    const r = await registrarEntradaCtwa(baseParams(), { post });
    assert(r.registered === true, "registered");
    assert(r.duplicate === false, "duplicate");
    assert(post.store.size === 1, "una fila");
  });

  // --- TEST 2 ---
  await checkAsync(
    "2. mismo usuario + mismo messageId → duplicate=true",
    async () => {
      const post = createIdempotentPostMock();
      const a = await registrarEntradaCtwa(baseParams(), { post });
      const b = await registrarEntradaCtwa(baseParams(), { post });
      assert(a.registered === true && a.duplicate === false, "primera");
      assert(b.registered === false && b.duplicate === true, "segunda");
      assert(post.store.size === 1, "sigue 1 fila");
    }
  );

  // --- TEST 3 ---
  await checkAsync(
    "3. mismo contacto + mismo Ad + messageId distinto → 2 registros",
    async () => {
      const post = createIdempotentPostMock();
      const a = await registrarEntradaCtwa(
        baseParams({ messageId: WAMID_1, ctwaAdId: AD1 }),
        { post }
      );
      const b = await registrarEntradaCtwa(
        baseParams({ messageId: WAMID_2, ctwaAdId: AD1 }),
        { post }
      );
      assert(a.registered && b.registered, "ambos registered");
      assert(post.store.size === 2, "dos filas");
    }
  );

  // --- TEST 4 ---
  await checkAsync(
    "4. mismo contacto + Ad distinto + messageId distinto → 2 registros",
    async () => {
      const post = createIdempotentPostMock();
      const a = await registrarEntradaCtwa(
        baseParams({ messageId: WAMID_1, ctwaAdId: AD1 }),
        { post }
      );
      const b = await registrarEntradaCtwa(
        baseParams({ messageId: WAMID_2, ctwaAdId: AD2 }),
        { post }
      );
      assert(a.registered && b.registered, "ambos registered");
      assert(post.store.size === 2, "dos filas");
    }
  );

  // --- TEST 5 ---
  await checkAsync(
    "5. contacto distinto + mismo Ad + messageId distinto → 2 registros",
    async () => {
      const post = createIdempotentPostMock();
      const a = await registrarEntradaCtwa(
        baseParams({
          clienteNumero: NUM_A,
          messageId: WAMID_3,
          ctwaAdId: AD1,
        }),
        { post }
      );
      const b = await registrarEntradaCtwa(
        baseParams({
          clienteNumero: NUM_B,
          messageId: WAMID_4,
          ctwaAdId: AD1,
        }),
        { post }
      );
      assert(a.registered && b.registered, "ambos registered");
      assert(post.store.size === 2, "dos filas");
    }
  );

  // --- TEST 6 ---
  await checkAsync("6. messageId vacío → rechazo", async () => {
    let threw = false;
    try {
      await registrarEntradaCtwa(baseParams({ messageId: "   " }), {
        post: async () => {
          throw new Error("no debe llamar post");
        },
      });
    } catch (e) {
      threw = e.status === 400 && /messageId/i.test(e.message);
    }
    assert(threw, "debe lanzar 400 messageId");
  });

  // --- TEST 7 ---
  await checkAsync("7. ctwaAdId vacío → rechazo", async () => {
    let threw = false;
    try {
      await registrarEntradaCtwa(baseParams({ ctwaAdId: "" }), {
        post: async () => {
          throw new Error("no debe llamar post");
        },
      });
    } catch (e) {
      threw = e.status === 400 && /ctwaAdId/i.test(e.message);
    }
    assert(threw, "debe lanzar 400 ctwaAdId");
  });

  // --- TEST 8 ---
  await checkAsync("8. usuarioId ausente → rechazo", async () => {
    let threw = false;
    try {
      await registrarEntradaCtwa(baseParams({ usuarioId: null }), {
        post: async () => {
          throw new Error("no debe llamar post");
        },
      });
    } catch (e) {
      threw = e.status === 400 && /usuarioId/i.test(e.message);
    }
    assert(threw, "debe lanzar 400 usuarioId");
  });

  // --- TEST 9 ---
  await checkAsync("9. clienteNumero ausente → rechazo", async () => {
    let threw = false;
    try {
      await registrarEntradaCtwa(baseParams({ clienteNumero: undefined }), {
        post: async () => {
          throw new Error("no debe llamar post");
        },
      });
    } catch (e) {
      threw = e.status === 400 && /clienteNumero/i.test(e.message);
    }
    assert(threw, "debe lanzar 400 clienteNumero");
  });

  // --- TEST 10 ---
  await checkAsync(
    "10. conexionWhatsappId null → permite registro",
    async () => {
      const post = createIdempotentPostMock();
      const r = await registrarEntradaCtwa(
        baseParams({
          messageId: WAMID_5,
          conexionWhatsappId: null,
        }),
        { post }
      );
      assert(r.registered === true, "registered");
      assert(post.calls[0].body.conexion_whatsapp_id === null, "null en body");
    }
  );

  // --- TEST 11 ---
  await checkAsync(
    "11. mismo messageId + usuario distinto → no chocan (UNIQUE compuesto)",
    async () => {
      const post = createIdempotentPostMock();
      const a = await registrarEntradaCtwa(
        baseParams({ usuarioId: U1, messageId: WAMID_1 }),
        { post }
      );
      const b = await registrarEntradaCtwa(
        baseParams({ usuarioId: U2, messageId: WAMID_1 }),
        { post }
      );
      assert(a.registered && b.registered, "ambos registered");
      assert(post.store.size === 2, "dos filas por tenant");
    }
  );

  // --- Error real no se marca como duplicate ---
  await checkAsync(
    "error real de Supabase no se convierte en duplicate",
    async () => {
      let threw = false;
      try {
        await registrarEntradaCtwa(baseParams({ messageId: "wamid.ERR" }), {
          post: async () => {
            const err = new Error("boom");
            err.response = { status: 500, data: { message: "db down" } };
            throw err;
          },
        });
      } catch (e) {
        threw = e.code === "CTWA_LEAD_SUPABASE" && e.status === 500;
      }
      assert(threw, "debe lanzar CTWA_LEAD_SUPABASE");
    }
  );

  // Prefer header
  await checkAsync(
    "INSERT usa Prefer ignore-duplicates,return=representation",
    async () => {
      let prefer = null;
      await registrarEntradaCtwa(baseParams({ messageId: "wamid.HDR" }), {
        post: async (_url, _body, cfg) => {
          prefer = cfg?.headers?.Prefer;
          return { data: [{ id: "x" }] };
        },
      });
      assert(
        prefer === "resolution=ignore-duplicates,return=representation",
        `Prefer=${prefer}`
      );
    }
  );

  console.log(`\nPASS ${passed} checks (ctwa lead ledger — mock, sin Supabase)`);
  console.log(
    "NOTA: integración real UNIQUE en BD requiere entorno de prueba aislado; no ejecutada."
  );
})().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
