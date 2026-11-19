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

  const suelta = '{"nota":"whatsapp/u/nota.ogg"}';
  const meta = "whatsapp-meta/u/a.jpg";
  assert.ok(reglas.extraerRutasSueltas(suelta).includes("archivos/whatsapp/u/nota.ogg"));
  assert.strictEqual(reglas.citaRutaCompleta(suelta, "archivos/whatsapp/u/nota.ogg"), true);
  assert.ok(reglas.extraerRutasSueltas(meta).includes("archivos/whatsapp-meta/u/a.jpg"));
  assert.strictEqual(reglas.citaRutaCompleta(meta, "archivos/whatsapp-meta/u/a.jpg"), true);
  assert.deepStrictEqual(reglas.extraerRutasSueltas("xwhatsapp/u/nota.ogg"), []);
  const traversal = reglas.extraerRutasSueltas("whatsapp/u/../nota.ogg");
  assert.ok(!traversal.some((clave) => clave.includes("..")));
  assert.ok(!traversal.includes("archivos/whatsapp/u/nota.ogg"));
  const repetida = reglas.extraerRutasSueltas("whatsapp/u/nota.ogg y whatsapp/u/nota.ogg");
  assert.strictEqual(repetida.filter((clave) => clave === "archivos/whatsapp/u/nota.ogg").length, 1);
  assert.strictEqual(new Set(repetida).size, repetida.length);
  assert.ok(reglas.extraerRutasSueltas(`${URL}whatsapp/u/nota.ogg`).includes(claveNota));
  assert.strictEqual(reglas.citaRutaCompleta(`${URL}whatsapp/u/nota.ogg`, claveNota), true);
  ok("rutas públicas, firmadas, autenticadas y buckets ajenos");
}

function rutasValidasQueCitaReconoce(texto) {
  const src = String(texto || "");
  const claves = [];
  const vistos = new Set();
  for (const prefijo of ["whatsapp-meta/", "whatsapp/"]) {
    let desde = 0;
    while (desde < src.length) {
      const pos = src.indexOf(prefijo, desde);
      if (pos < 0) break;
      if (pos === 0 || /[^a-zA-Z0-9]/.test(src[pos - 1])) {
        for (let fin = pos + prefijo.length; fin <= src.length; fin += 1) {
          const despues = src[fin] || "";
          if (!despues || /[^a-zA-Z0-9]/.test(despues)) {
            const token = src.slice(pos, fin);
            const partes = token.split("/");
            const valida = !token.startsWith("/")
              && !token.includes("\\")
              && !token.includes("*")
              && !partes.some((parte) => parte === "" || parte === "." || parte === "..")
              && (token.startsWith("whatsapp/") || token.startsWith("whatsapp-meta/"));
            const clave = `archivos/${token}`;
            if (valida && reglas.citaRutaCompleta(src, clave) && !vistos.has(clave)) {
              vistos.add(clave);
              claves.push(clave);
            }
          }
          if (fin >= src.length || !/[a-zA-Z0-9._/-]/.test(src[fin])) break;
        }
      }
      desde = pos + 1;
    }
  }
  return claves;
}

function assertCubreCita(texto) {
  const extraidas = reglas.extraerRutasSueltas(texto);
  const conjunto = new Set(extraidas);
  assert.strictEqual(conjunto.size, extraidas.length, texto);
  for (const clave of extraidas) {
    assert.strictEqual(reglas.citaRutaCompleta(texto, clave), true, clave);
  }
  for (const clave of rutasValidasQueCitaReconoce(texto)) {
    assert.ok(conjunto.has(clave), `${clave} falta en ${texto}`);
  }
}

