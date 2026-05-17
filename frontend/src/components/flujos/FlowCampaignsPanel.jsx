import React from "react";
import { CAMPAIGN_TYPES } from "../../flujos/constants";

export default function FlowCampaignsPanel({ campanas = [], onToggle, readOnly }) {
  const active = new Set(campanas.map((c) => (typeof c === "string" ? c : c.id)));

  if (!campanas.length && readOnly) {
    return (
      <div className="flCampaigns">
        <span className="flCampTag empty">Sin campañas vinculadas</span>
      </div>
    );
  }

  return (
    <div className="flCampaigns">
      {CAMPAIGN_TYPES.map((c) => {
        const on = active.has(c.id);
        if (readOnly && !on) return null;
        return (
          <button
            key={c.id}
            type="button"
            className={`flCampTag ${on ? "" : "empty"}`}
            onClick={() => !readOnly && onToggle?.(c.id)}
            disabled={readOnly}
            title={readOnly ? "Próximamente: sync con backend" : c.label}
          >
            {c.icon} {c.label}
          </button>
        );
      })}
    </div>
  );
}
