const {
  enviarTextoWhatsApp,
  enviarMediaWhatsApp,
  enviarBotonesWhatsApp,
} = require("../whatsappService");
const {
  obtenerPendientesVencidos,
  actualizarEstado,
  cancelarCampana,
  clienteRespondioDespues,
  buildClaveDedupPaso,
  existePasoEnviadoOProcesando,
  esUnicoProcesandoEnClave,
  cancelarPendientesDuplicadosClave,
  reservarPasoParaEnvio,
} = require("./seguimientoRepository");
const { ESTADOS_SEGUIMIENTO } = require("./constants");
const rt = require("../realtimeService");

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

async function enviarMensajeSeguimiento(item) {
  const payload = item.mensaje_payload || {};
  const tipo = (item.mensaje_tipo || payload.tipo || "texto").toLowerCase();
  const opciones = {
    usuarioId: item.usuario_id,
    conexionWhatsappId: item.conexion_whatsapp_id || null,
  };
  const botones = Array.isArray(payload.botones) ? payload.botones : [];

  console.log("[SEGUIMIENTO_MULTI] enviando mensaje de seguimiento", {
    seguimiento_id: item.id,
    usuario_id: item.usuario_id,
    cliente_numero: item.cliente_numero,
    conexion_whatsapp_id: item.conexion_whatsapp_id || null,
    paso_index: item.paso_index,
  });

  if (tipo === "texto") {
    const texto = (payload.texto || "").trim();
    if (!texto) throw new Error("Mensaje de texto vacío");
    if (botones.length) {
      await enviarBotonesWhatsApp(item.cliente_numero, texto, botones, opciones);
    } else {
      await enviarTextoWhatsApp(item.cliente_numero, texto, opciones);
    }
    return;
  }

  if (tipo === "imagen") {
    const url = (payload.url || "").trim();
    if (!url) throw new Error("URL de imagen vacía");
    await enviarMediaWhatsApp(
      item.cliente_numero,
      "image",
      url,
      payload.caption || "",
      opciones
    );
    return;
  }

  if (tipo === "audio") {
    const url = (payload.url || "").trim();
    if (!url) throw new Error("URL de audio vacía");
    await enviarMediaWhatsApp(item.cliente_numero, "audio", url, "", opciones);
    return;
  }

  if (tipo === "pdf") {
    const url = (payload.url || "").trim();
    if (!url) throw new Error("URL de PDF vacía");
    await enviarMediaWhatsApp(
      item.cliente_numero,
      "document",
      url,
      payload.caption || "",
      opciones
    );
    return;
  }

  if (tipo === "video") {
    const url = (payload.url || "").trim();
    if (!url) throw new Error("URL de video vacía");
    await enviarMediaWhatsApp(
      item.cliente_numero,
      "video",
      url,
      payload.caption || "",
      opciones
    );
    return;
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

  console.log("[SEGUIMIENTO DEBUG] marcado procesando:", {
    id: reservado.id,
    clave,
  });

  await cancelarPendientesDuplicadosClave(reservado, reservado.id);

  if (!(await esUnicoProcesandoEnClave(reservado))) {
    console.log("[SEGUIMIENTO DEBUG] ya enviado, saltando:", {
      id: reservado.id,
      clave,
      motivo: "otra fila en procesando con la misma clave lógica",
    });
    await actualizarEstado(reservado.id, ESTADOS_SEGUIMIENTO.CANCELADO, {
      error_detalle: "Duplicado: otro paso en procesando (carrera)",
    });
    return { ok: false, motivo: "carrera_procesando" };
  }

  try {
    console.log("[SEGUIMIENTO_MULTI] ejecutando seguimiento", {
      id: reservado.id,
      lote_id: reservado.campana_id,
      usuario_id: reservado.usuario_id,
      cliente_numero: reservado.cliente_numero,
      conexion_whatsapp_id: reservado.conexion_whatsapp_id || null,
      paso_index: reservado.paso_index,
    });
    await enviarMensajeSeguimiento(reservado);
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
  if (item.solo_si_no_respondio) {
    const respondio = await clienteRespondioDespues(
      item.cliente_numero,
      item.usuario_id,
      item.checkpoint_at,
      item.creado_en,
      item.conexion_whatsapp_id || null
    );

    if (respondio) {
      console.log("[SEGUIMIENTO_MULTI] seguimiento omitido — lead respondió en esta conexión", {
        id: item.id,
        usuario_id: item.usuario_id,
        cliente_numero: item.cliente_numero,
        conexion_whatsapp_id: item.conexion_whatsapp_id || null,
      });
      await actualizarEstado(item.id, ESTADOS_SEGUIMIENTO.RESPONDIDO, {
        error_detalle: "Lead respondió antes del envío",
      });

      if (item.detener_si_responde) {
        await cancelarCampana(
          item.campana_id,
          ESTADOS_SEGUIMIENTO.RESPONDIDO,
          "Lead respondió"
        );
      }

      emitirEstadoSeguimiento(io, item, ESTADOS_SEGUIMIENTO.RESPONDIDO);
      return { ok: false, motivo: "respondido" };
    }
  }

  return intentarReservarYEnviarPaso(item, io);
}

async function procesarSeguimientosVencidos(io) {
  const pendientes = await obtenerPendientesVencidos(40);
  console.log(
    "[SEGUIMIENTO_WORKER_DEBUG] pendientes encontrados",
    pendientes?.length,
    pendientes
  );

  if (!pendientes.length) return { procesados: 0, enviados: 0 };

  console.log("[SEGUIMIENTO_WORKER] pendientes encontrados:", pendientes.length);

  let procesados = 0;
  let enviados = 0;

  for (const item of pendientes) {
    console.log("[SEGUIMIENTO_WORKER_DEBUG] enviando", item);
    console.log("[SEGUIMIENTO_WORKER] enviando", {
      id: item.id,
      cliente: item.cliente_numero,
      run_at: item.run_at,
    });
    const res = await procesarSeguimientoItem(item, io);
    procesados++;
    if (res?.ok) enviados++;
  }

  return { procesados, enviados };
}

module.exports = {
  procesarSeguimientosVencidos,
  procesarSeguimientoItem,
  emitirEstadoSeguimiento,
};
