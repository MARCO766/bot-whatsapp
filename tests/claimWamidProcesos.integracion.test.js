/**
 * Dos procesos Node y una base PostgreSQL desechable.
 * Aplica solo en localhost el índice de add_mensajes_whatsapp_message_id_unique.sql.
 * No consulta producción ni asume que ese índice ya esté instalado allí.
 *
 * Ejecutar: node tests/claimWamidProcesos.integracion.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { fork } = require("child_process");
const pgLocal = require("./herramientas/limpiezaMediaPgLocal");

let passed = 0;
function ok(nombre) {
  passed += 1;
  console.log("ok", nombre);
}

function noEjecutada(motivo) {
  console.log(`NO EJECUTADA: dos procesos y el mismo wamid. ${motivo}`);
  console.log(`NO EJECUTADA: un resultado incierto no produce un segundo envío. ${motivo}`);
  process.exitCode = 2;
}

function identificar(nombre) {
  if (!/^[a-z_][a-z0-9_]*$/.test(nombre)) throw new Error("Identificador rechazado");
  return nombre;
}

function conBase(url, base) {
  const parsed = new URL(String(url).replace(/^postgres(ql)?:/i, "http:"));
  parsed.pathname = `/${identificar(base)}`;
  const protocolo = /^postgresql:/i.test(url) ? "postgresql:" : "postgres:";
  return parsed.toString().replace(/^http:/i, protocolo);
}

function indiceDeLaMigracion() {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/add_mensajes_whatsapp_message_id_unique.sql"),
    "utf8"
  );
  const encontrado = sql.match(/CREATE UNIQUE INDEX[\s\S]*?;/i);
  if (!encontrado) throw new Error("La migración no declara el índice único");
  return encontrado[0];
}

function consultar(child, mensaje) {
  const respuesta = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("El proceso no respondió"));
    }, 20000);
    child.once("message", (informe) => {
      clearTimeout(timer);
      if (informe.error) reject(new Error(informe.error));
      else resolve(informe);
    });
  });
  child.send(mensaje);
  return respuesta;
}

function proceso() {
  const child = fork(path.join(__dirname, "herramientas/claimWamidProcesoWorker.js"), [], {
    env: pgLocal.entornoSeguro(),
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  return child;
}

async function preparar() {
  pgLocal.cortarProduccion();
  let pg;
  try {
    pg = pgLocal.cargarPg();
  } catch (error) {
    return { ejecutable: false, motivo: "El paquete pg no está instalado. No se consultó ninguna base." };
  }
  const urlAdmin = pgLocal.URL_LOCAL;
  let admin;
  try {
    pgLocal.describir(urlAdmin);
    admin = await pgLocal.conectar(pg, urlAdmin);
  } catch (error) {
    if (error.code === "NO_LOCAL") return { ejecutable: false, motivo: error.message };
    return { ejecutable: false, motivo: `${error.message || error.code || "conexión rechazada"}. No se consultó producción.` };
  }
  const nombre = `macbot_claim_it_${process.pid}_${Date.now()}`;
  try {
    await admin.query(`create database ${identificar(nombre)}`);
    const url = conBase(urlAdmin, nombre);
    const client = await pgLocal.conectar(pg, url);
    await client.query(`
      create table public.mensajes (
        id bigserial primary key,
        whatsapp_message_id text,
        cliente_numero text,
        usuario_id text,
        direccion text,
        contenido text
      )
    `);
    await client.query(indiceDeLaMigracion());
    const indice = await client.query(
      "select indexdef from pg_indexes where schemaname = 'public' and indexname = 'mensajes_whatsapp_message_id_unique'"
    );
    if (!indice.rows[0] || !/unique/i.test(indice.rows[0].indexdef)) {
      throw new Error("El índice único no quedó creado en la base desechable");
    }
    return {
      ejecutable: true,
      url,
      nombre,
      admin,
      client,
      async filas(wamid) {
        const res = await client.query(
          "select count(*)::int as total from public.mensajes where whatsapp_message_id = $1",
          [wamid]
        );
        return res.rows[0].total;
      },
      async cerrar() {
        try { await client.end(); } catch (error) { /* ya cerrada */ }
        await admin.query(
          "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
          [nombre]
        );
        await admin.query(`drop database if exists ${identificar(nombre)}`);
        await admin.end();
      },
    };
  } catch (error) {
    try {
      await admin.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
        [nombre]
      );
      await admin.query(`drop database if exists ${identificar(nombre)}`);
    } catch (cierre) { /* la base puede no existir */ }
    await admin.end();
    throw error;
  }
}

async function dosProcesos(base, wamid, modoA, modoB) {
  const primero = proceso();
  const segundo = proceso();
  try {
    const informes = await Promise.all([
      consultar(primero, { pgUrl: base.url, wamid, modo: modoA }),
      consultar(segundo, { pgUrl: base.url, wamid, modo: modoB }),
    ]);
    return informes;
  } finally {
    primero.kill();
    segundo.kill();
  }
}

async function main() {
  const base = await preparar();
  if (!base.ejecutable) {
    noEjecutada(base.motivo);
    return;
  }
  try {
    const carrera = await dosProcesos(base, "wamid.carrera", "insertar", "insertar");
    assert.strictEqual(await base.filas("wamid.carrera"), 1);
    assert.notStrictEqual(carrera[0].pid, carrera[1].pid);
    assert.notStrictEqual(carrera[0].pid, process.pid);
    const bots = carrera.filter((informe) => informe.bot === true);
    const duplicados = carrera.filter((informe) => informe.duplicate === true);
    assert.strictEqual(bots.length, 1);
    assert.strictEqual(duplicados.length, 1);
    assert.strictEqual(duplicados[0].status, 200);
    assert.strictEqual(duplicados[0].bot, false);
    ok("dos procesos y el mismo wamid dejan una fila y un solo bot");

    const procesoIncierto = proceso();
    const inciertoPrimero = await consultar(procesoIncierto, {
      pgUrl: base.url,
      wamid: "wamid.incierto",
      modo: "incierto-tras-insert",
    });
    procesoIncierto.kill();
    const procesoDuplicado = proceso();
    const inciertoSegundo = await consultar(procesoDuplicado, {
      pgUrl: base.url,
      wamid: "wamid.incierto",
      modo: "insertar",
    });
    procesoDuplicado.kill();
    const incierto = [inciertoPrimero, inciertoSegundo];
    assert.strictEqual(await base.filas("wamid.incierto"), 1);
    assert.strictEqual(incierto.filter((informe) => informe.bot === true).length, 0);
    assert.strictEqual(incierto.filter((informe) => informe.incierto === true).length, 1);
    assert.strictEqual(incierto.filter((informe) => informe.duplicate === true && informe.status === 200).length, 1);
    ok("un resultado incierto no produce un segundo envío");
    console.log(`${passed} pruebas ok`);
  } finally {
    await base.cerrar();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
