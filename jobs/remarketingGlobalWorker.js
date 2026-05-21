/**
 * Worker Remarketing Global — mínimo: leer pendientes por correr_en, enviar R1, marcar enviado.
 * Columnas reales: correr_en, carga_útil_del_mensaje (no mensaje_payload / run_at).
 */
const axios = require("axios");
const { enviarTextoWhatsApp } = require("../services/whatsappService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const TABLA = "remarketing_global_programados";

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

/** carga_útil_del_mensaje (jsonb) — sin usar mensaje_payload */
function leerCargaUtilDelMensaje(item) {
  const raw =
    item["carga_útil_del_mensaje"] ??
    item.carga_util_del_mensaje ??
    item.carga_util ??
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

function extraerTextoParaEnviar(item) {
  const carga = leerCargaUtilDelMensaje(item);
  const texto = String(carga.texto || carga.text || carga.mensaje || "").trim();
  return texto;
}

/**
 * PostgREST equivalente a:
 * .from('remarketing_global_programados')
 * .select('*')
 * .eq('estado', 'pendiente')
 * .lte('correr_en', now)
 */
async function buscarPendientesVencidos() {
  const now = new Date().toISOString();
  const url =
    `${SUPABASE_URL}/rest/v1/${TABLA}` +
    `?select=*` +
    `&estado=eq.pendiente` +
    `&correr_en=lte.${encodeURIComponent(now)}` +
    `&order=correr_en.asc` +
    `&limit=40`;

  const response = await axios.get(url, { headers: supabaseHeaders() });
  return { data: response.data || [], error: null, now, url };
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
  await axios.patch(
    `${SUPABASE_URL}/rest/v1/${TABLA}?id=eq.${id}`,
    {
      estado: "error",
      error_detalle: String(mensaje || "error").slice(0, 500),
      actualizado_en: ahora,
    },
    { headers: supabaseHeaders({ Prefer: "return=minimal" }) }
  );
}

async function procesarPendientes(data) {
  for (const item of data) {
    const id = item.id;
    const numero = item.cliente_numero;

    try {
      const texto = extraerTextoParaEnviar(item);
      if (!texto) {
        throw new Error("Texto vacío en carga_útil_del_mensaje");
      }

      console.log("[RM WORKER] enviando cliente=" + (numero || "—"));
      console.log(
        "[RM WORKER] payload=" +
          JSON.stringify(leerCargaUtilDelMensaje(item))
      );

      await enviarTextoWhatsApp(numero, texto, {
        usuarioId: item.usuario_id,
      });

      await marcarEnviado(id);
      console.log("[RM WORKER] enviado OK");
    } catch (err) {
      const msg =
        err?.response?.data != null
          ? JSON.stringify(err.response.data)
          : err?.message || String(err);
      console.log("[RM WORKER ERROR]", msg);
      if (id) {
        try {
          await marcarError(id, msg);
        } catch (patchErr) {
          console.log(
            "[RM WORKER ERROR] no se pudo marcar error en DB:",
            patchErr.response?.data || patchErr.message
          );
        }
      }
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
          JSON.stringify({ mensaje: "SUPABASE_URL o SUPABASE_SECRET_KEY vacíos" })
      );
      return;
    }

    let data = [];
    let error = null;

    try {
      const resultado = await buscarPendientesVencidos();
      data = resultado.data;
      console.log("[RM WORKER] now=" + resultado.now);
      console.log("[RM WORKER] query url=" + resultado.url);
      console.log("[RM WORKER] data=" + JSON.stringify(data));
      console.log("[RM WORKER] error=");
    } catch (err) {
      error = err.response?.data ?? err.message ?? String(err);
      console.log("[RM WORKER] data=");
      console.log("[RM WORKER] error=" + JSON.stringify(error));
      return;
    }

    console.log("[RM WORKER] pendientes encontrados=" + data.length);

    if (data.length > 0) {
      await procesarPendientes(data);
    }
  } finally {
    tickEnCurso = false;
  }
}

function iniciarRemarketingGlobalWorker() {
  if (workerIniciado) {
    console.log("[RM WORKER] ya estaba iniciado (skip duplicado)");
    return;
  }
  workerIniciado = true;

  const intervaloMs = parseInt(
    process.env.REMARKETING_POLL_MS || "15000",
    10
  );

  console.log(
    "[RM WORKER] iniciado | tabla=" +
      TABLA +
      " | poll=" +
      intervaloMs +
      "ms | supabase=" +
      (SUPABASE_URL ? "OK" : "FALTA")
  );

  setInterval(() => {
    console.log("[RM WORKER] tick real");
    void ejecutarProcesamiento();
  }, intervaloMs);

  console.log("[RM WORKER] tick real");
  void ejecutarProcesamiento();
}

/** Alias histórico */
function startRemarketingGlobalWorker() {
  iniciarRemarketingGlobalWorker();
}

module.exports = {
  iniciarRemarketingGlobalWorker,
  startRemarketingGlobalWorker,
};
