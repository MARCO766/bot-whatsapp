/**
 * Puerta única de los entrantes.
 * Con la marca instalada, nada se confirma si la conversación está en
 * reservado o borrando. Sin la tabla, el mensaje se guarda en modo degradado
 * y la limpieza sigue sin poder borrar: abrirMarcaReal no está disponible.
 * El webhook pasa permitirRed. Si la función no está instalada y el borrado
 * real sigue bloqueado, el mensaje se guarda. Si el borrado real fuera posible
 * y el almacén no responde, no se confirma el entrante.
 */
const reglas = require("./reglas");
const marcaMedia = require("./limpiezaMediaMarca");
const marcaStore = require("./limpiezaMediaMarcaStore");
const vallaMedia = require("./limpiezaMediaValla");
const servicio = require("./limpiezaMediaService");

const MOTIVOS_MARCA_AJENA = new Set(["marca_de_limpieza", "valla_ajena"]);
const ESTADOS_QUE_BLOQUEAN = new Set(["reservado", "borrando"]);
const TOPE_CONSULTA_MS = 500;

const CACHE_AUSENCIA_DEFECTO_MS = 60000;
const CACHE_AUSENCIA_MIN_MS = 5000;
const CACHE_AUSENCIA_MAX_MS = 15 * 60 * 1000;

let esquemaMarcaAusente = false;
let firmaEsquemaAusente = "";
let venceEsquemaAusente = 0;
let sondaAusencia = null;

const TIPOS_ENTRANTE = [
  "text",
  "image",
  "audio",
  "video",
  "document",
  "reaction",
  "interactive",
  "button",
  "sticker",
  "location",
  "contacts",
  "order",
  "unsupported",
];

function esMarcaDeLimpieza(actual) {
  if (!actual || typeof actual !== "object") return false;
  if (actual.modo === "limpieza") return true;
  if (actual.estado === "reservado" || actual.estado === "borrando") return true;
  const owner = actual.owner == null ? "" : String(actual.owner);
  return owner.startsWith("cl:");
}

function clasificarLiberacion(suelta) {
  if (suelta?.ok === true) return { ok: true, retenida: false, motivo: suelta.motivo || "soltada" };
  const motivo = suelta?.motivo || "liberacion_fallida";
  if (MOTIVOS_MARCA_AJENA.has(motivo)) return { ok: false, retenida: false, motivo, ajena: true };
  return { ok: false, retenida: true, motivo };
}

function estadoHttpTrasSoltar(suelta, statusSiLibre) {
  if (suelta?.retenida === true) return 503;
  return statusSiLibre;
}

async function intentarLiberarEntrante(actual) {
  if (!actual?.ok || esMarcaDeLimpieza(actual)) return { ok: true, omitida: true, retenida: false };
  try {
    let suelta;
    if (typeof actual.liberar === "function") suelta = await actual.liberar();
    else if (actual.modo === "entrante") suelta = await vallaMedia.liberarHilo({ ...actual, modo: "entrante" });
    else return { ok: true, omitida: true, retenida: false };
    return clasificarLiberacion(suelta);
  } catch (error) {
    return { ok: false, retenida: true, motivo: "liberacion_fallida" };
  }
}

function registrarLiberacionFallida(actual, resultado) {
  console.log("[LIMPIEZA_MEDIA] marca entrante retenida", {
    motivo: resultado?.motivo || "liberacion_fallida",
    owner: actual?.owner || null,
    estado: actual?.estado || null,
    modo: actual?.modo || null,
    liberaMarcaAjena: false,
    eliminaMarcaBorrando: false,
  });
}

async function soltarMarcaEntrante(actual) {
  const primero = await intentarLiberarEntrante(actual);
  const resultado = primero.retenida ? await intentarLiberarEntrante(actual) : primero;
  if (resultado && actual?.owner && resultado.owner == null) resultado.owner = actual.owner;
  if (resultado?.retenida) registrarLiberacionFallida(actual, resultado);
  return resultado;
}

