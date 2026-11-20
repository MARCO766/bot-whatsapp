/**
 * Inspección y resolución manual de marcas que quedaron en "borrando".
 * No llama a Storage, no repite un DELETE y no toca mensajes ni conversaciones.
 * Liberar exige una verificación previa. Cada paso queda en la auditoría del registro.
 *
 * Una marca incierto no se reintenta ni vuelve a reservarse, aunque se libere.
 * recuperarMarcaDurable lee el objeto y deja resultado incierto. No libera
 * la fila y no llama a Storage DELETE. Liberar sigue siendo un paso aparte:
 * pone estado y owner en null y conserva resultado = incierto.
 *
 * listarMarcasReales() no abre red. listarMarcasDurables() llama a PostgREST
 * solo si el llamador pasa permitirRed o un cliente de prueba.
 */
const marcaStore = require("./limpiezaMediaMarcaStore");
const RESULTADOS = ["eliminado_confirmado", "no_eliminado_confirmado", "incierto"];

function listarMarcasReales() {
  return { disponible: false, motivo: "marca_no_disponible", marcas: [] };
}

function listarMarcasDurables(opciones = {}) {
  if (opciones.permitirRed !== true && !opciones.cliente) return listarMarcasReales();
  return marcaStore.listar({ ...opciones, estado: opciones.estado || "borrando" });
}

function consultarMarcaDurable(opciones = {}) {
  if (opciones.permitirRed !== true && !opciones.cliente) {
    return { ok: false, motivo: "marca_no_disponible", marca: null };
  }
  return marcaStore.consultar(opciones);
}

function verificarMarcaDurable(opciones = {}) {
  if (opciones.permitirRed !== true && !opciones.cliente) return resolverMarcaReal();
  return marcaStore.verificar(opciones);
}

function liberarMarcaDurable(opciones = {}) {
  if (opciones.permitirRed !== true && !opciones.cliente) return resolverMarcaReal();
  return marcaStore.liberar(opciones);
}

async function leerExistencia(clave, opciones) {
  if (typeof opciones.existeObjeto === "function") return opciones.existeObjeto({ clave });
  if (opciones.permitirRed !== true) return undefined;
  const servicio = require("./limpiezaMediaService");
  return servicio.comprobarExistenciaObjeto(clave);
}

async function recuperarMarcaDurable(opciones = {}) {
  if (opciones.permitirRed !== true && !opciones.cliente) return resolverMarcaReal();
  const visto = await marcaStore.consultar(opciones);
  const marca = visto?.marca;
  if (!marca || marca.estado !== "borrando") {
    return {
      ok: false,
      motivo: "marca_no_resoluble",
      storage: false,
      reintentar: false,
      liberada: false,
    };
  }
  if (marca.resultado != null && marca.resultado !== "incierto") {
    return {
      ok: false,
      motivo: "marca_no_resoluble",
      storage: false,
      reintentar: false,
      liberada: false,
    };
  }
  const clave = marca.clave_archivo || marca.claveArchivo;
  if (!clave) {
    return {
      ok: false,
      motivo: "marca_sin_clave",
      storage: false,
      reintentar: false,
      liberada: false,
    };
  }
  let existe;
  try {
    existe = await leerExistencia(clave, opciones);
  } catch (error) {
    return {
      ok: false,
      motivo: "consulta_fallida",
      storage: false,
      reintentar: false,
      liberada: false,
    };
  }
  if (existe !== true && existe !== false) {
    return {
      ok: false,
      motivo: "verificacion_requerida",
      storage: false,
      reintentar: false,
      liberada: false,
    };
  }
  const paso = await marcaStore.recuperar({
    ...opciones,
    objetoExiste: existe,
    nota: opciones.nota || (existe ? "el objeto sigue en el bucket" : "el objeto ya no está en el bucket"),
  });
  return {
    ...paso,
    ok: paso?.ok === true,
    storage: false,
    reintentar: false,
    liberada: false,
  };
}

function resolverMarcaReal() {
  return {
    ok: false,
    motivo: "marca_no_disponible",
    storage: false,
    reintentar: false,
    liberada: false,
  };
}

