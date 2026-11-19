/**
 * M1 contra PostgreSQL local.
 * Crea las tablas con el esquema que la migración exige y aplica solo ese archivo
 * encima de una base de prueba. No usa SUPABASE_URL.
 * Sin base local no se ejecuta y no se marca como aprobada.
 *
 * Ejecutar: node tests/limpiezaMediaUltimoEntrantePg.integracion.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { preparar } = require("./herramientas/limpiezaMediaPgLocal");
const { sqlAplicable } = require("./herramientas/limpiezaMediaFirmas");

const SQL = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/limpieza_media_ultimo_entrante_en.sql"),
  "utf8"
);

const USUARIO = "11111111-1111-4111-8111-111111111111";
const CONEXION = "22222222-2222-4222-8222-222222222222";
const OTRO = "33333333-3333-4333-8333-333333333333";
const CONEXION_B = "44444444-4444-4444-8444-444444444444";

let passed = 0;
function ok(nombre) {
  passed += 1;
  console.log("ok", nombre);
}

function noEjecutada(motivo) {
  console.log(`NO EJECUTADA: un entrante adelanta el reloj y un saliente no. ${motivo}`);
  console.log(`NO EJECUTADA: el mensaje guardado antes de la conversación fija el reloj. ${motivo}`);
  console.log(`NO EJECUTADA: una conversación sin entrantes deja el reloj nulo. ${motivo}`);
  console.log(`NO EJECUTADA: actualizar creado_en o la dirección recalcula el reloj. ${motivo}`);
  console.log(`NO EJECUTADA: cambiar la identidad del hilo mueve el reloj. ${motivo}`);
  console.log(`NO EJECUTADA: una fecha nula deja de contar. ${motivo}`);
  console.log(`NO EJECUTADA: dos entrantes concurrentes conservan el más reciente. ${motivo}`);
  console.log(`NO EJECUTADA: el backfill reanuda sin cursor de uuid y admite una conversación nueva. ${motivo}`);
  console.log(`NO EJECUTADA: repetir el backfill no cambia los relojes. ${motivo}`);
  console.log(`NO EJECUTADA: la reversión quita el reloj y conserva las filas. ${motivo}`);
  process.exitCode = 2;
}

function convId(n) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function msgId(n) {
  return `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function comoJson(valor) {
  return typeof valor === "string" ? JSON.parse(valor) : valor;
}

async function aplicarM1(client) {
  await client.query(sqlAplicable(SQL));
}

async function reloj(client, id) {
  const res = await client.query(
    `select to_char(ultimo_entrante_en, 'YYYY-MM-DD HH24:MI:SS') as reloj
     from public.conversaciones where id = $1`,
    [id]
  );
  return res.rows[0] ? res.rows[0].reloj : undefined;
}

async function visitado(client, id) {
  const res = await client.query(
    "select ultimo_entrante_visitado as visitado from public.conversaciones where id = $1",
    [id]
  );
  return res.rows[0] ? res.rows[0].visitado : undefined;
}

async function conversacion(client, id, numero, usuario = USUARIO, conexion = CONEXION) {
  await client.query(
    `insert into public.conversaciones
       (id, usuario_id, conexion_whatsapp_id, cliente_numero, ultimo_mensaje_en)
     values ($1, $2, $3, $4, null)`,
    [id, usuario, conexion, numero]
  );
}

async function mensaje(client, id, numero, direccion, creado, usuario = USUARIO, conexion = CONEXION) {
  await client.query(
    `insert into public.mensajes
       (id, usuario_id, conexion_whatsapp_id, cliente_numero, direccion, creado_en)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, usuario, conexion, numero, direccion, creado]
  );
}

async function backfill(client, lote) {
  const res = await client.query(
    "select public.limpieza_media_backfill_ultimo_entrante($1) as fila",
    [lote]
  );
  return comoJson(res.rows[0].fila);
}

async function sinReloj(client, trabajo) {
  await client.query("alter table public.mensajes disable trigger user");
  await client.query("alter table public.conversaciones disable trigger user");
  try {
    await trabajo();
  } finally {
    await client.query("alter table public.mensajes enable trigger user");
    await client.query("alter table public.conversaciones enable trigger user");
  }
}

async function esperarBloqueo(observador, pid) {
  const inicio = Date.now();
  for (;;) {
    const res = await observador.query(
      "select wait_event_type, state from pg_stat_activity where pid = $1",
      [pid]
    );
    const fila = res.rows[0];
    if (fila && fila.wait_event_type === "Lock") return;
    if (Date.now() - inicio > 3000) {
      throw new Error(`la otra sesión no quedó esperando un lock: ${JSON.stringify(fila || null)}`);
    }
    await esperar(40);
  }
}

function sentenciasReversion(sql) {
  const parte = sql.split(/--\s*Rollback manual/i)[1];
  return parte
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
      ultimo_mensaje text,
      ultimo_mensaje_en timestamp without time zone,
      estado text
    );
    create table public.mensajes (
      id uuid primary key,
      usuario_id uuid,
      conexion_whatsapp_id uuid,
      cliente_numero text,
      direccion text,
      creado_en timestamp without time zone,
      contenido text,
      imagen_url text
    );
    create index idx_seguimientos_mensajes_reply
      on public.mensajes (usuario_id, cliente_numero, conexion_whatsapp_id, creado_en desc)
      where direccion = 'entrante';
  `);
  await aplicarM1(client);
  await aplicarM1(client);
}

async function escenarioReloj(client) {
  const id = convId(1);
  await conversacion(client, id, "59170000001");
  assert.strictEqual(await visitado(client, id), true);
  await mensaje(client, msgId(1), "59170000001", "entrante", "2024-06-01 12:00:00");
  assert.strictEqual(await reloj(client, id), "2024-06-01 12:00:00");
  ok("un entrante escribe ultimo_entrante_en");

  await mensaje(client, msgId(2), "59170000001", "saliente", "2024-12-01 12:00:00");
  assert.strictEqual(await reloj(client, id), "2024-06-01 12:00:00");
  ok("un saliente no modifica el reloj");

  await mensaje(client, msgId(3), "59170000001", "entrante", null);
  assert.strictEqual(await reloj(client, id), "2024-06-01 12:00:00");
  ok("un entrante con creado_en nulo no escribe");

  await mensaje(client, msgId(4), "59170000001", "entrante", "2024-01-01 00:00:00");
  assert.strictEqual(await reloj(client, id), "2024-06-01 12:00:00");
  ok("un entrante más viejo no retrocede el reloj");

  await mensaje(client, msgId(5), "59170000001", "entrante", "2024-12-15 08:30:00");
  assert.strictEqual(await reloj(client, id), "2024-12-15 08:30:00");
  ok("un entrante más nuevo adelanta el reloj");

  await mensaje(client, msgId(6), "59170000099", "entrante", "2025-01-01 00:00:00");
  const huerfanos = await client.query(
    "select count(*)::int as n from public.conversaciones where cliente_numero = '59170000099'"
  );
  assert.strictEqual(huerfanos.rows[0].n, 0);
  assert.strictEqual(await reloj(client, id), "2024-12-15 08:30:00");
  ok("sin conversación el entrante se guarda y no crea fila");

  const ajena = convId(2);
  await conversacion(client, ajena, "59170000002", OTRO, CONEXION);
  await mensaje(client, msgId(7), "59170000001", "entrante", "2025-02-01 00:00:00");
  assert.strictEqual(await reloj(client, id), "2025-02-01 00:00:00");
  assert.strictEqual(await reloj(client, ajena), null);
  ok("el reloj de otro hilo no se mueve");

  await mensaje(client, msgId(8), "59170000004", "saliente", "2026-01-01 00:00:00");
  await mensaje(client, msgId(9), "59170000004", "entrante", "2024-05-01 08:00:00");
  await mensaje(client, msgId(10), "59170000004", "entrante", "2024-06-01 08:00:00");
  await conversacion(client, convId(4), "59170000004");
  assert.strictEqual(await reloj(client, convId(4)), "2024-06-01 08:00:00");
  assert.strictEqual(await visitado(client, convId(4)), true);
  ok("el entrante guardado antes de la conversación fija el reloj");

  await conversacion(client, convId(3), "59170000003");
  await mensaje(client, msgId(11), "59170000005", "saliente", "2026-02-02 00:00:00");
  await conversacion(client, convId(5), "59170000005");
  assert.strictEqual(await reloj(client, convId(3)), null);
  assert.strictEqual(await reloj(client, convId(5)), null);
  assert.strictEqual(await visitado(client, convId(3)), true);
  assert.strictEqual(await visitado(client, convId(5)), true);
  ok("una conversación sin entrantes deja el reloj nulo");
}

async function escenarioMutaciones(client) {
  const fechas = convId(20);
  await conversacion(client, fechas, "59172000020");
  await mensaje(client, msgId(20), "59172000020", "entrante", "2024-03-01 00:00:00");
  await mensaje(client, msgId(21), "59172000020", "entrante", "2024-09-01 00:00:00");
  assert.strictEqual(await reloj(client, fechas), "2024-09-01 00:00:00");
  await client.query(
    "update public.mensajes set creado_en = $2 where id = $1",
    [msgId(21), "2024-01-01 00:00:00"]
  );
  assert.strictEqual(await reloj(client, fechas), "2024-03-01 00:00:00");
  await client.query(
    "update public.mensajes set creado_en = $2 where id = $1",
    [msgId(20), "2024-11-01 00:00:00"]
  );
  assert.strictEqual(await reloj(client, fechas), "2024-11-01 00:00:00");
  ok("actualizar creado_en deja el entrante real más reciente");

  const direccion = convId(21);
  await conversacion(client, direccion, "59172000021");
  await mensaje(client, msgId(22), "59172000021", "entrante", "2024-03-01 00:00:00");
  await mensaje(client, msgId(23), "59172000021", "entrante", "2024-09-01 00:00:00");
  await client.query(
    "update public.mensajes set direccion = 'saliente' where id = $1",
    [msgId(23)]
  );
  assert.strictEqual(await reloj(client, direccion), "2024-03-01 00:00:00");
  await client.query(
    "update public.mensajes set direccion = 'saliente' where id = $1",
    [msgId(22)]
  );
  assert.strictEqual(await reloj(client, direccion), null);
  await client.query(
    "update public.mensajes set direccion = 'entrante', creado_en = $2 where id = $1",
    [msgId(23), "2024-12-01 00:00:00"]
  );
  assert.strictEqual(await reloj(client, direccion), "2024-12-01 00:00:00");
  ok("cambiar la dirección recalcula el reloj en los dos sentidos");

  const origen = convId(31);
  const destino = convId(30);
  await conversacion(client, origen, "59172000031");
  await conversacion(client, destino, "59172000030", OTRO, CONEXION_B);
  await mensaje(client, msgId(30), "59172000031", "entrante", "2024-02-01 00:00:00");
  await mensaje(client, msgId(31), "59172000031", "entrante", "2024-08-01 00:00:00");
  await client.query(
    `update public.mensajes
        set usuario_id = $2, conexion_whatsapp_id = $3, cliente_numero = $4
      where id = $1`,
    [msgId(31), OTRO, CONEXION_B, "59172000030"]
  );
  assert.strictEqual(await reloj(client, origen), "2024-02-01 00:00:00");
  assert.strictEqual(await reloj(client, destino), "2024-08-01 00:00:00");
  ok("cambiar la identidad del mensaje mueve el reloj al hilo nuevo");

  await mensaje(client, msgId(32), "59172000098", "entrante", "2023-03-03 03:03:03");
  await client.query(
    "update public.conversaciones set cliente_numero = $2 where id = $1",
    [origen, "59172000098"]
  );
  assert.strictEqual(await reloj(client, origen), "2023-03-03 03:03:03");
  await client.query(
    "update public.conversaciones set cliente_numero = null where id = $1",
    [origen]
  );
  assert.strictEqual(await reloj(client, origen), null);
  ok("cambiar la identidad de la conversación recalcula su reloj");

  const nulo = convId(22);
  await conversacion(client, nulo, "59172000022");
  await mensaje(client, msgId(24), "59172000022", "entrante", "2024-04-04 00:00:00");
  assert.strictEqual(await reloj(client, nulo), "2024-04-04 00:00:00");
  await client.query("update public.mensajes set creado_en = null where id = $1", [msgId(24)]);
  assert.strictEqual(await reloj(client, nulo), null);
  await mensaje(client, msgId(25), "59172000022", "entrante", null);
  assert.strictEqual(await reloj(client, nulo), null);
  await mensaje(client, msgId(26), "59172000022", "entrante", "2024-05-05 00:00:00");
  assert.strictEqual(await reloj(client, nulo), "2024-05-05 00:00:00");
  ok("una fecha nula deja de contar y el reloj puede volver a quedar nulo");
}

async function escenarioConcurrencia(preparado) {
  const recientePrimero = convId(6);
  await conversacion(preparado.client, recientePrimero, "59170000006");
  const a = await preparado.otroCliente();
  const b = await preparado.otroCliente();
  try {
    await a.query("begin");
    await mensaje(a, msgId(60), "59170000006", "entrante", "2024-08-01 00:00:00");
    const pendiente = mensaje(b, msgId(61), "59170000006", "entrante", "2024-01-15 00:00:00");
    await esperarBloqueo(a, b.processID);
    await a.query("commit");
    await pendiente;
    assert.strictEqual(await reloj(preparado.client, recientePrimero), "2024-08-01 00:00:00");
    ok("dos entrantes concurrentes conservan la fecha más reciente");
  } finally {
    try { await a.query("rollback"); } catch (error) { /* ya estaba cerrada o confirmada */ }
    try { await b.query("rollback"); } catch (error) { /* no quedó una transacción abierta */ }
    await a.end();
    await b.end();
  }

  const viejoPrimero = convId(7);
  await conversacion(preparado.client, viejoPrimero, "59170000007");
  const c = await preparado.otroCliente();
  const d = await preparado.otroCliente();
  try {
    await c.query("begin");
    await mensaje(c, msgId(62), "59170000007", "entrante", "2024-01-15 00:00:00");
    const pendiente = mensaje(d, msgId(63), "59170000007", "entrante", "2024-08-01 00:00:00");
    await esperarBloqueo(c, d.processID);
    await c.query("commit");
    await pendiente;
    assert.strictEqual(await reloj(preparado.client, viejoPrimero), "2024-08-01 00:00:00");
    ok("dos entrantes concurrentes conservan la fecha más reciente aunque el viejo llegue primero");
  } finally {
    try { await c.query("rollback"); } catch (error) { /* ya estaba cerrada o confirmada */ }
    try { await d.query("rollback"); } catch (error) { /* no quedó una transacción abierta */ }
    await c.end();
    await d.end();
  }
}

