/**
 * Contrato estático de M1. No abre red ni aplica SQL.
 *
 * Ejecutar: node tests/limpiezaMediaUltimoEntrante.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const firmas = require("./herramientas/limpiezaMediaFirmas");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");

const ARCHIVO = path.join(
  __dirname,
  "../supabase/migrations/limpieza_media_ultimo_entrante_en.sql"
);

let passed = 0;
function ok(nombre) {
  passed += 1;
  console.log("ok", nombre);
}

const sql = fs.readFileSync(ARCHIVO, "utf8");
const aplicable = firmas.sqlAplicable(sql);
const funciones = firmas.leerFunciones();
const webhook = fs.readFileSync(path.join(__dirname, "../routes/webhook.js"), "utf8");

assert.ok(sql.includes("NO APLICAR"));
assert.ok(sql.includes("El repositorio no declara DEFAULT para mensajes.creado_en"));
assert.ok(aplicable.includes("ultimo_entrante_en timestamp without time zone"));
assert.ok(aplicable.includes("ultimo_entrante_visitado boolean not null default false"));
assert.ok(aplicable.includes(
  "conversaciones_ultimo_entrante_en_idx on public.conversaciones (usuario_id, conexion_whatsapp_id, cliente_numero, ultimo_entrante_en desc nulls last)"
));
assert.ok(aplicable.includes(
  "conversaciones_ultimo_entrante_pendiente_idx on public.conversaciones (id) where ultimo_entrante_visitado is not true"
));
assert.ok(/after insert on public\.mensajes/i.test(aplicable));
assert.ok(/after update of creado_en, direccion, usuario_id, conexion_whatsapp_id, cliente_numero/i.test(aplicable));
assert.ok(/after insert or update of usuario_id, conexion_whatsapp_id, cliente_numero/i.test(aplicable));
assert.ok(aplicable.includes("NEW.direccion = 'entrante'"));
assert.ok(!/\bgreatest\s*\(/i.test(aplicable));
assert.ok(!aplicable.includes("p_despues_id"));
assert.ok(aplicable.includes("for update skip locked"));
assert.ok(aplicable.includes("ultimo_entrante_visitado is not true"));
assert.ok(aplicable.includes("p_lote is null"));
assert.ok(aplicable.includes("v_lote := 20"));
assert.ok(aplicable.includes("p_lote > 20"));
assert.ok(aplicable.includes("'lote_invalido'"));
assert.ok(aplicable.includes("idx_seguimientos_mensajes_reply"));
assert.ok(aplicable.includes("m.usuario_id = p_usuario_id"));
assert.ok(aplicable.includes("m.cliente_numero = p_cliente_numero"));
assert.ok(aplicable.includes("m.conexion_whatsapp_id = p_conexion_id"));
assert.ok(aplicable.includes("m.usuario_id = v_fila.usuario_id"));
assert.ok(aplicable.includes("m.cliente_numero = v_fila.cliente_numero"));
assert.ok(aplicable.includes("m.conexion_whatsapp_id = v_fila.conexion_whatsapp_id"));
assert.ok(aplicable.includes("m.direccion = 'entrante'"));
assert.ok(aplicable.includes("m.creado_en is not null"));
assert.ok(aplicable.includes("order by m.creado_en desc"));
assert.ok(aplicable.includes("order by c.id"));
assert.ok(aplicable.includes("security invoker"));
assert.ok(aplicable.includes("set search_path = public"));
assert.ok(!/security\s+definer/i.test(aplicable));
assert.ok(!/\bdelete\s+from\b/i.test(aplicable));
assert.ok(!/\bdrop\s+column\b/i.test(aplicable));
assert.ok(!/alter\s+table\s+public\.mensajes/i.test(aplicable));
assert.ok(!/set\s+direccion\s*=/i.test(aplicable));
assert.ok(!aplicable.includes("media_cita"));
assert.ok(aplicable.includes("drop function if exists public.limpieza_media_backfill_ultimo_entrante(uuid, integer)"));
assert.ok(webhook.includes("direccion: \"entrante\""));
assert.ok(!webhook.includes("ultimo_entrante_en"));
assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
ok("la migración recalcula el entrante real y no toca el webhook");

assert.deepStrictEqual(
  funciones.get("limpieza_media_refrescar_ultimo_entrante").parametros.map((p) => `${p.nombre} ${p.tipo}`),
  ["p_usuario_id uuid", "p_conexion_id uuid", "p_cliente_numero text"]
);
assert.deepStrictEqual(
  funciones.get("limpieza_media_registrar_ultimo_entrante").parametros,
  []
);
assert.deepStrictEqual(
  funciones.get("limpieza_media_conversacion_ultimo_entrante").parametros,
  []
);
assert.deepStrictEqual(
  funciones.get("limpieza_media_backfill_ultimo_entrante").parametros.map((p) => `${p.nombre} ${p.tipo}`),
  ["p_lote integer default 20"]
);
for (const firma of [
  "limpieza_media_refrescar_ultimo_entrante(uuid, uuid, text)",
  "limpieza_media_registrar_ultimo_entrante()",
  "limpieza_media_conversacion_ultimo_entrante()",
  "limpieza_media_backfill_ultimo_entrante(integer)",
]) {
  assert.match(
    aplicable,
    new RegExp(`revoke all on function public\\.${firma.replace(/[()]/g, "\\$&")} from public, anon, authenticated`, "i")
  );
  assert.match(
    aplicable,
    new RegExp(`grant execute on function public\\.${firma.replace(/[()]/g, "\\$&")} to service_role`, "i")
  );
}
ok("firmas, revoke y grant quedan solo para service_role");

const reversion = sql.split(/--\s*Rollback manual/i)[1];
assert.ok(reversion);
for (const sentencia of [
  "drop trigger if exists limpieza_media_ultimo_entrante_ai on public.mensajes;",
  "drop trigger if exists limpieza_media_ultimo_entrante_au on public.mensajes;",
  "drop trigger if exists limpieza_media_conversacion_ultimo_entrante_ai on public.conversaciones;",
  "drop function if exists public.limpieza_media_registrar_ultimo_entrante();",
  "drop function if exists public.limpieza_media_conversacion_ultimo_entrante();",
  "drop function if exists public.limpieza_media_refrescar_ultimo_entrante(uuid, uuid, text);",
  "drop function if exists public.limpieza_media_backfill_ultimo_entrante(integer);",
  "drop function if exists public.limpieza_media_backfill_ultimo_entrante(uuid, integer);",
  "drop index if exists public.conversaciones_ultimo_entrante_pendiente_idx;",
  "drop index if exists public.conversaciones_ultimo_entrante_en_idx;",
  "alter table public.conversaciones drop column if exists ultimo_entrante_visitado;",
  "alter table public.conversaciones drop column if exists ultimo_entrante_en;",
]) {
  assert.ok(reversion.includes(sentencia), sentencia);
}
assert.ok(!firmas.sqlAplicable(sql).includes("drop column if exists ultimo_entrante_en"));
ok("la reversión está comentada y no entra en la aplicación");

console.log(`${passed} pruebas ok`);
