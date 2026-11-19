/**
 * Contrato estático de M2. No abre red ni aplica SQL.
 *
 * Ejecutar: node tests/limpiezaMediaCita.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const firmas = require("./herramientas/limpiezaMediaFirmas");

const ARCHIVO = path.join(__dirname, "../supabase/migrations/limpieza_media_cita.sql");
const sql = fs.readFileSync(ARCHIVO, "utf8");
const aplicable = firmas.sqlAplicable(sql);
const funciones = firmas.leerFunciones();
const tablas = firmas.leerTablas();
const servicio = fs.readFileSync(
  path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaService.js"),
  "utf8"
);
const webhook = fs.readFileSync(path.join(__dirname, "../routes/webhook.js"), "utf8");

let passed = 0;
function ok(nombre) {
  passed += 1;
  console.log("ok", nombre);
}

function cuerpo(nombre) {
  const marca = `function public.${nombre}`;
  const inicio = aplicable.indexOf(marca);
  assert.ok(inicio >= 0, nombre);
  const resto = aplicable.slice(inicio);
  const abre = resto.indexOf("$fn$");
  const cierra = resto.indexOf("$fn$;", abre + 4);
  assert.ok(abre > 0 && cierra > abre, nombre);
  return resto.slice(abre, cierra);
}

assert.ok(sql.includes("NO APLICAR"));
assert.ok(aplicable.includes("before insert or update of imagen_url, contenido"));
assert.ok(aplicable.includes("usuario_id, conexion_whatsapp_id, cliente_numero"));
assert.ok(aplicable.includes("NEW.media_cita_visitado := true"));
assert.ok(aplicable.includes("for update skip locked"));
assert.ok(aplicable.includes("'agotado', v_pendientes = 0"));
assert.ok(aplicable.includes("'motivo', 'lote_invalido'"));
assert.ok(aplicable.includes("primary key (clave, origen, origen_id)"));
assert.ok(aplicable.includes("mensajes.imagen_url"));
assert.ok(aplicable.includes("mensajes.contenido"));
assert.ok(aplicable.includes("enable row level security"));
assert.ok(aplicable.includes("grant select, insert, delete on table public.media_cita to service_role"));
assert.ok(!aplicable.includes("grant update"));
assert.ok(!aplicable.includes("delete from public.mensajes"));
assert.ok(!aplicable.includes("storage.objects"));
assert.ok(!/^\s*select\s+public\.limpieza_media_backfill_media_cita\s*\(/im.test(aplicable));
assert.ok(sql.includes("Rollback manual"));
assert.ok(sql.includes("drop table if exists public.media_cita"));
assert.ok(sql.includes("drop column if exists media_cita_visitado"));

const trigger = cuerpo("limpieza_media_media_cita_mensaje");
assert.ok(!/update\s+public\.mensajes/i.test(trigger));
assert.ok(trigger.includes("limpieza_media_aplicar_citas_mensaje"));
assert.ok(trigger.includes("limpieza_media_reemplazar_citas"));
ok("el trigger marca NEW y no hace un segundo UPDATE");

const backfill = funciones.get("limpieza_media_backfill_media_cita");
assert.deepStrictEqual(
  backfill.parametros.map((p) => p.nombre),
  ["p_lote"]
);
assert.ok(!firmas.leerLlamadas().llamadas.has("limpieza_media_backfill_media_cita"));
assert.ok(!firmas.leerLlamadas().llamadas.has("limpieza_media_analizar_storage"));
ok("Node no llama las funciones de M2");

const cita = tablas.get("media_cita");
assert.strictEqual(cita.rls, true);
assert.deepStrictEqual(cita.service.slice().sort(), ["delete", "insert", "select"]);
ok("media_cita solo otorga select, insert y delete a service_role");

assert.ok(servicio.includes("const ELIMINACION_REAL_BLOQUEADA = true;"));
assert.ok(!servicio.includes("ELIMINACION_REAL_BLOQUEADA = false"));
assert.ok(!webhook.includes("limpieza_media_backfill_media_cita"));
assert.ok(!webhook.includes("media_cita"));
ok("el borrado real sigue bloqueado y el webhook no referencia M2");

console.log(`${passed} pruebas ok`);
