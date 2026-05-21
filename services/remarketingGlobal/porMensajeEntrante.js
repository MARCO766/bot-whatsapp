const crypto = require("crypto");
const {
  buscarNodoRemarketingEnFlujo,
  obtenerPasosActivosValidos,
  normalizarUnidad,
} = require("./parseRemarketingGlobalNode");
const {
  insertarProgramados,
  cancelarPendientesCliente,
} = require("./remarketingRepository");
const { ESTADOS_REMARKETING } = require("./constants");
const { nowUtc, toTimestamptzUtc } = require("./timestamps");

function delayLabel(paso) {
  const v = paso.delay?.valor ?? paso.delay;
  const u = normalizarUnidad(paso.delay?.unidad || paso.unidad);
  return v + " " + u;
}

function buildRow({
  campanaId,
  usuarioId,
  numero,
  flujoId,
  nodoId,
  paso,
  pasoIndex,
  config,
  checkpointAt,
  runAt,
}) {
  return {
    campana_id: campanaId,
    usuario_id: usuarioId || null,
    cliente_numero: numero,
    flujo_id: flujoId || null,
    nodo_id: nodoId,
    paso_index: pasoIndex,
    paso_id: paso.id,
    paso_nombre: paso.nombre,
    run_at: runAt,
    mensaje_tipo: paso.mensaje.tipo,
    mensaje_payload: {
      tipo: paso.mensaje.tipo,
      texto: paso.mensaje.texto,
      url: paso.mensaje.url,
      caption: paso.mensaje.caption,
    },
    config_snapshot: config,
    checkpoint_at: checkpointAt,
    estado: ESTADOS_REMARKETING.PENDIENTE,
  };
}

/**
 * Lead escribió → cancelar pendientes → programar R1 desde ahora.
 * No depende de ejecutarFlujo ni IA en espera.
 */
async function manejarRemarketingGlobalPorMensajeEntrante({
  usuario_id,
  cliente_numero,
  flujoActivo,
}) {
  console.log(
    "[RM DEBUG] mensaje entrante => reiniciando remarketing | cliente:",
    cliente_numero
  );

  if (!cliente_numero || !usuario_id) {
    console.log("[RM DEBUG] omitido: sin numero o usuario_id");
    return null;
  }

  if (!flujoActivo?.data?.nodos?.length && !flujoActivo?.nodos?.length) {
    console.log("[RM DEBUG] omitido: flujoActivo sin nodos");
    return null;
  }

  const flujoData = flujoActivo.data || flujoActivo;
  const flujoId = flujoActivo.id || flujoActivo.flujo_id || null;

  const nodo = buscarNodoRemarketingEnFlujo(flujoData);
  if (!nodo) {
    console.log("[RM DEBUG] no hay remarketing_global activo en flujo", flujoId);
    return null;
  }

  const config = nodo.config;
  if (!config?.activo) {
    console.log("[RM DEBUG] remarketing_global encontrado pero activo=false");
    return null;
  }

  const pasos = obtenerPasosActivosValidos(config.steps);
  if (!pasos.length) {
    console.log("[RM DEBUG] sin pasos validos (R1 necesita mensaje configurado)");
    return null;
  }

  const r1 = pasos[0];
  console.log("[RM DEBUG] R1 encontrado delay=" + delayLabel(r1));

  try {
    await cancelarPendientesCliente(
      cliente_numero,
      usuario_id,
      ESTADOS_REMARKETING.CANCELADO_POR_RESPUESTA,
      "Lead envió mensaje — reinicio remarketing",
      null
    );
    console.log("[RM DEBUG] pendientes cancelados");
  } catch (err) {
    console.log(
      "[RM DEBUG] error cancelando pendientes:",
      err.response?.data || err.message
    );
  }

  const campanaId = crypto.randomUUID();
  const checkpointAt = nowUtc();
  const runAt = toTimestamptzUtc(Date.now() + r1.segundos * 1000);
  const nodoId = nodo.id || "remarketing_global_fixed";

  const row = buildRow({
    campanaId,
    usuarioId: usuario_id,
    numero: cliente_numero,
    flujoId,
    nodoId,
    paso: r1,
    pasoIndex: 0,
    config,
    checkpointAt,
    runAt,
  });

  try {
    const insertados = await insertarProgramados([row]);
    const mins = Math.round(r1.segundos / 60);
    console.log(
      "[RM DEBUG] R1 programado para " +
        cliente_numero +
        " en " +
        (mins < 1 ? r1.segundos + " segundos" : mins + " minuto(s)") +
        " | run_at:",
      runAt
    );
    console.log("[RM DEBUG] insert OK | filas:", insertados.length);
    return { campanaId, programados: insertados.length, runAt };
  } catch (err) {
    console.error(
      "[RM DEBUG] ERROR insertando programación:",
      err.response?.data || err.message
    );
    return null;
  }
}

/**
 * Tras enviar paso N, programa paso N+1 si el lead no escribió de nuevo.
 */
async function programarSiguientePasoTrasEnvio(item) {
  const config = item.config_snapshot || {};
  const pasos = obtenerPasosActivosValidos(config.steps);
  const nextIndex = (item.paso_index || 0) + 1;

  if (nextIndex >= pasos.length) return null;

  const siguiente = pasos[nextIndex];
  const runAt = toTimestamptzUtc(Date.now() + siguiente.segundos * 1000);

  const row = buildRow({
    campanaId: item.campana_id,
    usuarioId: item.usuario_id,
    numero: item.cliente_numero,
    flujoId: item.flujo_id,
    nodoId: item.nodo_id,
    paso: siguiente,
    pasoIndex: nextIndex,
    config,
    checkpointAt: item.checkpoint_at,
    runAt,
  });

  const insertados = await insertarProgramados([row]);
  console.log(
    "[RM DEBUG] programado " +
      (siguiente.nombre || siguiente.id) +
      " para " +
      item.cliente_numero +
      " | delay " +
      delayLabel(siguiente)
  );
  return insertados[0];
}

module.exports = {
  manejarRemarketingGlobalPorMensajeEntrante,
  programarSiguientePasoTrasEnvio,
};