async function escenarioBackfill(preparado) {
  const client = preparado.client;
  await sinReloj(client, async () => {
    for (let n = 1; n <= 21; n += 1) {
      const numero = `59173${String(n).padStart(6, "0")}`;
      await conversacion(client, convId(100 + n), numero);
      await mensaje(client, msgId(1100 + n), numero, "saliente", "2025-08-01 00:00:00");
      await mensaje(client, msgId(1200 + n), numero, "entrante", null);
      await mensaje(
        client,
        msgId(1000 + n),
        numero,
        "entrante",
        `2024-07-${String(n).padStart(2, "0")} 08:00:00`
      );
    }
  });
  assert.strictEqual(await reloj(client, convId(101)), null);
  assert.strictEqual(await visitado(client, convId(101)), false);

  const cero = await backfill(client, 0);
  assert.strictEqual(cero.ok, false);
  assert.strictEqual(cero.motivo, "lote_invalido");
  assert.strictEqual(cero.procesados, 0);
  assert.strictEqual(cero.pendientes, null);
  assert.strictEqual(cero.agotado, false);
  const grande = await backfill(client, 21);
  assert.strictEqual(grande.ok, false);
  assert.strictEqual(grande.motivo, "lote_invalido");
  assert.strictEqual(grande.agotado, false);
  assert.strictEqual(await reloj(client, convId(101)), null);
  assert.strictEqual(await visitado(client, convId(121)), false);
  ok("un lote fuera de 1..20 no marca conversaciones");

  const porDefecto = await backfill(client, null);
  assert.strictEqual(porDefecto.ok, true);
  assert.strictEqual(porDefecto.motivo, "lote");
  assert.strictEqual(porDefecto.procesados, 20);
  assert.strictEqual(porDefecto.actualizados, 20);
  assert.strictEqual(porDefecto.pendientes, 1);
  assert.strictEqual(porDefecto.agotado, false);
  assert.strictEqual(await reloj(client, convId(101)), "2024-07-01 08:00:00");
  assert.strictEqual(await reloj(client, convId(120)), "2024-07-20 08:00:00");
  assert.strictEqual(await reloj(client, convId(121)), null);
  ok("el lote predeterminado de 20 no usa el orden del uuid como cursor");

  await mensaje(client, msgId(990), "59173000099", "entrante", "2021-05-05 05:05:05");
  await conversacion(client, convId(99), "59173000099");
  assert.strictEqual(await reloj(client, convId(99)), "2021-05-05 05:05:05");
  assert.strictEqual(await visitado(client, convId(99)), true);
  const cierre = await backfill(client, 1);
  assert.strictEqual(cierre.ok, true);
  assert.strictEqual(cierre.procesados, 1);
  assert.strictEqual(cierre.actualizados, 1);
  assert.strictEqual(cierre.pendientes, 0);
  assert.strictEqual(cierre.agotado, true);
  assert.strictEqual(await reloj(client, convId(121)), "2024-07-21 08:00:00");
  assert.strictEqual(await reloj(client, convId(99)), "2021-05-05 05:05:05");
  ok("una conversación creada durante el backfill ya trae su reloj");

  const repetida = await backfill(client, null);
  assert.strictEqual(repetida.procesados, 0);
  assert.strictEqual(repetida.actualizados, 0);
  assert.strictEqual(repetida.pendientes, 0);
  assert.strictEqual(repetida.agotado, true);
  const sinArgumento = comoJson((await client.query(
    "select public.limpieza_media_backfill_ultimo_entrante() as fila"
  )).rows[0].fila);
  assert.strictEqual(sinArgumento.procesados, 0);
  assert.strictEqual(sinArgumento.agotado, true);
  assert.strictEqual(await reloj(client, convId(99)), "2021-05-05 05:05:05");
  assert.strictEqual(await reloj(client, convId(101)), "2024-07-01 08:00:00");
  ok("repetir el backfill no cambia los relojes");

  await sinReloj(client, async () => {
    await conversacion(client, convId(150), "59173000150");
    await mensaje(client, msgId(1500), "59173000150", "entrante", "2020-01-01 00:00:00");
  });
  assert.strictEqual(await visitado(client, convId(150)), false);
  await mensaje(client, msgId(1501), "59173000150", "entrante", "2024-10-10 10:10:10");
  assert.strictEqual(await reloj(client, convId(150)), "2024-10-10 10:10:10");
  const posterior = await backfill(client, 20);
  assert.strictEqual(posterior.procesados, 1);
  assert.strictEqual(posterior.actualizados, 0);
  assert.strictEqual(posterior.agotado, true);
  assert.strictEqual(await reloj(client, convId(150)), "2024-10-10 10:10:10");
  ok("el backfill no pisa un entrante más nuevo llegado antes de visitar la fila");

  await sinReloj(client, async () => {
    await conversacion(client, convId(200), "59173000200");
    await conversacion(client, convId(201), "59173000201");
    await mensaje(client, msgId(2000), "59173000200", "entrante", "2022-02-02 02:02:02");
    await mensaje(client, msgId(2002), "59173000200", "saliente", "2026-01-01 00:00:00");
    await mensaje(client, msgId(2001), "59173000201", "entrante", "2022-03-03 03:03:03");
  });

  const a = await preparado.otroCliente();
  const b = await preparado.otroCliente();
  let pendiente = null;
  try {
    await a.query("begin");
    await a.query("select 1 from public.conversaciones where id = $1 for update", [convId(200)]);
    pendiente = backfill(b, 20);
    const resultado = await Promise.race([
      pendiente.then((fila) => ({ listo: true, fila })),
      esperar(2000).then(() => ({ listo: false })),
    ]);
    assert.strictEqual(resultado.listo, true);
    assert.strictEqual(resultado.fila.ok, true);
    assert.strictEqual(resultado.fila.procesados, 1);
    assert.strictEqual(resultado.fila.agotado, false);
    assert.strictEqual(await reloj(client, convId(201)), "2022-03-03 03:03:03");
    assert.strictEqual(await reloj(client, convId(200)), null);
    await mensaje(client, msgId(980), "59173000098", "entrante", "2023-04-04 04:04:04");
    await conversacion(client, convId(98), "59173000098");
    assert.strictEqual(await reloj(client, convId(98)), "2023-04-04 04:04:04");
    await a.query("commit");
    const resto = await backfill(client, 20);
    assert.strictEqual(resto.procesados, 1);
    assert.strictEqual(resto.agotado, true);
    assert.strictEqual(await reloj(client, convId(200)), "2022-02-02 02:02:02");
    assert.strictEqual(await reloj(client, convId(98)), "2023-04-04 04:04:04");
    const otra = await backfill(client, 20);
    assert.strictEqual(otra.procesados, 0);
    assert.strictEqual(otra.actualizados, 0);
    assert.strictEqual(otra.agotado, true);
    ok("el backfill salta la fila bloqueada y convive con una conversación nueva");
  } finally {
    try { await a.query("rollback"); } catch (error) { /* confirmada o sin transacción */ }
    try { if (pendiente) await pendiente; } catch (error) { /* el lote ya terminó o venció el lock */ }
    try { await b.query("rollback"); } catch (error) { /* la función ya terminó */ }
    await a.end();
    await b.end();
  }
}

