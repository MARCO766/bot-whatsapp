/**
 * Turno del Cron con reloj y HTTP simulados. No abre red ni llama a Supabase.
 *
 * Ejecutar: node tests/limpiezaMediaTurno.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const turno = require("../scripts/limpieza-media-turno");

const URL = "https://ejemplo.invalid";

let passed = 0;
function ok(nombre) {
  passed += 1;
  console.log("ok", nombre);
}

function lote(parcial) {
  return {
    ok: true,
    motivo: "lote",
    procesados: 20,
    actualizados: 20,
    pendientes: 0,
    agotado: false,
    ...parcial,
  };
}

function clienteDe(respuestas) {
  const llamadas = [];
  const cliente = {
    async post(url, body) {
      llamadas.push({ url, body });
      const respuesta = respuestas[llamadas.length - 1];
      if (!respuesta) throw new Error("sin respuesta simulada");
      if (respuesta.error) throw respuesta.error;
      return { status: 200, data: respuesta.data };
    },
  };
  return { cliente, llamadas };
}

function fechaUtc(hora, minuto = 0) {
  return new Date(Date.UTC(2026, 10, 19, hora, minuto, 0));
}

async function correr(opciones) {
  const avisos = [];
  const resultado = await turno.ejecutarTurno({
    url: URL,
    key: "clave-de-prueba",
    escribirLinea() {},
    dormir() {
      return Promise.resolve();
    },
    salida(texto) {
      avisos.push(texto);
    },
    ...opciones,
  });
  return { resultado, avisos };
}

async function sinConfirmarNoLanzaNada() {
  let limpieza = 0;
  let red = 0;
  const { resultado, avisos } = await correr({
    confirmar: false,
    ahora: fechaUtc(6),
    lanzarLimpieza() {
      limpieza += 1;
      return { codigo: 0, motivo: "limpieza" };
    },
    cliente: {
      async post() {
        red += 1;
        throw new Error("red");
      },
    },
  });
  assert.strictEqual(limpieza, 0);
  assert.strictEqual(red, 0);
  assert.strictEqual(resultado.codigo, 0);
  assert.strictEqual(resultado.motivo, "sin_confirmar");
  assert.strictEqual(resultado.red, false);
  assert.deepStrictEqual(avisos, []);
  ok("sin --confirmar no lanza la limpieza ni el backfill");
}

async function otraHoraSoloLanzaLaLimpieza() {
  let red = 0;
  const { resultado, avisos } = await correr({
    confirmar: true,
    ahora: fechaUtc(10),
    lanzarLimpieza() {
      return { codigo: 0, motivo: "limpieza", red: true };
    },
    cliente: {
      async post() {
        red += 1;
        throw new Error("red");
      },
    },
  });
  assert.strictEqual(red, 0);
  assert.strictEqual(resultado.codigo, 0);
  assert.strictEqual(resultado.tarea, "limpieza");
  assert.strictEqual(resultado.motivo, "limpieza");
  assert.deepStrictEqual(avisos, ["[LIMPIEZA_MEDIA_TURNO] limpieza"]);
  ok("a las 10:00 UTC solo lanza el comando de limpieza");
}

async function aLasDosDeBoliviaHaceElBackfill() {
  let limpieza = 0;
  const { cliente, llamadas } = clienteDe([
    { data: lote({ procesados: 20, actualizados: 12, pendientes: 385407, agotado: false }) },
    { data: lote({ procesados: 7, actualizados: 7, pendientes: 0, agotado: true }) },
  ]);
  const { resultado, avisos } = await correr({
    confirmar: true,
    ahora: fechaUtc(6),
    ahoraMs: () => fechaUtc(6).getTime(),
    cliente,
    lanzarLimpieza() {
      limpieza += 1;
      return { codigo: 0, motivo: "limpieza" };
    },
  });
  assert.strictEqual(limpieza, 0);
  assert.strictEqual(llamadas.length, 2);
  assert.strictEqual(llamadas[0].url, `${URL}/rest/v1/rpc/limpieza_media_backfill_media_cita`);
  assert.deepStrictEqual(llamadas[0].body, { p_lote: 20 });
  assert.strictEqual(resultado.codigo, 0);
  assert.strictEqual(resultado.motivo, "agotado");
  assert.strictEqual(resultado.completado, true);
  assert.ok(avisos.includes("[LIMPIEZA_MEDIA_TURNO] backfill"));
  assert.ok(avisos.includes("[LIMPIEZA_MEDIA_M2] completado"));
  ok("a las 02:00 de Bolivia recorre el backfill y registra el cierre");
}

async function laNocheSiguienteNoReprocesa() {
  const { cliente, llamadas } = clienteDe([
    { data: lote({ procesados: 0, actualizados: 0, pendientes: 0, agotado: true }) },
    { data: lote({ procesados: 20, actualizados: 20, pendientes: 0, agotado: false }) },
  ]);
  const { resultado } = await correr({
    confirmar: true,
    ahora: fechaUtc(6, 5),
    ahoraMs: () => fechaUtc(6, 5).getTime(),
    cliente,
    lanzarLimpieza() {
      throw new Error("no debe lanzar la limpieza");
    },
  });
  assert.strictEqual(llamadas.length, 1);
  assert.strictEqual(resultado.codigo, 0);
  assert.strictEqual(resultado.completado, true);
  assert.strictEqual(resultado.lineas[0].procesados, 0);
  ok("con pendientes en cero hace una sola llamada y no vuelve a procesar");
}

async function laVentanaNoCruzaLaLimpieza() {
  let reloj = fechaUtc(6).getTime();
  const corte = Date.UTC(2026, 10, 19, 9, 30, 0);
  const { cliente, llamadas } = clienteDe([
    { data: lote({ procesados: 20, actualizados: 20, pendientes: 385407, agotado: false }) },
    { data: lote({ agotado: true }) },
  ]);
  const { resultado, avisos } = await correr({
    confirmar: true,
    ahora: fechaUtc(6),
    ahoraMs: () => reloj,
    dormir() {
      reloj = corte;
      return Promise.resolve();
    },
    cliente,
    lanzarLimpieza() {
      throw new Error("no debe lanzar la limpieza");
    },
  });
  assert.strictEqual(llamadas.length, 1);
  assert.strictEqual(resultado.codigo, 0);
  assert.strictEqual(resultado.motivo, "ventana_cerrada");
  assert.strictEqual(resultado.completado, undefined);
  assert.ok(avisos.includes("[LIMPIEZA_MEDIA_M2] ventana_cerrada"));
  assert.ok(avisos.includes("[LIMPIEZA_MEDIA_M2] pendientes 385407"));
  ok("el backfill se detiene a las 09:30 UTC y no es un error");
}

function contratoEstatico() {
  const script = fs.readFileSync(
    path.join(__dirname, "../scripts/limpieza-media-turno.js"),
    "utf8"
  );
  const cron = fs.readFileSync(
    path.join(__dirname, "../scripts/limpieza-media-cron.js"),
    "utf8"
  );
  const docker = fs.readFileSync(path.join(__dirname, "../Dockerfile"), "utf8");
  const servicio = fs.readFileSync(
    path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaService.js"),
    "utf8"
  );
  const webhook = fs.readFileSync(path.join(__dirname, "../routes/webhook.js"), "utf8");

  assert.strictEqual(turno.HORA_BACKFILL_UTC, 6);
  assert.strictEqual(turno.CORTE_HORA_UTC, 9);
  assert.strictEqual(turno.CORTE_MINUTO_UTC, 30);
  assert.strictEqual(turno.SCRIPT_LIMPIEZA, "limpieza-media-cron.js");
  assert.ok(script.includes("spawn"));
  assert.ok(script.includes("limpieza-media-cron.js"));
  assert.ok(!script.includes("limpiezaMediaEliminar"));
  assert.ok(!script.includes("routes/webhook"));
  assert.ok(!script.includes("storage.objects"));
  assert.ok(!script.includes("ELIMINACION_REAL_BLOQUEADA = false"));
  assert.ok(cron.includes("node scripts/limpieza-media-cron.js"));
  assert.ok(docker.includes("CMD [\"node\", \"server.js\"]"));
  assert.ok(docker.includes("scripts/limpieza-media-cron.js"));
  assert.ok(docker.includes("scripts/limpieza-media-turno.js"));
  assert.ok(servicio.includes("const ELIMINACION_REAL_BLOQUEADA = true;"));
  assert.ok(!webhook.includes("limpieza_media_backfill_media_cita"));
  ok("el turno no toca el webhook y el comando de la imagen sigue siendo el servidor");
}

async function main() {
  await sinConfirmarNoLanzaNada();
  await otraHoraSoloLanzaLaLimpieza();
  await aLasDosDeBoliviaHaceElBackfill();
  await laNocheSiguienteNoReprocesa();
  await laVentanaNoCruzaLaLimpieza();
  contratoEstatico();
  console.log(`${passed} pruebas ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
