const { enviarTextoWhatsApp } = require("../whatsappService");
const {
  ESTADOS_RM24H,
  MS_INACTIVIDAD,
  MAX_INTENTOS,
} = require("./constants");
const repo = require("./remarketing24hRepository");
const { nowUtc } = require("../seguimiento/timestamps");

function calcularExpiraEn() {
  return new Date(Date.now() + MS_INACTIVIDAD).toISOString();
}

function ventanaWhatsAppAbierta(fila) {
  const ultimo = fila.ultimo_mensaje_lead_at;
  if (!ultimo) return false;
  const finVentana = new Date(ultimo).getTime() + MS_INACTIVIDAD;
  return finVentana > Date.now();
}

async function cerrarIntentoMaximo(fila) {
  await repo.actualizarPorId(fila.id, {
    estado: ESTADOS_RM24H.CERRADO_SIN_RESPUESTA,
    activo: false,
    cancelado_en: nowUtc(),
    motivo_cancelacion: "max_intentos",
  });
  console.log("[RM24H] intento maximo", {
    id: fila.id,
    cliente: fila.cliente_numero,
    intentos: fila.intentos,
  });
}

async function marcarExpiradoVentana(fila) {
  await repo.actualizarPorId(fila.id, {
    estado: ESTADOS_RM24H.EXPIRADO_VENTANA,
    activo: false,
    cancelado_en: nowUtc(),
    motivo_cancelacion: "ventana_whatsapp_cerrada",
  });
  console.log("[RM24H] fuera ventana", {
    id: fila.id,
    cliente: fila.cliente_numero,
    ultimo_mensaje_lead_at: fila.ultimo_mensaje_lead_at,
  });
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

  console.log("[RM24H] dentro ventana", {
    id: fila.id,
    cliente: fila.cliente_numero,
    ultimo_mensaje_lead_at: fila.ultimo_mensaje_lead_at,
  });

  const texto = String(fila.mensaje_remarketing || "").trim();
  if (!texto) {
    await repo.actualizarPorId(fila.id, {
      estado: ESTADOS_RM24H.PENDIENTE_DISPARO,
      motivo_cancelacion: "mensaje_vacio",
    });
    console.log("[RM24H] mensaje vacío, no se envía:", fila.id);
    return { ok: false, motivo: "mensaje_vacio" };
  }

  const reservado = await repo.reservarParaEnvio(fila.id);
  if (!reservado) {
    console.log("[RM24H] ya reservado por otro worker:", fila.id);
    return { ok: false, motivo: "no_reservado" };
  }

  try {
    console.log("[RM24H] enviando WhatsApp", {
      id: reservado.id,
      cliente: reservado.cliente_numero,
      intento: intentosActuales + 1,
    });
    console.log("[RM24H] enviando", reservado.cliente_numero);

    await enviarTextoWhatsApp(reservado.cliente_numero, texto, {
      usuarioId: reservado.usuario_id,
    });

    console.log("[RM24H] enviado OK", {
      id: reservado.id,
      cliente: reservado.cliente_numero,
    });

    const nuevosIntentos = intentosActuales + 1;
    const ahora = nowUtc();

    if (nuevosIntentos >= MAX_INTENTOS) {
      await repo.actualizarPorId(reservado.id, {
        estado: ESTADOS_RM24H.CERRADO_SIN_RESPUESTA,
        activo: false,
        intentos: nuevosIntentos,
        ultimo_disparo_en: ahora,
        disparado_en: ahora,
        cancelado_en: ahora,
        motivo_cancelacion: "max_intentos_tras_envio",
      });
      console.log("[RM24H] intento maximo", {
        id: reservado.id,
        intentos: nuevosIntentos,
      });
      return { ok: true, motivo: "max_intentos_tras_envio" };
    }

    await repo.actualizarPorId(reservado.id, {
      estado: ESTADOS_RM24H.ACTIVO,
      activo: true,
      intentos: nuevosIntentos,
      ultimo_disparo_en: ahora,
      disparado_en: ahora,
      expira_en: calcularExpiraEn(),
      motivo_cancelacion: null,
    });

    console.log("[RM24H] reprogramado", {
      id: reservado.id,
      intentos: nuevosIntentos,
      expira_en: calcularExpiraEn(),
    });

    return { ok: true };
  } catch (error) {
    const detalle = error.response?.data || error.message;
    console.log("[RM24H] error envío:", detalle);

    await repo.actualizarPorId(reservado.id, {
      estado: ESTADOS_RM24H.PENDIENTE_DISPARO,
      motivo_cancelacion: String(
        typeof detalle === "object" ? JSON.stringify(detalle) : detalle
      ).slice(0, 500),
    });

    return { ok: false, motivo: "error_envio" };
  }
}

async function procesarPendientesDisparo() {
  const pendientes = await repo.listarPendientesDisparo(40);
  let enviados = 0;

  for (const fila of pendientes) {
    const resultado = await procesarPendienteDisparo(fila);
    if (resultado.ok) enviados++;
  }

  return { procesados: pendientes.length, enviados };
}

module.exports = {
  ventanaWhatsAppAbierta,
  procesarPendienteDisparo,
  procesarPendientesDisparo,
};
