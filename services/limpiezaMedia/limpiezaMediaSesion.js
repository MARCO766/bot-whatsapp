/**
 * Exclusión sin vencimiento entre un entrante y el DELETE de Storage.
 *
 * Una fila con locked_until no sirve: si Storage tarda más, el webhook entra
 * con el DELETE todavía en curso.
 *
 * PostgREST y el pooler de Supabase en modo transacción sueltan la sesión al
 * terminar la petición. Un pg_advisory_xact_lock o un FOR UPDATE mueren antes
 * de la llamada HTTP. pg_net es asíncrono y tampoco espera a Storage.
 *
 * Un pg_advisory_lock de sesión cubre la llamada solo mientras esa conexión
 * sigue viva. Si se corta durante el HTTP, Postgres suelta el candado y el
 * webhook puede entrar con Storage todavía en curso. Por eso no autoriza el
 * DELETE. La exclusión que sí sobrevive es la marca de limpiezaMediaMarca.js.
 *
 * Este módulo no abre esa conexión. abrirSesionDedicada() responde que no está
 * disponible y la limpieza deja el archivo protegido. Las pruebas inyectan una
 * sesión falsa con el mismo contrato.
 *
 * Si la conexión muere antes del DELETE, no se borra. Si muere durante el
 * DELETE, el resultado queda incierto y no se vuelve a intentar. Restaurar el
 * archivo no es la garantía.
 *
 * ejecutarBajoSesion no llama a la función de borrado si no puede demostrar
 * una marca durable en borrando. Si la sesión dedicada no está disponible,
 * la llamada falla cerrada y no hay otra ruta de borrado en este módulo.
 */
const marcaMedia = require("./limpiezaMediaMarca");
const CLAVES_INCIERTAS = new Set();

function abrirSesionDedicada() {
  return {
    disponible: false,
    conexionDedicada: false,
    sinVencimiento: false,
    motivo: "sesion_dedicada_no_disponible",
  };
}

function crearRegistroDePrueba() {
  const porHilo = new Map();
  let siguiente = 1;
  return {
    porHilo,
    async adquirir({ hilo, owner }) {
      const actual = porHilo.get(hilo);
      if (actual?.viva) return { ok: false, motivo: "valla_ocupada", owner: actual.owner };
      const conexionId = siguiente;
      siguiente += 1;
      porHilo.set(hilo, { owner, conexionId, viva: true });
      return { ok: true, conexionId, owner };
    },
    async liberar({ hilo, owner, conexionId }) {
      const actual = porHilo.get(hilo);
      if (!actual || actual.owner !== owner || actual.conexionId !== conexionId || !actual.viva) {
        return { ok: false, motivo: "valla_ajena" };
      }
      porHilo.delete(hilo);
      return { ok: true };
    },
    cortar(conexionId) {
      for (const [hilo, actual] of porHilo) {
        if (actual.conexionId === conexionId) {
          actual.viva = false;
          porHilo.delete(hilo);
        }
      }
    },
    viva({ hilo, conexionId }) {
      const actual = porHilo.get(hilo);
      return Boolean(actual && actual.viva && actual.conexionId === conexionId);
    },
  };
}

async function abrirSesionDePrueba({ registro, hilo, owner, entranteMs }) {
  const toma = await registro.adquirir({ hilo, owner });
  if (!toma.ok) {
    return { disponible: false, conexionDedicada: false, sinVencimiento: false, motivo: toma.motivo };
  }
  const sesion = {
    disponible: true,
    conexionDedicada: true,
    sinVencimiento: true,
    bloqueaInsertos: true,
    sesionAbierta: true,
    entranteObservadoMs: entranteMs,
    motivoPerdida: null,
    hilo,
    owner,
    conexionId: toma.conexionId,
    async viva() {
      return registro.viva({ hilo, conexionId: toma.conexionId });
    },
    async leerUltimoEntrante() {
      return sesion.entranteObservadoMs;
    },
    async hayEspera() {
      return false;
    },
    async cerrar() {
      sesion.sesionAbierta = false;
      await registro.liberar({ hilo, owner, conexionId: toma.conexionId });
    },
  };
  return sesion;
}

