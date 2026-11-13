/**
 * Reglas y simulación de limpieza de multimedia. No llama a Supabase.
 * Ejecutar: node tests/limpiezaMedia.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const reglas = require("../services/limpiezaMedia/reglas");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");

const AHORA = new Date("2026-11-11T22:46:10.000Z");
const HACE_40_DIAS = "2026-10-02T22:46:10.000Z";
const HACE_10_DIAS = "2026-11-01T22:46:10.000Z";
const URL = "https://proj.supabase.co/storage/v1/object/public/archivos/";

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("ok", name);
}

function fila(usuario, conexion, numero, extra) {
  return {
    usuario_id: usuario,
    conexion_whatsapp_id: conexion,
    cliente_numero: numero,
    ...extra,
  };
}

function testReloj() {
  assert.strictEqual(reglas.limpiezaActiva({}), false);
  assert.strictEqual(reglas.limpiezaActiva({ LIMPIEZA_MEDIA_ACTIVA: "false" }), false);
  assert.strictEqual(reglas.limpiezaActiva({ LIMPIEZA_MEDIA_ACTIVA: "TRUE" }), true);

  const limite = reglas.limiteInactividadMs(AHORA, 30);
  const exacto = reglas.parseCreadoEnUtc("2026-10-12T22:46:10.000Z");
  const unMsDespues = exacto + 1;
  assert.ok(exacto <= limite);
  assert.ok(unMsDespues > limite);

  const hilos = new Map();
  reglas.registrarEntrante(hilos, fila("u", "c", "1", {
    direccion: "saliente",
    creado_en: HACE_10_DIAS,
  }));
  assert.strictEqual(hilos.size, 0);
  reglas.registrarEntrante(hilos, fila("u", "c", "1", {
    direccion: "entrante",
    tipo: "reaction",
    creado_en: "2026-10-01 00:00:00",
  }));
  reglas.registrarEntrante(hilos, fila("u", "c", "1", {
    direccion: "entrante",
    creado_en: HACE_40_DIAS,
  }));
  assert.strictEqual(hilos.get("u|c|1").ultimoEntranteMs, reglas.parseCreadoEnUtc(HACE_40_DIAS));
  assert.strictEqual(reglas.claveHilo("u", "", "1"), null);
  ok("reloj de 30 días, reacción y saliente");
}

function testRutas() {
  const claveNota = "archivos/whatsapp/u/nota.ogg";
  assert.strictEqual(
    reglas.extraerRutaArchivos(`${URL}whatsapp-meta/u/a.jpg`),
    "archivos/whatsapp-meta/u/a.jpg"
  );
  assert.strictEqual(reglas.extraerRutaArchivos(`${URL}whatsapp/u/nota.ogg?token=1`), claveNota);
  assert.strictEqual(
    reglas.extraerRutaArchivos(
      "https://proj.supabase.co/storage/v1/object/sign/archivos/whatsapp/u/nota.ogg?token=abc"
    ),
    claveNota
  );
  assert.strictEqual(
    reglas.extraerRutaArchivos(
      "https://proj.supabase.co/storage/v1/object/authenticated/archivos/whatsapp/u/nota.ogg"
    ),
    claveNota
  );
  assert.strictEqual(
    reglas.extraerRutaArchivos(
      "https://proj.supabase.co/storage/v1/render/image/public/archivos/whatsapp/u/nota.ogg"
    ),
    claveNota
  );
  assert.strictEqual(
    reglas.extraerRutaArchivos(`${URL}whatsapp%2Fu%2Fnota.ogg`),
    claveNota
  );

  const seguimiento = reglas.analizarTextoStorage(
    "https://proj.supabase.co/storage/v1/object/public/seguimiento-v2-media/u/a.jpg"
  );
  const rm24h = reglas.analizarTextoStorage(
    "https://proj.supabase.co/storage/v1/object/sign/rm24h-media/rm24h/test.jpg?token=1"
  );
  assert.strictEqual(seguimiento.objetos[0].clave, "seguimiento-v2-media/u/a.jpg");
  assert.strictEqual(rm24h.objetos[0].clave, "rm24h-media/rm24h/test.jpg");
  assert.strictEqual(reglas.esObjetoCandidato(seguimiento.objetos[0]), false);
  assert.strictEqual(reglas.esObjetoCandidato(rm24h.objetos[0]), false);
  assert.strictEqual(reglas.extraerRutaArchivos(
    "https://proj.supabase.co/storage/v1/object/public/seguimiento-v2-media/u/a.jpg"
  ), null);
  assert.strictEqual(reglas.extraerRutaArchivos("https://cdn.ejemplo/a.jpg"), null);

  const recorrido = reglas.analizarTextoStorage(`${URL}whatsapp/../../secreto.jpg`);
  assert.strictEqual(recorrido.noVerificable, true);
  assert.deepStrictEqual(recorrido.objetos, []);
  assert.strictEqual(reglas.extraerRutaArchivos(`${URL}whatsapp/../../secreto.jpg`), null);
  assert.strictEqual(
    reglas.analizarTextoStorage("https://proj.supabase.co/storage/v1/object/public/").noVerificable,
    true
  );

  const html = 'object/public/archivos/whatsapp/u/plantilla.webp&quot;,&quot;tipo&quot;';
  const escapada = "object/public/archivos/whatsapp\\/u\\/flujo.webp";
  assert.deepStrictEqual(reglas.extraerRutasProtegidasDesdeTexto(html), [
    "archivos/whatsapp/u/plantilla.webp",
  ]);
  assert.deepStrictEqual(reglas.extraerRutasProtegidasDesdeTexto(escapada), [
    "archivos/whatsapp/u/flujo.webp",
  ]);
  ok("rutas públicas, firmadas, autenticadas y buckets ajenos");
}

function testClasificacion() {
  const limite = reglas.limiteInactividadMs(AHORA, 30);
  const hilos = new Map([
    ["u|c|1", { ultimoEntranteMs: reglas.parseCreadoEnUtc(HACE_40_DIAS) }],
    ["u|c|2", { ultimoEntranteMs: reglas.parseCreadoEnUtc(HACE_10_DIAS) }],
  ]);
  const protegidas = new Set(["archivos/whatsapp/u/plantilla.webp"]);
  const usos = new Map();
  reglas.anotarUso(usos, fila("u", "c", "1", { imagen_url: `${URL}whatsapp/u/foto.jpg` }));
  reglas.anotarUso(usos, fila("u", "c", "1", { imagen_url: `${URL}whatsapp/u/plantilla.webp` }));
  reglas.anotarUso(usos, fila("u", "c", "1", { imagen_url: `${URL}whatsapp/u/dos.jpg` }));
  reglas.anotarUso(usos, fila("u", "c", "2", { imagen_url: `${URL}whatsapp/u/dos.jpg` }));
  reglas.anotarUso(usos, fila("u2", "c2", "9", { imagen_url: `${URL}whatsapp/u/ajena.jpg` }));
  reglas.anotarUso(usos, fila("u3", "c3", "8", { imagen_url: `${URL}whatsapp/u/ajena.jpg` }));

  const { candidatos, excluidos } = reglas.clasificarUsos(usos, hilos, protegidas, limite);
  assert.deepStrictEqual([...candidatos.keys()], ["archivos/whatsapp/u/foto.jpg"]);
  assert.strictEqual(excluidos.referenciada, 1);
  assert.strictEqual(excluidos.compartida, 1);
  assert.strictEqual(excluidos.multi_usuario, 1);
  ok("exclusión de plantillas, compartidos y otros usuarios");
}

function testReferenciaDeConversacion() {
  const limite = reglas.limiteInactividadMs(AHORA, 30);
  const hilos = new Map([
    ["u|c|1", { ultimoEntranteMs: reglas.parseCreadoEnUtc(HACE_40_DIAS) }],
  ]);
  const url = `${URL}whatsapp/u/foto.jpg`;
  const usos = new Map();
  reglas.anotarUso(usos, fila("u", "c", "1", { imagen_url: url }));
  const protegidas = new Set(reglas.extraerRutasProtegidasDesdeTexto(url));
  const { candidatos, excluidos } = reglas.clasificarUsos(usos, hilos, protegidas, limite);
  assert.strictEqual(candidatos.size, 0);
  assert.strictEqual(excluidos.referenciada, 1);

  const ajenos = new Map();
  reglas.anotarUso(ajenos, fila("u", "c", "1", {
    imagen_url: "https://proj.supabase.co/storage/v1/object/public/rm24h-media/rm24h/test.jpg",
  }));
  reglas.anotarUso(ajenos, fila("u", "c", "1", {
    imagen_url: "https://proj.supabase.co/storage/v1/object/public/seguimiento-v2-media/u/a.jpg",
  }));
  assert.strictEqual(ajenos.size, 0);

  const sinHilo = new Map();
  reglas.anotarUso(sinHilo, fila("u", "", "1", { imagen_url: url }));
  const suelto = reglas.clasificarUsos(sinHilo, hilos, new Set(), limite);
  assert.strictEqual(suelto.candidatos.size, 0);
  assert.strictEqual(suelto.excluidos.no_verificable, 1);
  ok("contenido, buckets ajenos y hilo incompleto no candidan");
}

function fixture() {
  return {
    flujos_builder: [
      { data: { url: `${URL}whatsapp/u1/plantilla.webp` } },
    ],
    flujos_builder_versiones: [],
    remarketing_global_24h: [],
    seguimientos_v2: [],
    seguimientos_programados: [],
    entrantes: [
      fila("u1", "c1", "n1", { direccion: "entrante", creado_en: HACE_40_DIAS }),
      fila("u1", "c1", "n2", { direccion: "entrante", creado_en: HACE_10_DIAS }),
      fila("u1", "c1", "n5", { direccion: "entrante", tipo: "reaction", creado_en: HACE_40_DIAS }),
    ],
    medias: [
      fila("u1", "c1", "n1", { imagen_url: `${URL}whatsapp/u1/foto.jpg` }),
      fila("u1", "c1", "n1", { imagen_url: `${URL}whatsapp/u1/plantilla.webp` }),
      fila("u1", "c1", "n1", { imagen_url: `${URL}whatsapp/u1/compartida.jpg` }),
      fila("u1", "c1", "n5", { imagen_url: `${URL}whatsapp/u1/compartida.jpg` }),
      fila("u1", "c1", "n2", { imagen_url: `${URL}whatsapp-meta/u1/activa.jpg` }),
      fila("u1", "c1", "n3", { imagen_url: `${URL}whatsapp/u1/sin.jpg` }),
      fila("u1", "c1", "n1", { imagen_url: `${URL}whatsapp/u1/fantasma.jpg` }),
      fila("u1", "c1", "n1", { imagen_url: "https://cdn.ejemplo/a.jpg" }),
      fila("u1", "c1", "n1", {
        imagen_url: "https://proj.supabase.co/storage/v1/object/public/seguimiento-v2-media/u/a.jpg",
      }),
      fila("u1", "c1", "n1", {
        imagen_url: "https://proj.supabase.co/storage/v1/object/public/rm24h-media/rm24h/test.jpg",
      }),
    ],
    storage: {
      "whatsapp-meta": [{ name: "u1", id: null }],
      "whatsapp-meta/u1": [{ name: "activa.jpg", id: "a", metadata: { size: 50 } }],
      whatsapp: [{ name: "u1", id: null }],
      "whatsapp/u1": [
        { name: "foto.jpg", id: "b", metadata: { size: 100 } },
        { name: "plantilla.webp", id: "c", metadata: { size: 5 } },
        { name: "compartida.jpg", id: "d", metadata: { size: 7 } },
        { name: "sin.jpg", id: "e", metadata: { size: 9 } },
      ],
    },
  };
}

function crearIo(datos, resumenes, llamadas) {
  return {
    async leerFuente({ fuente, offset, limit }) {
      llamadas.push(`fuente:${fuente}`);
      const filas = datos[fuente] || [];
      return filas.slice(offset, offset + limit);
    },
    async leerMensajes({ fase, offset, limit }) {
      llamadas.push(`mensajes:${fase}`);
      const filas = fase === "entrantes" ? datos.entrantes : datos.medias;
      return filas.slice(offset, offset + limit);
    },
    async listarStorage({ prefix, offset, limit }) {
      llamadas.push(`storage:${prefix}`);
      const filas = datos.storage[prefix] || [];
      return filas.slice(offset, offset + limit);
    },
    async registrarResumen(detalle) {
      resumenes.push(detalle);
    },
  };
}

async function testSimulacionCompleta() {
  const resumenes = [];
  const llamadas = [];
  const estado = servicio.crearEstado();
  const result = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado,
    io: crearIo(fixture(), resumenes, llamadas),
    maxMs: 10000,
    maxPaginas: 40,
    pageSize: 2,
  });

  assert.strictEqual(result.pausada, false);
  assert.strictEqual(result.modo, "simulacion");
  assert.strictEqual(result.eliminacionReal, "bloqueada");
  assert.strictEqual(result.completo, true);
  assert.strictEqual(result.candidatos, 1);
  assert.strictEqual(result.candidatosPendientes, 0);
  assert.strictEqual(result.bytes, 100);
  assert.strictEqual(result.excluidos.referenciada, 1);
  assert.strictEqual(result.excluidos.compartida, 1);
  assert.strictEqual(result.excluidos.hilo_activo, 1);
  assert.strictEqual(result.excluidos.sin_entrante, 1);
  assert.strictEqual(result.excluidos.objeto_ausente, 1);
  assert.strictEqual(result.hilosInactivos, 2);
  assert.strictEqual(llamadas.some((c) => c.startsWith("borrar")), false);
  for (const fuente of servicio.FUENTES) {
    assert.ok(llamadas.includes(`fuente:${fuente}`), fuente);
  }
  assert.strictEqual(resumenes.length, 0);
  assert.strictEqual(result.resumenRegistrado, false);
  const texto = JSON.stringify(result);
  assert.ok(!texto.includes("foto.jpg"));
  assert.ok(!texto.includes("whatsapp/u1"));
  ok("simulación completa sin borrar");
}

async function testPausadaYReanudacion() {
  let lecturas = 0;
  const io = {
    async leerFuente() {
      lecturas += 1;
      return [];
    },
    async leerMensajes() {
      lecturas += 1;
      return [];
    },
    async listarStorage() {
      lecturas += 1;
      return [];
    },
    async registrarResumen() {},
  };
  const pausada = await servicio.ejecutarLimpiezaMedia({
    env: {},
    estado: servicio.crearEstado(),
    io,
  });
  assert.strictEqual(pausada.pausada, true);
  assert.strictEqual(lecturas, 0);

  const estado = servicio.crearEstado();
  const datos = fixture();
  const resumenes = [];
  const ioPaso = crearIo(datos, resumenes, []);
  const primero = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado,
    io: ioPaso,
    maxMs: 10000,
    maxPaginas: 1,
    pageSize: 2,
  });
  assert.strictEqual(primero.completo, false);
  assert.notStrictEqual(primero.fase, "listo");

  let actual = primero;
  for (let i = 0; i < 80 && !actual.completo; i += 1) {
    actual = await servicio.ejecutarLimpiezaMedia({
      env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
      ahora: AHORA,
      estado,
      io: ioPaso,
      maxMs: 10000,
      maxPaginas: 1,
      pageSize: 2,
    });
  }
  assert.strictEqual(actual.completo, true);
  assert.strictEqual(actual.candidatos, 1);
  assert.strictEqual(actual.bytes, 100);
  ok("pausa por defecto y reanudación por lotes");
}

async function testProteccionesNuevas() {
  const firma = fixture();
  firma.flujos_builder.push({
    data: {
      url: "https://proj.supabase.co/storage/v1/object/sign/archivos/whatsapp/u1/foto.jpg?token=abc",
    },
  });
  firma.conversaciones = [{ ultimo_mensaje: `${URL}whatsapp/u1/fantasma.jpg` }];
  firma.medias = firma.medias.map((item, index) => (
    index === 0 ? { ...item, contenido: `${URL}whatsapp/u1/foto.jpg` } : item
  ));
  const resumenes = [];
  const result = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado: servicio.crearEstado(),
    io: crearIo(firma, resumenes, []),
    maxMs: 10000,
    maxPaginas: 80,
    pageSize: 2,
  });
  assert.strictEqual(result.completo, true);
  assert.strictEqual(result.proteccionIncompleta, false);
  assert.strictEqual(result.candidatos, 0);
  assert.strictEqual(result.bytes, 0);
  assert.ok(result.excluidos.referenciada >= 2);

  const ilegible = fixture();
  ilegible.flujos_builder = [{ data: "https://proj.supabase.co/storage/v1/object/public/" }];
  const roto = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado: servicio.crearEstado(),
    io: crearIo(ilegible, [], []),
    maxMs: 10000,
    maxPaginas: 10,
    pageSize: 2,
  });
  assert.strictEqual(roto.proteccionIncompleta, true);
  assert.strictEqual(roto.completo, false);
  assert.strictEqual(roto.candidatos, 0);
  assert.strictEqual(roto.bytes, 0);
  ok("firma, contenido, preview y URL ilegible");
}

function testBloqueoDeBorrado() {
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.throws(() => servicio.solicitarBorradoReal(), /bloqueada/);
  const src = fs.readFileSync(
    path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaService.js"),
    "utf8"
  );
  assert.ok(!src.includes(".delete("));
  assert.ok(!src.includes(".patch("));
  assert.ok(!src.includes(".put("));
  assert.ok(!src.includes("axios.delete"));
  assert.ok(!src.includes("axios.patch"));
  assert.ok(!src.includes("axios.put"));
  assert.ok(!src.includes("method: \"DELETE\""));
  assert.ok(!src.includes("method: \"PATCH\""));
  assert.ok(!src.includes("method: \"PUT\""));
  assert.ok(!src.includes("x-upsert"));
  assert.ok(!src.includes("registrarAdminLog"));
  assert.ok(!src.includes("registrarResumen"));
  assert.ok(!src.includes("/rest/v1/admin_logs"));
  const posts = src.match(/axios\.post\(/g) || [];
  assert.strictEqual(posts.length, 1);
  assert.ok(src.includes("/storage/v1/object/list/archivos"));
  ok("borrado real bloqueado en el código");
}

async function testNoHayEscritura() {
  const escrituras = [];
  function prohibida(nombre) {
    return async () => {
      escrituras.push(nombre);
      throw new Error(nombre);
    };
  }
  const io = crearIo(fixture(), [], []);
  io.registrarResumen = prohibida("resumen");
  io.insertar = prohibida("insertar");
  io.actualizar = prohibida("actualizar");
  io.borrar = prohibida("borrar");
  const result = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado: servicio.crearEstado(),
    io,
    maxMs: 10000,
    maxPaginas: 40,
    pageSize: 2,
  });
  assert.deepStrictEqual(escrituras, []);
  assert.strictEqual(result.completo, true);
  assert.strictEqual(result.resumenRegistrado, false);
  assert.strictEqual(result.eliminacionReal, "bloqueada");
  ok("ninguna función de escritura fue llamada");
}

function fuentesVacias() {
  const datos = { entrantes: [], medias: [], storage: {} };
  for (const fuente of servicio.FUENTES) datos[fuente] = [];
  return datos;
}

async function testCopiaSegv2() {
  const datos = fuentesVacias();
  const copia = `${URL}whatsapp/u/segv2/c/591/abc.png`;
  datos.seguimientos_v2 = [{
    media_url: "https://proj.supabase.co/storage/v1/object/public/seguimiento-v2-media/u/a.png",
    contenido: "pie",
  }];
  datos.entrantes = [
    fila("u", "c", "591", { direccion: "entrante", creado_en: HACE_40_DIAS }),
    fila("u", "c", "591", { direccion: "saliente", creado_en: HACE_10_DIAS }),
  ];
  datos.medias = [fila("u", "c", "591", { imagen_url: copia })];
  datos.storage = {
    whatsapp: [{ name: "u", id: null }],
    "whatsapp/u": [{ name: "segv2", id: null }],
    "whatsapp/u/segv2": [{ name: "c", id: null }],
    "whatsapp/u/segv2/c": [{ name: "591", id: null }],
    "whatsapp/u/segv2/c/591": [{ name: "abc.png", id: "z", metadata: { size: 233 } }],
  };
  const result = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado: servicio.crearEstado(),
    io: crearIo(datos, [], []),
    informe: true,
    maxMs: 10000,
    maxPaginas: 80,
    pageSize: 10,
  });
  assert.strictEqual(result.completo, true);
  assert.strictEqual(result.candidatos, 1);
  assert.strictEqual(result.bytes, 233);
  assert.strictEqual(result.informe.coberturaSegv2.revisadas, 1);
  assert.strictEqual(result.informe.coberturaSegv2.candidatos, 1);
  const original = result.informe.objetos.find((objeto) => objeto.motivo === "original_seguimiento_v2");
  assert.ok(original);
  assert.strictEqual(original.categoria, "protegido");
  assert.strictEqual(original.clave, "seguimiento-v2-media/u/a.png");
  ok("copia segv2 inactiva candidata y original protegido");
}

async function testSegv2NoEliminaSiNoCoincideOEstaActivo() {
  const activo = fuentesVacias();
  activo.entrantes = [
    fila("u", "c", "591", { direccion: "entrante", tipo: "reaction", creado_en: HACE_10_DIAS }),
  ];
  activo.medias = [
    fila("u", "c", "591", { imagen_url: `${URL}whatsapp/u/segv2/c/591/activa.png` }),
  ];
  activo.storage = {
    whatsapp: [{ name: "u", id: null }],
    "whatsapp/u": [{ name: "segv2", id: null }],
    "whatsapp/u/segv2": [{ name: "c", id: null }],
    "whatsapp/u/segv2/c": [{ name: "591", id: null }],
    "whatsapp/u/segv2/c/591": [{ name: "activa.png", id: "a", metadata: { size: 10 } }],
  };
  const reacción = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado: servicio.crearEstado(),
    io: crearIo(activo, [], []),
    informe: true,
    maxMs: 10000,
    maxPaginas: 80,
    pageSize: 10,
  });
  assert.strictEqual(reacción.candidatos, 0);
  assert.strictEqual(reacción.informe.objetos.find((objeto) => objeto.segv2).motivo, "hilo_activo");

  const cruzado = fuentesVacias();
  cruzado.entrantes = [
    fila("u", "c", "999", { direccion: "entrante", creado_en: HACE_40_DIAS }),
  ];
  cruzado.medias = [
    fila("u", "c", "999", { imagen_url: `${URL}whatsapp/u/segv2/c/591/abc.png` }),
  ];
  cruzado.storage = {
    whatsapp: [{ name: "u", id: null }],
    "whatsapp/u": [{ name: "segv2", id: null }],
    "whatsapp/u/segv2": [{ name: "c", id: null }],
    "whatsapp/u/segv2/c": [{ name: "591", id: null }],
    "whatsapp/u/segv2/c/591": [{ name: "abc.png", id: "z", metadata: { size: 20 } }],
  };
  const mal = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado: servicio.crearEstado(),
    io: crearIo(cruzado, [], []),
    informe: true,
    maxMs: 10000,
    maxPaginas: 80,
    pageSize: 10,
  });
  assert.strictEqual(mal.candidatos, 0);
  assert.strictEqual(mal.informe.objetos.find((objeto) => objeto.segv2).motivo, "ruta_no_coincide");
  assert.strictEqual(mal.informe.objetos.find((objeto) => objeto.segv2).categoria, "ambiguo");
  ok("reacción reciente protege y la ruta segv2 cruzada queda ambigua");
}

function ioRevalidacion(over) {
  return {
    async existeObjeto() {
      return true;
    },
    async leerMenciones() {
      return [fila("u", "c", "1", { imagen_url: `${URL}whatsapp/u/foto.jpg` })];
    },
    async leerUltimoEntrante() {
      return reglas.parseCreadoEnUtc(HACE_40_DIAS);
    },
    async tieneReferenciaProtegida() {
      return false;
    },
    ...over,
  };
}

async function testRevalidacion() {
  const clave = "archivos/whatsapp/u/foto.jpg";
  const limite = { ahora: AHORA };
  const reciente = await servicio.revalidarCandidato(clave, {
    ...limite,
    io: ioRevalidacion({
      async leerUltimoEntrante() {
        return reglas.parseCreadoEnUtc(HACE_10_DIAS);
      },
    }),
  });
  assert.strictEqual(reciente.motivo, "hilo_activo");
  assert.strictEqual(reciente.apto, false);

  const compartida = await servicio.revalidarCandidato(clave, {
    ...limite,
    io: ioRevalidacion({
      async leerMenciones() {
        return [
          fila("u", "c", "1", { imagen_url: `${URL}whatsapp/u/foto.jpg` }),
          fila("u", "c", "2", { imagen_url: `${URL}whatsapp/u/foto.jpg` }),
        ];
      },
    }),
  });
  assert.strictEqual(compartida.motivo, "compartida");
  assert.strictEqual(compartida.apto, false);

  const ajena = await servicio.revalidarCandidato(clave, {
    ...limite,
    io: ioRevalidacion({
      async leerMenciones() {
        return [fila("u", "c", "1", { imagen_url: `${URL}whatsapp/otro/foto.jpg` })];
      },
    }),
  });
  assert.strictEqual(ajena.motivo, "sin_referencia");

  const citada = await servicio.revalidarCandidato(clave, {
    ...limite,
    io: ioRevalidacion({
      async tieneReferenciaProtegida() {
        return true;
      },
    }),
  });
  assert.strictEqual(citada.motivo, "referenciada");

  const rota = await servicio.revalidarCandidato(clave, {
    ...limite,
    io: ioRevalidacion({
      async existeObjeto() {
        throw new Error("storage no respondió");
      },
    }),
  });
  assert.strictEqual(rota.motivo, "consulta_fallida");
  assert.strictEqual(rota.apto, false);

  let consultas = 0;
  const ioBloqueado = ioRevalidacion({
    async existeObjeto() {
      consultas += 1;
      return true;
    },
  });
  const original = await servicio.revalidarCandidato("seguimiento-v2-media/u/a.jpg", {
    ...limite,
    io: ioBloqueado,
  });
  const remarketing = await servicio.revalidarCandidato("rm24h-media/rm24h/test.jpg", {
    ...limite,
    io: ioBloqueado,
  });
  assert.strictEqual(original.motivo, "bucket_protegido");
  assert.strictEqual(remarketing.motivo, "bucket_protegido");
  assert.strictEqual(consultas, 0);
  ok("revalidación: entrante nuevo, ruta compartida, referencia, error y buckets");
}

async function testMediaFilenameProtege() {
  const datos = fixture();
  datos.seguimientos_v2 = [{ media_filename: "foto.jpg" }];
  const result = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado: servicio.crearEstado(),
    io: crearIo(datos, [], []),
    informe: true,
    maxMs: 10000,
    maxPaginas: 80,
    pageSize: 2,
  });
  assert.strictEqual(result.candidatos, 0);
  const foto = result.informe.objetos.find((objeto) => objeto.clave.endsWith("/foto.jpg"));
  assert.strictEqual(foto.motivo, "referenciada");
  ok("media_filename protege el archivo de la conversación");
}

function clienteLock(pasos) {
  const llamadas = [];
  async function correr(metodo, url, body) {
    llamadas.push({ metodo, url, body });
    const paso = pasos[metodo];
    if (paso instanceof Error) throw paso;
    if (typeof paso === "function") return paso(url, body);
    return paso;
  }
  return {
    llamadas,
    get: (url) => correr("get", url),
    patch: (url, body) => correr("patch", url, body),
    post: (url, body) => correr("post", url, body),
  };
}

const OPCION_LOCK = { url: "https://proj.supabase.co", key: "test-key", ahora: AHORA };

async function testCandado() {
  const lock = require("../services/limpiezaMedia/limpiezaMediaLock");
  const ausente = clienteLock({
    get: Object.assign(new Error("relation limpieza_media_lock does not exist"), {
      response: { status: 404, data: { code: "42P01", message: "relation limpieza_media_lock does not exist" } },
    }),
  });
  const tabla = await lock.adquirirLockLimpiezaMedia({ ...OPCION_LOCK, cliente: ausente });
  assert.strictEqual(tabla.acquired, false);
  assert.strictEqual(tabla.motivo, "lock_tabla_ausente");
  assert.strictEqual(ausente.llamadas.some((llamada) => llamada.metodo !== "get"), false);

  const ocupado = clienteLock({
    get: { data: [] },
    patch: { data: [] },
    post: Object.assign(new Error("duplicado"), { response: { status: 409, data: { code: "23505" } } }),
  });
  const tomado = await lock.adquirirLockLimpiezaMedia({ ...OPCION_LOCK, cliente: ocupado });
  assert.strictEqual(tomado.acquired, false);
  assert.strictEqual(tomado.motivo, "candado_ocupado");

  const perdido = await lock.renovarLockLimpiezaMedia("limpieza-dueno", {
    ...OPCION_LOCK,
    cliente: clienteLock({ patch: { data: [] } }),
  });
  assert.strictEqual(perdido.ok, false);
  assert.strictEqual(perdido.motivo, "candado_perdido");

  const dueno = "limpieza-dueno";
  const liberador = clienteLock({
    patch: (url, body) => ({ data: [{ locked_by: body.locked_by, locked_until: body.locked_until }] }),
  });
  const suelto = await lock.liberarLockLimpiezaMedia(dueno, { ...OPCION_LOCK, cliente: liberador });
  assert.strictEqual(suelto.ok, true);
  assert.ok(liberador.llamadas[0].url.includes(`locked_by=eq.${encodeURIComponent(dueno)}`));
  assert.strictEqual(liberador.llamadas[0].body.locked_by, null);
  assert.strictEqual(liberador.llamadas[0].body.locked_until, AHORA.toISOString());
  ok("candado: tabla ausente, ocupado, renovación perdida y liberación por propietario");
}

function memoriaLock(inicial) {
  let fila = { ...inicial };
  const llamadas = [];
  function coincide(url) {
    if (!url.includes("id=eq.global")) return false;
    const dueno = /locked_by=eq\.([^&]+)/.exec(url);
    if (dueno && fila.locked_by !== decodeURIComponent(dueno[1])) return false;
    const gt = /locked_until\.gt\.([^&)]+)/.exec(url);
    if (gt && !(Date.parse(fila.locked_until) > Date.parse(decodeURIComponent(gt[1])))) return false;
    const lte = /locked_until\.lte\.([^&)]+)/.exec(url);
    if (lte) {
      const limite = Date.parse(decodeURIComponent(lte[1]));
      const nulo = url.includes("locked_until.is.null") && fila.locked_until == null;
      if (!(nulo || Date.parse(fila.locked_until) <= limite)) return false;
    }
    return true;
  }
  return {
    llamadas,
    fila() {
      return fila;
    },
    async get(url) {
      llamadas.push({ metodo: "get", url });
      return { data: [{ id: fila.id }] };
    },
    async patch(url, body) {
      llamadas.push({ metodo: "patch", url, body });
      if (!coincide(url)) return { data: [] };
      fila = { ...fila, ...body };
      return { data: [{ ...fila }] };
    },
    async post() {
      const error = new Error("duplicado");
      error.response = { status: 409, data: { code: "23505" } };
      throw error;
    },
  };
}

async function testCandadoCarreraYMigracion() {
  const lock = require("../services/limpiezaMedia/limpiezaMediaLock");
  const dueno = "limpieza-dueno";
  const hasta = new Date(AHORA.getTime() + lock.TTL_MS).toISOString();
  const mem = memoriaLock({
    id: "global",
    locked_by: dueno,
    locked_until: hasta,
    updated_at: AHORA.toISOString(),
  });
  const opciones = { ...OPCION_LOCK, cliente: mem };

  const ajeno = await lock.renovarLockLimpiezaMedia("limpieza-otro", opciones);
  assert.strictEqual(ajeno.ok, false);
  assert.strictEqual(ajeno.motivo, "candado_perdido");
  assert.strictEqual(mem.fila().locked_by, dueno);
  assert.strictEqual(mem.fila().locked_until, hasta);

  const liberacionAjena = await lock.liberarLockLimpiezaMedia("limpieza-otro", opciones);
  assert.strictEqual(liberacionAjena.ok, false);
  assert.strictEqual(liberacionAjena.motivo, "candado_ajeno");
  assert.strictEqual(mem.fila().locked_by, dueno);

  const suelto = await lock.liberarLockLimpiezaMedia(dueno, opciones);
  assert.strictEqual(suelto.ok, true);
  assert.strictEqual(mem.fila().locked_by, null);
  assert.strictEqual(Date.parse(mem.fila().locked_until) <= AHORA.getTime(), true);

  const tardia = await lock.renovarLockLimpiezaMedia(dueno, opciones);
  assert.strictEqual(tardia.ok, false);
  assert.strictEqual(tardia.motivo, "candado_perdido");
  assert.strictEqual(mem.fila().locked_by, null);
  assert.ok(mem.llamadas.some((llamada) => llamada.metodo === "patch" && llamada.url.includes("locked_until=gt.")));

  const siguiente = await lock.adquirirLockLimpiezaMedia({
    ...opciones,
    workerId: "limpieza-nuevo",
  });
  assert.strictEqual(siguiente.acquired, true);
  assert.strictEqual(siguiente.workerId, "limpieza-nuevo");
  assert.strictEqual(mem.fila().locked_by, "limpieza-nuevo");
  assert.ok(Date.parse(mem.fila().locked_until) > AHORA.getTime());

  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/create_limpieza_media_lock.sql"),
    "utf8"
  );
  assert.ok(/enable row level security/i.test(sql));
  assert.ok(/grant select, insert, update on table public\.limpieza_media_lock to service_role/i.test(sql));
  assert.ok(/revoke all on table public\.limpieza_media_lock from anon/i.test(sql));
  assert.ok(/revoke all on table public\.limpieza_media_lock from authenticated/i.test(sql));
  assert.ok(!/create\s+policy/i.test(sql));
  assert.ok(!/grant\s+[^;]*\bdelete\b/i.test(sql));
  assert.ok(!/\bto\s+anon\b/i.test(sql));
  assert.ok(!/\bto\s+authenticated\b/i.test(sql));
  ok("candado: renovación tardía, dueño ajeno, liberación ajena, vencido y RLS");
}

function handlerLimpieza() {
  const router = require("../routes/internalCronApi");
  const layer = router.stack.find((item) => item.route && item.route.path === "/limpieza-media");
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function respuestaCron() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function testRutaUsaCandado() {
  const lock = require("../services/limpiezaMedia/limpiezaMediaLock");
  const originalAdquirir = lock.adquirirLockLimpiezaMedia;
  const originalLiberar = lock.liberarLockLimpiezaMedia;
  const handler = handlerLimpieza();
  let liberaciones = 0;
  lock.liberarLockLimpiezaMedia = async () => {
    liberaciones += 1;
    return { ok: true };
  };
  try {
    lock.adquirirLockLimpiezaMedia = async () => ({ acquired: false, motivo: "candado_ocupado" });
    const ocupado = respuestaCron();
    await handler({ body: {} }, ocupado);
    assert.strictEqual(ocupado.statusCode, 409);
    assert.strictEqual(ocupado.body.motivo, "candado_ocupado");

    lock.adquirirLockLimpiezaMedia = async () => ({ acquired: false, motivo: "lock_tabla_ausente" });
    const ausente = respuestaCron();
    await handler({ body: {} }, ausente);
    assert.strictEqual(ausente.statusCode, 503);
    assert.strictEqual(ausente.body.motivo, "lock_tabla_ausente");
    assert.strictEqual(liberaciones, 0);
    assert.ok(global.__limpiezaMediaCronRunning !== true);
  } finally {
    lock.adquirirLockLimpiezaMedia = originalAdquirir;
    lock.liberarLockLimpiezaMedia = originalLiberar;
    global.__limpiezaMediaCronRunning = false;
  }
  ok("la ruta manual no arranca si el candado está ocupado o la tabla no existe");
}

function testBarrerasYCron() {
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.throws(() => servicio.solicitarBorradoReal(), /bloqueada/);
  const cron = fs.readFileSync(
    path.join(__dirname, "../scripts/limpieza-media-cron.js"),
    "utf8"
  );
  const ruta = fs.readFileSync(
    path.join(__dirname, "../routes/internalCronApi.js"),
    "utf8"
  );
  assert.ok(cron.includes("ELIMINACION_REAL_BLOQUEADA"));
  assert.ok(cron.includes("solicitarBorradoReal()"));
  assert.ok(!cron.includes("axios.delete"));
  assert.ok(!cron.includes(".remove("));
  assert.ok(ruta.includes("adquirirLockLimpiezaMedia"));
  assert.ok(ruta.includes('eliminacionReal: "bloqueada"'));
  assert.ok(!ruta.includes("axios.delete"));
  ok("borrado real bloqueado en el cron y en la ruta manual");
}

function testRutaCron() {
  const router = require("../routes/internalCronApi");
  const paths = router.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
  assert.ok(paths.includes("/limpieza-media"));
  assert.ok(paths.includes("/rm24h"));
  ok("ruta de cron registrada");
}

async function main() {
  testReloj();
  testRutas();
  testClasificacion();
  testReferenciaDeConversacion();
  await testSimulacionCompleta();
  await testPausadaYReanudacion();
  await testProteccionesNuevas();
  testBloqueoDeBorrado();
  await testNoHayEscritura();
  await testCopiaSegv2();
  await testSegv2NoEliminaSiNoCoincideOEstaActivo();
  await testRevalidacion();
  await testMediaFilenameProtege();
  await testCandado();
  await testCandadoCarreraYMigracion();
  await testRutaUsaCandado();
  testBarrerasYCron();
  testRutaCron();
  console.log(`${passed} pruebas ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