function statusSiMensajeGuardado(guardado, suelta, statusSiLibre) {
  if (guardado) return statusSiLibre;
  return estadoHttpTrasSoltar(suelta, statusSiLibre);
}

function statusHttpEntrante(coordinado, suelta) {
  if (coordinado?.incierto === true) return 503;
  if (coordinado?.duplicado === true) return 200;
  if (coordinado?.proteccion === true) return 503;
  if (!coordinado?.guardado) {
    if (coordinado?.reintentar === true) return 503;
    return 200;
  }
  return statusSiMensajeGuardado(true, suelta, 200);
}

function proteccionEntranteActiva(env = process.env) {
  return reglas.limpiezaActiva(env);
}

function entornoDe(opciones = {}) {
  return opciones.env || process.env;
}

function firmaConfiguracion(opciones = {}) {
  const env = entornoDe(opciones);
  const activa = typeof opciones.activa === "boolean" ? opciones.activa : reglas.limpiezaActiva(env);
  return [
    activa ? "activa" : "inactiva",
    borradoRealPosible() ? "borrado" : "bloqueado",
    String(env.SUPABASE_URL || "").trim(),
  ].join("|");
}

function ahoraDe(opciones = {}) {
  if (typeof opciones.ahoraMs === "function") return opciones.ahoraMs();
  if (Number.isFinite(opciones.ahoraMs)) return opciones.ahoraMs;
  return Date.now();
}

function plazoCacheAusencia(opciones = {}) {
  if (Number.isFinite(opciones.cacheAusenciaMs) && opciones.cacheAusenciaMs > 0) {
    return opciones.cacheAusenciaMs;
  }
  return reglas.leerEnteroAcotado(
    entornoDe(opciones),
    "LIMPIEZA_MEDIA_CACHE_AUSENCIA_MS",
    CACHE_AUSENCIA_DEFECTO_MS,
    CACHE_AUSENCIA_MIN_MS,
    CACHE_AUSENCIA_MAX_MS
  );
}

function alinearCacheConfiguracion(opciones = {}) {
  if (!esquemaMarcaAusente) return;
  if (firmaEsquemaAusente !== firmaConfiguracion(opciones)) {
    esquemaMarcaAusente = false;
    firmaEsquemaAusente = "";
    venceEsquemaAusente = 0;
  }
}

function cacheAusenciaVigente(opciones = {}) {
  if (!esquemaMarcaAusente || borradoRealPosible()) return false;
  if (firmaEsquemaAusente !== firmaConfiguracion(opciones)) return false;
  return ahoraDe(opciones) < venceEsquemaAusente;
}

function recordarEsquemaAusente(opciones = {}) {
  esquemaMarcaAusente = true;
  firmaEsquemaAusente = firmaConfiguracion(opciones);
  venceEsquemaAusente = ahoraDe(opciones) + plazoCacheAusencia(opciones);
}

function olvidarEsquemaAusente() {
  esquemaMarcaAusente = false;
  firmaEsquemaAusente = "";
  venceEsquemaAusente = 0;
}

function ausenciaPorRevalidar(opciones = {}) {
  return opciones.cachearAusencia === true
    && esquemaMarcaAusente
    && !borradoRealPosible()
    && firmaEsquemaAusente === firmaConfiguracion(opciones)
    && !cacheAusenciaVigente(opciones);
}

function marcaNoInstalada() {
  return { instalada: false, motivo: "marca_no_disponible" };
}

function borradoRealPosible() {
  return servicio.ELIMINACION_REAL_BLOQUEADA !== true || servicio.eliminacionRealPermitida() === true;
}

function permiteConfirmacionEntrante(opciones = {}) {
  const store = opciones.marca || marcaNoInstalada();
  if (store.sostenida === true && store.estado === "entrante") return { ok: true, degradada: false };
  if (store.estado === "reservado" || store.estado === "borrando") {
    return { ok: false, motivo: "valla_ocupada" };
  }
  if (store.instalada !== true) return { ok: true, degradada: true, motivo: store.motivo || "marca_no_disponible" };
  const hilo = reglas.claveHilo(opciones.usuarioId, opciones.conexionId, opciones.numero);
  const fila = hilo ? store.registro?.porHilo?.get(hilo) : null;
  if (!fila) return { ok: false, motivo: "marca_entrante_ausente" };
  if (fila.estado === "borrando" || fila.estado === "reservado") {
    return { ok: false, motivo: "valla_ocupada" };
  }
  if (fila.estado !== "entrante") return { ok: false, motivo: "marca_entrante_ausente" };
  return { ok: true, degradada: false };
}

