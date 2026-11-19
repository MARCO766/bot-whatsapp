/**
 * Inspección y resolución manual de marcas que quedaron en "borrando".
 * No llama a Storage, no repite un DELETE y no toca mensajes ni conversaciones.
 * Liberar exige una verificación previa. Cada paso queda en la auditoría del registro.
 *
 * Una marca incierto no se reintenta. En la base, el desbloqueo de mensajes
 * es manual: leer el objeto, verificar como no_eliminado_confirmado si sigue
 * en el bucket o eliminado_confirmado si ya no está, y solo entonces liberar.
 * Liberar pone estado y owner en null y conserva resultado = incierto, así
 * que el Cron no vuelve a promover esa fila a borrando.
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
