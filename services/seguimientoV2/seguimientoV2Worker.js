const {
  obtenerPendientesVencidos,
  obtenerPorId,
  reservarParaEnvio,
  actualizarEstadoSiEn,
  insertarLog,
} = require("./seguimientoV2Repository");
const { ESTADOS_SEGUIMIENTO_V2, ESTADOS_ACTIVOS_V2 } = require("./constants");
const { enviarSeguimientoV2 } = require("./seguimientoV2Sender");
const { obtenerConexionItem } = require("./seguimientoV2Guards");
const {
  adquirirLockWorkerSeguimientoV2,
  liberarLockWorkerSeguimientoV2,
} = require("./seguimientoV2WorkerLock");
const { logSegV2Test, logSegV2Step, logSegV2PendingCount } = require("./seguimientoV2TestLog");
const { estaBotPausado } = require("../conversaciones/botPauseService");
const {
  MOTIVO_BOT_PAUSADO_MANUAL,
} = require("../conversaciones/cancelarSeguimientosPorBotPause");

const ESTADOS_TERMINALES_V2 = [
  ESTADOS_SEGUIMIENTO_V2.RESPONDIDO,
  ESTADOS_SEGUIMIENTO_V2.CANCELADO,
  ESTADOS_SEGUIMIENTO_V2.ENVIADO,
  ESTADOS_SEGUIMIENTO_V2.OMITIDO_DUPLICADO,
  ESTADOS_SEGUIMIENTO_V2.FALLIDO,
];

async function marcarFallido(item, motivo, evento, deps = {}) {
  const actualizarSiEn = deps.actualizarEstadoSiEn || actualizarEstadoSiEn;
  const actualizado = await actualizarSiEn(
    item.id,
    ESTADOS_SEGUIMIENTO_V2.FALLIDO,
    ESTADOS_ACTIVOS_V2,
    { error_detalle: motivo }
  );
  if (!actualizado) return;

  const conexionId = obtenerConexionItem(item);
  if (conexionId && item.usuario_id && item.cliente_numero) {
    await (deps.insertarLog || insertarLog)({
      seguimientoId: item.id,
      usuarioId: item.usuario_id,
      conexionWhatsappId: conexionId,
      numero: item.cliente_numero,
      evento,
      detalle: { motivo, error_detalle: motivo },
    });
  }
}

async function marcarOmitidoDuplicado(item, deps = {}) {
  const actualizarSiEn = deps.actualizarEstadoSiEn || actualizarEstadoSiEn;
  const actualizado = await actualizarSiEn(
    item.id,
    ESTADOS_SEGUIMIENTO_V2.OMITIDO_DUPLICADO,
    [ESTADOS_SEGUIMIENTO_V2.PROCESANDO],
    { error_detalle: "Idempotente: mensaje ya en bandeja" }
  );
  if (!actualizado) return;

  const conexionId = obtenerConexionItem(item);
  if (conexionId && item.usuario_id && item.cliente_numero) {
    await (deps.insertarLog || insertarLog)({
      seguimientoId: item.id,
      usuarioId: item.usuario_id,
      conexionWhatsappId: conexionId,
      numero: item.cliente_numero,
      evento: "duplicado_detectado",
      detalle: { seguimiento_v2_id: item.id },
    });
  }
}

async function cancelarPorBotPausado(item, fase, deps) {
  const actualizarSiEn = deps.actualizarEstadoSiEn || actualizarEstadoSiEn;

  const actualizado = await actualizarSiEn(
    item.id,
    ESTADOS_SEGUIMIENTO_V2.CANCELADO,
    ESTADOS_ACTIVOS_V2,
    { error_detalle: MOTIVO_BOT_PAUSADO_MANUAL }
  );

  if (!actualizado) {
    console.log("[BOT_PAUSE] automatizacion V2 omitida — ya finalizada o no activa", {
      origen: "seguimiento_v2_worker",
      fase,
      seguimiento_v2_id: item.id,
    });
    return { ok: false, motivo: "bot_pausado" };
  }

  console.log("[BOT_PAUSE] automatizacion V2 cancelada por pausa", {
    origen: "seguimiento_v2_worker",
    fase,
    seguimiento_v2_id: actualizado.id,
    usuario_id: actualizado.usuario_id,
    cliente_numero: actualizado.cliente_numero,
    conexion_whatsapp_id: actualizado.conexion_whatsapp_id,
  });

  return { ok: false, motivo: "bot_pausado" };
}