function clasificarResultado(fila) {
  if (fila?.resultado === "eliminado_confirmado" || fila?.resultado === "no_eliminado_confirmado") {
    return fila.resultado;
  }
  return "incierto";
}

function ficha(hilo, fila) {
  return {
    hilo,
    usuarioId: fila.usuarioId || null,
    conexionId: fila.conexionId || null,
    clienteNumero: fila.clienteNumero || null,
    iniciadaEn: fila.iniciadaEn || null,
    claveArchivo: fila.claveArchivo || null,
    resultadoConocido: clasificarResultado(fila),
    estado: fila.estado,
    verificada: Boolean(fila.verificacion),
  };
}

function listarPendientes(registro) {
  if (!registro?.porHilo) return { disponible: false, motivo: "marca_no_disponible", marcas: [] };
  const marcas = [];
  for (const [hilo, fila] of registro.porHilo) {
    if (fila?.estado === "borrando") marcas.push(ficha(hilo, fila));
  }
  return { disponible: true, marcas };
}

function anotar(registro, entrada) {
  if (!Array.isArray(registro.auditoria)) registro.auditoria = [];
  registro.auditoria.push({ ...entrada, en: new Date().toISOString() });
}

function verificarMarca({ registro, hilo, resultadoVerificado, actor, nota }) {
  const fila = registro?.porHilo?.get(hilo);
  if (!fila || fila.estado !== "borrando") return { ok: false, motivo: "marca_ausente", storage: false };
  if (!RESULTADOS.includes(resultadoVerificado)) {
    return { ok: false, motivo: "verificacion_invalida", storage: false };
  }
  if (!actor) return { ok: false, motivo: "actor_requerido", storage: false };
  fila.verificacion = {
    resultadoVerificado,
    resultadoConocido: clasificarResultado(fila),
    actor,
    nota: nota || null,
  };
  anotar(registro, {
    accion: "verificar",
    hilo,
    usuarioId: fila.usuarioId,
    conexionId: fila.conexionId,
    clienteNumero: fila.clienteNumero,
    claveArchivo: fila.claveArchivo,
    resultadoConocido: fila.verificacion.resultadoConocido,
    resultadoVerificado,
    actor,
    nota: nota || null,
    storage: false,
    reintentar: false,
  });
  return { ok: true, liberada: false, storage: false, reintentar: false, ficha: ficha(hilo, fila) };
}

async function liberarMarca({ registro, hilo, actor }) {
  const fila = registro?.porHilo?.get(hilo);
  if (!fila || fila.estado !== "borrando") return { ok: false, motivo: "marca_ausente", storage: false, liberada: false };
  if (!fila.verificacion || !RESULTADOS.includes(fila.verificacion.resultadoVerificado)) {
    return { ok: false, motivo: "verificacion_requerida", storage: false, liberada: false, reintentar: false };
  }
  if (!actor) return { ok: false, motivo: "actor_requerido", storage: false, liberada: false };
  const suelta = await registro.soltar({ hilo, owner: fila.owner, permitirBorrando: true });
  if (!suelta?.ok) return { ok: false, motivo: suelta?.motivo || "liberacion_fallida", storage: false, liberada: false };
  anotar(registro, {
    accion: "liberar",
    hilo,
    usuarioId: fila.usuarioId,
    conexionId: fila.conexionId,
    clienteNumero: fila.clienteNumero,
    claveArchivo: fila.claveArchivo,
    resultadoConocido: fila.verificacion.resultadoConocido,
    resultadoVerificado: fila.verificacion.resultadoVerificado,
    actor,
    storage: false,
    reintentar: false,
  });
  return { ok: true, liberada: true, storage: false, reintentar: false };
}

async function intentarReanudarBorrado() {
  return {
    eliminado: false,
    incierto: true,
    reintentar: false,
    motivo: "resultado_incierto",
    storage: false,
  };
}

module.exports = {
  RESULTADOS,
  clasificarResultado,
  intentarReanudarBorrado,
  recuperarMarcaDurable,
  liberarMarca,
  consultarMarcaDurable,
  liberarMarcaDurable,
  listarMarcasDurables,
  listarMarcasReales,
  listarPendientes,
  resolverMarcaReal,
  verificarMarca,
  verificarMarcaDurable,
};
