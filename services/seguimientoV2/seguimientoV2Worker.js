const {
  obtenerPendientesVencidos,
  reservarParaEnvio,
  actualizarEstado,
  insertarLog,
} = require("./seguimientoV2Repository");
const { ESTADOS_SEGUIMIENTO_V2 } = require("./constants");
const { enviarSeguimientoV2 } = require("./seguimientoV2Sender");
const { obtenerConexionItem } = require("./seguimientoV2Guards");
const {
  adquirirLockWorkerSeguimientoV2,
  liberarLockWorkerSeguimientoV2,
} = require("./seguimientoV2WorkerLock");
const { logSegV2Test } = require("./seguimientoV2TestLog");

async function marcarFallido(item, motivo, evento) {
  await actualizarEstado(item.id, ESTADOS_SEGUIMIENTO_V2.FALLIDO, {
    error_detalle: motivo,
  });

  const conexionId = obtenerConexionItem(item);
  if (conexionId && item.usuario_id && item.cliente_numero) {
    await insertarLog({
      seguimientoId: item.id,
      usuarioId: item.usuario_id,
      conexionWhatsappId: conexionId,
      numero: item.cliente_numero,
      evento,
      detalle: { motivo, error_detalle: motivo },
    });
  }
}

async function marcarOmitidoDuplicado(item) {
  await actualizarEstado(item.id, ESTADOS_SEGUIMIENTO_V2.OMITIDO_DUPLICADO, {
    error_detalle: "Idempotente: mensaje ya en bandeja",
  });

  const conexionId = obtenerConexionItem(item);
  if (conexionId && item.usuario_id && item.cliente_numero) {
    await insertarLog({
      seguimientoId: item.id,
      usuarioId: item.usuario_id,
      conexionWhatsappId: conexionId,
      numero: item.cliente_numero,
      evento: "duplicado_detectado",
      detalle: { seguimiento_v2_id: item.id },
    });
  }
}

async function procesarSeguimientoV2Item(item) {
  const conexionId = obtenerConexionItem(item);

  if (!conexionId) {
    console.log("[SEG_V2_FAIL]", {
      seguimiento_v2_id: item.id,
      motivo: "conexion_obligatoria",
    });
    await actualizarEstado(item.id, ESTADOS_SEGUIMIENTO_V2.FALLIDO, {
      error_detalle: "conexion_obligatoria",
    });
    return { ok: false, motivo: "conexion_obligatoria" };
  }

  const reservado = await reservarParaEnvio(item.id);
  if (!reservado) {
    return { ok: false, motivo: "no_reservado" };
  }

  const resultado = await enviarSeguimientoV2(reservado);

  if (resultado.omitido) {
    await marcarOmitidoDuplicado(reservado);
    logSegV2Test({
      campana_id: reservado.campana_id,
      seguimiento_v2_id: reservado.id,
      conexion_whatsapp_id: conexionId,
      estado: ESTADOS_SEGUIMIENTO_V2.OMITIDO_DUPLICADO,
      paso_index: reservado.paso_index,
      cliente_numero: reservado.cliente_numero,
      prueba: "worker",
      motivo: "omitido_duplicado",
    });
    return { ok: true, motivo: "omitido_duplicado" };
  }

  if (!resultado.ok) {
    const motivo = resultado.motivo || "error_envio";
    await marcarFallido(reservado, motivo, motivo);
    logSegV2Test({
      campana_id: reservado.campana_id,
      seguimiento_v2_id: reservado.id,
      conexion_whatsapp_id: conexionId,
      estado: ESTADOS_SEGUIMIENTO_V2.FALLIDO,
      paso_index: reservado.paso_index,
      cliente_numero: reservado.cliente_numero,
      prueba: "worker",
      motivo,
    });
    return { ok: false, motivo };
  }

  await actualizarEstado(reservado.id, ESTADOS_SEGUIMIENTO_V2.ENVIADO, {
    meta_message_id: resultado.metaMessageId || null,
  });

  logSegV2Test({
    campana_id: reservado.campana_id,
    seguimiento_v2_id: reservado.id,
    conexion_whatsapp_id: conexionId,
    phone_id: resultado.phoneId || null,
    estado: ESTADOS_SEGUIMIENTO_V2.ENVIADO,
    paso_index: reservado.paso_index,
    cliente_numero: reservado.cliente_numero,
    prueba: "worker",
  });

  await insertarLog({
    seguimientoId: reservado.id,
    usuarioId: reservado.usuario_id,
    conexionWhatsappId: conexionId,
    numero: reservado.cliente_numero,
    evento: "enviado",
    detalle: {
      meta_message_id: resultado.metaMessageId || null,
      phone_id: resultado.phoneId || null,
      conexion_whatsapp_id: conexionId,
    },
  });

  return { ok: true, motivo: "enviado" };
}

async function procesarSeguimientosV2Vencidos(opts = {}) {
  if (!opts.fromWorker) {
    return { procesados: 0, enviados: 0, lock: "blocked_manual" };
  }

  const lock = await adquirirLockWorkerSeguimientoV2();
  if (!lock.acquired) {
    const sinLockDb = ["sin_supabase", "lock_tabla_ausente", "lock_verificacion_fallida"].includes(
      lock.motivo
    );
    if (sinLockDb) {
      return { procesados: 0, enviados: 0, lock: "no_lock_db", motivo: lock.motivo };
    }
    return { procesados: 0, enviados: 0, lock: "skipped" };
  }

  try {
    const pendientes = await obtenerPendientesVencidos({ limite: 40 });
    if (!pendientes.length) {
      return { procesados: 0, enviados: 0, lock: "acquired" };
    }

    console.log("[SEG_V2_WORKER] pendientes:", pendientes.length);

    let procesados = 0;
    let enviados = 0;

    for (const item of pendientes) {
      const res = await procesarSeguimientoV2Item(item);
      procesados++;
      if (res?.ok && res.motivo === "enviado") {
        enviados++;
      }
    }

    return { procesados, enviados, lock: "acquired" };
  } finally {
    await liberarLockWorkerSeguimientoV2(lock.workerId);
  }
}

module.exports = {
  procesarSeguimientosV2Vencidos,
  procesarSeguimientoV2Item,
};