function testRutasSueltasCoincidenConCita() {
  const clave = "archivos/whatsapp/u/foto.jpg";
  const casos = [
    "whatsapp/u/foto.jpg",
    "whatsapp/u/foto.jpg/",
    "whatsapp/u/foto.jpg/otra",
    "whatsapp/u/foto.jpg_extra",
    "whatsapp/u/foto.jpg-extra",
    "whatsapp/u/foto.jpg.",
    '"whatsapp/u/foto.jpg"',
    "whatsapp/u/foto.jpg ",
    `${URL}whatsapp/u/foto.jpg`,
    `${URL}whatsapp/u/foto.jpg?token=1`,
  ];
  for (const texto of casos) {
    assert.ok(reglas.extraerRutasSueltas(texto).includes(clave), texto);
    assert.strictEqual(reglas.citaRutaCompleta(texto, clave), true, texto);
    assertCubreCita(texto);
  }
  assert.ok(reglas.extraerRutasSueltas("whatsapp/u/foto.jpg/otra").includes("archivos/whatsapp/u/foto.jpg/otra"));
  assert.ok(reglas.extraerRutasSueltas("whatsapp/u/foto.jpg_extra").includes("archivos/whatsapp/u/foto.jpg_extra"));
  assert.ok(reglas.extraerRutasSueltas("whatsapp/u/foto.jpg-extra").includes("archivos/whatsapp/u/foto.jpg-extra"));
  assert.deepStrictEqual(reglas.extraerRutasSueltas("xwhatsapp/u/foto.jpg"), []);
  assert.strictEqual(reglas.citaRutaCompleta("xwhatsapp/u/foto.jpg", clave), false);

  const varias = JSON.stringify({
    suelta: "whatsapp/u/foto.jpg",
    anidada: "whatsapp/u/foto.jpg/otra",
    meta: "whatsapp-meta/u/a.jpg",
    url: `${URL}whatsapp/u/foto.jpg`,
    falsa: "xwhatsapp/u/foto.jpg",
  });
  const extraidas = reglas.extraerRutasSueltas(varias);
  assert.strictEqual(extraidas.filter((item) => item === clave).length, 1);
  assert.ok(extraidas.includes("archivos/whatsapp/u/foto.jpg/otra"));
  assert.ok(extraidas.includes("archivos/whatsapp-meta/u/a.jpg"));
  assert.ok(!extraidas.some((item) => item.includes("xwhatsapp")));
  assert.strictEqual(new Set(extraidas).size, extraidas.length);
  assertCubreCita(varias);
  assert.strictEqual(reglas.DIAS_INACTIVIDAD, 30);
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  ok("cada ruta reconocida por cita queda protegida, también con barra o sufijo");
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
    async leerFuente({ fuente, offset, limit, despuesDeId, porId }) {
      llamadas.push(`fuente:${fuente}`);
      const filas = datos[fuente] || [];
      if (porId === true) {
        const ordenadas = filas
          .map((fila, indice) => {
            if (fila && fila.id != null && /^[0-9a-zA-Z-]+$/.test(String(fila.id))) return fila;
            return { ...fila, id: String(indice + 1).padStart(8, "0") };
          })
          .sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
        const siguientes = despuesDeId
          ? ordenadas.filter((fila) => String(fila.id) > String(despuesDeId))
          : ordenadas;
        return siguientes.slice(0, limit);
      }
      return filas.slice(offset, offset + limit);
    },
    async leerMensajes({ fase, offset, limit, despuesDeId }) {
      llamadas.push(`mensajes:${fase}`);
      const base = fase === "entrantes" ? datos.entrantes : datos.medias;
      const filas = base.map((fila, indice) => (
        fila && fila.id != null ? fila : { ...fila, id: String(indice + 1).padStart(8, "0") }
      ));
      if (despuesDeId != null || offset == null) {
        const siguientes = despuesDeId
          ? filas.filter((fila) => String(fila.id) > String(despuesDeId))
          : filas;
        return siguientes.slice(0, limit);
      }
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
  assert.strictEqual(posts.length, 2);
  assert.ok(src.includes("/storage/v1/object/list/archivos"));
  assert.ok(src.includes("/rest/v1/rpc/limpieza_flujo_cita_viva"));
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
  assert.strictEqual(rota.detalle.fase, "existencia_objeto");
  assert.strictEqual(rota.detalle.consulta, "storage.existencia");
  assert.strictEqual(rota.detalle.mensaje, "storage no respondió");
  assert.strictEqual(rota.detalle.status, null);
  assert.strictEqual(rota.detalle.codigo, null);

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

const OPCION_LOCK = {
  url: "https://proj.supabase.co",
  key: "test-key",
  ahora: AHORA,
  relojPostgres: AHORA,
};

async function testCandado() {
  const lock = require("../services/limpiezaMedia/limpiezaMediaLock");
  const ausente = clienteLock({
    post: Object.assign(new Error("relation limpieza_media_lock does not exist"), {
      response: { status: 404, data: { code: "42P01", message: "relation limpieza_media_lock does not exist" } },
    }),
  });
  const tabla = await lock.adquirirLockLimpiezaMedia({ ...OPCION_LOCK, cliente: ausente });
  assert.strictEqual(tabla.acquired, false);
  assert.strictEqual(tabla.motivo, "lock_tabla_ausente");
  assert.strictEqual(ausente.llamadas.every((llamada) => llamada.metodo === "post"), true);
  assert.ok(ausente.llamadas[0].url.includes("/rpc/limpieza_media_adquirir"));

  const ocupado = clienteLock({
    post: { data: { ok: false, motivo: "candado_ocupado", ahora: AHORA.toISOString() } },
  });
  const tomado = await lock.adquirirLockLimpiezaMedia({ ...OPCION_LOCK, cliente: ocupado });
  assert.strictEqual(tomado.acquired, false);
  assert.strictEqual(tomado.motivo, "candado_ocupado");
  assert.deepStrictEqual(Object.keys(ocupado.llamadas[0].body).sort(), ["p_ttl_seconds", "p_worker"]);

  const perdido = await lock.renovarLockLimpiezaMedia("limpieza-dueno", {
    ...OPCION_LOCK,
    cliente: clienteLock({
      post: { data: { ok: false, motivo: "candado_perdido", ahora: AHORA.toISOString() } },
    }),
  });
  assert.strictEqual(perdido.ok, false);
  assert.strictEqual(perdido.motivo, "candado_perdido");

  const dueno = "limpieza-dueno";
  const liberador = clienteLock({
    post: {
      data: {
        ok: true,
        motivo: "liberado",
        locked_by: null,
        locked_until: AHORA.toISOString(),
        ahora: AHORA.toISOString(),
      },
    },
  });
  const suelto = await lock.liberarLockLimpiezaMedia(dueno, { ...OPCION_LOCK, cliente: liberador });
  assert.strictEqual(suelto.ok, true);
  assert.ok(liberador.llamadas[0].url.includes("/rpc/limpieza_media_liberar"));
  assert.strictEqual(liberador.llamadas[0].body.p_worker, dueno);
  assert.strictEqual(liberador.llamadas.some((llamada) => llamada.metodo === "patch"), false);
  ok("candado: tabla ausente, ocupado, renovación perdida y liberación por propietario");
}

function memoriaLock(inicial, reloj = AHORA) {
  let fila = { ...inicial };
  const llamadas = [];
  function ahoraIso() {
    return new Date(reloj.getTime()).toISOString();
  }
  function vigente(instante) {
    return fila.locked_by != null && Number.isFinite(Date.parse(fila.locked_until)) && Date.parse(fila.locked_until) > instante;
  }
  function aplicar(nombre, body) {
    const worker = body?.p_worker;
    const ttl = Number(body?.p_ttl_seconds) * 1000;
    const instante = reloj.getTime();
    const ahora = ahoraIso();
    if (nombre === "limpieza_media_renovar") {
      if (fila.locked_by !== worker || !vigente(instante)) {
        return { ok: false, motivo: "candado_perdido", ahora, locked_by: fila.locked_by, locked_until: fila.locked_until };
      }
      const until = new Date(instante + ttl).toISOString();
      fila = { ...fila, locked_until: until, updated_at: ahora };
      return { ok: true, motivo: "renovado", ahora, locked_by: worker, locked_until: until };
    }
    if (nombre === "limpieza_media_liberar") {
      if (fila.locked_by !== worker) {
        return { ok: false, motivo: "candado_ajeno", ahora, locked_by: fila.locked_by, locked_until: fila.locked_until };
      }
      fila = { ...fila, locked_by: null, locked_until: ahora, updated_at: ahora };
      return { ok: true, motivo: "liberado", ahora, locked_by: null, locked_until: ahora };
    }
    if (nombre === "limpieza_media_verificar") {
      if (fila.locked_by !== worker || !vigente(instante)) {
        return { ok: false, motivo: "candado_perdido", ahora };
      }
      return { ok: true, motivo: "vigente", ahora, locked_by: worker, locked_until: fila.locked_until };
    }
    if (nombre === "limpieza_media_adquirir") {
      if (fila.locked_by === worker && vigente(instante)) {
        const until = new Date(instante + ttl).toISOString();
        fila = { ...fila, locked_until: until, updated_at: ahora };
        return { ok: true, motivo: "adquirido", ahora, locked_by: worker, locked_until: until };
      }
      if (fila.locked_by === worker) {
        return {
          ok: false,
          motivo: "candado_vencido_no_recuperable",
          ahora,
          locked_by: fila.locked_by,
          locked_until: fila.locked_until,
        };
      }
      if (vigente(instante)) {
        return { ok: false, motivo: "candado_ocupado", ahora, locked_by: fila.locked_by, locked_until: fila.locked_until };
      }
      const until = new Date(instante + ttl).toISOString();
      fila = { ...fila, locked_by: worker, locked_until: until, updated_at: ahora };
      return { ok: true, motivo: "adquirido", ahora, locked_by: worker, locked_until: until };
    }
    return { ok: false, motivo: "rpc_desconocida", ahora };
  }
  return {
    llamadas,
    fila() {
      return fila;
    },
    async post(url, body) {
      llamadas.push({ metodo: "post", url, body });
      const nombre = String(url).split("/rpc/")[1];
      return { data: aplicar(nombre, body) };
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
  assert.ok(mem.llamadas.some((llamada) => llamada.url.includes("/rpc/limpieza_media_renovar")));

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
  const relojSql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/limpieza_media_lock_reloj.sql"),
    "utf8"
  );
  assert.ok(relojSql.includes("clock_timestamp()"));
  assert.ok(relojSql.includes("locked_by = p_worker"));
  assert.ok(relojSql.includes("locked_until > v_now"));
  assert.ok(relojSql.includes("candado_vencido_no_recuperable"));
  assert.ok(/grant execute on function public\.limpieza_media_renovar\(text, integer\) to service_role/i.test(relojSql));
  assert.ok(/revoke all on function public\.limpieza_media_adquirir\(text, integer\) from anon/i.test(relojSql));
  assert.ok(!/delete\s+from\s+public\.mensajes/i.test(relojSql));
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
  assert.ok(cron.includes("validarInmediatoEliminacion"));
  assert.ok(cron.includes("eliminacionRealPermitida"));
  assert.ok(cron.includes("limpiezaMediaEliminar"));
  assert.ok(cron.includes("planificarEliminacion"));
  assert.ok(cron.includes("ejecutarBorradoSobrePlan"));
  const cuerpo = cron.slice(cron.indexOf("async function procesarCandidatoRevalidado"));
  assert.ok(cuerpo.indexOf("if (eliminacionSigueBloqueada())") < cuerpo.indexOf("planificarEliminacion"));
  assert.ok(cuerpo.indexOf("planificarEliminacion") < cuerpo.indexOf("ejecutarBorradoSobrePlan"));
  assert.ok(cron.includes('modo: "dry-run"'));
  assert.ok(!cron.includes("axios.delete"));
  assert.ok(!cron.includes(".remove("));
  assert.ok(!cron.includes("imagen_url"));
  assert.ok(!cron.includes("eliminarSoloObjetoStorage"));
  assert.ok(ruta.includes("adquirirLockLimpiezaMedia"));
  assert.ok(ruta.includes("eliminacionRealPermitida"));
  assert.ok(ruta.includes('eliminacionReal: "bloqueada"'));
  assert.ok(!ruta.includes("solicitarBorradoReal"));
  assert.ok(!ruta.includes("validarInmediatoEliminacion"));
  assert.ok(!ruta.includes("axios.delete"));
  assert.ok(!ruta.includes("eliminarSoloObjetoStorage"));
  assert.ok(!ruta.includes("limpiezaMediaEliminar"));
  assert.ok(!cron.includes("axios.delete"));
  assert.ok(cron.includes("progreso.jsonCursor"));
  assert.ok(cron.includes("omitirJson: true"));
  assert.ok(cron.includes("referenciasJson"));
  ok("borrado real bloqueado en el cron y en la ruta manual");
}

function testRutaCron() {
  const router = require("../routes/internalCronApi");
  const paths = router.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
  assert.ok(paths.includes("/limpieza-media"));
  assert.ok(paths.includes("/rm24h"));
  ok("ruta de cron registrada");
}

function testIlikeEscapado() {
  const filtro = reglas.filtroIlike(["imagen_url", "contenido"], "whatsapp/u/mi_foto%.jpg");
  assert.ok(filtro.includes(encodeURIComponent("mi\\_foto\\%.jpg")));
  assert.ok(!filtro.includes("mi_foto%.jpg"));
  assert.strictEqual(
    reglas.citaRutaCompleta("whatsapp/u/miXfoto.jpg", "archivos/whatsapp/u/mi_foto.jpg"),
    false
  );
  assert.strictEqual(
    reglas.citaRutaCompleta(
      "https://proj.supabase.co/storage/v1/object/public/archivos/whatsapp/u/mi_foto.jpg",
      "archivos/whatsapp/u/mi_foto.jpg"
    ),
    true
  );
  assert.strictEqual(reglas.paginaIlikeIncompleta([1, 2, 3, 4, 5], 5), true);
  assert.strictEqual(reglas.paginaIlikeIncompleta([1, 2], 5), false);
  ok("ilike escapa _ y % y una página llena no cuenta como completa");
}

function lectorReferencias(escenas) {
  const consultas = [];
  return {
    consultas,
    async leer(ruta) {
      consultas.push(ruta);
      const escena = escenas.find((item) => ruta.includes(item.incluye));
      return escena ? escena.filas : [];
    },
  };
}

async function testPaginaIlikeYNombreConGuionBajo() {
  const clave = "archivos/whatsapp/u/mi_foto.jpg";
  const lector = lectorReferencias([
    { incluye: "remarketing_global_24h", filas: Array.from({ length: 5 }, () => ({ mensaje_remarketing: "otro" })) },
  ]);
  await assert.rejects(
    () => servicio.tieneReferenciaProtegidaReal({ clave }, { leer: lector.leer }),
    /consulta truncada/
  );
  assert.ok(lector.consultas.some((ruta) => ruta.includes(encodeURIComponent("mi\\_foto.jpg"))));

  const veredicto = await servicio.revalidarCandidato(clave, {
    ahora: AHORA,
    protegidas: new Set(),
    io: ioRevalidacion({
      async leerMenciones() {
        return [fila("u", "c", "1", { imagen_url: `${URL}whatsapp/u/mi_foto.jpg` })];
      },
      async tieneReferenciaProtegida() {
        throw new Error("consulta truncada");
      },
    }),
  });
  assert.strictEqual(veredicto.motivo, "consulta_fallida");
  assert.strictEqual(veredicto.apto, false);
  assert.strictEqual(veredicto.detalle.fase, "referencias_protegidas");
  assert.strictEqual(veredicto.detalle.consulta, "referencias_protegidas");
  assert.strictEqual(veredicto.detalle.mensaje, "consulta truncada");

  const porTabla = await servicio.revalidarCandidato(clave, {
    ahora: AHORA,
    protegidas: new Set(),
    io: ioRevalidacion({
      async leerMenciones() {
        return [fila("u", "c", "1", { imagen_url: `${URL}whatsapp/u/mi_foto.jpg` })];
      },
      async tieneReferenciaProtegida(pedido) {
        return servicio.tieneReferenciaProtegidaReal(pedido, { leer: lector.leer });
      },
    }),
  });
  assert.strictEqual(porTabla.motivo, "consulta_fallida");
  assert.strictEqual(porTabla.detalle.fase, "referencias_protegidas");
  assert.strictEqual(porTabla.detalle.consulta, "remarketing_global_24h");
  assert.strictEqual(porTabla.detalle.mensaje, "consulta truncada");
  ok("página ilike llena y nombre con _ excluyen el archivo");
}

async function testJsonDespuesDeCargarProteccion() {
  const clave = "archivos/whatsapp/u/foto.jpg";
  const url = `${URL}whatsapp/u/foto.jpg`;
  const datos = fuentesVacias();
  datos.flujos_builder = [{ id: "b1", data: { url } }];
  const lecturas = [];
  const estado = servicio.crearEstado();
  const result = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado,
    io: crearIo(datos, [], lecturas),
    maxMs: 10000,
    maxPaginas: 80,
    pageSize: 2,
  });
  assert.strictEqual(result.completo, true);
  assert.ok(estado.referenciasJson.has(clave));
  const lecturasBuilder = lecturas.filter((item) => item === "fuente:flujos_builder").length;
  const lecturasLogs = lecturas.filter((item) => item === "fuente:seguimientos_v2_logs").length;
  assert.ok(lecturasBuilder >= 1);
  assert.ok(lecturasLogs >= 1);

  const tablasJson = new Set(servicio.FUENTES_JSON.map((item) => item.tabla));
  let relecturasJson = 0;
  const fresca = await servicio.cargarProteccion({
    io: {
      async leerFuente({ fuente }) {
        if (tablasJson.has(fuente)) relecturasJson += 1;
        return [];
      },
    },
    pageSize: 2,
    omitirJson: true,
    maxPaginas: 40,
  });
  for (const item of estado.referenciasJson) fresca.protegidas.add(item);
  assert.strictEqual(relecturasJson, 0);
  assert.strictEqual(fresca.proteccionIncompleta, false);
  assert.ok(fresca.protegidas.has(clave));

  let consultasJson = 0;
  const veredicto = await servicio.revalidarCandidato(clave, {
    ahora: AHORA,
    protegidas: fresca.protegidas,
    io: ioRevalidacion({
      async tieneReferenciaProtegida(pedido) {
        return servicio.tieneReferenciaProtegidaReal(pedido, {
          leer(ruta) {
            const texto = String(ruta);
            if (texto.includes("flujos_builder") || texto.includes("seguimientos_v2_logs")) {
              consultasJson += 1;
            }
            return [];
          },
        });
      },
    }),
  });
  assert.strictEqual(veredicto.motivo, "referenciada");
  assert.strictEqual(veredicto.apto, false);
  assert.strictEqual(consultasJson, 0);
  assert.strictEqual(lecturas.filter((item) => item === "fuente:flujos_builder").length, lecturasBuilder);
  assert.strictEqual(lecturas.filter((item) => item === "fuente:seguimientos_v2_logs").length, lecturasLogs);
  ok("una referencia JSON se reutiliza sin volver a leer la fuente");
}

function ioJson(leerFuente) {
  return {
    leerFuente,
    async leerMensajes() {
      return [];
    },
    async listarStorage() {
      return [];
    },
  };
}

async function testPaginacionJsonUnaVez() {
  assert.strictEqual(reglas.DIAS_INACTIVIDAD, 30);
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);

  const datos = fuentesVacias();
  datos.flujos_builder = [1, 2, 3, 4, 5].map((n) => ({
    id: String(n).padStart(4, "0"),
    data: n === 5 ? { nota: "whatsapp/u/ultima.jpg" } : {},
  }));
  const estadoCorto = servicio.crearEstado();
  const ioCorto = crearIo(datos, [], []);
  const opcionesCortas = {
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado: estadoCorto,
    io: ioCorto,
    maxMs: 10000,
    maxPaginas: 1,
    pageSize: 2,
  };
  const primero = await servicio.ejecutarLimpiezaMedia(opcionesCortas);
  const marca = (resultado, progreso) => [
    resultado.fase,
    progreso.fuenteIndex,
    progreso.offset,
    progreso.jsonCursor || "",
    progreso.carpetaIndex,
    progreso.listadoOffset,
    resultado.paginasEnEstaPasada,
  ].join(":");
  const marca1 = marca(primero, estadoCorto);
  const cursor1 = estadoCorto.jsonCursor;
  const segundo = await servicio.ejecutarLimpiezaMedia(opcionesCortas);
  const marca2 = marca(segundo, estadoCorto);
  assert.notStrictEqual(marca1, marca2);
  assert.ok(cursor1);
  assert.ok(String(estadoCorto.jsonCursor) > String(cursor1));
  let actual = segundo;
  for (let i = 0; i < 40 && !actual.completo; i += 1) {
    actual = await servicio.ejecutarLimpiezaMedia(opcionesCortas);
  }
  assert.strictEqual(actual.completo, true);
  assert.strictEqual(actual.proteccionIncompleta, false);
  assert.ok(estadoCorto.referenciasJson.has("archivos/whatsapp/u/ultima.jpg"));
  assert.strictEqual(
    reglas.citaRutaCompleta('{"nota":"whatsapp/u/ultima.jpg"}', "archivos/whatsapp/u/ultima.jpg"),
    true
  );

  const TOTAL = 399793;
  const LIMITE = 500;
  const desdeUrl = "archivos/whatsapp/u/desde-url.jpg";
  const suelta = "archivos/whatsapp/u/solo-suelta.jpg";
  const meta = "archivos/whatsapp-meta/u/meta.jpg";
  const masAlla = "archivos/whatsapp/u/mas-alla.jpg";
  const repeticionesSuelta = { n: 0 };
  let lecturasLogs = 0;
  const estado = servicio.crearEstado();
  const result = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado,
    io: ioJson(async ({ fuente, limit, despuesDeId, porId }) => {
      if (fuente !== "seguimientos_v2_logs") return [];
      assert.strictEqual(porId, true);
      assert.strictEqual(limit, LIMITE);
      lecturasLogs += 1;
      const inicio = despuesDeId ? Number(despuesDeId) + 1 : 1;
      const filas = [];
      for (let n = inicio; n <= TOTAL && filas.length < limit; n += 1) {
        const id = String(n).padStart(6, "0");
        let detalle = {};
        if (n === 1 || n === 2) detalle = { url: `${URL}whatsapp/u/desde-url.jpg` };
        if (n === 3 || n === 4) {
          detalle = { nota: "whatsapp/u/solo-suelta.jpg" };
          repeticionesSuelta.n += 1;
        }
        if (n === 5) detalle = { nota: "xwhatsapp/u/no.jpg" };
        if (n === 6) detalle = { nota: "whatsapp-meta/u/meta.jpg" };
        if (n === TOTAL) detalle = { nota: "whatsapp/u/mas-alla.jpg" };
        filas.push({ id, detalle });
      }
      return filas;
    }),
    maxMs: 60000,
    maxPaginas: 2000,
    pageSize: LIMITE,
  });
  assert.strictEqual(result.completo, true);
  assert.strictEqual(result.proteccionIncompleta, false);
  assert.strictEqual(lecturasLogs, 800);
  assert.ok(lecturasLogs > 200);
  assert.strictEqual(repeticionesSuelta.n, 2);
  assert.ok(estado.referenciasJson.has(desdeUrl));
  assert.ok(estado.referenciasJson.has(suelta));
  assert.ok(estado.referenciasJson.has(meta));
  assert.ok(estado.referenciasJson.has(masAlla));
  assert.ok(!estado.referenciasJson.has("archivos/whatsapp/u/no.jpg"));
  assert.strictEqual([...estado.referenciasJson].filter((clave) => clave === suelta).length, 1);
  assert.strictEqual([...estado.referenciasJson].filter((clave) => clave === desdeUrl).length, 1);
  assert.strictEqual(reglas.citaRutaCompleta(`${URL}whatsapp/u/desde-url.jpg`, desdeUrl), true);
  assert.strictEqual(reglas.citaRutaCompleta("whatsapp/u/solo-suelta.jpg", suelta), true);
  assert.strictEqual(reglas.citaRutaCompleta("whatsapp/u/mas-alla.jpg", masAlla), true);
  ok("más de 399792 registros, rutas sueltas, urls y duplicados");

  const tablasJson = new Set(servicio.FUENTES_JSON.map((item) => item.tabla));
  let relecturasJson = 0;
  const fresca = await servicio.cargarProteccion({
    io: {
      async leerFuente({ fuente }) {
        if (tablasJson.has(fuente)) relecturasJson += 1;
        return [];
      },
    },
    pageSize: LIMITE,
    omitirJson: true,
    maxPaginas: 40,
  });
  for (const clave of estado.referenciasJson) fresca.protegidas.add(clave);
  assert.strictEqual(relecturasJson, 0);
  assert.ok(fresca.protegidas.has(masAlla));

  let consultasLogs = 0;
  async function leerSinLogs(ruta) {
    if (String(ruta).includes("seguimientos_v2_logs")) consultasLogs += 1;
    return [];
  }
  function ioCandidato(clave) {
    return ioRevalidacion({
      async leerMenciones() {
        return [fila("u", "c", "1", { imagen_url: `${URL}${reglas.sinBucket(clave)}` })];
      },
      async tieneReferenciaProtegida(pedido) {
        return servicio.tieneReferenciaProtegidaReal(pedido, { leer: leerSinLogs });
      },
    });
  }
  const protegida = await servicio.revalidarCandidato(masAlla, {
    ahora: AHORA,
    protegidas: fresca.protegidas,
    io: ioCandidato(masAlla),
  });
  const repetida = await servicio.revalidarCandidato(desdeUrl, {
    ahora: AHORA,
    protegidas: fresca.protegidas,
    io: ioCandidato(desdeUrl),
  });
  const libre = await servicio.revalidarCandidato("archivos/whatsapp/u/libre.jpg", {
    ahora: AHORA,
    protegidas: fresca.protegidas,
    io: ioCandidato("archivos/whatsapp/u/libre.jpg"),
  });
  assert.strictEqual(protegida.motivo, "referenciada");
  assert.strictEqual(protegida.apto, false);
  assert.strictEqual(repetida.motivo, "referenciada");
  assert.strictEqual(libre.motivo, "candidato");
  assert.strictEqual(libre.apto, true);
  assert.strictEqual(consultasLogs, 0);
  assert.strictEqual(lecturasLogs, 800);
  ok("una ruta suelta exclusiva protege el archivo sin releer el json");

  const llamadasError = [];
  const error = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado: servicio.crearEstado(),
    io: ioJson(async ({ fuente, porId }) => {
      llamadasError.push(fuente);
      if (fuente !== "seguimientos_v2_logs") return [];
      assert.strictEqual(porId, true);
      const previas = llamadasError.filter((item) => item === fuente).length;
      if (previas === 1) {
        return [
          { id: "a1", detalle: { nota: "whatsapp/u/antes.jpg" } },
          { id: "a2", detalle: {} },
        ];
      }
      throw new Error("fallo de red a mitad de pagina");
    }),
    maxMs: 10000,
    maxPaginas: 80,
    pageSize: 2,
  });
  assert.strictEqual(error.completo, false);
  assert.strictEqual(error.proteccionIncompleta, true);
  assert.strictEqual(error.fuenteIlegible, "seguimientos_v2_logs");
  assert.strictEqual(error.fase, "listo");
  assert.strictEqual(error.candidatos, 0);
  assert.ok(!llamadasError.includes("crm_historial_cliente"));
  ok("un error a mitad de la paginación detiene la limpieza");

  const llamadasIncompleta = [];
  const incompleta = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado: servicio.crearEstado(),
    io: ioJson(async ({ fuente }) => {
      llamadasIncompleta.push(fuente);
      if (fuente !== "seguimientos_v2_logs") return [];
      const previas = llamadasIncompleta.filter((item) => item === fuente).length;
      if (previas === 1) {
        return [
          { id: "b1", detalle: { nota: "whatsapp/u/previa.jpg" } },
          { id: "b2", detalle: {} },
        ];
      }
      return [null];
    }),
    maxMs: 10000,
    maxPaginas: 80,
    pageSize: 2,
  });
  assert.strictEqual(incompleta.completo, false);
  assert.strictEqual(incompleta.proteccionIncompleta, true);
  assert.strictEqual(incompleta.fuenteIlegible, "seguimientos_v2_logs");
  assert.strictEqual(incompleta.candidatos, 0);
  assert.ok(!llamadasIncompleta.includes("crm_historial_cliente"));
  ok("una página final incompleta detiene la limpieza");

  const axios = require("axios");
  const getOriginal = axios.get;
  const urlPrevia = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = "https://example.test";
  let lecturasReales = 0;
  axios.get = async (ruta) => {
    lecturasReales += 1;
    if (String(ruta).includes("/rest/v1/flujos_builder?")) {
      return { data: { inesperado: true } };
    }
    return { data: [] };
  };
  try {
    const cuerpo = await servicio.ejecutarLimpiezaMedia({
      env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
      ahora: AHORA,
      estado: servicio.crearEstado(),
      maxMs: 10000,
      maxPaginas: 5,
      pageSize: 2,
    });
    assert.strictEqual(cuerpo.completo, false);
    assert.strictEqual(cuerpo.proteccionIncompleta, true);
    assert.strictEqual(cuerpo.fuenteIlegible, "flujos_builder");
    assert.strictEqual(cuerpo.candidatos, 0);
    assert.strictEqual(lecturasReales, 1);
  } finally {
    axios.get = getOriginal;
    if (urlPrevia == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = urlPrevia;
  }
  ok("un cuerpo que no es una página detiene la limpieza");
}

