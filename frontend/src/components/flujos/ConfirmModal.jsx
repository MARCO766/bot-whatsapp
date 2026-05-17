import React from "react";

export default function ConfirmModal({ open, title, message, confirmLabel, danger, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="flModalOverlay" onClick={onCancel} role="presentation">
      <div className="flModal" onClick={(e) => e.stopPropagation()} role="dialog">
        <h2>{title}</h2>
        <p className="sub">{message}</p>
        <div className="flModalActions">
          <button type="button" className="flBtn flBtnGhost" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className={`flBtn ${danger ? "flBtnDanger" : "flBtnPrimary"}`}
            onClick={onConfirm}
          >
            {confirmLabel || "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
