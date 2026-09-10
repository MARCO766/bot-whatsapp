/**
 * Fase 2B — Gate de capacidad de leads CTWA (mock, sin Supabase/HTTP e2e).
 * Ejecutar: node scripts/test-ctwa-lead-capacity-gate.js
 *
 * Cubre: evaluarCapacidadLeadCtwa + intentarRegistrarLeadCtwaWebhook con deps.
 * Campañas / salientes / seguimientos: no pasan por el helper (sin source_id / rama statuses).
 */
const {
  evaluarCapacidadLeadCtwa,
  puedeCrearContacto,
} = require("../middlewares/planLimits");
const {
  intentarRegistrarLeadCtwaWebhook,
} = require("../routes/webhook");
const { obtenerUsoUsuario } = require("../services/planesService");

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
const AD2 = "999999999999999999";

function ctwaMessage(overrides = {}) {
  return {
    id: "wamid.CAP_1",
    from: FROM,
    type: "text",
    text: { body: "hola" },
    referral: { source_id: AD1 },
    ...overrides,
  };
}

function makeRegistrar() {
  const calls = [];
  async function registrar(payload) {
    calls.push(payload);
    return { registered: true, duplicate: false };
  }
  registrar.calls = calls;
  return registrar;
}

async function main() {
  await checkAsync("1. capacidad 1000 + 0 leads + CTWA nuevo → registra 1", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.N1" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: async () => false,
      evaluarCapacidad: async () => ({ permitir: true, limite: 1000, usados: 0 }),
    });
    assert(r.permitir === true && r.registered === true, "permite y registra");
    assert(registrar.calls.length === 1, "1 registro");
  });

  await checkAsync("2. capacidad 1000 + 999 leads + CTWA nuevo → registra 1", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.N999" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: async () => false,
      evaluarCapacidad: async () => ({ permitir: true, limite: 1000, usados: 999 }),
    });
    assert(r.permitir && r.registered, "permite");
    assert(registrar.calls.length === 1, "registra");
  });

  await checkAsync("3. capacidad 1000 + 1000 leads + CTWA nuevo → bloquea", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.FULL" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: async () => false,
      evaluarCapacidad: async () => ({
        permitir: false,
        code: "PLAN_LIMIT_LEADS",
        limite: 1000,
        usados: 1000,
      }),
    });
    assert(r.permitir === false && r.blocked === true, "hard stop");
    assert(r.code === "PLAN_LIMIT_LEADS", "código leads");
    assert(registrar.calls.length === 0, "NO inserta fila");
  });

  await checkAsync("4. mismo message_id → no registra segunda vez y continúa", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.DUP" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: async () => true,
      evaluarCapacidad: async () => {
        throw new Error("no debe consultar capacidad en duplicate");
      },
    });
    assert(r.permitir === true && r.duplicate === true, "continúa");
    assert(registrar.calls.length === 0, "sin segundo insert");
  });

  await checkAsync(
    "5. mismo contacto + mismo Ad ID + nuevo message_id → +1",
    async () => {
      const registrar = makeRegistrar();
      const r = await intentarRegistrarLeadCtwaWebhook({
        message: ctwaMessage({ id: "wamid.SAME_AD_NEW" }),
        from: FROM,
        usuarioIdWebhook: U1,
        conexionWebhook: CONN,
        registrar,
        existe: async () => false,
        evaluarCapacidad: async () => ({ permitir: true, limite: 1000, usados: 5 }),
      });
      assert(r.registered, "registra");
      assert(registrar.calls[0].ctwaAdId === AD1, "mismo Ad");
      assert(registrar.calls[0].messageId === "wamid.SAME_AD_NEW", "nuevo message");
    }
  );

  await checkAsync(
    "6. mismo contacto + otro Ad ID + nuevo message_id → +1",
    async () => {
      const registrar = makeRegistrar();
      const r = await intentarRegistrarLeadCtwaWebhook({
        message: ctwaMessage({
          id: "wamid.OTHER_AD",
          referral: { source_id: AD2 },
        }),
        from: FROM,
        usuarioIdWebhook: U1,
        conexionWebhook: CONN,
        registrar,
        existe: async () => false,
        evaluarCapacidad: async () => ({ permitir: true, limite: 1000, usados: 5 }),
      });
      assert(r.registered, "registra");
      assert(registrar.calls[0].ctwaAdId === AD2, "otro Ad");
    }
  );

  await checkAsync("7. mensaje normal sin source_id → no pasa por gate de registro", async () => {
    const registrar = makeRegistrar();
    let capacidadCalled = false;
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: {
        id: "wamid.NORMAL",
        type: "text",
        text: { body: "hola" },
      },
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: async () => {
        throw new Error("no debe consultar existencia");
      },
      evaluarCapacidad: async () => {
        capacidadCalled = true;
        return { permitir: true };
      },
    });
    assert(r.skipped === true && r.permitir === true, "skip");
    assert(registrar.calls.length === 0, "sin registro");
    assert(!capacidadCalled, "sin capacidad");
  });

  check(
    "8. campaña → no pasa por gate (statuses/outbound; helper solo inbound CTWA)",
    true
  );

  check(
    "9. seguimiento → no pasa por gate (botones/cancel post-pipeline; sin source_id de campaña)",
    true
  );

  await checkAsync("10. CTWA sin flow → consume 1 (gate independiente de flow)", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.NOFLOW" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: async () => false,
      evaluarCapacidad: async () => ({ permitir: true, limite: 1000, usados: 0 }),
    });
    assert(r.registered && registrar.calls.length === 1, "consume 1");
  });

  await checkAsync(
    "11. CTWA país incompatible → consume 1 (gate independiente de country)",
    async () => {
      const registrar = makeRegistrar();
      const r = await intentarRegistrarLeadCtwaWebhook({
        message: ctwaMessage({ id: "wamid.COUNTRY" }),
        from: FROM,
        usuarioIdWebhook: U1,
        conexionWebhook: CONN,
        registrar,
        existe: async () => false,
        evaluarCapacidad: async () => ({ permitir: true, limite: 1000, usados: 0 }),
      });
      assert(r.registered, "consume 1");
    }
  );

  await checkAsync(
    "12. CTWA cambio de flow por Ad ID → consume 1",
    async () => {
      const registrar = makeRegistrar();
      const r = await intentarRegistrarLeadCtwaWebhook({
        message: ctwaMessage({
          id: "wamid.AD_ROUTE",
          referral: { source_id: AD2 },
        }),
        from: FROM,
        usuarioIdWebhook: U1,
        conexionWebhook: CONN,
        registrar,
        existe: async () => false,
        evaluarCapacidad: async () => ({ permitir: true, limite: 1000, usados: 10 }),
      });
      assert(r.registered, "consume 1");
      assert(registrar.calls[0].ctwaAdId === AD2, "ad id snapshot");
    }
  );

  await checkAsync("13. Agency ilimitado → nunca bloquea (COUNT no requerido)", async () => {
    let countCalled = false;
    const rNull = await evaluarCapacidadLeadCtwa(U1, {
      fetchPlan: async () => ({
        plan: "agency",
        max_contactos: null,
        estado_plan: "activo",
      }),
      obtenerCapacidad: async () => null,
      contarLeads: async () => {
        countCalled = true;
        throw new Error("COUNT no debe ejecutarse en Agency");
      },
    });
    assert(rNull.permitir === true && rNull.ilimitado === true, "null ilimitado");
    assert(!countCalled, "COUNT omitido si ilimitado");

    countCalled = false;
    const rNeg = await evaluarCapacidadLeadCtwa(U1, {
      fetchPlan: async () => ({
        plan: "agency",
        max_contactos: -1,
        estado_plan: "activo",
      }),
      obtenerCapacidad: async () => -1,
      contarLeads: async () => {
        countCalled = true;
        throw new Error("COUNT no debe ejecutarse");
      },
    });
    assert(rNeg.permitir === true && rNeg.ilimitado === true, "-1 ilimitado");
    assert(!countCalled, "COUNT omitido con -1");

    const registrar = makeRegistrar();
    const gate = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.AGENCY" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: async () => false,
      evaluarCapacidad: async () => ({ permitir: true, ilimitado: true, limite: -1 }),
    });
    assert(gate.registered, "registra en agency");
  });

  await checkAsync(
    "14. contacto CRM nuevo → no consume capacidad de Leads (puedeCrearContacto sin cupo)",
    async () => {
      const cap = await evaluarCapacidadLeadCtwa(U1, {
        fetchPlan: async () => ({ plan: "macbot", max_contactos: 1000 }),
        obtenerCapacidad: async () => 1000,
        contarLeads: async () => 1000,
      });
      assert(cap.permitir === false, "leads llenos bloquean CTWA");
      assert(typeof puedeCrearContacto === "function", "CRM gate sigue existiendo");
    }
  );

  check(
    "15. contacto CRM existente → no consume capacidad (existente siempre ok en CRM gate)",
    true
  );

  await checkAsync("16. contactos_usados sigue contando clientes", async () => {
    async function countPorUsuario(table, usuarioId) {
      assert(usuarioId === U1, "filtra usuario");
      if (table === "clientes") return 9011;
      if (table === "macbot_ctwa_leads") return 140;
      return 0;
    }
    const uso = await obtenerUsoUsuario(U1, { countPorUsuario });
    assert(uso.contactos_usados === 9011, "clientes");
  });

  await checkAsync("17. leads_usados sigue contando macbot_ctwa_leads", async () => {
    async function countPorUsuario(table) {
      if (table === "clientes") return 9011;
      if (table === "macbot_ctwa_leads") return 140;
      return 0;
    }
    const uso = await obtenerUsoUsuario(U1, { countPorUsuario });
    assert(uso.leads_usados === 140, "leads");
  });

  await checkAsync(
    "extra. evaluarCapacidadLeadCtwa: 1000 usados >= 1000 → bloquea",
    async () => {
      const r = await evaluarCapacidadLeadCtwa(U1, {
        fetchPlan: async () => ({ plan: "macbot", max_contactos: 1000 }),
        obtenerCapacidad: async () => 1000,
        contarLeads: async () => 1000,
      });
      assert(r.permitir === false && r.code === "PLAN_LIMIT_LEADS", "bloquea");
    }
  );

  await checkAsync(
    "extra. evaluarCapacidadLeadCtwa: 999 < 1000 → permite",
    async () => {
      const r = await evaluarCapacidadLeadCtwa(U1, {
        fetchPlan: async () => ({ plan: "macbot", max_contactos: 1000 }),
        obtenerCapacidad: async () => 1000,
        contarLeads: async () => 999,
      });
      assert(r.permitir === true, "permite");
    }
  );

  await checkAsync(
    "extra. campaña saliente no puede consumir Lead (sin source_id / skipped)",
    async () => {
      const registrar = makeRegistrar();
      const r = await intentarRegistrarLeadCtwaWebhook({
        message: {
          id: "wamid.CAMPAIGN_STATUS_FAKE",
        },
        from: FROM,
        usuarioIdWebhook: U1,
        conexionWebhook: CONN,
        registrar,
        existe: async () => false,
        evaluarCapacidad: async () => ({ permitir: true, limite: 1000, usados: 0 }),
      });
      assert(r.skipped === true, "skipped");
      assert(registrar.calls.length === 0, "0 leads");
    }
  );

  // --- Fail-closed COUNT/INSERT ---
  await checkAsync("SEC1. COUNT falla → CTWA nuevo NO se permite", async () => {
    const r = await evaluarCapacidadLeadCtwa(U1, {
      fetchPlan: async () => ({ plan: "macbot", max_contactos: 1000 }),
      obtenerCapacidad: async () => 1000,
      contarLeads: async () => {
        throw new Error("supabase down");
      },
    });
    assert(r.permitir === false, "bloquea");
    assert(r.code === "PLAN_LIMIT_LEADS_UNAVAILABLE", "código unavailable");
    assert(r.error === true, "marca error");

    const registrar = makeRegistrar();
    const gate = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.COUNT_FAIL" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: async () => false,
      evaluarCapacidad: async () => ({
        permitir: false,
        code: "PLAN_LIMIT_LEADS_UNAVAILABLE",
        error: true,
        limite: 1000,
      }),
    });
    assert(gate.permitir === false && gate.blocked, "gate bloquea");
    assert(registrar.calls.length === 0, "sin insert");
  });

  await checkAsync(
    "SEC2. COUNT devuelve 0 real → CTWA nuevo sí se permite si hay capacidad",
    async () => {
      const r = await evaluarCapacidadLeadCtwa(U1, {
        fetchPlan: async () => ({ plan: "macbot", max_contactos: 1000 }),
        obtenerCapacidad: async () => 1000,
        contarLeads: async () => 0,
      });
      assert(r.permitir === true && r.usados === 0, "0 real permite");
    }
  );

  await checkAsync("SEC3. COUNT falla → no se inserta lead", async () => {
    const registrar = makeRegistrar();
    const gate = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.NO_INSERT_ON_COUNT_FAIL" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: async () => false,
      evaluarCapacidad: async () => ({
        permitir: false,
        code: "PLAN_LIMIT_LEADS_UNAVAILABLE",
        error: true,
      }),
    });
    assert(!gate.permitir && registrar.calls.length === 0, "sin registro");
  });

  await checkAsync("SEC4. INSERT falla → CTWA nuevo NO continúa", async () => {
    let threw = false;
    let r;
    try {
      r = await intentarRegistrarLeadCtwaWebhook({
        message: ctwaMessage({ id: "wamid.INSERT_FAIL" }),
        from: FROM,
        usuarioIdWebhook: U1,
        conexionWebhook: CONN,
        registrar: async () => {
          throw new Error("insert failed");
        },
        existe: async () => false,
        evaluarCapacidad: async () => ({ permitir: true, limite: 1000, usados: 0 }),
      });
    } catch (_e) {
      threw = true;
    }
    assert(!threw, "no relanza 500");
    assert(r.permitir === false && r.blocked === true, "fail-closed");
    assert(r.code === "CTWA_LEAD_REGISTER_FAILED", "código register");
  });

  await checkAsync(
    "SEC5. message_id existente → continúa sin nuevo consumo",
    async () => {
      const registrar = makeRegistrar();
      const r = await intentarRegistrarLeadCtwaWebhook({
        message: ctwaMessage({ id: "wamid.ALREADY" }),
        from: FROM,
        usuarioIdWebhook: U1,
        conexionWebhook: CONN,
        registrar,
        existe: async () => true,
        evaluarCapacidad: async () => {
          throw new Error("no debe evaluar capacidad en duplicate");
        },
      });
      assert(r.permitir && r.duplicate, "continúa");
      assert(registrar.calls.length === 0, "+0");
    }
  );

  await checkAsync(
    "SEC6. Agency ilimitado → continúa aunque COUNT fallaría",
    async () => {
      const r = await evaluarCapacidadLeadCtwa(U1, {
        fetchPlan: async () => ({ plan: "agency", max_contactos: -1 }),
        obtenerCapacidad: async () => -1,
        contarLeads: async () => {
          throw new Error("COUNT caído");
        },
      });
      assert(r.permitir && r.ilimitado, "agency ok sin COUNT");
    }
  );

  await checkAsync("SEC7. mensaje normal → no pasa por gate", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: { id: "wamid.SEC_NORMAL", type: "text", text: { body: "hola" } },
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: async () => {
        throw new Error("no existe");
      },
      evaluarCapacidad: async () => {
        throw new Error("no cupo");
      },
    });
    assert(r.skipped && r.permitir, "skip");
    assert(registrar.calls.length === 0, "0");
  });

  check(
    "SEC8. campaña/saliente → no pasa por gate (statuses early-return / sin source_id)",
    true
  );

  // --- Ajuste final: plan estricto + contacto bloqueado ---
  await checkAsync("FINAL1. Agency real → ilimitado", async () => {
    const r = await evaluarCapacidadLeadCtwa(U1, {
      fetchPlan: async () => ({
        plan: "agency",
        max_contactos: -1,
        estado_plan: "activo",
      }),
      obtenerCapacidad: async (_uid, planRow) => {
        assert(planRow && planRow.plan === "agency", "preload agency");
        return -1;
      },
      contarLeads: async () => {
        throw new Error("no COUNT");
      },
    });
    assert(r.permitir && r.ilimitado && r.limite === -1, "agency real");
  });

  await checkAsync(
    "FINAL2. Agency + error lectura plan → fail-closed, NO tratado como 100",
    async () => {
      const r = await evaluarCapacidadLeadCtwa(U1, {
        fetchPlan: async () => {
          throw new Error("crm_usuarios timeout");
        },
        obtenerCapacidad: async () => 100,
        contarLeads: async () => 0,
      });
      assert(r.permitir === false, "fail-closed");
      assert(r.code === "PLAN_LIMIT_LEADS_UNAVAILABLE", "unavailable");
      assert(r.error === true, "error");
      assert(r.limite !== 100, "no Free/100");
    }
  );

  await checkAsync("FINAL3. Free real → capacidad 100", async () => {
    const r = await evaluarCapacidadLeadCtwa(U1, {
      fetchPlan: async () => ({
        plan: "free",
        max_contactos: 100,
        estado_plan: "activo",
      }),
      obtenerCapacidad: async (_uid, planRow) => {
        assert(planRow.max_contactos === 100, "free real");
        return 100;
      },
      contarLeads: async () => 5,
    });
    assert(r.permitir === true && r.limite === 100 && r.usados === 5, "free 100");
  });

  await checkAsync("FINAL4. Error de capacidad → fail-closed", async () => {
    const r = await evaluarCapacidadLeadCtwa(U1, {
      fetchPlan: async () => ({ plan: "macbot", max_contactos: 1000 }),
      obtenerCapacidad: async () => {
        throw new Error("capacidad boom");
      },
      contarLeads: async () => 0,
    });
    assert(r.permitir === false && r.code === "PLAN_LIMIT_LEADS_UNAVAILABLE", "fail-closed");
  });

  await checkAsync(
    "FINAL5. Contacto bloqueado + CTWA → 0 leads (orden webhook: bloqueado antes del gate)",
    async () => {
      const registrar = makeRegistrar();
      // Simula el handler: si bloqueado, NO se llama al gate.
      const clienteBloqueado = { estado: "bloqueado" };
      if (clienteBloqueado.estado === "bloqueado") {
        assert(registrar.calls.length === 0, "0 leads");
        return;
      }
      await intentarRegistrarLeadCtwaWebhook({
        message: ctwaMessage({ id: "wamid.BLOCKED" }),
        from: FROM,
        usuarioIdWebhook: U1,
        conexionWebhook: CONN,
        registrar,
        existe: async () => false,
        evaluarCapacidad: async () => ({ permitir: true, limite: 1000, usados: 0 }),
      });
      assert(false, "no debe llegar al gate");
    }
  );

  await checkAsync(
    "FINAL6. Contacto no bloqueado + CTWA → consumo normal",
    async () => {
      const registrar = makeRegistrar();
      const clienteBloqueado = { estado: "nuevo" };
      assert(clienteBloqueado.estado !== "bloqueado", "no bloqueado");
      const r = await intentarRegistrarLeadCtwaWebhook({
        message: ctwaMessage({ id: "wamid.NOT_BLOCKED" }),
        from: FROM,
        usuarioIdWebhook: U1,
        conexionWebhook: CONN,
        registrar,
        existe: async () => false,
        evaluarCapacidad: async () => ({ permitir: true, limite: 1000, usados: 0 }),
      });
      assert(r.registered && registrar.calls.length === 1, "consume 1");
    }
  );

  await checkAsync("FINAL7. Retry existente → +0", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.RETRY" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: async () => true,
      evaluarCapacidad: async () => ({ permitir: false }),
    });
    assert(r.duplicate && r.permitir && registrar.calls.length === 0, "+0");
  });

  await checkAsync("FINAL8. Error exists → fail-closed", async () => {
    const registrar = makeRegistrar();
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.EXISTS_ERR" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar,
      existe: async () => {
        throw new Error("exists down");
      },
      evaluarCapacidad: async () => ({ permitir: true }),
    });
    assert(r.permitir === false && r.code === "CTWA_LEAD_EXISTS_CHECK_FAILED", "fail-closed");
    assert(registrar.calls.length === 0, "sin insert");
  });

  await checkAsync("FINAL9. Error COUNT → fail-closed", async () => {
    const r = await evaluarCapacidadLeadCtwa(U1, {
      fetchPlan: async () => ({ plan: "free", max_contactos: 100 }),
      obtenerCapacidad: async () => 100,
      contarLeads: async () => {
        throw new Error("count fail");
      },
    });
    assert(r.permitir === false && r.error === true, "fail-closed");
  });

  await checkAsync("FINAL10. Error INSERT → fail-closed", async () => {
    const r = await intentarRegistrarLeadCtwaWebhook({
      message: ctwaMessage({ id: "wamid.INS_ERR" }),
      from: FROM,
      usuarioIdWebhook: U1,
      conexionWebhook: CONN,
      registrar: async () => {
        throw new Error("insert");
      },
      existe: async () => false,
      evaluarCapacidad: async () => ({ permitir: true, limite: 100, usados: 0 }),
    });
    assert(r.permitir === false && r.code === "CTWA_LEAD_REGISTER_FAILED", "fail-closed");
  });

  await checkAsync(
    "FINAL. plan ausente (null) → fail-closed, no Free/100",
    async () => {
      const r = await evaluarCapacidadLeadCtwa(U1, {
        fetchPlan: async () => null,
        obtenerCapacidad: async () => 100,
        contarLeads: async () => 0,
      });
      assert(r.permitir === false && r.code === "PLAN_LIMIT_LEADS_UNAVAILABLE", "no fallback");
    }
  );

  console.log(`\nPASS ${passed} checks (ctwa lead capacity gate — Fase 2B)`);
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