async function testEntranteEntreValidacionYBorrado() {
  let lecturas = 0;
  let borrados = 0;
  const io = ioRevalidacion({
    async leerUltimoEntrante() {
      lecturas += 1;
      return lecturas === 1
        ? reglas.parseCreadoEnUtc(HACE_40_DIAS)
        : reglas.parseCreadoEnUtc(HACE_10_DIAS);
    },
    async candadoVigente() {
      return { ok: true };
    },
    async borrar() {
      borrados += 1;
    },
  });
  const primero = await servicio.revalidarCandidato("archivos/whatsapp/u/foto.jpg", {
    ahora: AHORA,
    io,
  });
  const ultimo = await servicio.validarInmediatoEliminacion("archivos/whatsapp/u/foto.jpg", {
    ahora: AHORA,
    workerId: "limpieza-worker",
    io,
  });
  assert.strictEqual(primero.apto, true);
  assert.strictEqual(ultimo.motivo, "hilo_activo");
  assert.strictEqual(ultimo.apto, false);
  assert.strictEqual(ultimo.abortar, false);
  assert.strictEqual(borrados, 0);
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  ok("un entrante entre la validación y el borrado excluye el archivo");
}

async function testCandadoPerdidoDuranteRevalidacion() {
  let borrados = 0;
  const io = ioRevalidacion({
    async candadoVigente() {
      return { ok: false, motivo: "candado_perdido" };
    },
    async borrar() {
      borrados += 1;
    },
  });
  const veredicto = await servicio.validarInmediatoEliminacion("archivos/whatsapp/u/foto.jpg", {
    ahora: AHORA,
    workerId: "limpieza-worker",
    io,
  });
  assert.strictEqual(veredicto.apto, false);
  assert.strictEqual(veredicto.abortar, true);
  assert.strictEqual(veredicto.motivo, "candado_perdido");
  assert.strictEqual(borrados, 0);

  const sinWorker = await servicio.validarInmediatoEliminacion("archivos/whatsapp/u/foto.jpg", {
    ahora: AHORA,
    io: ioRevalidacion({
      async candadoVigente() {
        return { ok: true };
      },
    }),
  });
  assert.strictEqual(sinWorker.abortar, true);
  ok("perder el candado durante la revalidación aborta y no borra");
}

