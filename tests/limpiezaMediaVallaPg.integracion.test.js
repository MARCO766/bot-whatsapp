/**
 * Concurrencia real de las vallas, con dos procesos Node y PostgreSQL local.
 * No usa Storage. Sin base local no se ejecuta y no se marca como aprobada.
 *
 * Ejecutar: node tests/limpiezaMediaVallaPg.integracion.test.js
 */
const assert = require("assert");
const { preparar } = require("./herramientas/limpiezaMediaPgLocal");
const { abrirTrabajador } = require("./herramientas/limpiezaMediaProceso");

let passed = 0;
function ok(nombre) {
  passed += 1;
  console.log("ok", nombre);
}

function noEjecutada(motivo) {
  console.log(`NO EJECUTADA: dos procesos intentando adquirir la misma conversación. ${motivo}`);
  console.log(`NO EJECUTADA: dos procesos intentando adquirir el mismo objeto. ${motivo}`);
  console.log(`NO EJECUTADA: dos conversaciones distintas trabajando a la vez. ${motivo}`);
  process.exitCode = 2;
}

async function competir(preparado, izquierda, derecha) {
  const a = abrirTrabajador();
  const b = abrirTrabajador();
  const vivos = [a, b];
  try {
    a.child.send({ ...izquierda, cmd: "adquirir", pgUrl: preparado.url });
    b.child.send({ ...derecha, cmd: "adquirir", pgUrl: preparado.url });
    const listos = await Promise.all([a.siguiente(), b.siguiente()]);
    for (const aviso of listos) {
      if (aviso.error) throw new Error(aviso.error);
      assert.strictEqual(aviso.evento, "listo");
    }
    assert.notStrictEqual(listos[0].pid, listos[1].pid);
    a.child.send({ cmd: "ya" });
    b.child.send({ cmd: "ya" });
    const tomadas = await Promise.all([a.siguiente(), b.siguiente()]);
    for (const tomada of tomadas) {
      if (tomada.error) throw new Error(tomada.error);
      assert.strictEqual(tomada.evento, "tomada");
    }
    return {
      tomadas,
      async soltar() {
        a.child.send({ cmd: "soltar" });
        b.child.send({ cmd: "soltar" });
        const finales = await Promise.all([a.siguiente(), b.siguiente()]);
        for (const fin of finales) {
          if (fin.error) throw new Error(fin.error);
        }
      },
      async cerrar() {
        await Promise.all(vivos.map((trabajador) => trabajador.matar()));
      },
    };
  } catch (error) {
    await Promise.all(vivos.map((trabajador) => trabajador.matar()));
    throw error;
  }
}

async function cerrarCompetencia(carrera) {
  if (!carrera) return;
  try {
    await carrera.soltar();
  } finally {
    await carrera.cerrar();
  }
}

async function mismaValla(preparado, tipo, motivoOcupada) {
  const sufijo = `${tipo}${process.pid}${Date.now()}`;
  const hilo = `hilo-${sufijo}`;
  const clave = `objeto-${sufijo}`;
  preparado.rastrear(async (client) => {
    await client.query("delete from public.limpieza_media_hilo where hilo = $1", [hilo]);
    await client.query("delete from public.limpieza_media_objeto where clave = $1", [clave]);
  });
  const comun = { tipo, hilo, clave, ttl: 60 };
  const carrera = await competir(
    preparado,
    { ...comun, owner: "cl:valla-a" },
    { ...comun, owner: "cl:valla-b" }
  );
  try {
    const ganadores = carrera.tomadas.filter((tomada) => tomada.ok === true);
    const perdedores = carrera.tomadas.filter((tomada) => tomada.ok !== true);
    assert.strictEqual(ganadores.length, 1);
    assert.strictEqual(perdedores.length, 1);
    assert.strictEqual(perdedores[0].motivo, motivoOcupada);
    const valor = tipo === "objeto" ? clave : hilo;
    const res = tipo === "objeto"
      ? await preparado.client.query(
        "select locked_by from public.limpieza_media_objeto where clave = $1",
        [valor]
      )
      : await preparado.client.query(
        "select locked_by from public.limpieza_media_hilo where hilo = $1",
        [valor]
      );
    assert.strictEqual(res.rows.length, 1);
    assert.strictEqual(res.rows[0].locked_by, ganadores[0].locked_by);
  } finally {
    await cerrarCompetencia(carrera);
  }
}

async function conversacionesDistintas(preparado) {
  const sufijo = `${process.pid}${Date.now()}`;
  const una = { hilo: `hilo-a-${sufijo}`, clave: `objeto-a-${sufijo}`, owner: "cl:valla-a" };
  const otra = { hilo: `hilo-b-${sufijo}`, clave: `objeto-b-${sufijo}`, owner: "cl:valla-b" };
  preparado.rastrear(async (client) => {
    await client.query("delete from public.limpieza_media_hilo where hilo = any($1::text[])", [[una.hilo, otra.hilo]]);
    await client.query("delete from public.limpieza_media_objeto where clave = any($1::text[])", [[una.clave, otra.clave]]);
  });
  const carrera = await competir(
    preparado,
    { ...una, tipo: "conversacion", ttl: 60 },
    { ...otra, tipo: "conversacion", ttl: 60 }
  );
  try {
    assert.strictEqual(carrera.tomadas[0].ok, true, carrera.tomadas[0].motivo);
    assert.strictEqual(carrera.tomadas[1].ok, true, carrera.tomadas[1].motivo);
    const hilos = await preparado.client.query(
      `select hilo, locked_by, modo
       from public.limpieza_media_hilo
       where hilo = any($1::text[])
       order by hilo`,
      [[una.hilo, otra.hilo]]
    );
    const objetos = await preparado.client.query(
      `select clave, locked_by
       from public.limpieza_media_objeto
       where clave = any($1::text[])
       order by clave`,
      [[una.clave, otra.clave]]
    );
    assert.strictEqual(hilos.rows.length, 2);
    assert.strictEqual(objetos.rows.length, 2);
    assert.ok(hilos.rows.every((fila) => fila.modo === "limpieza" && fila.locked_by));
    assert.ok(objetos.rows.every((fila) => fila.locked_by));
    assert.notStrictEqual(hilos.rows[0].locked_by, hilos.rows[1].locked_by);
  } finally {
    await cerrarCompetencia(carrera);
  }
}

async function main() {
  const preparado = await preparar();
  if (!preparado.ejecutable) {
    noEjecutada(preparado.motivo);
    return;
  }
  try {
    await mismaValla(preparado, "hilo", "valla_ocupada");
    ok("dos procesos no adquieren la misma conversación");
    await mismaValla(preparado, "objeto", "objeto_ocupado");
    ok("dos procesos no adquieren el mismo objeto");
    await conversacionesDistintas(preparado);
    ok("dos conversaciones distintas trabajan al mismo tiempo");
    console.log(`${passed} pruebas ok`);
  } finally {
    await preparado.cerrar();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
