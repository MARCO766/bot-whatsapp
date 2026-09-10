/**
 * Mi Plan — leads_usados desde macbot_ctwa_leads (fase aislada).
 * Ejecutar: node scripts/test-planes-leads-usados.js
 *
 * Mock de countPorUsuario. NO consulta Supabase real.
 */
const {
  obtenerUsoUsuario,
  buildMiPlanResponse,
} = require("../services/planesService");

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

/**
 * Simula conteos por tabla/usuario.
 * rows: { [usuarioId]: { clientes, macbot_ctwa_leads, ... } }
 */
function createCountMock(rowsByUser) {
  const calls = [];
  async function countPorUsuario(table, usuarioId) {
    calls.push({ table, usuarioId });
    const row = rowsByUser[usuarioId] || {};
    return Number(row[table] || 0);
  }
  return { countPorUsuario, calls };
}

async function main() {
  await checkAsync("1. 0 filas CTWA → 0 leads", async () => {
    const { countPorUsuario } = createCountMock({
      [U1]: { clientes: 5, macbot_ctwa_leads: 0, conexiones_whatsapp: 1, flujos_builder: 2 },
    });
    const uso = await obtenerUsoUsuario(U1, { countPorUsuario });
    assert(uso.leads_usados === 0, `expected 0 leads, got ${uso.leads_usados}`);
    assert(uso.contactos_usados === 5, `expected 5 contactos, got ${uso.contactos_usados}`);
  });

  await checkAsync("2. 1 fila CTWA → 1 lead", async () => {
    const { countPorUsuario } = createCountMock({
      [U1]: { clientes: 1, macbot_ctwa_leads: 1 },
    });
    const uso = await obtenerUsoUsuario(U1, { countPorUsuario });
    assert(uso.leads_usados === 1, `expected 1 lead, got ${uso.leads_usados}`);
  });

  await checkAsync("3. 2 filas del mismo usuario → 2 leads", async () => {
    const { countPorUsuario } = createCountMock({
      [U1]: { macbot_ctwa_leads: 2, clientes: 1 },
    });
    const uso = await obtenerUsoUsuario(U1, { countPorUsuario });
    assert(uso.leads_usados === 2, `expected 2 leads, got ${uso.leads_usados}`);
  });

  await checkAsync(
    "4. Mismo cliente + mismo Ad + distintos message_id → 2 leads (conteo por filas)",
    async () => {
      // El ledger ya materializa 2 filas; el contador solo hace COUNT por usuario.
      const { countPorUsuario } = createCountMock({
        [U1]: { macbot_ctwa_leads: 2, clientes: 1 },
      });
      const uso = await obtenerUsoUsuario(U1, { countPorUsuario });
      assert(uso.leads_usados === 2, `expected 2 leads, got ${uso.leads_usados}`);
      assert(uso.contactos_usados === 1, "contactos únicos siguen en 1");
    }
  );

  await checkAsync("5. Clientes únicos NO afectan el contador CTWA", async () => {
    const { countPorUsuario } = createCountMock({
      [U1]: { clientes: 100, macbot_ctwa_leads: 3 },
    });
    const uso = await obtenerUsoUsuario(U1, { countPorUsuario });
    assert(uso.leads_usados === 3, `leads deben ser 3, got ${uso.leads_usados}`);
    assert(uso.contactos_usados === 100, `contactos deben ser 100, got ${uso.contactos_usados}`);
  });

  await checkAsync("6. CTWA de otro usuario NO cuenta", async () => {
    const { countPorUsuario, calls } = createCountMock({
      [U1]: { macbot_ctwa_leads: 2, clientes: 1 },
      [U2]: { macbot_ctwa_leads: 50, clientes: 40 },
    });
    const uso = await obtenerUsoUsuario(U1, { countPorUsuario });
    assert(uso.leads_usados === 2, `U1 leads=2, got ${uso.leads_usados}`);
    assert(
      calls.every((c) => c.usuarioId === U1),
      "todas las consultas deben filtrar por U1"
    );
    assert(
      calls.some((c) => c.table === "macbot_ctwa_leads"),
      "debe consultar macbot_ctwa_leads"
    );
  });

  await checkAsync("7. contactos_usados sigue contando clientes", async () => {
    const { countPorUsuario, calls } = createCountMock({
      [U1]: { clientes: 7, macbot_ctwa_leads: 9 },
    });
    const uso = await obtenerUsoUsuario(U1, { countPorUsuario });
    assert(uso.contactos_usados === 7, `contactos=7, got ${uso.contactos_usados}`);
    assert(
      calls.some((c) => c.table === "clientes"),
      "debe seguir consultando clientes"
    );
  });

  check("8. buildMiPlanResponse expone leads_usados sin romper contactos_usados", (() => {
    const body = buildMiPlanResponse(
      {
        plan: "macbot",
        estado_plan: "activo",
        max_whatsapp: 2,
        max_contactos: 1000,
        max_flujos: 20,
      },
      {
        whatsapp_usados: 1,
        contactos_usados: 42,
        leads_usados: 150,
        flujos_usados: 3,
      },
      { contactos: 1000 }
    );
    assert(body.plan.uso.leads_usados === 150, "leads_usados en respuesta");
    assert(body.plan.uso.contactos_usados === 42, "contactos_usados intacto");
    assert(body.plan.limites.contactos === 1000, "limite contactos intacto");
    assert(body.plan.uso.whatsapp_usados === 1, "whatsapp_usados intacto");
    assert(body.plan.uso.flujos_usados === 3, "flujos_usados intacto");
    return true;
  })());

  check("9. buildMiPlanResponse sin leads_usados → 0 (compat)", (() => {
    const body = buildMiPlanResponse(
      { plan: "free", estado_plan: "activo", max_whatsapp: 1, max_contactos: 100, max_flujos: 1 },
      { whatsapp_usados: 0, contactos_usados: 5, flujos_usados: 0 }
    );
    assert(body.plan.uso.leads_usados === 0, "default 0");
    assert(body.plan.uso.contactos_usados === 5, "contactos ok");
    return true;
  })());

  console.log(`\nPASS ${passed} checks (planes leads_usados — mock, sin Supabase)`);
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