function testRutaSegv2Ambigua() {
  const limite = reglas.limiteInactividadMs(AHORA, 30);
  const clave = "archivos/whatsapp/u/segv2/c/591/extra/abc.png";
  const uso = { hilos: new Set(["u|c|591"]), usuarios: new Set(["u"]), incompleto: false };
  const hilos = new Map([["u|c|591", { ultimoEntranteMs: reglas.parseCreadoEnUtc(HACE_40_DIAS) }]]);
  assert.strictEqual(
    reglas.motivoConRuta(uso, hilos, new Set(), limite, clave),
    "ruta_segv2_irregular"
  );
  const veredicto = reglas.veredictoRevalidacion({
    clave,
    existe: true,
    menciones: [fila("u", "c", "591", { imagen_url: `${URL}whatsapp/u/segv2/c/591/extra/abc.png` })],
    ultimoEntranteMs: reglas.parseCreadoEnUtc(HACE_40_DIAS),
    citada: false,
    error: null,
    protegidas: new Set(),
    nombresProtegidos: new Set(),
    limiteMs: limite,
  });
  assert.strictEqual(veredicto.motivo, "ruta_segv2_irregular");
  assert.strictEqual(veredicto.apto, false);
  ok("una ruta segv2 de siete segmentos queda ambigua");
}

async function testArchivoSubidoSinMensaje() {
  const datos = fuentesVacias();
  datos.entrantes = [
    fila("u", "c", "591", { direccion: "entrante", creado_en: HACE_40_DIAS }),
  ];
  datos.storage = {
    whatsapp: [{ name: "u", id: null }],
    "whatsapp/u": [{ name: "segv2", id: null }],
    "whatsapp/u/segv2": [{ name: "c", id: null }],
    "whatsapp/u/segv2/c": [{ name: "591", id: null }],
    "whatsapp/u/segv2/c/591": [{ name: "nuevo.png", id: "z", metadata: { size: 40 } }],
  };
  const result = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true", ELIMINACION_REAL: "true" },
    ahora: AHORA,
    estado: servicio.crearEstado(),
    io: crearIo(datos, [], []),
    informe: true,
    maxMs: 10000,
    maxPaginas: 80,
    pageSize: 10,
  });
  assert.strictEqual(result.candidatos, 0);
  assert.strictEqual(result.eliminacionReal, "bloqueada");
  const copia = result.informe.objetos.find((objeto) => objeto.clave.endsWith("/nuevo.png"));
  assert.strictEqual(copia.motivo, "sin_referencia");
  assert.strictEqual(copia.categoria, "ambiguo");

  const suelto = await servicio.revalidarCandidato(
    "archivos/whatsapp/u/segv2/c/591/nuevo.png",
    {
      ahora: AHORA,
      io: ioRevalidacion({
        async leerMenciones() {
          return [];
        },
      }),
    }
  );
  assert.strictEqual(suelto.motivo, "sin_referencia");
  assert.strictEqual(suelto.apto, false);
  ok("un archivo subido sin mensaje registrado no se elimina");
}

