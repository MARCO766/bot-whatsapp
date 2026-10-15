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
const { MOTIVO_VENTANA_WHATSAPP_CERRADA } = require("./constants");
const { evaluarVentana24hSeguimientoV2 } = require("./seguimientoV2Ventana24h");

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

async function enviarSeguimientoV2(item, opts = {}) {
  const deps = opts.deps || {};
  const seguimientoV2Id = item?.id ?? null;
  const conexionId = obtenerConexionItem(item);
  const enviarTexto = deps.enviarTextoWhatsApp || enviarTextoWhatsApp;
  const enviarMedia = deps.enviarMediaWhatsApp || enviarMediaWhatsApp;
  const evaluarVentana =
    deps.evaluarVentana24hSeguimientoV2 || evaluarVentana24hSeguimientoV2;
  const existeDup =
    deps.existeMensajePorSeguimientoV2Id || existeMensajePorSeguimientoV2Id;
  const resolverConn = deps.resolverConexionV2 || resolverConexionV2;

  console.log("[SEG_V2_EXEC]", {
    seguimiento_v2_id: seguimientoV2Id,
    conexion_whatsapp_id: conexionId,
    paso_index: item?.paso_index ?? null,
  });

  if (!conexionId) {
    return { ok: false, motivo: "conexion_obligatoria" };
  }

  const duplicado = await existeDup(seguimientoV2Id);
  if (duplicado) {
    console.log("[SEG_V2_DUP]", { seguimiento_v2_id: seguimientoV2Id });
    return {
      ok: true,
      motivo: "duplicado_detectado",
      omitido: true,
      mensajeId: duplicado.id ?? null,
    };
  }

  const conexion = await resolverConn(item.usuario_id, conexionId);
  if (!conexion) {
    console.log("[SEG_V2_FAIL]", {
      seguimiento_v2_id: seguimientoV2Id,
      motivo: "conexion_no_encontrada",
      conexion_whatsapp_id: conexionId,
    });
    return { ok: false, motivo: "conexion_no_encontrada" };
  }

  // Puerta exclusiva V2: cero POST Meta si la ventana 24h está vencida o no verificable.
  const ventana = await evaluarVentana(item, deps);
  if (!ventana.permitir) {
    const motivo = ventana.motivo || MOTIVO_VENTANA_WHATSAPP_CERRADA;
    console.log("[SEG_V2_FAIL]", {
      seguimiento_v2_id: seguimientoV2Id,
      motivo,
      detalle: ventana.detalle || null,
    });
    return { ok: false, motivo, bloqueadoVentana24h: true };
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

      resultado = await enviarTexto(numero, texto, opciones);
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
      resultado = await enviarMedia(numero, tipoMedia, mediaUrl, caption, opcionesMedia);
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
