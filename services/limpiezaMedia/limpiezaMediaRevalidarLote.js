/**
 * Revalidación por lotes. Los lotes van en serie: un fallo detiene la pasada
 * y no se adelantan candidatos de un lote posterior.
 *
 * La existencia se lista una vez por carpeta y se confirma por igualdad de ruta.
 * Las menciones se leen otra vez después de las referencias, en otra llamada,
 * para ver un entrante que haya llegado durante esa comprobación.
 * El veredicto lo sigue calculando revalidarCandidato.
 * No borra objetos ni filas.
 */
const axios = require("axios");
const reglas = require("./reglas");
const servicio = require("./limpiezaMediaService");
const { verificarLockLimpiezaMedia } = require("./limpiezaMediaLock");

// Cada fase lee juntas las claves del lote: una pasada de mensajes y una
// pasada por tabla de referencias. El lote sigue siendo de ocho y va en serie.
// Sin el índice de coalesce(columna::text, ''::text) cada pasada recorre la tabla.
// No hay paralelo.
const TAMANO_LOTE = 8;
const PAGINA_LISTADO = 100;
const TOPE_PAGINAS = 50;

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

async function conReintento(fn) {
  let ultimo;
  for (let intento = 0; intento < 4; intento += 1) {
    try {
      return await fn();
    } catch (error) {
      ultimo = error;
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

async function revalidarLote(claves, opciones = {}) {
  const contador = consultasVacias();
  const tiempos = tiemposVacios();
  const listar = opciones.listarStorage || servicio.listarStorageReal;
  const consultar = opciones.consultar || consultarLoteReal;
  const candado = opciones.candado || ((workerId) => verificarLockLimpiezaMedia(workerId));
  const inventario = opciones.inventarioStorage instanceof Map
    ? opciones.inventarioStorage
    : crearInventarioStorage();
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

  const primera = await tomar("mencionesMs", () => consultar({ fase: "menciones", claves, hilos: [] }));
  contador.menciones += 1;
  if (primera?.error) {
    const error = errorDeFase(primera.error, "limpieza_media_revalidar_lote");
    error.fase = "menciones";
    throw error;
  }
  const menciones1 = indicePorClave(primera?.filas);

  const conReferencia = [];
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
    if (pideReferencias) conReferencia.push(clave);
  }

  const referencias = new Map();
  if (conReferencia.length) {
    const payload = await tomar("referenciasMs", () => consultar({ fase: "referencias", claves: conReferencia, hilos: [] }));
    contador.referencias += 1;
    if (payload?.error) {
      const error = errorDeFase(payload.error, "limpieza_media_revalidar_lote");
      error.fase = "referencias_protegidas";
      throw error;
    }
    for (const fila of payload?.filas || []) referencias.set(fila.clave, fila);
  }

  const segundaNecesaria = conReferencia.slice();
  const menciones2 = new Map();
  if (segundaNecesaria.length) {
    const payload = await tomar("menciones2Ms", () => consultar({ fase: "menciones", claves: segundaNecesaria, hilos: [] }));
    contador.menciones += 1;
    if (payload?.error) {
      const error = errorDeFase(payload.error, "limpieza_media_revalidar_lote");
      error.fase = "menciones";
      throw error;
    }
    for (const fila of payload?.filas || []) menciones2.set(fila.clave, fila);
  }

  const hilos = [];
  const hiloPorClave = new Map();
  for (const clave of claves) {
    const plan = preparadas.get(clave);
    plan.errorSegunda = null;
    plan.menciones2 = plan.menciones1;
    if (plan.pideReferencias) {
      const crudas = filasMencion(menciones2.get(clave));
      if (crudas.error) {
        plan.errorSegunda = crudas.error;
        plan.menciones2 = [];
      } else {
        try {
          plan.menciones2 = servicio.mencionesDesdeFilas(clave, crudas.filas);
        } catch (error) {
          plan.errorSegunda = error;
          plan.menciones2 = [];
        }
      }
    }
    const menciones = plan.errorSegunda ? plan.menciones1 : plan.menciones2;
    plan.errorMenciones = plan.errorMenciones || plan.errorSegunda;
    const vistos = new Map();
    for (const fila of menciones) {
      const hilo = reglas.claveHilo(fila?.usuario_id, fila?.conexion_whatsapp_id, fila?.cliente_numero);
      if (!hilo) continue;
      vistos.set(hilo, fila);
    }
    if (vistos.size === 1 && !plan.errorMenciones) {
      const fila = vistos.values().next().value;
      const hilo = hiloDe(fila);
      hiloPorClave.set(clave, hilo);
      if (!hilos.some((item) => mismaPersona(item, hilo))) hilos.push(hilo);
    }
  }

  const entrantes = [];
  if (hilos.length) {
    const payload = await tomar("entrantesMs", () => consultar({ fase: "entrantes", claves: [], hilos }));
    contador.entrantes += 1;
    if (payload?.error) {
      const error = errorDeFase(payload.error, "limpieza_media_revalidar_lote");
      error.fase = "ultimo_entrante";
      throw error;
    }
    entrantes.push(...(payload?.filas || []));
  }

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
      try {
        citada = await citadaDeItem(clave, referencias.get(clave));
      } catch (error) {
        errorCita = error;
      }
    }
    const hilo = hiloPorClave.get(clave);
    const entrante = hilo ? entrantes.find((fila) => mismaPersona(fila, hilo)) : null;
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
  consultarLoteReal,
  crearInventarioStorage,
  revalidarLote,
};
