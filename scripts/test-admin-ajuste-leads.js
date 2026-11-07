/**
 * Ajuste acumulativo de leads con idempotencia por UUID.
 * El RPC se simula en memoria. No consulta Supabase ni WhatsApp.
 *
 * Ejecutar: node scripts/test-admin-ajuste-leads.js
 */
const fs = require("fs");
const path = require("path");
const {
  parseDeltaAjusteLeads,
  parseOperacionAjusteLeads,
  parseLimitesMacbotBody,
  evaluarAjusteCapacidadLeads,
  ajustarCapacidadLeads,
} = require("../services/adminUsuariosService");
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

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const OP1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const OP2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const OP3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const OP4 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";

function fila(overrides) {
  return Object.assign(
    {
      id: ID_A,
      nombre: "Ana",
      email: "ana@example.com",
      plan: "pro",
      estado_plan: "activo",
      fecha_vencimiento: null,
      max_whatsapp: 2,
      max_contactos: 1000,
      max_flujos: 20,
      activo: true,
    },
    overrides
  );
}

function crearStore() {
  return {
    users: {
      [ID_A]: fila(),
      [ID_B]: fila({
        id: ID_B,
        email: "otro@example.com",
        nombre: "Otro",
        max_contactos: 800,
      }),
    },
    leads: { [ID_A]: 234, [ID_B]: 10 },
    bloques: { [ID_A]: 0, [ID_B]: 500 },
    ops: new Map(),
    writes: 0,
    replays: 0,
    countError: false,
    chain: Promise.resolve(),
  };
}

function canon(plan) {
  const p = String(plan || "").toLowerCase();
  if (p === "starter" || p === "pro" || p === "macbot") return "macbot";
  return p;
}

function vigenteDe(store, usuarioId) {
  const row = store.users[usuarioId];
  const usados = store.leads[usuarioId];
  const bloques = store.bloques[usuarioId];
  const limite = row.max_contactos + bloques;
  return {
    disponible: true,
    base: row.max_contactos,
    bloques,
    limite,
    usados,
    disponibles: Math.max(0, limite - usados),
  };
}

