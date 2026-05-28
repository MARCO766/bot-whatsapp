import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { builderUrl, exportFlowUrl } from "../../flujos/api";
import { FLOW_FOLDERS } from "../../flujos/constants";

const MENU_W = 248;

export default function FlowActionsMenu({
  flow,
  conexionWhatsappId,
  isOpen,
  onOpenChange,
  onToggleEstado,
  onDuplicate,
  onDelete,
  onMoveFolder,
  onShowStats,
  onEditName,
}) {
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, placement: "bottom" });

  const close = useCallback(() => onOpenChange(null), [onOpenChange]);

  const updatePosition = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const estHeight = menuRef.current?.offsetHeight || 380;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < estHeight + 12 && rect.top > estHeight;

    let left = rect.right - MENU_W;
    left = Math.max(12, Math.min(left, window.innerWidth - MENU_W - 12));

    setPos({
      top: openUp ? rect.top - 8 : rect.bottom + 8,
      left,
      placement: openUp ? "top" : "bottom",
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(e) {
      const t = e.target;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    }

    function onKey(e) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, close, updatePosition]);

  function copyId() {
    navigator.clipboard?.writeText(flow.id);
    close();
  }

  const menu = isOpen ? (
    <>
      <div className="flMenuBackdrop" aria-hidden="true" />
      <div
        ref={menuRef}
        className={`flMenuPortal ${pos.placement === "top" ? "flMenuPortalUp" : ""}`}
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width: MENU_W,
          zIndex: 10050,
          transform: pos.placement === "top" ? "translateY(-100%)" : "none",
        }}
        role="menu"
      >
        <a
          href={builderUrl(flow, conexionWhatsappId)}
          target="_blank"
          rel="noreferrer"
          role="menuitem"
          onClick={close}
        >
          <span className="flMenuIcon">🛠️</span>
          <span>Abrir constructor</span>
        </a>
        <button type="button" role="menuitem" onClick={() => { onEditName?.(flow); close(); }}>
          <span className="flMenuIcon">✏️</span>
          <span>Editar nombre</span>
        </button>
        <button type="button" role="menuitem" onClick={() => { onToggleEstado(flow); close(); }}>
          <span className="flMenuIcon">{flow.meta?.estado === "activo" ? "⏸️" : "▶️"}</span>
          <span>{flow.meta?.estado === "activo" ? "Pausar flujo" : "Activar flujo"}</span>
        </button>
        <button type="button" role="menuitem" onClick={() => { onShowStats?.(flow); close(); }}>
          <span className="flMenuIcon">📊</span>
          <span>Ver actividad</span>
        </button>
        <button type="button" role="menuitem" onClick={() => { onDuplicate(flow.id); close(); }}>
          <span className="flMenuIcon">🟪</span>
          <span>Duplicar</span>
        </button>
        <a href={exportFlowUrl(flow.id)} target="_blank" rel="noreferrer" role="menuitem" onClick={close}>
          <span className="flMenuIcon">⬇️</span>
          <span>Exportar JSON</span>
        </a>
        <button type="button" role="menuitem" onClick={copyId}>
          <span className="flMenuIcon">🔗</span>
          <span>Copiar ID</span>
        </button>

        <div className="flMenuDivider" />
        <div className="flMenuSection">Mover a carpeta</div>

        <div className="flMenuScroll">
          {FLOW_FOLDERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitem"
              className={flow.meta?.carpeta === f.id ? "active" : ""}
              onClick={() => {
                onMoveFolder(flow.id, f.id);
                close();
              }}
            >
              <span className="flMenuIcon">{f.icon}</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>

        <div className="flMenuDivider" />
        <button
          type="button"
          role="menuitem"
          className="flMenuDanger"
          onClick={() => {
            onDelete(flow);
            close();
          }}
        >
          <span className="flMenuIcon">🗑️</span>
          <span>Eliminar flujo</span>
        </button>
      </div>
    </>
  ) : null;

  return (
    <>
      <div className="flMenuWrap">
        <button
          ref={btnRef}
          type="button"
          className={`flMenuBtn ${isOpen ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenChange(isOpen ? null : flow.id);
          }}
          aria-label="Menú del flujo"
          aria-expanded={isOpen}
          aria-haspopup="menu"
        >
          ⋮
        </button>
      </div>
      {menu && createPortal(menu, document.body)}
    </>
  );
}
