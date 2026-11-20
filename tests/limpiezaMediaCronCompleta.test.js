/**
 * Limpieza completa por pasadas. No abre red y no borra objetos reales.
 *
 * Ejecutar: node tests/limpiezaMediaCronCompleta.test.js
 */
const assert = require("assert");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");
const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
const reglas = require("../services/limpiezaMedia/reglas");
const lote = require("../services/limpiezaMedia/limpiezaMediaRevalidarLote");
const cron = require("../scripts/limpieza-media-cron");

let passed = 0;
function ok(nombre) {
  passed += 1;
  console.log("ok", nombre);
}

function candidato(clave) {
  return { clave, categoria: "candidato", motivo: "candidato", bytes: 8 };
}

function lista(cantidad) {
  return Array.from({ length: cantidad }, (_, indice) => (
    candidato(`archivos/whatsapp/u/f${String(indice).padStart(4, "0")}.jpg`)
  ));
}

function marcaLista() {
  return {
    sobreviveDesconexion: true,
    sinVencimiento: true,
    async leer() {
      return { estado: "reservado", resultado: null };
    },
  };
}

async function conVariable(valor, tarea) {
  const previo = process.env.LIMPIEZA_MEDIA_BORRAR;
  if (valor == null) delete process.env.LIMPIEZA_MEDIA_BORRAR;
  else process.env.LIMPIEZA_MEDIA_BORRAR = valor;
  try {
    return await tarea();
  } finally {
    if (previo == null) delete process.env.LIMPIEZA_MEDIA_BORRAR;
    else process.env.LIMPIEZA_MEDIA_BORRAR = previo;
  }
}

function instalar({ borrar, ejecutar, planificar, validar, revalidar } = {}) {
  const original = {
    plan: eliminar.planificarEliminacion,
    ejecutar: eliminar.ejecutarBorradoSobrePlan,
    borrar: eliminar.borrarObjetoStorage,
    validar: servicio.validarInmediatoEliminacion,
    revalidar: lote.revalidarLote,
  };
  if (planificar) eliminar.planificarEliminacion = planificar;
  if (ejecutar) eliminar.ejecutarBorradoSobrePlan = ejecutar;
  if (borrar) eliminar.borrarObjetoStorage = borrar;
  if (validar) servicio.validarInmediatoEliminacion = validar;
  if (revalidar) lote.revalidarLote = revalidar;
  return () => {
    eliminar.planificarEliminacion = original.plan;
    eliminar.ejecutarBorradoSobrePlan = original.ejecutar;
    eliminar.borrarObjetoStorage = original.borrar;
    servicio.validarInmediatoEliminacion = original.validar;
    lote.revalidarLote = original.revalidar;
  };
}

async function testMasDeCienYPasadas() {
  const candidatos = lista(120);
  const pasadas = [];
  const llamadas = [];
  const vistos = [];
  const restaurar = instalar({
    revalidar: async (claves) => {
      llamadas.push(claves.slice());
      assert.ok(claves.length > 0 && claves.length <= 8, String(claves.length));
      return {
        abortar: false,
        tiempos: { storageMs: 1 },
        resultados: claves.map((clave) => ({ clave, apto: true, motivo: "candidato" })),
      };
    },
    validar: async (clave) => {
      vistos.push(clave);
      return { apto: true, motivo: "candidato", abortar: false, hilo: "u|c|591" };
    },
  });
  try {
    await conVariable(null, async () => {
      const recorrido = await cron.recorrerCandidatos(candidatos, {
        workerId: "limpieza-completa",
        limite: 1,
        cupo: { usados: 99 },
        alPasada(pasada) {
          pasadas.push(pasada);
        },
      });
      assert.strictEqual(recorrido.detener, false);
      assert.strictEqual(recorrido.codigo, 0);
      assert.strictEqual(recorrido.borrados, 0);
      assert.strictEqual(recorrido.aptos, 120);
      assert.strictEqual(recorrido.pendientes, 0);
      assert.strictEqual(recorrido.storage, false);
      assert.deepStrictEqual(pasadas.map((pasada) => pasada.inicio), [0, 50, 100]);
      assert.deepStrictEqual(pasadas.map((pasada) => pasada.tamano), [50, 50, 20]);
      assert.strictEqual(llamadas.length, Math.ceil(50 / 8) * 2 + Math.ceil(20 / 8));
      const vistas = llamadas.flat();
      assert.strictEqual(vistas.length, 120);
      assert.strictEqual(new Set(vistas).size, 120);
      assert.strictEqual(vistos.length, 0);
    });
  } finally {
    restaurar();
  }
  ok("más de 100 candidatos siguen en pasadas de 50 revalidadas de a 8");
}

