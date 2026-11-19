/**
 * Revalidación por lotes. Los lotes van en serie: un fallo detiene la pasada
 * y no se adelantan candidatos de un lote posterior.
 *
 * La existencia se lista una vez por carpeta y se confirma por igualdad de ruta.
 * Las menciones salen de una sola lectura paginada por (creado_en, id),
 * compartida por todos los lotes. Cada fila se recuerda por id y la marca
 * queda en el último par. Los mensajes posteriores se piden solo después de
 * esa marca. El conteo exacto de mensajes con fecha cierra la lectura: si no
 * coincide con los id vistos, la pasada se detiene y no borra nada.
 * El reconocimiento sigue siendo citaRutaCompleta.
 * El veredicto lo calcula revalidarCandidato.
 * No borra objetos ni filas. No crea índices ni tablas.
 */
const axios = require("axios");
const reglas = require("./reglas");
const servicio = require("./limpiezaMediaService");
const { verificarLockLimpiezaMedia } = require("./limpiezaMediaLock");

// Cada lote sigue siendo de ocho y va en serie. La tabla de mensajes se
// recorre una vez. TOPE_VUELTAS limita los cierres que leen solo lo nuevo.
const TAMANO_LOTE = 8;
const PAGINA_LISTADO = 100;
const TOPE_PAGINAS = 50;
const PAGINA_MENSAJES = 200;
const TOPE_PAGINAS_MENSAJES = 100000;
const TOPE_MENCIONES_POR_RUTA = 100;
const TOPE_VUELTAS = 8;

function consultasVacias() {
  return { storage: 0, menciones: 0, referencias: 0, entrantes: 0, candado: 0 };
}

function carpetaDe(clave) {
  const ruta = reglas.sinBucket(clave);
  const barra = ruta.lastIndexOf("/");
  return {
    ruta,
    carpeta: barra >= 0 ? ruta.slice(0, barra) : "",
    nombre: barra >= 0 ? ruta.slice(barra + 1) : ruta,
  };
}

function esCancelacion57014(error) {
  const data = error?.response?.data;
  const codigo = data && typeof data === "object" && !Array.isArray(data) ? data.code : null;
  if (String(codigo || "") === "57014") return true;
  const texto = [
    typeof data === "string" ? data : "",
    data && typeof data === "object" ? data.message : "",
    error?.message,
  ].join(" ");
  return /\b57014\b/.test(texto);
}

async function conReintento(fn) {
  let ultimo;
  for (let intento = 0; intento < 4; intento += 1) {
    try {
      return await fn();
    } catch (error) {
      ultimo = error;
      if (esCancelacion57014(error)) throw error;
      const status = error?.response?.status;
      if (status && status < 500 && status !== 429) throw error;
      await new Promise((resolver) => setTimeout(resolver, 400 * (intento + 1)));
    }
  }
  throw ultimo;
}

async function consultarLoteReal({ fase, claves, hilos }) {
  const key = process.env.SUPABASE_SECRET_KEY;
  const res = await conReintento(() =>
    axios.post(
      `${process.env.SUPABASE_URL}/rest/v1/rpc/limpieza_media_revalidar_lote`,
      { p_fase: fase, p_claves: claves || [], p_hilos: hilos || [] },
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    )
  );
  return res.data;
}

async function listarCarpeta(listar, contador, carpetaInicial) {
  let carpeta = carpetaInicial;
  const encontradas = new Set();
  let offset = 0;
  let incompleto = false;
  for (let pagina = 0; pagina < TOPE_PAGINAS; pagina += 1) {
    const items = await listar({ prefix: carpeta, offset, limit: PAGINA_LISTADO });
    contador.storage += 1;
    for (const item of items) {
      const unida = item && !reglas.esCarpetaStorage(item)
        ? reglas.rutaListada(carpeta, item.name)
        : null;
      if (unida) encontradas.add(unida);
      if (item && !reglas.esCarpetaStorage(item) && item.name) encontradas.add(String(item.name));
    }
    if (items.length < PAGINA_LISTADO) return { carpeta, encontradas, incompleto: false };
    offset += items.length;
  }
  incompleto = true;
  return { carpeta, encontradas, incompleto };
}

function rutaVista(listado, ruta) {
  if (listado.encontradas.has(ruta)) return true;
  for (const unida of listado.encontradas) {
    if (unida === ruta) return true;
  }
  return false;
}

function crearInventarioStorage() {
  return new Map();
}

