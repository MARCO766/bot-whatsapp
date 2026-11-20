/**
 * Marca por conversación, sin vencimiento, que sobrevive a la caída del proceso.
 *
 * Un pg_advisory_lock de sesión se suelta cuando muere la conexión. Storage
 * sigue en otra conexión HTTP, y el webhook puede entrar con el DELETE en curso.
 * Una transacción o un FOR UPDATE terminan cuando PostgREST devuelve la sesión,
 * antes de esa llamada.
 *
 * La marca se confirma en estado "borrando" antes de llamar a Storage y no
 * tiene TTL. El webhook, si la ve, espera o responde 503 sin insertar. Otra
 * conversación usa otra clave. Si no se puede confirmar la marca, no se borra.
 * Si la confirmación se pierde durante el DELETE, la marca queda y el resultado
 * es incierto: no se reintenta y no se restaura el archivo como garantía.
 *
 * Este módulo no escribe en Postgres. abrirMarcaReal() responde que no está
 * disponible. Sin esa marca desplegada, el archivo sigue protegido.
 */
const CLAVES_INCIERTAS = new Set();

function abrirMarcaReal() {
  return {
    disponible: false,
    sinVencimiento: false,
    sobreviveDesconexion: false,
    motivo: "marca_no_disponible",
  };
}

function crearRegistroDePrueba() {
  const porHilo = new Map();
  return {
    porHilo,
    auditoria: [],
    async tomar({ hilo, owner, estado, ficha = {} }) {
      const actual = porHilo.get(hilo);
      if (actual?.resultado === "incierto") {
        if (estado !== "entrante" || actual.estado === "borrando" || actual.estado === "reservado") {
          return { ok: false, motivo: "resultado_incierto", reintentar: false, owner: actual.owner };
        }
        if (actual.estado === "entrante" && actual.owner !== owner) {
          return { ok: false, motivo: "valla_ocupada", owner: actual.owner };
        }
        actual.estado = "entrante";
        actual.owner = owner;
        return { ok: true, estado: "entrante" };
      }
      if (actual?.estado === "borrando") {
        return { ok: false, motivo: "resultado_incierto", owner: actual.owner };
      }
      if (actual && actual.owner !== owner) return { ok: false, motivo: "valla_ocupada", owner: actual.owner };
      const partes = String(hilo).split("|");
      porHilo.set(hilo, {
        owner,
        estado,
        usuarioId: ficha.usuarioId || partes[0] || null,
        conexionId: ficha.conexionId || partes[1] || null,
        clienteNumero: ficha.clienteNumero || partes[2] || null,
        claveArchivo: actual?.claveArchivo || null,
        iniciadaEn: actual?.iniciadaEn || null,
        resultado: actual?.resultado || null,
        verificacion: actual?.verificacion || null,
      });
      return { ok: true, estado };
    },
    async leer(hilo) {
      const actual = porHilo.get(hilo);
      return actual ? { hilo, ...actual } : null;
    },
    async fijar({ hilo, owner, campos }) {
      const actual = porHilo.get(hilo);
      if (!actual || actual.owner !== owner) return { ok: false };
      Object.assign(actual, campos);
      return { ok: true };
    },
    async confirmar({ hilo, owner, estado }) {
      const actual = porHilo.get(hilo);
      if (!actual || actual.owner !== owner || actual.estado !== estado) return { ok: false };
      return { ok: true, estado: actual.estado };
    },
    async promover({ hilo, owner, desde, hacia }) {
      const actual = porHilo.get(hilo);
      if (!actual || actual.owner !== owner || actual.estado !== desde) return { ok: false };
      actual.estado = hacia;
      return { ok: true, estado: hacia };
    },
    cortar() {},
    async soltar({ hilo, owner, permitirBorrando = false }) {
      const actual = porHilo.get(hilo);
      if (!actual || actual.owner !== owner) return { ok: false, motivo: "valla_ajena" };
      if (actual.estado === "borrando" && permitirBorrando !== true) {
        return { ok: false, motivo: "resultado_incierto" };
      }
      if (actual.resultado === "incierto") {
        actual.estado = null;
        actual.owner = null;
        return { ok: true };
      }
      porHilo.delete(hilo);
      return { ok: true };
    },
  };
}

async function abrirMarcaDePrueba({ registro, hilo, owner, entranteMs }) {
  const toma = await registro.tomar({ hilo, owner, estado: "reservado" });
  if (!toma.ok) {
    return { disponible: false, sinVencimiento: false, sobreviveDesconexion: false, motivo: toma.motivo };
  }
  const marca = {
    disponible: true,
    sinVencimiento: true,
    sobreviveDesconexion: true,
    bloqueaInsertos: true,
    sesionAbierta: true,
    entranteObservadoMs: entranteMs,
    hilo,
    owner,
    async hayEspera() {
      return false;
    },
    async leerUltimoEntrante() {
      return marca.entranteObservadoMs;
    },
    async confirmar(estado) {
      return registro.confirmar({ hilo, owner, estado });
    },
    async promoverABorrando() {
      return registro.promover({ hilo, owner, desde: "reservado", hacia: "borrando" });
    },
    async leer() {
      return registro.leer(hilo);
    },
    async fijar(campos) {
      return registro.fijar({ hilo, owner, campos });
    },
    async cerrar() {
      const suelta = await registro.soltar({ hilo, owner });
      if (suelta.ok) marca.sesionAbierta = false;
      return suelta;
    },
    async soltarTrasExito() {
      const suelta = await registro.soltar({ hilo, owner, permitirBorrando: true });
      if (suelta.ok) marca.sesionAbierta = false;
      return suelta;
    },
  };
  return marca;
}

