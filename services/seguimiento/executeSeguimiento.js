const {
  enviarTextoWhatsApp,
  enviarMediaWhatsApp,
  enviarBotonesWhatsApp,
} = require("../whatsappService");
const {
  obtenerPendientesVencidos,
  actualizarEstado,
  cancelarCampana,
  buildClaveDedupPaso,
  existePasoEnviadoOProcesando,
  esUnicoProcesandoEnClave,
  cancelarPendientesDuplicadosClave,
  reservarPasoParaEnvio,
  obtenerSeguimientoPorId,
  leadRespondioParaSeguimiento,
} = require("./seguimientoRepository");
const { ESTADOS_SEGUIMIENTO } = require("./constants");
const rt = require("../realtimeService");
const { estaBotPausado } = require("../conversaciones/botPauseService");
const {
  adquirirLockWorkerSeguimiento,
  liberarLockWorkerSeguimiento,
} = require("./seguimientoWorkerLock");
const { existeMensajePorSeguimientoId } = require("./mensajesSeguimientoIdempotencia");

function obtenerConexionSeguimiento(item) {
  if (item?.conexion_whatsapp_id == null) return null;
  const id = String(item.conexion_whatsapp_id).trim();
  return id || null;
}

function textoContenidoSeguimiento(item) {
  const payload = item?.mensaje_payload || {};
  const tipo = (item?.mensaje_tipo || payload.tipo || "texto").toLowerCase();
  if (tipo === "texto") {
    return String(payload.texto || "").trim();
  }
  return String(payload.caption || payload.url || payload.texto || "").trim();
}

function logWorkerItemFinal(item) {
  console.log("[WORKER_ITEM_FINAL]", {
    id: item?.id ?? null,
    cliente_numero: item?.cliente_numero ?? null,
    contenido: textoContenidoSeguimiento(item),
    conexion_whatsapp_id: item?.conexion_whatsapp_id ?? null,
    estado: item?.estado ?? null,
  });
}

async function cancelarSeguimientoSinConexion(item, io) {
  const detalle =
    "Seguimiento sin conexion_whatsapp_id — no se envía (multi-número)";
  console.error("[SEGUIMIENTO_MULTI] cancelado sin línea WhatsApp", {
    seguimiento_id: item.id,
    cliente_numero: item.cliente_numero,
    usuario_id: item.usuario_id || null,
  });
  await actualizarEstado(item.id, ESTADOS_SEGUIMIENTO.CANCELADO, {
    error_detalle: detalle,
  });
  emitirEstadoSeguimiento(io, item, ESTADOS_SEGUIMIENTO.CANCELADO);
  return { ok: false, motivo: "sin_conexion_whatsapp_id" };
}

function emitirEstadoSeguimiento(io, item, estado) {
  if (!item?.usuario_id) return;

  rt.seguimientoActualizado(io, item.usuario_id, {
    id: item.id,
    campana_id: item.campana_id,
    cliente_numero: item.cliente_numero,
    flujo_id: item.flujo_id,
    nodo_id: item.nodo_id,
    paso_index: item.paso_index,
    paso_id: item.paso_id,
    estado,
    run_at: item.run_at,
  });
}

function buildOpcionesEnvioSeguimiento(item) {
  const conexionId = obtenerConexionSeguimiento(item);
  if (!conexionId) {
    throw new Error(
      "Seguimiento sin conexion_whatsapp_id — no se envía (multi-número)"
    );
  }
  return {
    usuarioId: item.usuario_id,
    conexionWhatsappId: conexionId,
    strictConexionWhatsappId: true,
    origen: "seguimiento",
    seguimientoId: item.id,
  };
}

