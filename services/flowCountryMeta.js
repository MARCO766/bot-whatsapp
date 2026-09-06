/**
 * País de venta del flujo (macbot_meta.country).
 * Persistencia / validación + helper de compatibilidad número↔país.
 * El helper NO está cableado al runtime de mensajes (FASE 2.1).
 *
 * Fuente única: data/flow-countries.json (incluida en la imagen Docker).
 *
 * Prefijos compartidos (p. ej. +1 NANP, +590): con solo el número E.164
 * no se puede afirmar un país concreto sin tablas adicionales.
 * En ese caso isContactCompatibleWithFlowCountry → false (no inventar).
 */
const path = require("path");
const fs = require("fs");

const CATALOG_PATH = path.join(__dirname, "..", "data", "flow-countries.json");

let COUNTRIES = [];
try {
  const raw = fs.readFileSync(CATALOG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  COUNTRIES = Array.isArray(parsed) ? parsed : [];
} catch (err) {
  console.log(
    "[flowCountryMeta] no se pudo cargar data/flow-countries.json:",
    err?.message || err
  );
  COUNTRIES = [];
}

if (!COUNTRIES.length) {
  console.log(
    "[flowCountryMeta] catálogo vacío — países específicos fallarán hasta que exista data/flow-countries.json"
  );
} else {
  console.log(`[flowCountryMeta] catálogo cargado: ${COUNTRIES.length} países (${CATALOG_PATH})`);
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
/** @type {Record<string, Array<{ code: string, name: string, prefix: string }>>} */
const BY_PREFIX_DIGITS = Object.create(null);

for (const row of COUNTRIES) {
  const code = String(row?.code || "")
    .trim()
    .toUpperCase();
  if (!code) continue;
  const prefix = String(row.prefix || "").trim();
  const entry = {
    code,
    name: String(row.name || "").trim(),
    prefix,
  };
  BY_CODE[code] = entry;

  const prefixDigits = String(prefix || "").replace(/[^\d]/g, "");
  if (!prefixDigits) continue;
  if (!BY_PREFIX_DIGITS[prefixDigits]) BY_PREFIX_DIGITS[prefixDigits] = [];
  BY_PREFIX_DIGITS[prefixDigits].push(entry);
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

/** Solo dígitos (WhatsApp `message.from` suele venir así; tolera "+"). */
function digitsOnlyPhone(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s.replace(/[^\d]/g, "");
}

/**
 * Prefijo más largo del catálogo que coincide con el inicio del número.
 * Evita falsos positivos (p. ej. 591… no debe matchear Chile +56).
 * @returns {{ prefixDigits: string, entries: Array<{ code: string, name: string, prefix: string }> } | null}
 */
function findLongestCatalogPrefixMatch(numeroDigits) {
  const n = String(numeroDigits || "");
  if (!n) return null;

  let bestDigits = null;
  for (const prefixDigits of Object.keys(BY_PREFIX_DIGITS)) {
    if (!n.startsWith(prefixDigits)) continue;
    if (bestDigits == null || prefixDigits.length > bestDigits.length) {
      bestDigits = prefixDigits;
    }
  }
  if (bestDigits == null) return null;
  return {
    prefixDigits: bestDigits,
    entries: BY_PREFIX_DIGITS[bestDigits] || [],
  };
}

function isSharedDialPrefixDigits(prefixDigits) {
  const entries = BY_PREFIX_DIGITS[String(prefixDigits || "")];
  return Array.isArray(entries) && entries.length > 1;
}

/**
 * ¿El número del contacto es compatible con el country del flujo?
 *
 * Reglas:
 * - mode "all" / country ausente/null / no-objeto → true (legacy)
 * - mode "specific": resuelve prefijo SOLO desde catálogo por `code`
 *   (ignora prefix del cliente); longest-prefix contra el catálogo;
 *   prefijo compartido por varios países → false (no afirmar).
 * - número vacío/malformado / país inexistente → false
 *
 * @param {string|number|null|undefined} contactNumero
 * @param {object|null|undefined} country  macbot_meta.country (normalizado o crudo)
 * @returns {boolean}
 */
function isContactCompatibleWithFlowCountry(contactNumero, country) {
  if (country == null) return true;
  if (typeof country !== "object") return true;
  if (country.mode === MODE_ALL) return true;
  if (country.mode !== MODE_SPECIFIC && !country.code) return true;

  const code = String(country.code || "")
    .trim()
    .toUpperCase();
  if (!code) return false;

  // Prefijo siempre desde catálogo — no confiar en country.prefix del payload.
  const found = findByCode(code);
  if (!found || !found.prefix) return false;

  const countryPrefixDigits = String(found.prefix).replace(/[^\d]/g, "");
  if (!countryPrefixDigits) return false;

  // Prefijo ambiguo en catálogo: no hay forma segura de afirmar país solo con el número.
  if (isSharedDialPrefixDigits(countryPrefixDigits)) {
    return false;
  }

  const numeroDigits = digitsOnlyPhone(contactNumero);
  if (!numeroDigits) return false;

  const match = findLongestCatalogPrefixMatch(numeroDigits);
  if (!match || !match.entries.length) return false;

  // El número pertenece a otro calling code más específico (o distinto).
  if (match.prefixDigits !== countryPrefixDigits) return false;

  // Defensa: tras longest-match, el prefijo del flujo debe ser único.
  if (match.entries.length !== 1) return false;

  return match.entries[0].code === found.code;
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
  digitsOnlyPhone,
  findLongestCatalogPrefixMatch,
  isSharedDialPrefixDigits,
  isContactCompatibleWithFlowCountry,
  catalogPath: CATALOG_PATH,
};
