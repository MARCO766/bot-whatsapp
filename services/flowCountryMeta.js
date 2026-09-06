/**
 * País de venta del flujo (macbot_meta.country).
 * Solo persistencia / validación — no afecta routing de mensajes.
 */
const path = require("path");

let COUNTRIES = [];
try {
  COUNTRIES = require("../frontend/src/flujos/countries.json");
} catch (err) {
  console.log(
    "[flowCountryMeta] no se pudo cargar countries.json:",
    err?.message || err
  );
  COUNTRIES = [];
}

const MODE_ALL = "all";
const MODE_SPECIFIC = "specific";

const ALL_VALUE = Object.freeze({
  mode: MODE_ALL,
  name: null,
  code: null,
  prefix: null,
});

const BY_CODE = Object.create(null);
for (const row of COUNTRIES) {
  const code = String(row?.code || "")
    .trim()
    .toUpperCase();
  if (!code) continue;
  BY_CODE[code] = {
    code,
    name: String(row.name || "").trim(),
    prefix: String(row.prefix || "").trim(),
  };
}

function countryAll() {
  return { ...ALL_VALUE };
}

function findByCode(code) {
  const key = String(code || "")
    .trim()
    .toUpperCase();
  return BY_CODE[key] || null;
}

function normalizePrefix(prefix) {
  const raw = String(prefix || "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  return `+${digits}`;
}

/**
 * Lectura para API/listado. Ausente → Todos los países (compat legacy).
 */
function normalizeCountryForRead(raw) {
  if (raw == null || typeof raw !== "object") return countryAll();
  if (raw.mode === MODE_ALL) return countryAll();

  if (raw.mode === MODE_SPECIFIC || raw.code) {
    const found = findByCode(raw.code);
    if (found && found.prefix) {
      return {
        mode: MODE_SPECIFIC,
        name: found.name,
        code: found.code,
        prefix: found.prefix,
      };
    }
    const prefix = normalizePrefix(raw.prefix);
    const code = String(raw.code || "")
      .trim()
      .toUpperCase();
    const name = String(raw.name || "").trim();
    if (code && name && prefix) {
      return { mode: MODE_SPECIFIC, name, code, prefix };
    }
  }
  return countryAll();
}

/**
 * Validación de escritura (create / PATCH).
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
function normalizeCountryForWrite(raw) {
  if (raw == null || raw === "" || raw === MODE_ALL) {
    return { ok: true, value: countryAll() };
  }
  if (typeof raw !== "object") {
    return { ok: false, error: "País de venta inválido" };
  }
  if (raw.mode === MODE_ALL || (!raw.mode && !raw.code)) {
    return { ok: true, value: countryAll() };
  }

  const code = String(raw.code || "")
    .trim()
    .toUpperCase();
  if (!code) {
    return { ok: false, error: "Selecciona un país válido" };
  }

  const found = findByCode(code);
  if (!found || !found.prefix) {
    return { ok: false, error: "País no reconocido en el catálogo" };
  }

  // Prefijo siempre desde catálogo (nunca texto libre del cliente).
  return {
    ok: true,
    value: {
      mode: MODE_SPECIFIC,
      name: found.name,
      code: found.code,
      prefix: found.prefix,
    },
  };
}

/** ¿Hay country persistido en meta cruda? (sin inventar default) */
function hasPersistedCountry(rawMeta) {
  return Boolean(
    rawMeta &&
      typeof rawMeta === "object" &&
      rawMeta.country &&
      typeof rawMeta.country === "object"
  );
}

module.exports = {
  MODE_ALL,
  MODE_SPECIFIC,
  COUNTRIES,
  countryAll,
  findByCode,
  normalizeCountryForRead,
  normalizeCountryForWrite,
  hasPersistedCountry,
  // path hint for debugging
  catalogPath: path.join(__dirname, "../frontend/src/flujos/countries.json"),
};
