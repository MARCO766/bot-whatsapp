import React from "react";
import { IMPORT_TEMPLATES } from "../../flujos/constants";

export default function ImportFlowModal({ open, onClose, onImport }) {
  if (!open) return null;

  return (
    <div className="flModalOverlay" onClick={onClose} role="presentation">
      <div className="flModal" onClick={(e) => e.stopPropagation()} role="dialog">
        <h2>Importar flujo</h2>
        <p className="sub">Elige una plantilla base. Se creará un flujo nuevo sin afectar los existentes.</p>
        <div className="flTemplateGrid">
          {IMPORT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="flTemplateCard"
              onClick={() => onImport(tpl.id)}
            >
              <span style={{ fontSize: "1.6rem" }}>{tpl.icon}</span>
              <div>
                <strong style={{ color: "#e2e8f0", display: "block", marginBottom: 4 }}>
                  {tpl.title}
                </strong>
                <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{tpl.desc}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="flModalActions">
          <button type="button" className="flBtn flBtnGhost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
