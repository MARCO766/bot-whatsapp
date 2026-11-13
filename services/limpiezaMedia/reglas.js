/**
 * Reglas puras de la limpieza de multimedia.
 * No leen red ni escriben en Storage.
 */

const DIAS_INACTIVIDAD = 30;
const MS_DIA = 24 * 60 * 60 * 1000;

const PREFIJOS_CONVERSACION = ["whatsapp-meta/", "whatsapp/"];
const BUCKET_CANDIDATO = "archivos";
const BUCKET_ORIGINAL_SEGUIMIENTO = "seguimiento-v2-media";
const BUCKETS_EXCLUIDOS = new Set(["seguimiento-v2-media", "rm24h-media"]);

const MOTIVOS = {
  candidato:
    "Inactivo: el último mensaje entrante del cliente supera 30 días y el archivo pertenece a una sola conversación",
  hilo_activo: "Protegido: el cliente tuvo un mensaje entrante dentro de los últimos 30 días",
  referenciada: "Protegido: el archivo está citado por un flujo, una campaña u otra fuente compartida",
  original_seguimiento_v2: "Protegido: original de seguimiento-v2-media, fuera de la limpieza",
  compartida: "Ambiguo: el archivo está citado por más de una conversación",
  multi_usuario: "Ambiguo: el archivo está citado por más de un usuario",
  sin_entrante: "Ambiguo: la conversación no tiene un mensaje entrante que feche el plazo",
  no_verificable: "Ambiguo: la referencia no identifica una conversación completa",
  sin_referencia: "Ambiguo: el archivo no tiene una fila que explique a qué conversación pertenece",
  ruta_no_coincide: "Ambiguo: la carpeta segv2 no coincide con la conversación que cita el archivo",
  ruta_segv2_irregular: "Ambiguo: la ruta segv2 no sigue usuario/conexión/número",
  objeto_ausente: "La URL no tiene objeto en Storage; no libera espacio",
  consulta_fallida: "Excluido: una consulta de revalidación falló y el archivo no se toca",
  bucket_protegido: "Protegido: el bucket está fuera de la limpieza",
};

const MARCADORES = [
  "render/image/authenticated/",
  "render/image/public/",
  "render/image/sign/",
  "object/authenticated/",
  "object/public/",
  "object/sign/",
];

function limpiezaActiva(env = process.env) {
  return String(env.LIMPIEZA_MEDIA_ACTIVA || "").trim().toLowerCase() === "true";
}

function leerEnteroAcotado(env, nombre, defecto, min, max) {
  const raw = env?.[nombre];
  if (raw == null || String(raw).trim() === "") return defecto;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return defecto;
  return Math.min(max, Math.max(min, n));
}

function limiteInactividadMs(ahora = new Date(), dias = DIAS_INACTIVIDAD) {
  return ahora.getTime() - dias * MS_DIA;
}

function parseCreadoEnUtc(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const tieneZona = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalizado = tieneZona ? raw : `${raw.replace(" ", "T")}Z`;
  const ms = Date.parse(normalizado);
  return Number.isFinite(ms) ? ms : null;
}

function claveHilo(usuarioId, conexionId, numero) {
  const usuario = usuarioId == null ? "" : String(usuarioId).trim();
  const conexion = conexionId == null ? "" : String(conexionId).trim();
  const cliente = numero == null ? "" : String(numero).trim();
  if (!usuario || !conexion || !cliente) return null;
  return `${usuario}|${conexion}|${cliente}`;
}

function rutaConversacionValida(path) {
  const ruta = String(path || "");
  if (!ruta || ruta.includes("..") || ruta.startsWith("/")) return false;
  return PREFIJOS_CONVERSACION.some((prefijo) => ruta.startsWith(prefijo));
}

function bucketValido(bucket) {
  return /^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket);
}

function decodificarSegmento(valor) {
  let actual = String(valor || "");
  for (let i = 0; i < 2; i += 1) {
    if (!/%[0-9a-f]{2}/i.test(actual)) break;
    actual = decodeURIComponent(actual);
  }
  if (/%[0-9a-f]{2}/i.test(actual)) return null;
  return actual;
}

function rutaObjetoValida(path) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("*")) return false;
  const partes = path.split("/");
  if (partes.some((parte) => parte === "" || parte === "." || parte === "..")) return false;
  return true;
}

