/**
 * Recuperación de marcas en borrando y puerta de entrantes.
 * No abre Postgres ni Storage.
 * Ejecutar: node tests/limpiezaMediaMarcaAdmin.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const admin = require("../services/limpiezaMedia/limpiezaMediaMarcaAdmin");
const marca = require("../services/limpiezaMedia/limpiezaMediaMarca");
const entrante = require("../services/limpiezaMedia/limpiezaMediaEntrante");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");
const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("ok", name);
}

function testSinRed() {
  const lista = admin.listarMarcasReales();
  const resolucion = admin.resolverMarcaReal();
  assert.strictEqual(lista.disponible, false);
  assert.strictEqual(lista.motivo, "marca_no_disponible");
  assert.deepStrictEqual(lista.marcas, []);
  assert.strictEqual(resolucion.ok, false);
  assert.strictEqual(resolucion.storage, false);
  assert.strictEqual(resolucion.reintentar, false);
  for (const archivo of ["limpiezaMediaMarcaAdmin.js", "limpiezaMediaEntrante.js"]) {
    const src = fs.readFileSync(path.join(__dirname, "../services/limpiezaMedia", archivo), "utf8");
    assert.ok(!src.includes("axios"));
    assert.ok(!src.includes("DATABASE_URL"));
    assert.ok(!src.includes("require(\"pg\")"));
    assert.ok(!src.includes("restaurarObjeto"));
    assert.ok(!src.includes(".delete("));
  }
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  ok("la recuperación real no consulta producción y no borra");
}

async function dejarBorrando({ clave, fallo }) {
  const registro = marca.crearRegistroDePrueba();
  const sesion = await marca.abrirMarcaDePrueba({
    registro,
    hilo: "usuario-1|conexion-9|59170000000",
    owner: "cl:worker",
    entranteMs: 1000,
  });
  let llamados = 0;
  const resultado = await marca.ejecutarBajoMarca({
    clave,
    marca: sesion,
    borrarObjeto: async () => {
      llamados += 1;
      if (fallo === "timeout") {
        const error = new Error("timeout");
        error.code = "ECONNABORTED";
        throw error;
      }
      if (fallo === "suelta") {
        sesion.soltarTrasExito = async () => ({ ok: false, motivo: "conexion_perdida" });
        return { eliminado: true };
      }
      if (fallo === "ausente") {
        sesion.soltarTrasExito = async () => ({ ok: false, motivo: "conexion_perdida" });
        return { eliminado: false, confirmado: true };
      }
      return { eliminado: true };
    },
  });
  return { registro, sesion, resultado, llamados };
}

async function testReinicioTimeoutYResolucion() {
  marca.olvidarMemoriaDeProceso();
  const clave = "archivos/whatsapp/usuario-1/foto.jpg";
  const caido = await dejarBorrando({ clave, fallo: "timeout" });
  assert.strictEqual(caido.resultado.motivo, "resultado_incierto");
  assert.strictEqual(caido.resultado.reintentar, false);
  assert.strictEqual(caido.llamados, 1);
  marca.olvidarMemoriaDeProceso();
  const pendientes = admin.listarPendientes(caido.registro);
  assert.strictEqual(pendientes.marcas.length, 1);
  const ficha = pendientes.marcas[0];
  assert.strictEqual(ficha.usuarioId, "usuario-1");
  assert.strictEqual(ficha.conexionId, "conexion-9");
  assert.strictEqual(ficha.clienteNumero, "59170000000");
  assert.ok(ficha.iniciadaEn);
  assert.strictEqual(ficha.claveArchivo, clave);
  assert.strictEqual(ficha.resultadoConocido, "incierto");
  const reanudado = await admin.intentarReanudarBorrado();
  assert.strictEqual(reanudado.reintentar, false);
  assert.strictEqual(reanudado.storage, false);
  const segunda = await marca.ejecutarBajoMarca({
    clave,
    marca: caido.sesion,
    borrarObjeto: async () => {
      caido.llamados += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(segunda.motivo, "resultado_incierto");
  assert.strictEqual(caido.llamados, 1);
  const hilo = ficha.hilo;
  const sinVer = await admin.liberarMarca({ registro: caido.registro, hilo, actor: "admin" });
  assert.strictEqual(sinVer.ok, false);
  assert.strictEqual(sinVer.motivo, "verificacion_requerida");
  assert.strictEqual(caido.registro.porHilo.has(hilo), true);
  const verificada = admin.verificarMarca({
    registro: caido.registro,
    hilo,
    resultadoVerificado: "incierto",
    actor: "admin",
    nota: "storage no respondió",
  });
  assert.strictEqual(verificada.ok, true);
  assert.strictEqual(verificada.storage, false);
  assert.strictEqual(verificada.liberada, false);
  const suelta = await admin.liberarMarca({ registro: caido.registro, hilo, actor: "admin" });
  assert.strictEqual(suelta.liberada, true);
  assert.strictEqual(suelta.storage, false);
  assert.strictEqual(suelta.reintentar, false);
  assert.strictEqual(caido.registro.porHilo.has(hilo), false);
  assert.deepStrictEqual(
    caido.registro.auditoria.map((item) => item.accion),
    ["verificar", "liberar"]
  );
  assert.ok(caido.registro.auditoria.every((item) => item.storage === false && item.reintentar === false));
  ok("reinicio, timeout e incierto se resuelven a mano sin otro DELETE");
}

async function testResultadosConfirmados() {
  marca.olvidarMemoriaDeProceso();
  const borrado = await dejarBorrando({
    clave: "archivos/whatsapp/usuario-1/borrado.jpg",
    fallo: "suelta",
  });
  const noBorrado = await dejarBorrando({
    clave: "archivos/whatsapp/usuario-1/vivo.jpg",
    fallo: "ausente",
  });
  const vistoBorrado = admin.listarPendientes(borrado.registro).marcas[0];
  const vistoVivo = admin.listarPendientes(noBorrado.registro).marcas[0];
  assert.strictEqual(vistoBorrado.resultadoConocido, "eliminado_confirmado");
  assert.strictEqual(vistoVivo.resultadoConocido, "incierto");
  assert.strictEqual(noBorrado.registro.porHilo.get(vistoVivo.hilo).estado, "borrando");
  assert.strictEqual(borrado.llamados, 1);
  assert.strictEqual(noBorrado.llamados, 1);
  const reintentoVivo = await marca.ejecutarBajoMarca({
    clave: "archivos/whatsapp/usuario-1/vivo.jpg",
    marca: noBorrado.sesion,
    borrarObjeto: async () => {
      noBorrado.llamados += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(reintentoVivo.motivo, "resultado_incierto");
  assert.strictEqual(noBorrado.llamados, 1);
  const reintento = await marca.ejecutarBajoMarca({
    clave: "archivos/whatsapp/usuario-1/borrado.jpg",
    marca: borrado.sesion,
    borrarObjeto: async () => {
      borrado.llamados += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(reintento.reintentar, false);
  assert.strictEqual(borrado.llamados, 1);
  admin.verificarMarca({
    registro: borrado.registro,
    hilo: vistoBorrado.hilo,
    resultadoVerificado: "eliminado_confirmado",
    actor: "admin",
  });
  await admin.liberarMarca({ registro: borrado.registro, hilo: vistoBorrado.hilo, actor: "admin" });
  assert.strictEqual(borrado.llamados, 1);
  ok("un confirmado sin evidencia queda incierto y no dispara otro DELETE");
}

function store(registro) {
  return { instalada: true, registro };
}

async function testTiposReintentoYBoton() {
  marca.olvidarMemoriaDeProceso();
  const registro = marca.crearRegistroDePrueba();
  const hilo = "usuario-1|conexion-9|59170000000";
  await marca.abrirMarcaDePrueba({ registro, hilo, owner: "cl:worker", entranteMs: 1 });
  await registro.promover({ hilo, owner: "cl:worker", desde: "reservado", hacia: "borrando" });
  registro.porHilo.get(hilo).iniciadaEn = "2026-01-01T00:00:00.000Z";
  registro.porHilo.get(hilo).claveArchivo = "archivos/whatsapp/usuario-1/foto.jpg";
  registro.porHilo.get(hilo).resultado = "incierto";
  let inserts = 0;
  const vistos = [];
  for (const tipo of entrante.TIPOS_ENTRANTE) {
    const respuesta = await entrante.coordinarPersistenciaEntrante({
      marca: store(registro),
      usuarioId: "usuario-1",
      conexionId: "conexion-9",
      numero: "59170000000",
      wamid: `wamid.${tipo}`,
      esperarMs: 0,
      persistir: async () => {
        inserts += 1;
        vistos.push(tipo);
        return { claimed: true };
      },
    });
    assert.strictEqual(respuesta.status, 503, tipo);
    assert.strictEqual(respuesta.confirmado, false, tipo);
    assert.strictEqual(respuesta.reintentar, true, tipo);
  }
  assert.strictEqual(inserts, 0);
  assert.deepStrictEqual(vistos, []);
  const filaAjena = registro.porHilo.get(hilo);
  for (const estado of ["reservado", "borrando"]) {
    const permiso = entrante.permiteConfirmacionEntrante({
      marca: { instalada: true, estado, sostenida: false },
      usuarioId: "usuario-1",
      conexionId: "conexion-9",
      numero: "59170000000",
    });
    assert.strictEqual(permiso.ok, false, estado);
    assert.strictEqual(permiso.motivo, "valla_ocupada", estado);
  }
  const permisoFila = entrante.permiteConfirmacionEntrante({
    marca: store(registro),
    usuarioId: "usuario-1",
    conexionId: "conexion-9",
    numero: "59170000000",
  });
  assert.strictEqual(permisoFila.ok, false);
  assert.strictEqual(permisoFila.motivo, "valla_ocupada");
  assert.strictEqual(registro.porHilo.get(hilo), filaAjena);
  assert.strictEqual(filaAjena.estado, "borrando");
  assert.strictEqual(filaAjena.owner, "cl:worker");
  const permitido = entrante.permiteConfirmacionEntrante({
    marca: { instalada: true, estado: "entrante", sostenida: true },
    usuarioId: "usuario-1",
    conexionId: "conexion-9",
    numero: "59170000000",
  });
  assert.strictEqual(permitido.ok, true);
  const otra = await entrante.coordinarPersistenciaEntrante({
    marca: store(registro),
    usuarioId: "usuario-1",
    conexionId: "conexion-9",
    numero: "59170000001",
    wamid: "wamid.otra",
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(otra.guardado, true);
  assert.strictEqual(inserts, 1);
  if (otra.valla) await otra.valla.liberar();
  admin.verificarMarca({
    registro,
    hilo,
    resultadoVerificado: "no_eliminado_confirmado",
    actor: "admin",
    nota: "el archivo sigue en storage",
  });
  await admin.liberarMarca({ registro, hilo, actor: "admin" });
  const reintento = await entrante.coordinarPersistenciaEntrante({
    marca: store(registro),
    usuarioId: "usuario-1",
    conexionId: "conexion-9",
    numero: "59170000000",
    wamid: "wamid.text",
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(reintento.guardado, true);
  const duplicado = await entrante.coordinarPersistenciaEntrante({
    marca: store(registro),
    usuarioId: "usuario-1",
    conexionId: "conexion-9",
    numero: "59170000000",
    wamid: "wamid.text",
    persistir: async () => ({ claimed: false, duplicate: true }),
  });
  assert.strictEqual(duplicado.status, 200);
  assert.strictEqual(duplicado.duplicado, true);
  assert.strictEqual(inserts, 2);
  const real = await eliminar.eliminarSoloObjetoStorage("archivos/whatsapp/usuario-1/foto.jpg", {
    cliente: { delete: async () => ({ status: 200 }) },
  });
  assert.strictEqual(real.motivo, "bloqueada");
  assert.strictEqual(real.storage, false);
  ok("todos los tipos esperan la marca, el webhook no llama a V1 con la valla cerrada y el reintento es idempotente");
}

function testAuditoriaDeCaminos() {
  const raiz = path.join(__dirname, "..");
  const webhook = fs.readFileSync(path.join(raiz, "routes/webhook.js"), "utf8");
  const boton = fs.readFileSync(path.join(raiz, "services/seguimiento/registrarRespuestaBoton.js"), "utf8");
  const coordinar = webhook.indexOf("const coordinado = await coordinarPersistenciaEntrante");
  const claim = webhook.indexOf("reclamarMensajeEntrantePorWamid({");
  const permiso = webhook.indexOf("const permisoBoton = permiteConfirmacionEntrante");
  const condicion = webhook.indexOf('if (permisoBoton.ok && String(reply.id || "").startsWith("seg_"))');
  const registrar = webhook.indexOf("registrarRespuestaBotonSeguimiento({");
  const soltar = webhook.lastIndexOf("await soltarVallaEntrante();");
  const puerta = webhook.slice(permiso, registrar);
  assert.ok(coordinar > 0 && coordinar < claim);
  assert.ok(permiso > claim && permiso < condicion && condicion < registrar);
  assert.ok(registrar < soltar);
  assert.ok(!puerta.includes("liberar("));
  assert.ok(!puerta.includes("soltar"));
  assert.strictEqual(webhook.split("reclamarMensajeEntrantePorWamid({").length, 2);
  assert.strictEqual(webhook.split("registrarRespuestaBotonSeguimiento({").length, 2);
  assert.ok(!boton.includes("resolverPermisoEntrante"));
  assert.ok(!boton.includes("limpiezaMedia"));
  assert.ok(boton.includes('direccion: "entrante"'));
  assert.ok(boton.includes('tipo: "interactive"'));
  assert.ok(boton.indexOf("axios.post") > boton.indexOf("if (!SUPABASE_URL || !SUPABASE_KEY) return;"));
  assert.ok(webhook.indexOf("estado_envio") < coordinar);
  const entradas = [];
  function recorrer(dir) {
    for (const nombre of fs.readdirSync(dir)) {
      if (nombre === "node_modules" || nombre === "tests") continue;
      const completo = path.join(dir, nombre);
      const stat = fs.statSync(completo);
      if (stat.isDirectory()) recorrer(completo);
      else if (nombre.endsWith(".js")) {
        const texto = fs.readFileSync(completo, "utf8");
        if (texto.includes('direccion: "entrante"') || texto.includes("direccion: 'entrante'")) {
          entradas.push(path.relative(raiz, completo).replace(/\\/g, "/"));
        }
      }
    }
  }
  recorrer(path.join(raiz, "routes"));
  recorrer(path.join(raiz, "services"));
  entradas.sort();
  assert.deepStrictEqual(entradas, [
    "routes/webhook.js",
    "services/seguimiento/registrarRespuestaBoton.js",
  ]);
  ok("el claim consulta la marca y el webhook impide llamar a V1; V1 no consulta la limpieza");
}

async function main() {
  testSinRed();
  await testReinicioTimeoutYResolucion();
  await testResultadosConfirmados();
  await testTiposReintentoYBoton();
  testAuditoriaDeCaminos();
  console.log(`${passed} pruebas ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
