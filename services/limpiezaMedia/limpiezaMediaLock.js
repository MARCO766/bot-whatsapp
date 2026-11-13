/**
 * Candado global de la limpieza de multimedia.
 * Una sola fila en limpieza_media_lock. No borra objetos ni otras tablas.
 */
const os = require("os");
const axios = require("axios");
const { isSchemaMissingError } = require("../supabaseSafe");

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
    ahora: opciones.ahora || new Date(),
    ttlMs: opciones.ttlMs || TTL_MS,
  };
}

function vencimiento(ahora, ttlMs) {
  return new Date(ahora.getTime() + ttlMs).toISOString();
}

function urlTabla(url, filtro) {
  return `${url}/rest/v1/${TABLA}?${filtro}`;
}

function filtroDuenoVigente(workerId, nowIso) {
  return (
    `id=eq.${LOCK_ID}` +
    `&locked_by=eq.${encodeURIComponent(workerId)}` +
    `&locked_until=gt.${encodeURIComponent(nowIso)}`
  );
}

function liberacionAplicada(fila, ahora) {
  if (!fila || fila.locked_by != null) return false;
  const hasta = Date.parse(fila.locked_until);
  return Number.isFinite(hasta) && hasta <= ahora.getTime();
}

async function adquirirLockLimpiezaMedia(opciones = {}) {
  const { cliente, url, key, ahora, ttlMs } = contexto(opciones);
  if (!url || !key) return { acquired: false, motivo: "sin_supabase" };

  try {
    await cliente.get(urlTabla(url, `id=eq.${LOCK_ID}&select=id&limit=1`), {
      headers: headers(key),
      timeout: 20000,
    });
  } catch (error) {
    if (isSchemaMissingError(error)) {
      return { acquired: false, motivo: "lock_tabla_ausente" };
    }
    return { acquired: false, motivo: "lock_verificacion_fallida" };
  }

  const workerId = opciones.workerId || idEjecucion();
  const nowIso = ahora.toISOString();
  const untilIso = vencimiento(ahora, ttlMs);
  const body = {
    locked_until: untilIso,
    locked_by: workerId,
    updated_at: nowIso,
  };
  const prefer = headers(key, { Prefer: "return=representation" });

  try {
    const patch = await cliente.patch(
      urlTabla(
        url,
        `id=eq.${LOCK_ID}&or=(locked_until.is.null,locked_until.lte.${encodeURIComponent(nowIso)})`
      ),
      body,
      { headers: prefer, timeout: 20000 }
    );
    const filas = Array.isArray(patch.data) ? patch.data : [];
    if (filas.length && filas[0].locked_by === workerId) {
      return { acquired: true, workerId, until: untilIso };
    }
  } catch (error) {
    if (isSchemaMissingError(error)) {
      return { acquired: false, motivo: "lock_tabla_ausente" };
    }
    return { acquired: false, motivo: "lock_adquisicion_fallida" };
  }

  try {
    const insert = await cliente.post(urlTabla(url, "select=id,locked_by"), { id: LOCK_ID, ...body }, {
      headers: prefer,
      timeout: 20000,
    });
    const filas = Array.isArray(insert.data) ? insert.data : [];
    if (filas.length && filas[0].locked_by === workerId) {
      return { acquired: true, workerId, until: untilIso, via: "insert" };
    }
    return { acquired: false, motivo: "candado_ocupado" };
  } catch (error) {
    if (isSchemaMissingError(error)) {
      return { acquired: false, motivo: "lock_tabla_ausente" };
    }
    const status = error.response?.status;
    if (status === 409 || String(error.response?.data?.code || "") === "23505") {
      return { acquired: false, motivo: "candado_ocupado" };
    }
    return { acquired: false, motivo: "lock_adquisicion_fallida" };
  }
}

async function renovarLockLimpiezaMedia(workerId, opciones = {}) {
  const { cliente, url, key, ahora, ttlMs } = contexto(opciones);
  if (!workerId || !url || !key) return { ok: false, motivo: "renovacion_fallida" };
  const nowIso = ahora.toISOString();
  const untilIso = vencimiento(ahora, ttlMs);
  try {
    const patch = await cliente.patch(
      urlTabla(url, filtroDuenoVigente(workerId, nowIso)),
      { locked_until: untilIso, updated_at: nowIso },
      { headers: headers(key, { Prefer: "return=representation" }), timeout: 20000 }
    );
    const filas = Array.isArray(patch.data) ? patch.data : [];
    const hasta = Date.parse(filas[0]?.locked_until);
    if (!filas.length || filas[0].locked_by !== workerId || !Number.isFinite(hasta) || hasta <= ahora.getTime()) {
      return { ok: false, motivo: "candado_perdido" };
    }
    return { ok: true, until: untilIso };
  } catch (error) {
    if (isSchemaMissingError(error)) return { ok: false, motivo: "lock_tabla_ausente" };
    return { ok: false, motivo: "renovacion_fallida" };
  }
}

async function liberarLockLimpiezaMedia(workerId, opciones = {}) {
  const { cliente, url, key, ahora } = contexto(opciones);
  if (!workerId || !url || !key) return { ok: false, motivo: "liberacion_omitida" };
  const nowIso = ahora.toISOString();
  try {
    const patch = await cliente.patch(
      urlTabla(url, `id=eq.${LOCK_ID}&locked_by=eq.${encodeURIComponent(workerId)}`),
      { locked_by: null, locked_until: nowIso, updated_at: nowIso },
      { headers: headers(key, { Prefer: "return=representation" }), timeout: 20000 }
    );
    const filas = Array.isArray(patch.data) ? patch.data : [];
    if (!filas.length || !liberacionAplicada(filas[0], ahora)) {
      return { ok: false, motivo: "candado_ajeno" };
    }
    return { ok: true };
  } catch (error) {
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
};
