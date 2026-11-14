/**
 * Candado global de la limpieza de multimedia.
 * La vigencia la decide PostgreSQL con clock_timestamp() dentro de las
 * funciones limpieza_media_adquirir, renovar, verificar y liberar.
 * El cliente no envía ni interpreta la hora. No borra objetos ni otras tablas.
 *
 * Este candado solo impide dos recorridos a la vez. No protege un mensaje
 * entrante: esa coordinación es por conversación y por objeto, en
 * limpiezaMediaValla.js, y es la que se mantiene durante el DELETE de Storage.
 */
const os = require("os");
const axios = require("axios");
const { clasificarErrorPostgrest } = require("../supabaseSafe");

const TABLA = "limpieza_media_lock";
const LOCK_ID = "global";
const TTL_MS = 30 * 60 * 1000;
const RENOVACION_MS = 60 * 1000;

function headers(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function idEjecucion() {
  const host = os.hostname().replace(/[^a-zA-Z0-9]/g, "") || "host";
  return `limpieza-${host}-${process.pid}-${Date.now()}`;
}

function contexto(opciones = {}) {
  return {
    cliente: opciones.cliente || axios,
    url: opciones.url || process.env.SUPABASE_URL,
    key: opciones.key || process.env.SUPABASE_SECRET_KEY,
    ttlMs: opciones.ttlMs || TTL_MS,
  };
}

function filaRpc(data) {
  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila || typeof fila !== "object") return null;
  return fila;
}

function tieneRelojPostgres(fila) {
  return Number.isFinite(Date.parse(fila?.ahora));
}

async function llamarRpc(cliente, url, key, nombre, body) {
  return cliente.post(`${url}/rest/v1/rpc/${nombre}`, body, {
    headers: headers(key),
    timeout: 20000,
  });
}

function motivoEsquemaLock(error, alterno) {
  const tipo = clasificarErrorPostgrest(error);
  if (tipo === "funcion_ausente" || tipo === "tabla_ausente" || tipo === "columna_ausente") {
    return "lock_tabla_ausente";
  }
  return alterno;
}

async function adquirirLockLimpiezaMedia(opciones = {}) {
  const { cliente, url, key, ttlMs } = contexto(opciones);
  if (!url || !key) return { acquired: false, motivo: "sin_supabase" };
  const workerId = opciones.workerId || idEjecucion();
  try {
    const res = await llamarRpc(cliente, url, key, "limpieza_media_adquirir", {
      p_worker: workerId,
      p_ttl_seconds: Math.floor(ttlMs / 1000),
    });
    const fila = filaRpc(res?.data);
    if (!tieneRelojPostgres(fila)) return { acquired: false, motivo: "reloj_postgres_ausente" };
    if (fila.ok === true && fila.locked_by === workerId) {
      return { acquired: true, workerId, until: fila.locked_until, ahora: fila.ahora };
    }
    return { acquired: false, motivo: fila.motivo || "candado_ocupado", ahora: fila.ahora };
  } catch (error) {
    if (motivoEsquemaLock(error, "") === "lock_tabla_ausente") return { acquired: false, motivo: "lock_tabla_ausente" };
    return { acquired: false, motivo: "lock_adquisicion_fallida" };
  }
}

async function renovarLockLimpiezaMedia(workerId, opciones = {}) {
  const { cliente, url, key, ttlMs } = contexto(opciones);
  if (!workerId || !url || !key) return { ok: false, motivo: "renovacion_fallida" };
  try {
    const res = await llamarRpc(cliente, url, key, "limpieza_media_renovar", {
      p_worker: workerId,
      p_ttl_seconds: Math.floor(ttlMs / 1000),
    });
    const fila = filaRpc(res?.data);
    if (!tieneRelojPostgres(fila)) return { ok: false, motivo: "reloj_postgres_ausente" };
    if (fila.ok === true && fila.locked_by === workerId) {
      return { ok: true, until: fila.locked_until, ahora: fila.ahora };
    }
    return { ok: false, motivo: fila.motivo || "candado_perdido", ahora: fila.ahora };
  } catch (error) {
    if (motivoEsquemaLock(error, "") === "lock_tabla_ausente") return { ok: false, motivo: "lock_tabla_ausente" };
    return { ok: false, motivo: "renovacion_fallida" };
  }
}

async function verificarLockLimpiezaMedia(workerId, opciones = {}) {
  const { cliente, url, key } = contexto(opciones);
  if (!workerId || !url || !key) return { ok: false, motivo: "candado_perdido" };
  try {
    const res = await llamarRpc(cliente, url, key, "limpieza_media_verificar", {
      p_worker: workerId,
    });
    const fila = filaRpc(res?.data);
    if (!tieneRelojPostgres(fila)) return { ok: false, motivo: "reloj_postgres_ausente" };
    if (fila.ok === true && fila.locked_by === workerId) {
      return { ok: true, until: fila.locked_until, ahora: fila.ahora };
    }
    return { ok: false, motivo: fila.motivo || "candado_perdido", ahora: fila.ahora };
  } catch (error) {
    if (motivoEsquemaLock(error, "") === "lock_tabla_ausente") return { ok: false, motivo: "lock_tabla_ausente" };
    return { ok: false, motivo: "candado_perdido" };
  }
}

async function liberarLockLimpiezaMedia(workerId, opciones = {}) {
  const { cliente, url, key } = contexto(opciones);
  if (!workerId || !url || !key) return { ok: false, motivo: "liberacion_omitida" };
  try {
    const res = await llamarRpc(cliente, url, key, "limpieza_media_liberar", {
      p_worker: workerId,
    });
    const fila = filaRpc(res?.data);
    if (!tieneRelojPostgres(fila)) return { ok: false, motivo: "reloj_postgres_ausente" };
    if (fila.ok === true && fila.locked_by == null) return { ok: true, ahora: fila.ahora };
    return { ok: false, motivo: fila.motivo || "candado_ajeno", ahora: fila.ahora };
  } catch (error) {
    if (motivoEsquemaLock(error, "") === "lock_tabla_ausente") return { ok: false, motivo: "lock_tabla_ausente" };
    return { ok: false, motivo: "liberacion_fallida" };
  }
}

module.exports = {
  LOCK_ID,
  RENOVACION_MS,
  TABLA,
  TTL_MS,
  adquirirLockLimpiezaMedia,
  liberarLockLimpiezaMedia,
  renovarLockLimpiezaMedia,
  verificarLockLimpiezaMedia,
};
