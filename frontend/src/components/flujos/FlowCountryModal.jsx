import React, { useEffect, useState } from "react";
import CountrySelect from "./CountrySelect";
import {
  countryAllValue,
  normalizeCountryForUi,
} from "../../flujos/countries";

export default function FlowCountryModal({
  open,
  flow,
  onClose,
  onSave,
  saving = false,
}) {
  const [country, setCountry] = useState(countryAllValue());

  useEffect(() => {
    if (!open || !flow) return;
    setCountry(normalizeCountryForUi(flow.meta?.country));
  }, [open, flow]);

  if (!open || !flow) return null;

  async function handleSave() {
    await onSave?.(flow.id, country);
  }

  return (
    <div className="flModalOverlay" onClick={onClose} role="presentation">
      <div
        className="flModal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="fl-country-modal-title"
      >
        <h2 id="fl-country-modal-title">País de venta</h2>
        <p className="sub">
          Define dónde se vende con este flujo. El prefijo se completa solo al
          elegir el país.
        </p>
        <p className="flCountryFlowName">{flow.nombre}</p>
        <CountrySelect
          id={`flow-country-edit-${flow.id}`}
          value={country}
          onChange={setCountry}
          disabled={saving}
        />
        <div className="flModalActions">
          <button
            type="button"
            className="flBtn flBtnGhost"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="flBtn flBtnPrimary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
