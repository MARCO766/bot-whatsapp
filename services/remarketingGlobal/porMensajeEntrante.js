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
    flujo_id: flujoId,
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
 * Remarketing scoped por flujo_id del lead (nunca global por solo número).
 */
async function manejarRemarketingGlobalPorMensajeEntrante({
  usuario_id,
  cliente_numero,
  flujo_id,
  flujo_datos,
  flujo_id_anterior,
}) {
  console.log("[RM DEBUG] mensaje entrante => reiniciando remarketing");

  if (!cliente_numero || !usuario_id || !flujo_id) {
    console.log("[RM DEBUG] omitido: falta cliente, usuario o flujo_id");
    return null;
  }

  if (!flujo_datos?.nodos?.length) {
    console.log("[RM DEBUG] omitido: flujo sin nodos | flujo_id=" + flujo_id);
    return null;
  }

  console.log("[RM DEBUG] buscando remarketing SOLO en flujo actual");

  const nodo = buscarNodoRemarketingEnFlujo(flujo_datos);
  const encontrado = !!(nodo && nodo.config?.activo !== false);

  console.log(
    "[RM DEBUG] remarketing encontrado en flujo actual=" + (encontrado ? "SI" : "NO")
  );

  if (!nodo) {
    return null;
  }

  const config = nodo.config;
  if (!config?.activo) {
    console.log("[RM DEBUG] remarketing en flujo pero activo=false");
    return null;
  }

  const pasos = obtenerPasosActivosValidos(config.steps);
  if (!pasos.length) {
    console.log("[RM DEBUG] sin pasos validos en este flujo");
    return null;
  }

  const r1 = pasos[0];
  console.log("[RM DEBUG] R1 encontrado delay=" + delayLabel(r1));

  if (flujo_id_anterior && flujo_id_anterior !== flujo_id) {
    try {
      await cancelarPendientesCliente(
        cliente_numero,
        usuario_id,
        ESTADOS_REMARKETING.CANCELADO_POR_RESPUESTA,
        "Lead cambió de flujo",
        flujo_id_anterior
      );
      console.log(
        "[RM DEBUG] cancelados pendientes flujo anterior=" + flujo_id_anterior
      );
    } catch (err) {
      console.log(
        "[RM DEBUG] error cancelando flujo anterior:",
        err.response?.data || err.message
      );
    }
  }

  try {
    console.log(
      "[RM DEBUG] cancelando pendientes solo flujo_id actual=" + flujo_id
    );
    await cancelarPendientesCliente(
      cliente_numero,
      usuario_id,
      ESTADOS_REMARKETING.CANCELADO_POR_RESPUESTA,
      "Lead envió mensaje — reinicio remarketing en flujo",
      flujo_id
    );
    console.log("[RM DEBUG] pendientes cancelados (flujo actual)");
  } catch (err) {
    console.log(
      "[RM DEBUG] error cancelando pendientes flujo actual:",
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
    flujoId: flujo_id,
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
      "[RM DEBUG] R1 programado flujo_id=" +
        flujo_id +
        " | cliente=" +
        cliente_numero +
        " en " +
        (mins < 1 ? r1.segundos + "s" : mins + " min") +
        " | run_at=" +
        runAt
    );
    console.log("[RM DEBUG] insert OK | filas=" + insertados.length);
    return { campanaId, programados: insertados.length, runAt, flujo_id };
  } catch (err) {
    console.error(
      "[RM DEBUG] ERROR insertando programación:",
      err.response?.data || err.message
    );
    return null;
  }
}

async function programarSiguientePasoTrasEnvio(item) {
  if (!item?.flujo_id || !item?.usuario_id || !item?.cliente_numero) {
    console.log("[RM DEBUG] omitido siguiente paso: sin flujo_id en item");
    return null;
  }

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
      " flujo_id=" +
      item.flujo_id +
      " | " +
      item.cliente_numero
  );
  return insertados[0];
}

module.exports = {
  manejarRemarketingGlobalPorMensajeEntrante,
  programarSiguientePasoTrasEnvio,
};
