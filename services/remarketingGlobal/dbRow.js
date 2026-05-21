/**
 * Filas remarketing_global_programados — columnas Supabase producción (ES).
 */
const { ESTADOS_REMARKETING } = require("./constants");

const USA_LEGACY = process.env.REMARKETING_LEGACY_COLUMNS === "true";

function cargaUtilDesdePaso(paso) {
  return {
    tipo: paso.mensaje.tipo,
    texto: paso.mensaje.texto,
    url: paso.mensaje.url,
    caption: paso.mensaje.caption,
  };
}

function buildRemarketingProgramadoRow({
  campanaId,
  usuarioId,
  numero,
  flujoId,
  nodoId,
  paso,
  pasoIndex,
  config,
  checkpointAt,
  runAt,
}) {
  const cargaUtil = cargaUtilDesdePaso(paso);
  const base = {
    campana_id: campanaId,
    usuario_id: usuarioId || null,
    cliente_numero: numero,
    flujo_id: flujoId,
    nodo_id: nodoId,
    paso_index: pasoIndex,
    paso_id: paso.id,
    paso_nombre: paso.nombre,
    mensaje_tipo: paso.mensaje.tipo,
    checkpoint_at: checkpointAt,
    estado: ESTADOS_REMARKETING.PENDIENTE,
  };

  if (USA_LEGACY) {
    return {
      ...base,
      run_at: runAt,
      mensaje_payload: cargaUtil,
      config_snapshot: config,
    };
  }

  return {
    ...base,
    correr_en: runAt,
    "carga_útil_del_mensaje": cargaUtil,
    "instantánea_de_configuración": config,
  };
}

function leerCargaUtilDesdeFila(item) {
  if (!item || typeof item !== "object") return {};

  const raw =
    item["carga_útil_del_mensaje"] ??
    item.carga_util_del_mensaje ??
    item.mensaje_payload ??
    null;

  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return { texto: raw };
    }
  }
  return {};
}

function leerConfigDesdeFila(item) {
  if (!item || typeof item !== "object") return {};
  return (
    item["instantánea_de_configuración"] ??
    item.instantanea_de_configuracion ??
    item.config_snapshot ??
    {}
  );
}

function leerCorrerEnDesdeFila(item) {
  return item?.correr_en ?? item?.run_at ?? null;
}

module.exports = {
  buildRemarketingProgramadoRow,
  leerCargaUtilDesdeFila,
  leerConfigDesdeFila,
  leerCorrerEnDesdeFila,
  cargaUtilDesdePaso,
};
