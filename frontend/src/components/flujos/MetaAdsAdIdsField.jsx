import React, { useCallback } from "react";
import {
  buildMetaAdsFromAdIds,
  digitsOnlyAsTyped,
  normalizeMetaAdsForUi,
} from "../../flujos/metaAds";

/**
 * Campo opcional: lista de IDs de anuncios de Meta (solo dígitos, sin duplicados).
 */
export default function MetaAdsAdIdsField({
  value,
  onChange,
  id = "flow-meta-ads",
  disabled = false,
  className = "",
}) {
  const metaAds = normalizeMetaAdsForUi(value);
  // Filas editables: si hay IDs, mostrarlos; si no, lista vacía (solo botón agregar).
  const rows = Array.isArray(value?.ad_ids) ? value.ad_ids.map((x) => String(x ?? "")) : metaAds.ad_ids;

  const emit = useCallback(
    (nextRows) => {
      onChange?.(buildMetaAdsFromAdIds(nextRows));
    },
    [onChange]
  );

  function handleRowChange(index, raw) {
    const digits = digitsOnlyAsTyped(raw);
    const next = rows.slice();
    next[index] = digits;
    // Mientras edita, conservar filas (incluso vacías) para no saltar el foco;
    // al emitir payload limpio solo en blur / add / remove de completos.
    onChange?.({ ad_ids: next });
  }

  function handleRowBlur(index) {
    const cleaned = rows.map((r) => digitsOnlyAsTyped(r).trim()).filter(Boolean);
    // Dedupe al salir del campo
    const seen = new Set();
    const unique = [];
    for (const idVal of cleaned) {
      if (!/^\d+$/.test(idVal)) continue;
      if (seen.has(idVal)) continue;
      seen.add(idVal);
      unique.push(idVal);
    }
    onChange?.({ ad_ids: unique });
  }

  function handleRemove(index) {
    const next = rows.filter((_, i) => i !== index);
    emit(next);
  }

  function handleAdd() {
    // Commit actuales limpios + fila vacía nueva
    const cleaned = buildMetaAdsFromAdIds(rows).ad_ids;
    onChange?.({ ad_ids: [...cleaned, ""] });
  }

  return (
    <div className={`flMetaAdsField ${className}`.trim()}>
      <label className="flCountryLabel" htmlFor={`${id}-add`}>
        IDs de anuncios de Meta (opcional)
      </label>
      <p className="flMetaAdsHint">
        Solo dígitos. Puedes dejarlo vacío. No se valida contra Meta todavía.
      </p>
      <ul className="flMetaAdsList" aria-label="IDs de anuncios de Meta">
        {rows.map((row, index) => (
          <li key={`${id}-row-${index}`} className="flMetaAdsRow">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              className="flInput flMetaAdsInput"
              placeholder="ID de anuncio"
              value={row}
              disabled={disabled}
              aria-label={`ID de anuncio ${index + 1}`}
              onChange={(e) => handleRowChange(index, e.target.value)}
              onBlur={() => handleRowBlur(index)}
            />
            <button
              type="button"
              className="flMetaAdsRemove"
              disabled={disabled}
              title="Eliminar"
              aria-label={`Eliminar ID de anuncio ${index + 1}`}
              onClick={() => handleRemove(index)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        id={`${id}-add`}
        className="flBtn flBtnGhost flMetaAdsAdd"
        disabled={disabled}
        onClick={handleAdd}
      >
        + Agregar otro anuncio
      </button>
    </div>
  );
}
