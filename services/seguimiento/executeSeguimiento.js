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
const { existeMensajePorSeguimientoIdDuro } = require("./mensajesSeguimientoIdempotencia");
const {
  esSeguimientoBlockedError,
  CODIGOS_BLOQUEO,
} = require("./seguimientoGuards");

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

function logSegExecTrace(item) {
  console.log("[SEG_EXEC_TRACE]", {
    seguimiento_id: item?.id ?? null,
    campana_id: item?.campana_id ?? null,
    paso_index: item?.paso_index ?? null,
    conexion_whatsapp_id: item?.conexion_whatsapp_id ?? null,
    estado_actual: item?.estado ?? null,
    timestamp: new Date().toISOString(),
  });
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

  const conexionId = obtenerConexionSeguimiento(item);
  const clienteNumero =
    item.cliente_numero != null ? String(item.cliente_numero).trim() : "";

  const payload = {
    id: item.id,
    campana_id: item.campana_id,
    cliente_numero: item.cliente_numero,
    flujo_id: item.flujo_id,
    nodo_id: item.nodo_id,
    estado,
  };

  if (item.paso_index != null) payload.paso_index = item.paso_index;
  if (item.paso_id != null) payload.paso_id = item.paso_id;
  if (item.run_at != null) payload.run_at = item.run_at;

  if (conexionId) {
    payload.conexion_whatsapp_id = conexionId;
    if (clienteNumero) {
      payload.chatKey = `${clienteNumero}::${conexionId}`;
    }
  }

  rt.seguimientoActualizado(io, item.usuario_id, payload);
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
    conexionWhatsappIdFila: item.conexion_whatsapp_id ?? conexionId,
    strictConexionWhatsappId: true,
    origen: "seguimiento",
    seguimientoId: item.id,
    campanaId: item.campana_id ?? null,
    pasoIndex: item.paso_index ?? null,
    clienteNumero: item.cliente_numero ?? null,
  };
}

async function manejarBloqueoEnvioSeguimiento(error, reservado, io) {
  if (error.code === CODIGOS_BLOQUEO.DUP_META) {
    await actualizarEstado(reservado.id, ESTADOS_SEGUIMIENTO.ENVIADO_IDEMPOTENTE, {
      error_detalle: "Idempotente: mensaje ya existía antes de POST Meta",
    });
    emitirEstadoSeguimiento(io, reservado, ESTADOS_SEGUIMIENTO.ENVIADO_IDEMPOTENTE);
    return { ok: true, motivo: "enviado_idempotente" };
  }

  if (
    error.code === CODIGOS_BLOQUEO.CONEXION_MISMATCH_OPCIONES ||
    error.code === CODIGOS_BLOQUEO.CONEXION_MISMATCH_RESUELTA ||
    error.code === CODIGOS_BLOQUEO.INBOX_MISMATCH
  ) {
    await actualizarEstado(reservado.id, ESTADOS_SEGUIMIENTO.FALLIDO_CONEXION_MISMATCH, {
      error_detalle: error.message || "Conexión programada no coincide con envío/inbox",
    });
    emitirEstadoSeguimiento(io, reservado, ESTADOS_SEGUIMIENTO.FALLIDO_CONEXION_MISMATCH);
    return { ok: false, motivo: "fallido_conexion_mismatch" };
  }

  return null;
}

async function enviarMensajeSeguimiento(item) {
  const payload = item.mensaje_payload || {};
  const tipo = (item.mensaje_tipo || payload.tipo || "texto").toLowerCase();
  const opciones = buildOpcionesEnvioSeguimiento(item);
  const botones = Array.isArray(payload.botones) ? payload.botones : [];

  console.log("[SEG_SEND_TRACE]", {
    seguimiento_id: item.id,
    cliente_numero: item.cliente_numero,
    conexion_whatsapp_id_fila: item.conexion_whatsapp_id ?? null,
    "opciones.conexion_whatsapp_id": opciones.conexionWhatsappId,
    strictConexionWhatsappId: opciones.strictConexionWhatsappId === true,
    phone_number_id_resuelto: null,
    nombre_conexion_resuelta: null,
    fase: "executeSeguimiento_pre_whatsappService",
  });

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
  logSegExecTrace(item);
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

  const mensajePrevio = await existeMensajePorSeguimientoIdDuro(reservado.id);
  if (mensajePrevio) {
    console.log("[SEG_BLOCK_DUP_META]", {
      seguimiento_id: reservado.id,
      mensaje_id: mensajePrevio.id ?? null,
      fase: "worker_pre_envio",
    });
    await actualizarEstado(reservado.id, ESTADOS_SEGUIMIENTO.ENVIADO_IDEMPOTENTE, {
      error_detalle: "Idempotente: mensaje ya en bandeja",
    });
    emitirEstadoSeguimiento(io, reservado, ESTADOS_SEGUIMIENTO.ENVIADO_IDEMPOTENTE);
    return { ok: true, motivo: "enviado_idempotente" };
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
    if (esSeguimientoBlockedError(error)) {
      const bloqueo = await manejarBloqueoEnvioSeguimiento(error, reservado, io);
      if (bloqueo) return bloqueo;
    }

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
  logSegExecTrace(item);
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

function logCrucesConexionEnLoteWorker(pendientes) {
  const grupos = new Map();

  for (const item of pendientes) {
    const key = [
      item.usuario_id || "",
      item.cliente_numero || "",
      item.flujo_id || "",
      item.nodo_id || "",
      String(item.paso_index ?? ""),
    ].join("|");

    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(item);
  }

  for (const [, items] of grupos) {
    if (items.length < 2) continue;

    const conexiones = [
      ...new Set(
        items
          .map((i) =>
            i.conexion_whatsapp_id != null ? String(i.conexion_whatsapp_id).trim() : ""
          )
          .filter(Boolean)
      ),
    ];

    if (conexiones.length < 2) continue;

    console.log("[SEG_WORKER_CROSS_LINE_BATCH]", {
      cliente_numero: items[0].cliente_numero,
      flujo_id: items[0].flujo_id ?? null,
      nodo_id: items[0].nodo_id ?? null,
      paso_index: items[0].paso_index ?? null,
      conexiones,
      filas: items.map((i) => ({
        id: i.id,
        conexion_whatsapp_id: i.conexion_whatsapp_id ?? null,
        run_at: i.run_at ?? null,
        estado: i.estado ?? null,
      })),
    });
  }
}

async function procesarSeguimientosVencidos(io, opts = {}) {
  if (!opts.fromWorker) {
    console.log("[SEG_BLOCK_LEGACY_EXEC]", {
      pid: process.pid,
      caller: opts.caller || "desconocido",
    });
    return { procesados: 0, enviados: 0, lock: "blocked_legacy" };
  }

  const lock = await adquirirLockWorkerSeguimiento();
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
    const pendientes = await obtenerPendientesVencidos(40);

    if (!pendientes.length) return { procesados: 0, enviados: 0, lock: "acquired" };

    console.log("[SEGUIMIENTO_WORKER] pendientes:", pendientes.length);
    logCrucesConexionEnLoteWorker(pendientes);

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
