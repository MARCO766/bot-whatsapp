/**
 * Ingresos del panel admin y reorganización de la tabla.
 * No consulta Supabase ni modifica usuarios.
 * Ejecutar: node scripts/test-admin-ingresos.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveDateRange } = require("../services/dateRangeService");
const {
  canonicalMonedaIngresos,
  resolverRangoIngresos,
  agregarIngresos,
  listarConversionesEnRango,
  obtenerIngresosAdmin,
  RANGO_MAX_DIAS,
  ZONA_INGRESOS,
} = require("../services/adminIngresosService");
const { renderAdminUsuariosPage } = require("../views/adminUsuariosView");

const NOW = new Date("2026-09-19T12:00:00.000Z");

function check(name, fn) {
  fn();
  console.log("OK", name);
}

check("moneda: alias BS es BOB y no hay tipo de cambio", () => {
  assert.strictEqual(canonicalMonedaIngresos("bs"), "BOB");
  assert.strictEqual(canonicalMonedaIngresos("USD"), "USD");
  assert.strictEqual(canonicalMonedaIngresos("clp"), "CLP");
  assert.strictEqual(canonicalMonedaIngresos("eur"), "EUR");
  assert.strictEqual(canonicalMonedaIngresos(""), "BOB");
});

check("agregación separa monedas y no duplica el id", () => {
  const { ingresos, ventas } = agregarIngresos([
    { id: "a", usuario_id: "u1", valor: 10, moneda: "BOB" },
    { id: "a", usuario_id: "u1", valor: 10, moneda: "BOB" },
    { id: "b", usuario_id: "u1", valor: 5, moneda: "BS" },
    { id: "c", usuario_id: "u1", valor: 3.5, moneda: "USD" },
    { id: "d", usuario_id: "u2", valor: 20, moneda: "USD" },
    { id: "e", usuario_id: "u1", valor: -4, moneda: "BOB" },
    { id: "f", usuario_id: "", valor: 99, moneda: "USD" },
  ]);
  assert.strictEqual(ventas, 4);
  assert.strictEqual(ingresos.u1.BOB, 15);
  assert.strictEqual(ingresos.u1.USD, 3.5);
  assert.strictEqual(ingresos.u1.BS, undefined);
  assert.strictEqual(ingresos.u2.USD, 20);
  assert.strictEqual(ingresos.u3, undefined);
  assert.strictEqual(Object.keys(ingresos.u1).length, 2);
});

check("usuario sin ventas no recibe un importe inventado", () => {
  const { ingresos } = agregarIngresos([
    { id: "a", usuario_id: "u1", valor: 8, moneda: "BOB" },
  ]);
  assert.deepStrictEqual(Object.keys(ingresos), ["u1"]);
});

check("centavos no se arrastran entre filas", () => {
  const { ingresos } = agregarIngresos([
    { id: "a", usuario_id: "u1", valor: 10.1, moneda: "BOB" },
    { id: "b", usuario_id: "u1", valor: 10.2, moneda: "BOB" },
  ]);
  assert.strictEqual(ingresos.u1.BOB, 20.3);
});

check("hoy, ayer y 7 días usan America/La_Paz", () => {
  assert.strictEqual(ZONA_INGRESOS, "America/La_Paz");
  for (const periodo of ["hoy", "ayer", "7d"]) {
    const rango = resolverRangoIngresos({ periodo }, { now: NOW });
    const crm = resolveDateRange({ periodo }, { now: NOW, timeZone: "America/La_Paz" });
    assert.strictEqual(rango.desde, crm.desde, periodo);
    assert.strictEqual(rango.hasta, crm.hasta, periodo);
    assert.strictEqual(rango.zona, "America/La_Paz");
  }
  const hoy = resolverRangoIngresos({ periodo: "hoy" }, { now: NOW });
  assert.strictEqual(hoy.desde, "2026-09-19T04:00:00.000Z");
  assert.strictEqual(hoy.hasta, "2026-09-20T03:59:59.999Z");
});

check("personalizado usa días civiles de La Paz, no medianoche UTC", () => {
  const unDia = resolverRangoIngresos(
    { periodo: "custom", desde: "2026-09-19", hasta: "2026-09-19" },
    { now: NOW }
  );
  assert.strictEqual(unDia.desde, "2026-09-19T04:00:00.000Z");
  assert.strictEqual(unDia.hasta, "2026-09-20T03:59:59.999Z");

  const dos = resolverRangoIngresos({
    periodo: "custom",
    desde: "2026-09-18",
    hasta: "2026-09-19",
  });
  assert.strictEqual(dos.desde, "2026-09-18T04:00:00.000Z");
  assert.strictEqual(dos.hasta, "2026-09-20T03:59:59.999Z");
});

check("personalizado rechaza fechas invertidas, inválidas y rangos largos", () => {
  assert.ok(resolverRangoIngresos({ periodo: "custom", desde: "2026-09-20", hasta: "2026-09-19" }).error);
  assert.ok(resolverRangoIngresos({ periodo: "custom", desde: "2026-02-31", hasta: "2026-03-01" }).error);
  assert.ok(resolverRangoIngresos({ periodo: "todo" }).error);
  const largo = resolverRangoIngresos({
    periodo: "custom",
    desde: "2024-01-01",
    hasta: "2024-12-31",
  });
  assert.ok(largo.error);
  assert.ok(largo.error.includes(String(RANGO_MAX_DIAS)));
  const justo = resolverRangoIngresos({
    periodo: "custom",
    desde: "2026-01-01",
    hasta: "2026-12-31",
  });
  assert.strictEqual(justo.periodo, "custom");
  assert.strictEqual(justo.error, undefined);
});

async function checkAsync(name, fn) {
  await fn();
  console.log("OK", name);
}

check("la vista mantiene acciones, filtros y la columna de ingresos", () => {
  const html = renderAdminUsuariosPage({ adminEmail: "admin@test" });
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  new Function(script);

  assert.ok(html.includes(">Ingresos<"));
  assert.ok(!html.includes(">Acciones<"));
  assert.ok(html.includes(">Leads restantes<"));
  assert.ok(html.includes('colspan="11"'));
  assert.ok(html.includes('id="search"'));
  assert.ok(html.includes('id="filterPlan"'));
  assert.ok(html.includes('data-periodo="hoy"'));
  assert.ok(html.includes('data-periodo="ayer"'));
  assert.ok(html.includes('data-periodo="7d"'));
  assert.ok(html.includes(">Personalizado<"));
  assert.ok(html.includes('id="ingresosAplicar"'));
  assert.ok(html.includes('data-action="save">Guardar'));
  assert.ok(html.includes('data-action="toggle"'));
  assert.ok(html.includes('data-action="contactos">Contactos'));
  assert.ok(html.includes('data-action="limites">Límites'));
  assert.ok(html.includes("data-acciones-for"));
  assert.ok(html.includes('"/api/admin/usuarios/"'));
  assert.ok(html.includes('"/plan"'));
  assert.ok(html.includes('"/estado"'));
  assert.ok(html.includes('"/limites"'));
  assert.ok(html.includes('"/ajuste-leads"'));
  assert.ok(html.includes('"/api/admin/ingresos?"'));
  assert.ok(html.includes("ev.stopPropagation()"));
  assert.ok(html.includes("Abrir este panel no modifica el plan ni los límites."));

  const toggle = script.slice(
    script.indexOf("function toggleAcciones"),
    script.indexOf("function renderLimitesPanel")
  );
  assert.ok(toggle.includes("panel.hidden = !panel.hidden"));
  assert.ok(!toggle.includes("fetch"));
  assert.ok(!toggle.includes("patchUsuario"));
  assert.ok(!toggle.includes("patchEstado"));
  assert.ok(!toggle.includes("patchLimites"));

  const fila = script.slice(script.indexOf("function rowHtml"), script.indexOf("function escapeHtml"));
  assert.ok(fila.includes('data-field="plan"'));
  assert.ok(fila.includes('data-field="estado_plan"'));
  assert.ok(fila.includes('data-field="fecha_vencimiento"'));
  assert.ok(!fila.includes("patchUsuario"));
});

check("el endpoint nuevo es de solo lectura y no está mezclado con guardar", () => {
  const route = fs.readFileSync(path.join(__dirname, "../routes/adminUsuariosApi.js"), "utf8");
  const inicio = route.indexOf('router.get("/api/admin/ingresos"');
  const fin = route.indexOf('router.get("/api/admin/resumen"');
  assert.ok(inicio > 0 && fin > inicio);
  const handler = route.slice(inicio, fin);
  assert.ok(handler.includes("obtenerIngresosAdmin"));
  assert.ok(!handler.includes("actualizarPlanUsuario"));
  assert.ok(!handler.includes("actualizarLimitesUsuario"));
  assert.ok(!handler.includes("actualizarEstadoUsuario"));
  assert.ok(!handler.includes("ajustarCapacidadLeads"));
  const svc = fs.readFileSync(path.join(__dirname, "../services/adminUsuariosService.js"), "utf8");
  assert.ok(!svc.includes("crm_conversiones?select=id,usuario_id,valor,moneda"));
});

async function main() {
  await checkAsync("obtenerIngresosAdmin no llama a la base si se inyecta el listado", async () => {
    let llamadas = 0;
    const result = await obtenerIngresosAdmin(
      { periodo: "hoy" },
      {
        now: NOW,
        listarConversiones: async (rango) => {
          llamadas += 1;
          assert.strictEqual(rango.desde, "2026-09-19T04:00:00.000Z");
          return [
            { id: "v1", usuario_id: "u1", valor: 12, moneda: "BOB" },
            { id: "v1", usuario_id: "u1", valor: 12, moneda: "BOB" },
          ];
        },
      }
    );
    assert.strictEqual(llamadas, 1);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.ventas, 1);
    assert.strictEqual(result.ingresos.u1.BOB, 12);
  });

  await checkAsync("lista vacía no inventa ingresos", async () => {
    const result = await obtenerIngresosAdmin(
      { periodo: "hoy" },
      { now: NOW, listarConversiones: async () => [] }
    );
    assert.deepStrictEqual(result.ingresos, {});
    assert.strictEqual(result.ventas, 0);
  });

  const periodoHoy = { desde: "2026-09-19T04:00:00.000Z", hasta: "2026-09-20T03:59:59.999Z" };

  function pagina(start, end, total, data, status = 200) {
    return {
      status,
      contentRange: start == null ? "*/" + total : start + "-" + end + "/" + total,
      data,
    };
  }

  function filas(desde, cantidad, extra = {}) {
    const data = [];
    for (let i = 0; i < cantidad; i += 1) {
      const n = desde + i;
      data.push({
        id: "v" + n,
        usuario_id: extra.usuario_id || "u1",
        valor: extra.valor == null ? 1 : extra.valor,
        moneda: extra.moneda || "BOB",
      });
    }
    return data;
  }

  async function rechazaLectura(solicitarPagina, fragmento) {
    let result;
    try {
      result = await obtenerIngresosAdmin(
        { periodo: "hoy" },
        { now: NOW, solicitarPagina }
      );
    } catch (error) {
      assert.strictEqual(error.code, "INGRESOS_LECTURA");
      if (fragmento) assert.ok(String(error.message).includes(fragmento), error.message);
      return;
    }
    assert.fail("la lectura fallida respondió éxito: " + JSON.stringify(result));
  }

  await checkAsync("404 de Supabase no se convierte en cero ventas", async () => {
    await rechazaLectura(async () => {
      const error = new Error("Could not find the table");
      error.response = { status: 404, data: { code: "PGRST205", message: "Could not find the table" } };
      throw error;
    });
  });

  await checkAsync("error de conexión no se convierte en cero ventas", async () => {
    await rechazaLectura(async () => {
      throw new Error("connect ECONNREFUSED");
    });
  });

  await checkAsync("consulta vacía con Content-Range cero es éxito", async () => {
    const result = await obtenerIngresosAdmin(
      { periodo: "hoy" },
      {
        now: NOW,
        solicitarPagina: async () => pagina(null, null, 0, []),
      }
    );
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.ventas, 0);
    assert.deepStrictEqual(result.ingresos, {});
    assert.strictEqual(result.desde, periodoHoy.desde);
  });

  await checkAsync("página corta con más páginas no cierra la suma", async () => {
    let llamadas = 0;
    const rows = await listarConversionesEnRango(periodoHoy, {
      solicitarPagina: async ({ desdeIdx }) => {
        llamadas += 1;
        if (desdeIdx === 0) return pagina(0, 499, 1500, filas(0, 500));
        if (desdeIdx === 500) return pagina(500, 1499, 1500, filas(500, 1000));
        throw new Error("página inesperada " + desdeIdx);
      },
    });
    assert.strictEqual(llamadas, 2);
    assert.strictEqual(rows.length, 1500);
    const sumado = agregarIngresos(rows);
    assert.strictEqual(sumado.ventas, 1500);
    assert.strictEqual(sumado.ingresos.u1.BOB, 1500);
  });

  await checkAsync("páginas consecutivas correctas", async () => {
    const pedidos = [];
    const rows = await listarConversionesEnRango(periodoHoy, {
      solicitarPagina: async ({ desdeIdx, hastaIdx }) => {
        pedidos.push([desdeIdx, hastaIdx]);
        if (desdeIdx === 0) return pagina(0, 999, 2500, filas(0, 1000));
        if (desdeIdx === 1000) return pagina(1000, 1999, 2500, filas(1000, 1000));
        if (desdeIdx === 2000) return pagina(2000, 2499, 2500, filas(2000, 500));
        throw new Error("página inesperada " + desdeIdx);
      },
    });
    assert.deepStrictEqual(pedidos, [
      [0, 999],
      [1000, 1999],
      [2000, 2499],
    ]);
    assert.strictEqual(rows.length, 2500);
    const sumado = agregarIngresos(rows);
    assert.strictEqual(sumado.ventas, 2500);
    assert.strictEqual(sumado.ingresos.u1.BOB, 2500);
  });

  await checkAsync("solapamiento con IDs iguales rechaza la lectura", async () => {
    await rechazaLectura(async ({ desdeIdx }) => {
      if (desdeIdx === 0) {
        return pagina(0, 1, 3, [
          { id: "a", usuario_id: "u1", valor: 10, moneda: "BOB" },
          { id: "b", usuario_id: "u1", valor: 5, moneda: "USD" },
        ]);
      }
      if (desdeIdx === 2) {
        return pagina(1, 2, 3, [
          { id: "b", usuario_id: "u1", valor: 5, moneda: "USD" },
          { id: "c", usuario_id: "u1", valor: 7, moneda: "BOB" },
        ]);
      }
      throw new Error("página inesperada " + desdeIdx);
    }, "solapó");
  });

  await checkAsync("solapamiento con IDs diferentes rechaza la lectura", async () => {
    await rechazaLectura(async ({ desdeIdx }) => {
      if (desdeIdx === 0) {
        return pagina(0, 1, 3, [
          { id: "a", usuario_id: "u1", valor: 10, moneda: "BOB" },
          { id: "b", usuario_id: "u1", valor: 1, moneda: "BOB" },
        ]);
      }
      if (desdeIdx === 2) {
        return pagina(1, 2, 3, [
          { id: "x", usuario_id: "u1", valor: 100, moneda: "BOB" },
          { id: "c", usuario_id: "u1", valor: 7, moneda: "BOB" },
        ]);
      }
      throw new Error("página inesperada " + desdeIdx);
    }, "solapó");
  });

  await checkAsync("id repetido dentro de una página rechaza la lectura", async () => {
    await rechazaLectura(async () => pagina(0, 1, 2, [
      { id: "a", usuario_id: "u1", valor: 10, moneda: "BOB" },
      { id: "a", usuario_id: "u1", valor: 10, moneda: "BOB" },
    ]), "repitió");
  });

  await checkAsync("id repetido entre páginas rechaza la lectura", async () => {
    await rechazaLectura(async ({ desdeIdx }) => {
      if (desdeIdx === 0) {
        return pagina(0, 0, 2, [
          { id: "a", usuario_id: "u1", valor: 10, moneda: "BOB" },
        ]);
      }
      if (desdeIdx === 1) {
        return pagina(1, 1, 2, [
          { id: "a", usuario_id: "u1", valor: 4, moneda: "BOB" },
        ]);
      }
      throw new Error("página inesperada " + desdeIdx);
    }, "repitió");
  });

  await checkAsync("un hueco en Content-Range no devuelve el parcial", async () => {
    await rechazaLectura(async ({ desdeIdx }) => {
      if (desdeIdx === 0) return pagina(0, 499, 1000, filas(0, 500));
      if (desdeIdx === 500) return pagina(600, 999, 1000, filas(600, 400));
      throw new Error("página inesperada " + desdeIdx);
    }, "omitió");
  });

  await checkAsync("un total anunciado distinto no devuelve el parcial", async () => {
    await rechazaLectura(async ({ desdeIdx }) => {
      if (desdeIdx === 0) return pagina(0, 0, 2, filas(0, 1));
      if (desdeIdx === 1) return pagina(1, 1, 3, filas(1, 1));
      throw new Error("página inesperada " + desdeIdx);
    }, "cambió");
  });

  await checkAsync("exactamente 20000 ventas se totalizan", async () => {
    const pedidos = [];
    const result = await obtenerIngresosAdmin(
      { periodo: "hoy" },
      {
        now: NOW,
        solicitarPagina: async ({ desdeIdx, hastaIdx }) => {
          pedidos.push([desdeIdx, hastaIdx]);
          return pagina(desdeIdx, hastaIdx, 20000, filas(desdeIdx, hastaIdx - desdeIdx + 1));
        },
      }
    );
    assert.strictEqual(pedidos.length, 20);
    for (let i = 0; i < pedidos.length; i += 1) {
      assert.deepStrictEqual(pedidos[i], [i * 1000, i * 1000 + 999]);
    }
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.ventas, 20000);
    assert.strictEqual(result.ingresos.u1.BOB, 20000);
  });

  await checkAsync("más de 20000 ventas es error y no un total parcial", async () => {
    let llamadas = 0;
    let result;
    try {
      result = await obtenerIngresosAdmin(
        { periodo: "hoy" },
        {
          now: NOW,
          solicitarPagina: async () => {
            llamadas += 1;
            return pagina(0, 999, 20001, filas(0, 1000));
          },
        }
      );
    } catch (error) {
      assert.strictEqual(error.code, "INGRESOS_DEMASIADAS_FILAS");
      assert.strictEqual(llamadas, 1);
      return;
    }
    assert.fail("respondió éxito con parcial: " + JSON.stringify(result && result.ingresos));
  });

  await checkAsync("monedas distintas no se suman en la lectura paginada", async () => {
    const result = await obtenerIngresosAdmin(
      { periodo: "hoy" },
      {
        now: NOW,
        solicitarPagina: async () => pagina(0, 2, 3, [
          { id: "bo", usuario_id: "u1", valor: 10, moneda: "BS" },
          { id: "us", usuario_id: "u1", valor: 4, moneda: "USD" },
          { id: "cl", usuario_id: "u2", valor: 1000, moneda: "CLP" },
        ]),
      }
    );
    assert.strictEqual(result.ingresos.u1.BOB, 10);
    assert.strictEqual(result.ingresos.u1.USD, 4);
    assert.strictEqual(result.ingresos.u1.BS, undefined);
    assert.strictEqual(result.ingresos.u2.CLP, 1000);
    assert.strictEqual(Object.keys(result.ingresos.u1).length, 2);
  });

  console.log("\nPASS admin ingresos — sin Supabase");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exit(1);
});
