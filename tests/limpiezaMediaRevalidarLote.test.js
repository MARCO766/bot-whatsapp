/**
 * Paridad entre la revalidación de a un candidato y la revalidación por lotes.
 * No llama a Supabase ni al cron de producción.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const reglas = require("../services/limpiezaMedia/reglas");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");
const lote = require("../services/limpiezaMedia/limpiezaMediaRevalidarLote");
const cron = require("../scripts/limpieza-media-cron");

const AHORA = new Date("2026-11-15T00:00:00.000Z");
const VIEJO = "2026-01-01T00:00:00.000Z";
const RECIENTE = "2026-11-10T00:00:00.000Z";

function contiene(texto, ruta) {
  return String(texto || "").toLowerCase().includes(String(ruta).toLowerCase());
}

function mundoVacio() {
  const mundo = { storage: {}, mensajes: [], seguimientos_v2: [] };
  for (const consulta of servicio.CONSULTAS_TEXTO) mundo[consulta.tabla] = [];
  return mundo;
}

function citar(ruta) {
  return `https://proj.supabase.co/storage/v1/object/public/archivos/${ruta}`;
}

function mensaje(ruta, extra) {
  return {
    usuario_id: "u1",
    conexion_whatsapp_id: "c1",
    cliente_numero: "59170000001",
    direccion: "entrante",
    creado_en: VIEJO,
    imagen_url: citar(ruta),
    contenido: "",
    ...extra,
  };
}

function payloadMenciones(clave, mundo) {
  const ruta = reglas.sinBucket(clave);
  if (!reglas.segmentoFiltroSeguro(ruta)) {
    return { clave, error: "ruta_no_filtrable", truncada: false, filas: [], filename: false, textos: [] };
  }
  const crudas = mundo.mensajes.filter(
    (fila) => contiene(fila.imagen_url, ruta) || contiene(fila.contenido, ruta)
  );
  return {
    clave,
    error: null,
    truncada: crudas.length >= 100,
    filas: crudas.slice(0, 100),
    filename: false,
    textos: [],
  };
}

function payloadReferencias(clave, mundo) {
  const ruta = reglas.sinBucket(clave);
  const archivo = reglas.nombreArchivo(clave);
  const filename = (mundo.seguimientos_v2 || []).some(
    (fila) => String(fila.media_filename || "") === archivo
  );
  if (filename) {
    return { clave, error: null, truncada: false, filas: [], filename: true, textos: [] };
  }
  const textos = servicio.CONSULTAS_TEXTO.map((consulta) => {
    const crudas = (mundo[consulta.tabla] || []).filter((fila) =>
      consulta.columnas.some((columna) => contiene(fila?.[columna], ruta))
    );
    const filas = crudas.slice(0, 5).map((fila) => {
      const proyectada = {};
      for (const columna of consulta.columnas) proyectada[columna] = fila[columna];
      return proyectada;
    });
    return { tabla: consulta.tabla, truncada: crudas.length >= 5, filas };
  });
  return { clave, error: null, truncada: false, filas: [], filename: false, textos };
}

function payloadEntrantes(hilos, mundo) {
  return (hilos || []).map((hilo) => {
    if (!/^[0-9]+$/.test(String(hilo.cliente_numero || ""))) {
      return { ...hilo, error: "hilo_no_filtrable", creado_en: null };
    }
    const filas = mundo.mensajes
      .filter((fila) =>
        fila.direccion === "entrante"
        && String(fila.usuario_id) === String(hilo.usuario_id)
        && String(fila.conexion_whatsapp_id) === String(hilo.conexion_whatsapp_id)
        && String(fila.cliente_numero) === String(hilo.cliente_numero)
      )
      .sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)));
    return { ...hilo, error: null, creado_en: filas[0]?.creado_en || null };
  });
}

function consultarDe(mundo, efectos) {
  const fases = [];
  return {
    fases,
    async consultar({ fase, claves, hilos }) {
      fases.push(fase);
      if (typeof efectos?.alConsultar === "function") efectos.alConsultar(fase, mundo);
      if (fase === "menciones") {
        return { error: null, filas: (claves || []).map((clave) => payloadMenciones(clave, mundo)) };
      }
      if (fase === "referencias") {
        return { error: null, filas: (claves || []).map((clave) => payloadReferencias(clave, mundo)) };
      }
      if (fase === "entrantes") return { error: null, filas: payloadEntrantes(hilos, mundo) };
      return { error: "fase_desconocida", filas: [] };
    },
  };
}

function listarDe(mundo, contador) {
  return async function listar({ prefix, offset, limit }) {
    if (contador) contador.storage += 1;
    const filas = mundo.storage[prefix] || [];
    return filas.slice(offset || 0, (offset || 0) + limit);
  };
}

function parCompare(a, b) {
  const tiempoA = String(a.creado_en);
  const tiempoB = String(b.creado_en);
  if (tiempoA < tiempoB) return -1;
  if (tiempoA > tiempoB) return 1;
  const idA = String(a.id);
  const idB = String(b.id);
  if (idA < idB) return -1;
  if (idA > idB) return 1;
  return 0;
}

function paginarMensajesDe(mundo, registro, alterar) {
  const secuencia = { n: 0 };
  function asegurar(fila) {
    if (fila.id == null || fila.id === "") {
      secuencia.n += 1;
      fila.id = `00000000-0000-4000-8000-${secuencia.n.toString(16).padStart(12, "0")}`;
    }
    return fila;
  }
  function conFecha() {
    return mundo.mensajes
      .map(asegurar)
      .filter((fila) => typeof fila.creado_en === "string" && fila.creado_en.length > 0)
      .slice()
      .sort(parCompare);
  }
  return async function leer(pedido) {
    if (registro) {
      registro.push({
        tipo: pedido.tipo,
        despues: pedido.despues ? { creado_en: pedido.despues.creado_en, id: pedido.despues.id } : null,
      });
    }
    if (pedido.tipo === "nulos") {
      return mundo.mensajes
        .filter((fila) => fila.creado_en == null || fila.creado_en === "")
        .map((fila) => ({ ...fila }));
    }
    if (pedido.tipo !== "completa") return [];
    const filas = conFecha();
    let seleccion = filas;
    if (pedido.despues) seleccion = seleccion.filter((fila) => parCompare(fila, pedido.despues) > 0);
    const pagina = seleccion.slice(0, pedido.limite).map((fila) => ({ ...fila }));
    if (typeof alterar === "function") alterar(pedido, mundo);
    return pagina;
  };
}

async function veredictoAnterior(clave, mundo, opciones, contador) {
  const io = {
    async existeObjeto() {
      const ruta = reglas.sinBucket(clave);
      const barra = ruta.lastIndexOf("/");
      const carpeta = barra >= 0 ? ruta.slice(0, barra) : "";
      const items = mundo.storage[carpeta] || [];
      const paginas = Math.max(1, Math.ceil(items.length / 100));
      contador.storage += paginas;
      return items.some((item) => {
        const unida = reglas.rutaListada(carpeta, item.name);
        return unida === ruta || item.name === ruta;
      });
    },
    async leerMenciones() {
      contador.menciones += 1;
      return servicio.mencionesDesdeFilas(clave, payloadMenciones(clave, mundo).filas);
    },
    async tieneReferenciaProtegida(pedido) {
      if (typeof opciones.efectos?.alConsultar === "function") {
        opciones.efectos.alConsultar("referencias", mundo);
      }
      return servicio.tieneReferenciaProtegidaReal(pedido, {
        async leer(ruta) {
          contador.referencias += 1;
          const texto = String(ruta);
          if (texto.includes("media_filename=eq.")) {
            const archivo = reglas.nombreArchivo(clave);
            const hay = (mundo.seguimientos_v2 || []).some(
              (fila) => String(fila.media_filename || "") === archivo
            );
            return hay ? [{ media_filename: archivo }] : [];
          }
          const tabla = texto.split("/rest/v1/")[1]?.split("?")[0];
          const bloque = payloadReferencias(clave, mundo).textos.find((item) => item.tabla === tabla);
          if (!bloque) return [];
          if (bloque.truncada) return Array.from({ length: 5 }, () => bloque.filas[0] || {});
          return bloque.filas;
        },
      });
    },
    async leerUltimoEntrante(fila) {
      contador.entrantes += 1;
      const hallado = payloadEntrantes([fila], mundo)[0];
      if (hallado?.error) {
        const error = new Error(hallado.error);
        error.consulta = "mensajes.ultimo_entrante";
        throw error;
      }
      return reglas.parseCreadoEnUtc(hallado?.creado_en);
    },
  };
  const veredicto = await servicio.revalidarCandidato(clave, {
    io,
    protegidas: opciones.protegidas || new Set(),
    nombresProtegidos: opciones.nombresProtegidos || new Set(),
    ahora: AHORA,
  });
  contador.candado += 1;
  return veredicto;
}

async function veredictoNuevo(claves, mundo, opciones = {}, efectos) {
  const fases = [];
  const puente = consultarDe(mundo, efectos || opciones.efectos);
  const resultado = await lote.revalidarLote(claves, {
    workerId: "limpieza-prueba",
    ahora: AHORA,
    dias: opciones.dias,
    protegidas: opciones.protegidas || new Set(),
    nombresProtegidos: opciones.nombresProtegidos || new Set(),
    consultar: async (pedido) => {
      fases.push(pedido.fase);
      return puente.consultar(pedido);
    },
    listarStorage: opciones.listarStorage || listarDe(mundo),
    candado: async () => ({ ok: true }),
    lecturaMenciones: opciones.lecturaMenciones,
    leerPaginaMensajes: opciones.leerPaginaMensajes || paginarMensajesDe(mundo),
    alFase: (fase) => fases.push(fase),
  });
  return { ...resultado, fases };
}

function ponerArchivo(mundo, ruta) {
  const barra = ruta.lastIndexOf("/");
  const carpeta = ruta.slice(0, barra);
  const nombre = ruta.slice(barra + 1);
  if (!mundo.storage[carpeta]) mundo.storage[carpeta] = [];
  mundo.storage[carpeta].push({ name: nombre, id: nombre });
}

async function comparar(nombre, clave, mundo, opciones = {}) {
  const anteriorContador = { storage: 0, menciones: 0, referencias: 0, entrantes: 0, candado: 0 };
  const anterior = await veredictoAnterior(clave, mundo, opciones, anteriorContador);
  const nuevo = await veredictoNuevo([clave], mundo, opciones, opciones.efectos);
  const hallado = nuevo.resultados[0];
  assert.ok(hallado, nombre);
  assert.strictEqual(hallado.motivo, anterior.motivo, nombre);
  assert.strictEqual(hallado.apto, anterior.apto === true, nombre);
  return { anterior, nuevo, anteriorContador };
}

async function testParidad() {
  const ruta = "whatsapp/u1/foto.jpg";
  const clave = `archivos/${ruta}`;

  const inactivo = mundoVacio();
  ponerArchivo(inactivo, ruta);
  inactivo.mensajes.push(mensaje(ruta));
  const base = await comparar("inactivo 30 días", clave, inactivo);
  assert.strictEqual(base.anterior.motivo, "candidato");
  assert.deepStrictEqual(base.nuevo.fases, ["menciones", "referencias", "menciones", "entrantes"]);

  const saliente = mundoVacio();
  ponerArchivo(saliente, ruta);
  saliente.mensajes.push(mensaje(ruta));
  saliente.mensajes.push(mensaje(ruta, { direccion: "saliente", creado_en: RECIENTE }));
  const sigue = await comparar("un saliente no reinicia el plazo", clave, saliente);
  assert.strictEqual(sigue.anterior.motivo, "candidato");

  const activo = mundoVacio();
  ponerArchivo(activo, ruta);
  activo.mensajes.push(mensaje(ruta, { creado_en: RECIENTE }));
  const vivo = await comparar("entrante reciente", clave, activo);
  assert.strictEqual(vivo.anterior.motivo, "hilo_activo");

  const compartido = mundoVacio();
  ponerArchivo(compartido, ruta);
  compartido.mensajes.push(mensaje(ruta));
  compartido.mensajes.push(mensaje(ruta, { cliente_numero: "59170000002" }));
  const dos = await comparar("archivo compartido", clave, compartido);
  assert.strictEqual(dos.anterior.motivo, "compartida");
  assert.strictEqual(dos.anteriorContador.entrantes, 0);

  const campana = mundoVacio();
  ponerArchivo(campana, ruta);
  campana.mensajes.push(mensaje(ruta));
  campana.conversaciones.push({ ultimo_mensaje: citar(ruta) });
  const citada = await comparar("referencia de conversación", clave, campana);
  assert.strictEqual(citada.anterior.motivo, "referenciada");

  const paso = mundoVacio();
  ponerArchivo(paso, ruta);
  paso.mensajes.push(mensaje(ruta));
  paso.flujo_pasos.push({ contenido: `adjunto ${citar(ruta)} fin`, imagen_url: "", boton_texto: "", boton_id: "" });
  const flujo = await comparar("referencia de flujo", clave, paso);
  assert.strictEqual(flujo.anterior.motivo, "referenciada");

  const nombre = mundoVacio();
  ponerArchivo(nombre, ruta);
  nombre.mensajes.push(mensaje(ruta));
  nombre.seguimientos_v2.push({ media_filename: "foto.jpg", media_url: "", contenido: "", error_detalle: "" });
  const archivo = await comparar("nombre de seguimiento", clave, nombre);
  assert.strictEqual(archivo.anterior.motivo, "referenciada");
  assert.strictEqual(archivo.anteriorContador.referencias, 1);

  const falso = mundoVacio();
  const rutaGuion = "whatsapp/u1/mi_foto.jpg";
  const claveGuion = `archivos/${rutaGuion}`;
  ponerArchivo(falso, rutaGuion);
  falso.mensajes.push({
    ...mensaje(rutaGuion),
    imagen_url: citar("whatsapp/u1/miXfoto.jpg"),
  });
  const noEs = await comparar("un ilike de '_' no cita otra ruta", claveGuion, falso);
  assert.strictEqual(noEs.anterior.motivo, "sin_referencia");

  const ausente = mundoVacio();
  ausente.mensajes.push(mensaje(ruta));
  const sinObjeto = await comparar("objeto ausente", clave, ausente);
  assert.strictEqual(sinObjeto.anterior.motivo, "objeto_ausente");

  const ajeno = "seguimiento-v2-media/u/original.jpg";
  const bucket = await comparar("bucket excluido", ajeno, mundoVacio());
  assert.strictEqual(bucket.anterior.motivo, "bucket_protegido");

  const carrera = mundoVacio();
  ponerArchivo(carrera, ruta);
  carrera.mensajes.push(mensaje(ruta));
  const efectos = {
    alConsultar(fase, actual) {
      if (fase === "referencias" && !actual.ya) {
        actual.ya = true;
        actual.mensajes.push(mensaje(ruta, { creado_en: RECIENTE }));
      }
    },
  };
  const entranteNuevo = await comparar("entrante nuevo durante las referencias", clave, carrera, { efectos });
  assert.strictEqual(entranteNuevo.anterior.motivo, "hilo_activo");
  assert.ok(entranteNuevo.nuevo.fases.indexOf("referencias") < entranteNuevo.nuevo.fases.lastIndexOf("menciones"));

  console.log("paridad", {
    casos: 10,
    candidato: base.anterior.motivo,
    saliente: sigue.anterior.motivo,
    activo: vivo.anterior.motivo,
    compartida: dos.anterior.motivo,
    conversacion: citada.anterior.motivo,
    flujo: flujo.anterior.motivo,
    seguimiento: archivo.anterior.motivo,
    guion: noEs.anterior.motivo,
    ausente: sinObjeto.anterior.motivo,
    bucket: bucket.anterior.motivo,
    carrera: entranteNuevo.anterior.motivo,
  });
}

function armarVolumen(cantidad) {
  const mundo = mundoVacio();
  const claves = [];
  for (let i = 0; i < cantidad; i += 1) {
    const ruta = `whatsapp/u${Math.floor(i / 20)}/f${i}.jpg`;
    claves.push(`archivos/${ruta}`);
    ponerArchivo(mundo, ruta);
    mundo.mensajes.push(mensaje(ruta, {
      usuario_id: `u${Math.floor(i / 20)}`,
      cliente_numero: "59170000009",
    }));
  }
  mundo.flujo_pasos.push({
    contenido: citar("whatsapp/u0/f0.jpg"),
    imagen_url: "",
    boton_texto: "",
    boton_id: "",
  });
  return { mundo, claves };
}

async function medir(cantidad) {
  const { mundo, claves } = armarVolumen(cantidad);
  const anterior = { storage: 0, menciones: 0, referencias: 0, entrantes: 0, candado: 0 };
  const t0 = Date.now();
  for (const clave of claves) {
    await veredictoAnterior(clave, mundo, {}, anterior);
  }
  const msAnterior = Date.now() - t0;
  const nuevo = { storage: 0, menciones: 0, referencias: 0, entrantes: 0, candado: 0 };
  const t1 = Date.now();
  const motivos = [];
  const lectura = lote.crearLecturaMenciones(claves);
  const leerPaginaMensajes = paginarMensajesDe(mundo);
  for (let i = 0; i < claves.length; i += lote.TAMANO_LOTE) {
    const grupo = claves.slice(i, i + lote.TAMANO_LOTE);
    const resultado = await veredictoNuevo(grupo, mundo, { lecturaMenciones: lectura, leerPaginaMensajes });
    for (const tipo of Object.keys(nuevo)) nuevo[tipo] += resultado.consultas[tipo];
    motivos.push(...resultado.resultados.map((item) => item.motivo));
  }
  assert.strictEqual(lectura.pasadasExistentes, 1, `pasadas ${cantidad}`);
  assert.ok(lectura.paginasCompletas >= Math.ceil(cantidad / lote.PAGINA_MENSAJES), `paginas ${cantidad}`);
  const msNuevo = Date.now() - t1;
  const total = (contador) => Object.values(contador).reduce((suma, valor) => suma + valor, 0);
  assert.strictEqual(motivos.filter((motivo) => motivo === "referenciada").length, 1);
  assert.strictEqual(motivos.filter((motivo) => motivo === "candidato").length, cantidad - 1);
  assert.ok(total(nuevo) < total(anterior) / 10);
  return { cantidad, anterior, nuevo, totalAnterior: total(anterior), totalNuevo: total(nuevo), msAnterior, msNuevo };
}

async function testVolumen() {
  const mediciones = [];
  for (const cantidad of [184, 681, 1184]) mediciones.push(await medir(cantidad));
  console.log("volumen", mediciones);
  const tope = Math.ceil(1184 / lote.TAMANO_LOTE) * 8;
  assert.ok(mediciones[2].totalNuevo <= tope, `${mediciones[2].totalNuevo} > ${tope}`);
  assert.strictEqual(mediciones[2].totalAnterior, 1184 * 15);
}

async function testFalloCandadoYCron() {
  const ruta = "whatsapp/u1/foto.jpg";
  const clave = `archivos/${ruta}`;
  const mundo = mundoVacio();
  ponerArchivo(mundo, ruta);
  mundo.mensajes.push(mensaje(ruta));
  const puente = consultarDe(mundo);
  const perdido = await lote.revalidarLote([clave], {
    workerId: "limpieza-prueba",
    ahora: AHORA,
    consultar: puente.consultar,
    listarStorage: listarDe(mundo),
    leerPaginaMensajes: paginarMensajesDe(mundo),
    candado: async () => ({ ok: false, motivo: "candado_perdido" }),
  });
  assert.strictEqual(perdido.abortar, true);
  assert.strictEqual(perdido.resultados.length, 0);

  const muchos = mundoVacio();
  const claves = ["whatsapp/u9/a.jpg", "whatsapp/u9/b.jpg", "whatsapp/u9/c.jpg"].map((item) => `archivos/${item}`);
  for (const item of claves) {
    ponerArchivo(muchos, reglas.sinBucket(item));
    muchos.mensajes.push(mensaje(reglas.sinBucket(item), { usuario_id: "u9" }));
  }
  for (let i = 0; i < 100; i += 1) {
    muchos.mensajes.push(mensaje("whatsapp/u9/b.jpg", {
      usuario_id: "u9",
      cliente_numero: String(59180000000 + i),
    }));
  }
  const recorrido = await cron.recorrerCandidatos(
    claves.map((item) => ({ clave: item, categoria: "candidato", motivo: "candidato", bytes: 3 })),
    {
      workerId: "limpieza-prueba",
      ahora: AHORA,
      consultar: consultarDe(muchos).consultar,
      listarStorage: listarDe(muchos),
      leerPaginaMensajes: paginarMensajesDe(muchos),
      candado: async () => ({ ok: true }),
    }
  );
  assert.strictEqual(recorrido.detener, true);
  assert.strictEqual(recorrido.codigo, 1);
  assert.strictEqual(recorrido.clave, claves[1]);
  assert.strictEqual(recorrido.motivo, "consulta_fallida");
  assert.strictEqual(recorrido.aptos, 1);
  assert.strictEqual(recorrido.storage, false);
  assert.strictEqual(recorrido.marca, false);
}

function testMigracionYBarreras() {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/limpieza_media_revalidar_lote.sql"),
    "utf8"
  );
  const trgm = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/limpieza_media_trgm_indices.sql"),
    "utf8"
  );
  assert.ok(sql.includes("direccion = 'entrante'"));
  assert.ok(sql.includes("n <= 100"));
  assert.ok(sql.includes(">= 100"));
  assert.ok(sql.includes("n <= 5"));
  assert.ok(sql.includes(">= 5"));
  assert.match(sql, /s\.media_filename\s*=\s*any\s*\(\s*v_archivos\s*\)/);
  assert.ok(!/\bforeach\b/i.test(sql));
  assert.strictEqual(sql.split("from public.mensajes m").length - 1, 2);
  assert.ok(sql.includes("as materialized"));
  for (const consulta of servicio.CONSULTAS_TEXTO) {
    const lecturas = sql.split(`from public.${consulta.tabla} `).length - 1;
    const esperadas = consulta.tabla === "seguimientos_v2" ? 2 : 1;
    assert.strictEqual(lecturas, esperadas, consulta.tabla);
  }
  assert.ok(!/\bdelete\s+from\b/i.test(sql));
  assert.ok(!/\bupdate\s+public\./i.test(sql));
  assert.ok(!/\binsert\s+into\b/i.test(sql));
  assert.ok(sql.includes("tipo_incompatible"));
  assert.ok(sql.includes("coalesce(m.contenido::text, ''::text)"));
  assert.ok(sql.includes("m.contenido is not null"));
  assert.ok(sql.includes("v_total > 8"));
  assert.strictEqual(lote.TAMANO_LOTE, 8);
  assert.strictEqual(lote.TOPE_MENCIONES_POR_RUTA, 100);
  assert.strictEqual(reglas.DIAS_INACTIVIDAD, 30);
  for (const consulta of servicio.CONSULTAS_TEXTO) {
    assert.ok(sql.includes(`'${consulta.tabla}'`), consulta.tabla);
    for (const columna of consulta.columnas) assert.ok(sql.includes(columna), columna);
  }
  assert.ok(trgm.includes("gin_trgm_ops"));
  assert.ok(trgm.includes("coalesce(contenido::text, ''::text)"));
  assert.ok(trgm.includes("NO APLICAR"));
  assert.ok(!/^\s*create\s+(index|extension)\b/im.test(trgm));
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  const eliminar = fs.readFileSync(
    path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaEliminar.js"),
    "utf8"
  );
  const cronSrc = fs.readFileSync(
    path.join(__dirname, "../scripts/limpieza-media-cron.js"),
    "utf8"
  );
  const loteSrc = fs.readFileSync(
    path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaRevalidarLote.js"),
    "utf8"
  );
  assert.ok(eliminar.indexOf('motivo: "bloqueada"') < eliminar.indexOf("cliente.delete"));
  assert.ok(!loteSrc.includes("client.delete"));
  assert.ok(!loteSrc.includes("axios.delete"));
  assert.ok(!cronSrc.includes("Promise.all"));
  assert.ok(cronSrc.includes("mensajeCursor"));
  assert.ok(cronSrc.includes("recorrerCandidatosEnLote"));
  assert.ok(cronSrc.includes("inventarioStorage"));
  assert.ok(cronSrc.includes("menciones2Ms"));
  assert.ok(cronSrc.includes("[LIMPIEZA_MEDIA_CRON] fases"));
  assert.ok(loteSrc.includes("crearInventarioStorage"));
  assert.ok(loteSrc.includes("order=creado_en.asc,id.asc"));
  assert.ok(!loteSrc.includes("order=creado_en.desc,id.desc"));
  assert.ok(!loteSrc.includes("id.lte"));
  assert.ok(!loteSrc.includes("order=id.asc"));
  assert.ok(!loteSrc.includes("order=id.desc"));
  assert.ok(loteSrc.includes("quietas < 2"));
  assert.ok(loteSrc.includes("citaRutaCompleta"));
  const referencias = loteSrc.indexOf('fase: "referencias"');
  const segunda = loteSrc.indexOf('tomar("menciones2Ms"');
  assert.ok(referencias >= 0 && segunda > referencias);
}

async function testPaginacionPorId() {
  const vistos = [];
  const mensajes = [];
  const resultado = await servicio.ejecutarLimpiezaMedia({
    env: { LIMPIEZA_MEDIA_ACTIVA: "true" },
    ahora: AHORA,
    estado: servicio.crearEstado(),
    maxMs: 10000,
    maxPaginas: 80,
    pageSize: 2,
    io: {
      async leerFuente({ porId, offset, despuesDeId }) {
        assert.strictEqual(porId, true);
        assert.strictEqual(offset, undefined);
        vistos.push(despuesDeId || "");
        return [];
      },
      async leerMensajes({ offset, despuesDeId, limit }) {
        assert.strictEqual(offset, undefined);
        mensajes.push(despuesDeId || "");
        const filas = [
          { id: "00000001", usuario_id: "u", conexion_whatsapp_id: "c", cliente_numero: "1", creado_en: VIEJO, direccion: "entrante" },
          { id: "00000002", usuario_id: "u", conexion_whatsapp_id: "c", cliente_numero: "1", creado_en: VIEJO, direccion: "entrante" },
          { id: "00000003", usuario_id: "u", conexion_whatsapp_id: "c", cliente_numero: "1", creado_en: VIEJO, direccion: "entrante" },
        ];
        const siguientes = despuesDeId ? filas.filter((fila) => fila.id > despuesDeId) : filas;
        return siguientes.slice(0, limit);
      },
      async listarStorage() {
        return [];
      },
    },
  });
  assert.strictEqual(resultado.completo, true);
  assert.ok(vistos.length > 0);
  assert.ok(mensajes.includes(""));
  assert.ok(mensajes.includes("00000002"));
}

async function testInventarioStorage() {
  const mundo = mundoVacio();
  const claves = [];
  for (let i = 0; i < 10; i += 1) {
    const ruta = `whatsapp/misma/f${i}.jpg`;
    claves.push(`archivos/${ruta}`);
    ponerArchivo(mundo, ruta);
    mundo.mensajes.push(mensaje(ruta, { cliente_numero: String(59172000000 + i) }));
  }
  let listas = 0;
  const listar = async (pedido) => {
    listas += 1;
    return listarDe(mundo)(pedido);
  };
  const lectura = lote.crearLecturaMenciones();
  const recorrido = await cron.recorrerCandidatos(
    claves.map((clave) => ({ clave, categoria: "candidato", motivo: "candidato", bytes: 4 })),
    {
      workerId: "limpieza-prueba",
      ahora: AHORA,
      consultar: consultarDe(mundo).consultar,
      listarStorage: listar,
      lecturaMenciones: lectura,
      leerPaginaMensajes: paginarMensajesDe(mundo),
      candado: async () => ({ ok: true }),
    }
  );
  assert.strictEqual(lectura.pasadasExistentes, 1);
  assert.strictEqual(recorrido.detener, false);
  assert.strictEqual(recorrido.codigo, 0);
  assert.strictEqual(listas, 1);
  assert.strictEqual(recorrido.storage, false);
  for (const fase of ["storageMs", "mencionesMs", "referenciasMs", "menciones2Ms", "entrantesMs"]) {
    assert.ok(Number.isFinite(recorrido.tiempos[fase]), fase);
  }

  const clave = "archivos/whatsapp/u1/foto.jpg";
  const cache = lote.crearInventarioStorage();
  let paginas = 0;
  const lleno = async () => {
    paginas += 1;
    return Array.from({ length: 100 }, (_, i) => ({
      name: `otro-${paginas}-${i}.jpg`,
      id: `${paginas}-${i}`,
    }));
  };
  const consultar = async () => ({
    error: null,
    filas: [{ clave, error: null, truncada: false, filas: [], filename: false, textos: [] }],
  });
  const base = {
    workerId: "limpieza-prueba",
    ahora: AHORA,
    consultar,
    listarStorage: lleno,
    inventarioStorage: cache,
    leerPaginaMensajes: async () => [],
    candado: async () => ({ ok: true }),
  };
  const primero = await lote.revalidarLote([clave], base);
  assert.strictEqual(primero.resultados[0].motivo, "consulta_fallida");
  assert.notStrictEqual(primero.resultados[0].motivo, "objeto_ausente");
  assert.strictEqual(primero.resultados[0].apto, false);
  const usadas = paginas;
  assert.ok(usadas > 1);
  const segundo = await lote.revalidarLote([clave], base);
  assert.strictEqual(paginas, usadas);
  assert.strictEqual(segundo.resultados[0].motivo, "consulta_fallida");
  assert.notStrictEqual(segundo.resultados[0].motivo, "objeto_ausente");
}

async function testLimitesIguales() {
  const ruta = "whatsapp/u1/foto.jpg";
  const clave = `archivos/${ruta}`;

  const muchas = mundoVacio();
  ponerArchivo(muchas, ruta);
  for (let i = 0; i < 100; i += 1) {
    muchas.mensajes.push(mensaje(ruta, { cliente_numero: String(59173000000 + i) }));
  }
  const lleno = await comparar("cien menciones detienen igual", clave, muchas);
  assert.strictEqual(lleno.anterior.motivo, "consulta_fallida");
  assert.strictEqual(lleno.nuevo.resultados[0].motivo, "consulta_fallida");

  const refs = mundoVacio();
  ponerArchivo(refs, ruta);
  refs.mensajes.push(mensaje(ruta));
  for (let i = 0; i < 5; i += 1) refs.conversaciones.push({ ultimo_mensaje: citar(ruta) });
  const cortado = await comparar("cinco referencias detienen igual", clave, refs);
  assert.strictEqual(cortado.anterior.motivo, "consulta_fallida");
  assert.strictEqual(cortado.nuevo.resultados[0].motivo, "consulta_fallida");

  const compartido = mundoVacio();
  ponerArchivo(compartido, ruta);
  compartido.mensajes.push(mensaje(ruta));
  compartido.mensajes.push(mensaje(ruta, { cliente_numero: "59170000002" }));
  const dos = await comparar("compartido sigue igual", clave, compartido);
  assert.strictEqual(dos.anterior.motivo, "compartida");
  assert.strictEqual(dos.nuevo.resultados[0].motivo, "compartida");
  assert.strictEqual(dos.nuevo.resultados[0].apto, false);
}

function errorHttp(status, data, message) {
  const error = new Error(message || "fallo");
  error.response = { status, data };
  return error;
}

async function testNoReintenta57014() {
  assert.strictEqual(lote.esCancelacion57014(errorHttp(500, { code: "57014", message: "canceling statement due to statement timeout" })), true);
  assert.strictEqual(lote.esCancelacion57014(errorHttp(500, "57014")), true);
  assert.strictEqual(lote.esCancelacion57014(errorHttp(503, { code: "PGRST000", message: "upstream" })), false);

  let llamadas = 0;
  await assert.rejects(() => lote.conReintento(async () => {
    llamadas += 1;
    throw errorHttp(500, { code: "57014", message: "canceling statement due to statement timeout" });
  }));
  assert.strictEqual(llamadas, 1);

  llamadas = 0;
  await assert.rejects(() => lote.conReintento(async () => {
    llamadas += 1;
    throw errorHttp(400, { code: "22P02", message: "invalid" });
  }));
  assert.strictEqual(llamadas, 1);

  llamadas = 0;
  await assert.rejects(() => lote.conReintento(async () => {
    llamadas += 1;
    throw errorHttp(503, { message: "upstream" });
  }));
  assert.strictEqual(llamadas, 4);
}

function mundoConCita(ruta, id, creado) {
  const mundo = mundoVacio();
  ponerArchivo(mundo, ruta);
  mundo.mensajes.push(mensaje(ruta, { id, creado_en: creado || VIEJO }));
  return mundo;
}

function inyectarOtroHilo(actual, ruta, creado) {
  if (actual.ya) return false;
  actual.ya = true;
  actual.mensajes.push(mensaje(ruta, {
    id: "00000000-0000-4000-8000-000000000001",
    creado_en: creado,
    cliente_numero: "59170000002",
  }));
  return true;
}

async function veredictoConInyeccion(clave, mundo, creado, fase) {
  const ruta = reglas.sinBucket(clave);
  const registro = [];
  const efectos = {
    alConsultar(actualFase, actual) {
      if (actualFase === fase) inyectarOtroHilo(actual, ruta, creado);
    },
  };
  const nuevo = await veredictoNuevo([clave], mundo, {
    leerPaginaMensajes: paginarMensajesDe(mundo, registro),
  }, efectos);
  return { nuevo, registro };
}

async function testConcurrencia() {
  const ruta = "whatsapp/u1/foto.jpg";
  const clave = `archivos/${ruta}`;
  const idViejo = "ffffffff-ffff-4000-8000-0000000000ff";
  const idNuevo = "00000000-0000-4000-8000-000000000001";
  assert.ok(idNuevo < idViejo);

  const mismo = mundoVacio();
  ponerArchivo(mismo, ruta);
  mismo.mensajes.push(mensaje(ruta, { id: idNuevo, creado_en: VIEJO }));
  mismo.mensajes.push(mensaje(ruta, {
    id: idViejo,
    creado_en: VIEJO,
    cliente_numero: "59170000002",
  }));
  const pareja = await comparar("mismo timestamp en la misma página", clave, mismo);
  assert.strictEqual(pareja.anterior.motivo, "compartida");

  for (const creado of ["2025-06-01T00:00:00.000Z", VIEJO]) {
    const mundo = mundoConCita(ruta, idViejo, VIEJO);
    let hecho = false;
    const registro = [];
    const nuevo = await veredictoNuevo([clave], mundo, {
      leerPaginaMensajes: paginarMensajesDe(mundo, registro, (pedido, actual) => {
        if (hecho || pedido.tipo !== "completa" || pedido.despues) return;
        hecho = true;
        actual.mensajes.push(mensaje(ruta, {
          id: idNuevo,
          creado_en: creado,
          cliente_numero: "59170000002",
        }));
      }),
    });
    assert.strictEqual(nuevo.resultados[0].motivo, "compartida", creado);
    assert.strictEqual(nuevo.resultados[0].apto, false, creado);
    const reinicios = registro.filter((pedido) => pedido.tipo === "completa" && pedido.despues == null);
    assert.ok(reinicios.length >= 2, creado);
    assert.ok(registro.every((pedido) => pedido.tipo === "nulos" || pedido.tipo === "completa"), creado);
  }

  for (const creado of ["2025-06-01T00:00:00.000Z", VIEJO]) {
    const anterior = await veredictoAnterior(
      clave,
      mundoConCita(ruta, idViejo, VIEJO),
      { efectos: { alConsultar(fase, actual) { if (fase === "referencias") inyectarOtroHilo(actual, ruta, creado); } } },
      { storage: 0, menciones: 0, referencias: 0, entrantes: 0, candado: 0 }
    );
    assert.strictEqual(anterior.motivo, "compartida", `anterior ${creado}`);
    const { nuevo, registro } = await veredictoConInyeccion(
      clave,
      mundoConCita(ruta, idViejo, VIEJO),
      creado,
      "referencias"
    );
    assert.strictEqual(nuevo.resultados[0].motivo, "compartida", creado);
    assert.ok(registro.some((pedido) => pedido.tipo === "completa" && pedido.despues == null));
    assert.ok(!registro.some((pedido) => pedido.marca));
  }

  const duranteEntrantes = await veredictoConInyeccion(
    clave,
    mundoConCita(ruta, idViejo, VIEJO),
    "2025-06-01T00:00:00.000Z",
    "entrantes"
  );
  assert.strictEqual(duranteEntrantes.nuevo.resultados[0].motivo, "compartida");
  assert.strictEqual(duranteEntrantes.nuevo.resultados[0].apto, false);

  const tardio = mundoVacio();
  ponerArchivo(tardio, ruta);
  tardio.conversaciones.push({ ultimo_mensaje: citar(ruta) });
  const fasesTardias = [];
  let vistas = 0;
  const puente = consultarDe(tardio);
  const primeraTardia = await lote.revalidarLote([clave], {
    workerId: "limpieza-prueba",
    ahora: AHORA,
    listarStorage: listarDe(tardio),
    candado: async () => ({ ok: true }),
    leerPaginaMensajes: paginarMensajesDe(tardio),
    consultar: async (pedido) => {
      fasesTardias.push(pedido.fase);
      return puente.consultar(pedido);
    },
    alFase(fase) {
      fasesTardias.push(fase);
      if (fase !== "menciones") return;
      vistas += 1;
      if (vistas !== 2) return;
      tardio.mensajes.push(mensaje(ruta, {
        id: idNuevo,
        creado_en: "2025-03-01T00:00:00.000Z",
      }));
    },
  });
  assert.strictEqual(primeraTardia.resultados[0].motivo, "referenciada");
  assert.strictEqual(primeraTardia.resultados[0].apto, false);
  assert.ok(fasesTardias.indexOf("referencias") > fasesTardias.lastIndexOf("menciones"));

  const rafaga = mundoConCita(ruta, idViejo, VIEJO);
  let n = 0;
  await assert.rejects(
    () => lote.revalidarLote([clave], {
      workerId: "limpieza-prueba",
      ahora: AHORA,
      consultar: consultarDe(rafaga).consultar,
      listarStorage: listarDe(rafaga),
      candado: async () => ({ ok: true }),
      leerPaginaMensajes: paginarMensajesDe(rafaga, null, (pedido, actual) => {
        if (pedido.tipo !== "completa" || pedido.despues) return;
        n += 1;
        actual.mensajes.push(mensaje(ruta, {
          id: `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`,
          creado_en: "2025-01-01T00:00:00.000Z",
          cliente_numero: String(59171000000 + n),
        }));
      }),
    }),
    (error) => error && error.message === "lectura incompleta"
  );
}

async function testCitaSoloEnContenido() {
  const ruta = "whatsapp/u1/nota.jpg";
  const clave = `archivos/${ruta}`;
  const mundo = mundoVacio();
  ponerArchivo(mundo, ruta);
  mundo.mensajes.push(mensaje(ruta, { imagen_url: "", contenido: citar(ruta) }));
  const hallado = await comparar("cita solo en contenido", clave, mundo);
  assert.strictEqual(hallado.anterior.motivo, "candidato");
}

async function testCreadoEnNuloYCursorPegado() {
  const clave = "archivos/whatsapp/u1/foto.jpg";
  await assert.rejects(
    () => lote.revalidarLote([clave], {
      workerId: "limpieza-prueba",
      ahora: AHORA,
      consultar: async () => ({ error: null, filas: [] }),
      listarStorage: async () => [],
      candado: async () => ({ ok: true }),
      leerPaginaMensajes: async (pedido) => (pedido.tipo === "nulos"
        ? [{ id: "00000000-0000-4000-8000-000000000009" }]
        : []),
    }),
    (error) => error && error.message === "creado_en nulo"
  );

  const fila = {
    id: "00000000-0000-4000-8000-000000000001",
    creado_en: VIEJO,
    usuario_id: "u1",
    conexion_whatsapp_id: "c1",
    cliente_numero: "59170000001",
    imagen_url: citar("whatsapp/u1/foto.jpg"),
    contenido: "",
  };
  await assert.rejects(
    () => lote.revalidarLote([clave], {
      workerId: "limpieza-prueba",
      ahora: AHORA,
      consultar: async () => ({ error: null, filas: [] }),
      listarStorage: async () => [{ name: "foto.jpg", id: "foto.jpg" }],
      candado: async () => ({ ok: true }),
      leerPaginaMensajes: async (pedido) => {
        if (pedido.tipo === "nulos") return [];
        if (pedido.tipo === "completa") return Array.from({ length: lote.PAGINA_MENSAJES }, () => fila);
        return [];
      },
    }),
    (error) => error && error.message === "cursor ilegible"
  );
}

function testUrlPorCreadoEnEId() {
  const previo = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = "https://ejemplo.test";
  try {
    const primera = lote.urlPaginaMensajes({ tipo: "completa", limite: 200 });
    assert.ok(primera.includes("order=creado_en.asc,id.asc"));
    assert.ok(!primera.includes("creado_en.gt."));
    assert.ok(!primera.includes("id.lte"));
    assert.ok(!/order=id[.&]/.test(primera));

    const siguiente = lote.urlPaginaMensajes({
      tipo: "completa",
      limite: 200,
      despues: { creado_en: "2026-01-01 00:00:00.5", id: "00000000-0000-4000-8000-000000000001" },
    });
    assert.ok(siguiente.includes("order=creado_en.asc,id.asc"));
    assert.ok(siguiente.includes("%20"));
    assert.ok(siguiente.includes("creado_en.gt.%22"));
    assert.ok(siguiente.includes("creado_en.eq.%22"));
    assert.ok(siguiente.includes("id.gt.%22"));
    assert.ok(!siguiente.includes("id.lte"));
    assert.ok(!/order=id[.&]/.test(siguiente));

    const nulos = lote.urlPaginaMensajes({ tipo: "nulos", limite: 1 });
    assert.ok(nulos.includes("creado_en=is.null"));
    assert.ok(!/order=id/.test(nulos));
  } finally {
    if (previo == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previo;
  }
}

async function main() {
  testMigracionYBarreras();
  testUrlPorCreadoEnEId();
  await testNoReintenta57014();
  await testPaginacionPorId();
  await testParidad();
  await testCitaSoloEnContenido();
  await testConcurrencia();
  await testCreadoEnNuloYCursorPegado();
  await testLimitesIguales();
  await testInventarioStorage();
  await testFalloCandadoYCron();
  await testVolumen();
  console.log("limpieza por lotes ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