async function existenPorCarpeta(claves, listar, contador, cache) {
  const inventario = cache instanceof Map ? cache : crearInventarioStorage();
  const grupos = new Map();
  for (const clave of claves) {
    const partes = carpetaDe(clave);
    if (!grupos.has(partes.carpeta)) grupos.set(partes.carpeta, []);
    grupos.get(partes.carpeta).push({ clave, ruta: partes.ruta });
  }
  const planes = new Map();
  for (const [carpeta, objetos] of grupos) {
    let listado = inventario.get(carpeta);
    if (!listado) {
      try {
        listado = await listarCarpeta(listar, contador, carpeta);
      } catch (error) {
        for (const objeto of objetos) {
          planes.set(objeto.clave, { existe: false, errorExiste: error });
        }
        continue;
      }
      inventario.set(carpeta, listado);
    }
    for (const objeto of objetos) {
      const visto = rutaVista(listado, objeto.ruta);
      if (visto) {
        planes.set(objeto.clave, { existe: true, errorExiste: null });
      } else if (listado.incompleto) {
        const error = new Error("listado de existencia incompleto");
        error.consulta = "storage.existencia";
        planes.set(objeto.clave, { existe: false, errorExiste: error });
      } else {
        planes.set(objeto.clave, { existe: false, errorExiste: null });
      }
    }
  }
  return planes;
}

function indicePorClave(filas) {
  const mapa = new Map();
  for (const fila of filas || []) mapa.set(fila.clave, fila);
  return mapa;
}

function errorDeFase(mensaje, consulta) {
  const error = new Error(mensaje);
  error.consulta = consulta;
  return error;
}

function filasMencion(item) {
  if (!item) return { error: errorDeFase("referencia ilegible", "mensajes.menciones") };
  if (item.error) return { error: errorDeFase(item.error, "mensajes.menciones") };
  if (item.truncada === true) {
    return { error: errorDeFase("consulta truncada", "mensajes.menciones"), filas: item.filas || [] };
  }
  return { filas: item.filas || [] };
}

async function citadaDeItem(clave, item) {
  if (!item) throw errorDeFase("referencia ilegible", "referencias_protegidas");
  if (item.error) throw errorDeFase(item.error, "referencias_protegidas");
  return servicio.tieneReferenciaProtegidaReal({ clave }, {
    async leer(ruta) {
      const texto = String(ruta);
      if (texto.includes("media_filename=eq.")) {
        return item.filename === true
          ? [{ media_filename: reglas.nombreArchivo(clave) }]
          : [];
      }
      const tabla = texto.split("/rest/v1/")[1]?.split("?")[0];
      const bloque = (item.textos || []).find((candidato) => candidato.tabla === tabla);
      if (!bloque) throw errorDeFase("referencia ilegible", tabla || "referencias_protegidas");
      if (bloque.truncada === true) {
        const muestra = bloque.filas && bloque.filas[0] ? bloque.filas[0] : {};
        return Array.from({ length: 5 }, () => muestra);
      }
      return Array.isArray(bloque.filas) ? bloque.filas : [];
    },
  });
}

function hiloDe(fila) {
  return {
    usuario_id: String(fila.usuario_id),
    conexion_whatsapp_id: String(fila.conexion_whatsapp_id),
    cliente_numero: String(fila.cliente_numero),
  };
}

function mismaPersona(fila, hilo) {
  return String(fila?.usuario_id || "") === hilo.usuario_id
    && String(fila?.conexion_whatsapp_id || "") === hilo.conexion_whatsapp_id
    && String(fila?.cliente_numero || "") === hilo.cliente_numero;
}

function tiemposVacios() {
  return {
    storageMs: 0,
    mencionesMs: 0,
    referenciasMs: 0,
    menciones2Ms: 0,
    entrantesMs: 0,
  };
}

function crearLecturaMenciones(claves) {
  return {
    lista: false,
    error: null,
    mapa: new Map(),
    trie: null,
    vistos: new Set(),
    universo: Array.isArray(claves) ? claves.slice() : null,
    paginasCompletas: 0,
    pasadasExistentes: 0,
    marca: null,
    entrantes: new Map(),
  };
}

function crearLecturaTexto(claves) {
  return {
    lista: false,
    error: null,
    claves: new Set(),
    nombres: new Set(),
    trie: null,
    indiceNombres: null,
    universo: Array.isArray(claves) ? claves.slice() : null,
    paginas: 0,
    vistos: new Set(),
  };
}

function idFiltro(id) {
  const texto = String(id == null ? "" : id).trim();
  if (!/^[0-9a-zA-Z-]+$/.test(texto)) return null;
  return texto;
}