async function testEndpointManualNoBorra() {
  const lock = require("../services/limpiezaMedia/limpiezaMediaLock");
  const originalAdquirir = lock.adquirirLockLimpiezaMedia;
  const originalLiberar = lock.liberarLockLimpiezaMedia;
  const originalEjecutar = servicio.ejecutarLimpiezaMedia;
  const originalFlag = servicio.ELIMINACION_REAL_BLOQUEADA;
  const handler = handlerLimpieza();
  const entorno = {
    ELIMINACION_REAL: process.env.ELIMINACION_REAL,
    LIMPIEZA_MEDIA_BORRAR: process.env.LIMPIEZA_MEDIA_BORRAR,
  };
  let ejecuciones = 0;
  let adquisiciones = 0;
  try {
    process.env.ELIMINACION_REAL = "true";
    process.env.LIMPIEZA_MEDIA_BORRAR = "true";
    assert.strictEqual(servicio.eliminacionRealPermitida(), false);
    assert.throws(() => servicio.solicitarBorradoReal(), /bloqueada/);

    servicio.ELIMINACION_REAL_BLOQUEADA = false;
    lock.adquirirLockLimpiezaMedia = async () => {
      adquisiciones += 1;
      return { acquired: true, workerId: "no-debe" };
    };
    const bloqueado = respuestaCron();
    await handler({ body: { eliminar: true } }, bloqueado);
    assert.strictEqual(bloqueado.statusCode, 403);
    assert.strictEqual(bloqueado.body.eliminacionReal, "bloqueada");
    assert.strictEqual(adquisiciones, 0);

    servicio.ELIMINACION_REAL_BLOQUEADA = true;
    servicio.ejecutarLimpiezaMedia = async () => {
      ejecuciones += 1;
      return { modo: "simulacion", eliminacionReal: "bloqueada", completo: false };
    };
    lock.adquirirLockLimpiezaMedia = async () => ({ acquired: true, workerId: "limpieza-manual" });
    lock.liberarLockLimpiezaMedia = async () => ({ ok: true });
    const simulado = respuestaCron();
    await handler({ body: { eliminar: true } }, simulado);
    assert.strictEqual(simulado.statusCode, 200);
    assert.strictEqual(simulado.body.modo, "dry-run");
    assert.strictEqual(simulado.body.eliminacionReal, "bloqueada");
    assert.strictEqual(ejecuciones, 1);
    assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  } finally {
    servicio.ELIMINACION_REAL_BLOQUEADA = originalFlag;
    servicio.ejecutarLimpiezaMedia = originalEjecutar;
    lock.adquirirLockLimpiezaMedia = originalAdquirir;
    lock.liberarLockLimpiezaMedia = originalLiberar;
    global.__limpiezaMediaCronRunning = false;
    if (entorno.ELIMINACION_REAL == null) delete process.env.ELIMINACION_REAL;
    else process.env.ELIMINACION_REAL = entorno.ELIMINACION_REAL;
    if (entorno.LIMPIEZA_MEDIA_BORRAR == null) delete process.env.LIMPIEZA_MEDIA_BORRAR;
    else process.env.LIMPIEZA_MEDIA_BORRAR = entorno.LIMPIEZA_MEDIA_BORRAR;
  }
  ok("el endpoint manual sigue en simulación aunque cambie el entorno");
}

async function testCandadoUsaRelojPostgres() {
  const lock = require("../services/limpiezaMedia/limpiezaMediaLock");
  const futuro = new Date(AHORA.getTime() + 24 * 60 * 60 * 1000);
  const dueno = "limpieza-dueno";
  const vigente = memoriaLock({
    id: "global",
    locked_by: dueno,
    locked_until: new Date(AHORA.getTime() + 60 * 1000).toISOString(),
    updated_at: AHORA.toISOString(),
  });
  const renovado = await lock.renovarLockLimpiezaMedia(dueno, {
    ...OPCION_LOCK,
    ahora: futuro,
    cliente: vigente,
  });
  assert.strictEqual(renovado.ok, true);
  assert.ok(vigente.llamadas.some((llamada) => llamada.url.includes("/rpc/limpieza_media_renovar")));
  assert.ok(!JSON.stringify(vigente.llamadas[0].body).includes(futuro.toISOString()));

  const vencidoHasta = new Date(AHORA.getTime() - 1000).toISOString();
  const vencido = memoriaLock({
    id: "global",
    locked_by: dueno,
    locked_until: vencidoHasta,
    updated_at: AHORA.toISOString(),
  });
  const trampa = await lock.renovarLockLimpiezaMedia(dueno, {
    ...OPCION_LOCK,
    ahora: futuro,
    cliente: vencido,
  });
  assert.strictEqual(trampa.ok, false);
  assert.strictEqual(trampa.motivo, "candado_perdido");
  assert.strictEqual(vencido.fila().locked_until, vencidoHasta);
  assert.strictEqual(vencido.fila().locked_by, dueno);
  assert.strictEqual(vencido.llamadas.some((llamada) => llamada.metodo === "patch"), false);

  const ajeno = memoriaLock({
    id: "global",
    locked_by: dueno,
    locked_until: new Date(AHORA.getTime() + 10 * 60 * 1000).toISOString(),
    updated_at: AHORA.toISOString(),
  });
  const robo = await lock.adquirirLockLimpiezaMedia({
    ...OPCION_LOCK,
    ahora: futuro,
    cliente: ajeno,
    workerId: "limpieza-ladron",
  });
  assert.strictEqual(robo.acquired, false);
  assert.strictEqual(robo.motivo, "candado_ocupado");
  assert.strictEqual(ajeno.fila().locked_by, dueno);

  const recuperacion = await lock.adquirirLockLimpiezaMedia({
    ...OPCION_LOCK,
    ahora: futuro,
    cliente: vencido,
    workerId: dueno,
  });
  assert.strictEqual(recuperacion.acquired, false);
  assert.strictEqual(recuperacion.motivo, "candado_vencido_no_recuperable");
  assert.strictEqual(vencido.fila().locked_by, dueno);
  assert.strictEqual(vencido.fila().locked_until, vencidoHasta);

  const sinReloj = clienteLock({
    post: { data: { ok: true, locked_by: "limpieza-sin-reloj" } },
  });
  const sinHora = await lock.adquirirLockLimpiezaMedia({
    url: OPCION_LOCK.url,
    key: OPCION_LOCK.key,
    cliente: sinReloj,
    workerId: "limpieza-sin-reloj",
  });
  assert.strictEqual(sinHora.acquired, false);
  assert.strictEqual(sinHora.motivo, "reloj_postgres_ausente");
  assert.strictEqual(sinReloj.llamadas.some((llamada) => llamada.metodo === "patch"), false);
  ok("el candado vigente se decide con now de Postgres y un worker atrasado no renueva");
}

function vallaDePrueba({ entrante, bloqueaInsertos = true, lecturas }) {
  let n = 0;
  let espera = false;
  const valores = lecturas || [entrante, entrante, entrante, entrante];
  const valla = {
    bloqueaInsertos,
    sesionAbierta: true,
    entranteObservadoMs: entrante,
    async leerUltimoEntrante() {
      const valor = valores[Math.min(n, valores.length - 1)];
      n += 1;
      return valor;
    },
    async hayEspera() {
      return espera;
    },
    marcarEspera() {
      espera = true;
    },
    async cerrar() {
      valla.sesionAbierta = false;
    },
  };
  return valla;
}

function planCandidato(valla) {
  return { eliminar: true, motivo: "candidato", valla, entranteMs: valla.entranteObservadoMs };
}