async function testAmbiguoNoDetiene() {
  const candidatos = [
    candidato("archivos/whatsapp/u/compartida.jpg"),
    candidato("archivos/whatsapp/u/flujo.jpg"),
    candidato("archivos/whatsapp/u/activo.jpg"),
    candidato("archivos/whatsapp/u/viejo.jpg"),
    candidato("seguimiento-v2-media/whatsapp/u/original.jpg"),
    candidato("rm24h-media/campana.jpg"),
  ];
  const borrados = [];
  const vistos = [];
  const restaurar = instalar({
    planificar: async () => ({ eliminar: true, valla: marcaLista() }),
    ejecutar: async (_plan, _clave, opciones) => opciones.borrarObjeto(),
    borrar: async (clave) => {
      borrados.push(clave);
      return { eliminado: true, storage: true, status: 200 };
    },
  });
  try {
    await conVariable("true", async () => {
      const recorrido = await cron.recorrerCandidatos(candidatos, {
        workerId: "limpieza-completa",
        validar: async (clave) => {
          vistos.push(clave);
          if (clave.endsWith("compartida.jpg")) return { apto: false, motivo: "compartida", abortar: false };
          if (clave.endsWith("flujo.jpg")) return { apto: false, motivo: "referenciada", abortar: false };
          if (clave.endsWith("activo.jpg")) return { apto: false, motivo: "hilo_activo", abortar: false };
          return { apto: true, motivo: "candidato", abortar: false, hilo: "u|c|591" };
        },
      });
      assert.strictEqual(recorrido.detener, false);
      assert.strictEqual(recorrido.codigo, 0);
      assert.strictEqual(recorrido.porMotivo.compartida, 1);
      assert.strictEqual(recorrido.porMotivo.referenciada, 1);
      assert.strictEqual(recorrido.porMotivo.hilo_activo, 1);
      assert.strictEqual(recorrido.porMotivo.bucket_protegido, 2);
      assert.deepStrictEqual(borrados, ["archivos/whatsapp/u/viejo.jpg"]);
      assert.ok(!vistos.some((clave) => clave.startsWith("seguimiento-v2-media/")));
      assert.ok(!vistos.some((clave) => clave.startsWith("rm24h-media/")));
      assert.strictEqual(reglas.esBucketExcluido("seguimiento-v2-media/whatsapp/u/original.jpg"), true);
      assert.strictEqual(reglas.esBucketExcluido("rm24h-media/campana.jpg"), true);
    });
  } finally {
    restaurar();
  }
  ok("ambiguos, flujos y buckets protegidos se saltan y el apto sigue");
}

async function testConsultaYCandadoDetienen() {
  const candidatos = lista(30);
  const restaurar = instalar({
    planificar: async () => {
      throw new Error("no debe planificar tras el fallo");
    },
    borrar: async () => {
      throw new Error("no debe borrar");
    },
  });
  try {
    const vistos = [];
    const fallo = await cron.recorrerCandidatos(candidatos, {
      workerId: "limpieza-completa",
      validar: async (clave) => {
        vistos.push(clave);
        if (vistos.length === 11) throw new Error("lectura de menciones");
        return { apto: true, motivo: "candidato", abortar: false };
      },
    });
    assert.strictEqual(fallo.detener, true);
    assert.strictEqual(fallo.codigo, 1);
    assert.strictEqual(fallo.motivo, "consulta_fallida");
    assert.strictEqual(fallo.clave, candidatos[10].clave);
    assert.strictEqual(vistos.length, 11);
    assert.strictEqual(fallo.storage, false);

    const candados = [];
    const candado = await cron.recorrerCandidatos(candidatos, {
      workerId: "limpieza-completa",
      validar: async (clave) => {
        candados.push(clave);
        if (candados.length === 5) return { apto: false, motivo: "candado_perdido", abortar: true };
        return { apto: true, motivo: "candidato", abortar: false };
      },
    });
    assert.strictEqual(candado.abortar, true);
    assert.strictEqual(candado.codigo, 1);
    assert.strictEqual(candado.motivo, "candado_perdido");
    assert.strictEqual(candados.length, 5);
    assert.strictEqual(candado.storage, false);
  } finally {
    restaurar();
  }
  ok("una consulta fallida o el candado perdido detienen la pasada");
}

