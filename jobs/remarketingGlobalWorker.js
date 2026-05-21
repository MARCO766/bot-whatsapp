/**
 * Worker Remarketing Global — envía R1 pendientes (correr_en vencido).
 */
const axios = require("axios");
const {
  enviarTextoWhatsApp,
  enviarMediaWhatsApp,
} = require("../services/whatsappService");
const {
  leerCargaUtilDesdeFila,
} = require("../services/remarketingGlobal/dbRow");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const TABLA = "remarketing_global_programados";
const COL_FECHA =
  process.env.REMARKETING_LEGACY_COLUMNS === "true" ? "run_at" : "correr_en";

let workerIniciado = false;
let tickEnCurso = false;

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

async function buscarPendientesVencidos() {
  const now = new Date().toISOString();
  const url =
    `${SUPABASE_URL}/rest/v1/${TABLA}` +
    `?select=*` +
    `&estado=eq.pendiente` +
    `&${COL_FECHA}=lte.${encodeURIComponent(now)}` +
    `&order=${COL_FECHA}.asc` +
    `&limit=40`;

  const response = await axios.get(url, { headers: supabaseHeaders() });
  return { data: response.data || [], now, url };
}

async function marcarEnviado(id) {
  const enviadoEn = nowIso();
  await axios.patch(
    `${SUPABASE_URL}/rest/v1/${TABLA}?id=eq.${id}`,
    {
      estado: "enviado",
      enviado_en: enviadoEn,
      actualizado_en: enviadoEn,
    },
    { headers: supabaseHeaders({ Prefer: "return=minimal" }) }
  );
}

async function marcarError(id, mensaje) {
  const ahora = nowIso();
  const payload = {
    estado: "error",
    error_detalle: String(mensaje || "error").slice(0, 500),
    actualizado_en: ahora,
  };
  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/${TABLA}?id=eq.${id}`,
      payload,
      { headers: supabaseHeaders({ Prefer: "return=minimal" }) }
    );
  } catch {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/${TABLA}?id=eq.${id}`,
      {
        estado: "cancelado",
        error_detalle: payload.error_detalle,
        cancelado_en: ahora,
        actualizado_en: ahora,
      },
      { headers: supabaseHeaders({ Prefer: "return=minimal" }) }
    );
  }
}

async function enviarMensajeProgramado(item) {
  const carga = leerCargaUtilDesdeFila(item);
  const tipo = String(
    item.mensaje_tipo || carga.tipo || "texto"
  ).toLowerCase();
  const opciones = { usuarioId: item.usuario_id };
  const numero = item.cliente_numero;

  if (tipo === "texto") {
    const texto = String(carga.texto || carga.text || "").trim();
    if (!texto) throw new Error("Texto vacío en carga del mensaje");
    await enviarTextoWhatsApp(numero, texto, opciones);
    return;
  }

  const url = String(carga.url || "").trim();
  if (!url) throw new Error("URL de media vacía");

  if (tipo === "imagen") {
    await enviarMediaWhatsApp(
      numero,
      "image",
      url,
      carga.caption || "",
      opciones
    );
    return;
  }
  if (tipo === "audio") {
    await enviarMediaWhatsApp(numero, "audio", url, "", opciones);
    return;
  }
  if (tipo === "pdf") {
    await enviarMediaWhatsApp(
      numero,
      "document",
      url,
      carga.caption || "",
      opciones
    );
    return;
  }
  if (tipo === "video") {
    await enviarMediaWhatsApp(
      numero,
      "video",
      url,
      carga.caption || "",
      opciones
    );
    return;
  }

  throw new Error("Tipo no soportado: " + tipo);
}

async function procesarPendientes(data) {
  for (const item of data) {
    try {
      console.log("[RM WORKER] enviando cliente=" + (item.cliente_numero || "—"));
      console.log(
        "[RM WORKER] payload=" + JSON.stringify(leerCargaUtilDesdeFila(item))
      );

      await enviarMensajeProgramado(item);
      await marcarEnviado(item.id);
      console.log("[RM WORKER] enviado OK");
    } catch (err) {
      const msg =
        err?.response?.data != null
          ? JSON.stringify(err.response.data)
          : err?.message || String(err);
      console.log("[RM WORKER ERROR]", msg);
      if (item.id) await marcarError(item.id, msg);
    }
  }
}

async function ejecutarProcesamiento() {
  if (tickEnCurso) return;
  tickEnCurso = true;

  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.log("[RM WORKER] data=");
      console.log(
        "[RM WORKER] error=" +
          JSON.stringify({ mensaje: "Supabase no configurado" })
      );
      return;
    }

    try {
      const { data, now, url } = await buscarPendientesVencidos();
      console.log("[RM WORKER] now=" + now);
      console.log(
        "[RM WORKER] buscando pendientes con " + COL_FECHA + " <= now"
      );
      console.log("[RM WORKER] query url=" + url);
      console.log("[RM WORKER] data=" + JSON.stringify(data));
      console.log("[RM WORKER] error=");
      console.log("[RM WORKER] pendientes encontrados=" + data.length);

      if (data.length > 0) {
        await procesarPendientes(data);
      }
    } catch (err) {
      const error = err.response?.data ?? err.message ?? String(err);
      console.log("[RM WORKER] data=");
      console.log("[RM WORKER] error=" + JSON.stringify(error));
    }
  } finally {
    tickEnCurso = false;
  }
}

function iniciarRemarketingGlobalWorker() {
  if (workerIniciado) return;
  workerIniciado = true;

  const intervaloMs = parseInt(process.env.REMARKETING_POLL_MS || "15000", 10);

  console.log(
    "[RM WORKER] iniciado | poll=" + intervaloMs + "ms | columnas=correr_en,carga_útil_del_mensaje"
  );

  setInterval(() => {
    console.log("[RM WORKER] tick real");
    void ejecutarProcesamiento();
  }, intervaloMs);

  console.log("[RM WORKER] tick real");
  void ejecutarProcesamiento();
}

function startRemarketingGlobalWorker() {
  iniciarRemarketingGlobalWorker();
}

module.exports = {
  iniciarRemarketingGlobalWorker,
  startRemarketingGlobalWorker,
};