function marcarIncierto(clave) {
  if (clave) CLAVES_INCIERTAS.add(clave);
}

function esIncierto(clave) {
  return CLAVES_INCIERTAS.has(clave);
}

function resultadoIncerto() {
  return {
    eliminado: false,
    incierto: true,
    reintentar: false,
    motivo: "resultado_incierto",
    storage: false,
    abortar: true,
  };
}

function estadoHttp(http) {
  if (http == null || http.status == null || http.status === "") return null;
  const status = Number(http.status);
  return Number.isInteger(status) ? status : null;
}

function objetoYaNoExiste(http) {
  return estadoHttp(http) === 404;
}

function borradoExitoso(http) {
  if (http?.eliminado !== true) return false;
  const status = estadoHttp(http);
  return status == null || status === 200 || status === 204 || status === 404;
}

function clasificarResultadoStorage(http) {
  if (!http || typeof http !== "object" || http.incierto === true) return "incierto";
  if (objetoYaNoExiste(http) || borradoExitoso(http)) return "eliminado_confirmado";
  return "incierto";
}

async function verificarMarcaBorrando(marca) {
  if (!marca || marca.sobreviveDesconexion !== true || marca.sinVencimiento !== true) {
    return { ok: false, motivo: "marca_no_verificada" };
  }
  if (typeof marca.leer !== "function" || typeof marca.confirmar !== "function") {
    return { ok: false, motivo: "marca_no_verificada" };
  }
  let fila;
  try {
    fila = await marca.leer();
  } catch (error) {
    return { ok: false, motivo: "marca_no_verificada" };
  }
  if (!fila) return { ok: false, motivo: "marca_ausente" };
  if (fila.estado !== "borrando") return { ok: false, motivo: "marca_no_borrando" };
  if (fila.resultado != null) {
    return { ok: false, motivo: fila.resultado === "incierto" ? "resultado_incierto" : "marca_no_verificada" };
  }
  let confirmada = false;
  try {
    confirmada = (await marca.confirmar("borrando"))?.ok === true;
  } catch (error) {
    confirmada = false;
  }
  if (!confirmada) return { ok: false, motivo: "marca_no_verificada" };
  return { ok: true };
}

async function vigenciaPerdida(marca) {
  if (typeof marca?.asegurarVigencia !== "function") return false;
  try {
    const vigencia = await marca.asegurarVigencia();
    return vigencia?.ok !== true;
  } catch (error) {
    return true;
  }
}