async function enviarMensajeSeguimiento(item) {
  const payload = item.mensaje_payload || {};
  const tipo = (item.mensaje_tipo || payload.tipo || "texto").toLowerCase();
  const opciones = buildOpcionesEnvioSeguimiento(item);
  const botones = Array.isArray(payload.botones) ? payload.botones : [];

  console.log("[SEGUIMIENTO_MULTI] enviando mensaje de seguimiento", {
    seguimiento_id: item.id,
    usuario_id: item.usuario_id,
    cliente_numero: item.cliente_numero,
    conexion_whatsapp_id: opciones.conexionWhatsappId,
    strictConexionWhatsappId: opciones.strictConexionWhatsappId,
    paso_index: item.paso_index,
  });

  if (tipo === "texto") {
    const texto = (payload.texto || "").trim();
    if (!texto) throw new Error("Mensaje de texto vacío");
    if (botones.length) {
      const res = await enviarBotonesWhatsApp(item.cliente_numero, texto, botones, opciones);
      if (!res) throw new Error("No se pudo enviar botones de seguimiento");
      return res;
    }
    const res = await enviarTextoWhatsApp(item.cliente_numero, texto, opciones);
    if (!res) throw new Error("No se pudo enviar texto de seguimiento");
    return res;
  }

  if (tipo === "imagen") {
    const url = (payload.url || "").trim();
    if (!url) throw new Error("URL de imagen vacía");
    const res = await enviarMediaWhatsApp(
      item.cliente_numero,
      "image",
      url,
      payload.caption || "",
      opciones
    );
    if (!res) throw new Error("No se pudo enviar imagen de seguimiento");
    return res;
  }

  if (tipo === "audio") {
    const url = (payload.url || "").trim();
    if (!url) throw new Error("URL de audio vacía");
    const res = await enviarMediaWhatsApp(item.cliente_numero, "audio", url, "", opciones);
    if (!res) throw new Error("No se pudo enviar audio de seguimiento");
    return res;
  }

  if (tipo === "pdf") {
    const url = (payload.url || "").trim();
    if (!url) throw new Error("URL de PDF vacía");
    const res = await enviarMediaWhatsApp(
      item.cliente_numero,
      "document",
      url,
      payload.caption || "",
      opciones
    );
    if (!res) throw new Error("No se pudo enviar PDF de seguimiento");
    return res;
  }

  if (tipo === "video") {
    const url = (payload.url || "").trim();
    if (!url) throw new Error("URL de video vacía");
    const res = await enviarMediaWhatsApp(
      item.cliente_numero,
      "video",
      url,
      payload.caption || "",
      opciones
    );
    if (!res) throw new Error("No se pudo enviar video de seguimiento");
    return res;
  }

  throw new Error("Tipo de mensaje no soportado: " + tipo);
}

