import React, { useEffect, useState } from "react";
import MetaAdsAdIdsField from "./MetaAdsAdIdsField";
import {
  buildMetaAdsFromAdIds,
  emptyMetaAdsValue,
  normalizeMetaAdsForUi,
} from "../../flujos/metaAds";

export default function FlowMetaAdsModal({
  open,
  flow,
  onClose,
  onSave,
  saving = false,
}) {
  const [metaAds, setMetaAds] = useState(emptyMetaAdsValue());

  useEffect(() => {
    if (!open || !flow) return;
    setMetaAds(normalizeMetaAdsForUi(flow.meta?.meta_ads));
  }, [open, flow]);

  if (!open || !flow) return null;

  async function handleSave() {
    const payload = buildMetaAdsFromAdIds(metaAds.ad_ids);
    await onSave?.(flow.id, payload);
  }

  return (
    <div className="flModalOverlay" onClick={onClose} role="presentation">
      <div
        className="flModal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="fl-meta-ads-modal-title"
      >
        <h2 id="fl-meta-ads-modal-title">IDs de anuncios de Meta</h2>
        <p className="sub">
          Opcional. Asocia uno o varios anuncios de Meta a este flujo. Todavía no
          afecta el enrutamiento.
        </p>
        <p className="flCountryFlowName">{flow.nombre}</p>
        <MetaAdsAdIdsField
          id={`flow-meta-ads-edit-${flow.id}`}
          value={metaAds}
          onChange={setMetaAds}
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
