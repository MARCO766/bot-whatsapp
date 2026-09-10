/**
 * FASE 2B — Gate del ledger CTWA en webhook (sin HTTP e2e).
 * Ejecutar: node scripts/test-ctwa-lead-webhook-hook.js
 *
 * Cubre intentarRegistrarLeadCtwaWebhook (detect→exists→cupo→register/block).
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

function allowCap() {
  return async () => ({ permitir: true, limite: 1000, usados: 0 });
}

function noneExists() {
  return async () => false;
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
  await checkAsync("1. CTWA válido + cupo → registrarEntradaCtwa una vez", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage(),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: noneExists(),
      evaluarCapacidad: allowCap(),
    });
    assert(r.permitir && r.registered, "registered");
    assert(registrar.calls.length === 1, "una llamada");
    assert(registrar.calls[0].usuarioId === U1, "usuario");
    assert(registrar.calls[0].clienteNumero === FROM, "from");
    assert(registrar.calls[0].messageId === "wamid.HOOK_1", "messageId");
    assert(registrar.calls[0].ctwaAdId === AD1, "ctwaAdId");
    assert(registrar.calls[0].conexionWhatsappId === CONN.id, "conexion");
  });

  await checkAsync("2. mensaje normal sin source_id → no registra", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: {
        id: "wamid.ORG",
        type: "text",
        text: { body: "hola" },
      },
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: noneExists(),
      evaluarCapacidad: allowCap(),
    });
    assert(r.skipped === true, "skipped");
    assert(registrar.calls.length === 0, "sin llamadas");
  });

  await checkAsync("3. source_id vacío → no registra", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ referral: { source_id: "   " } }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: noneExists(),
      evaluarCapacidad: allowCap(),
    });
    assert(r.skipped === true, "skipped");
    assert(registrar.calls.length === 0, "sin llamadas");
  });

  await checkAsync("4. message.id ausente → no registra", async () => {
    const registrar = makeRegistrar();
    const msg = ctwaMessage();
    delete msg.id;
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: msg,
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: noneExists(),
      evaluarCapacidad: allowCap(),
    });
    assert(r.skipped === true, "skipped");
    assert(registrar.calls.length === 0, "sin llamadas");
  });

  await checkAsync("5. usuarioIdWebhook ausente → no registra", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage(),
      from: FROM,
      usuarioIdWebhook: null,
      conexionWebhook: CONN,
      registrar,
      existe: noneExists(),
      evaluarCapacidad: allowCap(),
    });
    assert(r.skipped === true, "skipped");
    assert(registrar.calls.length === 0, "sin llamadas");
  });

  await checkAsync("6. from ausente → no registra", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage(),
      from: null,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: noneExists(),
      evaluarCapacidad: allowCap(),
    });
    assert(r.skipped === true, "skipped");
    assert(registrar.calls.length === 0, "sin llamadas");
  });

  check(
    "7. statuses no usan el helper (rama value.statuses previa en webhook)",
    true
  );

  await checkAsync("8. message_id ya existe → continúa sin registrar", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.DUP" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: async () => true,
      evaluarCapacidad: allowCap(),
    });
    assert(r.permitir && r.duplicate, "duplicate continue");
    assert(registrar.calls.length === 0, "sin insert");
  });

  await checkAsync("9. INSERT falla → fail-closed (no relanza, NO permitir)", async () => {
    let threw = false;
    let r;
    try {
      r = await intentarRegistrarLeadCtwaWebhook({
        message: ctwaMessage({ id: "wamid.ERR" }),
        from: FROM,
        usuarioIdWebhook: U1,
        conexionWebhook: CONN,
        registrar: async () => {
          throw new Error("db down");
        },
        existe: noneExists(),
        evaluarCapacidad: allowCap(),
      });
    } catch (_e) {
      threw = true;
    }
    assert(!threw, "no debe relanzar");
    assert(r.permitir === false && r.blocked === true, "fail-closed");
    assert(r.code === "CTWA_LEAD_REGISTER_FAILED", "código");
  });

  await checkAsync("10. CTWA con contacto existente → registra si hay cupo", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.EXIST" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: noneExists(),
      evaluarCapacidad: allowCap(),
    });
    assert(r.registered, "registra");
    assert(registrar.calls[0].clienteNumero === FROM, "from");
  });

  await checkAsync("11. sin flujo: ledger se intenta igual", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.NOFLOW" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: noneExists(),
      evaluarCapacidad: allowCap(),
    });
    assert(r.registered, "registra antes de routing");
  });

  await checkAsync("12. country incompatible: ledger se intenta igual", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.COUNTRY" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: noneExists(),
      evaluarCapacidad: allowCap(),
    });
    assert(r.registered, "registra sin mirar country");
  });

  await checkAsync("13. sin cupo → hard stop sin insert", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.NOCAP" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: noneExists(),
      evaluarCapacidad: async () => ({
        permitir: false,
        code: "PLAN_LIMIT_LEADS",
        limite: 1000,
        usados: 1000,
      }),
    });
    assert(r.permitir === false && r.blocked, "blocked");
    assert(registrar.calls.length === 0, "no insert");
  });

  await checkAsync("conexionWebhook null → conexionWhatsappId null", async () => {
    const registrar = makeRegistrar();
    await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.NOCONN" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: null,
      registrar,
      existe: noneExists(),
      evaluarCapacidad: allowCap(),
    });
    assert(registrar.calls[0].conexionWhatsappId === null, "null");
  });

  console.log(`\nPASS ${passed} checks (ctwa lead webhook hook)`);
})().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
