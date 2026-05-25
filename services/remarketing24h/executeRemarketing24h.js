const {
  obtenerContenidosRemarketing,
  enviarContenidosRemarketing,
} = require("./rm24hContenidos");
const {
  ESTADOS_RM24H,
  MOTIVOS_RM24H,
  MS_VENTANA_WHATSAPP,
  MAX_INTENTOS,
} = require("./constants");
const repo = require("./remarketing24hRepository");
const { finalizarFlujoLeadTrasRemarketing } = require("../resetFlujoLeadService");
const { nowUtc } = require("../seguimiento/timestamps");

function ventanaWhatsAppAbierta(fila) {
  const ultimo = fila.ultimo_mensaje_lead_at;
  if (!ultimo) return false;
  const ventanaCierraEn = new Date(ultimo).getTime() + MS_VENTANA_WHATSAPP;
  return ventanaCierraEn > Date.now();
}

async function cerrarIntentoMaximo(fila) {
  await repo.actualizarPorId(
    fila.id,
    {
      estado: ESTADOS_RM24H.CERRADO_SIN_RESPUESTA,
      activo: false,
      cancelado_en: nowUtc(),
      motivo_cancelacion: MOTIVOS_RM24H.MAX_INTENTOS,
    },
    fila
  );
  console.log("[RM24H] intento maximo", {
    id: fila.id,
    cliente: fila.cliente_numero,
    intentos: fila.intentos,
  });
}

async function marcarExpiradoVentana(fila) {
  await repo.actualizarPorId(
    fila.id,
    {
      estado: ESTADOS_RM24H.EXPIRADO_VENTANA,
      activo: false,
      cancelado_en: nowUtc(),
      motivo_cancelacion: MOTIVOS_RM24H.VENTANA_CERRADA,
    },
    fila
  );
  const ventanaCierraEn = fila.ultimo_mensaje_lead_at
    ? new Date(
        new Date(fila.ultimo_mensaje_lead_at).getTime() + MS_VENTANA_WHATSAPP
      ).toISOString()
    : null;
  console.log("[RM24H] fuera ventana WhatsApp (24h)", {
    id: fila.id,
    cliente: fila.cliente_numero,
    ultimo_mensaje_lead_at: fila.ultimo_mensaje_lead_at,
    ventana_cierra_en: ventanaCierraEn,
    expira_en: fila.expira_en,
  });
}

async function cerrarTrasEnvio(fila, nuevosIntentos, ahora) {
  await repo.actualizarPorId(
    fila.id,
    {
      estado: ESTADOS_RM24H.CERRADO_SIN_RESPUESTA,
      activo: false,
      intentos: nuevosIntentos,
      ultimo_disparo_en: ahora,
      disparado_en: ahora,
      cancelado_en: ahora,
      motivo_cancelacion: MOTIVOS_RM24H.MAX_INTENTOS_TRAS_ENVIO,
    },
    fila
  );
  console.log("[RM24H] cerrado tras envio", {
    id: fila.id,
    cliente: fila.cliente_numero,
    intentos: nuevosIntentos,
  });

  try {
    await finalizarFlujoLeadTrasRemarketing(
      fila.cliente_numero,
      fila.usuario_id
    );
  } catch (err) {
    console.log(
      "[RM24H] error finalizando flujo tras remarketing:",
      err.response?.data || err.message
    );
  }
}

async function procesarPendienteDisparo(fila) {
  const intentosActuales = Number(fila.intentos) || 0;

  if (intentosActuales >= MAX_INTENTOS) {
    await cerrarIntentoMaximo(fila);
    return { ok: false, motivo: "max_intentos" };
  }

  if (!ventanaWhatsAppAbierta(fila)) {
    await marcarExpiradoVentana(fila);
    return { ok: false, motivo: "fuera_ventana" };
  }

  console.log("[RM24H] dentro ventana WhatsApp (24h)", {
    id: fila.id,
    cliente: fila.cliente_numero,
    ultimo_mensaje_lead_at: fila.ultimo_mensaje_lead_at,
    expira_en: fila.expira_en,
  });

  const contenidos = obtenerContenidosRemarketing(fila);
  if (!contenidos.length) {
    await repo.actualizarPorId(
      fila.id,
      {
        estado: ESTADOS_RM24H.CERRADO_SIN_RESPUESTA,
        activo: false,
        cancelado_en: nowUtc(),
        motivo_cancelacion: MOTIVOS_RM24H.MENSAJE_VACIO,
      },
      fila
    );
    console.log("[RM24H] mensaje vacío, no se envía:", fila.id);
    return { ok: false, motivo: "mensaje_vacio" };
  }

  const reservado = await repo.reservarParaEnvio(fila.id, fila);
  if (!reservado) {
    console.log("[RM24H] ya reservado por otro worker:", fila.id);
    return { ok: false, motivo: "no_reservado" };
  }

  try {
    console.log("[RM24H_WORKER] enviando", {
      id: reservado.id,
      cliente: reservado.cliente_numero,
      intento: intentosActuales + 1,
      contenidos: contenidos.length,
      usuario_id: reservado.usuario_id,
    });
    console.log("[RM24H] enviando WhatsApp", {
      id: reservado.id,
      cliente: reservado.cliente_numero,
      intento: intentosActuales + 1,
    });
    console.log("[RM24H] enviando", reservado.cliente_numero);

    await enviarContenidosRemarketing(reservado.cliente_numero, contenidos, {
      usuarioId: reservado.usuario_id,
    });

    console.log("[RM24H_WORKER] enviado ok", {
      id: reservado.id,
      cliente: reservado.cliente_numero,
    });
    console.log("[RM24H] enviado OK", {
      id: reservado.id,
      cliente: reservado.cliente_numero,
    });

    const nuevosIntentos = intentosActuales + 1;
    const ahora = nowUtc();

    await cerrarTrasEnvio(reservado, nuevosIntentos, ahora);
    return { ok: true, motivo: MOTIVOS_RM24H.MAX_INTENTOS_TRAS_ENVIO };
  } catch (error) {
    const detalle = error.response?.data || error.message;
    console.log("[RM24H_WORKER] error", {
      id: reservado.id,
      cliente: reservado.cliente_numero,
      detalle,
    });
    console.log("[RM24H] error envío:", detalle);

    await repo.actualizarPorId(
      reservado.id,
      {
        estado: ESTADOS_RM24H.PENDIENTE_DISPARO,
        activo: true,
        motivo_cancelacion: String(
          typeof detalle === "object" ? JSON.stringify(detalle) : detalle
        ).slice(0, 500),
      },
      reservado
    );

    return { ok: false, motivo: "error_envio" };
  }
}

async function procesarPendientesDisparo() {
  const pendientes = await repo.listarPendientesDisparo(40);
  let enviados = 0;

  if (pendientes.length) {
    console.log("[RM24H_WORKER] pendientes_disparo", pendientes.length, {
      ids: pendientes.map((f) => f.id),
    });
  }

  for (const fila of pendientes) {
    console.log("[RM24H_WORKER] procesando id", fila.id, {
      fase: "pendiente_disparo",
      cliente: fila.cliente_numero,
    });
    const resultado = await procesarPendienteDisparo(fila);
    if (resultado.ok) enviados++;
    else if (resultado.motivo) {
      console.log("[RM24H_WORKER] sin envio", {
        id: fila.id,
        motivo: resultado.motivo,
      });
    }
  }

  return { procesados: pendientes.length, enviados };
}

module.exports = {
  ventanaWhatsAppAbierta,
  procesarPendienteDisparo,
  procesarPendientesDisparo,
};
