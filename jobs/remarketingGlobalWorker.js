/**
 * Worker Remarketing Global — consulta correr_en, envía y marca enviado.
 * No usa run_at.
 */
const axios = require("axios");
const {
  enviarTextoWhatsApp,
  enviarMediaWhatsApp,
} = require("../services/whatsappService");
const { ESTADOS_REMARKETING } = require("../services/remarketingGlobal/constants");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

let workerIniciado = false;
let procesando = false;

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Pendientes vencidos: estado=pendiente AND correr_en <= now
 */
async function buscarPendientesVencidos(now, limite = 40) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase no configurado");
  }

  const nowEncoded = encodeURIComponent(now);
  const url =
    `${SUPABASE_URL}/rest/v1/remarketing_global_programados` +
    `?estado=eq.${ESTADOS_REMARKETING.PENDIENTE}` +
    `&correr_en=lte.${nowEncoded}` +
    `&order=correr_en.asc` +
    `&limit=${limite}` +
    `&select=*`;

  const response = await axios.get(url, { headers: supabaseHeaders() });
  return response.data || [];
}

async function marcarEnviado(id) {
  const enviadoEn = nowIso();
  await axios.patch(
    `${SUPABASE_URL}/rest/v1/remarketing_global_programados?id=eq.${id}`,
    {
      estado: ESTADOS_REMARKETING.ENVIADO,
      enviado_en: enviadoEn,
      actualizado_en: enviadoEn,
    },
    { headers: supabaseHeaders({ Prefer: "return=minimal" }) }
  );
}

async function marcarErrorEnvio(id, detalle) {
  const ahora = nowIso();
  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/remarketing_global_programados?id=eq.${id}`,
      {
        estado: ESTADOS_REMARKETING.CANCELADO,
        cancelado_en: ahora,
        actualizado_en: ahora,
        error_detalle: String(detalle || "error_envio").slice(0, 500),
      },
      { headers: supabaseHeaders({ Prefer: "return=minimal" }) }
    );
  } catch (_) {
    /* no bloquear worker */
  }
}

async function enviarPayloadRemarketing(item) {
  const payload = item.mensaje_payload || {};
  const tipo = String(item.mensaje_tipo || payload.tipo || "texto").toLowerCase();
  const opciones = { usuarioId: item.usuario_id };

  if (tipo === "texto") {
    const texto = String(payload.texto || "").trim();
    if (!texto) throw new Error("Mensaje de texto vacío");
    await enviarTextoWhatsApp(item.cliente_numero, texto, opciones);
    return;
  }

  const url = String(payload.url || "").trim();
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

async function ejecutarTick() {
  if (procesando) {
    console.log("[RM WORKER] tick omitido (tick anterior en curso)");
    return;
  }

  procesando = true;
  const now = nowIso();

  console.log("[RM WORKER] tick");
  console.log("[RM WORKER] now=" + now);
  console.log("[RM WORKER] buscando pendientes con correr_en <= now");

  try {
    const pendientes = await buscarPendientesVencidos(now);
    console.log("[RM WORKER] pendientes encontrados=" + pendientes.length);

    if (!pendientes.length) {
      return;
    }

    for (const item of pendientes) {
      try {
        console.log(
          "[RM WORKER] enviando cliente=" + (item.cliente_numero || "—")
        );
        console.log(
          "[RM WORKER] payload=" + JSON.stringify(item.mensaje_payload || {})
        );
        console.log(
          "[RM WORKER] id=" +
            (item.id || "—") +
            " correr_en=" +
            (item.correr_en || "—")
        );

        await enviarPayloadRemarketing(item);
        await marcarEnviado(item.id);
        console.log("[RM WORKER] enviado OK");
      } catch (errItem) {
        const msg = errItem.response?.data || errItem.message || String(errItem);
        console.log("[RM WORKER ERROR]", msg);
        if (item.id) {
          await marcarErrorEnvio(item.id, msg);
        }
      }
    }
  } catch (error) {
    const msg = error.response?.data || error.message || String(error);
    console.log("[RM WORKER ERROR]", msg);
  } finally {
    procesando = false;
  }
}

function startRemarketingGlobalWorker() {
  if (workerIniciado) return;
  workerIniciado = true;

  const intervaloMs = parseInt(
    process.env.REMARKETING_POLL_MS || process.env.SEGUIMIENTO_POLL_MS || "15000",
    10
  );

  void ejecutarTick();
  setInterval(() => void ejecutarTick(), intervaloMs);

  console.log(
    "🔥 Worker Remarketing Global activo cada",
    intervaloMs,
    "ms (columna correr_en)"
  );
}

module.exports = {
  startRemarketingGlobalWorker,
};
