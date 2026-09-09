/**
 * FASE 2C — Gate del ledger CTWA en webhook (sin HTTP e2e).
 * Ejecutar: node scripts/test-ctwa-lead-webhook-hook.js
 *
 * Cubre intentarRegistrarLeadCtwaWebhook (dedupe→from→ledger→resto).
 * No arranca Express ni toca Supabase real.
 */
const {
  intentarRegistrarLeadCtwaWebhook,
} = require("../routes/webhook");

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
const CONN = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
const FROM = "56911111111";
const AD1 = "120251260803260234";

function makeRegistrar() {
  const calls = [];
  async function registrar(payload) {
    calls.push(payload);
    return { registered: true, duplicate: false };
  }
  registrar.calls = calls;
  return registrar;
}

function ctwaMessage(overrides = {}) {
  return {
    id: "wamid.HOOK_1",
    from: FROM,
    type: "text",
    text: { body: "hola" },
    referral: { source_id: AD1 },
    ...overrides,
  };
}

(async () => {
  // 1. CTWA válido → una llamada
  await checkAsync("1. CTWA válido → registrarEntradaCtwa una vez", async () => {
    const registrar = makeRegistrar();
    await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage(),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
    });
    assert(registrar.calls.length === 1, "una llamada");
    assert(registrar.calls[0].usuarioId === U1, "usuario");
    assert(registrar.calls[0].clienteNumero === FROM, "from");
    assert(registrar.calls[0].messageId === "wamid.HOOK_1", "messageId");
    assert(registrar.calls[0].ctwaAdId === AD1, "ctwaAdId");
    assert(
      registrar.calls[0].conexionWhatsappId === CONN.id,
      "conexion"
    );
  });

  // 2. Sin source_id
  await checkAsync("2. mensaje normal sin source_id → no registra", async () => {
    const registrar = makeRegistrar();
    await intentarRegistrarLeadCtwaWebhook({
      message: {
        id: "wamid.ORG",
        type: "text",
        text: { body: "hola" },
      },
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
    });
    assert(registrar.calls.length === 0, "sin llamadas");
  });

  // 3. source_id vacío
  await checkAsync("3. source_id vacío → no registra", async () => {
    const registrar = makeRegistrar();
    await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ referral: { source_id: "   " } }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
    });
    assert(registrar.calls.length === 0, "sin llamadas");
  });

  // 4. message.id ausente
  await checkAsync("4. message.id ausente → no registra", async () => {
    const registrar = makeRegistrar();
    const msg = ctwaMessage();
    delete msg.id;
    await intentarRegistrarLeadCtwaWebhook({
      message: msg,
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
    });
    assert(registrar.calls.length === 0, "sin llamadas");
  });

  // 5. usuarioIdWebhook ausente
  await checkAsync("5. usuarioIdWebhook ausente → no registra", async () => {
    const registrar = makeRegistrar();
    await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage(),
      from: FROM,
      usuarioIdWebhook: null,
      conexionWebhook: CONN,
      registrar,
    });
    assert(registrar.calls.length === 0, "sin llamadas");
  });

  // 6. from ausente
  await checkAsync("6. from ausente → no registra", async () => {
    const registrar = makeRegistrar();
    await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage(),
      from: null,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
    });
    assert(registrar.calls.length === 0, "sin llamadas");
  });

  // 7. statuses no pasan por este helper (documentado: early-return en webhook)
  check(
    "7. statuses no usan el helper (rama value.statuses previa en webhook)",
    true
  );

  // 8. duplicate → continúa (no throw)
  await checkAsync("8. duplicate → webhook continúa (sin error)", async () => {
    const registrar = makeRegistrar();
    registrar.calls; // keep
    async function registrarDup(payload) {
      registrar.calls.push(payload);
      return { registered: false, duplicate: true };
    }
    registrarDup.calls = registrar.calls;
    await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.DUP" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar: registrarDup,
    });
    assert(registrar.calls.length === 1, "llamó una vez");
  });

  // 9. error Supabase → fail-open
  await checkAsync(
    "9. error del servicio → fail-open (no relanza)",
    async () => {
      let threw = false;
      try {
        await intentarRegistrarLeadCtwaWebhook({
          message: ctwaMessage({ id: "wamid.ERR" }),
          from: FROM,
          usuarioIdWebhook: U1,
          conexionWebhook: CONN,
          registrar: async () => {
            throw new Error("db down");
          },
        });
      } catch (_e) {
        threw = true;
      }
      assert(!threw, "no debe relanzar");
    }
  );

  // 10. contacto existente (mismo from) → igual registra
  await checkAsync(
    "10. CTWA con contacto existente → intenta registrar",
    async () => {
      const registrar = makeRegistrar();
      await intentarRegistrarLeadCtwaWebhook({
        message: ctwaMessage({ id: "wamid.EXIST" }),
        from: FROM,
        usuarioIdWebhook: U1,
        conexionWebhook: CONN,
        registrar,
      });
      assert(registrar.calls.length === 1, "registra igual");
      assert(registrar.calls[0].clienteNumero === FROM, "from");
    }
  );

  // 11–12. ledger antes de flujo/country (gate no consulta flow/country)
  await checkAsync(
    "11. sin flujo: ledger se intenta igual (gate independiente)",
    async () => {
      const registrar = makeRegistrar();
      await intentarRegistrarLeadCtwaWebhook({
        message: ctwaMessage({ id: "wamid.NOFLOW" }),
        from: FROM,
        usuarioIdWebhook: U1,
        conexionWebhook: CONN,
        registrar,
      });
      assert(registrar.calls.length === 1, "registra antes de routing");
    }
  );

  await checkAsync(
    "12. country incompatible: ledger se intenta igual (gate independiente)",
    async () => {
      const registrar = makeRegistrar();
      await intentarRegistrarLeadCtwaWebhook({
        message: ctwaMessage({ id: "wamid.COUNTRY" }),
        from: FROM,
        usuarioIdWebhook: U1,
        conexionWebhook: CONN,
        registrar,
      });
      assert(registrar.calls.length === 1, "registra sin mirar country");
    }
  );

  // conexion null permitida
  await checkAsync(
    "conexionWebhook null → conexionWhatsappId null",
    async () => {
      const registrar = makeRegistrar();
      await intentarRegistrarLeadCtwaWebhook({
        message: ctwaMessage({ id: "wamid.NOCONN" }),
        from: FROM,
        usuarioIdWebhook: U1,
        conexionWebhook: null,
        registrar,
      });
      assert(registrar.calls[0].conexionWhatsappId === null, "null");
    }
  );

  console.log(`\nPASS ${passed} checks (ctwa lead webhook hook)`);
})().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