function crearRpc(store) {
  function exclusivo(fn) {
    const run = store.chain.then(fn, fn);
    store.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  return function aplicarRpc({ usuarioId, operacionId, delta }) {
    return exclusivo(async () => {
      const previa = store.ops.get(operacionId);
      if (previa) {
        if (previa.usuarioId !== usuarioId || previa.delta !== delta) {
          return {
            ok: false,
            status: 409,
            code: "operacion_otro_parametro",
            error: "Este identificador ya se usó con otro usuario o con otro delta.",
          };
        }
        store.replays += 1;
        return {
          ok: true,
          repetida: true,
          ajuste: previa.ajuste,
          vigente: vigenteDe(store, usuarioId),
          usuario: Object.assign({}, store.users[usuarioId]),
        };
      }

      const row = store.users[usuarioId];
      if (!row) {
        return { ok: false, status: 404, error: "Usuario no encontrado" };
      }
      const plan = canon(row.plan);
      if (plan === "agency") {
        return {
          ok: false,
          status: 403,
          plan: "agency",
          error: "Los ajustes de leads no están disponibles para Agency.",
        };
      }
      if (plan !== "macbot") {
        return {
          ok: false,
          status: 403,
          plan: "free",
          error: "Los ajustes de leads solo están disponibles para usuarios MacBot.",
        };
      }
      if (store.countError) {
        return {
          ok: false,
          status: 503,
          code: "conteo_no_disponible",
          error: "No se pudo verificar el consumo de leads. No se modificó la capacidad.",
        };
      }

      const evaluacion = evaluarAjusteCapacidadLeads({
        base: row.max_contactos,
        bloques: store.bloques[usuarioId],
        usados: store.leads[usuarioId],
        delta,
      });
      if (!evaluacion.ok) return evaluacion;

      const antesWa = row.max_whatsapp;
      const antesFl = row.max_flujos;
      const antesPlan = row.plan;
      const antesEstado = row.estado_plan;
      const antesVence = row.fecha_vencimiento;
      row.max_contactos = evaluacion.nuevaBase;
      row.updated_plan_at = "2026-01-01T00:00:00.000Z";
      assert(row.max_whatsapp === antesWa && row.max_flujos === antesFl, "el mock no toca wa/flujos");
      assert(row.plan === antesPlan && row.estado_plan === antesEstado, "el mock no toca el plan");
      assert(row.fecha_vencimiento === antesVence, "el mock no toca el vencimiento");
      store.writes += 1;
      const ajuste = {
        operacion_id: operacionId,
        delta,
        base_anterior: evaluacion.limiteAnterior - store.bloques[usuarioId],
        base_nueva: evaluacion.nuevaBase,
        bloques: store.bloques[usuarioId],
        limite_anterior: evaluacion.limiteAnterior,
        limite_nuevo: evaluacion.limiteNuevo,
        leads_utilizados: store.leads[usuarioId],
        leads_disponibles: evaluacion.disponibles,
        reduccion_maxima_base: evaluacion.reduccionMaximaBase,
      };
      store.ops.set(operacionId, { usuarioId, delta, ajuste });
      return {
        ok: true,
        repetida: false,
        ajuste,
        vigente: vigenteDe(store, usuarioId),
        usuario: Object.assign({}, row),
      };
    });
  };
}

async function aplicar(store, id, delta, operacionId) {
  return ajustarCapacidadLeads(id, delta, operacionId, { aplicarRpc: crearRpc(store) });
}

function sliceBetween(src, start, end) {
  const i = src.indexOf(start);
  assert(i >= 0, "no está: " + start);
  const j = src.indexOf(end, i + start.length);
  assert(j > i, "no está el cierre: " + end);
  return src.slice(i, j);
}

async function main() {
  const store = crearStore();

  await checkAsync("1. primer ajuste +500 sobre base 1000 y 234 usados", async () => {
    const result = await aplicar(store, ID_A, 500, OP1);
    assert(result.ok === true && result.repetida === false, "aplicado");
    assert(result.ajuste.base_nueva === 1500, "base");
    assert(result.ajuste.limite_nuevo === 1500, "límite");
    assert(result.ajuste.leads_utilizados === 234, "usados");
    assert(result.ajuste.leads_disponibles === 1266, "disponibles");
    assert(result.vigente.base === 1500 && result.vigente.usados === 234, "vigente");
    assert(store.writes === 1, "una escritura");
    assert(store.leads[ID_A] === 234, "el contador no se escribe");
    assert(result.detalle && result.detalle.operacion_id === OP1, "detalle para el log");
  });

  await checkAsync("2. repetir el mismo UUID no vuelve a sumar", async () => {
    const result = await aplicar(store, ID_A, 500, OP1);
    assert(result.ok === true && result.repetida === true, "repetida");
    assert(result.detalle === null, "no hay otro log de ajuste");
    assert(result.ajuste.base_anterior === 1000 && result.ajuste.base_nueva === 1500, "resultado original");
    assert(result.vigente.base === 1500, "la vigente no es un segundo +500");
    assert(store.writes === 1 && store.replays === 1, "sin escritura nueva");
    assert(store.users[ID_A].max_contactos === 1500, "sigue en 1500");
  });

  await checkAsync("3. respuesta perdida y reintento con el mismo UUID", async () => {
    const local = crearStore();
    const primera = await aplicar(local, ID_A, 500, OP1);
    assert(primera.ok === true, "el servidor guardó");
    assert(local.users[ID_A].max_contactos === 1500, "base guardada");
    const reintento = await aplicar(local, ID_A, 500, OP1);
    assert(reintento.repetida === true, "el reintento reconoce la operación");
    assert(local.users[ID_A].max_contactos === 1500, "no queda en 2000");
    assert(local.writes === 1, "una sola escritura");
    assert(local.leads[ID_A] === 234, "usados intactos");
  });

  await checkAsync("4. el mismo UUID con otro delta u otro usuario se rechaza", async () => {
    const local = crearStore();
    assert((await aplicar(local, ID_A, 500, OP1)).ok === true, "primero");
    const otroDelta = await aplicar(local, ID_A, 1000, OP1);
    assert(otroDelta.ok === false && otroDelta.status === 409, "otro delta");
    const otroUsuario = await aplicar(local, ID_B, 500, OP1);
    assert(otroUsuario.ok === false && otroUsuario.status === 409, "otro usuario");
    assert(local.users[ID_A].max_contactos === 1500, "A no cambia");
    assert(local.users[ID_B].max_contactos === 800, "B no cambia");
    assert(local.writes === 1, "sin escrituras extra");
  });

  await checkAsync("5. dos ajustes distintos concurrentes no se pierden", async () => {
    const local = crearStore();
    const [a, b] = await Promise.all([
      aplicar(local, ID_A, 500, OP1),
      aplicar(local, ID_A, 1000, OP2),
    ]);
    assert(a.ok === true && b.ok === true, "los dos entran");
    assert(a.repetida === false && b.repetida === false, "son operaciones distintas");
    assert(local.writes === 2, "dos escrituras");
    assert(local.users[ID_A].max_contactos === 2500, "1000+500+1000");
    assert(local.leads[ID_A] === 234, "usados");
    assert(local.users[ID_B].max_contactos === 800, "el otro usuario no entra");
  });

  await checkAsync("6. un fallo de validación no registra la operación", async () => {
    const local = crearStore();
    const malo = await aplicar(local, ID_A, -900, OP3);
    assert(malo.ok === false && malo.status === 400, "rechazo");
    assert(malo.reduccion_maxima_base === 766, "máxima");
    assert(local.ops.has(OP3) === false, "el UUID queda libre");
    assert(local.writes === 0 && local.users[ID_A].max_contactos === 1000, "sin escritura");
    const otra = await aplicar(local, ID_A, 500, OP3);
    assert(otra.ok === true && local.users[ID_A].max_contactos === 1500, "el mismo UUID puede usarse si antes no se guardó");
  });

  await checkAsync("7. si el conteo falla no hay escritura", async () => {
    const local = crearStore();
    local.countError = true;
    const result = await aplicar(local, ID_A, 500, OP1);
    assert(result.ok === false && result.status === 503, "503");
    assert(local.writes === 0 && local.ops.size === 0, "nada guardado");
    assert(local.users[ID_A].max_contactos === 1000, "base intacta");
    assert(local.leads[ID_A] === 234, "no se asume cero");
  });

  await checkAsync("8. los bloques comprados siguen intactos", async () => {
    const local = crearStore();
    local.bloques[ID_A] = 1000;
    const result = await aplicar(local, ID_A, 500, OP1);
    assert(result.ok === true, "ok");
    assert(result.ajuste.bloques === 1000 && result.ajuste.limite_nuevo === 2500, "efectivo");
    assert(local.bloques[ID_A] === 1000 && local.users[ID_A].max_contactos === 1500, "solo la base");
    const negativo = crearStore();
    negativo.users[ID_A].max_contactos = 100;
    negativo.bloques[ID_A] = 2000;
    negativo.leads[ID_A] = 50;
    const rechazo = await aplicar(negativo, ID_A, -150, OP4);
    assert(rechazo.ok === false && rechazo.reduccion_maxima_base === 100, "no compensa con bloques");
    assert(negativo.bloques[ID_A] === 2000 && negativo.users[ID_A].max_contactos === 100, "intactos");
  });

  await checkAsync("9. quitar 766 se permite y 767 no", async () => {
    const justo = crearStore();
    const ok = await aplicar(justo, ID_A, -766, OP1);
    assert(ok.ok === true && ok.ajuste.limite_nuevo === 234 && ok.ajuste.leads_utilizados === 234, "al ras");
    assert(justo.leads[ID_A] === 234, "histórico");
    const pasa = crearStore();
    const no = await aplicar(pasa, ID_A, -767, OP1);
    assert(no.ok === false && pasa.writes === 0 && pasa.leads[ID_A] === 234, "767");
  });

  await checkAsync("10. delta cero, decimal o UUID inválido no llaman al RPC", async () => {
    const local = crearStore();
    let llamadas = 0;
    const rpc = async () => {
      llamadas += 1;
      return { ok: true };
    };
    const cero = await ajustarCapacidadLeads(ID_A, 0, OP1, { aplicarRpc: rpc });
    const decimal = await ajustarCapacidadLeads(ID_A, 10.5, OP1, { aplicarRpc: rpc });
    const texto = await ajustarCapacidadLeads(ID_A, "500", OP1, { aplicarRpc: rpc });
    const sinId = await ajustarCapacidadLeads(ID_A, 500, "", { aplicarRpc: rpc });
    assert(cero.status === 400 && decimal.status === 400 && texto.status === 400 && sinId.status === 400, "400");
    assert(llamadas === 0 && local.writes === 0, "sin RPC");
    assert(parseOperacionAjusteLeads(OP1).value === OP1, "uuid válido");
    assert(parseDeltaAjusteLeads(0).error, "cero");
  });

  await checkAsync("11. Free y Agency no se modifican", async () => {
    const libre = crearStore();
    libre.users[ID_A].plan = "free";
    libre.users[ID_A].max_contactos = 100;
    const r1 = await aplicar(libre, ID_A, 500, OP1);
    assert(r1.status === 403 && libre.users[ID_A].max_contactos === 100 && libre.writes === 0, "free");
    const agencia = crearStore();
    agencia.users[ID_A].plan = "agency";
    agencia.users[ID_A].max_contactos = -1;
    const r2 = await aplicar(agencia, ID_A, 500, OP1);
    assert(r2.status === 403 && agencia.users[ID_A].max_contactos === -1, "agency");
  });

  check("12. el formulario absoluto y el SQL de idempotencia quedan separados", () => {
    const absoluto = parseLimitesMacbotBody({
      max_whatsapp: 2,
      max_contactos: 1000,
      max_flujos: 20,
    });
    assert(absoluto.value.max_contactos === 1000, "sigue siendo absoluto");
    assert(parseLimitesMacbotBody({ delta: 500, operacion_id: OP1 }).error, "el body nuevo no entra");

    const route = fs.readFileSync(path.join(__dirname, "../routes/adminUsuariosApi.js"), "utf8");
    const patch = sliceBetween(
      route,
      'router.patch("/api/admin/usuarios/:id/limites"',
      'router.patch("/api/admin/usuarios/:id/estado"'
    );
    assert(patch.includes("actualizarLimitesUsuario(req.params.id, req.body)"), "handler absoluto");
    assert(!patch.includes("operacion_id") && !patch.includes("ajustarCapacidadLeads"), "el PATCH no conoce el UUID");
    const post = sliceBetween(
      route,
      'router.post("/api/admin/usuarios/:id/ajuste-leads"',
      'router.patch("/api/admin/usuarios/:id/limites"'
    );
    assert(post.includes("req.body?.operacion_id"), "el POST exige el UUID");
    assert(post.includes("if (!result.repetida)"), "el reintento no crea otro log");

    const svc = fs.readFileSync(path.join(__dirname, "../services/adminUsuariosService.js"), "utf8");
    const fn = sliceBetween(svc, "async function ajustarCapacidadLeads", "module.exports");
    assert(fn.includes("aplicar_ajuste_capacidad_leads"), "solo el RPC escribe");
    assert(!fn.includes("axios.patch") && !fn.includes("max_contactos=eq"), "sin el PATCH anterior");
    assert(!fn.includes("macbot_ctwa_leads"), "el servicio no toca la tabla de leads");

    const sql = fs.readFileSync(
      path.join(__dirname, "../supabase/migrations/create_ajuste_capacidad_leads_rpc.sql"),
      "utf8"
    );
    assert(sql.includes("operacion_id uuid primary key"), "clave primaria");
    assert(sql.includes("for update"), "bloqueo de fila");
    assert(sql.includes("security invoker"), "invoker");
    assert(!/security\s+definer/i.test(sql), "sin definer");
    assert(sql.includes("set search_path = public"), "search_path fijo");
    assert(sql.includes("revoke all on function public.aplicar_ajuste_capacidad_leads"), "revoca execute");
    assert(sql.includes("grant execute on function public.aplicar_ajuste_capacidad_leads"), "solo service_role");
    assert(sql.includes("to service_role"), "rol del servidor");
    assert(
      sql.includes(
        "revoke all on table public.macbot_ajustes_leads_ops from public, anon, authenticated, service_role"
      ),
      "revoca los privilegios por defecto de service_role"
    );
    assert(sql.includes("grant select, insert on table public.macbot_ajustes_leads_ops to service_role"), "sin update ni delete");
    assert(!/grant\s+(update|delete)/i.test(sql), "no otorga update ni delete");
    assert(sql.includes("set max_contactos = v_nueva_base::integer"), "solo la base");
    assert(sql.includes("updated_plan_at = now()"), "sello de actualización");
    assert(!/update\s+public\.macbot_ctwa_leads/i.test(sql), "no actualiza leads");
    assert(!/delete\s+from\s+public\.macbot_ctwa_leads/i.test(sql), "no borra leads");
    assert(!/update\s+public\.macbot_contactos_bloques/i.test(sql), "no actualiza bloques");
    assert(sql.includes("pg_advisory_xact_lock"), "serializa el mismo UUID");
  });

  check("13. la vista reutiliza el UUID y no pinta el histórico como vigente", () => {
    const html = renderAdminUsuariosPage({ adminEmail: "admin@test" });
    new Function(html.match(/<script>([\s\S]*)<\/script>/)[1]);
    assert(html.includes("uuidParaIntento"), "conserva el UUID por delta");
    assert(html.includes("operacionesPendientes"), "el UUID sobrevive a un redibujado del panel");
    assert(html.includes('return "macbot-ajuste-leads:" + claveOperacion(box, delta);'), "la clave incluye usuario y delta");
    assert(html.includes("localStorage.setItem"), "persiste el UUID antes del fetch");
    assert(html.includes("localStorage.getItem"), "lo recupera al recargar");
    assert(html.includes("localStorage.removeItem"), "lo borra solo al confirmar");
    assert(html.includes("operacion_id: opId"), "lo envía");
    assert(html.includes("consultarCapacidadVigente"), "vuelve a leer al repetir");
    assert(html.includes("no se sumó de nuevo"), "avisa que no hubo otro incremento");
    assert(html.includes("Guardar límites"), "el formulario absoluto sigue");
    const handler = sliceBetween(html, "var opId = uuidParaIntento(box, delta);", "load();");
    const catchSrc = sliceBetween(handler, "} catch (err) {", "} finally {");
    assert(handler.includes("olvidarOperacion(box, delta)"), "se olvida solo si la respuesta es definitiva");
    assert(!catchSrc.includes("olvidarOperacion"), "un error de red conserva el UUID");
  });

  check("15. tras F5, la memoria vacía reutiliza el UUID de localStorage", () => {
    const previo = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
    const clave = "macbot-ajuste-leads:" + ID_A + ":500";
    const datos = { [clave]: previo };
    let generados = 0;
    const almacenamiento = {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(datos, key) ? datos[key] : null;
      },
      setItem(key, value) {
        datos[key] = String(value);
      },
      removeItem(key) {
        delete datos[key];
      },
    };
    const crypto = {
      randomUUID() {
        generados += 1;
        return "dddddddd-dddd-4ddd-8ddd-" + String(generados).padStart(12, "0");
      },
    };

    function cargarPagina() {
      const html = renderAdminUsuariosPage({ adminEmail: "admin@test" });
      const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
      const src = sliceBetween(script, "var operacionesPendientes = {};", "function olvidarOperacion");
      return new Function(
        "window",
        src + "\nreturn uuidParaIntento;"
      )({ localStorage: almacenamiento, crypto });
    }

    function caja(usuarioId) {
      const attrs = { "data-usuario": usuarioId };
      return {
        getAttribute(name) {
          return attrs[name] == null ? null : attrs[name];
        },
        setAttribute(name, value) {
          attrs[name] = String(value);
        },
      };
    }

    const trasRecarga = cargarPagina();
    const mismo = trasRecarga(caja(ID_A), 500);
    assert(mismo === previo, "reutiliza el UUID guardado");
    assert(generados === 0, "no genera uno nuevo antes de leer");
    assert(datos[clave] === previo, "lo deja guardado antes del fetch");

    const otraCantidad = trasRecarga(caja(ID_A), 600);
    assert(otraCantidad !== previo, "otro delta no reutiliza el UUID");
    const otroUsuario = trasRecarga(caja(ID_B), 500);
    assert(otroUsuario !== previo && otroUsuario !== otraCantidad, "otro usuario no reutiliza el UUID");
    assert(generados === 2, "solo genera cuando no hay UUID previo");
  });

  const regla = evaluarAjusteCapacidadLeads({ base: 1000, bloques: 0, usados: 234, delta: -767 });
  check("14. la regla de consumo sigue rechazando bajar de los usados", () => {
    assert(regla.ok === false && regla.reduccion_maxima_base === 766, "767");
  });

  console.log(`\nPASS ${passed} checks (ajuste de leads idempotente — mock, sin Supabase)`);
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exit(1);
});
