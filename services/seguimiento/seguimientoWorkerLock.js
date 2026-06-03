const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const LOCK_ID = "global";
const LOCK_TTL_MS = parseInt(process.env.SEGUIMIENTO_WORKER_LOCK_MS || "28000", 10);

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
    msg.includes("seguimiento_worker_lock") ||
    msg.includes("does not exist")
  );
}

/**
 * Adquiere lock global ~28s. Si otro worker tiene lock vigente, devuelve acquired: false.
 */
async function adquirirLockWorkerSeguimiento() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("[WORKER_LOCK_SKIPPED] sin SUPABASE_URL/KEY");
    return { acquired: false, motivo: "sin_supabase" };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const untilIso = new Date(now.getTime() + LOCK_TTL_MS).toISOString();
  const workerId = `node-${process.pid}-${Date.now()}`;
  const body = {
    locked_until: untilIso,
    locked_by: workerId,
    updated_at: nowIso,
  };

  try {
    const patchRes = await axios.patch(
      `${SUPABASE_URL}/rest/v1/seguimiento_worker_lock?id=eq.${LOCK_ID}` +
        `&or=(locked_until.is.null,locked_until.lte.${encodeURIComponent(nowIso)})`,
      body,
      { headers: headers({ Prefer: "return=representation" }) }
    );

    if (patchRes.data?.length) {
      console.log("[WORKER_LOCK_ACQUIRED]", { workerId, until: untilIso, ttl_ms: LOCK_TTL_MS });
      return { acquired: true, workerId, until: untilIso };
    }
  } catch (patchErr) {
    if (esTablaLockAusente(patchErr)) {
      console.warn(
        "[WORKER_LOCK] tabla ausente — ejecuta add_seguimiento_worker_lock.sql; tick sin lock DB"
      );
      return { acquired: true, workerId, until: untilIso, degraded: true };
    }
    console.log("[WORKER_LOCK] patch error:", patchErr.response?.data || patchErr.message);
  }

  try {
    await axios.post(
      `${SUPABASE_URL}/rest/v1/seguimiento_worker_lock`,
      { id: LOCK_ID, ...body },
      { headers: headers({ Prefer: "return=representation" }) }
    );
    console.log("[WORKER_LOCK_ACQUIRED]", { workerId, until: untilIso, via: "insert" });
    return { acquired: true, workerId, until: untilIso };
  } catch (insertErr) {
    if (esTablaLockAusente(insertErr)) {
      console.warn(
        "[WORKER_LOCK] tabla ausente — ejecuta add_seguimiento_worker_lock.sql; tick sin lock DB"
      );
      return { acquired: true, workerId, until: untilIso, degraded: true };
    }
    const status = insertErr.response?.status;
    if (status !== 409 && status !== 23505) {
      console.log("[WORKER_LOCK] insert error:", insertErr.response?.data || insertErr.message);
    }
  }

  console.log("[WORKER_LOCK_SKIPPED]", { motivo: "lock_vigente_otro_worker" });
  return { acquired: false, motivo: "lock_vigente" };
}

async function liberarLockWorkerSeguimiento(workerId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !workerId) return;

  const nowIso = new Date().toISOString();
  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/seguimiento_worker_lock?id=eq.${LOCK_ID}&locked_by=eq.${encodeURIComponent(workerId)}`,
      { locked_until: nowIso, updated_at: nowIso },
      { headers: headers() }
    );
  } catch (err) {
    console.log("[WORKER_LOCK] liberar error:", err.response?.data?.message || err.message);
  }
}

module.exports = {
  adquirirLockWorkerSeguimiento,
  liberarLockWorkerSeguimiento,
  LOCK_TTL_MS,
};
