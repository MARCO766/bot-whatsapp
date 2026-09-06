import countriesData from "./countries.json";

export const COUNTRY_MODE_ALL = "all";
export const COUNTRY_MODE_SPECIFIC = "specific";

export const COUNTRY_ALL = {
  mode: COUNTRY_MODE_ALL,
  name: null,
  code: null,
  prefix: null,
};

/** ISO → emoji bandera (regional indicators). */
export function flagFromCode(code) {
  const c = String(code || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "🏳️";
  return Array.from(c)
    .map((ch) => String.fromCodePoint(0x1f1e6 - 65 + ch.charCodeAt(0)))
    .join("");
}

export const FLOW_COUNTRIES = (Array.isArray(countriesData) ? countriesData : []).map((row) => ({
  code: String(row.code || "").toUpperCase(),
  name: String(row.name || "").trim(),
  prefix: String(row.prefix || "").trim(),
  flag: flagFromCode(row.code),
}));

const BY_CODE = Object.fromEntries(FLOW_COUNTRIES.map((c) => [c.code, c]));

export function findCountryByCode(code) {
  const key = String(code || "")
    .trim()
    .toUpperCase();
  return BY_CODE[key] || null;
}

export function countryAllValue() {
  return { ...COUNTRY_ALL };
}

/**
 * Normaliza selección UI → payload macbot_meta.country
 * value: "all" | ISO code
 */
export function buildCountryFromSelection(value) {
  if (value == null || value === "" || value === COUNTRY_MODE_ALL || value === "__all__") {
    return countryAllValue();
  }
  const found = findCountryByCode(value);
  if (!found || !found.prefix) return null;
  return {
    mode: COUNTRY_MODE_SPECIFIC,
    name: found.name,
    code: found.code,
    prefix: found.prefix,
  };
}

/** Lee meta.country (legacy sin country → Todos). */
export function normalizeCountryForUi(raw) {
  if (!raw || typeof raw !== "object") return countryAllValue();
  if (raw.mode === COUNTRY_MODE_ALL) return countryAllValue();
  if (raw.mode === COUNTRY_MODE_SPECIFIC || raw.code) {
    const found = findCountryByCode(raw.code);
    if (found) {
      return {
        mode: COUNTRY_MODE_SPECIFIC,
        name: found.name,
        code: found.code,
        prefix: found.prefix,
      };
    }
    if (raw.code && raw.prefix && raw.name) {
      const prefix = String(raw.prefix).startsWith("+")
        ? String(raw.prefix)
        : `+${String(raw.prefix).replace(/^\+/, "")}`;
      return {
        mode: COUNTRY_MODE_SPECIFIC,
        name: String(raw.name),
        code: String(raw.code).toUpperCase(),
        prefix,
      };
    }
  }
  return countryAllValue();
}

export function countrySelectValue(country) {
  const c = normalizeCountryForUi(country);
  return c.mode === COUNTRY_MODE_SPECIFIC && c.code ? c.code : COUNTRY_MODE_ALL;
}

export function formatCountryLabel(country) {
  const c = normalizeCountryForUi(country);
  if (c.mode !== COUNTRY_MODE_SPECIFIC || !c.code) {
    return "🌎 Todos los países";
  }
  const flag = flagFromCode(c.code);
  return `${flag} ${c.name}${c.prefix ? ` (${c.prefix})` : ""}`;
}