async function testInciertoNoSeRepiteYLaSiguienteSigue() {
  const candidatos = lista(4);
  const borrados = [];
  const inciertos = new Set();
  const restaurar = instalar({
    planificar: async () => ({ eliminar: true, valla: marcaLista() }),
    ejecutar: async (_plan, clave, opciones) => {
      if (inciertos.has(clave)) {
        return {
          eliminado: false,
          incierto: true,
          previo: true,
          reintentar: false,
          storage: false,
          abortar: true,
          motivo: "resultado_incierto",
        };
      }
      return opciones.borrarObjeto();
    },
    borrar: async (clave) => {
      if (inciertos.has(clave)) throw new Error(`reintento de DELETE ${clave}`);
      borrados.push(clave);
      if (clave === candidatos[0].clave) {
        inciertos.add(clave);
        return {
          eliminado: false,
          incierto: true,
          abortar: true,
          reintentar: false,
          storage: true,
          motivo: "resultado_incierto",
        };
      }
      return { eliminado: true, storage: true, status: 200 };
    },
  });
  try {
    await conVariable("true", async () => {
      const primera = await cron.recorrerCandidatos(candidatos, {
        workerId: "limpieza-completa",
        validar: async () => ({ apto: true, motivo: "candidato", abortar: false, hilo: "u|c|591" }),
      });
      assert.strictEqual(primera.detener, true);
      assert.strictEqual(primera.codigo, 1);
      assert.strictEqual(primera.motivo, "resultado_incierto");
      assert.strictEqual(primera.paso.reintentar, false);
      assert.deepStrictEqual(borrados, [candidatos[0].clave]);

      const segunda = await cron.recorrerCandidatos(candidatos, {
        workerId: "limpieza-completa",
        validar: async () => ({ apto: true, motivo: "candidato", abortar: false, hilo: "u|c|591" }),
      });
      assert.strictEqual(segunda.detener, false);
      assert.strictEqual(segunda.codigo, 0);
      assert.strictEqual(segunda.borrados, 3);
      assert.strictEqual(borrados.filter((clave) => clave === candidatos[0].clave).length, 1);
      assert.deepStrictEqual(borrados.slice(1), candidatos.slice(1).map((item) => item.clave));
    });
  } finally {
    restaurar();
  }
  ok("el DELETE incierto detiene y la pasada siguiente no lo repite");
}

async function testTiempoYContinuacionSinDuplicar() {
  const candidatos = lista(130);
  const borrados = [];
  let reloj = 0;
  const restaurar = instalar({
    planificar: async () => ({ eliminar: true, valla: marcaLista() }),
    ejecutar: async (_plan, _clave, opciones) => opciones.borrarObjeto(),
    borrar: async (clave) => {
      if (borrados.includes(clave)) throw new Error(`duplicado ${clave}`);
      borrados.push(clave);
      if (borrados.length === 60) reloj = 1000;
      return { eliminado: true, storage: true, status: 200 };
    },
  });
  try {
    await conVariable("true", async () => {
      const cortada = await cron.recorrerCandidatos(candidatos, {
        workerId: "limpieza-completa",
        inicioMs: 0,
        presupuestoMs: 1000,
        ahoraMs: () => reloj,
        validar: async (clave) => {
          if (borrados.includes(clave)) return { apto: false, motivo: "objeto_ausente", abortar: false };
          return { apto: true, motivo: "candidato", abortar: false, hilo: "u|c|591" };
        },
      });
      assert.strictEqual(cortada.detener, true);
      assert.strictEqual(cortada.codigo, 0);
      assert.strictEqual(cortada.motivo, "tiempo_agotado");
      assert.strictEqual(cortada.borrados, 60);
      assert.strictEqual(borrados.length, 60);
      assert.ok(cortada.pendientes > 0);

      reloj = 0;
      const resto = candidatos.slice(60);
      const siguiente = await cron.recorrerCandidatos(resto, {
        workerId: "limpieza-completa",
        inicioMs: 0,
        presupuestoMs: 1000,
        ahoraMs: () => 0,
        validar: async () => ({ apto: true, motivo: "candidato", abortar: false, hilo: "u|c|591" }),
      });
      assert.strictEqual(siguiente.detener, false);
      assert.strictEqual(siguiente.borrados, 70);
      assert.strictEqual(borrados.length, 130);
      assert.strictEqual(new Set(borrados).size, 130);

      const repetida = await cron.recorrerCandidatos(candidatos, {
        workerId: "limpieza-completa",
        validar: async () => ({ apto: false, motivo: "objeto_ausente", abortar: false }),
        planificar: async () => {
          throw new Error("un objeto ya borrado no se planifica");
        },
      });
      assert.strictEqual(repetida.detener, false);
      assert.strictEqual(repetida.borrados, 0);
      assert.strictEqual(borrados.length, 130);
    });
  } finally {
    restaurar();
  }
  ok("el tiempo corta con margen y la siguiente pasada no duplica borrados");
}

