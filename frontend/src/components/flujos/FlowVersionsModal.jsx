import React, { useCallback, useEffect, useState } from "react";
import { formatDate } from "../../flujos/utils";

const MOTIVO_LABELS = {
  guardado_builder: "Guardado en constructor",
  pre_restaurar: "Antes de restaurar",
  restaurado: "Restaurado",
};

function motivoLabel(motivo) {
  return MOTIVO_LABELS[motivo] || motivo || "Versión";
}

export default function FlowVersionsModal({
  open,
  flow,
  onClose,
  onLoadVersions,
  onRestore,
  onRestoreBlocked,
  puedeEscribir = false,
}) {
  const [versiones, setVersiones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const load = useCallback(async () => {
    if (!flow?.id || !onLoadVersions) return;
    setLoading(true);
    try {
      const list = await onLoadVersions(flow.id);
      setVersiones(Array.isArray(list) ? list : []);
    } finally {
      setLoading(false);
    }
  }, [flow?.id, onLoadVersions]);

  useEffect(() => {
    if (!open || !flow?.id) return;
    setConfirmId(null);
    load();
  }, [open, flow?.id, load]);

  if (!open || !flow) return null;

  async function handleRestore(versionId) {
    if (!puedeEscribir) return;
    setRestoringId(versionId);
    try {
      const ok = await onRestore(flow.id, versionId);
      if (ok) {
        setConfirmId(null);
        onClose();
      }
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="flModalOverlay" onClick={onClose} role="presentation">
      <div
        className="flModal flModalWide flVersionsModal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="flVersionsTitle"
      >
        <h2 id="flVersionsTitle">Historial de versiones</h2>
        <p className="sub">
          <strong>{flow.nombre}</strong> — hasta 20 snapshots al guardar en el constructor. Restaurar
          solo cambia nodos y conexiones; estado y carpeta del CRM se mantienen.
        </p>

        {!puedeEscribir && (
          <p className="flImportJsonWarn">
            Puedes ver el historial. Para restaurar, selecciona una línea WhatsApp (no «Todas las
            líneas»).
          </p>
        )}

        {loading ? (
          <p className="flVersionsEmpty">Cargando versiones…</p>
        ) : !versiones.length ? (
          <p className="flVersionsEmpty">
            Sin versiones aún. Guarda el flujo en el constructor para crear el primer snapshot.
          </p>
        ) : (
          <ul className="flVersionsList">
            {versiones.map((v) => (
              <li key={v.id} className="flVersionRow">
                <div className="flVersionInfo">
                  <span className="flVersionMotivo">{motivoLabel(v.motivo)}</span>
                  <span className="flVersionMeta">
                    {v.nodos_count ?? 0} nodos · {v.conexiones_count ?? 0} conexiones
                  </span>
                  <time className="flVersionDate">{formatDate(v.creado_en)}</time>
                </div>
                <div className="flVersionActions">
                  {confirmId === v.id ? (
                    <>
                      <button
                        type="button"
                        className="flBtn flBtnPrimary"
                        disabled={!puedeEscribir || restoringId === v.id}
                        onClick={() => handleRestore(v.id)}
                      >
                        {restoringId === v.id ? "Restaurando…" : "Confirmar"}
                      </button>
                      <button
                        type="button"
                        className="flBtn flBtnGhost"
                        disabled={restoringId === v.id}
                        onClick={() => setConfirmId(null)}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={`flBtn flBtnGhost ${!puedeEscribir ? "flBtnMuted" : ""}`}
                      title={
                        puedeEscribir
                          ? "Restaurar grafo de esta versión"
                          : "Selecciona una línea para restaurar una versión"
                      }
                      onClick={() => {
                        if (!puedeEscribir) {
                          onRestoreBlocked?.();
                          return;
                        }
                        setConfirmId(v.id);
                      }}
                    >
                      Restaurar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flModalActions">
          <button type="button" className="flBtn flBtnGhost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
