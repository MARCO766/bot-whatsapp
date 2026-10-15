/**
 * Protección exclusiva Seguimiento CRM V2: ventana WhatsApp 24h.
 * Fail-closed: sin contexto verificable o sin entrante → no enviar a Meta.
 * No altera el guard global ni otras rutas de envío.
 */
const axios = require("axios");
const { horasDesdeUtc, VENTANA_HORAS } = require("../whatsapp24hGuard");
const { MOTIVO_VENTANA_WHATSAPP_CERRADA } = require("./constants");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function normalizarId(valor) {
  if (valor == null || String(valor).trim() === "") return null;
  return String(valor).trim();
}

/**
 * Último mensaje entrante del lead en la línea exacta (tripleta).
 * No cruza conexiones ni números.
 */
async function obtenerUltimoMensajeEntranteV2(
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
  deps = {}
) {
  const get = deps.axiosGet || ((url, opts) => axios.get(url, opts));
  const baseUrl = deps.supabaseUrl || SUPABASE_URL;
  const key = deps.supabaseKey || SUPABASE_KEY;

  if (!baseUrl || !key) {
    return { ok: false, motivo: "sin_supabase", mensaje: null };
  }

  const uid = encodeURIComponent(usuarioId);
  const num = encodeURIComponent(clienteNumero);
  const conn = encodeURIComponent(conexionWhatsappId);

  const url =
    `${baseUrl}/rest/v1/mensajes?usuario_id=eq.${uid}` +
    `&cliente_numero=eq.${num}` +
    `&conexion_whatsapp_id=eq.${conn}` +
    `&direccion=eq.entrante` +
    `&select=id,creado_en,conexion_whatsapp_id` +
    `&order=creado_en.desc` +
    `&limit=1`;

  try {
    const res = await get(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    return { ok: true, mensaje: res.data?.[0] || null };
  } catch (err) {
    return {
      ok: false,
      motivo: err.response?.data?.message || err.message || "error_consulta",
      mensaje: null,
    };
  }
}

/**
 * Decide si un seguimiento V2 puede enviar free-form a Meta.
 * @returns {{ permitir: boolean, motivo: string|null, detalle: object }}
 */
async function evaluarVentana24hSeguimientoV2(item, deps = {}) {
  const usuarioId = normalizarId(item?.usuario_id);
  const clienteNumero = normalizarId(item?.cliente_numero);
  const conexionWhatsappId = normalizarId(
    item?.conexion_whatsapp_id ?? item?.conexionWhatsappId
  );

  const base = {
    seguimiento_v2_id: item?.id ?? null,
    usuario_id: usuarioId,
    cliente_numero: clienteNumero,
    conexion_whatsapp_id: conexionWhatsappId,
    origen: "seguimiento_v2",
  };

  if (!usuarioId || !clienteNumero || !conexionWhatsappId) {
    console.log("[SEG_V2_VENTANA_24H_BLOCK]", {
      ...base,
      razon: "contexto_incompleto",
    });
    return {
      permitir: false,
      motivo: MOTIVO_VENTANA_WHATSAPP_CERRADA,
      detalle: { ...base, razon: "contexto_incompleto" },
    };
  }

  const consultaFn =
    deps.obtenerUltimoMensajeEntranteV2 || obtenerUltimoMensajeEntranteV2;
  const consulta = await consultaFn(
    usuarioId,
    clienteNumero,
    conexionWhatsappId,
    deps
  );

  if (!consulta.ok) {
    console.log("[SEG_V2_VENTANA_24H_BLOCK]", {
      ...base,
      razon: "no_verificable",
      error: consulta.motivo,
    });
    return {
      permitir: false,
      motivo: MOTIVO_VENTANA_WHATSAPP_CERRADA,
      detalle: { ...base, razon: "no_verificable", error: consulta.motivo },
    };
  }

  const ultimo = consulta.mensaje;
  if (!ultimo?.creado_en) {
    console.log("[SEG_V2_VENTANA_24H_BLOCK]", {
      ...base,
      razon: "sin_mensaje_entrante",
    });
    return {
      permitir: false,
      motivo: MOTIVO_VENTANA_WHATSAPP_CERRADA,
      detalle: { ...base, razon: "sin_mensaje_entrante" },
    };
  }

  const connMensaje = normalizarId(ultimo.conexion_whatsapp_id);
  if (connMensaje && connMensaje !== conexionWhatsappId) {
    console.log("[SEG_V2_VENTANA_24H_BLOCK]", {
      ...base,
      razon: "conexion_mismatch",
      conexion_mensaje: connMensaje,
    });
    return {
      permitir: false,
      motivo: MOTIVO_VENTANA_WHATSAPP_CERRADA,
      detalle: {
        ...base,
        razon: "conexion_mismatch",
        conexion_mensaje: connMensaje,
      },
    };
  }

  const ahoraMs = deps.ahoraMs != null ? deps.ahoraMs : Date.now();
  const horas = horasDesdeUtc(ultimo.creado_en, ahoraMs);
  const horasRedondeadas =
    horas == null || Number.isNaN(horas)
      ? null
      : Math.round(horas * 100) / 100;

  if (horas == null || Number.isNaN(horas) || horas > VENTANA_HORAS) {
    console.log("[SEG_V2_VENTANA_24H_BLOCK]", {
      ...base,
      razon: "ventana_vencida",
      ultima_interaccion: ultimo.creado_en,
      horas_desde_ultima_interaccion: horasRedondeadas,
    });
    return {
      permitir: false,
      motivo: MOTIVO_VENTANA_WHATSAPP_CERRADA,
      detalle: {
        ...base,
        razon: "ventana_vencida",
        ultima_interaccion: ultimo.creado_en,
        horas_desde_ultima_interaccion: horasRedondeadas,
      },
    };
  }

  console.log("[SEG_V2_VENTANA_24H_ALLOW]", {
    ...base,
    ultima_interaccion: ultimo.creado_en,
    horas_desde_ultima_interaccion: horasRedondeadas,
  });

  return {
    permitir: true,
    motivo: null,
    detalle: {
      ...base,
      ultima_interaccion: ultimo.creado_en,
      horas_desde_ultima_interaccion: horasRedondeadas,
    },
  };
}

module.exports = {
  MOTIVO_VENTANA_WHATSAPP_CERRADA,
  obtenerUltimoMensajeEntranteV2,
  evaluarVentana24hSeguimientoV2,
  horasDesdeUtc,
  VENTANA_HORAS,
};
