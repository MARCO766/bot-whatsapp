/**
 * Simulación de limpieza de multimedia, solo lectura.
 * No inserta, actualiza ni borra filas ni objetos.
 */
const axios = require("axios");
const { isSchemaMissingError } = require("../supabaseSafe");
const reglas = require("./reglas");

const ELIMINACION_REAL_BLOQUEADA = true;

const FUENTES = [
  "flujos_builder",
  "flujos_builder_versiones",
  "remarketing_global_24h",
  "seguimientos_v2",
  "seguimientos_programados",
  "conversaciones",
  "clientes",
  "lector_pagos_estado",
  "ia_sessions",
  "seguimientos_v2_logs",
  "crm_historial_cliente",
  "admin_logs",
  "flujos",
  "flujo_pasos",
];

const SELECT_FUENTE = {
  flujos_builder: "data,datos",
  flujos_builder_versiones: "data_snapshot",
  remarketing_global_24h:
    "config_snapshot,mensaje_remarketing,ultimo_camino,motivo_cancelacion,ultimo_nodo_id,ultimo_nodo_tipo,ultimo_nodo_nombre,flujo_nombre,oferta_nombre,oferta_validez,oferta_moneda,oferta_consumida_por",
  seguimientos_v2: "media_url,contenido,error_detalle,media_filename",
  seguimientos_programados: "mensaje_payload,error_detalle",
  conversaciones: "ultimo_mensaje",
  clientes: "comprobante_url",
  lector_pagos_estado: "producto_url,producto_texto,mensaje_pago_valido,mensaje_pago_invalido",
  ia_sessions: "flow_context,chat_history,last_replies",
  seguimientos_v2_logs: "detalle",
  crm_historial_cliente: "titulo,detalle,metadata",
  admin_logs: "detalle",
  flujos:
    "nombre,producto,precio_normal,precio_descuento,mensaje_1,mensaje_2,qr_29,qr_19,seguimiento_1,seguimiento_2,seguimiento_3,seguimiento_4,seguimiento_5,numero_whatsapp",
  flujo_pasos: "contenido,imagen_url,boton_texto,boton_id",
};

const CARPETAS_INICIALES = ["whatsapp-meta", "whatsapp"];

const CONSULTAS_TEXTO = [
  {
    tabla: "remarketing_global_24h",
    columnas: [
      "mensaje_remarketing",
      "ultimo_camino",
      "motivo_cancelacion",
      "ultimo_nodo_id",
      "ultimo_nodo_tipo",
      "ultimo_nodo_nombre",
      "flujo_nombre",
      "oferta_nombre",
      "oferta_validez",
      "oferta_moneda",
      "oferta_consumida_por",
    ],
  },
  { tabla: "seguimientos_v2", columnas: ["media_url", "contenido", "error_detalle"] },
  { tabla: "seguimientos_programados", columnas: ["error_detalle"] },
  { tabla: "conversaciones", columnas: ["ultimo_mensaje"] },
  { tabla: "clientes", columnas: ["comprobante_url"] },
  {
    tabla: "lector_pagos_estado",
    columnas: ["producto_url", "producto_texto", "mensaje_pago_valido", "mensaje_pago_invalido"],
  },
  { tabla: "crm_historial_cliente", columnas: ["titulo", "detalle"] },
  {
    tabla: "flujos",
    columnas: [
      "nombre",
      "producto",
      "precio_normal",
      "precio_descuento",
      "mensaje_1",
      "mensaje_2",
      "qr_29",
      "qr_19",
      "seguimiento_1",
      "seguimiento_2",
      "seguimiento_3",
      "seguimiento_4",
      "seguimiento_5",
      "numero_whatsapp",
    ],
  },
  { tabla: "flujo_pasos", columnas: ["contenido", "imagen_url", "boton_texto", "boton_id"] },
];

const estadoGlobal = crearEstado();

