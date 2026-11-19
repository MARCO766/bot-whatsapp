/**
 * M3 local: inventario de mensajes.imagen_url y mensajes.contenido.
 * No abre red, no ejecuta el backfill M2 y no borra.
 *
 * Ejecutar: node tests/limpiezaMediaM3.test.js
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
const NOTA = `${URL}whatsapp/u1/nota.jpg`;
const OTRA = `${URL}whatsapp/u1/otra.jpg`;
const META = `${URL}whatsapp-meta/u1/nota.jpg`;
const CLAVE = "archivos/whatsapp/u1/nota.jpg";
const CLAVE_OTRA = "archivos/whatsapp/u1/otra.jpg";
const CLAVE_META = "archivos/whatsapp-meta/u1/nota.jpg";
const ORIGINAL = "https://proj.supabase.co/storage/v1/object/public/seguimiento-v2-media/u/a.png";
const RM24 = "https://proj.supabase.co/storage/v1/object/public/rm24h-media/rm24h/test.jpg";

let passed = 0;
function ok(nombre) {
  passed += 1;
  console.log("ok", nombre);
}

function fila(usuario, conexion, numero, extra) {
  return {
    usuario_id: usuario,
    conexion_whatsapp_id: conexion,
    cliente_numero: numero,
    ...extra,
  };
}

function vacio() {
  const datos = { entrantes: [], medias: [], storage: {} };
  for (const fuente of servicio.FUENTES) datos[fuente] = [];
  return datos;
}

function almacenamiento(nombre, bytes) {
  const [carpeta, archivo] = nombre.split("/").slice(-2);
  const prefijo = nombre.startsWith("whatsapp-meta/") ? "whatsapp-meta" : "whatsapp";
  const usuario = nombre.split("/")[1];
  return {
    [prefijo]: [{ name: usuario, id: null }],
    [`${prefijo}/${usuario}`]: [{ name: archivo, id: archivo, metadata: { size: bytes } }],
  };
}

function base() {
  const datos = vacio();
  datos.entrantes = [
    fila("u1", "c1", "59170000001", { direccion: "entrante", creado_en: HACE_40_DIAS }),
  ];
  datos.medias = [
    fila("u1", "c1", "59170000001", { imagen_url: null, contenido: NOTA }),
  ];
  datos.storage = almacenamiento("whatsapp/u1/nota.jpg", 80);
  return datos;
}

function crearIo(datos, llamadas) {
  return {
    async leerFuente({ fuente, limit, despuesDeId, porId }) {
      llamadas.push(`fuente:${fuente}`);
      const filas = datos[fuente] || [];
      if (porId === true) {
        const ordenadas = filas.map((item, indice) => (
          item && item.id != null ? item : { ...item, id: String(indice + 1).padStart(8, "0") }
        ));
        const siguientes = despuesDeId
          ? ordenadas.filter((item) => String(item.id) > String(despuesDeId))
          : ordenadas;
        return siguientes.slice(0, limit);
      }
      return filas.slice(0, limit);
    },
    async leerMensajes({ fase, limit, despuesDeId }) {
      llamadas.push(`mensajes:${fase}`);
      const baseFilas = fase === "entrantes" ? datos.entrantes : datos.medias;
      const filas = baseFilas.map((item, indice) => (
        item && item.id != null ? item : { ...item, id: String(indice + 1).padStart(8, "0") }
      ));
      const siguientes = despuesDeId
        ? filas.filter((item) => String(item.id) > String(despuesDeId))
        : filas;
      return siguientes.slice(0, limit);
    },
    async listarStorage({ prefix, offset, limit }) {
      llamadas.push(`storage:${prefix}`);
      const filas = datos.storage[prefix] || [];
      return filas.slice(offset, offset + limit);
    },
    async borrar() {
      llamadas.push("borrar");
      throw new Error("borrar");
    },
  };
}

async function simular(datos, opciones = {}) {
  const llamadas = [];
  const result = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado: servicio.crearEstado(),
    io: opciones.io || crearIo(datos, llamadas),
    informe: true,
    maxMs: 10000,
    maxPaginas: opciones.maxPaginas || 80,
    pageSize: opciones.pageSize || 5,
  });
  return { result, llamadas };
}

function motivoDe(result, clave) {
  const objeto = result.informe.objetos.find((item) => item.clave === clave);
  assert.ok(objeto, clave);
  return objeto.motivo;
}

function testAnotacionDeAmbasColumnas() {
  const usos = new Map();
  reglas.anotarUso(usos, fila("u1", "c1", "59170000001", {
    imagen_url: null,
    contenido: NOTA,
  }));
  assert.ok(usos.has(CLAVE));
  assert.strictEqual(usos.get(CLAVE).hilos.size, 1);

  const ambas = new Map();
  reglas.anotarUso(ambas, fila("u1", "c1", "59170000001", {
    imagen_url: NOTA,
    contenido: OTRA,
  }));
  assert.ok(ambas.has(CLAVE));
  assert.ok(ambas.has(CLAVE_OTRA));
  assert.strictEqual(ambas.get(CLAVE).hilos.size, 1);

  const repetida = new Map();
  reglas.anotarUso(repetida, fila("u1", "c1", "59170000001", {
    imagen_url: NOTA,
    contenido: NOTA,
  }));
  assert.strictEqual(repetida.get(CLAVE).hilos.size, 1);

  reglas.anotarUso(usos, fila("u1", "c1", "59170000002", { contenido: NOTA }));
  assert.strictEqual(usos.get(CLAVE).hilos.size, 2);
  reglas.anotarUso(usos, fila("u2", "c2", "59170000003", { imagen_url: NOTA }));
  assert.strictEqual(usos.get(CLAVE).usuarios.size, 2);

  const ajenos = new Map();
  reglas.anotarUso(ajenos, fila("u1", "c1", "59170000001", {
    imagen_url: RM24,
    contenido: ORIGINAL,
  }));
  assert.strictEqual(ajenos.size, 0);

  const suelta = new Map();
  reglas.anotarUso(suelta, fila("u1", "c1", "59170000001", {
    contenido: "whatsapp/u1/nota.jpg",
  }));
  assert.strictEqual(suelta.size, 0);

  const incompleto = new Map();
  const marca = reglas.anotarUso(incompleto, fila("u1", "c1", "", { contenido: NOTA }));
  assert.strictEqual(typeof marca, "string");
  assert.strictEqual(incompleto.get(CLAVE).incompleto, true);

  const roto = reglas.anotarUso(new Map(), fila("u1", "c1", "59170000001", {
    imagen_url: NOTA,
    contenido: "https://proj.supabase.co/storage/v1/object/public/",
  }));
  assert.strictEqual(roto.noVerificable, true);
  ok("el inventario anota imagen_url y contenido, y omite lo ambiguo");
}

async function testContenidoExclusivoEsCandidato() {
  const { result, llamadas } = await simular(base());
  assert.strictEqual(result.modo, "simulacion");
  assert.strictEqual(result.eliminacionReal, "bloqueada");
  assert.strictEqual(result.completo, true);
  assert.strictEqual(result.proteccionIncompleta, false);
  assert.strictEqual(result.candidatos, 1);
  assert.strictEqual(result.bytes, 80);
  assert.strictEqual(motivoDe(result, CLAVE), "candidato");
  assert.ok(!llamadas.includes("borrar"));
  ok("un archivo citado solo en contenido de un hilo inactivo queda candidato");
}

async function testContenidoEnLaPaginaSiguiente() {
  const datos = base();
  datos.medias = [
    fila("u1", "c1", "59170000001", { imagen_url: null, contenido: "hola" }),
    fila("u1", "c1", "59170000001", { imagen_url: null, contenido: NOTA }),
  ];
  const { result } = await simular(datos, { pageSize: 1 });
  assert.strictEqual(result.completo, true);
  assert.strictEqual(result.candidatos, 1);
  assert.strictEqual(motivoDe(result, CLAVE), "candidato");
  ok("la cita en contenido se lee aunque llegue en otra página");
}

async function testMetaYAmbasColumnasDelMismoHilo() {
  const datos = base();
  datos.medias = [
    fila("u1", "c1", "59170000001", { imagen_url: NOTA, contenido: META }),
  ];
  datos.storage = {
    ...almacenamiento("whatsapp/u1/nota.jpg", 80),
    "whatsapp-meta": [{ name: "u1", id: null }],
    "whatsapp-meta/u1": [{ name: "nota.jpg", id: "m", metadata: { size: 40 } }],
  };
  const { result } = await simular(datos);
  assert.strictEqual(result.candidatos, 2);
  assert.strictEqual(result.bytes, 120);
  assert.strictEqual(motivoDe(result, CLAVE), "candidato");
  assert.strictEqual(motivoDe(result, CLAVE_META), "candidato");
  ok("imagen_url y contenido del mismo hilo no se anulan entre sí");
}

async function testCompartidaEntreConversacionesYUsuarios() {
  const conversaciones = base();
  conversaciones.entrantes.push(
    fila("u1", "c1", "59170000002", { direccion: "entrante", creado_en: HACE_40_DIAS })
  );
  conversaciones.medias.push(
    fila("u1", "c1", "59170000002", { imagen_url: null, contenido: NOTA })
  );
  const porHilo = await simular(conversaciones);
  assert.strictEqual(porHilo.result.candidatos, 0);
  assert.strictEqual(porHilo.result.excluidos.compartida, 1);
  assert.strictEqual(motivoDe(porHilo.result, CLAVE), "compartida");

  const cruzada = base();
  cruzada.medias[0].imagen_url = NOTA;
  cruzada.medias[0].contenido = "sin archivo";
  cruzada.entrantes.push(
    fila("u1", "c1", "59170000002", { direccion: "entrante", creado_en: HACE_40_DIAS })
  );
  cruzada.medias.push(
    fila("u1", "c1", "59170000002", { imagen_url: null, contenido: NOTA })
  );
  const cruce = await simular(cruzada);
  assert.strictEqual(cruce.result.candidatos, 0);
  assert.strictEqual(motivoDe(cruce.result, CLAVE), "compartida");

  const usuarios = base();
  usuarios.entrantes.push(
    fila("u2", "c2", "59170000003", { direccion: "entrante", creado_en: HACE_40_DIAS })
  );
  usuarios.medias.push(
    fila("u2", "c2", "59170000003", { imagen_url: null, contenido: NOTA })
  );
  const porUsuario = await simular(usuarios);
  assert.strictEqual(porUsuario.result.candidatos, 0);
  assert.strictEqual(porUsuario.result.excluidos.multi_usuario, 1);
  assert.strictEqual(motivoDe(porUsuario.result, CLAVE), "multi_usuario");
  ok("contenido compartido entre conversaciones o usuarios no se elimina");
}

async function testRelojSoloEntrante() {
  const datos = base();
  datos.entrantes.push(
    fila("u1", "c1", "59170000001", { direccion: "saliente", creado_en: HACE_10_DIAS })
  );
  const quieto = await simular(datos);
  assert.strictEqual(quieto.result.candidatos, 1);
  assert.strictEqual(motivoDe(quieto.result, CLAVE), "candidato");

  const activo = base();
  activo.entrantes = [
    fila("u1", "c1", "59170000001", { direccion: "entrante", creado_en: HACE_10_DIAS }),
    fila("u1", "c1", "59170000001", { direccion: "saliente", creado_en: HACE_40_DIAS }),
  ];
  const reciente = await simular(activo);
  assert.strictEqual(reciente.result.candidatos, 0);
  assert.strictEqual(motivoDe(reciente.result, CLAVE), "hilo_activo");

  const sinCliente = base();
  sinCliente.entrantes = [
    fila("u1", "c1", "59170000001", { direccion: "saliente", creado_en: HACE_40_DIAS }),
  ];
  const hueco = await simular(sinCliente);
  assert.strictEqual(hueco.result.candidatos, 0);
  assert.strictEqual(motivoDe(hueco.result, CLAVE), "sin_entrante");
  ok("el reloj usa el último entrante y un saliente no lo reinicia");
}

async function testOrigenesProtegidos() {
  const casos = [
    ["flujos", { mensaje_1: NOTA }],
    ["flujo_pasos", { imagen_url: NOTA, contenido: "", boton_texto: "", boton_id: "" }],
    ["flujos_builder", { data: { url: NOTA } }],
    ["remarketing_global_24h", { mensaje_remarketing: NOTA }],
    ["ia_sessions", { flow_context: { biblioteca: NOTA } }],
    ["lector_pagos_estado", { producto_url: NOTA }],
    ["seguimientos_v2", { media_url: NOTA, contenido: "", error_detalle: "", media_filename: "" }],
    ["conversaciones", { ultimo_mensaje: NOTA }],
  ];
  for (const [tabla, filaProtegida] of casos) {
    const datos = base();
    datos[tabla] = [filaProtegida];
    const { result } = await simular(datos);
    assert.strictEqual(result.completo, true, tabla);
    assert.strictEqual(result.candidatos, 0, tabla);
    assert.strictEqual(motivoDe(result, CLAVE), "referenciada", tabla);
  }

  const nombre = base();
  nombre.seguimientos_v2 = [{
    media_filename: "nota.jpg",
    media_url: "",
    contenido: "",
    error_detalle: "",
  }];
  const porNombre = await simular(nombre);
  assert.strictEqual(porNombre.result.candidatos, 0);
  assert.strictEqual(motivoDe(porNombre.result, CLAVE), "referenciada");

  const parcial = base();
  parcial.flujos = [{ mensaje_1: NOTA }];
  parcial.medias.push(
    fila("u1", "c1", "59170000001", { imagen_url: null, contenido: OTRA })
  );
  parcial.storage["whatsapp/u1"].push({ name: "otra.jpg", id: "o", metadata: { size: 15 } });
  const queda = await simular(parcial);
  assert.strictEqual(queda.result.candidatos, 1);
  assert.strictEqual(queda.result.bytes, 15);
  assert.strictEqual(motivoDe(queda.result, CLAVE), "referenciada");
  assert.strictEqual(motivoDe(queda.result, CLAVE_OTRA), "candidato");
  ok("flujos, nodos, remarketing, IA, pagos y seguimiento protegen la cita");
}

async function testBucketsExcluidosYOriginal() {
  const datos = base();
  datos.medias[0].contenido = `${NOTA} ${ORIGINAL}`;
  datos.medias.push(
    fila("u1", "c1", "59170000001", { imagen_url: RM24, contenido: ORIGINAL })
  );
  const { result, llamadas } = await simular(datos);
  assert.strictEqual(result.candidatos, 1);
  assert.strictEqual(result.bytes, 80);
  assert.strictEqual(motivoDe(result, CLAVE), "candidato");
  const original = result.informe.objetos.find((item) => item.motivo === "original_seguimiento_v2");
  assert.ok(original);
  assert.strictEqual(original.categoria, "protegido");
  assert.strictEqual(original.clave, "seguimiento-v2-media/u/a.png");
  assert.ok(!result.informe.objetos.some((item) => item.clave.includes("rm24h-media")));
  assert.ok(!llamadas.some((item) => item.includes("rm24h-media")));
  assert.ok(!llamadas.some((item) => item.includes("seguimiento-v2-media")));
  ok("seguimiento-v2-media y rm24h-media quedan fuera de la limpieza");
}

async function testAmbiguedadOmiteElArchivo() {
  const suelta = base();
  suelta.medias = [
    fila("u1", "c1", "59170000001", { imagen_url: null, contenido: "whatsapp/u1/nota.jpg" }),
  ];
  const rutaSuelta = await simular(suelta);
  assert.strictEqual(rutaSuelta.result.completo, true);
  assert.strictEqual(rutaSuelta.result.candidatos, 0);
  assert.strictEqual(motivoDe(rutaSuelta.result, CLAVE), "sin_referencia");

  const ilegible = base();
  ilegible.medias[0].imagen_url = NOTA;
  ilegible.medias[0].contenido = "https://proj.supabase.co/storage/v1/object/public/";
  const roto = await simular(ilegible);
  assert.strictEqual(roto.result.proteccionIncompleta, true);
  assert.strictEqual(roto.result.completo, false);
  assert.strictEqual(roto.result.candidatos, 0);
  assert.strictEqual(roto.result.bytes, 0);

  const llamadas = [];
  const ioPegado = crearIo(base(), llamadas);
  ioPegado.leerMensajes = async ({ fase }) => {
    llamadas.push(`mensajes:${fase}`);
    if (fase === "entrantes") {
      return [fila("u1", "c1", "59170000001", {
        id: "m1",
        direccion: "entrante",
        creado_en: HACE_40_DIAS,
      })];
    }
    return [fila("u1", "c1", "59170000001", { id: "mismo", imagen_url: null, contenido: NOTA })];
  };
  const pagina = await simular(base(), { io: ioPegado, pageSize: 1 });
  assert.strictEqual(pagina.result.proteccionIncompleta, true);
  assert.strictEqual(pagina.result.candidatos, 0);
  assert.ok(!llamadas.includes("borrar"));

  const ioJson = crearIo(base(), []);
  ioJson.leerFuente = async ({ fuente }) => {
    if (fuente === "flujos_builder") throw new Error("consulta de flujos_builder fallo");
    return [];
  };
  const jsonRoto = await simular(base(), { io: ioJson });
  assert.strictEqual(jsonRoto.result.proteccionIncompleta, true);
  assert.strictEqual(jsonRoto.result.candidatos, 0);

  const ioRoto = crearIo(base(), []);
  ioRoto.leerFuente = async ({ fuente }) => {
    if (fuente === "flujos") throw new Error("consulta de flujos fallo");
    return [];
  };
  await assert.rejects(
    () => simular(base(), { io: ioRoto }),
    /consulta de flujos fallo/
  );
  ok("ruta suelta, texto ilegible, página trabada o consulta fallida omiten el archivo");
}

async function testRelecturaDeFlujosAntesDeRevalidar() {
  const lecturas = [];
  const fresca = await servicio.cargarProteccion({
    io: {
      async leerFuente({ fuente }) {
        lecturas.push(fuente);
        if (fuente === "flujos_builder") {
          return [{ id: "b1", data: { url: NOTA } }];
        }
        if (fuente === "ia_sessions") {
          return [{ id: "ia1", flow_context: { biblioteca: OTRA } }];
        }
        return [];
      },
    },
    pageSize: 10,
    soloFuentes: servicio.FUENTES_JSON_VIVAS,
    maxPaginas: 30,
  });
  assert.ok(lecturas.includes("flujos_builder"));
  assert.ok(lecturas.includes("ia_sessions"));
  assert.ok(!lecturas.includes("seguimientos_v2_logs"));
  assert.ok(!lecturas.includes("mensajes"));
  assert.strictEqual(fresca.proteccionIncompleta, false);
  assert.ok(fresca.protegidas.has(CLAVE));
  assert.ok(fresca.protegidas.has(CLAVE_OTRA));

  const veredicto = await servicio.revalidarCandidato(CLAVE, {
    ahora: AHORA,
    protegidas: fresca.protegidas,
    io: {
      async existeObjeto() {
        return true;
      },
      async leerMenciones() {
        return [fila("u1", "c1", "59170000001", { imagen_url: null, contenido: NOTA })];
      },
      async tieneReferenciaProtegida() {
        return false;
      },
      async leerUltimoEntrante() {
        return reglas.parseCreadoEnUtc(HACE_40_DIAS);
      },
    },
  });
  assert.strictEqual(veredicto.motivo, "referenciada");
  assert.strictEqual(veredicto.apto, false);

  const ajeno = await servicio.buscarCitaJsonViva("rm24h-media/rm24h/test.jpg", {
    io: {
      async leerFuente() {
        throw new Error("no debe leer un bucket excluido");
      },
    },
  });
  assert.strictEqual(ajeno.citada, true);
  ok("la relectura de flujos e IA protege una cita que el inventario ya no tenía");
}

async function testFrenoInmediatoAntesDeBorrar() {
  const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
  let borrados = 0;
  let cerrada = false;
  const valla = {
    bloqueaInsertos: true,
    sesionAbierta: true,
    sinVencimiento: true,
    sobreviveDesconexion: true,
    async cerrar() {
      cerrada = true;
      valla.sesionAbierta = false;
    },
  };
  const io = {
    async leerFuente({ fuente }) {
      if (fuente === "flujos_builder") return [{ id: "b1", data: { url: NOTA } }];
      return [];
    },
    async existeObjeto() {
      return true;
    },
    async leerMenciones() {
      return [fila("u1", "c1", "59170000001", { imagen_url: null, contenido: NOTA })];
    },
    async tieneReferenciaProtegida() {
      return false;
    },
    async leerUltimoEntrante() {
      return reglas.parseCreadoEnUtc(HACE_40_DIAS);
    },
    async candadoVigente() {
      return { ok: true };
    },
  };
  const citada = await eliminar.ejecutarBorradoSobrePlan(
    { eliminar: true, motivo: "candidato", valla },
    CLAVE,
    {
      exigirJsonVivo: true,
      workerId: "limpieza-m3",
      ahora: AHORA,
      io,
      async borrarObjeto() {
        borrados += 1;
        return { eliminado: true, status: 200 };
      },
    }
  );
  assert.strictEqual(citada.motivo, "referenciada");
  assert.strictEqual(citada.eliminado, false);
  assert.strictEqual(citada.storage, false);
  assert.strictEqual(borrados, 0);
  assert.strictEqual(cerrada, true);

  cerrada = false;
  const compartida = await eliminar.ejecutarBorradoSobrePlan(
    { eliminar: true, motivo: "candidato", valla },
    CLAVE,
    {
      exigirJsonVivo: true,
      workerId: "limpieza-m3",
      ahora: AHORA,
      io: {
        ...io,
        async leerMenciones() {
          return [
            fila("u1", "c1", "59170000001", { imagen_url: NOTA, contenido: "" }),
            fila("u1", "c1", "59170000002", { imagen_url: "", contenido: NOTA }),
          ];
        },
        async leerFuente() {
          return [];
        },
      },
      async borrarObjeto() {
        borrados += 1;
        return { eliminado: true, status: 200 };
      },
    }
  );
  assert.strictEqual(compartida.motivo, "compartida");
  assert.strictEqual(compartida.storage, false);
  assert.strictEqual(borrados, 0);
  assert.strictEqual(cerrada, true);
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  ok("justo antes de borrar se frena un flujo o un archivo compartido");
}

async function testRevalidacionCoincideConElInventario() {
  const ioBase = {
    async existeObjeto() {
      return true;
    },
    async tieneReferenciaProtegida() {
      return false;
    },
    async leerUltimoEntrante() {
      return reglas.parseCreadoEnUtc(HACE_40_DIAS);
    },
  };
  const exclusivo = await servicio.revalidarCandidato(CLAVE, {
    ahora: AHORA,
    io: {
      ...ioBase,
      async leerMenciones() {
        return [fila("u1", "c1", "59170000001", { imagen_url: null, contenido: NOTA })];
      },
    },
  });
  assert.strictEqual(exclusivo.motivo, "candidato");
  assert.strictEqual(exclusivo.apto, true);

  const compartida = await servicio.revalidarCandidato(CLAVE, {
    ahora: AHORA,
    io: {
      ...ioBase,
      async leerMenciones() {
        return [
          fila("u1", "c1", "59170000001", { imagen_url: NOTA, contenido: "" }),
          fila("u1", "c1", "59170000002", { imagen_url: "", contenido: NOTA }),
        ];
      },
    },
  });
  assert.strictEqual(compartida.motivo, "compartida");
  assert.strictEqual(compartida.apto, false);

  const citada = await servicio.revalidarCandidato(CLAVE, {
    ahora: AHORA,
    io: {
      ...ioBase,
      async leerMenciones() {
        return [fila("u1", "c1", "59170000001", { contenido: NOTA })];
      },
      async tieneReferenciaProtegida() {
        return true;
      },
    },
  });
  assert.strictEqual(citada.motivo, "referenciada");
  assert.strictEqual(citada.apto, false);

  const ajeno = await servicio.revalidarCandidato("rm24h-media/rm24h/test.jpg", {
    ahora: AHORA,
    io: ioBase,
  });
  assert.strictEqual(ajeno.apto, false);
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  ok("la revalidación acepta contenido exclusivo y frena lo compartido o protegido");
}

function decidirRutaCitaViva(entrada) {
  let ruta = String(entrada == null ? "" : entrada).trim();
  if (!ruta || !/^[a-zA-Z0-9._/-]+$/.test(ruta) || ruta.includes("..") || ruta.length > 500) {
    return { citada: false, error: "ruta_no_filtrable" };
  }
  if (ruta.startsWith("archivos/")) ruta = ruta.slice("archivos/".length);
  const partes = ruta.split("/");
  const archivo = partes[partes.length - 1];
  const segmentoRoto = partes.some(
    (segmento) =>
      segmento === "" ||
      segmento === "." ||
      segmento === ".." ||
      !/^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(segmento)
  );
  if (
    ruta === "" ||
    partes.length < 3 ||
    !archivo ||
    !/^[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.[a-zA-Z0-9]+$/.test(archivo) ||
    segmentoRoto
  ) {
    return { citada: false, error: "ruta_no_filtrable" };
  }
  if (!/^(whatsapp|whatsapp-meta)\//.test(ruta)) return { citada: true, error: null };
  return { busca: true };
}

function testRutaSinArchivoNoSeBusca() {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/limpieza_media_cita_json.sql"),
    "utf8"
  );
  const forma = sql.indexOf("coalesce(array_length(v_partes, 1), 0) < 3");
  const prefijo = sql.indexOf("v_ruta !~ '^(whatsapp|whatsapp-meta)/'");
  assert.ok(forma > 0 && forma < prefijo);
  assert.deepStrictEqual(decidirRutaCitaViva("no/valida"), {
    citada: false,
    error: "ruta_no_filtrable",
  });
  assert.deepStrictEqual(decidirRutaCitaViva("otro/prefijo/x.jpg"), {
    citada: true,
    error: null,
  });
  assert.deepStrictEqual(decidirRutaCitaViva("archivos/whatsapp/u1/nota.jpg"), { busca: true });
  assert.deepStrictEqual(decidirRutaCitaViva("whatsapp-meta/u1/nota.jpg"), { busca: true });
  assert.ok(sql.includes("security invoker"));
  assert.ok(sql.includes("set search_path = public"));
  assert.ok(sql.includes("revoke all on function public.limpieza_flujo_cita_viva(text) from public"));
  assert.ok(sql.includes("revoke all on function public.limpieza_flujo_cita_viva(text) from anon"));
  assert.ok(sql.includes("revoke all on function public.limpieza_flujo_cita_viva(text) from authenticated"));
  assert.ok(sql.includes("grant execute on function public.limpieza_flujo_cita_viva(text) to service_role"));
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  ok("no/valida no entra al ilike y el prefijo ajeno sigue citado");
}

function testRecorridoYPrefijoConBucketSiguenCerrados() {
  assert.deepStrictEqual(decidirRutaCitaViva("whatsapp/../x.jpg"), {
    citada: false,
    error: "ruta_no_filtrable",
  });
  assert.deepStrictEqual(decidirRutaCitaViva("archivos/otro/prefijo/x.jpg"), {
    citada: true,
    error: null,
  });
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  ok("un recorrido y un prefijo ajeno con bucket no declaran el archivo libre");
}

function testContratoSinBorradoNiBackfill() {
  const servicioSrc = fs.readFileSync(
    path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaService.js"),
    "utf8"
  );
  const reglasSrc = fs.readFileSync(
    path.join(__dirname, "../services/limpiezaMedia/reglas.js"),
    "utf8"
  );
  const dry = fs.readFileSync(
    path.join(__dirname, "../scripts/limpieza-media-dry-run.js"),
    "utf8"
  );
  const cron = fs.readFileSync(
    path.join(__dirname, "../scripts/limpieza-media-cron.js"),
    "utf8"
  );
  const webhook = fs.readFileSync(path.join(__dirname, "../routes/webhook.js"), "utf8");
  assert.ok(servicioSrc.includes("const ELIMINACION_REAL_BLOQUEADA = true;"));
  assert.ok(!servicioSrc.includes("ELIMINACION_REAL_BLOQUEADA = false"));
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  assert.ok(servicioSrc.includes("imagen_url,contenido"));
  assert.ok(reglasSrc.includes("fila?.imagen_url, fila?.contenido"));
  assert.ok(!servicioSrc.includes("media_cita"));
  assert.ok(!servicioSrc.includes("limpieza-media-backfill"));
  assert.ok(!servicioSrc.includes("axios.delete"));
  assert.ok(dry.includes("ELIMINACION_REAL_BLOQUEADA !== true"));
  assert.ok(dry.includes("mensajeCursor"));
  assert.ok(dry.includes('columnasMensaje: ["imagen_url", "contenido"]'));
  assert.ok(dry.includes('backfillM2: "no_ejecutado"'));
  assert.ok(!dry.includes("limpieza-media-backfill"));
  assert.ok(!dry.includes("axios.delete"));
  assert.ok(!dry.includes(".remove("));
  assert.ok(!dry.includes("rm24h-media"));
  assert.ok(cron.includes("servicio.ELIMINACION_REAL_BLOQUEADA"));
  assert.ok(!cron.includes("ELIMINACION_REAL_BLOQUEADA = false"));
  assert.ok(!webhook.includes("media_cita"));
  assert.ok(!webhook.includes("limpieza_media_backfill"));
  assert.ok(!fs.existsSync(path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaM3.js")));
  const eliminarSrc = fs.readFileSync(
    path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaEliminar.js"),
    "utf8"
  );
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/limpieza_media_cita_json.sql"),
    "utf8"
  );
  assert.ok(servicioSrc.includes("buscarCitaJsonViva"));
  assert.ok(servicioSrc.includes("limpieza_flujo_cita_viva"));
  assert.ok(servicioSrc.includes("FUENTES_JSON_VIVAS"));
  assert.ok(eliminarSrc.indexOf("exigirJsonVivo === true") < eliminarSrc.indexOf("ejecutarBajoMarca"));
  assert.ok(cron.includes("FUENTES_JSON_VIVAS"));
  assert.ok(cron.includes("exigirJsonVivo: true"));
  assert.ok(cron.includes("omitirJson: true"));
  assert.ok(sql.includes("limpieza_flujo_cita_viva"));
  assert.ok(sql.includes("flujos_builder"));
  assert.ok(sql.includes("config_snapshot"));
  assert.ok(sql.includes("mensaje_payload"));
  assert.ok(!sql.includes("delete from"));
  assert.ok(!sql.includes("storage.objects"));
  ok("el dry-run sigue bloqueado, sin backfill M2 y sin servicio nuevo");
}

async function main() {
  testAnotacionDeAmbasColumnas();
  await testContenidoExclusivoEsCandidato();
  await testContenidoEnLaPaginaSiguiente();
  await testMetaYAmbasColumnasDelMismoHilo();
  await testCompartidaEntreConversacionesYUsuarios();
  await testRelojSoloEntrante();
  await testOrigenesProtegidos();
  await testBucketsExcluidosYOriginal();
  await testAmbiguedadOmiteElArchivo();
  await testRelecturaDeFlujosAntesDeRevalidar();
  await testFrenoInmediatoAntesDeBorrar();
  await testRevalidacionCoincideConElInventario();
  testRutaSinArchivoNoSeBusca();
  testRecorridoYPrefijoConBucketSiguenCerrados();
  testContratoSinBorradoNiBackfill();
  console.log(`${passed} pruebas ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
