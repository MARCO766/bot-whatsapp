/**
 * Integración con PostgreSQL local.
 * No usa SUPABASE_URL ni SUPABASE_SECRET_KEY.
 * Sin una base local no se ejecuta y no se marca como aprobada.
 *
 * Ejecutar, cuando haya Postgres en localhost:
 *   node tests/limpiezaMediaMarcaPg.integracion.test.js
 * o, con una base local ya creada:
 *   LIMPIEZA_MEDIA_PG_URL=postgres://127.0.0.1:5432/prueba node tests/limpiezaMediaMarcaPg.integracion.test.js
 */
const assert = require("assert");
const { preparar, cortarProduccion, opcionesSql } = require("./herramientas/limpiezaMediaPgLocal");
const { abrirTrabajador } = require("./herramientas/limpiezaMediaProceso");

let passed = 0;
function ok(nombre) {
  passed += 1;
  console.log("ok", nombre);
}

function noEjecutada(motivo) {
  console.log(`NO EJECUTADA: integración PostgreSQL de la marca. ${motivo}`);
  console.log(`NO EJECUTADA: reservar, promover, consultar, reintentar y liberar con resultado incierto. ${motivo}`);
  console.log(`NO EJECUTADA: la conversación incierta sigue bloqueada. ${motivo}`);
  process.exitCode = 2;
}

async function otroProceso(preparado, mensaje) {
  const trabajador = abrirTrabajador();
  try {
    trabajador.child.send({ ...mensaje, cmd: "accion", pgUrl: preparado.url });
    const respuesta = await trabajador.siguiente();
    if (respuesta.error) throw new Error(respuesta.error);
    if (!respuesta.fila) {
      throw new Error(`El otro proceso no devolvió resultado (${respuesta.code}). ${trabajador.texto()}`);
    }
    assert.notStrictEqual(respuesta.pid, process.pid);
    return respuesta;
  } finally {
    await trabajador.matar();
  }
}

async function fila(client, usuario, conexion, numero) {
  const res = await client.query(
    `select estado, owner, resultado
     from public.limpieza_media_marca
     where usuario_id = $1 and conexion_whatsapp_id = $2 and cliente_numero = $3`,
    [usuario, conexion, numero]
  );
  return res.rows[0] || null;
}

async function escenario(preparado) {
  cortarProduccion();
  const store = require("../services/limpiezaMedia/limpiezaMediaMarcaStore");
  const sufijo = `${process.pid}${Date.now()}`;
  const usuario = `prueba-marca-${sufijo}`;
  const conexion = "conexion-prueba";
  const numero = "59170000021";
  const clave = `archivos/whatsapp/${usuario}/foto.jpg`;
  const dueno = "cl:proceso-a";
  const identidad = {
    usuarioId: usuario,
    conexionId: conexion,
    numero,
    clave,
  };
  preparado.rastrear(async (client) => {
    await client.query(
      `delete from public.limpieza_media_marca_auditoria
       where usuario_id = $1 and conexion_whatsapp_id = $2 and cliente_numero = $3`,
      [usuario, conexion, numero]
    );
    await client.query(
      `delete from public.limpieza_media_marca
       where usuario_id = $1 and conexion_whatsapp_id = $2 and cliente_numero = $3`,
      [usuario, conexion, numero]
    );
  });

  const primero = opcionesSql(preparado.client, preparado.funciones, { ...identidad, owner: dueno });
  const reserva = await store.reservar(primero);
  assert.strictEqual(reserva.ok, true, reserva.motivo);
  assert.strictEqual(reserva.estado, "reservado");
  ok("un cliente reservó la conversación");

  const promovida = await store.pasarABorrando({ ...primero, claveArchivo: clave });
  assert.strictEqual(promovida.ok, true, promovida.motivo);
  assert.strictEqual(promovida.estado, "borrando");
  assert.notStrictEqual(promovida.storage, true);
  ok("esa reserva pasó a borrando");

  const segundoClient = await preparado.otroCliente();
  try {
    const segundo = opcionesSql(segundoClient, preparado.funciones, identidad);
    const consulta = await store.consultar(segundo);
    assert.strictEqual(consulta.ok, true, consulta.motivo);
    assert.strictEqual(consulta.marca.estado, "borrando");
    assert.strictEqual(consulta.marca.owner, dueno);
    assert.strictEqual(consulta.marca.resultado, null);
    ok("otro cliente leyó la marca en borrando");
  } finally {
    await segundoClient.end();
  }

  const reservaAjena = await otroProceso(preparado, { ...identidad, accion: "reservar", owner: "cl:proceso-b" });
  assert.strictEqual(reservaAjena.fila.ok, false);
  assert.strictEqual(reservaAjena.fila.motivo, "valla_ocupada");
  ok("otro proceso no pudo reservarla");

  const promoverAjena = await otroProceso(preparado, {
    ...identidad,
    accion: "borrando",
    owner: "cl:proceso-b",
  });
  assert.strictEqual(promoverAjena.fila.ok, false);
  assert.strictEqual(promoverAjena.fila.motivo, "resultado_incierto");
  assert.strictEqual(promoverAjena.fila.reintentar, false);
  ok("otro proceso no pudo promoverla otra vez");

  const incierto = await store.registrarResultado({ ...primero, resultado: "incierto" });
  assert.strictEqual(incierto.ok, true, incierto.motivo);
  assert.strictEqual(incierto.resultado, "incierto");
  assert.notStrictEqual(incierto.storage, true);
  const trasIncerto = await fila(preparado.client, usuario, conexion, numero);
  assert.strictEqual(trasIncerto.estado, "borrando");
  assert.strictEqual(trasIncerto.resultado, "incierto");

  const suelta = await otroProceso(preparado, {
    ...identidad,
    accion: "liberar",
    owner: "cl:proceso-b",
    actor: "cl:proceso-b",
    nota: "intento con resultado incierto",
  });
  assert.strictEqual(suelta.fila.ok, false);
  assert.notStrictEqual(suelta.fila.liberada, true);
  assert.strictEqual(suelta.fila.motivo, "verificacion_requerida");
  assert.notStrictEqual(suelta.fila.storage, true);
  ok("liberar con resultado incierto no soltó la conversación");

  const bloqueada = await fila(preparado.client, usuario, conexion, numero);
  assert.strictEqual(bloqueada.estado, "borrando");
  assert.strictEqual(bloqueada.owner, dueno);
  assert.strictEqual(bloqueada.resultado, "incierto");
  const otraReserva = await store.reservar({ ...primero, owner: "cl:proceso-c" });
  assert.strictEqual(otraReserva.ok, false);
  assert.strictEqual(otraReserva.motivo, "valla_ocupada");
  const otraPromocion = await store.pasarABorrando({
    ...primero,
    owner: dueno,
    claveArchivo: clave,
  });
  assert.strictEqual(otraPromocion.ok, false);
  assert.strictEqual(otraPromocion.motivo, "resultado_incierto");
  const auditoria = await preparado.client.query(
    `select count(*)::int as n
     from public.limpieza_media_marca_auditoria
     where usuario_id = $1 and conexion_whatsapp_id = $2 and cliente_numero = $3`,
    [usuario, conexion, numero]
  );
  assert.strictEqual(auditoria.rows[0].n, 0);
  const sigue = await fila(preparado.client, usuario, conexion, numero);
  assert.strictEqual(sigue.estado, "borrando");
  assert.strictEqual(sigue.resultado, "incierto");
  ok("la conversación sigue bloqueada");
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
