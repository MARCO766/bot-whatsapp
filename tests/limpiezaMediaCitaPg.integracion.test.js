/**
 * M2 contra PostgreSQL local.
 * Crea el esquema mínimo y aplica M1 y M2 encima de una base de prueba.
 * No usa SUPABASE_URL. Sin base local no se ejecuta y no se marca como aprobada.
 *
 * Ejecutar: node tests/limpiezaMediaCitaPg.integracion.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { preparar } = require("./herramientas/limpiezaMediaPgLocal");
const { sqlAplicable } = require("./herramientas/limpiezaMediaFirmas");

const SQL = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/limpieza_media_cita.sql"),
  "utf8"
);
const SQL_M1 = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/limpieza_media_ultimo_entrante_en.sql"),
  "utf8"
);

const USUARIO = "11111111-1111-4111-8111-111111111111";
const OTRO = "33333333-3333-4333-8333-333333333333";
const CONEXION = "22222222-2222-4222-8222-222222222222";
const NOTA = "https://proj.supabase.co/storage/v1/object/public/archivos/whatsapp/u/nota.ogg";
const MARCADORES = [
  ["object/public", NOTA],
  ["object/sign", "https://proj.supabase.co/storage/v1/object/sign/archivos/whatsapp/u/nota.ogg?token=abc"],
  ["object/authenticated", "https://proj.supabase.co/storage/v1/object/authenticated/archivos/whatsapp/u/nota.ogg"],
  ["render/image/public", "https://proj.supabase.co/storage/v1/render/image/public/archivos/whatsapp/u/nota.ogg"],
];
const META = "https://proj.supabase.co/storage/v1/object/public/archivos/whatsapp-meta/u/a.jpg";
const SEGUIMIENTO = "https://proj.supabase.co/storage/v1/object/public/seguimiento-v2-media/u/a.jpg";

let passed = 0;
function ok(nombre) {
  passed += 1;
  console.log("ok", nombre);
}

function noEjecutada(motivo) {
  const nombres = [
    "un insert deja la cita y la visita sin un segundo UPDATE",
    "service_role inserta sin UPDATE sobre mensajes y anon no escribe",
    "vaciar una columna borra solo sus citas",
    "cambiar la identidad reemplaza las citas",
    "la misma ruta se comparte sin duplicarse dentro del texto",
    "una ruta ilegible, un bucket ajeno o una ruta suelta no dejan cita",
    "los cuatro marcadores dejan la clave archivos/whatsapp/u/nota.ogg",
    "el backfill reanuda, respeta el bloqueo y no pisa M1",
    "repetir el backfill no crea otra cita",
    "la reversión quita M2 y conserva los mensajes",
  ];
  for (const nombre of nombres) console.log(`NO EJECUTADA: ${nombre}. ${motivo}`);
  process.exitCode = 2;
}

function msgId(n) {
  return `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function convId(n) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function comoJson(valor) {
  return typeof valor === "string" ? JSON.parse(valor) : valor;
}

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

async function aplicarM2(client) {
  await client.query(sqlAplicable(SQL));
}

async function citas(client, id) {
  const res = await client.query(
    `select clave, origen, usuario_id, cliente_numero
       from public.media_cita
      where origen_id = $1
      order by origen, clave`,
    [id]
  );
  return res.rows;
}

async function visitado(client, id) {
  const res = await client.query(
    "select media_cita_visitado as visitado from public.mensajes where id = $1",
    [id]
  );
  return res.rows[0] ? res.rows[0].visitado : undefined;
}

async function mensaje(client, id, numero, extra = {}) {
  await client.query(
    `insert into public.mensajes
       (id, usuario_id, conexion_whatsapp_id, cliente_numero, direccion, creado_en, contenido, imagen_url)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      extra.usuario === undefined ? USUARIO : extra.usuario,
      extra.conexion === undefined ? CONEXION : extra.conexion,
      numero,
      extra.direccion || "entrante",
      extra.creado || "2024-06-01 12:00:00",
      extra.contenido === undefined ? null : extra.contenido,
      extra.imagen === undefined ? null : extra.imagen,
    ]
  );
}

async function sinTrigger(client, trabajo) {
  await client.query("alter table public.mensajes disable trigger user");
  try {
    await trabajo();
  } finally {
    await client.query("alter table public.mensajes enable trigger user");
  }
}

async function backfill(client, lote) {
  const res = await client.query(
    "select public.limpieza_media_backfill_media_cita($1) as fila",
    [lote]
  );
  return comoJson(res.rows[0].fila);
}

function sentenciasReversion(texto) {
  return texto
    .split(/--\s*Rollback manual/i)[1]
    .split(/\r?\n/)
    .map((linea) => linea.replace(/^\s*--\s?/, "").trim())
    .filter((linea) => /^(drop|alter)\b/i.test(linea))
    .join("\n");
}

async function prepararEsquema(client) {
  await client.query(`
    create table public.conversaciones (
      id uuid primary key,
      usuario_id uuid,
      conexion_whatsapp_id uuid,
      cliente_numero text,
      ultimo_mensaje_en timestamp without time zone
    );
    create table public.mensajes (
      id uuid primary key,
      usuario_id uuid,
      conexion_whatsapp_id uuid,
      cliente_numero text,
      direccion text,
      creado_en timestamp without time zone,
      contenido text,
      imagen_url text,
      estado_envio text
    );
    create index idx_seguimientos_mensajes_reply
      on public.mensajes (usuario_id, cliente_numero, conexion_whatsapp_id, creado_en desc)
      where direccion = 'entrante';
  `);
  await client.query(sqlAplicable(SQL_M1));
  await aplicarM2(client);
  await aplicarM2(client);
}

async function escenarioInsert(client) {
  await client.query(
    `insert into public.conversaciones
       (id, usuario_id, conexion_whatsapp_id, cliente_numero)
     values ($1, $2, $3, $4)`,
    [convId(1), USUARIO, CONEXION, "59170000001"]
  );
  await mensaje(client, msgId(1), "59170000001", { imagen: NOTA, contenido: "hola" });
  assert.strictEqual(await visitado(client, msgId(1)), true);
  assert.deepStrictEqual(await citas(client, msgId(1)), [{
    clave: "archivos/whatsapp/u/nota.ogg",
    origen: "mensajes.imagen_url",
    usuario_id: USUARIO,
    cliente_numero: "59170000001",
  }]);
  const reloj = await client.query(
    "select ultimo_entrante_en is not null as tiene from public.conversaciones where id = $1",
    [convId(1)]
  );
  assert.strictEqual(reloj.rows[0].tiene, true);
  const antes = (await citas(client, msgId(1))).length;
  await client.query(
    "update public.mensajes set estado_envio = 'entregado' where id = $1",
    [msgId(1)]
  );
  assert.strictEqual((await citas(client, msgId(1))).length, antes);
  assert.strictEqual(await visitado(client, msgId(1)), true);
  ok("un insert deja la cita y la visita sin un segundo UPDATE");
}

async function escenarioPermisos(client) {
  await client.query("grant select, insert on table public.mensajes to service_role");
  await client.query(`
    drop policy if exists media_cita_service_role_prueba on public.media_cita;
    create policy media_cita_service_role_prueba
      on public.media_cita
      for all
      to service_role
      using (true)
      with check (true);
  `);
  const updateMensajes = await client.query(
    "select has_table_privilege('service_role', 'public.mensajes', 'UPDATE') as ok"
  );
  assert.strictEqual(updateMensajes.rows[0].ok, false);
  await client.query("alter table public.mensajes disable trigger limpieza_media_ultimo_entrante_ai");
  await client.query("alter table public.mensajes disable trigger limpieza_media_ultimo_entrante_au");
  try {
    await client.query("set role service_role");
    await mensaje(client, msgId(2), "59170000002", { imagen: META });
    assert.strictEqual(await visitado(client, msgId(2)), true);
    assert.strictEqual((await citas(client, msgId(2))).length, 1);
    ok("service_role inserta sin UPDATE sobre mensajes");
  } finally {
    await client.query("reset role");
    await client.query("alter table public.mensajes enable trigger limpieza_media_ultimo_entrante_ai");
    await client.query("alter table public.mensajes enable trigger limpieza_media_ultimo_entrante_au");
  }

  let rechazo = null;
  try {
    await client.query("set role anon");
    await client.query(
      `insert into public.media_cita
         (clave, usuario_id, conexion_whatsapp_id, cliente_numero, origen, origen_id)
       values ('archivos/whatsapp/u/nota.ogg', $1, $2, '1', 'mensajes.imagen_url', $3)`,
      [USUARIO, CONEXION, msgId(2)]
    );
  } catch (error) {
    rechazo = error;
  } finally {
    await client.query("reset role");
  }
  assert.ok(rechazo);
  assert.strictEqual(rechazo.code, "42501");
  await client.query("drop policy if exists media_cita_service_role_prueba on public.media_cita");
  ok("anon no puede escribir media_cita");
}

async function escenarioVacio(client) {
  await mensaje(client, msgId(3), "59170000003", {
    imagen: NOTA,
    contenido: META,
  });
  assert.strictEqual((await citas(client, msgId(3))).length, 2);
  await client.query("update public.mensajes set imagen_url = null where id = $1", [msgId(3)]);
  const quedan = await citas(client, msgId(3));
  assert.deepStrictEqual(quedan.map((fila) => fila.origen), ["mensajes.contenido"]);
  await client.query("update public.mensajes set contenido = '' where id = $1", [msgId(3)]);
  assert.deepStrictEqual(await citas(client, msgId(3)), []);
  assert.strictEqual(await visitado(client, msgId(3)), true);
  const mensajeSigue = await client.query("select count(*)::int as n from public.mensajes where id = $1", [msgId(3)]);
  assert.strictEqual(mensajeSigue.rows[0].n, 1);
  ok("vaciar una columna borra solo sus citas");
}

async function escenarioIdentidad(client) {
  await mensaje(client, msgId(4), "59170000004", { imagen: NOTA });
  await client.query("update public.mensajes set usuario_id = $2 where id = $1", [msgId(4), OTRO]);
  const filas = await citas(client, msgId(4));
  assert.strictEqual(filas.length, 1);
  assert.strictEqual(filas[0].usuario_id, OTRO);
  await client.query("update public.mensajes set cliente_numero = '   ' where id = $1", [msgId(4)]);
  assert.deepStrictEqual(await citas(client, msgId(4)), []);
  assert.strictEqual(await visitado(client, msgId(4)), true);
  const sigue = await client.query("select id from public.mensajes where id = $1", [msgId(4)]);
  assert.strictEqual(sigue.rows.length, 1);
  ok("cambiar la identidad reemplaza las citas");
}

async function escenarioCompartidas(client) {
  await mensaje(client, msgId(5), "59170000005", {
    imagen: `${NOTA} ${NOTA}`,
    contenido: NOTA,
  });
  const propias = await citas(client, msgId(5));
  assert.deepStrictEqual(propias.map((fila) => fila.origen), [
    "mensajes.contenido",
    "mensajes.imagen_url",
  ]);
  await mensaje(client, msgId(6), "59170000006", { imagen: NOTA });
  const total = await client.query(
    "select count(*)::int as n from public.media_cita where clave = 'archivos/whatsapp/u/nota.ogg'"
  );
  assert.ok(total.rows[0].n >= 3);
  ok("la misma ruta se comparte sin duplicarse dentro del texto");
}

async function escenarioMarcadores(client) {
  for (let i = 0; i < MARCADORES.length; i += 1) {
    const [nombre, url] = MARCADORES[i];
    const id = msgId(10 + i);
    await mensaje(client, id, `5917000001${i}`, { imagen: url });
    const filas = await citas(client, id);
    assert.deepStrictEqual(filas.map((fila) => fila.clave), ["archivos/whatsapp/u/nota.ogg"], nombre);
    assert.deepStrictEqual(filas.map((fila) => fila.origen), ["mensajes.imagen_url"], nombre);
  }
  ok("los cuatro marcadores dejan la clave archivos/whatsapp/u/nota.ogg");
}

async function escenarioRechazos(client) {
  await mensaje(client, msgId(7), "59170000007", {
    imagen: `${NOTA} https://proj.supabase.co/storage/v1/object/public/archivos/whatsapp/../../secreto.jpg`,
    contenido: "whatsapp/u/nota.ogg",
  });
  assert.deepStrictEqual(await citas(client, msgId(7)), []);
  await mensaje(client, msgId(8), "59170000008", { imagen: SEGUIMIENTO });
  assert.deepStrictEqual(await citas(client, msgId(8)), []);
  await mensaje(client, msgId(9), "59170000009", {
    imagen: "https://proj.supabase.co/storage/v1/object/public/archivos/whatsapp/u/%C3%28.jpg",
  });
  assert.deepStrictEqual(await citas(client, msgId(9)), []);
  const vivos = await client.query(
    "select count(*)::int as n from public.mensajes where id = any($1::uuid[])",
    [[msgId(7), msgId(8), msgId(9)]]
  );
  assert.strictEqual(vivos.rows[0].n, 3);
  ok("una ruta ilegible, un bucket ajeno o una ruta suelta no dejan cita");
}

async function escenarioBackfill(preparado) {
  const client = preparado.client;
  await sinTrigger(client, async () => {
    await mensaje(client, msgId(20), "59170000020", { imagen: NOTA, creado: "2020-01-01 00:00:00" });
    await mensaje(client, msgId(21), "59170000021", { imagen: META, creado: "2020-01-02 00:00:00" });
    await mensaje(client, msgId(22), "59170000022", { contenido: "sin archivo" });
  });
  assert.strictEqual(await visitado(client, msgId(20)), false);
  assert.deepStrictEqual(await citas(client, msgId(20)), []);

  const invalido = await backfill(client, 0);
  assert.strictEqual(invalido.ok, false);
  assert.strictEqual(invalido.motivo, "lote_invalido");
  assert.strictEqual(invalido.agotado, false);
  assert.strictEqual(await visitado(client, msgId(20)), false);

  const primero = await backfill(client, 1);
  assert.strictEqual(primero.ok, true);
  assert.strictEqual(primero.procesados, 1);
  assert.strictEqual(primero.actualizados, 1);
  assert.strictEqual(primero.agotado, false);
  assert.strictEqual((await citas(client, msgId(20))).length, 1);

  await mensaje(client, msgId(23), "59170000023", { imagen: NOTA });
  assert.strictEqual(await visitado(client, msgId(23)), true);
  assert.strictEqual((await citas(client, msgId(23))).length, 1);

  const a = await preparado.otroCliente();
  const b = await preparado.otroCliente();
  let pendiente = null;
  try {
    await a.query("begin");
    await a.query("select 1 from public.mensajes where id = $1 for update", [msgId(21)]);
    pendiente = backfill(b, 20);
    const resultado = await Promise.race([
      pendiente.then((fila) => ({ listo: true, fila })),
      esperar(2000).then(() => ({ listo: false })),
    ]);
    assert.strictEqual(resultado.listo, true);
    assert.strictEqual(resultado.fila.ok, true);
    assert.strictEqual(resultado.fila.procesados, 1);
    assert.strictEqual(resultado.fila.agotado, false);
    assert.deepStrictEqual(await citas(client, msgId(21)), []);
    assert.strictEqual((await citas(client, msgId(22))).length, 0);
    assert.strictEqual(await visitado(client, msgId(22)), true);
    const reloj = await client.query(
      "select ultimo_entrante_visitado as visitado, ultimo_entrante_en as reloj from public.conversaciones where cliente_numero = '59170000020'"
    );
    assert.strictEqual(reloj.rows.length, 0);
    await a.query("commit");
  } finally {
    try { await a.query("rollback"); } catch (error) { /* confirmada o sin transacción */ }
    try { if (pendiente) await pendiente; } catch (error) { /* el lote ya terminó */ }
    try { await b.query("rollback"); } catch (error) { /* la función ya terminó */ }
    await a.end();
    await b.end();
  }

  const resto = await backfill(client, null);
  assert.strictEqual(resto.ok, true);
  assert.strictEqual(resto.procesados, 1);
  assert.strictEqual(resto.agotado, true);
  assert.strictEqual((await citas(client, msgId(21))).length, 1);
  const ajenas = await client.query(
    `select count(*)::int as n
       from public.conversaciones
      where cliente_numero = any($1::text[])`,
    [["59170000020", "59170000021", "59170000022"]]
  );
  assert.strictEqual(ajenas.rows[0].n, 0);
  const relojPrevio = await client.query(
    "select ultimo_entrante_en is not null as tiene from public.conversaciones where id = $1",
    [convId(1)]
  );
  assert.strictEqual(relojPrevio.rows[0].tiene, true);
  ok("el backfill reanuda, respeta el bloqueo y no pisa M1");

  const antes = await client.query("select count(*)::int as n from public.media_cita");
  const repetida = await backfill(client, 20);
  const sinArgumento = comoJson((await client.query(
    "select public.limpieza_media_backfill_media_cita() as fila"
  )).rows[0].fila);
  const despues = await client.query("select count(*)::int as n from public.media_cita");
  assert.strictEqual(repetida.procesados, 0);
  assert.strictEqual(repetida.actualizados, 0);
  assert.strictEqual(repetida.pendientes, 0);
  assert.strictEqual(repetida.agotado, true);
  assert.strictEqual(sinArgumento.procesados, 0);
  assert.strictEqual(sinArgumento.agotado, true);
  assert.strictEqual(despues.rows[0].n, antes.rows[0].n);
  ok("repetir el backfill no crea otra cita");
}

