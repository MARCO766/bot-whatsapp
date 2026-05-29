import React, { useMemo } from "react";
import { FLOW_FOLDERS } from "../../flujos/constants";

function chipKey(item) {
  return item.id || item.slug || "sin_carpeta";
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
}) {
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
          icon: fallback.icon,
          flujos_count: counts?.sin_carpeta ?? 0,
          virtual: true,
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
          icon: f.icon,
          es_sistema: true,
          flujos_count: counts?.[f.id] ?? 0,
          virtual: true,
        });
      });
    }

    return { sistema, personalizadas, sinCarpetaItem };
  }, [carpetas, sinCarpeta, counts]);

  function renderChip(item, extraClass = "") {
    const key = item.filterKey || chipKey(item);
    const count =
      item.flujos_count ??
      counts?.[key] ??
      (item.slug ? counts?.[item.slug] : 0) ??
      0;
    const isActive = active === key;
    const accent = item.accent || "rgba(34, 197, 94, 0.5)";
    const lineLabel =
      mostrarLinea && item.conexion_whatsapp_id
        ? conexionesMap[item.conexion_whatsapp_id]
        : null;

    return (
      <button
        key={`${key}-${item.conexion_whatsapp_id || "global"}`}
        type="button"
        className={`flFolderChip ${extraClass} ${isActive ? "active" : ""}`}
        style={
          isActive
            ? {
                borderColor: accent,
                boxShadow: `0 4px 18px ${accent}33`,
              }
            : undefined
        }
        onClick={() => onChange(key)}
      >
        <span className="flFolderChipIcon" aria-hidden>
          {item.icon || "📁"}
        </span>
        <span className="flFolderChipLabel">{item.nombre}</span>
        {lineLabel && <span className="flFolderChipLine">{lineLabel}</span>}
        {!item.es_sistema && !item.virtual && (
          <span className="flFolderChipTag">custom</span>
        )}
        <span className="count">{count}</span>
      </button>
    );
  }

  return (
    <section className="flFoldersPremium" aria-label="Carpetas de flujos">
      <div className="flFoldersPremiumHead">
        <div>
          <h2 className="flFoldersPremiumTitle">Carpetas</h2>
          <p className="flFoldersPremiumSub">
            Organiza flujos por categoría premium y línea WhatsApp.
          </p>
        </div>
        {loading && <span className="flFoldersPremiumLoading">Sincronizando…</span>}
      </div>

      <div className="flFolders">
        <button
          type="button"
          className={`flFolderChip flFolderChip--all ${active === "all" ? "active" : ""}`}
          onClick={() => onChange("all")}
        >
          Todos
          <span className="count">{counts?.all ?? 0}</span>
        </button>

        {items.sinCarpetaItem && renderChip(items.sinCarpetaItem, "flFolderChip--muted")}
      </div>

      {items.sistema.length > 0 && (
        <div className="flFoldersGroup">
          <span className="flFoldersGroupLabel">Categorías premium</span>
          <div className="flFolders">{items.sistema.map((c) => renderChip(c, "flFolderChip--sistema"))}</div>
        </div>
      )}

      {items.personalizadas.length > 0 && (
        <div className="flFoldersGroup">
          <span className="flFoldersGroupLabel">Tus carpetas</span>
          <div className="flFolders">
            {items.personalizadas.map((c) => renderChip(c, "flFolderChip--custom"))}
          </div>
        </div>
      )}
    </section>
  );
}
