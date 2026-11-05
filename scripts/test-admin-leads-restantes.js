/**
 * Columna admin "Leads restantes".
 * Misma fuente que el middleware: contarLeadsCtwaUsuario + obtenerCapacidadEfectivaContactos.
 * No consulta Supabase.
 *
 * Ejecutar: node scripts/test-admin-leads-restantes.js
 */
const fs = require("fs");
const path = require("path");
const { contarLeadsCtwaUsuario } = require("../middlewares/planLimits");
const { obtenerCapacidadEfectivaContactos } = require("../services/planesService");
const {
  CONTADOR_LEADS,
  LIMITE_LEADS,
  tonoPorcentaje,
  resumirLeadsRestantes,
  adjuntarLeadsRestantes,
} = require("../services/adminLeadsRestantes");
const { renderAdminUsuariosPage } = require("../views/adminUsuariosView");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("OK:", name);
}

async function checkAsync(name, fn) {
  await fn();
  passed += 1;
  console.log("OK:", name);
}

async function main() {
  check("1. el contador exportado es el del middleware", () => {
    assert(CONTADOR_LEADS === contarLeadsCtwaUsuario, "debe ser contarLeadsCtwaUsuario");
  });

  check("2. el límite exportado es la capacidad efectiva de Mi Plan / gate CTWA", () => {
    assert(
      LIMITE_LEADS === obtenerCapacidadEfectivaContactos,
      "debe ser obtenerCapacidadEfectivaContactos"
    );
  });

  check("3. restantes = límite − usados", () => {
    const r = resumirLeadsRestantes(200, 1000);
    assert(r.disponible === true, "disponible");
    assert(r.ilimitado === false, "limitado");
    assert(r.usados === 200, "usados");
    assert(r.limite === 1000, "limite");
    assert(r.restantes === 800, "restantes");
    assert(r.porcentaje === 20, "porcentaje");
    assert(r.tono === "ok", "tono");
  });

  check("4. límite null es ilimitado y no resta", () => {
    const r = resumirLeadsRestantes(4823, null);
    assert(r.ilimitado === true, "ilimitado");
    assert(r.usados === 4823, "usados");
    assert(r.limite === null, "sin tope");
    assert(r.restantes === null, "sin restantes numéricos");
    assert(r.porcentaje === null, "sin porcentaje");
    assert(r.tono === null, "sin tono");
  });

  check("5. límite -1 es ilimitado", () => {
    const r = resumirLeadsRestantes(10, -1);
    assert(r.ilimitado === true && r.usados === 10, "agency");
  });

  check("6. al alcanzar el límite, restantes es 0", () => {
    const r = resumirLeadsRestantes(100, 100);
    assert(r.restantes === 0, "cero");
    assert(r.porcentaje === 100, "100%");
    assert(r.tono === "danger", "rojo");
  });

  check("7. por encima del límite, restantes sigue en 0", () => {
    const r = resumirLeadsRestantes(150, 100);
    assert(r.restantes === 0, "no negativo");
    assert(r.porcentaje === 150, "porcentaje real");
    assert(r.tono === "danger", "rojo");
  });

  check("8. umbrales de barra: verde <70, amarillo >=70, rojo >=90", () => {
    assert(tonoPorcentaje(69) === "ok", "69");
    assert(resumirLeadsRestantes(690, 1000).tono === "ok", "69%");
    assert(tonoPorcentaje(70) === "warn", "70");
    assert(resumirLeadsRestantes(700, 1000).tono === "warn", "70%");
    assert(tonoPorcentaje(90) === "danger", "90");
    assert(resumirLeadsRestantes(900, 1000).tono === "danger", "90%");
  });

  check("9. conteo o límite ilegible → no disponible", () => {
    assert(resumirLeadsRestantes(undefined, 100).disponible === false, "usados undefined");
    assert(resumirLeadsRestantes(NaN, 100).disponible === false, "NaN");
    assert(resumirLeadsRestantes(-1, 100).disponible === false, "negativo");
    assert(resumirLeadsRestantes(10, undefined).disponible === false, "límite undefined no es ilimitado");
    assert(resumirLeadsRestantes(10, "x").disponible === false, "límite inválido");
  });

  check("10. cero leads usados deja el cupo completo", () => {
    const r = resumirLeadsRestantes(0, 100);
    assert(r.usados === 0 && r.restantes === 100 && r.porcentaje === 0 && r.tono === "ok", "cero");
  });

  await checkAsync("11. usa el contador inyectado y el límite, no los contactos CRM del usuario", async () => {
    const usuario = {
      id: "u-agency",
      plan: "agency",
      max_contactos: null,
      contactos_usados: 13055,
      whatsapp_usados: 4,
    };
    const calls = [];
    const [out] = await adjuntarLeadsRestantes([usuario], {
      contarLeads: async (id) => {
        calls.push(["contar", id]);
        return 4823;
      },
      obtenerCapacidad: async (id, row) => {
        calls.push(["limite", id, row.contactos_usados, row.whatsapp_usados]);
        return null;
      },
    });
    assert(calls.length === 2, "dos lecturas");
    assert(calls[0][0] === "limite" && calls[0][1] === "u-agency", "pide el límite del usuario");
    assert(calls[0][2] === 13055, "recibe la fila, no la usa como usados");
    assert(calls[1][0] === "contar" && calls[1][1] === "u-agency", "cuenta por id");
    assert(out.leads.usados === 4823, "usados = leads CTWA, no 13055 contactos");
    assert(out.leads.ilimitado === true, "agency ilimitado");
    assert(out.contactos_usados === 13055, "no reescribe contactos");
  });

  await checkAsync("12. MacBot: restantes contra la capacidad efectiva (base + bloques)", async () => {
    const usuario = { id: "u-mac", plan: "macbot", max_contactos: 1000, contactos_usados: 9000 };
    const [out] = await adjuntarLeadsRestantes([usuario], {
      contarLeads: async () => 400,
      obtenerCapacidad: async (id, row) => {
        assert(row === usuario, "pasa la fila ya leída, sin releer el plan");
        assert(id === "u-mac", "id");
        return 3000;
      },
    });
    assert(out.leads.usados === 400, "usados");
    assert(out.leads.limite === 3000, "no usa solo max_contactos 1000");
    assert(out.leads.restantes === 2600, "restantes");
    assert(out.leads.usados !== usuario.contactos_usados, "ignora CRM");
  });

  await checkAsync("13. fallo de un usuario no borra al resto", async () => {
    const usuarios = [
      { id: "ok", plan: "free" },
      { id: "count-fail", plan: "free" },
      { id: "limit-fail", plan: "macbot" },
    ];
    const out = await adjuntarLeadsRestantes(usuarios, {
      contarLeads: async (id) => {
        if (id === "count-fail") {
          const err = new Error("COUNT macbot_ctwa_leads no disponible");
          err.code = "LEADS_COUNT_UNAVAILABLE";
          throw err;
        }
        return 4;
      },
      obtenerCapacidad: async (id) => {
        if (id === "limit-fail") throw new Error("capacidad");
        return 100;
      },
    });
    assert(out[0].leads.disponible === true && out[0].leads.restantes === 96, "ok");
    assert(out[1].leads.disponible === false, "conteo caído");
    assert(out[2].leads.disponible === false, "límite caído");
    assert(out[1].id === "count-fail" && out[2].plan === "macbot", "conserva la fila");
  });

  await checkAsync("14. lista vacía no llama al contador", async () => {
    let called = false;
    const out = await adjuntarLeadsRestantes([], {
      contarLeads: async () => {
        called = true;
        return 1;
      },
    });
    assert(Array.isArray(out) && out.length === 0 && called === false, "vacío");
  });

  check("15. la vista declara la columna y los tres estados", () => {
    const html = renderAdminUsuariosPage({ adminEmail: "admin@test" });
    assert(html.includes(">Leads restantes<"), "encabezado");
    assert(html.includes("No disponible"), "sin dato");
    assert(html.includes("∞ Ilimitado"), "ilimitado");
    assert(html.includes("/ Ilimitado"), "usados / Ilimitado");
    assert(html.includes("Restantes: "), "restantes con límite");
    assert(html.includes("mb-admin__leads-fill--ok"), "verde");
    assert(html.includes("mb-admin__leads-fill--warn"), "amarillo");
    assert(html.includes("mb-admin__leads-fill--danger"), "rojo");
    assert(html.includes('colspan="11"'), "la fila extra abarca la columna nueva");
    assert(!html.includes("contactos_usados"), "la celda no pinta contactos CRM");
  });

  check("16. el dashboard admin adjunta esta lectura y no cuenta clientes", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../services/adminUsuariosService.js"),
      "utf8"
    );
    assert(src.includes("adjuntarLeadsRestantes(usuarios)"), "listado");
    assert(!src.includes("contarContactosUsuario"), "no usa el contador CRM");
    assert(!src.includes("macbot_ctwa_leads"), "no duplica el COUNT; lo delega");
  });

  console.log(`\nPASS ${passed} checks (admin leads restantes — mock, sin Supabase)`);
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exit(1);
});
