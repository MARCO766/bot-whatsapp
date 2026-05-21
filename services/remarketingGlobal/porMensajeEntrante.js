const crypto = require("crypto");
const {
  buscarNodoRemarketingEnFlujo,
  obtenerPrimerPasoParaProgramar,
  parseRemarketingFromNodo,
} = require("./parseRemarketingGlobalNode");
const { normalizarUnidad } = require("./unidades");
const {
  insertarProgramados,
  cancelarPendientesCliente,
  obtenerFlujoIdRemarketingPendiente,
} = require("./remarketingRepository");
const { ESTADOS_REMARKETING } = require("./constants");
const { nowUtc, toTimestamptzUtc } = require("./timestamps");

function delayLabel(paso) {
  const v = paso.delay?.valor ?? paso.delay;
  const rawUnidad = paso.delay?.unidad || paso.unidad || "minutos";
  const u = normalizarUnidad(rawUnidad);
  return (
    v +
    " unidad=" +
    rawUnidad +
    " normalizada=" +
    u
  );
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

function resolverNodoRemarketing(flujo_datos, nodoRemarketing) {
  if (nodoRemarketing) {
    const config =
      nodoRemarketing.config ||
      parseRemarketingFromNodo(nodoRemarketing);
    return {
      ...nodoRemarketing,
      id: nodoRemarketing.id || "remarketing_global_fixed",
      config,
    };
  }
  return buscarNodoRemarketingEnFlujo(flujo_datos);
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
  nodoRemarketing,
}) {
  console.log("[RM DEBUG] ENTRÓ A manejarRemarketingGlobalPorMensajeEntrante");

  if (!cliente_numero || !usuario_id || !flujo_id) {
    console.log("[RM DEBUG] omitido: falta cliente, usuario o flujo_id");
    return null;
  }

  if (!flujo_datos?.nodos?.length && !nodoRemarketing) {
    console.log("[RM DEBUG] omitido: flujo sin nodos | flujo_id=" + flujo_id);
    return null;
  }

  const nodo = resolverNodoRemarketing(flujo_datos, nodoRemarketing);
  if (!nodo) {
    console.log("[RM DEBUG] remarketing encontrado en flujo actual=NO");
    return null;
  }

  const config = nodo.config;
  const activo = config?.activo !== false;

  console.log(
    "[RM DEBUG] remarketing encontrado en flujo actual=" + (activo ? "SI" : "NO")
  );

  if (!activo) {
    console.log("[RM DEBUG] remarketing en flujo pero activo=false");
    return null;
  }

  const { puedeProgramarRemarketing } = require("./embudoMode");
  const puede = await puedeProgramarRemarketing({
    usuario_id,
    cliente_numero,
    flujo_id,
    config,
  });
  if (!puede.ok) {
    return null;
  }

  const r1 = obtenerPrimerPasoParaProgramar(config.steps);
  if (!r1) {
    console.log(
      "[RM DEBUG] sin pasos validos para R1 | steps en config:",
      (config.steps || []).length
    );
    return null;
  }

  console.log("[REMARKETING] programando R1");
  console.log("[RM DEBUG] R1 encontrado delay=" + delayLabel(r1));
  console.log("[RM DEBUG] R1 programado para " + cliente_numero);

  let flujoAnterior = flujo_id_anterior;
  if (!flujoAnterior) {
    try {
      const pendiente = await obtenerFlujoIdRemarketingPendiente(
        cliente_numero,
        usuario_id
      );
      if (pendiente && pendiente !== flujo_id) {
        flujoAnterior = pendiente;
      }
    } catch (_) {
      /* ignore */
    }
  }

  if (flujoAnterior && flujoAnterior !== flujo_id) {
    try {
      await cancelarPendientesCliente(
        cliente_numero,
        usuario_id,
        ESTADOS_REMARKETING.CANCELADO_POR_RESPUESTA,
        "Lead cambió de flujo",
        flujoAnterior
      );
      console.log(
        "[RM DEBUG] cancelados pendientes flujo anterior=" + flujoAnterior
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
    console.log("[RM DEBUG] R1 programado");
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

/**
 * Llamar justo al detectar nodo remarketing_global activo en el flujo en ejecución.
 */
async function programarRemarketingAlDetectarNodo({
  usuario_id,
  cliente_numero,
  flujo_id,
  flujo_datos,
  nodoRemarketing,
  flujo_id_anterior,
}) {
  const nodo = nodoRemarketing || buscarNodoRemarketingEnFlujo(flujo_datos);
  if (!nodo || nodo.config?.activo === false) {
    return null;
  }

  console.log(
    "[RM DEBUG] nodo remarketing_global detectado en flujo, programando R1"
  );

  return manejarRemarketingGlobalPorMensajeEntrante({
    usuario_id,
    cliente_numero,
    flujo_id,
    flujo_datos,
    nodoRemarketing: nodo,
    flujo_id_anterior,
  });
}

async function programarSiguientePasoTrasEnvio(item) {
  if (!item?.flujo_id || !item?.usuario_id || !item?.cliente_numero) {
    console.log("[RM DEBUG] omitido siguiente paso: sin flujo_id en item");
    return null;
  }

  const config = item.config_snapshot || {};
  const { obtenerPasosActivosValidos } = require("./parseRemarketingGlobalNode");
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
  programarRemarketingAlDetectarNodo,
  programarSiguientePasoTrasEnvio,
};