async function intentarReservarYEnviarPaso(item, io) {
  const clave = buildClaveDedupPaso(item);
  console.log("[SEGUIMIENTO_FIX] lote_id", item.campana_id);
  console.log("[SEGUIMIENTO DEBUG] paso candidato:", {
    id: item.id,
    clave,
    lote_id: item.campana_id,
    paso_index: item.paso_index,
    cliente: item.cliente_numero,
  });

  const duplicado = await existePasoEnviadoOProcesando(item, item.id);
  if (duplicado) {
    console.log("[SEGUIMIENTO DEBUG] duplicado en mismo lote, saltando:", {
      id: item.id,
      clave,
      lote_id: item.campana_id,
      existente_id: duplicado.id,
      existente_estado: duplicado.estado,
    });

    if (duplicado.estado === ESTADOS_SEGUIMIENTO.ENVIADO) {
      await actualizarEstado(item.id, ESTADOS_SEGUIMIENTO.CANCELADO, {
        error_detalle: "Duplicado: paso ya enviado en el mismo lote",
      });
    }

    return { ok: false, motivo: "duplicado" };
  }

  const reservado = await reservarPasoParaEnvio(item.id);
  if (!reservado) {
    console.log("[SEGUIMIENTO DEBUG] ya enviado, saltando:", {
      id: item.id,
      clave,
      motivo: "no se pudo reservar (otro worker o estado distinto de pendiente)",
    });
    return { ok: false, motivo: "no_reservado" };
  }

  console.log("[WORKER_RESERVA_TRACE]", {
    id: item.id,
    conexion_antes_reserva: item.conexion_whatsapp_id ?? null,
    conexion_despues_reserva: reservado.conexion_whatsapp_id ?? null,
    estado_despues_reserva: reservado.estado ?? null,
    perdida_en_reserva:
      Boolean(item.conexion_whatsapp_id) && !reservado.conexion_whatsapp_id,
  });

  console.log("[SEGUIMIENTO DEBUG] marcado procesando:", {
    id: reservado.id,
    clave,
  });

  await cancelarPendientesDuplicadosClave(reservado, reservado.id);

  if (!(await esUnicoProcesandoEnClave(reservado))) {
    console.log(
      `[SEGUIMIENTO DEBUG] carrera omitida id=${reservado.id} clave=${clave} cliente=${reservado.cliente_numero} conexion=${reservado.conexion_whatsapp_id ?? null}`
    );
    await actualizarEstado(reservado.id, ESTADOS_SEGUIMIENTO.CANCELADO, {
      error_detalle: "Duplicado: otro paso en procesando (carrera)",
    });
    return { ok: false, motivo: "carrera_procesando" };
  }

  if (!obtenerConexionSeguimiento(reservado)) {
    return cancelarSeguimientoSinConexion(reservado, io);
  }

  const itemDb = await obtenerSeguimientoPorId(reservado.id);
  console.log("[WORKER_DB_REFETCH]", {
    id: reservado.id,
    conexion_en_memoria: reservado.conexion_whatsapp_id ?? null,
    conexion_en_db: itemDb?.conexion_whatsapp_id ?? null,
    estado_en_db: itemDb?.estado ?? null,
    perdida_entre_memoria_y_db:
      Boolean(reservado.conexion_whatsapp_id) && !itemDb?.conexion_whatsapp_id,
    programada_sin_conexion_en_db: !itemDb?.conexion_whatsapp_id,
  });

  const itemParaEnvio = itemDb || reservado;
  logWorkerItemFinal(itemParaEnvio);

  const mensajePrevio = await existeMensajePorSeguimientoId(reservado.id);
  if (mensajePrevio) {
    console.log("[SEGUIMIENTO_IDEMPOTENTE] mensaje ya en bandeja, marcar enviado", {
      seguimiento_id: reservado.id,
      mensaje_id: mensajePrevio.id,
      conexion_whatsapp_id: mensajePrevio.conexion_whatsapp_id ?? null,
    });
    await actualizarEstado(reservado.id, ESTADOS_SEGUIMIENTO.ENVIADO);
    emitirEstadoSeguimiento(io, reservado, ESTADOS_SEGUIMIENTO.ENVIADO);
    return { ok: true, motivo: "idempotente_mensaje_existente" };
  }

  try {
    console.log("[SEGUIMIENTO_MULTI] ejecutando seguimiento", {
      id: reservado.id,
      lote_id: reservado.campana_id,
      usuario_id: reservado.usuario_id,
      cliente_numero: reservado.cliente_numero,
      conexion_whatsapp_id: obtenerConexionSeguimiento(itemParaEnvio),
      paso_index: reservado.paso_index,
    });
    const enviado = await enviarMensajeSeguimiento(itemParaEnvio);
    if (!enviado) {
      throw new Error("Seguimiento: envío/inbox sin confirmar — no marcar enviado");
    }
    await actualizarEstado(reservado.id, ESTADOS_SEGUIMIENTO.ENVIADO);
    emitirEstadoSeguimiento(io, reservado, ESTADOS_SEGUIMIENTO.ENVIADO);
    console.log("[SEGUIMIENTO_WORKER] enviado ok", {
      id: reservado.id,
      lote_id: reservado.campana_id,
      paso_index: reservado.paso_index,
    });
    return { ok: true };
  } catch (error) {
    const detalle = error.message || "Error enviando seguimiento";
    console.error("[SEGUIMIENTO_WORKER_DEBUG] error envio", error);
    console.log("[SEGUIMIENTO_WORKER] error", {
      id: reservado.id,
      cliente: reservado.cliente_numero,
      detalle,
    });
    await actualizarEstado(reservado.id, ESTADOS_SEGUIMIENTO.CANCELADO, {
      error_detalle: detalle,
    });
    emitirEstadoSeguimiento(io, reservado, ESTADOS_SEGUIMIENTO.CANCELADO);
    return { ok: false, motivo: detalle };
  }
}

