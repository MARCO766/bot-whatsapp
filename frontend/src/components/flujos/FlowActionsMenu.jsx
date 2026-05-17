import React, { useEffect, useRef, useState } from "react";
import { builderUrl, exportFlowUrl } from "../../flujos/api";
import { FLOW_FOLDERS } from "../../flujos/constants";

export default function FlowActionsMenu({
  flow,
  onToggleEstado,
  onDuplicate,
  onDelete,
  onMoveFolder,
  onShowStats,
  onEditName,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function copyId() {
    navigator.clipboard?.writeText(flow.id);
    setOpen(false);
  }

  return (
    <div className="flMenuWrap" ref={ref}>
      <button type="button" className="flMenuBtn" onClick={() => setOpen(!open)} aria-label="Menú">
        ⋮
      </button>
      {open && (
        <div className="flMenuDropdown">
          <a href={builderUrl(flow)} target="_blank" rel="noreferrer">
            🛠️ Abrir builder
          </a>
          <button type="button" onClick={() => { onEditName?.(flow); setOpen(false); }}>
            ✏️ Editar nombre
          </button>
          <button type="button" onClick={() => { onToggleEstado(flow); setOpen(false); }}>
            {flow.meta?.estado === "activo" ? "⏸️ Pausar" : "▶️ Activar"}
          </button>
          <button type="button" onClick={() => { onShowStats?.(flow); setOpen(false); }}>
            📊 Estadísticas
          </button>
          <button type="button" onClick={() => { onDuplicate(flow.id); setOpen(false); }}>
            🟪 Duplicar
          </button>
          <a href={exportFlowUrl(flow.id)} target="_blank" rel="noreferrer">
            ⬇️ Exportar JSON
          </a>
          <button type="button" onClick={copyId}>
            🔗 Copiar ID
          </button>
          <hr style={{ border: "none", borderTop: "1px solid #334155", margin: "4px 0" }} />
          <div style={{ padding: "4px 8px", fontSize: "0.72rem", color: "#64748b" }}>
            Mover a carpeta
          </div>
          {FLOW_FOLDERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                onMoveFolder(flow.id, f.id);
                setOpen(false);
              }}
            >
              {f.icon} {f.label}
            </button>
          ))}
          <hr style={{ border: "none", borderTop: "1px solid #334155", margin: "4px 0" }} />
          <button
            type="button"
            className="danger"
            onClick={() => {
              onDelete(flow);
              setOpen(false);
            }}
          >
            🗑️ Eliminar
          </button>
        </div>
      )}
    </div>
  );
}