async function escenarioIndice(client) {
  await client.query("set enable_seqscan = off");
  await client.query("set enable_bitmapscan = off");
  try {
    const plan = await client.query(
      `explain select m.creado_en
       from public.mensajes m
       where m.direccion = 'entrante'
         and m.usuario_id = $1
         and m.cliente_numero = $2
         and m.conexion_whatsapp_id = $3
         and m.creado_en is not null
       order by m.creado_en desc
       limit 1`,
      [USUARIO, "59173000001", CONEXION]
    );
    const texto = plan.rows.map((fila) => fila["QUERY PLAN"]).join("\n");
    assert.ok(texto.includes("idx_seguimientos_mensajes_reply"), texto);
    ok("la lectura del entrante puede usar el índice parcial");
  } finally {
    await client.query("set enable_seqscan = on");
    await client.query("set enable_bitmapscan = on");
  }
}

async function escenarioPermisos(client) {
  const res = await client.query(
    `select p.proname,
            has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role,
            has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
            has_function_privilege('public', p.oid, 'EXECUTE') as publico
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'limpieza_media_refrescar_ultimo_entrante',
         'limpieza_media_registrar_ultimo_entrante',
         'limpieza_media_conversacion_ultimo_entrante',
         'limpieza_media_backfill_ultimo_entrante'
       )
     order by p.proname`
  );
  assert.strictEqual(res.rows.length, 4);
  for (const fila of res.rows) {
    assert.strictEqual(fila.service_role, true, fila.proname);
    assert.strictEqual(fila.anon, false, fila.proname);
    assert.strictEqual(fila.authenticated, false, fila.proname);
    assert.strictEqual(fila.publico, false, fila.proname);
  }

  const firma = await client.query(
    `select pg_get_function_identity_arguments(p.oid) as identidad,
            pg_get_function_arguments(p.oid) as completos
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'limpieza_media_backfill_ultimo_entrante'`
  );
  assert.strictEqual(firma.rows.length, 1);
  assert.strictEqual(firma.rows[0].identidad, "p_lote integer");
  assert.match(firma.rows[0].completos, /default 20/i);

  const insertar = await client.query(
    `select pg_get_triggerdef(t.oid) as def
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and t.tgname = 'limpieza_media_ultimo_entrante_ai'
       and not t.tgisinternal`
  );
  assert.strictEqual(insertar.rows.length, 1);
  assert.match(insertar.rows[0].def, /AFTER INSERT/i);
  assert.match(insertar.rows[0].def, /NEW\.direccion = 'entrante'/i);
  assert.ok(!/UPDATE/i.test(insertar.rows[0].def));

  const actualizar = await client.query(
    `select pg_get_triggerdef(t.oid) as def
     from pg_trigger t
     where t.tgname = 'limpieza_media_ultimo_entrante_au'
       and not t.tgisinternal`
  );
  assert.strictEqual(actualizar.rows.length, 1);
  assert.match(
    actualizar.rows[0].def,
    /AFTER UPDATE OF creado_en, direccion, usuario_id, conexion_whatsapp_id, cliente_numero/i
  );

  const alta = await client.query(
    `select pg_get_triggerdef(t.oid) as def
     from pg_trigger t
     where t.tgname = 'limpieza_media_conversacion_ultimo_entrante_ai'
       and not t.tgisinternal`
  );
  assert.strictEqual(alta.rows.length, 1);
  assert.match(
    alta.rows[0].def,
    /AFTER INSERT OR UPDATE OF usuario_id, conexion_whatsapp_id, cliente_numero/i
  );

  const columnas = await client.query(
    `select column_name, data_type, column_default, is_nullable
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'conversaciones'
       and column_name in ('ultimo_entrante_en', 'ultimo_entrante_visitado')
     order by column_name`
  );
  assert.deepStrictEqual(
    columnas.rows.map((fila) => [fila.column_name, fila.data_type, fila.is_nullable]),
    [
      ["ultimo_entrante_en", "timestamp without time zone", "YES"],
      ["ultimo_entrante_visitado", "boolean", "NO"],
    ]
  );
  const defectoMensaje = await client.query(
    `select column_default
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'mensajes'
       and column_name = 'creado_en'`
  );
  assert.strictEqual(defectoMensaje.rows[0].column_default, null);
  ok("permisos, triggers, tipo de columna y ausencia de DEFAULT en creado_en");
}