async function procesarSeguimientoV2Item(item, opts = {}) {
  const deps = opts.deps || {};
  const checkPausa = deps.estaBotPausado || estaBotPausado;
  const reservar = deps.reservarParaEnvio || reservarParaEnvio;
  const obtener = deps.obtenerPorId || obtenerPorId;
  const enviar = deps.enviarSeguimientoV2 || enviarSeguimientoV2;
  const actualizarSiEn = deps.actualizarEstadoSiEn || actualizarEstadoSiEn;

  const conexionId = obtenerConexionItem(item);

  if (!conexionId) {
    console.log("[SEG_V2_FAIL]", {
      seguimiento_v2_id: item.id,
      motivo: "conexion_obligatoria",
    });
    await actualizarSiEn(
      item.id,
      ESTADOS_SEGUIMIENTO_V2.FALLIDO,
      [ESTADOS_SEGUIMIENTO_V2.PENDIENTE, ESTADOS_SEGUIMIENTO_V2.PROCESANDO],
      { error_detalle: "conexion_obligatoria" }
    );
    return { ok: false, motivo: "conexion_obligatoria" };
  }

  if (
    item.usuario_id &&
    item.cliente_numero &&
    (await checkPausa({
      usuarioId: item.usuario_id,
      clienteNumero: item.cliente_numero,
      conexionWhatsappId: conexionId,
    }))
  ) {
    return cancelarPorBotPausado(item, "pre_reserva", deps);
  }

  const reservado = await reservar(item.id);
  if (!reservado) {
    return { ok: false, motivo: "no_reservado" };
  }

  const fresca = await obtener(reservado.id);
  if (!fresca || ESTADOS_TERMINALES_V2.includes(fresca.estado)) {
    console.log("[SEG_V2_WORKER] omitido — ya cancelado o respondido", {
      seguimiento_v2_id: reservado.id,
      estado: fresca?.estado ?? null,
    });
    return { ok: false, motivo: "ya_cancelado_o_respondido" };
  }

  if (
    fresca.usuario_id &&
    fresca.cliente_numero &&
    (await checkPausa({
      usuarioId: fresca.usuario_id,
      clienteNumero: fresca.cliente_numero,
      conexionWhatsappId: conexionId,
    }))
  ) {
    return cancelarPorBotPausado(fresca, "post_reserva", deps);
  }

  // Última puerta antes del envío real a WhatsApp.
  const preEnvio = await obtener(reservado.id);
  if (!preEnvio || ESTADOS_TERMINALES_V2.includes(preEnvio.estado)) {
    console.log("[SEG_V2_WORKER] omitido — terminal justo antes de enviar", {
      seguimiento_v2_id: reservado.id,
      estado: preEnvio?.estado ?? null,
    });
    return { ok: false, motivo: "ya_cancelado_o_respondido" };
  }
  if (preEnvio.estado !== ESTADOS_SEGUIMIENTO_V2.PROCESANDO) {
    return { ok: false, motivo: "estado_no_procesando" };
  }

  if (
    preEnvio.usuario_id &&
    preEnvio.cliente_numero &&
    (await checkPausa({
      usuarioId: preEnvio.usuario_id,
      clienteNumero: preEnvio.cliente_numero,
      conexionWhatsappId: conexionId,
    }))
  ) {
    return cancelarPorBotPausado(preEnvio, "pre_envio", deps);
  }

  // Punto exacto de envío. Tras aceptación de Meta no hay cancelación absoluta.
  const resultado = await enviar(preEnvio);

  if (resultado.omitido) {
    await marcarOmitidoDuplicado(reservado, deps);
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
    await marcarFallido(reservado, motivo, motivo, deps);
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

  const marcado = await actualizarSiEn(
    reservado.id,
    ESTADOS_SEGUIMIENTO_V2.ENVIADO,
    [ESTADOS_SEGUIMIENTO_V2.PROCESANDO],
    { meta_message_id: resultado.metaMessageId || null }
  );

  if (!marcado) {
    console.log("[SEG_V2_WORKER] envio Meta posible pero estado ya no procesando", {
      seguimiento_v2_id: reservado.id,
      nota: "no se sobrescribe cancelado/enviado/respondido",
    });
    return { ok: false, motivo: "estado_cambiado_tras_envio" };
  }

  logSegV2Test({
    campana_id: marcado.campana_id,
    seguimiento_v2_id: marcado.id,
    conexion_whatsapp_id: conexionId,
    phone_id: resultado.phoneId || null,
    estado: ESTADOS_SEGUIMIENTO_V2.ENVIADO,
    paso_index: marcado.paso_index,
    cliente_numero: marcado.cliente_numero,
    prueba: "worker",
  });

  await (deps.insertarLog || insertarLog)({
    seguimientoId: marcado.id,
    usuarioId: marcado.usuario_id,
    conexionWhatsappId: conexionId,
    numero: marcado.cliente_numero,
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

    const porPasoIndex = {};
    for (const item of pendientes) {
      const idx = item.paso_index ?? "?";
      porPasoIndex[idx] = (porPasoIndex[idx] || 0) + 1;
    }

    logSegV2PendingCount(pendientes.length, {
      por_paso_index: porPasoIndex,
      ahora: new Date().toISOString(),
    });

    if (!pendientes.length) {
      return { procesados: 0, enviados: 0, lock: "acquired" };
    }

    console.log("[SEG_V2_WORKER] pendientes:", pendientes.length);

    let procesados = 0;
    let enviados = 0;

    for (const item of pendientes) {
      logSegV2Step({
        campana_id: item.campana_id,
        seguimiento_v2_id: item.id,
        paso_index: item.paso_index,
        estado: item.estado,
        run_at: item.run_at,
        conexion_whatsapp_id: item.conexion_whatsapp_id,
        contenido: item.contenido,
      });
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
