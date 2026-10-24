/**
 * Exclusión por conversación (usuario + número + conexión WhatsApp).
 *
 * ALCANCE REAL: UNA SOLA INSTANCIA Node.js / un solo proceso.
 * NO es un lock distribuido. Varias réplicas (Render, PM2 cluster, etc.)
 * NO se coordinan entre sí con este módulo.
 */

const tails = new Map();
const holders = new Map();

function buildConversacionLockKey({
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
}) {
  const u = String(usuarioId || "").trim();
  const n = String(clienteNumero || "").trim();
  const c =
    conexionWhatsappId != null && String(conexionWhatsappId).trim() !== ""
      ? String(conexionWhatsappId).trim()
      : "";
  return `${u}|${n}|${c}`;
}

function makeToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Encola y adquiere el lock de conversación en este proceso.
 * @returns {Promise<{ key: string, token: string, singleProcessOnly: true, sigueSiendoTitular: function, release: function }>}
 */
async function acquireConversacionLock(parts = {}) {
  const key = buildConversacionLockKey(parts);
  if (!String(parts.usuarioId || "").trim() || !String(parts.clienteNumero || "").trim()) {
    return {
      key,
      token: null,
      singleProcessOnly: true,
      skipped: true,
      sigueSiendoTitular: () => true,
      release: () => {},
    };
  }

  const prev = tails.get(key) || Promise.resolve();
  let releaseNext = () => {};
  const gate = new Promise((resolve) => {
    releaseNext = resolve;
  });
  tails.set(
    key,
    prev.then(
      () => gate,
      () => gate
    )
  );

  await prev;

  const token = makeToken();
  holders.set(key, token);

  return {
    key,
    token,
    singleProcessOnly: true,
    skipped: false,
    sigueSiendoTitular: () => holders.get(key) === token,
    release: () => {
      if (holders.get(key) === token) {
        holders.delete(key);
      }
      releaseNext();
    },
  };
}

/** Test helper: limpia estado in-memory. */
function _resetConversacionLocksForTests() {
  tails.clear();
  holders.clear();
}

module.exports = {
  buildConversacionLockKey,
  acquireConversacionLock,
  _resetConversacionLocksForTests,
};
