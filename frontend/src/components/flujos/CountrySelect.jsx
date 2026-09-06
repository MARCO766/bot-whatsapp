import React, { useMemo, useState } from "react";
import {
  COUNTRY_MODE_ALL,
  FLOW_COUNTRIES,
  buildCountryFromSelection,
  countrySelectValue,
  formatCountryLabel,
  normalizeCountryForUi,
} from "../../flujos/countries";

/**
 * Selector reutilizable: Todos los países + catálogo mundial.
 * El prefijo se deriva del país; no es editable a mano.
 */
export default function CountrySelect({
  value,
  onChange,
  id = "flow-country-select",
  disabled = false,
  showPrefix = true,
  className = "",
}) {
  const country = normalizeCountryForUi(value);
  const selectValue = countrySelectValue(country);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? FLOW_COUNTRIES
      : FLOW_COUNTRIES.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.code.toLowerCase().includes(q) ||
            c.prefix.includes(q) ||
            c.prefix.replace("+", "").includes(q)
        );
    if (selectValue === COUNTRY_MODE_ALL) return base;
    if (base.some((c) => c.code === selectValue)) return base;
    const selected = FLOW_COUNTRIES.find((c) => c.code === selectValue);
    return selected ? [selected, ...base] : base;
  }, [query, selectValue]);

  function handleSelectChange(e) {
    const next = buildCountryFromSelection(e.target.value);
    if (next) onChange?.(next);
  }

  return (
    <div className={`flCountrySelect ${className}`.trim()}>
      <label className="flCountryLabel" htmlFor={id}>
        País donde quieres vender
      </label>
      <input
        type="search"
        className="flInput flCountrySearch"
        placeholder="Buscar país…"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Buscar país"
      />
      <select
        id={id}
        className="flInput flCountryDropdown"
        value={selectValue}
        disabled={disabled}
        onChange={handleSelectChange}
      >
        <option value={COUNTRY_MODE_ALL}>🌎 Todos los países</option>
        {filtered.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.name} ({c.prefix})
          </option>
        ))}
      </select>
      {showPrefix && (
        <div className="flCountryPrefixRow" aria-live="polite">
          <span className="flCountryPrefixLabel">Prefijo telefónico</span>
          <span className="flCountryPrefixValue">
            {country.mode === COUNTRY_MODE_ALL || !country.prefix
              ? "—"
              : country.prefix}
          </span>
        </div>
      )}
      <p className="flCountryHint">{formatCountryLabel(country)}</p>
    </div>
  );
}