async function escenarioReversion(client) {
  const antes = await client.query("select count(*)::int as n from public.mensajes");
  await client.query(sentenciasReversion(SQL));
  const tabla = await client.query("select to_regclass('public.media_cita') as nombre");
  const columna = await client.query(
    `select count(*)::int as n
       from pg_attribute
      where attrelid = 'public.mensajes'::regclass
        and attname = 'media_cita_visitado'
        and not attisdropped`
  );
  const trigger = await client.query(
    `select count(*)::int as n
       from pg_trigger
      where tgname = 'limpieza_media_media_cita_biu'
        and not tgisinternal`
  );
  const despues = await client.query("select count(*)::int as n from public.mensajes");
  assert.strictEqual(tabla.rows[0].nombre, null);
  assert.strictEqual(columna.rows[0].n, 0);
  assert.strictEqual(trigger.rows[0].n, 0);
  assert.strictEqual(despues.rows[0].n, antes.rows[0].n);
  ok("la reversión quita M2 y conserva los mensajes");

  await aplicarM2(client);
  await mensaje(client, msgId(30), "59170000030", { imagen: NOTA });
  assert.strictEqual((await citas(client, msgId(30))).length, 1);
  ok("volver a aplicar restaura el trigger");
}

async function main() {
  const preparado = await preparar();
  if (!preparado.ejecutable) {
    noEjecutada(preparado.motivo);
    return;
  }
  try {
    await prepararEsquema(preparado.client);
    await escenarioInsert(preparado.client);
    await escenarioPermisos(preparado.client);
    await escenarioVacio(preparado.client);
    await escenarioIdentidad(preparado.client);
    await escenarioCompartidas(preparado.client);
    await escenarioRechazos(preparado.client);
    await escenarioMarcadores(preparado.client);
    await escenarioBackfill(preparado);
    await escenarioReversion(preparado.client);
    console.log(`${passed} pruebas ok`);
  } finally {
    await preparado.cerrar();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
