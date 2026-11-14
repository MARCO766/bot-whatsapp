/**
 * Dos procesos Node distintos contra PostgreSQL local.
 * El proceso B no hereda CLAVES_INCIERTAS. No usa Storage real.
 * Sin base local no se ejecuta y no se marca como aprobada.
 *
 * Ejecutar: node tests/limpiezaMediaProcesos.integracion.test.js
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
  console.log(`NO EJECUTADA: proceso A reserva, pasa a borrando y muere durante storage; proceso B rechaza el segundo DELETE. ${motivo}`);
  console.log(`NO EJECUTADA: la misma secuencia con resultado incierto. ${motivo}`);
  console.log(`NO EJECUTADA: ningún resultado incierto libera la conversación ni permite otro DELETE. ${motivo}`);
  process.exitCode = 2;
}

async function leer(client, usuario, conexion, numero) {
  const res = await client.query(
    `select estado, owner, resultado
     from public.limpieza_media_marca
     where usuario_id = $1 and conexion_whatsapp_id = $2 and cliente_numero = $3`,
    [usuario, conexion, numero]
  );
  return res.rows[0] || null;
}

function exigirEvento(mensaje, evento) {
  if (mensaje.error) throw new Error(mensaje.error);
  if (mensaje.terminado) {
    throw new Error(`El proceso A terminó antes de ${evento} (${mensaje.code} ${mensaje.signal || ""}). ${mensaje.salida || ""}`);
  }
  assert.strictEqual(mensaje.evento, evento);
  return mensaje;
}

async function cortarProcesoA(preparado, mensaje, evento) {
  const trabajador = abrirTrabajador();
  try {
    trabajador.child.send({ ...mensaje, pgUrl: preparado.url });
    const aviso = exigirEvento(await trabajador.siguiente(), evento);
    assert.notStrictEqual(aviso.pid, process.pid);
    return aviso.pid;
  } finally {
    await trabajador.matar();
  }
}

async function procesoB(preparado, mensaje) {
  const trabajador = abrirTrabajador();
  try {
    trabajador.child.send({
      ...mensaje,
      cmd: "rechazar-delete",
      pgUrl: preparado.url,
      workerId: "proceso-b",
      owner: "cl:proceso-b",
    });
    const informe = await trabajador.siguiente();
    if (informe.error) throw new Error(informe.error);
    if (informe.terminado && informe.pid == null) {
      throw new Error(`El proceso B terminó sin informe (${informe.code}). ${trabajador.texto()}`);
    }
    assert.notStrictEqual(informe.pid, process.pid);
    return informe;
  } finally {
    await trabajador.matar();
  }
}

function rechazaSegundoDelete(informe, pidA) {
  assert.notStrictEqual(informe.pid, pidA);
  assert.strictEqual(informe.esInciertoAntes, false);
  assert.strictEqual(informe.esInciertoDespues, false);
  assert.strictEqual(informe.estado, "borrando");
  assert.strictEqual(informe.storage, 0);
  assert.strictEqual(informe.deletes, 0);
  assert.strictEqual(informe.motivoSegundo, "resultado_incierto");
  assert.strictEqual(informe.reintentar, false);
  assert.strictEqual(informe.eliminado, false);
  assert.notStrictEqual(informe.storageSegundo, true);
  assert.strictEqual(informe.eliminadoDirecto, false);
  assert.notStrictEqual(informe.storageDirecto, true);
  assert.strictEqual(informe.planEliminar, false);
  assert.strictEqual(informe.planMotivo, "valla_ocupada");
  assert.strictEqual(informe.reservaOk, false);
  assert.strictEqual(informe.reservaMotivo, "valla_ocupada");
  assert.strictEqual(informe.promoverOk, false);
  assert.strictEqual(informe.promoverMotivo, "resultado_incierto");
  assert.notStrictEqual(informe.liberada, true);
  assert.strictEqual(informe.liberarOk, false);
  assert.strictEqual(informe.estadoFinal, "borrando");
  assert.strictEqual(informe.borradoReal, false);
  assert.strictEqual(informe.bloqueoGlobal, true);
}

async function escenario(preparado, modo) {
  const sufijo = `${modo}${process.pid}${Date.now()}`;
  const usuario = `prueba-proceso-${sufijo}`;
  const conexion = "conexion-prueba";
  const numero = modo === "storage" ? "59170000031" : "59170000032";
  const clave = `archivos/whatsapp/${usuario}/foto.jpg`;
  const mensaje = {
    usuarioId: usuario,
    conexionId: conexion,
    numero,
    clave,
    workerId: "proceso-a",
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

  const pidA = await cortarProcesoA(
    preparado,
    { ...mensaje, cmd: modo === "storage" ? "colgar-en-storage" : "guardar-incierto" },
    modo === "storage" ? "storage-en-curso" : "incierto-guardado"
  );
  const durante = await leer(preparado.client, usuario, conexion, numero);
  assert.ok(durante, "el proceso A no dejó fila en PostgreSQL");
  assert.strictEqual(durante.estado, "borrando");
  assert.strictEqual(durante.owner, "cl:proceso-a");
  assert.strictEqual(durante.resultado, modo === "storage" ? null : "incierto");

  const informe = await procesoB(preparado, mensaje);
  rechazaSegundoDelete(informe, pidA);
  assert.strictEqual(informe.resultado, modo === "storage" ? null : "incierto");
  assert.strictEqual(informe.resultadoFinal, modo === "storage" ? null : "incierto");
  if (modo === "storage") {
    assert.strictEqual(informe.liberarMotivo, "storage_en_curso");
    assert.strictEqual(informe.motivoDirecto, "bloqueada");
  } else {
    assert.strictEqual(informe.liberarMotivo, "verificacion_requerida");
    assert.strictEqual(informe.motivoDirecto, "resultado_incierto");
  }
  const despues = await leer(preparado.client, usuario, conexion, numero);
  assert.strictEqual(despues.estado, "borrando");
  assert.strictEqual(despues.owner, "cl:proceso-a");
  assert.strictEqual(despues.resultado, modo === "storage" ? null : "incierto");
}

async function main() {
  const preparado = await preparar();
  if (!preparado.ejecutable) {
    noEjecutada(preparado.motivo);
    return;
  }
  try {
    await escenario(preparado, "storage");
    ok("el proceso B, sin CLAVES_INCIERTAS, encuentra borrando y rechaza el segundo DELETE");
    await escenario(preparado, "incierto");
    ok("el proceso B rechaza el DELETE de un resultado incierto y la conversación sigue bloqueada");
    console.log(`${passed} pruebas ok`);
  } finally {
    await preparado.cerrar();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
