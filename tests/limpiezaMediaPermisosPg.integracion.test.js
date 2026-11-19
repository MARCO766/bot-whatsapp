/**
 * Catálogo local de PostgreSQL: RLS, GRANT y EXECUTE.
 * Los privilegios esperados salen de las migraciones, no de una lista copiada.
 * Sin base local no se ejecuta y no se marca como aprobada.
 *
 * Ejecutar: node tests/limpiezaMediaPermisosPg.integracion.test.js
 */
const assert = require("assert");
const { preparar } = require("./herramientas/limpiezaMediaPgLocal");

const PRIVILEGIOS = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
const ROLES_SIN_ACCESO = ["anon", "authenticated", "public"];

let passed = 0;
function ok(nombre) {
  passed += 1;
  console.log("ok", nombre);
}

function noEjecutada(motivo) {
  console.log(`NO EJECUTADA: RLS habilitado en las seis tablas. ${motivo}`);
  console.log(`NO EJECUTADA: sin privilegios para anon y authenticated. ${motivo}`);
  console.log(`NO EJECUTADA: privilegios de service_role según las migraciones. ${motivo}`);
  console.log(`NO EJECUTADA: DELETE de service_role solo en media_cita. ${motivo}`);
  console.log(`NO EJECUTADA: las funciones RPC solo las ejecuta service_role. ${motivo}`);
  process.exitCode = 2;
}

function sqlDe(privilegio) {
  return privilegio.toUpperCase();
}

async function privilegiosDe(client, rol, tabla) {
  const presentes = [];
  for (const privilegio of PRIVILEGIOS) {
    const res = await client.query(
      "select has_table_privilege($1, $2, $3) as ok",
      [rol, `public.${tabla}`, privilegio]
    );
    if (res.rows[0].ok === true) presentes.push(privilegio);
  }
  return presentes;
}

function tipoSinDefault(tipo) {
  return tipo.replace(/\s+default\b[\s\S]*$/i, "").replace(/\s+/g, " ").trim();
}

function firmaTexto(funcion) {
  return funcion.parametros
    .map((parametro) => `${parametro.nombre} ${tipoSinDefault(parametro.tipo)}`)
    .join(", ");
}

async function escenario(preparado) {
  const esperadas = [...preparado.tablas.keys()].sort();
  assert.strictEqual(esperadas.length, 6, esperadas.join(", "));
  assert.ok(esperadas.includes("media_cita"));

  const clases = await preparado.client.query(
    `select c.relname, c.relrowsecurity
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname = any($1::text[])
     order by c.relname`,
    [esperadas]
  );
  const encontradas = clases.rows.map((fila) => fila.relname);
  assert.deepStrictEqual(encontradas, esperadas);
  for (const fila of clases.rows) {
    assert.strictEqual(fila.relrowsecurity, true, fila.relname);
    assert.strictEqual(preparado.tablas.get(fila.relname).rls, true);
  }
  ok("RLS está habilitado en las seis tablas");

  for (const tabla of esperadas) {
    for (const rol of ROLES_SIN_ACCESO) {
      const presentes = await privilegiosDe(preparado.client, rol, tabla);
      assert.deepStrictEqual(presentes, [], `${rol} tiene privilegios en ${tabla}: ${presentes.join(", ")}`);
    }
  }
  ok("anon, authenticated y public no tienen privilegios sobre las tablas");

  for (const tabla of esperadas) {
    const otorgados = preparado.tablas.get(tabla).service.map(sqlDe).sort();
    const reales = (await privilegiosDe(preparado.client, "service_role", tabla)).sort();
    assert.deepStrictEqual(reales, otorgados, tabla);
    if (tabla === "media_cita") {
      assert.ok(otorgados.includes("DELETE"), tabla);
      assert.ok(!otorgados.includes("UPDATE"), tabla);
    } else {
      assert.ok(!otorgados.includes("DELETE"), tabla);
      assert.ok(!reales.includes("DELETE"), tabla);
    }
  }
  ok("service_role tiene exactamente los privilegios que otorgan las migraciones");
  ok("DELETE de service_role queda solo en media_cita");

  const catalogo = await preparado.client.query(
    `select p.oid::text as oid,
            p.proname,
            pg_get_function_identity_arguments(p.oid) as args
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'limpieza_media\\_%' escape '\\'
     order by p.proname, args`
  );
  const nombres = catalogo.rows.map((fila) => fila.proname).sort();
  assert.deepStrictEqual(nombres, [...preparado.funciones.keys()].sort());
  for (const fila of catalogo.rows) {
    const funcion = preparado.funciones.get(fila.proname);
    assert.strictEqual(fila.args.replace(/\s+/g, " ").trim(), firmaTexto(funcion), fila.proname);
    const roles = [...new Set(preparado.ejecucion.get(fila.proname) || [])];
    assert.deepStrictEqual(roles, ["service_role"], fila.proname);
    for (const rol of ["service_role", "anon", "authenticated", "public"]) {
      const res = await preparado.client.query(
        "select has_function_privilege($1, $2::oid, 'EXECUTE') as ok",
        [rol, fila.oid]
      );
      assert.strictEqual(res.rows[0].ok, rol === "service_role", `${rol} EXECUTE ${fila.proname}`);
    }
  }
  ok("las funciones RPC solo las ejecuta service_role");
}

async function main() {
  const preparado = await preparar();
  if (!preparado.ejecutable) {
    noEjecutada(preparado.motivo);
    return;
  }
  try {
    await escenario(preparado);
    console.log(`${passed} pruebas ok`);
  } finally {
    await preparado.cerrar();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