async function testEntranteDuranteYAntesDeEliminar() {
  const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
  const clave = "archivos/whatsapp/u/foto.jpg";
  const enCurso = vallaDePrueba({ entrante: reglas.parseCreadoEnUtc(HACE_40_DIAS) });
  enCurso.marcarEspera();
  let borrados = 0;
  const durante = await eliminar.planificarEliminacion(clave, {
    validar: async () => ({ apto: true, abortar: false, motivo: "candidato" }),
    abrirValla: async () => enCurso,
    borrarObjeto: async () => {
      borrados += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(durante.eliminar, false);
  assert.strictEqual(durante.motivo, "entrante_en_curso");
  assert.strictEqual(borrados, 0);

  const inmediato = vallaDePrueba({
    entrante: reglas.parseCreadoEnUtc(HACE_40_DIAS),
    lecturas: [reglas.parseCreadoEnUtc(HACE_40_DIAS), reglas.parseCreadoEnUtc(HACE_10_DIAS)],
  });
  const antes = await eliminar.planificarEliminacion(clave, {
    validar: async () => ({ apto: true, abortar: false, motivo: "candidato" }),
    abrirValla: async () => inmediato,
  });
  assert.strictEqual(antes.eliminar, false);
  assert.strictEqual(antes.motivo, "entrante_inmediato");
  assert.strictEqual(inmediato.sesionAbierta, false);

  const valla = vallaDePrueba({ entrante: reglas.parseCreadoEnUtc(HACE_40_DIAS) });
  const plan = planCandidato(valla);
  let restaurado = 0;
  const corrido = await eliminar.ejecutarBorradoSobrePlan(plan, clave, {
    async borrarObjeto() {
      valla.marcarEspera();
      return { eliminado: true, status: 200 };
    },
    async restaurarObjeto() {
      restaurado += 1;
      return { ok: true };
    },
  });
  assert.strictEqual(corrido.eliminado, false);
  assert.strictEqual(corrido.motivo, "proteccion_con_vencimiento");
  assert.strictEqual(corrido.storage, false);
  assert.strictEqual(restaurado, 0);
  assert.strictEqual(valla.sesionAbierta, false);
  ok("un entrante durante la valla o justo antes del borrado protege el archivo");
}

async function testCasosDePlanYBorradoBloqueado() {
  const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
  const antiguo = reglas.parseCreadoEnUtc(HACE_40_DIAS);
  const clave = "archivos/whatsapp/u/foto.jpg";
  const opcionesBase = {
    ahora: AHORA,
    protegidas: new Set(),
    workerId: "limpieza-plan",
    abrirValla: async () => vallaDePrueba({ entrante: antiguo }),
  };

  const perdido = await eliminar.planificarEliminacion(clave, {
    ...opcionesBase,
    io: ioRevalidacion({
      async candadoVigente() {
        return { ok: false, motivo: "candado_perdido" };
      },
    }),
  });
  assert.strictEqual(perdido.eliminar, false);
  assert.strictEqual(perdido.abortar, true);
  assert.strictEqual(perdido.motivo, "candado_perdido");

  const citada = await eliminar.planificarEliminacion(clave, {
    ...opcionesBase,
    io: ioRevalidacion({
      async tieneReferenciaProtegida() {
        return true;
      },
      async candadoVigente() {
        return { ok: true };
      },
    }),
  });
  assert.strictEqual(citada.motivo, "referenciada");
  assert.strictEqual(citada.eliminar, false);

  const compartida = await eliminar.planificarEliminacion(clave, {
    ...opcionesBase,
    io: ioRevalidacion({
      async leerMenciones() {
        return [
          fila("u", "c", "1", { imagen_url: `${URL}whatsapp/u/foto.jpg` }),
          fila("u", "c", "2", { imagen_url: `${URL}whatsapp/u/foto.jpg` }),
        ];
      },
      async candadoVigente() {
        return { ok: true };
      },
    }),
  });
  assert.strictEqual(compartida.motivo, "compartida");

  const plantilla = await eliminar.planificarEliminacion(
    "seguimiento-v2-media/u/plantilla.png",
    {
      ...opcionesBase,
      io: ioRevalidacion({
        async candadoVigente() {
          return { ok: true };
        },
      }),
    }
  );
  assert.strictEqual(plantilla.motivo, "bucket_protegido");
  assert.strictEqual(eliminar.destinoStorage("seguimiento-v2-media/u/plantilla.png"), null);
  assert.strictEqual(eliminar.destinoStorage("rm24h-media/rm24h/test.jpg"), null);

  const huerfano = await eliminar.planificarEliminacion(clave, {
    ...opcionesBase,
    io: ioRevalidacion({
      async leerMenciones() {
        return [];
      },
      async candadoVigente() {
        return { ok: true };
      },
    }),
  });
  assert.strictEqual(huerfano.motivo, "sin_referencia");

  const copia = "archivos/whatsapp/u/segv2/c/59170000000/nota.jpg";
  const copiaPlan = await eliminar.planificarEliminacion(copia, {
    ahora: AHORA,
    protegidas: new Set(),
    workerId: "limpieza-plan",
    io: ioRevalidacion({
      async leerMenciones() {
        return [fila("u", "c", "59170000000", { imagen_url: `${URL}whatsapp/u/segv2/c/59170000000/nota.jpg` })];
      },
      async candadoVigente() {
        return { ok: true };
      },
    }),
  });
  assert.strictEqual(copiaPlan.eliminar, false);
  assert.strictEqual(copiaPlan.motivo, "intervalo_no_garantizado");

  const copiaLista = await eliminar.planificarEliminacion(copia, {
    ...opcionesBase,
    io: ioRevalidacion({
      async leerMenciones() {
        return [fila("u", "c", "59170000000", { imagen_url: `${URL}whatsapp/u/segv2/c/59170000000/nota.jpg` })];
      },
      async candadoVigente() {
        return { ok: true };
      },
    }),
  });
  assert.strictEqual(copiaLista.eliminar, false);
  assert.strictEqual(copiaLista.motivo, "proteccion_con_vencimiento");

  const ambigua = eliminar.solicitudBorradoStorage(
    "archivos/whatsapp/u/segv2/c/591/extra/nota.jpg",
    "https://proj.supabase.co"
  );
  assert.strictEqual(ambigua, null);
  const solicitud = eliminar.solicitudBorradoStorage(copia, "https://proj.supabase.co");
  assert.strictEqual(solicitud.method, "DELETE");
  assert.ok(solicitud.url.includes("/storage/v1/object/archivos/whatsapp/u/segv2/c/59170000000/nota.jpg"));
  assert.ok(!solicitud.url.includes("/rest/v1/"));
  ok("candado, JSON, compartido, plantilla, huérfano y copia V2 no se borran sin valla");
}

async function testErrorConcurrenciaReintentoYEndpoint() {
  const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
  const lock = require("../services/limpiezaMedia/limpiezaMediaLock");
  const clave = "archivos/whatsapp/u/foto.jpg";
  const vallaError = vallaDePrueba({ entrante: 1 });
  vallaError.entranteObservadoMs = 1;
  const fallo = await eliminar.ejecutarBorradoSobrePlan(planCandidato(vallaError), clave, {
    async borrarObjeto() {
      const error = new Error("storage caido");
      error.response = { status: 500 };
      throw error;
    },
  });
  assert.strictEqual(fallo.eliminado, false);
  assert.strictEqual(fallo.motivo, "proteccion_con_vencimiento");
  assert.strictEqual(fallo.storage, false);

  let existe = true;
  const storage = [];
  const rest = [];
  async function borrarObjeto() {
    storage.push("delete");
    if (!existe) return { eliminado: true, idempotente: true, status: 404 };
    existe = false;
    return { eliminado: true, status: 200 };
  }
  const primero = await eliminar.ejecutarBorradoSobrePlan(
    planCandidato(vallaDePrueba({ entrante: 1 })),
    clave,
    { borrarObjeto }
  );
  const segundo = await eliminar.ejecutarBorradoSobrePlan(
    planCandidato(vallaDePrueba({ entrante: 1 })),
    clave,
    { borrarObjeto }
  );
  assert.strictEqual(primero.motivo, "proteccion_con_vencimiento");
  assert.strictEqual(segundo.motivo, "proteccion_con_vencimiento");
  assert.strictEqual(primero.storage, false);
  assert.strictEqual(storage.length, 0);
  assert.strictEqual(rest.length, 0);

  existe = true;
  let intentos = 0;
  const reintento = async () => {
    intentos += 1;
    if (intentos === 1) throw new Error("timeout");
    return borrarObjeto();
  };
  const caido = await eliminar.ejecutarBorradoSobrePlan(
    planCandidato(vallaDePrueba({ entrante: 1 })),
    clave,
    { borrarObjeto: reintento }
  );
  const repetido = await eliminar.ejecutarBorradoSobrePlan(
    planCandidato(vallaDePrueba({ entrante: 1 })),
    clave,
    { borrarObjeto: reintento }
  );
  assert.strictEqual(caido.motivo, "proteccion_con_vencimiento");
  assert.strictEqual(repetido.motivo, "proteccion_con_vencimiento");
  assert.strictEqual(existe, true);

  const mem = memoriaLock({
    id: "global",
    locked_by: null,
    locked_until: new Date(AHORA.getTime() - 1000).toISOString(),
    updated_at: AHORA.toISOString(),
  });
  const primeroLock = await lock.adquirirLockLimpiezaMedia({
    ...OPCION_LOCK,
    cliente: mem,
    workerId: "limpieza-a",
  });
  const segundoLock = await lock.adquirirLockLimpiezaMedia({
    ...OPCION_LOCK,
    cliente: mem,
    workerId: "limpieza-b",
  });
  assert.strictEqual(primeroLock.acquired, true);
  assert.strictEqual(segundoLock.acquired, false);
  assert.strictEqual(segundoLock.motivo, "candado_ocupado");
  assert.strictEqual(mem.fila().locked_by, "limpieza-a");

  const cliente = {
    llamadas: [],
    async delete(url) {
      this.llamadas.push(url);
      throw new Error("no debe borrar");
    },
  };
  const manual = await eliminar.eliminarSoloObjetoStorage(clave, {
    url: "https://proj.supabase.co",
    cliente,
    borrarObjeto: async () => {
      throw new Error("no debe borrar");
    },
  });
  assert.strictEqual(manual.eliminado, false);
  assert.strictEqual(manual.motivo, "bloqueada");
  assert.strictEqual(manual.storage, false);
  assert.strictEqual(cliente.llamadas.length, 0);

  const original = servicio.ELIMINACION_REAL_BLOQUEADA;
  const entorno = process.env.ELIMINACION_REAL;
  try {
    servicio.ELIMINACION_REAL_BLOQUEADA = false;
    process.env.ELIMINACION_REAL = "true";
    const forzadoSinMarca = await eliminar.borrarObjetoStorage(clave, {
      url: "https://proj.supabase.co",
      cliente,
    });
    assert.strictEqual(forzadoSinMarca.motivo, "marca_no_verificada");
    assert.strictEqual(forzadoSinMarca.storage, false);
    const marcaForzada = require("../services/limpiezaMedia/limpiezaMediaMarca");
    const registroForzado = marcaForzada.crearRegistroDePrueba();
    const vallaForzada = await marcaForzada.abrirMarcaDePrueba({
      registro: registroForzado,
      hilo: "u|c|591",
      owner: "cl:w1",
      entranteMs: 1,
    });
    await vallaForzada.promoverABorrando();
    const forzado = await eliminar.borrarObjetoStorage(clave, {
      url: "https://proj.supabase.co",
      cliente,
      marca: vallaForzada,
    });
    assert.strictEqual(forzado.motivo, "bloqueada");
    assert.strictEqual(forzado.storage, false);
    assert.strictEqual(cliente.llamadas.length, 0);
    assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  } finally {
    servicio.ELIMINACION_REAL_BLOQUEADA = original;
    if (entorno == null) delete process.env.ELIMINACION_REAL;
    else process.env.ELIMINACION_REAL = entorno;
  }

  const src = fs.readFileSync(
    path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaEliminar.js"),
    "utf8"
  );
  const ruta = fs.readFileSync(path.join(__dirname, "../routes/internalCronApi.js"), "utf8");
  assert.ok(src.includes("/storage/v1/object/archivos/"));
  assert.ok(!src.includes("/rest/v1/"));
  assert.ok(src.indexOf('motivo: "bloqueada"') < src.indexOf("cliente.delete"));
  assert.ok(!ruta.includes("eliminarSoloObjetoStorage"));
  assert.ok(!ruta.includes("axios.delete"));
  ok("error de storage, carreras, reintento, idempotencia y endpoint siguen sin borrar");
}

async function testCronPlanificaSinBorrar() {
  const cron = require("../scripts/limpieza-media-cron");
  const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
  const clave = "archivos/whatsapp/u/foto.jpg";
  let storage = 0;
  let planes = 0;
  const candidato = { clave, categoria: "candidato", motivo: "candidato", bytes: 40 };
  const protegido = { clave, categoria: "protegido", motivo: "referenciada", bytes: 40 };
  const compartido = { clave: "archivos/whatsapp/u/compartida.jpg", categoria: "candidato", motivo: "candidato", bytes: 10 };

  const sinClasificar = await cron.procesarCandidatoRevalidado(protegido, {
    validar: async () => {
      throw new Error("no debe revalidar un protegido");
    },
  });
  assert.strictEqual(sinClasificar.motivo, "no_candidato");
  assert.strictEqual(sinClasificar.storage, false);
  assert.strictEqual(sinClasificar.modo, "dry-run");

  const ambiguo = await cron.procesarCandidatoRevalidado(compartido, {
    validar: async () => ({ apto: false, motivo: "compartida", abortar: false }),
  });
  assert.strictEqual(ambiguo.motivo, "compartida");
  assert.strictEqual(ambiguo.eliminado, false);
  assert.strictEqual(ambiguo.storage, false);

  const originalPlan = eliminar.planificarEliminacion;
  const originalEjecutar = eliminar.ejecutarBorradoSobrePlan;
  const originalBloqueada = servicio.ELIMINACION_REAL_BLOQUEADA;
  const originalPermitida = servicio.eliminacionRealPermitida;
  eliminar.planificarEliminacion = async () => {
    storage += 1;
    planes += 1;
    return { eliminar: true, valla: { bloqueaInsertos: true, sesionAbierta: true } };
  };
  eliminar.ejecutarBorradoSobrePlan = async () => {
    storage += 1;
    return { eliminado: true, storage: true };
  };
  let bloqueado;
  try {
    bloqueado = await cron.procesarCandidatoRevalidado(candidato, {
      workerId: "limpieza-worker",
      permitirRed: true,
      validar: async () => ({ apto: true, motivo: "candidato", abortar: false, hilo: "u|c|591" }),
      abrirValla: async () => {
        planes += 1;
        return { bloqueaInsertos: true, sesionAbierta: true };
      },
    });
    assert.strictEqual(bloqueado.motivo, "bloqueada");
    assert.strictEqual(bloqueado.eliminado, false);
    assert.strictEqual(bloqueado.storage, false);
    assert.strictEqual(bloqueado.marca, false);
    assert.strictEqual(bloqueado.modo, "dry-run");
    assert.strictEqual(planes, 0);
    assert.strictEqual(storage, 0);

    const cancelado = await cron.procesarCandidatoRevalidado(
      { clave: "archivos/whatsapp/u/nuevo.jpg", categoria: "candidato", motivo: "candidato" },
      {
        workerId: "limpieza-worker",
        permitirRed: true,
        validar: async () => ({ apto: false, motivo: "hilo_activo", abortar: false }),
        abrirValla: async () => {
          planes += 1;
          return { bloqueaInsertos: true };
        },
      }
    );
    assert.strictEqual(cancelado.motivo, "hilo_activo");
    assert.strictEqual(cancelado.eliminado, false);
    assert.strictEqual(cancelado.storage, false);
    assert.strictEqual(cancelado.marca, false);
    assert.strictEqual(planes, 0);

    const noLlega = await cron.procesarCandidatoRevalidado(
      { clave, categoria: "ambiguo", motivo: "sin_referencia" },
      {}
    );
    assert.strictEqual(noLlega.motivo, "no_candidato");
    assert.strictEqual(noLlega.marca, false);
    assert.strictEqual(storage, 0);

    servicio.ELIMINACION_REAL_BLOQUEADA = false;
    servicio.eliminacionRealPermitida = () => true;
    eliminar.planificarEliminacion = async () => {
      planes += 1;
      return { eliminar: false, motivo: "entrante_inmediato", abortar: false };
    };
    const futuro = await cron.procesarCandidatoRevalidado(candidato, {
      workerId: "limpieza-worker",
      permitirRed: true,
      validar: async () => ({ apto: true, motivo: "candidato", abortar: false, hilo: "u|c|591" }),
    });
    assert.strictEqual(futuro.modo, "real");
    assert.strictEqual(futuro.motivo, "entrante_inmediato");
    assert.strictEqual(futuro.eliminado, false);
    assert.strictEqual(futuro.storage, false);
    assert.strictEqual(futuro.marca, false);
    assert.strictEqual(planes, 1);
    assert.strictEqual(storage, 0);
  } finally {
    servicio.ELIMINACION_REAL_BLOQUEADA = originalBloqueada;
    servicio.eliminacionRealPermitida = originalPermitida;
    eliminar.planificarEliminacion = originalPlan;
    eliminar.ejecutarBorradoSobrePlan = originalEjecutar;
  }
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  console.log("[LIMPIEZA_MEDIA_CRON] resumen de prueba", bloqueado);
  ok("el dry-run revalida candidatos sin abrir marca ni borrar");
}

async function testFalloIndividualDetieneYLiberaCandado() {
  const cron = require("../scripts/limpieza-media-cron");
  const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
  const uno = "archivos/whatsapp/u/uno.jpg";
  const dos = "archivos/whatsapp/u/dos.jpg";
  const tres = "archivos/whatsapp/u/tres.jpg";
  const candidatos = [uno, dos, tres].map((clave) => ({
    clave,
    categoria: "candidato",
    motivo: "candidato",
    bytes: 10,
  }));
  const originalPlan = eliminar.planificarEliminacion;
  const originalEjecutar = eliminar.ejecutarBorradoSobrePlan;
  let planes = 0;
  eliminar.planificarEliminacion = async () => {
    planes += 1;
    return { eliminar: true, valla: { bloqueaInsertos: true, sesionAbierta: true } };
  };
  eliminar.ejecutarBorradoSobrePlan = async () => {
    planes += 1;
    return { eliminado: true, storage: true };
  };
  try {
    const vistos = [];
    const estado = { perdido: null };
    let codigo = 0;
    let recorrido = null;
    let workerLiberado = null;
    try {
      recorrido = await cron.recorrerCandidatos(candidatos, {
        workerId: "limpieza-worker",
        validar: async (clave) => {
          vistos.push(clave);
          if (clave === dos) throw new Error("lectura de menciones");
          return { apto: true, motivo: "candidato", abortar: false, hilo: "u|c|591" };
        },
        abrirValla: async () => {
          planes += 1;
          return { bloqueaInsertos: true, sesionAbierta: true };
        },
      });
      if (recorrido.abortar) {
        estado.perdido = { motivo: recorrido.motivo || "candado_perdido" };
        throw new Error(recorrido.motivo || "candado_perdido");
      }
      if (recorrido.detener) {
        codigo = recorrido.codigo;
      }
    } finally {
      const cierre = await cron.finalizarCandado(estado, "limpieza-worker", async (workerId) => {
        workerLiberado = workerId;
        return { ok: true };
      });
      assert.strictEqual(cierre.liberado, true);
    }

    assert.strictEqual(codigo, 1);
    assert.strictEqual(recorrido.detener, true);
    assert.strictEqual(recorrido.abortar, false);
    assert.strictEqual(recorrido.clave, dos);
    assert.strictEqual(recorrido.motivo, "consulta_fallida");
    assert.strictEqual(recorrido.detalle, "lectura de menciones");
    assert.deepStrictEqual(vistos, [uno, dos]);
    assert.strictEqual(recorrido.storage, false);
    assert.strictEqual(recorrido.marca, false);
    assert.strictEqual(planes, 0);
    assert.strictEqual(workerLiberado, "limpieza-worker");
    assert.strictEqual(estado.perdido, null);
    assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);

    const posteriores = [];
    const porVeredicto = await cron.recorrerCandidatos(
      [
        { clave: dos, categoria: "candidato", motivo: "candidato" },
        { clave: tres, categoria: "candidato", motivo: "candidato" },
      ],
      {
        validar: async (clave) => {
          posteriores.push(clave);
          return { apto: false, motivo: "consulta_fallida", abortar: false, detalle: "timeout" };
        },
      }
    );
    assert.deepStrictEqual(posteriores, [dos]);
    assert.strictEqual(porVeredicto.codigo, 1);
    assert.strictEqual(porVeredicto.clave, dos);
    assert.strictEqual(porVeredicto.detalle, "timeout");
    assert.strictEqual(porVeredicto.marca, false);
    assert.strictEqual(porVeredicto.storage, false);

    const seguidos = [];
    const sanos = await cron.recorrerCandidatos(candidatos, {
      validar: async (clave) => {
        seguidos.push(clave);
        if (clave === uno) return { apto: false, motivo: "hilo_activo", abortar: false };
        return { apto: true, motivo: "candidato", abortar: false };
      },
    });
    assert.strictEqual(sanos.detener, false);
    assert.strictEqual(sanos.codigo, 0);
    assert.deepStrictEqual(seguidos, [uno, dos, tres]);
    assert.strictEqual(sanos.aptos, 2);
    assert.strictEqual(planes, 0);
  } finally {
    eliminar.planificarEliminacion = originalPlan;
    eliminar.ejecutarBorradoSobrePlan = originalEjecutar;
  }
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  ok("un fallo de revalidación detiene la pasada y el finally libera el candado");
}

function errorRevalidacion({ mensaje, status, codigo, codigoError, consulta }) {
  const error = new Error(mensaje);
  error.fase = "https://proj.supabase.co/no-debe-usarse";
  if (consulta) error.consulta = consulta;
  if (codigoError) error.code = codigoError;
  error.response = {
    data: {
      code: codigo,
      message: "MARCA_CUERPO_NO_LOG",
      details: "MARCA_CUERPO_NO_LOG",
      hint: "password=sb_secret_SUPERSECRETO123456",
    },
  };
  if (status != null) error.response.status = status;
  return error;
}

function afirmarDetalleLimpio(detalle, caso, secreto, telefono, jwt) {
  assert.deepStrictEqual(Object.keys(detalle).sort(), ["codigo", "consulta", "fase", "mensaje", "status"]);
  assert.strictEqual(detalle.fase, caso.fase);
  assert.strictEqual(detalle.consulta, caso.consulta);
  assert.strictEqual(detalle.status, caso.status);
  assert.strictEqual(detalle.codigo, caso.codigo);
  assert.ok(detalle.mensaje.length <= 200);
  assert.ok(detalle.mensaje.includes(caso.prefijo));
  const serial = JSON.stringify(detalle);
  assert.ok(!serial.includes(secreto));
  assert.ok(!serial.includes(telefono));
  assert.ok(!serial.includes(jwt));
  assert.ok(!serial.includes("https://"));
  assert.ok(!serial.includes("MARCA_CUERPO_NO_LOG"));
  assert.ok(!serial.includes("CUERPO_EN_MENSAJE"));
  assert.ok(!serial.includes("apikey="));
  assert.ok(!serial.includes("password="));
}

async function testDetalleErrorRevalidacionLlegaAlCron() {
  const cron = require("../scripts/limpieza-media-cron");
  const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
  const secreto = "sb_secret_SUPERSECRETO123456";
  const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.firma";
  const telefono = "59171234567";
  const urlSecreta = `https://proj.supabase.co/rest/v1/mensajes?apikey=${secreto}&cliente_numero=eq.${telefono}`;
  const primero = "archivos/whatsapp/u/foto.jpg";
  const segundo = "archivos/whatsapp/u/otro.jpg";
  const originalPlan = eliminar.planificarEliminacion;
  const originalEjecutar = eliminar.ejecutarBorradoSobrePlan;
  const originalError = console.error;
  let planes = 0;
  let borrados = 0;
  eliminar.planificarEliminacion = async () => {
    planes += 1;
    return { eliminar: true, valla: { bloqueaInsertos: true } };
  };
  eliminar.ejecutarBorradoSobrePlan = async () => {
    borrados += 1;
    return { eliminado: true, storage: true };
  };

  function mensajeSucio(prefijo) {
    return [
      `apikey=${secreto}`,
      prefijo,
      urlSecreta,
      `Authorization: Bearer ${jwt}`,
      `+${telefono}`,
      telefono,
      '{"message":"CUERPO_EN_MENSAJE"}',
      "x".repeat(250),
    ].join(" ");
  }

  const casos = [
    {
      nombre: "http",
      metodo: "existeObjeto",
      fase: "existencia_objeto",
      consulta: "storage.existencia",
      prefijo: "Request failed with status code 503",
      status: 503,
      codigo: null,
      error: errorRevalidacion({
        mensaje: mensajeSucio("Request failed with status code 503"),
        status: 503,
        codigo: secreto,
        codigoError: secreto,
        consulta: urlSecreta,
      }),
    },
    {
      nombre: "timeout",
      metodo: "leerMenciones",
      fase: "menciones",
      consulta: "mensajes.menciones",
      prefijo: "timeout of 20000ms exceeded",
      status: null,
      codigo: null,
      error: errorRevalidacion({
        mensaje: mensajeSucio("timeout of 20000ms exceeded"),
        status: null,
        codigo: secreto,
        codigoError: "ECONNABORTED",
        consulta: urlSecreta,
      }),
    },
    {
      nombre: "postgrest",
      metodo: "tieneReferenciaProtegida",
      fase: "referencias_protegidas",
      consulta: "seguimientos_v2.media_filename",
      prefijo: "Request failed with status code 400",
      status: 400,
      codigo: "PGRST116",
      error: errorRevalidacion({
        mensaje: mensajeSucio("Request failed with status code 400"),
        status: 400,
        codigo: "PGRST116",
        consulta: urlSecreta,
      }),
    },
    {
      nombre: "entrante",
      metodo: "leerUltimoEntrante",
      fase: "ultimo_entrante",
      consulta: "mensajes.ultimo_entrante",
      prefijo: "Request failed with status code 401",
      status: 401,
      codigo: "42501",
      error: errorRevalidacion({
        mensaje: mensajeSucio("Request failed with status code 401"),
        status: 401,
        codigo: "42501",
        consulta: urlSecreta,
      }),
    },
  ];

  try {
    for (const caso of casos) {
      let existencias = 0;
      const avisos = [];
      console.error = (...args) => {
        avisos.push(args);
      };
      const io = ioRevalidacion({
        async candadoVigente() {
          return { ok: true };
        },
        async existeObjeto() {
          existencias += 1;
          if (caso.metodo === "existeObjeto") throw caso.error;
          return true;
        },
        async leerMenciones() {
          if (caso.metodo === "leerMenciones") throw caso.error;
          return [fila("u", "c", "1", { imagen_url: `${URL}whatsapp/u/foto.jpg` })];
        },
        async tieneReferenciaProtegida(pedido) {
          if (caso.metodo === "tieneReferenciaProtegida") {
            return servicio.tieneReferenciaProtegidaReal(pedido, {
              leer() {
                throw caso.error;
              },
            });
          }
          return false;
        },
        async leerUltimoEntrante() {
          if (caso.metodo === "leerUltimoEntrante") throw caso.error;
          return reglas.parseCreadoEnUtc(HACE_40_DIAS);
        },
      });
      const recorrido = await cron.recorrerCandidatos(
        [primero, segundo].map((clave) => ({
          clave,
          categoria: "candidato",
          motivo: "candidato",
          bytes: 12,
        })),
        { workerId: "limpieza-worker", io }
      );
      const linea = avisos.find((args) => args[0] === "[LIMPIEZA_MEDIA_CRON] detenido");
      assert.ok(linea, caso.nombre);
      assert.strictEqual(linea[1].motivo, "consulta_fallida");
      assert.strictEqual(linea[1].clave, primero);
      assert.strictEqual(linea[1].detalle, recorrido.detalle);
      afirmarDetalleLimpio(recorrido.detalle, caso, secreto, telefono, jwt);
      afirmarDetalleLimpio(linea[1].detalle, caso, secreto, telefono, jwt);
      const registro = JSON.stringify(linea[1]);
      assert.ok(!registro.includes(secreto), caso.nombre);
      assert.ok(!registro.includes(telefono), caso.nombre);
      assert.ok(!registro.includes(jwt), caso.nombre);
      assert.ok(!registro.includes("https://"), caso.nombre);
      assert.ok(!registro.includes("MARCA_CUERPO_NO_LOG"), caso.nombre);
      assert.strictEqual(recorrido.motivo, "consulta_fallida");
      assert.strictEqual(recorrido.codigo, 1);
      assert.strictEqual(recorrido.detener, true);
      assert.strictEqual(recorrido.abortar, false);
      assert.strictEqual(recorrido.clave, primero);
      assert.strictEqual(recorrido.marca, false);
      assert.strictEqual(recorrido.storage, false);
      assert.strictEqual(existencias, 1);
      assert.strictEqual(planes, 0);
      assert.strictEqual(borrados, 0);
    }
  } finally {
    console.error = originalError;
    eliminar.planificarEliminacion = originalPlan;
    eliminar.ejecutarBorradoSobrePlan = originalEjecutar;
  }
  const largo = reglas.detalleConsultaFallida({
    fase: "menciones",
    consulta: "mensajes.menciones",
    message: `apikey=${secreto} ${"m".repeat(240)}`,
  });
  assert.strictEqual(largo.mensaje.length, 200);
  assert.ok(largo.mensaje.startsWith("[credential]"));
  assert.ok(!largo.mensaje.includes(secreto));
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  assert.strictEqual(planes, 0);
  assert.strictEqual(borrados, 0);
  ok("el detalle seguro de una consulta fallida llega al cron y detiene la pasada");
}

async function main() {
  testReloj();
  testRutas();
  testRutasSueltasCoincidenConCita();
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
  testIlikeEscapado();
  await testPaginaIlikeYNombreConGuionBajo();
  await testJsonDespuesDeCargarProteccion();
  await testPaginacionJsonUnaVez();
  await testEntranteEntreValidacionYBorrado();
  await testCandadoPerdidoDuranteRevalidacion();
  testRutaSegv2Ambigua();
  await testArchivoSubidoSinMensaje();
  await testEndpointManualNoBorra();
  await testCandadoUsaRelojPostgres();
  await testEntranteDuranteYAntesDeEliminar();
  await testCasosDePlanYBorradoBloqueado();
  await testErrorConcurrenciaReintentoYEndpoint();
  await testCronPlanificaSinBorrar();
  await testFalloIndividualDetieneYLiberaCandado();
  await testDetalleErrorRevalidacionLlegaAlCron();
  console.log(`${passed} pruebas ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