async function ejecutarBajoMarca({ clave, marca, borrarObjeto }) {
  const filaInicial = typeof marca?.leer === "function" ? await marca.leer() : null;
  if (esIncierto(clave) || filaInicial?.resultado === "incierto" || filaInicial?.estado === "borrando") {
    return { ...resultadoIncerto(), previo: true };
  }
  if (!marca || marca.sobreviveDesconexion !== true || marca.sinVencimiento !== true) {
    return { eliminado: false, motivo: "proteccion_no_durable", storage: false, abortar: true, reintentar: false };
  }
  let promovida = false;
  try {
    promovida = (await marca.promoverABorrando())?.ok === true;
  } catch (error) {
    promovida = false;
  }
  if (!promovida) {
    if (typeof marca.cerrar === "function") await marca.cerrar();
    return { eliminado: false, motivo: "conexion_perdida", storage: false, abortar: true, reintentar: false };
  }
  if (typeof marca.fijar === "function") {
    await marca.fijar({
      claveArchivo: clave,
      iniciadaEn: new Date().toISOString(),
      resultado: null,
    });
  }
  let confirmada = false;
  try {
    confirmada = (await marca.confirmar("borrando"))?.ok === true;
  } catch (error) {
    confirmada = false;
  }
  if (!confirmada) {
    marcarIncierto(clave);
    if (typeof marca.fijar === "function") await marca.fijar({ resultado: "incierto" });
    return resultadoIncerto();
  }
  if (await vigenciaPerdida(marca)) {
    marcarIncierto(clave);
    if (typeof marca.fijar === "function") await marca.fijar({ resultado: "incierto" });
    console.error("[LIMPIEZA_MEDIA] resultado incierto: la valla se perdio antes de storage", { clave });
    return resultadoIncerto();
  }
  let http;
  try {
    http = await borrarObjeto();
  } catch (error) {
    marcarIncierto(clave);
    if (typeof marca.fijar === "function") await marca.fijar({ resultado: "incierto" });
    console.error("[LIMPIEZA_MEDIA] resultado incierto: storage fallo con la marca en borrando", { clave });
    return resultadoIncerto();
  }
  if (await vigenciaPerdida(marca)) {
    marcarIncierto(clave);
    if (typeof marca.fijar === "function") await marca.fijar({ resultado: "incierto" });
    console.error("[LIMPIEZA_MEDIA] resultado incierto: la valla se perdio durante storage", { clave });
    return {
      ...resultadoIncerto(),
      storage: http?.eliminado === true,
    };
  }
  const resultadoStorage = clasificarResultadoStorage(http);
  if (resultadoStorage === "incierto") {
    marcarIncierto(clave);
    if (typeof marca.fijar === "function") await marca.fijar({ resultado: "incierto" });
    console.error("[LIMPIEZA_MEDIA] resultado incierto: storage no confirmo el DELETE", { clave });
    return {
      ...resultadoIncerto(),
      storage: http?.storage === true,
    };
  }
  let sigue = false;
  try {
    sigue = (await marca.confirmar("borrando"))?.ok === true;
  } catch (error) {
    sigue = false;
  }
  if (!sigue) {
    marcarIncierto(clave);
    if (typeof marca.fijar === "function") await marca.fijar({ resultado: "incierto" });
    console.error("[LIMPIEZA_MEDIA] resultado incierto: la marca no se pudo confirmar tras storage", { clave });
    return {
      eliminado: false,
      incierto: true,
      reintentar: false,
      motivo: "resultado_incierto",
      storage: http?.eliminado === true,
      abortar: true,
    };
  }
  if (typeof marca.fijar === "function") {
    await marca.fijar({ resultado: resultadoStorage });
  }
  if (typeof marca.soltarTrasExito === "function") {
    const suelta = await marca.soltarTrasExito();
    if (!suelta?.ok) {
      marcarIncierto(clave);
      return {
        eliminado: false,
        incierto: true,
        reintentar: false,
        motivo: "resultado_incierto",
        storage: http?.eliminado === true,
        abortar: true,
      };
    }
  }
  return {
    eliminado: true,
    incierto: false,
    reintentar: false,
    motivo: "eliminado",
    storage: true,
    abortar: false,
  };
}

function olvidarMemoriaDeProceso() {
  CLAVES_INCIERTAS.clear();
}

async function entrarConversacion({ registro, hilo, owner, esperarMs = 0, persistir, mantener = false }) {
  const limite = Date.now() + Math.max(0, esperarMs);
  const ocupada = () => {
    const actual = registro.porHilo.get(hilo);
    return actual ? actual.owner : null;
  };
  while (ocupada() && ocupada() !== owner && Date.now() < limite) {
    await new Promise((resolver) => setTimeout(resolver, 5));
  }
  if (ocupada() && ocupada() !== owner) {
    return { status: 503, guardado: false, confirmado: false, reintentar: true, motivo: "valla_ocupada" };
  }
  const toma = await registro.tomar({ hilo, owner, estado: "entrante" });
  if (!toma.ok) {
    return { status: 503, guardado: false, confirmado: false, reintentar: true, motivo: toma.motivo || "valla_ocupada" };
  }
  const vallaEntrante = {
    ok: true,
    hilo,
    owner,
    estado: "entrante",
    modo: "entrante",
    registro,
    liberar: async () => {
      const actual = registro.porHilo.get(hilo);
      if (!actual || actual.owner !== owner) return { ok: false, motivo: "valla_ajena" };
      if (actual.estado !== "entrante") return { ok: false, motivo: "marca_de_limpieza" };
      return registro.soltar({ hilo, owner });
    },
  };
  let conservar = false;
  let respuesta;
  try {
    const resultado = await persistir();
    if (resultado?.duplicate) {
      respuesta = { status: 200, guardado: false, confirmado: true, duplicado: true, reintentar: false, valla: null };
    } else if (!resultado?.claimed) {
      respuesta = { status: 503, guardado: false, confirmado: false, reintentar: true, motivo: "claim_fallido", valla: null };
    } else {
      conservar = mantener === true;
      respuesta = {
        status: 200,
        guardado: true,
        confirmado: true,
        reintentar: false,
        valla: conservar ? vallaEntrante : null,
      };
    }
  } catch (error) {
    respuesta = { status: 503, guardado: false, confirmado: false, reintentar: true, motivo: "persistencia_fallida", valla: null };
  }
  if (!conservar) {
    try {
      const suelta = await vallaEntrante.liberar();
      if (suelta?.ok === false && suelta.motivo !== "marca_de_limpieza" && suelta.motivo !== "valla_ajena") {
        respuesta.valla = vallaEntrante;
      }
    } catch (error) {
      respuesta.valla = vallaEntrante;
    }
  }
  return respuesta;
}

module.exports = {
  abrirMarcaDePrueba,
  abrirMarcaReal,
  clasificarResultadoStorage,
  crearRegistroDePrueba,
  entrarConversacion,
  esIncierto,
  ejecutarBajoMarca,
  marcarIncierto,
  olvidarMemoriaDeProceso,
  verificarMarcaBorrando,
};
