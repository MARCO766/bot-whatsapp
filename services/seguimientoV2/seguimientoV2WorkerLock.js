const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const TABLA_LOCK = "seguimiento_v2_worker_lock";
const LOCK_ID = "global";
const LOCK_TTL_MS = parseInt(process.env.SEGUIMIENTO_V2_WORKER_LOCK_MS || "28000", 10);

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function esTablaLockAusente(err) {
  const body = err?.response?.data;
  const msg = String(body?.message || err?.message || "");
  return (
    body?.code === "42P01" ||
    msg.includes("seguimiento_v2_worker_lock") ||
    msg.includes("does not exist")
  );
}

async function verificarTablaLockDisponible() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { ok: false, motivo: "sin_supabase" };
  }

  try {
    await axios.get(
      `${SUPABASE_URL}/rest/v1/${TABLA_LOCK}?id=eq.${LOCK_ID}&select=id&limit=1`,
      { headers: headers() }
    );
    return { ok: true };
  } catch (err) {
    if (esTablaLockAusente(err)) {
      return { ok: false, motivo: "lock_tabla_ausente" };
    }
    console.log("[SEG_V2_WORKER_LOCK] verificar tabla error:", err.response?.data || err.message);
    return { ok: false, motivo: "lock_verificacion_fallida" };
  }
}

async function adquirirLockWorkerSeguimientoV2() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("[SEG_V2_WORKER_NO_LOCK_DISABLED]", { motivo: "sin_supabase", pid: process.pid });
    return { acquired: false, motivo: "sin_supabase" };
  }

  const verificacion = await verificarTablaLockDisponible();
  if (!verificacion.ok) {
    console.log("[SEG_V2_WORKER_NO_LOCK_DISABLED]", {
      motivo: verificacion.motivo,
      pid: process.pid,
    });
    return { acquired: false, motivo: verificacion.motivo };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const untilIso = new Date(now.getTime() + LOCK_TTL_MS).toISOString();
  const workerId = `segv2-${process.pid}-${Date.now()}`;
  const body = {
    locked_until: untilIso,
    locked_by: workerId,
    updated_at: nowIso,
  };

  try {
    const patchRes = await axios.patch(
      `${SUPABASE_URL}/rest/v1/${TABLA_LOCK}?id=eq.${LOCK_ID}` +
        `&or=(locked_until.is.null,locked_until.lte.${encodeURIComponent(nowIso)})`,
      body,
      { headers: headers({ Prefer: "return=representation" }) }
    );

    if (patchRes.data?.length) {
      console.log("[SEG_V2_WORKER_LOCK_ACQUIRED]", { workerId, until: untilIso, ttl_ms: LOCK_TTL_MS });
      return { acquired: true, workerId, until: untilIso };
    }
  } catch (patchErr) {
    if (esTablaLockAusente(patchErr)) {
      console.log("[SEG_V2_WORKER_NO_LOCK_DISABLED]", {
        motivo: "lock_tabla_ausente",
        pid: process.pid,
      });
      return { acquired: false, motivo: "lock_tabla_ausente" };
    }
    console.log("[SEG_V2_WORKER_LOCK] patch error:", patchErr.response?.data || patchErr.message);
  }

  try {
    await axios.post(
      `${SUPABASE_URL}/rest/v1/${TABLA_LOCK}`,
      { id: LOCK_ID, ...body },
      { headers: headers({ Prefer: "return=representation" }) }
    );
    console.log("[SEG_V2_WORKER_LOCK_ACQUIRED]", { workerId, until: untilIso, via: "insert" });
    return { acquired: true, workerId, until: untilIso };
  } catch (insertErr) {
    if (esTablaLockAusente(insertErr)) {
      console.log("[SEG_V2_WORKER_NO_LOCK_DISABLED]", {
        motivo: "lock_tabla_ausente",
        pid: process.pid,
      });
      return { acquired: false, motivo: "lock_tabla_ausente" };
    }
    const status = insertErr.response?.status;
    if (status !== 409 && status !== 23505) {
      console.log("[SEG_V2_WORKER_LOCK] insert error:", insertErr.response?.data || insertErr.message);
    }
  }

  console.log("[SEG_V2_WORKER_LOCK_SKIPPED]", { motivo: "lock_vigente_otro_worker" });
  return { acquired: false, motivo: "lock_vigente" };
}

async function liberarLockWorkerSeguimientoV2(workerId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !workerId) return;

  const nowIso = new Date().toISOString();
  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/${TABLA_LOCK}?id=eq.${LOCK_ID}&locked_by=eq.${encodeURIComponent(workerId)}`,
      { locked_until: nowIso, updated_at: nowIso },
      { headers: headers() }
    );
  } catch (err) {
    console.log("[SEG_V2_WORKER_LOCK] liberar error:", err.response?.data?.message || err.message);
  }
}

module.exports = {
  adquirirLockWorkerSeguimientoV2,
  liberarLockWorkerSeguimientoV2,
  verificarTablaLockDisponible,
  LOCK_TTL_MS,
};