function crearEstado() {
  return {
    fase: "protegidas",
    fuenteIndex: 0,
    offset: 0,
    protegidas: new Set(),
    fuentesOmitidas: [],
    proteccionIncompleta: false,
    entrantesCompletos: false,
    hilos: new Map(),
    usos: new Map(),
    clasificado: false,
    candidatos: new Map(),
    excluidos: null,
    carpetas: CARPETAS_INICIALES.slice(),
    carpetaIndex: 0,
    listadoOffset: 0,
    visitadas: new Set(CARPETAS_INICIALES),
    inventario: new Map(),
    nombresProtegidos: new Set(),
    originales: new Set(),
    fuenteIlegible: null,
    enCurso: false,
  };
}

function reiniciarProgreso(estado = estadoGlobal) {
  const fresco = crearEstado();
  Object.keys(estado).forEach((clave) => {
    delete estado[clave];
  });
  Object.assign(estado, fresco);
  return estado;
}

function solicitarBorradoReal() {
  const error = new Error(
    "Eliminación real de multimedia bloqueada. Esta versión solo simula."
  );
  error.code = "LIMPIEZA_MEDIA_SOLO_SIMULACION";
  throw error;
}

function headersSupabase() {
  const key = process.env.SUPABASE_SECRET_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

async function leerFuenteReal({ fuente, offset, limit }) {
  const select = SELECT_FUENTE[fuente];
  if (!select) return [];
  const pagina = `order=id.asc&limit=${limit}&offset=${offset}`;
  const res = await conReintento(() =>
    axios.get(
      `${process.env.SUPABASE_URL}/rest/v1/${fuente}?select=${select}&${pagina}`,
      { headers: headersSupabase(), timeout: 20000 }
    )
  );
  return Array.isArray(res.data) ? res.data : [];
}

async function leerMensajesReal({ fase, offset, limit }) {
  const select =
    fase === "entrantes"
      ? "select=usuario_id,conexion_whatsapp_id,cliente_numero,creado_en&direccion=eq.entrante"
      : "select=usuario_id,conexion_whatsapp_id,cliente_numero,imagen_url,contenido";
  const res = await conReintento(() =>
    axios.get(
      `${process.env.SUPABASE_URL}/rest/v1/mensajes?${select}&order=id.asc&limit=${limit}&offset=${offset}`,
      { headers: headersSupabase(), timeout: 20000 }
    )
  );
  return Array.isArray(res.data) ? res.data : [];
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

async function listarStorageReal({ prefix, offset, limit }) {
  const res = await conReintento(() =>
    axios.post(
      `${process.env.SUPABASE_URL}/storage/v1/object/list/archivos`,
      {
        prefix,
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      },
      {
        headers: { ...headersSupabase(), "Content-Type": "application/json" },
        timeout: 20000,
      }
    )
  );
  return Array.isArray(res.data) ? res.data : [];
}

const ioReal = {
  leerFuente: leerFuenteReal,
  leerMensajes: leerMensajesReal,
  listarStorage: listarStorageReal,
  existeObjeto: (...args) => existeObjetoReal(...args),
  leerMenciones: (...args) => leerMencionesReal(...args),
  leerUltimoEntrante: (...args) => leerUltimoEntranteReal(...args),
  tieneReferenciaProtegida: (...args) => tieneReferenciaProtegidaReal(...args),
};

function absorberAnalisis(estado, analisis) {
  if (analisis.noVerificable) estado.proteccionIncompleta = true;
  for (const objeto of analisis.objetos) {
    estado.protegidas.add(objeto.clave);
    if (objeto.bucket === reglas.BUCKET_ORIGINAL_SEGUIMIENTO) {
      estado.originales.add(objeto.clave);
    }
  }
}

function absorberRutasProtegidas(estado, filas) {
  let ilegible = false;
  for (const fila of filas) {
    const analisis = reglas.analizarTextoStorage(reglas.textoDeFila(fila));
    if (analisis.noVerificable) ilegible = true;
    absorberAnalisis(estado, analisis);
  }
  return ilegible;
}

function absorberNombresMedia(estado, fuente, filas) {
  if (fuente !== "seguimientos_v2") return;
  for (const fila of filas) {
    const crudo = String(fila?.media_filename || "").trim();
    if (!crudo || crudo.includes("..")) continue;
    const base = crudo.split("/").pop();
    if (base && base !== "." && reglas.segmentoFiltroSeguro(base)) {
      estado.nombresProtegidos.add(base);
    }
    if (crudo.startsWith("archivos/")) estado.protegidas.add(crudo);
    if (crudo.startsWith("whatsapp/") || crudo.startsWith("whatsapp-meta/")) {
      estado.protegidas.add(`archivos/${crudo}`);
    }
  }
}

function absorberMensajeMedia(estado, fila) {
  absorberAnalisis(estado, reglas.analizarTextoStorage(fila?.contenido));
  const analisisUrl = reglas.analizarTextoStorage(fila?.imagen_url);
  if (analisisUrl.noVerificable) estado.proteccionIncompleta = true;
  for (const objeto of analisisUrl.objetos) {
    if (objeto.bucket !== reglas.BUCKET_ORIGINAL_SEGUIMIENTO) continue;
    estado.originales.add(objeto.clave);
    estado.protegidas.add(objeto.clave);
  }
  const uso = reglas.anotarUso(estado.usos, fila);
  if (uso && typeof uso === "object" && uso.noVerificable) {
    estado.proteccionIncompleta = true;
  }
}

async function pasoProtegidas(estado, io, pageSize) {
  if (estado.fuenteIndex >= FUENTES.length) return { io: false, terminado: true };
  const fuente = FUENTES[estado.fuenteIndex];
  let filas = [];
  try {
    filas = await io.leerFuente({ fuente, offset: estado.offset, limit: pageSize });
  } catch (error) {
    if (!isSchemaMissingError(error)) throw error;
    estado.fuentesOmitidas.push(fuente);
    estado.proteccionIncompleta = true;
    estado.fuenteIndex += 1;
    estado.offset = 0;
    return { io: true, terminado: false };
  }
  absorberNombresMedia(estado, fuente, filas);
  const ilegible = absorberRutasProtegidas(estado, filas);
  if (ilegible) {
    estado.fuenteIlegible = fuente;
    return { io: true, terminado: true };
  }
  if (filas.length < pageSize) {
    estado.fuenteIndex += 1;
    estado.offset = 0;
  } else {
    estado.offset += filas.length;
  }
  return { io: true, terminado: estado.fuenteIndex >= FUENTES.length };
}

async function pasoMensajes(estado, io, pageSize, fase) {
  const filas = await io.leerMensajes({ fase, offset: estado.offset, limit: pageSize });
  if (fase === "entrantes") {
    for (const fila of filas) reglas.registrarEntrante(estado.hilos, fila);
  } else {
    for (const fila of filas) absorberMensajeMedia(estado, fila);
  }
  if (estado.proteccionIncompleta) {
    estado.offset = 0;
    return { io: true, terminado: true };
  }
  if (filas.length < pageSize) {
    estado.offset = 0;
    if (fase === "entrantes") estado.entrantesCompletos = true;
    return { io: true, terminado: true };
  }
  estado.offset += filas.length;
  return { io: true, terminado: false };
}

function clasificarSiListo(estado, limiteMs) {
  if (estado.clasificado || estado.proteccionIncompleta) return;
  const resultado = reglas.clasificarUsos(
    estado.usos,
    estado.hilos,
    estado.protegidas,
    limiteMs,
    estado.nombresProtegidos
  );
  estado.candidatos = resultado.candidatos;
  estado.excluidos = resultado.excluidos;
  estado.clasificado = true;
}

async function pasoStorage(estado, io, pageSize) {
  if (estado.carpetaIndex >= estado.carpetas.length) {
    cerrarVerificacion(estado);
    return { io: false, terminado: true };
  }
  const prefix = estado.carpetas[estado.carpetaIndex];
  let items = await io.listarStorage({
    prefix,
    offset: estado.listadoOffset,
    limit: pageSize,
  });
  if (items.length === 0 && estado.listadoOffset === 0 && !prefix.endsWith("/")) {
    const alterna = await io.listarStorage({
      prefix: `${prefix}/`,
      offset: 0,
      limit: pageSize,
    });
    if (alterna.length > 0) {
      estado.carpetas[estado.carpetaIndex] = `${prefix}/`;
      items = alterna;
    }
  }
  for (const item of items) {
    if (reglas.esCarpetaStorage(item)) {
      const carpeta = reglas.rutaListada(prefix, item.name);
      if (
        carpeta &&
        !estado.visitadas.has(carpeta) &&
        (carpeta === "whatsapp" ||
          carpeta === "whatsapp-meta" ||
          carpeta.startsWith("whatsapp/") ||
          carpeta.startsWith("whatsapp-meta/"))
      ) {
        estado.visitadas.add(carpeta);
        estado.carpetas.push(carpeta);
      }
      continue;
    }
    const ruta = reglas.claveArchivosListada(reglas.rutaListada(prefix, item.name));
    if (!ruta) continue;
    const size = Number(item?.metadata?.size);
    const bytes = Number.isFinite(size) && size > 0 ? size : 0;
    estado.inventario.set(ruta, { bytes, segv2: reglas.esCopiaSegv2(ruta) });
    const candidato = estado.candidatos.get(ruta);
    if (!candidato) continue;
    candidato.existe = true;
    candidato.bytes = bytes;
  }
  if (items.length < pageSize) {
    estado.carpetaIndex += 1;
    estado.listadoOffset = 0;
  } else {
    estado.listadoOffset += items.length;
  }
  if (estado.carpetaIndex >= estado.carpetas.length) {
    cerrarVerificacion(estado);
    return { io: true, terminado: true };
  }
  return { io: true, terminado: false };
}

function cerrarVerificacion(estado) {
  let ausentes = 0;
  for (const candidato of estado.candidatos.values()) {
    if (candidato.existe !== true) {
      candidato.existe = false;
      ausentes += 1;
    }
  }
  if (estado.excluidos) estado.excluidos.objeto_ausente = ausentes;
  estado.fase = "listo";
}

function totalesVerificados(estado) {
  let candidatos = 0;
  let bytes = 0;
  let pendientes = 0;
  for (const candidato of estado.candidatos.values()) {
    if (candidato.existe === true) {
      candidatos += 1;
      bytes += candidato.bytes;
    } else if (candidato.existe == null) {
      pendientes += 1;
    }
  }
  return { candidatos, bytes, pendientes };
}

function resumirInventario(estado, limiteMs) {
  const porMotivo = {};
  const coberturaSegv2 = { revisadas: 0, candidatos: 0, protegidos: 0, ambiguos: 0, bytesCandidatos: 0 };
  const objetos = [];
  let candidatos = 0;
  let protegidos = 0;
  let ambiguos = 0;
  let bytesLiberables = 0;

  function sumar(clave, bytes, segv2, clasificacion) {
    porMotivo[clasificacion.motivo] = (porMotivo[clasificacion.motivo] || 0) + 1;
    if (clasificacion.categoria === "candidato") {
      candidatos += 1;
      bytesLiberables += bytes || 0;
    } else if (clasificacion.categoria === "protegido") {
      protegidos += 1;
    } else {
      ambiguos += 1;
    }
    if (segv2) {
      coberturaSegv2.revisadas += 1;
      if (clasificacion.categoria === "candidato") {
        coberturaSegv2.candidatos += 1;
        coberturaSegv2.bytesCandidatos += bytes || 0;
      } else if (clasificacion.categoria === "protegido") {
        coberturaSegv2.protegidos += 1;
      } else {
        coberturaSegv2.ambiguos += 1;
      }
    }
    objetos.push({
      clave,
      bytes: bytes == null ? null : bytes,
      motivo: clasificacion.motivo,
      motivoTexto: reglas.MOTIVOS[clasificacion.motivo] || clasificacion.motivo,
      categoria: clasificacion.categoria,
      segv2: Boolean(segv2),
    });
  }

  for (const [clave, info] of estado.inventario) {
    sumar(
      clave,
      info.bytes,
      info.segv2,
      reglas.clasificarObjetoInventario({
        clave,
        uso: estado.usos.get(clave),
        hilos: estado.hilos,
        protegidas: estado.protegidas,
        limiteMs,
        nombresProtegidos: estado.nombresProtegidos,
      })
    );
  }
  for (const clave of estado.originales) {
    sumar(clave, null, false, {
      categoria: "protegido",
      motivo: "original_seguimiento_v2",
    });
  }

  return {
    objetosRevisados: objetos.length,
    candidatos,
    protegidos,
    ambiguos,
    bytesLiberables,
    porMotivo,
    coberturaSegv2,
    originalesSeguimientoV2: estado.originales.size,
    objetos,
  };
}

function armarResultado(estado, extra) {
  const verificados = estado.clasificado
    ? totalesVerificados(estado)
    : { candidatos: 0, bytes: 0, pendientes: 0 };
  const informe = resumirInventario(estado, extra.limiteMs);
  const resultado = {
    modo: "simulacion",
    eliminacionReal: "bloqueada",
    pausada: false,
    enCurso: false,
    completo: estado.fase === "listo" && !estado.proteccionIncompleta,
    proteccionIncompleta: estado.proteccionIncompleta,
    fuentesOmitidas: estado.fuentesOmitidas.slice(),
    fase: estado.fase,
    hilosConEntrante: estado.hilos.size,
    hilosInactivos: estado.entrantesCompletos
      ? reglas.contarHilosInactivos(estado.hilos, extra.limiteMs)
      : null,
    rutasRevisadas: estado.usos.size,
    rutasProtegidas: estado.protegidas.size,
    candidatos: verificados.candidatos,
    candidatosPendientes: verificados.pendientes,
    bytes: verificados.bytes,
    excluidos: estado.excluidos,
    paginasEnEstaPasada: extra.paginas,
    duracionMs: extra.duracionMs,
    reiniciado: extra.reiniciado,
    objetosRevisados: informe.objetosRevisados,
    protegidos: informe.protegidos,
    ambiguos: informe.ambiguos,
    bytesLiberables: informe.bytesLiberables,
    porMotivo: informe.porMotivo,
    coberturaSegv2: informe.coberturaSegv2,
    originalesSeguimientoV2: informe.originalesSeguimientoV2,
    fuenteIlegible: estado.fuenteIlegible,
  };
  if (extra.informe) resultado.informe = informe;
  return resultado;
}

async function ejecutarLimpiezaMedia(opciones = {}) {
  const env = opciones.env || process.env;
  const estado = opciones.estado || estadoGlobal;
  if (!reglas.limpiezaActiva(env)) {
    return {
      modo: "simulacion",
      eliminacionReal: "bloqueada",
      pausada: true,
      completo: false,
      candidatos: 0,
      bytes: 0,
    };
  }
  if (estado.enCurso) {
    return {
      modo: "simulacion",
      eliminacionReal: "bloqueada",
      pausada: false,
      enCurso: true,
      completo: false,
      candidatos: 0,
      bytes: 0,
    };
  }

  const io = opciones.io || ioReal;
  const ahora = opciones.ahora || new Date();
  const dias = opciones.dias || reglas.DIAS_INACTIVIDAD;
  const limiteMs = reglas.limiteInactividadMs(ahora, dias);
  const maxMs = opciones.maxMs ?? reglas.leerEnteroAcotado(env, "LIMPIEZA_MEDIA_MAX_MS", 20000, 1000, 120000);
  const maxPaginas =
    opciones.maxPaginas ??
    reglas.leerEnteroAcotado(env, "LIMPIEZA_MEDIA_MAX_PAGINAS", 30, 1, 500);
  const pageSize =
    opciones.pageSize ?? reglas.leerEnteroAcotado(env, "LIMPIEZA_MEDIA_PAGE", 1000, 50, 1000);
  let reiniciado = false;
  if (opciones.reiniciar || estado.fase === "listo") {
    reiniciarProgreso(estado);
    reiniciado = true;
  }

  estado.enCurso = true;
  const inicio = Date.now();
  let paginas = 0;
  try {
    while (Date.now() - inicio < maxMs && paginas < maxPaginas && estado.fase !== "listo") {
      if (!process.env.SUPABASE_URL && io === ioReal) {
        throw new Error("Supabase no configurado");
      }
      if (estado.fase === "protegidas") {
        const paso = await pasoProtegidas(estado, io, pageSize);
        if (paso.io) paginas += 1;
        if (paso.terminado) {
          estado.fase = estado.proteccionIncompleta ? "listo" : "entrantes";
          estado.offset = 0;
        }
      } else if (estado.fase === "entrantes") {
        const paso = await pasoMensajes(estado, io, pageSize, "entrantes");
        paginas += 1;
        if (paso.terminado) estado.fase = "media";
      } else if (estado.fase === "media") {
        const paso = await pasoMensajes(estado, io, pageSize, "media");
        paginas += 1;
        if (estado.proteccionIncompleta) {
          estado.fuenteIlegible = estado.fuenteIlegible || "mensajes";
          estado.fase = "listo";
          estado.clasificado = false;
          estado.candidatos = new Map();
          estado.offset = 0;
        } else if (paso.terminado) {
          clasificarSiListo(estado, limiteMs);
          estado.fase = "verificar";
        }
      } else if (estado.fase === "verificar") {
        if (!estado.clasificado) clasificarSiListo(estado, limiteMs);
        const paso = await pasoStorage(estado, io, Math.min(pageSize, 100));
        if (paso.io) paginas += 1;
      }
    }

    const resultado = armarResultado(estado, {
      paginas,
      duracionMs: Date.now() - inicio,
      limiteMs,
      reiniciado,
      informe: opciones.informe === true,
    });
    console.log("[LIMPIEZA_MEDIA]", {
      completo: resultado.completo,
      fase: resultado.fase,
      candidatos: resultado.candidatos,
      bytes: resultado.bytes,
      paginas,
    });
    return { ...resultado, resumenRegistrado: false };
  } finally {
    estado.enCurso = false;
  }
}

function hiloUnico(menciones) {
  const vistos = new Map();
  for (const fila of menciones) {
    const hilo = reglas.claveHilo(fila?.usuario_id, fila?.conexion_whatsapp_id, fila?.cliente_numero);
    if (!hilo) continue;
    vistos.set(hilo, fila);
  }
  if (vistos.size !== 1) return null;
  return vistos.values().next().value;
}

async function existeObjetoReal({ clave }) {
  const ruta = reglas.sinBucket(clave);
  const barra = ruta.lastIndexOf("/");
  const carpeta = barra >= 0 ? ruta.slice(0, barra) : "";
  let offset = 0;
  for (let pagina = 0; pagina < 50; pagina += 1) {
    const items = await listarStorageReal({ prefix: carpeta, offset, limit: 100 });
    for (const item of items) {
      if (reglas.esCarpetaStorage(item)) continue;
      const unida = reglas.rutaListada(carpeta, item.name);
      if (unida === ruta || item.name === ruta) return true;
    }
    if (items.length < 100) return false;
    offset += items.length;
  }
  throw new Error("listado de existencia incompleto");
}

async function getRest(ruta) {
  const res = await conReintento(() =>
    axios.get(`${process.env.SUPABASE_URL}${ruta}`, {
      headers: headersSupabase(),
      timeout: 20000,
    })
  );
  return Array.isArray(res.data) ? res.data : [];
}

function filtroIlike(columnas, texto) {
  const partes = columnas.map((columna) => `${columna}.ilike.*${texto}*`);
  return `or=(${partes.join(",")})`;
}

async function leerMencionesReal({ clave }) {
  const ruta = reglas.sinBucket(clave);
  if (!reglas.segmentoFiltroSeguro(ruta)) {
    throw new Error("ruta no filtrable");
  }
  const filas = await getRest(
    `/rest/v1/mensajes?select=usuario_id,conexion_whatsapp_id,cliente_numero,imagen_url,contenido&${filtroIlike(["imagen_url", "contenido"], ruta)}&limit=100`
  );
  if (filas.length >= 100) throw new Error("menciones truncadas");
  return filas.filter(
    (fila) =>
      reglas.citaRutaCompleta(fila?.imagen_url, clave) ||
      reglas.citaRutaCompleta(fila?.contenido, clave)
  );
}

async function leerUltimoEntranteReal(fila) {
  const usuario = String(fila?.usuario_id || "");
  const conexion = String(fila?.conexion_whatsapp_id || "");
  const numero = String(fila?.cliente_numero || "");
  if (!reglas.segmentoFiltroSeguro(usuario) || !reglas.segmentoFiltroSeguro(conexion)) {
    throw new Error("hilo no filtrable");
  }
  if (!/^[0-9]+$/.test(numero)) throw new Error("numero no filtrable");
  const filas = await getRest(
    `/rest/v1/mensajes?select=creado_en&usuario_id=eq.${usuario}&conexion_whatsapp_id=eq.${conexion}&cliente_numero=eq.${numero}&direccion=eq.entrante&order=creado_en.desc&limit=1`
  );
  if (!filas.length) return null;
  return reglas.parseCreadoEnUtc(filas[0].creado_en);
}

async function tieneReferenciaProtegidaReal({ clave }) {
  const ruta = reglas.sinBucket(clave);
  const archivo = reglas.nombreArchivo(clave);
  if (!reglas.segmentoFiltroSeguro(ruta) || !reglas.segmentoFiltroSeguro(archivo)) {
    throw new Error("referencia no filtrable");
  }
  const porNombre = await getRest(
    `/rest/v1/seguimientos_v2?select=media_filename&media_filename=eq."${archivo}"&limit=1`
  );
  if (porNombre.some((fila) => String(fila?.media_filename || "") === archivo)) return true;
  for (const consulta of CONSULTAS_TEXTO) {
    const select = consulta.columnas.join(",");
    const filas = await getRest(
      `/rest/v1/${consulta.tabla}?select=${select}&${filtroIlike(consulta.columnas, ruta)}&limit=5`
    );
    if (filas.some((fila) => reglas.citaRutaCompleta(reglas.textoDeFila(fila), clave))) return true;
  }
  return false;
}

async function cargarProteccion(opciones = {}) {
  const io = opciones.io || ioReal;
  const estado = crearEstado();
  const pageSize = opciones.pageSize ?? 1000;
  const maxPaginas = opciones.maxPaginas ?? 100000;
  let paginas = 0;
  while (paginas < maxPaginas && !estado.fuenteIlegible) {
    const paso = await pasoProtegidas(estado, io, pageSize);
    if (paso.io) paginas += 1;
    if (estado.fuenteIlegible) break;
    if (paso.terminado && estado.fuenteIndex >= FUENTES.length) break;
    if (!paso.io && paso.terminado) break;
  }
  return {
    protegidas: estado.protegidas,
    nombresProtegidos: estado.nombresProtegidos,
    proteccionIncompleta: estado.proteccionIncompleta,
    fuenteIlegible: estado.fuenteIlegible,
  };
}

async function revalidarCandidato(clave, opciones = {}) {
  const io = opciones.io || ioReal;
  const ahora = opciones.ahora || new Date();
  const limiteMs = reglas.limiteInactividadMs(ahora, opciones.dias || reglas.DIAS_INACTIVIDAD);
  const protegidas = opciones.protegidas || new Set();
  const nombresProtegidos = opciones.nombresProtegidos || new Set();
  const base = {
    clave,
    protegidas,
    nombresProtegidos,
    limiteMs,
    existe: false,
    menciones: [],
    ultimoEntranteMs: null,
    citada: false,
    error: null,
  };
  if (reglas.esBucketExcluido(clave) || !reglas.esObjetoCandidato({
    bucket: reglas.bucketDeClave(clave),
    path: reglas.sinBucket(clave),
  })) {
    return reglas.veredictoRevalidacion(base);
  }

  try {
    base.existe = await io.existeObjeto({ clave });
    const crudas = await io.leerMenciones({ clave });
    base.menciones = (Array.isArray(crudas) ? crudas : []).filter(
      (fila) =>
        reglas.citaRutaCompleta(fila?.imagen_url, clave) ||
        reglas.citaRutaCompleta(fila?.contenido, clave)
    );
    const unico = hiloUnico(base.menciones);
    if (unico) base.ultimoEntranteMs = await io.leerUltimoEntrante(unico);
    if (base.existe === true && base.menciones.length > 0) {
      base.citada = await io.tieneReferenciaProtegida({ clave });
    }
  } catch (error) {
    base.error = error;
  }
  return reglas.veredictoRevalidacion(base);
}

module.exports = {
  ELIMINACION_REAL_BLOQUEADA,
  FUENTES,
  cargarProteccion,
  crearEstado,
  ejecutarLimpiezaMedia,
  reiniciarProgreso,
  revalidarCandidato,
  solicitarBorradoReal,
};
