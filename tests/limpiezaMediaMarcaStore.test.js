/**
 * Cliente PostgREST contra un doble HTTP.
 * Este doble NO es PostgreSQL y no demuestra que la marca sobreviva a un proceso.
 * Ejecutar: node tests/limpiezaMediaMarcaStore.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const store = require("../services/limpiezaMedia/limpiezaMediaMarcaStore");
const entrante = require("../services/limpiezaMedia/limpiezaMediaEntrante");
const admin = require("../services/limpiezaMedia/limpiezaMediaMarcaAdmin");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("ok", name);
}

function sqlFalso() {
  const filas = new Map();
  const auditoria = [];
  let seq = 1;
  const clave = (body) => `${body.p_usuario_id}|${body.p_conexion_id}|${body.p_cliente_numero}`;
  const ahora = () => new Date().toISOString();
  return {
    filas,
    auditoria,
    llamadas: [],
    async post(url, body) {
      const nombre = String(url).split("/rpc/")[1];
      this.llamadas.push(nombre);
      assert.ok(!String(url).includes("/mensajes"));
      assert.ok(!String(url).includes("/storage/"));
      const k = clave(body);
      const fila = filas.get(k);
      const reloj = ahora();
      if (nombre === "limpieza_media_marca_reservar") {
        if (fila && fila.resultado === "incierto") {
          return {
            data: {
              ok: false,
              motivo: "resultado_incierto",
              reintentar: false,
              estado: fila.estado,
              resultado: "incierto",
              ahora: reloj,
            },
          };
        }
        if (fila && ["reservado", "entrante", "borrando"].includes(fila.estado)) {
          return { data: { ok: false, motivo: "valla_ocupada", estado: fila.estado, owner: fila.owner, ahora: reloj } };
        }
        const id = fila?.id || seq++;
        filas.set(k, {
          id,
          usuario_id: body.p_usuario_id,
          conexion_whatsapp_id: body.p_conexion_id,
          cliente_numero: body.p_cliente_numero,
          estado: "reservado",
          owner: body.p_owner,
          clave_archivo: null,
          resultado: null,
          iniciada_en: null,
          verificacion: null,
        });
        return { data: { ok: true, motivo: "reservado", estado: "reservado", owner: body.p_owner, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_entrante") {
        if (fila && (fila.estado === "reservado" || fila.estado === "borrando" || (fila.estado === "entrante" && fila.owner !== body.p_owner))) {
          return { data: { ok: false, motivo: "valla_ocupada", estado: fila.estado, ahora: reloj } };
        }
        const id = fila?.id || seq++;
        filas.set(k, {
          ...(fila || {}),
          id,
          usuario_id: body.p_usuario_id,
          conexion_whatsapp_id: body.p_conexion_id,
          cliente_numero: body.p_cliente_numero,
          estado: "entrante",
          owner: body.p_owner,
        });
        return { data: { ok: true, estado: "entrante", owner: body.p_owner, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_soltar_entrante") {
        if (fila && (fila.estado === "reservado" || fila.estado === "borrando")) {
          return { data: { ok: false, motivo: "marca_de_limpieza", liberada: false, storage: false, ahora: reloj } };
        }
        if (!fila || fila.estado !== "entrante" || fila.owner !== body.p_owner) {
          return { data: { ok: false, motivo: "valla_ajena", liberada: false, storage: false, ahora: reloj } };
        }
        fila.estado = null;
        fila.owner = null;
        return { data: { ok: true, motivo: "soltada", estado: null, liberada: true, storage: false, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_soltar_reservado") {
        if (fila && (fila.estado === "entrante" || fila.estado === "borrando" || fila.resultado != null)) {
          return { data: { ok: false, motivo: "marca_de_limpieza", liberada: false, storage: false, ahora: reloj } };
        }
        if (!fila || fila.estado !== "reservado" || fila.owner !== body.p_owner) {
          return { data: { ok: false, motivo: "valla_ajena", liberada: false, storage: false, ahora: reloj } };
        }
        fila.estado = null;
        fila.owner = null;
        return { data: { ok: true, motivo: "soltada", estado: null, liberada: true, storage: false, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_borrando") {
        if (!fila || fila.owner !== body.p_owner) {
          return { data: { ok: false, motivo: "owner_incorrecto", reintentar: false, ahora: reloj } };
        }
        if (fila.estado !== "reservado" || fila.resultado === "incierto") {
          return { data: { ok: false, motivo: "resultado_incierto", reintentar: false, ahora: reloj } };
        }
        fila.estado = "borrando";
        fila.clave_archivo = body.p_clave_archivo;
        fila.iniciada_en = reloj;
        fila.resultado = null;
        return { data: { ok: true, estado: "borrando", reintentar: false, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_resultado") {
        if (!fila || fila.estado !== "borrando" || fila.owner !== body.p_owner || fila.resultado) {
          return { data: { ok: false, motivo: "resultado_incierto", reintentar: false, ahora: reloj } };
        }
        fila.resultado = body.p_resultado;
        return { data: { ok: true, resultado: body.p_resultado, reintentar: false, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_consultar") {
        return {
          data: {
            ok: true,
            marca: fila ? { ...fila } : null,
            ahora: reloj,
          },
        };
      }
      if (nombre === "limpieza_media_marca_listar") {
        const marcas = [...filas.values()].filter((item) => item.estado === (body.p_estado || item.estado) && item.estado);
        return { data: { ok: true, marcas, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_verificar") {
        const resultado = body.p_resultado_verificado == null ? "" : String(body.p_resultado_verificado).trim();
        if (body.p_resultado_verificado == null || !["eliminado_confirmado", "no_eliminado_confirmado", "incierto"].includes(resultado)) {
          return { data: { ok: false, motivo: "verificacion_invalida", storage: false, liberada: false, ahora: reloj } };
        }
        if (!fila || fila.estado == null) return { data: { ok: false, motivo: "marca_ausente", storage: false, liberada: false, ahora: reloj } };
        if (fila.estado === "reservado" || fila.estado === "entrante") {
          return { data: { ok: false, motivo: "marca_no_resoluble", storage: false, liberada: false, ahora: reloj } };
        }
        if (fila.estado !== "borrando" || fila.resultado == null) {
          return { data: { ok: false, motivo: fila.estado === "borrando" ? "storage_en_curso" : "marca_no_resoluble", storage: false, liberada: false, ahora: reloj } };
        }
        fila.verificacion = { resultadoVerificado: resultado, actor: body.p_actor };
        auditoria.push({ accion: "verificar", actor: body.p_actor, storage: false });
        return { data: { ok: true, storage: false, liberada: false, reintentar: false, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_recuperar") {
        if (typeof body.p_objeto_existe !== "boolean" || !body.p_actor) {
          return { data: { ok: false, motivo: "verificacion_invalida", storage: false, liberada: false, reintentar: false, ahora: reloj } };
        }
        if (!fila || fila.estado !== "borrando" || (fila.resultado != null && fila.resultado !== "incierto")) {
          return { data: { ok: false, motivo: "marca_no_resoluble", storage: false, liberada: false, reintentar: false, ahora: reloj } };
        }
        if (!fila.clave_archivo) {
          return { data: { ok: false, motivo: "marca_sin_clave", storage: false, liberada: false, reintentar: false, ahora: reloj } };
        }
        fila.resultado = "incierto";
        fila.verificacion = {
          resultadoVerificado: "incierto",
          objetoExiste: body.p_objeto_existe,
          procedimiento: "recuperacion",
          actor: body.p_actor,
        };
        auditoria.push({ accion: "verificar", actor: body.p_actor, storage: false });
        return {
          data: {
            ok: true,
            motivo: "recuperada",
            estado: "borrando",
            resultado: "incierto",
            objeto_existe: body.p_objeto_existe,
            storage: false,
            liberada: false,
            reintentar: false,
            ahora: reloj,
          },
        };
      }
      if (nombre === "limpieza_media_marca_liberar") {
        if (!fila || fila.estado == null) {
          return { data: { ok: false, motivo: "marca_ausente", storage: false, liberada: false, ahora: reloj } };
        }
        if (fila.estado === "reservado" || fila.estado === "entrante") {
          return { data: { ok: false, motivo: "marca_no_resoluble", storage: false, liberada: false, reintentar: false, ahora: reloj } };
        }
        if (fila.estado !== "borrando") {
          return { data: { ok: false, motivo: "marca_ausente", storage: false, liberada: false, ahora: reloj } };
        }
        if (fila.resultado == null) {
          return { data: { ok: false, motivo: "storage_en_curso", storage: false, liberada: false, reintentar: false, ahora: reloj } };
        }
        if (!fila.verificacion) {
          return { data: { ok: false, motivo: "verificacion_requerida", storage: false, liberada: false, reintentar: false, ahora: reloj } };
        }
        fila.estado = null;
        fila.owner = null;
        auditoria.push({ accion: "liberar", actor: body.p_actor, storage: false });
        return { data: { ok: true, storage: false, liberada: true, reintentar: false, ahora: reloj } };
      }
      throw new Error(`rpc no simulada ${nombre}`);
    },
  };
}

function opciones(sql) {
  return { permitirRed: true, url: "http://marca-falsa.test", key: "test", cliente: sql };
}

async function testProtocolo() {
  const sql = sqlFalso();
  const opt = opciones(sql);
  const a = await store.reservar({ ...opt, usuarioId: "u", conexionId: "c", numero: "591", owner: "cl:1" });
  const b = await store.reservar({ ...opt, usuarioId: "u", conexionId: "c", numero: "591", owner: "cl:2" });
  assert.strictEqual(a.ok, true);
  assert.strictEqual(b.ok, false);
  assert.strictEqual(b.motivo, "valla_ocupada");
  const otra = await store.reservar({ ...opt, usuarioId: "u", conexionId: "c", numero: "592", owner: "cl:2" });
  assert.strictEqual(otra.ok, true);

  let inserts = 0;
  const duranteReserva = await entrante.coordinarPersistenciaEntrante({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid: "wamid.1",
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(duranteReserva.status, 503);
  assert.strictEqual(inserts, 0);

  await store.pasarABorrando({ ...opt, usuarioId: "u", conexionId: "c", numero: "591", owner: "cl:1", claveArchivo: "archivos/whatsapp/u/foto.jpg" });
  const duranteBorrado = await entrante.coordinarPersistenciaEntrante({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid: "wamid.2",
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(duranteBorrado.status, 503);
  assert.strictEqual(inserts, 0);
  const ajeno = await store.pasarABorrando({ ...opt, usuarioId: "u", conexionId: "c", numero: "592", owner: "cl:1", claveArchivo: "x" });
  assert.strictEqual(ajeno.motivo, "owner_incorrecto");

  await store.registrarResultado({ ...opt, usuarioId: "u", conexionId: "c", numero: "591", owner: "cl:1", resultado: "incierto" });
  const segundo = await store.registrarResultado({ ...opt, usuarioId: "u", conexionId: "c", numero: "591", owner: "cl:1", resultado: "eliminado_confirmado" });
  assert.strictEqual(segundo.reintentar, false);
  assert.strictEqual(sql.filas.get("u|c|591").resultado, "incierto");

  const sinVer = await admin.liberarMarcaDurable({ ...opt, usuarioId: "u", conexionId: "c", numero: "591", actor: "admin" });
  assert.strictEqual(sinVer.motivo, "verificacion_requerida");
  const ver = await admin.verificarMarcaDurable({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    resultadoVerificado: "incierto",
    actor: "admin",
    nota: "timeout",
  });
  assert.strictEqual(ver.storage, false);
  const suelta = await admin.liberarMarcaDurable({ ...opt, usuarioId: "u", conexionId: "c", numero: "591", actor: "admin" });
  assert.strictEqual(suelta.liberada, true);
  assert.strictEqual(suelta.storage, false);
  assert.deepStrictEqual(sql.auditoria.map((item) => item.accion), ["verificar", "liberar"]);

  const reintento = await entrante.coordinarPersistenciaEntrante({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid: "wamid.1",
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(reintento.guardado, true);
  const duplicado = await entrante.coordinarPersistenciaEntrante({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid: "wamid.1",
    persistir: async () => ({ claimed: false, duplicate: true }),
  });
  assert.strictEqual(duplicado.status, 200);
  assert.strictEqual(duplicado.duplicado, true);
  assert.strictEqual(inserts, 1);
  if (reintento.valla) await reintento.valla.liberar();
  const otraReserva = await store.reservar({ ...opt, usuarioId: "u", conexionId: "c", numero: "591", owner: "cl:3" });
  assert.strictEqual(otraReserva.ok, false);
  assert.strictEqual(otraReserva.motivo, "resultado_incierto");
  assert.strictEqual(otraReserva.reintentar, false);
  assert.strictEqual(sql.filas.get("u|c|591").resultado, "incierto");
  assert.notStrictEqual(sql.filas.get("u|c|591").estado, "reservado");

  const caido = {
    async post() {
      const error = new Error("timeout");
      error.code = "ECONNABORTED";
      throw error;
    },
  };
  const timeout = await entrante.coordinarPersistenciaEntrante({
    permitirRed: true,
    url: "http://marca-falsa.test",
    key: "test",
    cliente: caido,
    usuarioId: "u",
    conexionId: "c",
    numero: "593",
    wamid: "wamid.timeout",
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(timeout.degradada, true);
  assert.strictEqual(timeout.guardado, true);
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  ok("el cliente distingue ocupación, reintento, duplicado, incierto y caída sin borrar");
}

function testNoRedNiCron() {
  const src = fs.readFileSync(path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaMarcaStore.js"), "utf8");
  assert.ok(!src.includes("new Map"));
  assert.ok(!src.includes("DATABASE_URL"));
  const cron = fs.readFileSync(path.join(__dirname, "../scripts/limpieza-media-cron.js"), "utf8");
  assert.ok(!cron.includes("limpiezaMediaMarca"));
  assert.ok(!cron.includes("limpieza_media_marca"));
  const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations/limpieza_media_marca.sql"), "utf8");
  assert.ok(!/locked_until\s+timestamptz/i.test(sql));
  assert.ok(!/delete\s+from\s+public\.mensajes/i.test(sql));
  assert.ok(sql.includes("clock_timestamp()"));
  assert.ok(sql.includes("enable row level security"));
  assert.ok(sql.includes("p_resultado_verificado is null"));
  assert.ok(sql.includes("v_requiere_resolucion"));
  assert.ok(sql.includes("marca_no_resoluble"));
  assert.ok(sql.includes("storage_en_curso"));
  assert.ok(sql.includes("marca_de_limpieza"));
  assert.ok(sql.includes("limpieza_media_marca_soltar_reservado"));
  assert.ok(sql.includes("v_row.resultado = 'incierto'"));
  assert.ok(sql.includes("resultado is distinct from 'incierto'"));
  const proteccion = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/limpieza_media_marca_incierto_20261119.sql"),
    "utf8"
  );
  assert.ok(proteccion.includes("create or replace function public.limpieza_media_marca_reservar("));
  assert.ok(proteccion.includes("if v_row.resultado = 'incierto' then"));
  assert.ok(proteccion.includes("and resultado is distinct from 'incierto'"));
  assert.ok(proteccion.includes("create or replace function public.limpieza_media_marca_recuperar("));
  assert.ok(proteccion.includes("p_objeto_existe is null"));
  assert.ok(proteccion.includes("liberada', false"));
  assert.ok(!/delete\s+from/i.test(proteccion));
  assert.ok(!/drop\s+table/i.test(proteccion));
  assert.ok(!/update\s+public\.(mensajes|conversaciones|clientes|contactos)\b/i.test(proteccion));
  assert.ok(/revoke all on function public\.limpieza_media_marca_recuperar\(text, text, text, text, boolean, text\) from public, anon, authenticated/.test(proteccion));
  assert.ok(/grant execute on function public\.limpieza_media_marca_recuperar\(text, text, text, text, boolean, text\) to service_role/.test(proteccion));
  assert.ok(/revoke all on function public\.limpieza_media_marca_reservar\(text, text, text, text\) from public, anon, authenticated/.test(proteccion));
  assert.ok(/grant execute on function public\.limpieza_media_marca_reservar\(text, text, text, text\) to service_role/.test(proteccion));
  assert.ok(/revoke all on function public\.limpieza_media_marca_verificar\(text, text, text, text, text, text\) from public, anon, authenticated/.test(sql));
  assert.ok(/grant execute on function public\.limpieza_media_marca_verificar\(text, text, text, text, text, text\) to service_role/.test(sql));
  assert.ok(/revoke all on function public\.limpieza_media_marca_liberar\(text, text, text, text, text\) from public, anon, authenticated/.test(sql));
  assert.ok(/grant execute on function public\.limpieza_media_marca_liberar\(text, text, text, text, text\) to service_role/.test(sql));
  assert.ok(/revoke all on function public\.limpieza_media_marca_soltar_reservado\(text, text, text, text\) from public, anon, authenticated/.test(sql));
  assert.ok(/grant execute on function public\.limpieza_media_marca_soltar_reservado\(text, text, text, text\) to service_role/.test(sql));
  assert.ok(/revoke all on function public\.limpieza_media_marca_soltar_entrante\(text, text, text, text\) from public, anon, authenticated/.test(sql));
  assert.ok(sql.includes("enable row level security"));
  assert.ok(!sql.includes("grant delete"));
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  const webhook = fs.readFileSync(path.join(__dirname, "../routes/webhook.js"), "utf8");
  const puerta = fs.readFileSync(path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaEntrante.js"), "utf8");
  assert.ok(webhook.includes("permitirRed: true"));
  assert.ok(webhook.includes("esMarcaDeLimpieza"));
  assert.ok(puerta.includes("function esMarcaDeLimpieza"));
  assert.ok(puerta.includes('actual.modo === "entrante"'));
  assert.ok(!webhook.includes("else await liberarHilo(actual)"));
  assert.ok(webhook.includes("statusSiMensajeGuardado"));
  assert.ok(puerta.includes("retenida"));
  const reintento = webhook.indexOf("if (coordinado.reintentar)");
  const duplicado = webhook.indexOf("if (coordinado.duplicado)");
  const noGuardado = webhook.indexOf("if (!coordinado.guardado)");
  assert.ok(webhook.indexOf("vallaEntrante = coordinado.valla") < reintento);
  assert.ok(webhook.indexOf("await soltarVallaEntrante();", reintento) < duplicado);
  assert.ok(webhook.indexOf("await soltarVallaEntrante();", duplicado) < noGuardado);
  assert.ok(webhook.indexOf("await soltarVallaEntrante();", noGuardado) < webhook.indexOf("entranteConfirmado = true"));
  const ack = webhook.indexOf("ACK temprano");
  const soltarAck = webhook.indexOf("await soltarVallaEntrante();", ack);
  assert.ok(soltarAck > ack && soltarAck < webhook.indexOf("procesarMensajeEntrante("));
  assert.ok(webhook.lastIndexOf("await soltarVallaEntrante();") > webhook.indexOf("} catch (error) {"));
  ok("sin red implícita, el cron no cambia y el SQL no vence ni borra mensajes");
}

async function testNoSueltaReservaNiStorageEnCurso() {
  const sql = sqlFalso();
  const opt = opciones(sql);
  await store.reservar({ ...opt, usuarioId: "u", conexionId: "c", numero: "591", owner: "cl:1" });
  const verReserva = await store.verificar({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    resultadoVerificado: "no_eliminado_confirmado",
    actor: "admin",
  });
  assert.strictEqual(verReserva.motivo, "marca_no_resoluble");
  const liberaReserva = await store.liberar({ ...opt, usuarioId: "u", conexionId: "c", numero: "591", actor: "admin" });
  assert.strictEqual(liberaReserva.motivo, "marca_no_resoluble");
  assert.strictEqual(liberaReserva.liberada, false);
  assert.strictEqual(sql.filas.get("u|c|591").estado, "reservado");

  const entranteTomado = await store.tomarEntrante({ ...opt, usuarioId: "u", conexionId: "c", numero: "592", owner: "wh:wamid" });
  assert.strictEqual(entranteTomado.ok, true);
  const verEntrante = await store.verificar({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "592",
    resultadoVerificado: null,
    actor: "admin",
  });
  assert.strictEqual(verEntrante.motivo, "verificacion_invalida");
  const verEntranteInvalido = await store.verificar({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "592",
    resultadoVerificado: "quizas",
    actor: "admin",
  });
  assert.strictEqual(verEntranteInvalido.motivo, "verificacion_invalida");
  const verEntranteEstado = await store.verificar({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "592",
    resultadoVerificado: "incierto",
    actor: "admin",
  });
  assert.strictEqual(verEntranteEstado.motivo, "marca_no_resoluble");
  const sueltaLimpieza = await store.soltarEntrante({ ...opt, usuarioId: "u", conexionId: "c", numero: "591", owner: "wh:wamid" });
  assert.strictEqual(sueltaLimpieza.motivo, "marca_de_limpieza");
  assert.strictEqual(sql.filas.get("u|c|591").estado, "reservado");
  await store.soltarEntrante({ ...opt, usuarioId: "u", conexionId: "c", numero: "592", owner: "wh:wamid" });
  assert.strictEqual(sql.filas.get("u|c|592").estado, null);

  await store.pasarABorrando({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    owner: "cl:1",
    claveArchivo: "archivos/whatsapp/u/foto.jpg",
  });
  const durante = await store.verificar({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    resultadoVerificado: "incierto",
    actor: "admin",
  });
  assert.strictEqual(durante.motivo, "storage_en_curso");
  const liberaDurante = await store.liberar({ ...opt, usuarioId: "u", conexionId: "c", numero: "591", actor: "admin" });
  assert.strictEqual(liberaDurante.motivo, "storage_en_curso");
  assert.strictEqual(liberaDurante.liberada, false);
  assert.strictEqual(sql.filas.get("u|c|591").estado, "borrando");
  assert.strictEqual(sql.filas.get("u|c|591").resultado, null);

  await store.registrarResultado({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    owner: "cl:1",
    resultado: "incierto",
  });
  const sinVer = await store.liberar({ ...opt, usuarioId: "u", conexionId: "c", numero: "591", actor: "admin" });
  assert.strictEqual(sinVer.motivo, "verificacion_requerida");
  assert.strictEqual(sql.filas.get("u|c|591").estado, "borrando");
  assert.strictEqual(sql.filas.get("u|c|591").resultado, "incierto");
  ok("reserva, entrante y storage en curso no se liberan; incierto sigue bloqueado");
}

async function testSoltarOkFalseDuplicadoYLimpieza() {
  const base = sqlFalso();
  let fallos = 2;
  const cliente = {
    async post(url, body) {
      if (String(url).includes("limpieza_media_marca_soltar_entrante") && fallos > 0) {
        fallos -= 1;
        return { data: { ok: false, motivo: "marca_no_disponible", ahora: new Date().toISOString() } };
      }
      return base.post.call(base, url, body);
    },
  };
  const opt = opciones(cliente);
  let claimed = 0;
  const primero = await entrante.coordinarPersistenciaEntrante({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid: "wamid.suelta",
    persistir: async () => {
      claimed += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(primero.guardado, true);
  const suelta = await entrante.soltarMarcaEntrante(primero.valla);
  assert.strictEqual(suelta.ok, false);
  assert.strictEqual(suelta.retenida, true);
  assert.strictEqual(entrante.estadoHttpTrasSoltar(suelta, 200), 503);
  assert.strictEqual(base.filas.get("u|c|591").estado, "entrante");

  const red = {
    async post() {
      const error = new Error("socket hang up");
      error.code = "ECONNRESET";
      throw error;
    },
  };
  const caida = await entrante.soltarMarcaEntrante({
    ok: true,
    owner: "wh:wamid.suelta",
    estado: "entrante",
    modo: "entrante",
    liberar: () => store.soltarEntrante({ ...opciones(red), usuarioId: "u", conexionId: "c", numero: "591", owner: "wh:wamid.suelta" }),
  });
  assert.strictEqual(caida.retenida, true);
  assert.strictEqual(base.filas.get("u|c|591").estado, "entrante");

  fallos = 0;
  const segundo = await entrante.coordinarPersistenciaEntrante({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid: "wamid.suelta",
    persistir: async () => ({ claimed: false, duplicate: true }),
  });
  assert.strictEqual(segundo.duplicado, true);
  assert.strictEqual(claimed, 1);
  assert.ok(!segundo.valla);
  assert.strictEqual(base.filas.get("u|c|591").estado, null);

  await store.reservar({ ...opt, usuarioId: "u", conexionId: "c", numero: "594", owner: "cl:limpieza" });
  let liberacionesAjenas = 0;
  const limpieza = await entrante.soltarMarcaEntrante({
    ok: true,
    owner: "cl:limpieza",
    estado: "reservado",
    modo: "limpieza",
    liberar: async () => {
      liberacionesAjenas += 1;
      return { ok: true };
    },
  });
  assert.strictEqual(limpieza.omitida, true);
  assert.strictEqual(liberacionesAjenas, 0);
  assert.strictEqual(base.filas.get("u|c|594").estado, "reservado");
  const ajena = await entrante.soltarMarcaEntrante({
    ok: true,
    owner: "wh:otro",
    estado: "entrante",
    modo: "entrante",
    liberar: () => store.soltarEntrante({ ...opt, usuarioId: "u", conexionId: "c", numero: "594", owner: "wh:otro" }),
  });
  assert.strictEqual(ajena.ajena, true);
  assert.strictEqual(ajena.retenida, false);
  assert.strictEqual(base.filas.get("u|c|594").estado, "reservado");
  await store.tomarEntrante({ ...opt, usuarioId: "u", conexionId: "c", numero: "595", owner: "wh:mio" });
  const otro = await entrante.soltarMarcaEntrante({
    ok: true,
    owner: "wh:otro",
    estado: "entrante",
    modo: "entrante",
    liberar: () => store.soltarEntrante({ ...opt, usuarioId: "u", conexionId: "c", numero: "595", owner: "wh:otro" }),
  });
  assert.strictEqual(otro.motivo, "valla_ajena");
  assert.strictEqual(otro.retenida, false);
  assert.strictEqual(base.filas.get("u|c|595").owner, "wh:mio");
  assert.strictEqual(entrante.estadoHttpTrasSoltar({ retenida: false }, 200), 200);
  ok("ok false, red, duplicado y marca de limpieza no confirman ni sueltan lo ajeno");
}

async function testRecuperacionNoRepiteDelete() {
  const sql = sqlFalso();
  const opt = opciones(sql);
  const clave = "archivos/whatsapp/u/foto.jpg";
  await store.reservar({ ...opt, usuarioId: "u", conexionId: "c", numero: "596", owner: "cl:1" });
  await store.pasarABorrando({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "596",
    owner: "cl:1",
    claveArchivo: clave,
  });
  let borrados = 0;
  let lecturas = 0;
  const recuperada = await admin.recuperarMarcaDurable({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "596",
    actor: "ops",
    existeObjeto: async ({ clave: pedida }) => {
      lecturas += 1;
      assert.strictEqual(pedida, clave);
      return false;
    },
    borrarObjeto: async () => {
      borrados += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(recuperada.ok, true);
  assert.strictEqual(recuperada.liberada, false);
  assert.strictEqual(recuperada.storage, false);
  assert.strictEqual(recuperada.reintentar, false);
  assert.strictEqual(lecturas, 1);
  assert.strictEqual(borrados, 0);
  assert.strictEqual(sql.filas.get("u|c|596").estado, "borrando");
  assert.strictEqual(sql.filas.get("u|c|596").resultado, "incierto");
  assert.strictEqual(sql.filas.get("u|c|596").verificacion.objetoExiste, false);
  const suelta = await admin.liberarMarcaDurable({ ...opt, usuarioId: "u", conexionId: "c", numero: "596", actor: "ops" });
  assert.strictEqual(suelta.liberada, true);
  assert.strictEqual(sql.filas.get("u|c|596").estado, null);
  assert.strictEqual(sql.filas.get("u|c|596").resultado, "incierto");
  const reserva = await store.reservar({ ...opt, usuarioId: "u", conexionId: "c", numero: "596", owner: "cl:2" });
  assert.strictEqual(reserva.ok, false);
  assert.strictEqual(reserva.motivo, "resultado_incierto");
  assert.strictEqual(reserva.reintentar, false);
  assert.strictEqual(borrados, 0);
  assert.strictEqual(sql.filas.get("u|c|596").estado, null);

  await store.reservar({ ...opt, usuarioId: "u", conexionId: "c", numero: "597", owner: "cl:1" });
  await store.pasarABorrando({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "597",
    owner: "cl:1",
    claveArchivo: clave,
  });
  const fallo = await admin.recuperarMarcaDurable({
    ...opt,
    usuarioId: "u",
    conexionId: "c",
    numero: "597",
    actor: "ops",
    existeObjeto: async () => {
      throw new Error("listado incompleto");
    },
  });
  assert.strictEqual(fallo.ok, false);
  assert.strictEqual(fallo.motivo, "consulta_fallida");
  assert.strictEqual(fallo.liberada, false);
  assert.strictEqual(sql.filas.get("u|c|597").resultado, null);
  assert.strictEqual(sql.filas.get("u|c|597").estado, "borrando");
  assert.ok(!sql.llamadas.includes("limpieza_media_marca_recuperar") || sql.filas.get("u|c|597").verificacion == null);
  ok("la recuperación verifica el objeto, no lo borra y el incierto no se reserva");
}

async function main() {
  testNoRedNiCron();
  await testProtocolo();
  await testRecuperacionNoRepiteDelete();
  await testNoSueltaReservaNiStorageEnCurso();
  await testSoltarOkFalseDuplicadoYLimpieza();
  console.log(`${passed} pruebas ok`);
  console.log("Estas pruebas no demuestran persistencia en PostgreSQL.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