function partirBucketRuta(resto) {
  const fin = String(resto || "").search(/["'\\\s<>?#&]/);
  const recorte = fin >= 0 ? String(resto).slice(0, fin) : String(resto || "");
  const slash = recorte.indexOf("/");
  if (slash <= 0 || slash === recorte.length - 1) return null;
  let bucket;
  let path;
  try {
    bucket = decodificarSegmento(recorte.slice(0, slash));
    path = decodificarSegmento(recorte.slice(slash + 1));
  } catch {
    return null;
  }
  if (!bucket || !path) return null;
  bucket = bucket.toLowerCase();
  if (!bucketValido(bucket) || !rutaObjetoValida(path)) return null;
  return { bucket, path, clave: `${bucket}/${path}` };
}

function analizarTextoStorage(texto) {
  const src = String(texto || "").replace(/\\\//g, "/");
  const lower = src.toLowerCase();
  const objetos = [];
  const vistos = new Set();
  let noVerificable = false;
  let cursor = 0;
  while (cursor < src.length) {
    let mejor = null;
    for (const marcador of MARCADORES) {
      const pos = lower.indexOf(marcador, cursor);
      if (pos >= 0 && (mejor == null || pos < mejor.pos)) mejor = { pos, marcador };
    }
    if (!mejor) break;
    const anterior = mejor.pos > 0 ? lower[mejor.pos - 1] : "";
    if (anterior && /[a-z0-9]/.test(anterior)) {
      cursor = mejor.pos + mejor.marcador.length;
      continue;
    }
    const objeto = partirBucketRuta(src.slice(mejor.pos + mejor.marcador.length));
    if (!objeto) noVerificable = true;
    else if (!vistos.has(objeto.clave)) {
      vistos.add(objeto.clave);
      objetos.push(objeto);
    }
    cursor = mejor.pos + mejor.marcador.length;
  }
  return { objetos, noVerificable };
}

function esObjetoCandidato(objeto) {
  if (!objeto || objeto.bucket !== BUCKET_CANDIDATO) return false;
  return rutaConversacionValida(objeto.path);
}

function extraerRutaArchivos(imagenUrl) {
  const analisis = analizarTextoStorage(imagenUrl);
  if (analisis.noVerificable) return null;
  const objeto = analisis.objetos.find((item) => esObjetoCandidato(item));
  return objeto ? objeto.clave : null;
}

function extraerRutasProtegidasDesdeTexto(texto) {
  return analizarTextoStorage(texto).objetos.map((objeto) => objeto.clave);
}

function claveArchivosListada(ruta) {
  if (!esObjetoCandidato({ bucket: BUCKET_CANDIDATO, path: ruta })) return null;
  return `${BUCKET_CANDIDATO}/${ruta}`;
}

function textoDeFila(fila) {
  if (fila == null) return "";
  if (typeof fila === "string") return fila;
  try {
    return JSON.stringify(fila);
  } catch {
    return "";
  }
}

function registrarEntrante(hilos, fila) {
  if (fila?.direccion && fila.direccion !== "entrante") return;
  const clave = claveHilo(fila?.usuario_id, fila?.conexion_whatsapp_id, fila?.cliente_numero);
  const ms = parseCreadoEnUtc(fila?.creado_en);
  if (!clave || ms == null) return;
  const previo = hilos.get(clave);
  if (!previo || ms > previo.ultimoEntranteMs) {
    hilos.set(clave, { ultimoEntranteMs: ms });
  }
}

function asegurarUso(usos, clave) {
  let uso = usos.get(clave);
  if (!uso) {
    uso = { hilos: new Set(), usuarios: new Set(), incompleto: false };
    usos.set(clave, uso);
  }
  return uso;
}

function anotarUso(usos, fila) {
  const analisis = analizarTextoStorage(fila?.imagen_url);
  if (analisis.noVerificable) return { noVerificable: true };
  const hilo = claveHilo(fila?.usuario_id, fila?.conexion_whatsapp_id, fila?.cliente_numero);
  let ultima = null;
  for (const objeto of analisis.objetos) {
    if (!esObjetoCandidato(objeto)) continue;
    const uso = asegurarUso(usos, objeto.clave);
    if (!hilo) {
      uso.incompleto = true;
      ultima = objeto.clave;
      continue;
    }
    uso.hilos.add(hilo);
    uso.usuarios.add(String(fila.usuario_id).trim());
    ultima = objeto.clave;
  }
  return ultima;
}

function sinBucket(clave) {
  const texto = String(clave || "");
  return texto.startsWith(`${BUCKET_CANDIDATO}/`)
    ? texto.slice(BUCKET_CANDIDATO.length + 1)
    : texto;
}

function esCopiaSegv2(clave) {
  return sinBucket(clave).split("/").includes("segv2");
}

function hiloDesdeRutaSegv2(clave) {
  const partes = sinBucket(clave).split("/");
  if (partes.length !== 6) return null;
  if (partes[0] !== "whatsapp" || partes[2] !== "segv2") return null;
  if (partes.some((parte) => !parte || parte === "." || parte === "..")) return null;
  return `${partes[1]}|${partes[3]}|${partes[4]}`;
}

function motivoConRuta(uso, hilos, protegidas, limiteMs, path) {
  if (!uso || uso.incompleto || uso.hilos.size === 0) return "no_verificable";
  if (uso.usuarios.size > 1) return "multi_usuario";
  if (path && protegidas.has(path)) return "referenciada";
  if (uso.hilos.size > 1) return "compartida";
  const clave = uso.hilos.values().next().value;
  const hilo = hilos.get(clave);
  if (!hilo) return "sin_entrante";
  if (hilo.ultimoEntranteMs > limiteMs) return "hilo_activo";
  if (path && esCopiaSegv2(path)) {
    const hiloRuta = hiloDesdeRutaSegv2(path);
    if (!hiloRuta) return "ruta_segv2_irregular";
    if (hiloRuta !== clave) return "ruta_no_coincide";
  }
  return "candidato";
}

function categoriaDeMotivo(motivo) {
  if (motivo === "candidato") return "candidato";
  if (
    motivo === "hilo_activo" ||
    motivo === "referenciada" ||
    motivo === "original_seguimiento_v2"
  ) {
    return "protegido";
  }
  return "ambiguo";
}

function clasificarObjetoInventario({ clave, uso, hilos, protegidas, limiteMs, nombresProtegidos }) {
  if (String(clave || "").startsWith(`${BUCKET_ORIGINAL_SEGUIMIENTO}/`)) {
    return { categoria: "protegido", motivo: "original_seguimiento_v2" };
  }
  if (esBucketExcluido(clave)) {
    return { categoria: "protegido", motivo: "bucket_protegido" };
  }
  const nombres = nombresProtegidos || new Set();
  if (nombres.has(nombreArchivo(clave))) {
    return { categoria: "protegido", motivo: "referenciada" };
  }
  if (!uso) {
    if (protegidas.has(clave)) return { categoria: "protegido", motivo: "referenciada" };
    return { categoria: "ambiguo", motivo: "sin_referencia" };
  }
  const motivo = motivoConRuta(uso, hilos, protegidas, limiteMs, clave);
  return { categoria: categoriaDeMotivo(motivo), motivo };
}

function bucketDeClave(clave) {
  const texto = String(clave || "");
  const slash = texto.indexOf("/");
  if (slash <= 0) return "";
  return texto.slice(0, slash);
}

function esBucketExcluido(clave) {
  return BUCKETS_EXCLUIDOS.has(bucketDeClave(clave));
}

function nombreArchivo(clave) {
  const partes = sinBucket(clave).split("/");
  return partes[partes.length - 1] || "";
}

function segmentoFiltroSeguro(texto) {
  return /^[a-zA-Z0-9._/-]+$/.test(String(texto || ""));
}

function citaRutaCompleta(texto, clave) {
  const src = String(texto || "");
  const ruta = sinBucket(clave);
  if (!src || !ruta) return false;
  const agujas = [];
  if (String(clave || "").includes("/")) agujas.push(String(clave));
  agujas.push(ruta);
  for (const aguja of agujas) {
    let desde = 0;
    while (desde < src.length) {
      const pos = src.indexOf(aguja, desde);
      if (pos < 0) break;
      const antes = pos > 0 ? src[pos - 1] : "";
      const despues = src[pos + aguja.length] || "";
      const bordeAntes = pos === 0 || /[^a-zA-Z0-9]/.test(antes);
      const bordeDespues = !despues || /[^a-zA-Z0-9]/.test(despues);
      if (bordeAntes && bordeDespues) return true;
      desde = pos + aguja.length;
    }
  }
  return false;
}

function veredictoRevalidacion({
  clave,
  existe,
  menciones,
  ultimoEntranteMs,
  citada,
  error,
  protegidas,
  nombresProtegidos,
  limiteMs,
}) {
  if (error) return { motivo: "consulta_fallida", apto: false };
  if (esBucketExcluido(clave)) return { motivo: "bucket_protegido", apto: false };
  const objeto = { bucket: bucketDeClave(clave), path: sinBucket(clave) };
  if (!esObjetoCandidato(objeto)) return { motivo: "bucket_protegido", apto: false };
  if (existe !== true) return { motivo: "objeto_ausente", apto: false };

  const nombres = nombresProtegidos || new Set();
  const citas = protegidas || new Set();
  const nombre = nombreArchivo(clave);
  if (citada || citas.has(clave) || (nombre && nombres.has(nombre))) {
    return { motivo: "referenciada", apto: false };
  }

  const lista = Array.isArray(menciones) ? menciones : [];
  if (lista.length === 0) return { motivo: "sin_referencia", apto: false };

  const uso = { hilos: new Set(), usuarios: new Set(), incompleto: false };
  for (const fila of lista) {
    const hilo = claveHilo(fila?.usuario_id, fila?.conexion_whatsapp_id, fila?.cliente_numero);
    if (!hilo) {
      uso.incompleto = true;
      continue;
    }
    uso.hilos.add(hilo);
    uso.usuarios.add(String(fila.usuario_id).trim());
  }
  const hilos = new Map();
  if (uso.hilos.size === 1 && ultimoEntranteMs != null) {
    hilos.set(uso.hilos.values().next().value, { ultimoEntranteMs });
  }
  const motivo = motivoConRuta(uso, hilos, citas, limiteMs, clave);
  return { motivo, apto: motivo === "candidato" };
}

function clasificarUsos(usos, hilos, protegidas, limiteMs, nombresProtegidos) {
  const nombres = nombresProtegidos || new Set();
  const candidatos = new Map();
  const excluidos = {
    multi_usuario: 0,
    referenciada: 0,
    compartida: 0,
    hilo_activo: 0,
    sin_entrante: 0,
    no_verificable: 0,
    objeto_ausente: 0,
    ruta_no_coincide: 0,
    ruta_segv2_irregular: 0,
  };
  for (const [path, uso] of usos) {
    if (nombres.has(nombreArchivo(path))) {
      excluidos.referenciada += 1;
      continue;
    }
    const motivo = motivoConRuta(uso, hilos, protegidas, limiteMs, path);
    if (motivo === "candidato") {
      candidatos.set(path, { existe: null, bytes: 0 });
    } else {
      excluidos[motivo] += 1;
    }
  }
  return { candidatos, excluidos };
}

function contarHilosInactivos(hilos, limiteMs) {
  let n = 0;
  for (const hilo of hilos.values()) {
    if (hilo.ultimoEntranteMs <= limiteMs) n += 1;
  }
  return n;
}

function esCarpetaStorage(item) {
  return item?.id == null;
}

function rutaListada(prefix, name) {
  const limpio = String(name || "").replace(/^\/+/, "");
  const base = String(prefix || "").replace(/\/+$/, "");
  if (!limpio || limpio.includes("..")) return null;
  if (limpio.startsWith("whatsapp-meta/") || limpio.startsWith("whatsapp/")) return limpio;
  if (!base) return rutaConversacionValida(limpio) ? limpio : null;
  return `${base}/${limpio}`;
}

function resumenSinRutas(detalle) {
  const copia = { ...detalle };
  delete copia.rutas;
  delete copia.paths;
  delete copia.objetos;
  return copia;
}

module.exports = {
  BUCKET_ORIGINAL_SEGUIMIENTO,
  BUCKETS_EXCLUIDOS,
  DIAS_INACTIVIDAD,
  MOTIVOS,
  bucketDeClave,
  citaRutaCompleta,
  esBucketExcluido,
  nombreArchivo,
  segmentoFiltroSeguro,
  sinBucket,
  veredictoRevalidacion,
  analizarTextoStorage,
  categoriaDeMotivo,
  clasificarObjetoInventario,
  esCopiaSegv2,
  anotarUso,
  claveArchivosListada,
  clasificarUsos,
  claveHilo,
  contarHilosInactivos,
  esCarpetaStorage,
  esObjetoCandidato,
  extraerRutaArchivos,
  extraerRutasProtegidasDesdeTexto,
  leerEnteroAcotado,
  limpiezaActiva,
  limiteInactividadMs,
  motivoConRuta,
  parseCreadoEnUtc,
  registrarEntrante,
  resumenSinRutas,
  rutaConversacionValida,
  rutaListada,
  textoDeFila,
};