async function resolverPermisoEntrante(opciones = {}) {
  if (opciones.marca) return permiteConfirmacionEntrante(opciones);
  if (opciones.consultarDurable !== true) return permiteConfirmacionEntrante(opciones);
  const visto = await marcaStore.consultar({ ...opciones, permitirRed: true });
  if (visto.motivo === "marca_no_instalada" || visto.motivo === "sin_supabase" || visto.motivo === "marca_no_disponible") {
    if (borradoRealPosible()) return { ok: false, motivo: visto.motivo };
    return { ok: true, degradada: true, motivo: visto.motivo };
  }
  const estado = visto.marca?.estado || null;
  if (estado === "reservado" || estado === "borrando") return { ok: false, motivo: "valla_ocupada" };
  return { ok: true, degradada: false, estado };
}

function clasificarClaim(resultado, extra = {}) {
  if (resultado?.incierto === true) {
    return {
      ...extra,
      status: 503,
      guardado: null,
      incierto: true,
      confirmado: false,
      duplicado: false,
      reintentar: true,
      recuperacion: false,
      motivo: resultado.reason || "claim_incierto",
      fase: resultado.fase || null,
    };
  }
  if (resultado?.duplicate) {
    return { status: 200, guardado: false, confirmado: true, duplicado: true, ...extra, incierto: false };
  }
  if (!resultado?.claimed) {
    const rechazo = resultado?.rechazado === true || resultado?.reason === "claim_rechazado";
    const sinWamid = resultado?.reason === "no_wamid";
    return {
      ...extra,
      status: rechazo || sinWamid ? 200 : 503,
      guardado: false,
      confirmado: false,
      incierto: false,
      duplicado: false,
      reintentar: !(rechazo || sinWamid),
      motivo: resultado?.reason || "claim_fallido",
    };
  }
  return { status: 200, guardado: true, confirmado: true, ...extra };
}

function esAcuseOriginal(motivo) {
  return motivo === "limpieza_inactiva";
}

function falloDePersistencia(motivo, acuseOriginal) {
  if (acuseOriginal) {
    return {
      status: 200,
      guardado: false,
      confirmado: false,
      reintentar: false,
      motivo: "persistencia_fallida",
      persistencia: true,
      proteccion: false,
      degradada: true,
      motivoDurable: motivo,
    };
  }
  return {
    status: 503,
    guardado: false,
    confirmado: false,
    reintentar: true,
    motivo: "persistencia_fallida",
    persistencia: true,
    proteccion: false,
    degradada: true,
    motivoDurable: motivo,
  };
}

function conPoliticaDeClaim(clasificado, motivoDurable) {
  if (clasificado.incierto) {
    return { ...clasificado, proteccion: false, persistencia: true, recuperacion: false };
  }
  if (clasificado.duplicado || clasificado.guardado) {
    return { ...clasificado, proteccion: false };
  }
  if (esAcuseOriginal(motivoDurable)) {
    return {
      ...clasificado,
      status: 200,
      reintentar: false,
      persistencia: true,
      proteccion: false,
    };
  }
  return { ...clasificado, persistencia: true, proteccion: false };
}

async function persistirDegradado(opciones, motivo) {
  let resultado;
  try {
    resultado = await opciones.persistir();
  } catch (error) {
    return falloDePersistencia(motivo, esAcuseOriginal(motivo));
  }
  return conPoliticaDeClaim(
    clasificarClaim(resultado, { marcaInstalada: false, degradada: true, motivoDurable: motivo }),
    motivo
  );
}

