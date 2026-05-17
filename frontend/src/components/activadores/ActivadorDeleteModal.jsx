import React from "react";
import { createPortal } from "react-dom";

export default function ActivadorDeleteModal({
  open,
  palabra,
  deleting,
  onCancel,
  onConfirm,
}) {
  if (!open) return null;

  const label = palabra || "—";

  return createPortal(
    <div className="actConfirmOverlay" onClick={deleting ? undefined : onCancel} role="presentation">
      <div
        className="actConfirmModal"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-labelledby="act-delete-title"
        aria-describedby="act-delete-desc"
      >
        <h2 id="act-delete-title">Eliminar activador</h2>
        <p id="act-delete-desc" className="actConfirmText">
          ¿Eliminar definitivamente el activador &quot;{label}&quot;? Esta acción no se puede
          deshacer.
        </p>
        <div className="actModalActions">
          <button
            type="button"
            className="actBtn actBtnGhost"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="actBtn actBtnDanger"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? "Eliminando…" : "Eliminar definitivamente"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