function marcarIncierto(clave) {
  if (clave) CLAVES_INCIERTAS.add(clave);
}

function esIncierto(clave) {
  return CLAVES_INCIERTAS.has(clave);
}

function rechazoSesion(motivo) {
  return {
    eliminado: false,
    incierto: motivo === "resultado_incierto",
    reintentar: false,
    motivo,
    storage: false,
    abortar: true,
  };
}

async function ejecutarBajoSesion({ clave, sesion, marca, borrarObjeto }) {
  if (esIncierto(clave)) return rechazoSesion("resultado_incierto");
  let verificada;
  try {
    verificada = await marcaMedia.verificarMarcaBorrando(marca);
  } catch (error) {
    verificada = { ok: false, motivo: "marca_no_verificada" };
  }
  if (!verificada || verificada.ok !== true) {
    return rechazoSesion(verificada?.motivo || "marca_no_verificada");
  }
  const dedicada = abrirSesionDedicada();
  if (dedicada.disponible !== true || dedicada.conexionDedicada !== true || dedicada.sinVencimiento !== true) {
    return rechazoSesion(dedicada.motivo || "sesion_dedicada_no_disponible");
  }
  if (!sesion || sesion.conexionDedicada !== true || sesion.sinVencimiento !== true) {
    return rechazoSesion("proteccion_con_vencimiento");
  }
  if (typeof borrarObjeto !== "function") return rechazoSesion("borrado_no_conectado");
  let vivaAntes = false;
  try {
    vivaAntes = (await sesion.viva()) === true;
  } catch (error) {
    vivaAntes = false;
  }
  if (!vivaAntes) {
    if (typeof sesion.cerrar === "function") await sesion.cerrar();
    return rechazoSesion("conexion_perdida");
  }
  let http;
  try {
    http = await borrarObjeto();
  } catch (error) {
    marcarIncierto(clave);
    return rechazoSesion("resultado_incierto");
  }
  let vivaDespues = false;
  try {
    vivaDespues = (await sesion.viva()) === true;
  } catch (error) {
    vivaDespues = false;
  }
  if (!vivaDespues) {
    marcarIncierto(clave);
    console.error("[LIMPIEZA_MEDIA] resultado incierto: la sesion cayo durante storage", { clave });
    return rechazoSesion("resultado_incierto");
  }
  if (marcaMedia.clasificarResultadoStorage(http) !== "eliminado_confirmado") {
    marcarIncierto(clave);
    return rechazoSesion("resultado_incierto");
  }
  if (typeof sesion.cerrar === "function") await sesion.cerrar();
  return {
    eliminado: true,
    incierto: false,
    reintentar: false,
    motivo: "eliminado",
    storage: true,
    abortar: false,
  };
}

async function entrarConversacion({ registro, hilo, owner, esperarMs = 0, persistir }) {
  const limite = Date.now() + Math.max(0, esperarMs);
  let toma = await registro.adquirir({ hilo, owner });
  while (!toma.ok && Date.now() < limite) {
    await new Promise((resolver) => setTimeout(resolver, 5));
    toma = await registro.adquirir({ hilo, owner });
  }
  if (!toma.ok) {
    return { status: 503, guardado: false, confirmado: false, reintentar: true, motivo: toma.motivo || "valla_ocupada" };
  }
  try {
    const resultado = await persistir();
    if (resultado?.duplicate) {
      return { status: 200, guardado: false, confirmado: true, duplicado: true, reintentar: false };
    }
    if (!resultado?.claimed) {
      return { status: 503, guardado: false, confirmado: false, reintentar: true, motivo: "claim_fallido" };
    }
    return { status: 200, guardado: true, confirmado: true, reintentar: false };
  } catch (error) {
    return { status: 503, guardado: false, confirmado: false, reintentar: true, motivo: "persistencia_fallida" };
  } finally {
    await registro.liberar({ hilo, owner, conexionId: toma.conexionId });
  }
}

module.exports = {
  abrirSesionDePrueba,
  abrirSesionDedicada,
  crearRegistroDePrueba,
  entrarConversacion,
  esIncierto,
  ejecutarBajoSesion,
  marcarIncierto,
};