function bloqueoConfirmado(tomado) {
  return tomado?.motivo === "valla_ocupada" && ESTADOS_QUE_BLOQUEAN.has(tomado.estado);
}

function rechazoSeguro(tomado) {
  return {
    status: 503,
    guardado: false,
    confirmado: false,
    reintentar: true,
    motivo: tomado?.motivo || "marca_no_disponible",
    estado: tomado?.estado || null,
    falloSeguro: true,
    proteccion: true,
    persistencia: false,
    marcaInstalada: false,
  };
}

function ownerEntrante(opciones) {
  return `wh:${opciones.wamid || reglas.claveHilo(opciones.usuarioId, opciones.conexionId, opciones.numero) || "sin-wamid"}`;
}

function resolverToma(opciones, tomado, owner) {
  if (tomado?.ok === true && tomado.estado === "entrante") {
    return sostenerEntranteDurable(opciones, owner);
  }
  if (bloqueoConfirmado(tomado)) {
    return {
      status: 503,
      guardado: false,
      confirmado: false,
      reintentar: true,
      motivo: "valla_ocupada",
      estado: tomado.estado,
      proteccion: true,
      persistencia: false,
      marcaInstalada: true,
      marcaDurable: true,
    };
  }
  if (tomado?.motivo === "valla_ocupada" && tomado.estado === "entrante") {
    return persistirDegradado(opciones, "entrante_ajeno");
  }
  if (borradoRealPosible()) return rechazoSeguro(tomado);
  if (tomado?.motivo === "marca_no_instalada" && opciones.cachearAusencia === true && !borradoRealPosible()) {
    recordarEsquemaAusente(opciones);
  }
  return persistirDegradado(opciones, tomado?.motivo || "marca_no_disponible");
}

function unirseASonda(opciones) {
  if (sondaAusencia) return { promesa: sondaAusencia, soyLider: false };
  const firma = firmaConfiguracion(opciones);
  const owner = ownerEntrante(opciones);
  const promesa = (async () => {
    const tomado = await marcaStore.tomarEntrante({ ...opciones, owner });
    if (tomado?.motivo === "marca_no_instalada" && !borradoRealPosible() && firmaConfiguracion(opciones) === firma) {
      recordarEsquemaAusente(opciones);
      return { ausente: true, presente: false, tomado, owner };
    }
    if (tomado?.ok === true || tomado?.motivo === "valla_ocupada") {
      if (firmaConfiguracion(opciones) === firma) olvidarEsquemaAusente();
      return { ausente: false, presente: true, tomado, owner };
    }
    return { ausente: false, presente: false, tomado, owner };
  })();
  let publicada;
  publicada = promesa.finally(() => {
    if (sondaAusencia === publicada) sondaAusencia = null;
  });
  sondaAusencia = publicada;
  return { promesa: publicada, soyLider: true };
}

async function coordinarPersistenciaEntrante(opciones = {}) {
  alinearCacheConfiguracion(opciones);
  const store = opciones.marca || marcaNoInstalada();
  if (store.instalada === true && store.registro) {
    return coordinarEnMemoria(opciones, store);
  }
  if (opciones.activa === false) {
    return persistirDegradado(opciones, "limpieza_inactiva");
  }
  if (opciones.cachearAusencia === true && cacheAusenciaVigente(opciones)) {
    return persistirDegradado(opciones, "marca_no_instalada");
  }
  if (opciones.permitirRed === true || opciones.cliente) {
    if (ausenciaPorRevalidar(opciones)) {
      const union = unirseASonda(opciones);
      const sonda = await union.promesa;
      if (sonda.ausente) return persistirDegradado(opciones, "marca_no_instalada");
      if (union.soyLider) return resolverToma(opciones, sonda.tomado, sonda.owner);
      if (!sonda.presente) {
        if (borradoRealPosible()) return rechazoSeguro(sonda.tomado);
        return persistirDegradado(opciones, sonda.tomado?.motivo || "marca_no_disponible");
      }
    }
    const owner = ownerEntrante(opciones);
    const tomado = await marcaStore.tomarEntrante({ ...opciones, owner });
    return resolverToma(opciones, tomado, owner);
  }
  const ejecutar = opciones.ejecutarSinMarca || vallaMedia.ejecutarPersistenciaEntrante;
  const resultado = await ejecutar(opciones);
  return { ...resultado, marcaInstalada: false };
}

