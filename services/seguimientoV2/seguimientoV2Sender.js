const {
  enviarTextoWhatsApp,
  enviarMediaWhatsApp,
} = require("../whatsappService");
const { normalizarConexionId } = require("./seguimientoV2Repository");
const {
  obtenerConexionItem,
  existeMensajePorSeguimientoV2Id,
  resolverConexionV2,
} = require("./seguimientoV2Guards");
const { logSegV2Test, logSegV2TestVariant } = require("./seguimientoV2TestLog");

function buildOpcionesEnvioV2(item) {
  const conexionId = obtenerConexionItem(item);
  if (!conexionId) {
    throw new Error("Seguimiento V2 sin conexion_whatsapp_id");
  }

  return {
    usuarioId: item.usuario_id,
    conexionWhatsappId: conexionId,
    conexionWhatsappIdFila: item.conexion_whatsapp_id ?? conexionId,
    strictConexionWhatsappId: true,
    origen: "seguimiento_v2",
    seguimientoV2Id: item.id,
    campanaId: item.campana_id ?? null,
    pasoIndex: item.paso_index ?? null,
    clienteNumero: item.cliente_numero ?? null,
  };
}

function normalizarTipoMedia(tipo) {
  const t = String(tipo || "texto").toLowerCase();
  if (t === "pdf" || t === "document" || t === "doc" || t === "documento") return "document";
  if (t === "imagen" || t === "image") return "image";
  return t;
}

async function enviarSeguimientoV2(item) {
  const seguimientoV2Id = item?.id ?? null;
  const conexionId = obtenerConexionItem(item);

  console.log("[SEG_V2_EXEC]", {
    seguimiento_v2_id: seguimientoV2Id,
    conexion_whatsapp_id: conexionId,
    paso_index: item?.paso_index ?? null,
  });

  if (!conexionId) {
    return { ok: false, motivo: "conexion_obligatoria" };
  }

  const duplicado = await existeMensajePorSeguimientoV2Id(seguimientoV2Id);
  if (duplicado) {
    console.log("[SEG_V2_DUP]", { seguimiento_v2_id: seguimientoV2Id });
    return {
      ok: true,
      motivo: "duplicado_detectado",
      omitido: true,
      mensajeId: duplicado.id ?? null,
    };
  }

  const conexion = await resolverConexionV2(item.usuario_id, conexionId);
  if (!conexion) {
    console.log("[SEG_V2_FAIL]", {
      seguimiento_v2_id: seguimientoV2Id,
      motivo: "conexion_no_encontrada",
      conexion_whatsapp_id: conexionId,
    });
    return { ok: false, motivo: "conexion_no_encontrada" };
  }

  const opciones = buildOpcionesEnvioV2(item);
  const tipo = normalizarTipoMedia(item.tipo);
  const numero = item.cliente_numero;

  let resultado = null;

  try {
    if (tipo === "texto") {
      const texto = String(item.contenido || "").trim();
      if (!texto) {
        return { ok: false, motivo: "contenido_vacio" };
      }

      if (/^SEGUIMIENTO V2 \d[AB]$/.test(texto)) {
        logSegV2TestVariant({
          conexion_whatsapp_id: conexionId,
          contenido: texto,
          campana_id: item.campana_id ?? null,
          paso_index: item.paso_index ?? null,
        });
      }

      resultado = await enviarTextoWhatsApp(numero, texto, opciones);
    } else {
      const mediaUrl = String(item.media_url || "").trim();
      if (!mediaUrl) {
        return { ok: false, motivo: "media_url_vacia" };
      }
      const caption = String(item.contenido || "").trim();
      const tipoMedia =
        tipo === "image" ? "image" : tipo === "video" ? "video" : tipo === "audio" ? "audio" : "document";
      const filename = String(item.media_filename || item.filename || "").trim();
      const opcionesMedia = filename ? { ...opciones, filename } : opciones;
      resultado = await enviarMediaWhatsApp(numero, tipoMedia, mediaUrl, caption, opcionesMedia);
    }
  } catch (err) {
    console.log("[SEG_V2_FAIL]", {
      seguimiento_v2_id: seguimientoV2Id,
      motivo: err.response?.data?.message || err.message,
    });
    return {
      ok: false,
      motivo: err.response?.data?.message || err.message || "error_envio",
    };
  }

  if (!resultado) {
    return { ok: false, motivo: "envio_sin_confirmar" };
  }

  const metaMessageId =
    resultado?.whatsapp_message_id ||
    resultado?.messages?.[0]?.id ||
    null;

  console.log("[SEG_V2_POST_META]", {
    seguimiento_v2_id: seguimientoV2Id,
    conexion_whatsapp_id: conexionId,
    phone_id: conexion.phone_id,
    meta_message_id: metaMessageId,
  });

  logSegV2Test({
    campana_id: item.campana_id ?? null,
    seguimiento_v2_id: seguimientoV2Id,
    conexion_whatsapp_id: conexionId,
    phone_id: conexion.phone_id,
    estado: "post_meta",
    paso_index: item.paso_index ?? null,
    cliente_numero: item.cliente_numero ?? null,
    prueba: "envio",
  });

  return {
    ok: true,
    metaMessageId,
    phoneId: conexion.phone_id,
    conexionWhatsappId: conexionId,
  };
}

module.exports = {
  enviarSeguimientoV2,
  buildOpcionesEnvioV2,
};