async function escenarioReversion(client) {
  const antes = await client.query(
    "select (select count(*)::int from public.mensajes) as mensajes, (select count(*)::int from public.conversaciones) as conversaciones"
  );
  await client.query(sentenciasReversion(SQL));
  const columnas = await client.query(
    `select count(*)::int as n
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'conversaciones'
       and column_name in ('ultimo_entrante_en', 'ultimo_entrante_visitado')`
  );
  const funcion = await client.query(
    `select count(*)::int as n
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'limpieza_media_refrescar_ultimo_entrante',
         'limpieza_media_registrar_ultimo_entrante',
         'limpieza_media_conversacion_ultimo_entrante',
         'limpieza_media_backfill_ultimo_entrante'
       )`
  );
  const trigger = await client.query(
    `select count(*)::int as n
     from pg_trigger
     where tgname in (
       'limpieza_media_ultimo_entrante_ai',
       'limpieza_media_ultimo_entrante_au',
       'limpieza_media_conversacion_ultimo_entrante_ai'
     )`
  );
  const indices = await client.query(
    `select count(*)::int as n
     from pg_indexes
     where schemaname = 'public'
       and indexname in (
         'conversaciones_ultimo_entrante_en_idx',
         'conversaciones_ultimo_entrante_pendiente_idx'
       )`
  );
  const despues = await client.query(
    "select (select count(*)::int from public.mensajes) as mensajes, (select count(*)::int from public.conversaciones) as conversaciones"
  );
  assert.strictEqual(columnas.rows[0].n, 0);
  assert.strictEqual(funcion.rows[0].n, 0);
  assert.strictEqual(trigger.rows[0].n, 0);
  assert.strictEqual(indices.rows[0].n, 0);
  assert.strictEqual(despues.rows[0].mensajes, antes.rows[0].mensajes);
  assert.strictEqual(despues.rows[0].conversaciones, antes.rows[0].conversaciones);
  ok("la reversión quita el reloj y conserva mensajes y conversaciones");

  await aplicarM1(client);
  await mensaje(client, msgId(900), "59170000001", "entrante", "2026-01-02 09:00:00");
  assert.strictEqual(await reloj(client, convId(1)), "2026-01-02 09:00:00");
  await mensaje(client, msgId(902), "59179990001", "entrante", "2026-01-01 00:00:00");
  await mensaje(client, msgId(901), "59179990001", "entrante", "2026-04-04 04:04:04");
  await conversacion(client, convId(901), "59179990001");
  assert.strictEqual(await reloj(client, convId(901)), "2026-04-04 04:04:04");
  ok("volver a aplicar restaura el trigger y el alta de la conversación");
}

async function main() {
  const preparado = await preparar();
  if (!preparado.ejecutable) {
    noEjecutada(preparado.motivo);
    return;
  }
  try {
    await prepararEsquema(preparado.client);
    await escenarioReloj(preparado.client);
    await escenarioMutaciones(preparado.client);
    await escenarioConcurrencia(preparado);
    await escenarioBackfill(preparado);
    await escenarioIndice(preparado.client);
    await escenarioPermisos(preparado.client);
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