async function sostenerEntranteDurable(opciones, owner) {
  const soltar = () => marcaStore.soltarEntrante({ ...opciones, owner });
  const valla = { ok: true, owner, estado: "entrante", modo: "entrante", liberar: soltar };
  let resultado;
  try {
    resultado = await opciones.persistir();
  } catch (error) {
    const suelta = await soltarEntranteSeguro(soltar);
    return {
      status: 503,
      guardado: false,
      confirmado: false,
      reintentar: true,
      motivo: "persistencia_fallida",
      persistencia: true,
      proteccion: false,
      marcaDurable: true,
      ...(suelta.retenida ? { valla } : {}),
    };
  }
  if (!resultado?.claimed) {
    const suelta = await soltarEntranteSeguro(soltar);
    return conPoliticaDeClaim(
      clasificarClaim(resultado, {
        marcaInstalada: true,
        marcaDurable: true,
        estado: "entrante",
        ...(suelta.retenida ? { valla } : {}),
      }),
      null
    );
  }
  return clasificarClaim(resultado, {
    marcaInstalada: true,
    marcaDurable: true,
    estado: "entrante",
    valla,
  });
}

async function soltarEntranteSeguro(soltar) {
  try {
    return clasificarLiberacion(await soltar());
  } catch (error) {
    return { ok: false, retenida: true, motivo: "liberacion_fallida" };
  }
}

async function coordinarEnMemoria(opciones, store) {
  const hilo = reglas.claveHilo(opciones.usuarioId, opciones.conexionId, opciones.numero);
  if (!hilo) {
    let resultado;
    try {
      resultado = await opciones.persistir();
    } catch (error) {
      return { status: 503, guardado: false, confirmado: false, reintentar: true, motivo: "persistencia_fallida" };
    }
    if (resultado?.duplicate) {
      return { status: 200, guardado: false, confirmado: true, duplicado: true, marcaInstalada: true };
    }
    if (!resultado?.claimed) {
      const rechazo = resultado?.rechazado === true || resultado?.reason === "claim_rechazado";
      const sinWamid = resultado?.reason === "no_wamid";
      return {
        status: rechazo || sinWamid ? 200 : 503,
        guardado: false,
        confirmado: false,
        reintentar: !(rechazo || sinWamid),
        motivo: resultado?.reason || "claim_fallido",
        marcaInstalada: true,
      };
    }
    return { status: 200, guardado: true, confirmado: true, degradada: true, motivo: "valla_sin_hilo", marcaInstalada: true };
  }
  const tomado = await marcaMedia.entrarConversacion({
    registro: store.registro,
    hilo,
    owner: `wh:${opciones.wamid || hilo}`,
    esperarMs: opciones.esperarMs || 0,
    persistir: opciones.persistir,
    mantener: true,
  });
  if (tomado.valla) {
    tomado.valla.liberar = async () => {
      const actual = store.registro.porHilo.get(hilo);
      if (!actual || actual.owner !== tomado.valla.owner) return { ok: false, motivo: "valla_ajena" };
      if (actual.estado !== "entrante") return { ok: false, motivo: "marca_de_limpieza" };
      return store.registro.soltar({ hilo, owner: tomado.valla.owner });
    };
  }
  return { ...tomado, marcaInstalada: true };
}

module.exports = {
  TIPOS_ENTRANTE,
  TOPE_CONSULTA_MS,
  clasificarLiberacion,
  coordinarPersistenciaEntrante,
  esMarcaDeLimpieza,
  estadoHttpTrasSoltar,
  marcaNoInstalada,
  olvidarEsquemaAusente,
  permiteConfirmacionEntrante,
  proteccionEntranteActiva,
  resolverPermisoEntrante,
  soltarMarcaEntrante,
  statusHttpEntrante,
  statusSiMensajeGuardado,
};
