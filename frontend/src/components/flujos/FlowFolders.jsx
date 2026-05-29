import React, { useMemo } from "react";
import { FLOW_FOLDERS } from "../../flujos/constants";
import { getCarpetaTheme } from "../../flujos/utils";

function chipKey(item) {
  return item.id || item.slug || "sin_carpeta";
}

function themeForItem(item) {
  const cat = item.categoria || item.slug || "sin_carpeta";
  return getCarpetaTheme(cat, {
    esSistema: !!item.es_sistema,
    esCustom: !item.es_sistema && !item.virtual,
  });
}

export default function FlowFolders({
  active,
  onChange,
  counts,
  carpetas = [],
  sinCarpeta = null,
  loading = false,
  mostrarLinea = false,
  conexionesMap = {},
  puedeEscribir = false,
  onCreateCarpeta,
  onEditCarpeta,
  onDeleteCarpeta,
  draggingFlowId = null,
  dropTargetKey = null,
  onDropTargetChange,
  onFlowDrop,
  expandedSections = { sistema: true, custom: true },
  onToggleSection,
  onExpandSection,
}) {
  const isDragging = Boolean(draggingFlowId);
  const canDrop = puedeEscribir && isDragging;

  const items = useMemo(() => {
    let sinCarpetaItem = null;

    if (sinCarpeta) {
      sinCarpetaItem = { ...sinCarpeta, filterKey: "sin_carpeta" };
    } else {
      const fallback = FLOW_FOLDERS.find((f) => f.id === "sin_carpeta");
      if (fallback) {
        sinCarpetaItem = {
          ...fallback,
          filterKey: "sin_carpeta",
          nombre: fallback.label,
          categoria: "sin_carpeta",
          icon: fallback.icon,
          flujos_count: counts?.sin_carpeta ?? 0,
          virtual: true,
          es_sistema: true,
        };
      }
    }

    const sistema = [];
    const personalizadas = [];

    (carpetas || []).forEach((c) => {
      const entry = {
        ...c,
        filterKey: chipKey(c),
        nombre: c.nombre || c.label,
      };
      if (c.es_sistema) sistema.push(entry);
      else personalizadas.push(entry);
    });

    sistema.sort((a, b) => (a.orden || 0) - (b.orden || 0));
    personalizadas.sort((a, b) => (a.orden || 0) - (b.orden || 0));

    if (!sistema.length && !carpetas.length) {
      FLOW_FOLDERS.filter((f) => f.id !== "sin_carpeta").forEach((f) => {
        sistema.push({
          id: f.id,
          slug: f.id,
          filterKey: f.id,
          nombre: f.label,
          categoria: f.id,
          icon: f.icon,
          es_sistema: true,
          flujos_count: counts?.[f.id] ?? 0,
          virtual: true,
        });
      });
    }

    return { sistema, personalizadas, sinCarpetaItem };
  }, [carpetas, sinCarpeta, counts]);

  function handleDragOverZone(e, key) {
    if (!canDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    onDropTargetChange?.(key);
  }

  function handleDropZone(e, item) {
    if (!canDrop) return;
    e.preventDefault();
    e.stopPropagation();
    onFlowDrop?.(item.filterKey || chipKey(item), item);
    onDropTargetChange?.(null);
  }

  function renderChip(item, extraClass = "", showActions = false, droppable = true) {
    const key = item.filterKey || chipKey(item);
    const count =
      item.flujos_count ??
      counts?.[key] ??
      (item.slug ? counts?.[item.slug] : 0) ??
      0;
    const isActive = active === key;
    const theme = themeForItem(item);
    const icon = theme.icon || item.icon || "📁";
    const isDropTarget = dropTargetKey === key && canDrop;
    const lineLabel =
      mostrarLinea && item.conexion_whatsapp_id
        ? conexionesMap[item.conexion_whatsapp_id]
        : null;

    const chip = (
      <button
        type="button"
        className={`flFolderChip ${extraClass} ${isActive ? "active" : ""}`}
        style={
          isActive || isDropTarget
            ? {
                borderColor: theme.accent,
                boxShadow: isDropTarget
                  ? `0 0 0 1px ${theme.accent}55, 0 6px 20px ${theme.glow}`
                  : `0 4px 14px ${theme.glow}`,
                background: isDropTarget ? theme.bg : undefined,
              }
            : {
                ["--fl-folder-accent"]: theme.accent,
                ["--fl-folder-glow"]: theme.glow,
              }
        }
        onClick={() => onChange(key)}
        draggable={false}
      >
        <span className="flFolderChipIcon" aria-hidden style={{ color: theme.accent }}>
          {icon}
        </span>
        <span className="flFolderChipLabel">{item.nombre}</span>
        {lineLabel && <span className="flFolderChipLine">{lineLabel}</span>}
        {!item.es_sistema && !item.virtual && (
          <span className="flFolderChipTag">custom</span>
        )}
        <span className="count">{count}</span>
      </button>
    );

    if (!droppable || !canDrop) {
      return (
        <div key={`${key}-${item.conexion_whatsapp_id || "global"}`} className="flFolderChipWrap">
          {chip}
          {showActions && puedeEscribir && renderActions(item)}
        </div>
      );
    }

    return (
      <div
        key={`${key}-${item.conexion_whatsapp_id || "global"}`}
        className={`flFolderChipWrap flFolderChipDrop ${isDropTarget ? "flFolderChipDrop--active" : ""}`}
        onDragEnter={(e) => handleDragOverZone(e, key)}
        onDragOver={(e) => handleDragOverZone(e, key)}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget)) return;
          if (dropTargetKey === key) onDropTargetChange?.(null);
        }}
        onDrop={(e) => handleDropZone(e, item)}
      >
        {chip}
        {isDropTarget && (
          <span className="flFolderDropHint" style={{ color: theme.accent }}>
            Suelta aquí para mover
          </span>
        )}
        {showActions && puedeEscribir && renderActions(item)}
      </div>
    );
  }

  function renderActions(item) {
    return (
      <div className="flFolderChipActions">
        <button
          type="button"
          className="flFolderActionBtn"
          title="Editar carpeta"
          aria-label={`Editar ${item.nombre}`}
          draggable={false}
          onClick={(e) => {
            e.stopPropagation();
            onEditCarpeta?.(item);
          }}
        >
          ✎
        </button>
        <button
          type="button"
          className="flFolderActionBtn flFolderActionBtn--danger"
          title="Eliminar carpeta"
          aria-label={`Eliminar ${item.nombre}`}
          draggable={false}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteCarpeta?.(item);
          }}
        >
          ×
        </button>
      </div>
    );
  }

  function renderGroup(sectionKey, label, list, chipClass, withActions = false) {
    const expanded = expandedSections[sectionKey] !== false;
    return (
      <div
        className={`flFoldersGroup ${expanded ? "" : "flFoldersGroup--collapsed"}`}
        onDragEnter={() => {
          if (canDrop && !expanded) onExpandSection?.(sectionKey);
        }}
      >
        <button
          type="button"
          className="flFoldersGroupToggle"
          onClick={() => onToggleSection?.(sectionKey)}
          aria-expanded={expanded}
          draggable={false}
        >
          <span className="flFoldersGroupLabel">{label}</span>
          <span className="flFoldersGroupChevron" aria-hidden>
            {expanded ? "▾" : "▸"}
          </span>
        </button>
        {expanded && (
          <div className="flFolders">
            {list.map((c) => renderChip(c, chipClass, withActions))}
          </div>
        )}
      </div>
    );
  }

  return (
    <section
      className={`flFoldersPremium ${isDragging ? "flFoldersPremium--dragging" : ""}`}
      aria-label="Carpetas de flujos"
    >
      <div className="flFoldersPremiumHead">
        <div>
          <h2 className="flFoldersPremiumTitle">Carpetas</h2>
          <p className="flFoldersPremiumSub">
            {puedeEscribir
              ? "Arrastra un flujo por ⠿ hacia una carpeta o usa el menú ⋮."
              : "Vista global: elige una línea para organizar con carpetas."}
          </p>
        </div>
        <div className="flFoldersPremiumHeadActions">
          {loading && <span className="flFoldersPremiumLoading">Sincronizando…</span>}
          <button
            type="button"
            className="flBtn flBtnGhost flBtnSm"
            disabled={!puedeEscribir}
            draggable={false}
            title={
              puedeEscribir
                ? "Nueva carpeta personalizada"
                : "Selecciona una línea WhatsApp (no «Todas las líneas»)"
            }
            onClick={() => onCreateCarpeta?.()}
          >
            + Carpeta
          </button>
        </div>
      </div>

      <div className="flFolders">
        <button
          type="button"
          className={`flFolderChip flFolderChip--all ${active === "all" ? "active" : ""}`}
          onClick={() => onChange("all")}
          draggable={false}
        >
          Todos
          <span className="count">{counts?.all ?? 0}</span>
        </button>

        {items.sinCarpetaItem &&
          renderChip(items.sinCarpetaItem, "flFolderChip--muted", false, true)}
      </div>

      {items.sistema.length > 0 &&
        renderGroup("sistema", "Categorías premium", items.sistema, "flFolderChip--sistema")}

      {items.personalizadas.length > 0 &&
        renderGroup(
          "custom",
          "Tus carpetas",
          items.personalizadas,
          "flFolderChip--custom",
          true
        )}

      {puedeEscribir && !items.personalizadas.length && !loading && (
        <p className="flFoldersEmptyHint">
          Aún no tienes carpetas personalizadas. Usa «+ Carpeta» para crear una.
        </p>
      )}
    </section>
  );
}