function compararPar(a, b) {
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

function cursorCompleto(fila) {
  return !!fila
    && typeof fila.creado_en === "string"
    && fila.creado_en.length > 0
    && fila.id != null
    && String(fila.id).length > 0;
}

function mismoPar(a, b) {
  return !!a && !!b
    && String(a.creado_en) === String(b.creado_en)
    && String(a.id) === String(b.id);
}

function valorFiltro(valor) {
  const texto = String(valor)
    .replace(/%/g, "%25")
    .replace(/"/g, "%22")
    .replace(/&/g, "%26")
    .replace(/#/g, "%23")
    .replace(/ /g, "%20")
    .replace(/\+/g, "%2B");
  return `%22${texto}%22`;
}

function parMayorQue(cursor) {
  const creado = valorFiltro(cursor.creado_en);
  const id = valorFiltro(cursor.id);
  return `or(creado_en.gt.${creado},and(creado_en.eq.${creado},id.gt.${id}))`;
}

function urlPaginaMensajes(pedido) {
  const limite = Number.isFinite(Number(pedido.limite)) && Number(pedido.limite) > 0
    ? Math.floor(Number(pedido.limite))
    : PAGINA_MENSAJES;
  const params = [];
  if (pedido.tipo === "nulos") {
    params.push("select=id");
    params.push("creado_en=is.null");
    params.push(`limit=${limite}`);
  } else if (pedido.tipo === "completa") {
    params.push("select=id,creado_en,usuario_id,conexion_whatsapp_id,cliente_numero,direccion,imagen_url,contenido");
    params.push("creado_en=not.is.null");
    params.push("order=creado_en.asc,id.asc");
    params.push(`limit=${limite}`);
    if (cursorCompleto(pedido.despues)) params.push(`and=(${parMayorQue(pedido.despues)})`);
  } else {
    throw errorDeFase("pagina ilegible", "mensajes.menciones");
  }
  return `${process.env.SUPABASE_URL}/rest/v1/mensajes?${params.join("&")}`;
}

function urlConteoMensajes() {
  return `${process.env.SUPABASE_URL}/rest/v1/mensajes?select=id&creado_en=not.is.null&limit=1`;
}

function totalDeRango(contenido) {
  const hallado = String(contenido || "").match(/\/(\d+)\s*$/);
  if (!hallado) return null;
  const total = Number(hallado[1]);
  if (!Number.isInteger(total) || total < 0) return null;
  return total;
}

async function leerPaginaMensajesReal(pedido) {
  const key = process.env.SUPABASE_SECRET_KEY;
  const res = await conReintento(() => axios.get(urlPaginaMensajes(pedido), {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    timeout: 20000,
  }));
  if (!Array.isArray(res.data)) throw errorDeFase("pagina ilegible", "mensajes.menciones");
  return res.data;
}

async function contarMensajesReal() {
  const key = process.env.SUPABASE_SECRET_KEY;
  const res = await conReintento(() => axios.get(urlConteoMensajes(), {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
    timeout: 20000,
  }));
  const total = totalDeRango(res.headers && (res.headers["content-range"] || res.headers["Content-Range"]));
  if (total == null) throw errorDeFase("lectura incompleta", "mensajes.menciones");
  return total;
}

function urlPaginaFuente(pedido) {
  const tabla = String(pedido?.tabla || "");
  if (!/^[a-z0-9_]+$/.test(tabla)) return null;
  const pedidas = [...(pedido.columnas || []), ...(pedido.extra || [])];
  const columnas = [];
  for (const columna of pedidas) {
    if (!/^[a-z0-9_]+$/.test(columna) || columnas.includes(columna)) continue;
    columnas.push(columna);
  }
  const limite = Number.isFinite(Number(pedido.limite)) && Number(pedido.limite) > 0
    ? Math.floor(Number(pedido.limite))
    : PAGINA_MENSAJES;
  let url = `${process.env.SUPABASE_URL}/rest/v1/${tabla}?select=${["id", ...columnas].join(",")}&order=id.asc&limit=${limite}`;
  if (pedido.despuesDeId) {
    const id = idFiltro(pedido.despuesDeId);
    if (!id) return null;
    url += `&id=gt.${encodeURIComponent(id)}`;
  }
  return url;
}

async function leerPaginaFuenteReal(pedido) {
  const key = process.env.SUPABASE_SECRET_KEY;
  const url = urlPaginaFuente(pedido);
  if (!url) throw errorDeFase("pagina ilegible", pedido?.tabla || "referencias_protegidas");
  const res = await conReintento(() => axios.get(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    timeout: 20000,
  }));
  if (!Array.isArray(res.data)) throw errorDeFase("pagina ilegible", pedido.tabla);
  return res.data;
}

function asegurarUniverso(lectura, claves) {
  const conjunto = new Set(Array.isArray(lectura.universo) ? lectura.universo : []);
  for (const clave of claves || []) {
    if (clave) conjunto.add(clave);
  }
  lectura.universo = [...conjunto];
}

function indicePorNombre(claves) {
  const indice = new Map();
  for (const clave of claves) {
    const ruta = reglas.sinBucket(clave);
    if (!reglas.segmentoFiltroSeguro(ruta)) continue;
    const nombre = reglas.nombreArchivo(clave);
    if (!nombre || !reglas.segmentoFiltroSeguro(nombre)) continue;
    let lista = indice.get(nombre);
    if (!lista) {
      lista = [];
      indice.set(nombre, lista);
    }
    lista.push(clave);
  }
  return indice;
}

function trieDe(indice) {
  const raiz = { hijos: new Map(), claves: null };
  for (const [nombre, claves] of indice) {
    let nodo = raiz;
    for (const caracter of nombre) {
      let siguiente = nodo.hijos.get(caracter);
      if (!siguiente) {
        siguiente = { hijos: new Map(), claves: null };
        nodo.hijos.set(caracter, siguiente);
      }
      nodo = siguiente;
    }
    nodo.claves = claves;
  }
  return raiz;
}

function clavesEnTexto(trie, texto) {
  if (!trie || texto == null || texto === "") return [];
  const src = String(texto);
  const halladas = [];
  const vistos = new Set();
  for (let inicio = 0; inicio < src.length; inicio += 1) {
    let nodo = trie;
    for (let fin = inicio; fin < src.length; fin += 1) {
      nodo = nodo.hijos.get(src[fin]);
      if (!nodo) break;
      if (!nodo.claves) continue;
      for (const clave of nodo.claves) {
        if (vistos.has(clave)) continue;
        if (!reglas.citaRutaCompleta(src, clave)) continue;
        vistos.add(clave);
        halladas.push(clave);
      }
    }
  }
  return halladas;
}

function recordarEntrante(lectura, fila) {
  if (fila?.direccion !== "entrante") return;
  const hilo = reglas.claveHilo(fila.usuario_id, fila.conexion_whatsapp_id, fila.cliente_numero);
  const ms = reglas.parseCreadoEnUtc(fila.creado_en);
  if (!hilo || ms == null) return;
  const previo = lectura.entrantes.get(hilo);
  if (!previo || ms > previo.ms) {
    lectura.entrantes.set(hilo, { ms, creado_en: fila.creado_en });
  }
}

function subirMarca(lectura, fila) {
  const par = { creado_en: fila.creado_en, id: String(fila.id) };
  if (!lectura.marca || compararPar(par, lectura.marca) > 0) lectura.marca = par;
}

function observarFila(lectura, fila) {
  if (!cursorCompleto(fila)) throw errorDeFase("fila ilegible", "mensajes.menciones");
  const id = String(fila.id);
  subirMarca(lectura, fila);
  recordarEntrante(lectura, fila);
  if (lectura.vistos.has(id)) return false;
  lectura.vistos.add(id);
  absorberFila(lectura, fila);
  return true;
}

function absorberFila(lectura, fila) {
  if (!cursorCompleto(fila)) throw errorDeFase("fila ilegible", "mensajes.menciones");
  const id = String(fila.id);
  const citadas = new Set();
  for (const texto of [fila.imagen_url, fila.contenido]) {
    for (const clave of clavesEnTexto(lectura.trie, texto)) citadas.add(clave);
  }
  const proyectada = {
    usuario_id: fila.usuario_id,
    conexion_whatsapp_id: fila.conexion_whatsapp_id,
    cliente_numero: fila.cliente_numero,
    imagen_url: fila.imagen_url,
    contenido: fila.contenido,
  };
  for (const clave of citadas) {
    let item = lectura.mapa.get(clave);
    if (!item) {
      item = { filas: [], truncada: false, ids: new Set() };
      lectura.mapa.set(clave, item);
    }
    if (item.ids.has(id)) continue;
    item.ids.add(id);
    if (item.filas.length >= TOPE_MENCIONES_POR_RUTA) {
      item.truncada = true;
      continue;
    }
    item.filas.push(proyectada);
    if (item.filas.length >= TOPE_MENCIONES_POR_RUTA) item.truncada = true;
  }
}

function falloDeLectura(error) {
  const fallo = error && error.consulta
    ? error
    : errorDeFase(error && error.message ? error.message : "lectura de menciones", "mensajes.menciones");
  fallo.fase = "menciones";
  return fallo;
}

async function recorrerRango(lectura, leer, inicio) {
  let cursor = inicio || null;
  let previo = null;
  let nuevos = 0;
  for (;;) {
    if (lectura.paginasCompletas >= TOPE_PAGINAS_MENSAJES) {
      throw errorDeFase("lectura incompleta", "mensajes.menciones");
    }
    const filas = await leer({
      tipo: "completa",
      limite: PAGINA_MENSAJES,
      despues: cursor,
    });
    if (!Array.isArray(filas)) throw errorDeFase("pagina ilegible", "mensajes.menciones");
    lectura.paginasCompletas += 1;
    if (filas.length === 0) return nuevos;
    for (const fila of filas) {
      if (observarFila(lectura, fila)) nuevos += 1;
    }
    const ultimo = filas[filas.length - 1];
    if (!cursorCompleto(ultimo)) throw errorDeFase("cursor ilegible", "mensajes.menciones");
    const par = { creado_en: ultimo.creado_en, id: String(ultimo.id) };
    if ((previo && mismoPar(previo, par)) || (cursor && mismoPar(cursor, par))) {
      throw errorDeFase("cursor ilegible", "mensajes.menciones");
    }
    previo = par;
    if (filas.length < PAGINA_MENSAJES) return nuevos;
    cursor = par;
  }
}

function prepararTrie(lectura, claves) {
  asegurarUniverso(lectura, claves);
  const firma = lectura.universo.length;
  if (lectura.trie && lectura.firmaTrie === firma) return;
  const indice = indicePorNombre(lectura.universo);
  lectura.trie = trieDe(indice);
  lectura.firmaTrie = firma;
  lectura.indiceVacio = indice.size === 0;
  if (!lectura.pasadaLista) {
    lectura.pasadasExistentes += 1;
    lectura.pasadaLista = true;
  }
}

async function pasadaCompleta(lectura, leer) {
  const nulos = await leer({ tipo: "nulos", limite: 1 });
  if (!Array.isArray(nulos)) throw errorDeFase("pagina ilegible", "mensajes.menciones");
  if (nulos.length > 0) throw errorDeFase("creado_en nulo", "mensajes.menciones");
  return recorrerRango(lectura, leer);
}

async function cubrirLectura(lectura, claves, opciones) {
  if (lectura.error) throw lectura.error;
  const leer = opciones.leerPaginaMensajes || leerPaginaMensajesReal;
  try {
    prepararTrie(lectura, claves);
    if (lectura.indiceVacio) {
      lectura.lista = true;
      return;
    }
    await pasadaCompleta(lectura, leer);
    lectura.lista = true;
  } catch (error) {
    const fallo = falloDeLectura(error);
    lectura.error = fallo;
    lectura.lista = true;
    throw fallo;
  }
}

function filaMencionDe(lectura, clave) {
  const ruta = reglas.sinBucket(clave);
  if (!reglas.segmentoFiltroSeguro(ruta)) {
    return { clave, error: "ruta_no_filtrable", truncada: false, filas: [] };
  }
  const item = lectura.mapa.get(clave);
  if (!item) return { clave, error: null, truncada: false, filas: [] };
  return {
    clave,
    error: null,
    truncada: item.truncada === true,
    filas: item.filas.slice(),
  };
}

function anotarFase(opciones, fase) {
  if (typeof opciones.alFase === "function") opciones.alFase(fase);
}

async function leerMencionesIniciales(claves, lectura, opciones) {
  anotarFase(opciones, "menciones");
  if (!lectura.lista) await cubrirLectura(lectura, claves, opciones);
  if (lectura.error) throw lectura.error;
  return { error: null, filas: claves.map((clave) => filaMencionDe(lectura, clave)) };
}

async function pasadaNuevos(lectura, opciones) {
  if (lectura.error) throw lectura.error;
  const leer = opciones.leerPaginaMensajes || leerPaginaMensajesReal;
  try {
    for (let vuelta = 0; vuelta < TOPE_VUELTAS; vuelta += 1) {
      const nuevos = await recorrerRango(lectura, leer, lectura.marca);
      if (nuevos === 0) return;
    }
    throw errorDeFase("lectura incompleta", "mensajes.menciones");
  } catch (error) {
    const fallo = falloDeLectura(error);
    lectura.error = fallo;
    throw fallo;
  }
}

async function comprobarConteo(lectura, opciones) {
  const leer = opciones.leerPaginaMensajes || leerPaginaMensajesReal;
  const nulos = await leer({ tipo: "nulos", limite: 1 });
  if (!Array.isArray(nulos)) {
    throw falloDeLectura(errorDeFase("pagina ilegible", "mensajes.menciones"));
  }
  if (nulos.length > 0) {
    throw falloDeLectura(errorDeFase("creado_en nulo", "mensajes.menciones"));
  }
  const contar = opciones.contarMensajes || contarMensajesReal;
  let total;
  try {
    total = await contar();
  } catch (error) {
    throw falloDeLectura(error);
  }
  if (!Number.isInteger(total) || total !== lectura.vistos.size) {
    throw falloDeLectura(errorDeFase("lectura incompleta", "mensajes.menciones"));
  }
}

async function leerMencionesNuevas(claves, lectura, opciones) {
  anotarFase(opciones, "menciones");
  if (!lectura.lista) await cubrirLectura(lectura, claves, opciones);
  else await pasadaNuevos(lectura, opciones);
  if (lectura.error) throw lectura.error;
  return { error: null, filas: claves.map((clave) => filaMencionDe(lectura, clave)) };
}

function avisar(opciones, fase) {
  anotarFase(opciones, fase);
  if (typeof opciones.efectos?.alConsultar === "function") {
    opciones.efectos.alConsultar(fase, opciones.mundo);
  }
}

function falloDeFuente(error, tabla) {
  if (error && error.consulta && error.fase) return error;
  const fallo = errorDeFase(
    error && error.message ? error.message : "pagina ilegible",
    tabla || "referencias_protegidas"
  );
  fallo.fase = "referencias_protegidas";
  return fallo;
}

function absorberFuente(lecturaTexto, columnas, fila) {
  for (const columna of columnas) {
    for (const clave of clavesEnTexto(lecturaTexto.trie, fila?.[columna])) {
      lecturaTexto.claves.add(clave);
    }
  }
  if (fila?.media_filename == null || fila.media_filename === "") return;
  const lista = lecturaTexto.indiceNombres.get(String(fila.media_filename));
  if (!lista) return;
  for (const clave of lista) lecturaTexto.nombres.add(clave);
}

async function recorrerFuente(tabla, columnas, extra, lecturaTexto, leer) {
  let cursor = null;
  for (;;) {
    const filas = await leer({
      tabla,
      columnas,
      extra,
      limite: PAGINA_MENSAJES,
      despuesDeId: cursor,
    });
    if (!Array.isArray(filas)) throw errorDeFase("pagina ilegible", tabla);
    lecturaTexto.paginas += 1;
    if (filas.length === 0) return;
    let ultimo = null;
    for (const fila of filas) {
      const id = idFiltro(fila?.id);
      if (!id || lecturaTexto.vistos.has(`${tabla}:${id}`)) {
        throw errorDeFase("paginacion detenida", tabla);
      }
      if (ultimo && id === ultimo) throw errorDeFase("paginacion detenida", tabla);
      lecturaTexto.vistos.add(`${tabla}:${id}`);
      absorberFuente(lecturaTexto, columnas, fila);
      ultimo = id;
    }
    if (filas.length < PAGINA_MENSAJES) return;
    if (!ultimo || ultimo === cursor) throw errorDeFase("paginacion detenida", tabla);
    cursor = ultimo;
  }
}

async function cubrirTexto(lecturaTexto, claves, opciones) {
  if (lecturaTexto.error) throw lecturaTexto.error;
  if (lecturaTexto.lista) return;
  avisar(opciones, "referencias");
  asegurarUniverso(lecturaTexto, claves);
  const indice = indicePorNombre(lecturaTexto.universo);
  lecturaTexto.trie = trieDe(indice);
  lecturaTexto.indiceNombres = indice;
  const leer = opciones.leerPaginaFuente || leerPaginaFuenteReal;
  try {
    for (const consulta of servicio.CONSULTAS_TEXTO) {
      const extra = consulta.tabla === "seguimientos_v2" ? ["media_filename"] : [];
      await recorrerFuente(consulta.tabla, consulta.columnas, extra, lecturaTexto, leer);
    }
    lecturaTexto.lista = true;
  } catch (error) {
    const fallo = falloDeFuente(error, error?.consulta);
    lecturaTexto.error = fallo;
    throw fallo;
  }
}

function cuentaCitas(lectura, claves) {
  let total = 0;
  for (const clave of claves) {
    const item = lectura.mapa.get(clave);
    if (item) total += item.ids.size;
  }
  return total;
}

function volcarPlan(plan, clave, lectura) {
  const crudas = filasMencion(filaMencionDe(lectura, clave));
  if (crudas.error) {
    plan.errorSegunda = crudas.error;
    plan.menciones2 = [];
    if (!plan.errorMenciones) plan.errorMenciones = crudas.error;
    plan.pideReferencias = false;
    return;
  }
  let lista;
  try {
    lista = servicio.mencionesDesdeFilas(clave, crudas.filas);
  } catch (error) {
    plan.errorSegunda = error;
    plan.menciones2 = [];
    if (!plan.errorMenciones) plan.errorMenciones = error;
    plan.pideReferencias = false;
    return;
  }
  plan.errorSegunda = null;
  plan.menciones2 = lista;
  if (!plan.errorMenciones) plan.menciones1 = lista;
  plan.pideReferencias = plan.errorExiste == null
    && plan.existe === true
    && lista.length > 0
    && !plan.errorMenciones;
}

function armarHilos(claves, preparadas) {
  const hilos = [];
  const hiloPorClave = new Map();
  for (const clave of claves) {
    const plan = preparadas.get(clave);
    const menciones = plan.errorMenciones ? [] : plan.menciones1;
    const vistos = new Map();
    for (const fila of menciones) {
      const hilo = reglas.claveHilo(fila?.usuario_id, fila?.conexion_whatsapp_id, fila?.cliente_numero);
      if (!hilo) continue;
      vistos.set(hilo, fila);
    }
    if (vistos.size === 1) {
      const fila = vistos.values().next().value;
      const hilo = hiloDe(fila);
      hiloPorClave.set(clave, hilo);
      if (!hilos.some((item) => mismaPersona(item, hilo))) hilos.push(hilo);
    }
  }
  return { hilos, hiloPorClave };
}

async function revalidarLote(claves, opciones = {}) {
  const contador = consultasVacias();
  const tiempos = tiemposVacios();
  const listar = opciones.listarStorage || servicio.listarStorageReal;
  const candado = opciones.candado || ((workerId) => verificarLockLimpiezaMedia(workerId));
  const inventario = opciones.inventarioStorage instanceof Map
    ? opciones.inventarioStorage
    : crearInventarioStorage();
  const lectura = opciones.lecturaMenciones || crearLecturaMenciones();
  const lecturaTexto = opciones.lecturaTexto || crearLecturaTexto();
  if (!Array.isArray(lecturaTexto.universo) && Array.isArray(lectura.universo)) {
    lecturaTexto.universo = lectura.universo.slice();
  }
  const tomar = async (campo, fn) => {
    const inicio = Date.now();
    try {
      return await fn();
    } finally {
      tiempos[campo] += Date.now() - inicio;
    }
  };
  try {
  const existencia = await tomar("storageMs", () => existenPorCarpeta(claves, listar, contador, inventario));

  const primera = await tomar("mencionesMs", () => leerMencionesIniciales(claves, lectura, opciones));
  contador.menciones += 1;
  if (primera?.error) {
    const error = errorDeFase(primera.error, "limpieza_media_revalidar_lote");
    error.fase = "menciones";
    throw error;
  }
  const menciones1 = indicePorClave(primera?.filas);

  const preparadas = new Map();
  for (const clave of claves) {
    const base = existencia.get(clave) || { existe: false, errorExiste: null };
    const crudas = filasMencion(menciones1.get(clave));
    let menciones;
    let errorMenciones = crudas.error || null;
    if (!errorMenciones) {
      try {
        menciones = servicio.mencionesDesdeFilas(clave, crudas.filas);
      } catch (error) {
        errorMenciones = error;
        menciones = [];
      }
    } else if (crudas.filas) {
      try {
        menciones = servicio.mencionesDesdeFilas(clave, crudas.filas);
      } catch (error) {
        menciones = [];
      }
    } else {
      menciones = [];
    }
    const pideReferencias = base.errorExiste == null && base.existe === true && menciones.length > 0 && !errorMenciones;
    preparadas.set(clave, { ...base, menciones1: menciones, errorMenciones, pideReferencias });
  }

  const paginasTexto = lecturaTexto.paginas;
  await tomar("referenciasMs", () => cubrirTexto(lecturaTexto, claves, { ...opciones, fase: "referencias" }));
  contador.referencias += Math.max(0, lecturaTexto.paginas - paginasTexto);

  const segundaNecesaria = claves.slice();
  const posteriores = await tomar("menciones2Ms", () => leerMencionesNuevas(segundaNecesaria, lectura, opciones));
  contador.menciones += 1;
  if (posteriores?.error) {
    const error = errorDeFase(posteriores.error, "limpieza_media_revalidar_lote");
    error.fase = "menciones";
    throw error;
  }
  for (const clave of claves) volcarPlan(preparadas.get(clave), clave, lectura);

  avisar(opciones, "entrantes");
  await tomar("entrantesMs", () => pasadaNuevos(lectura, opciones));
  contador.entrantes += 1;
  for (const clave of claves) volcarPlan(preparadas.get(clave), clave, lectura);
  await comprobarConteo(lectura, opciones);

  const armado = armarHilos(claves, preparadas);
  const hiloPorClave = armado.hiloPorClave;

  let candadoOk = { ok: false, motivo: "candado_perdido" };
  try {
    if (!opciones.workerId) candadoOk = { ok: false, motivo: "candado_perdido" };
    else candadoOk = await candado(opciones.workerId);
  } catch (error) {
    candadoOk = { ok: false, motivo: "candado_perdido" };
  }
  contador.candado += 1;
  if (!candadoOk || candadoOk.ok !== true) {
    return {
      abortar: true,
      motivo: candadoOk?.motivo || "candado_perdido",
      clave: claves[0] || null,
      resultados: [],
      consultas: contador,
      tiempos,
    };
  }

  const resultados = [];
  for (const clave of claves) {
    const plan = preparadas.get(clave);
    let citada = false;
    let errorCita = null;
    if (plan.pideReferencias) {
      if (!lecturaTexto.lista || lecturaTexto.error) {
        errorCita = lecturaTexto.error || errorDeFase("referencias incompletas", "referencias_protegidas");
      } else {
        citada = lecturaTexto.claves.has(clave) || lecturaTexto.nombres.has(clave);
      }
    }
    const hilo = hiloPorClave.get(clave);
    let entrante = null;
    if (hilo) {
      if (!/^[0-9]+$/.test(String(hilo.cliente_numero || ""))) {
        entrante = { ...hilo, error: "hilo_no_filtrable", creado_en: null };
      } else {
        const guardado = lectura.entrantes.get(reglas.claveHilo(
          hilo.usuario_id,
          hilo.conexion_whatsapp_id,
          hilo.cliente_numero
        ));
        entrante = { ...hilo, error: null, creado_en: guardado?.creado_en || null };
      }
    }
    let lecturas = 0;
    const io = {
      async existeObjeto() {
        if (plan.errorExiste) throw plan.errorExiste;
        return plan.existe === true;
      },
      async leerMenciones() {
        lecturas += 1;
        if (lecturas === 1) {
          if (plan.errorMenciones && !plan.pideReferencias) throw plan.errorMenciones;
          return plan.menciones1;
        }
        if (plan.errorSegunda) throw plan.errorSegunda;
        return plan.menciones2;
      },
      async tieneReferenciaProtegida() {
        if (errorCita) throw errorCita;
        return citada === true;
      },
      async leerUltimoEntrante() {
        if (entrante?.error) throw errorDeFase(entrante.error, "mensajes.ultimo_entrante");
        return reglas.parseCreadoEnUtc(entrante?.creado_en);
      },
    };
    const veredicto = await servicio.revalidarCandidato(clave, {
      io,
      protegidas: opciones.protegidas,
      nombresProtegidos: opciones.nombresProtegidos,
      ahora: opciones.ahora,
      dias: opciones.dias,
    });
    const detener = veredicto.motivo === "consulta_fallida";
    resultados.push({
      clave,
      motivo: veredicto.motivo,
      apto: veredicto.apto === true,
      detalle: veredicto.detalle || null,
      hilo: veredicto.hilo || null,
      detener,
    });
    if (detener) break;
  }

  return { abortar: false, motivo: null, clave: null, resultados, consultas: contador, tiempos };
  } catch (error) {
    if (error && typeof error === "object" && !error.tiempos) error.tiempos = tiempos;
    throw error;
  }
}

module.exports = {
  TAMANO_LOTE,
  PAGINA_MENSAJES,
  TOPE_MENCIONES_POR_RUTA,
  consultarLoteReal,
  conReintento,
  crearInventarioStorage,
  crearLecturaMenciones,
  crearLecturaTexto,
  urlPaginaFuente,
  urlConteoMensajes,
  totalDeRango,
  esCancelacion57014,
  revalidarLote,
  urlPaginaMensajes,
};