async function testLoteProtegeCompartidoYFlujo() {
  const flujo = "archivos/whatsapp/u/flujo.jpg";
  const compartida = "archivos/whatsapp/u/dos-hilos.jpg";
  const apto = "archivos/whatsapp/u/viejo.jpg";
  const seg = "seguimiento-v2-media/a.jpg";
  const rm = "rm24h-media/b.jpg";
  const candidatos = [seg, flujo, compartida, apto, rm].map(candidato);
  const grupos = [];
  const borrados = [];
  const restaurar = instalar({
    revalidar: async (claves) => {
      grupos.push(claves.slice());
      return {
        abortar: false,
        tiempos: {},
        resultados: claves.map((clave) => {
          if (clave === flujo) return { clave, apto: false, motivo: "referenciada" };
          if (clave === compartida) return { clave, apto: false, motivo: "compartida" };
          return { clave, apto: true, motivo: "candidato" };
        }),
      };
    },
    validar: async (clave) => {
      assert.strictEqual(clave, apto);
      return { apto: true, motivo: "candidato", abortar: false, hilo: "u|c|591" };
    },
    planificar: async (clave) => {
      assert.strictEqual(clave, apto);
      return { eliminar: true, valla: marcaLista() };
    },
    ejecutar: async (_plan, _clave, opciones) => opciones.borrarObjeto(),
    borrar: async (clave) => {
      borrados.push(clave);
      return { eliminado: true, storage: true, status: 200 };
    },
  });
  try {
    await conVariable("true", async () => {
      const recorrido = await cron.recorrerCandidatos(candidatos, {
        workerId: "limpieza-completa",
      });
      assert.strictEqual(recorrido.detener, false);
      assert.deepStrictEqual(borrados, [apto]);
      assert.ok(grupos.every((grupo) => grupo.length <= 8));
      const enviadas = grupos.flat();
      assert.ok(!enviadas.includes(seg));
      assert.ok(!enviadas.includes(rm));
      assert.ok(enviadas.includes(flujo));
      assert.ok(enviadas.includes(compartida));
      assert.strictEqual(recorrido.porMotivo.referenciada, 1);
      assert.strictEqual(recorrido.porMotivo.compartida, 1);
      assert.strictEqual(recorrido.porMotivo.bucket_protegido, 2);
    });
  } finally {
    restaurar();
  }
  ok("el lote no borra flujos, recursos compartidos ni buckets excluidos");
}

async function main() {
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.strictEqual(cron.TAMANO_PASADA === 50 || cron.TAMANO_PASADA === 100, true);
  await testMasDeCienYPasadas();
  await testAmbiguoNoDetiene();
  await testConsultaYCandadoDetienen();
  await testInciertoNoSeRepiteYLaSiguienteSigue();
  await testTiempoYContinuacionSinDuplicar();
  await testLoteProtegeCompartidoYFlujo();
  assert.strictEqual(process.env.LIMPIEZA_MEDIA_BORRAR, undefined);
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  console.log(`${passed} pruebas ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