async function procesarSeguimientoItem(item, io) {
  console.log("[EXECUTE SEGUIMIENTO START]", {
    id: item.id,
    cliente_numero: item.cliente_numero,
    conexion_whatsapp_id: item.conexion_whatsapp_id || null,
    mensaje_tipo: item.mensaje_tipo || null,
    estado: item.estado || null,
  });

  if (!obtenerConexionSeguimiento(item)) {
    return cancelarSeguimientoSinConexion(item, io);
  }

  if (
    item.conexion_whatsapp_id &&
    item.usuario_id &&
    item.cliente_numero &&
    (await estaBotPausado({
      usuarioId: item.usuario_id,
      clienteNumero: item.cliente_numero,
      conexionWhatsappId: item.conexion_whatsapp_id,
    }))
  ) {
    console.log("[BOT_PAUSE] automatizacion omitida por pausa", {
      origen: "seguimiento_worker",
      seguimiento_id: item.id,
      usuario_id: item.usuario_id,
      cliente_numero: item.cliente_numero,
      conexion_whatsapp_id: item.conexion_whatsapp_id,
    });
    return { ok: false, motivo: "bot_pausado" };
  }

  if (item.solo_si_no_respondio) {
    const conexionSeg = obtenerConexionSeguimiento(item);
    if (!conexionSeg) {
      console.warn("[SEGUIMIENTO_MULTI] solo_si_no_respondio omitido — sin conexion_whatsapp_id", {
        id: item.id,
        cliente_numero: item.cliente_numero,
      });
    } else {
      const respondio = await leadRespondioParaSeguimiento(item, conexionSeg);

      if (respondio) {
        console.log("[SEGUIMIENTO_MULTI] seguimiento omitido — lead respondió en esta conexión", {
          id: item.id,
          usuario_id: item.usuario_id,
          cliente_numero: item.cliente_numero,
          conexion_whatsapp_id: conexionSeg,
        });
        await actualizarEstado(item.id, ESTADOS_SEGUIMIENTO.RESPONDIDO, {
          error_detalle: "Lead respondió antes del envío",
        });

        if (item.detener_si_responde) {
          await cancelarCampana(
            item.campana_id,
            ESTADOS_SEGUIMIENTO.RESPONDIDO,
            "Lead respondió",
            {
              conexionWhatsappId: conexionSeg,
              usuarioId: item.usuario_id,
              clienteNumero: item.cliente_numero,
            }
          );
        }

        emitirEstadoSeguimiento(io, item, ESTADOS_SEGUIMIENTO.RESPONDIDO);
        return { ok: false, motivo: "respondido" };
      }
    }
  }

  return intentarReservarYEnviarPaso(item, io);
}

async function procesarSeguimientosVencidos(io) {
  const lock = await adquirirLockWorkerSeguimiento();
  if (!lock.acquired) {
    return { procesados: 0, enviados: 0, lock: "skipped" };
  }

  try {
    const pendientes = await obtenerPendientesVencidos(40);

    if (!pendientes.length) return { procesados: 0, enviados: 0, lock: "acquired" };

    console.log("[SEGUIMIENTO_WORKER] pendientes:", pendientes.length);

    let procesados = 0;
    let enviados = 0;

    for (const item of pendientes) {
      logWorkerItemFinal(item);
      const res = await procesarSeguimientoItem(item, io);
      procesados++;
      if (res?.ok) enviados++;
    }

    return { procesados, enviados, lock: "acquired" };
  } finally {
    await liberarLockWorkerSeguimiento(lock.workerId);
  }
}

module.exports = {
  procesarSeguimientosVencidos,
  procesarSeguimientoItem,
  emitirEstadoSeguimiento,
};
