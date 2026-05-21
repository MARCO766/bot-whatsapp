const {
  enviarTextoWhatsApp,
  enviarMediaWhatsApp,
} = require("../whatsappService");
const {
  obtenerPendientesVencidos,
  actualizarEstado,
  cancelarCampana,
  clienteRespondioDespues,
  ultimoMensajeEntranteEn,
} = require("./remarketingRepository");
const { evaluarParadaAntesDeEnviar } = require("./stopConditions");
const { aplicarEtiquetaCliente } = require("./aplicarEtiqueta");
const { programarSiguientePasoTrasEnvio } = require("./porMensajeEntrante");
const { ESTADOS_REMARKETING } = require("./constants");

async function enviarMensajeRemarketing(item) {
  const payload = item.mensaje_payload || {};
  const tipo = (item.mensaje_tipo || payload.tipo || "texto").toLowerCase();
  const opciones = { usuarioId: item.usuario_id };

  if (tipo === "texto") {
    const texto = (payload.texto || "").trim();
    if (!texto) throw new Error("Mensaje de texto vacío");
    await enviarTextoWhatsApp(item.cliente_numero, texto, opciones);
    return;
  }

  const url = (payload.url || "").trim();
  if (!url) throw new Error("URL de media vacía");

  if (tipo === "imagen") {
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
    await enviarMediaWhatsApp(item.cliente_numero, "audio", url, "", opciones);
    return;
  }

  if (tipo === "pdf") {
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

async function verificarVentana24h(item) {
  const config = item.config_snapshot || {};
  const modo = config.modo_inteligente || {};

  if (!modo.respetar_ventana_24h) return { ok: true };

  const ultimo = await ultimoMensajeEntranteEn(
    item.cliente_numero,
    item.usuario_id,
    24
  );

  if (ultimo) return { ok: true };

  return {
    ok: false,
    motivo: "fuera_ventana_24h",
    detalle: "Sin mensaje entrante del lead en las últimas 24h — requiere plantilla",
  };
}

async function procesarRemarketingItem(item) {
  const parada = await evaluarParadaAntesDeEnviar(item);
  if (parada.detener) {
    if (parada.motivo === "respondio" && parada.soloEstePaso) {
      await actualizarEstado(item.id, ESTADOS_REMARKETING.RESPONDIDO, {
        error_detalle: "Lead respondió antes del envío",
      });
      const config = item.config_snapshot || {};
      if (config.condiciones?.detener_si_responde) {
        await cancelarCampana(
          item.campana_id,
          ESTADOS_REMARKETING.RESPONDIDO,
          "Lead respondió"
        );
      }
    }
    return { ok: false, motivo: parada.motivo };
  }

  const respondio = await clienteRespondioDespues(
    item.cliente_numero,
    item.usuario_id,
    item.checkpoint_at
  );

  if (respondio) {
    await actualizarEstado(item.id, ESTADOS_REMARKETING.RESPONDIDO, {
      error_detalle: "Lead respondió antes del envío",
    });
    const config = item.config_snapshot || {};
    if (config.condiciones?.detener_si_responde) {
      await cancelarCampana(
        item.campana_id,
        ESTADOS_REMARKETING.RESPONDIDO,
        "Lead respondió"
      );
    }
    return { ok: false, motivo: "respondido" };
  }

  const ventana = await verificarVentana24h(item);
  if (!ventana.ok) {
    console.log(
      "[REMARKETING] fuera_ventana_24h | cliente:",
      item.cliente_numero,
      "| paso:",
      item.paso_nombre || item.paso_id
    );
    await actualizarEstado(item.id, ESTADOS_REMARKETING.FUERA_VENTANA_24H, {
      error_detalle: ventana.detalle,
    });
    return { ok: false, motivo: ventana.motivo };
  }

  try {
    await enviarMensajeRemarketing(item);
    await actualizarEstado(item.id, ESTADOS_REMARKETING.ENVIADO);

    const config = item.config_snapshot || {};
    const etiquetas = config.etiquetas || {};
    const esUltimoPaso =
      item.paso_index === (config.steps?.length || 1) - 1;

    if (!respondio && esUltimoPaso && etiquetas.no_respondio) {
      await aplicarEtiquetaCliente(
        item.cliente_numero,
        etiquetas.no_respondio,
        item.usuario_id
      );
    }

    console.log(
      "[RM DEBUG] enviado " +
        (item.paso_nombre || item.paso_id) +
        " → " +
        item.cliente_numero
    );

    try {
      await programarSiguientePasoTrasEnvio(item);
    } catch (chainErr) {
      console.log(
        "[RM DEBUG] error programando siguiente paso:",
        chainErr.message
      );
    }

    return { ok: true };
  } catch (error) {
    const detalle = error.message || "Error enviando remarketing";
    await actualizarEstado(item.id, ESTADOS_REMARKETING.CANCELADO, {
      error_detalle: detalle,
    });
    console.log("[REMARKETING] ✗ Error envío:", detalle);
    return { ok: false, motivo: detalle };
  }
}

async function procesarRemarketingVencidos() {
  const pendientes = await obtenerPendientesVencidos(40);
  if (!pendientes.length) return { procesados: 0 };

  let procesados = 0;

  for (const item of pendientes) {
    await procesarRemarketingItem(item);
    procesados++;
  }

  return { procesados };
}

module.exports = {
  procesarRemarketingVencidos,
  procesarRemarketingItem,
};
