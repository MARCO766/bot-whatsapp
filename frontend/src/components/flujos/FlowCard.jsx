import React, { memo, useState } from "react";
import { builderUrl } from "../../flujos/api";
import {
  folderLabel,
  formatDate,
  formatFlowIngresos,
  formatMetric,
  formatMetricTimestamp,
  formatTasaCierre,
  resolveFlowCarpetaTheme,
  stateMeta,
} from "../../flujos/utils";
import FlowActionsMenu from "./FlowActionsMenu";
import FlowPreviewMini from "./FlowPreviewMini";
import FlowTimeline from "./FlowTimeline";

const PRIMARY_METRICS = [
  {
    key: "ventas",
    fallbackKey: "conversiones",
    label: "Ventas",
    title: "Conversiones registradas en crm_conversiones",
    accent: "green",
  },
  {
    key: "ingresos",
    label: "Ingresos",
    title: "Suma de valor en conversiones del flujo",
    accent: "cyan",
    format: (m) => formatFlowIngresos(m.ingresos, m.ingresosMoneda),
  },
  {
    key: "conversaciones",
    label: "Conversaciones",
    title: "Clientes del flujo con actividad en mensajes",
    accent: "violet",
  },
  {
    key: "leadsHoy",
    label: "Leads hoy",
    title: "Clientes con actividad registrada hoy",
    accent: "amber",
  },
];

const SECONDARY_METRICS = [
  {
    key: "seguimientosEnviados",
    label: "Env.",
    title: "Seguimientos enviados",
    format: (m) => formatMetric(m.seguimientosEnviados ?? 0),
  },
  {
    key: "seguimientosPendientes",
    fallbackKey: "seguimientosActivos",
    label: "Pend.",
    title: "Seguimientos pendientes",
    format: (m) => formatMetric(m.seguimientosPendientes ?? m.seguimientosActivos ?? 0),
  },
  {
    key: "tasaCierre",
    label: "Cierre",
    title: "Ventas ÷ conversaciones",
    format: (m) => formatTasaCierre(m.tasaCierre),
  },
  {
    key: "ultimaConversion",
    label: "Conv.",
    title: "Última conversión registrada",
    format: (m) => formatMetricTimestamp(m.ultimaConversion),
    isTimestamp: true,
  },
  {
    key: "ultimaActividad",
    label: "Actividad",
    title: "Última actividad del flujo",
    format: (m) => formatMetricTimestamp(m.ultimaActividad),
    isTimestamp: true,
  },
];

function metricValue(m, item) {
  if (item.format) return item.format(m);
  const raw = m[item.key] ?? (item.fallbackKey ? m[item.fallbackKey] : undefined);
  return formatMetric(raw ?? 0);
}

function FlowCard({
  flow,
  listMode,
  mostrarBadgeLinea = false,
  conexionWhatsappId,
  openMenuId,
  onMenuOpenChange,
  onToggleEstado,
  onDuplicate,
  onExport,
  onDelete,
  onMoveFolder,
  onEditName,
  onShowHistory,
  carpetas = [],
  carpetasMover = [],
  puedeEscribir = true,
  isDragging = false,
  onFlowDragStart,
  onFlowDragEnd,
}) {
  const [showTimeline, setShowTimeline] = useState(false);
  const st = stateMeta(flow.meta?.estado);
  const m = flow.metricas || {};
  const isMenuOpen = openMenuId === flow.id;
  const activos = flow.activadores?.filter((a) => a.activo).length || 0;
  const totalActivadores = flow.activadores?.length || 0;
  const isActivo = flow.meta?.estado === "activo";
  const carpetaTheme = resolveFlowCarpetaTheme(flow, carpetas);

  return (
    <article
      className={`flCard ${listMode ? "listMode" : ""} ${isMenuOpen ? "flCardMenuOpen" : ""} ${
        isDragging ? "flCard--dragging" : ""
      }`}
    >
      <div className="flCardHead">
        <span
          className={`flDragHandle ${puedeEscribir ? "" : "flDragHandle--disabled"}`}
          draggable={puedeEscribir}
          title={
            puedeEscribir
              ? "Arrastrar a una carpeta"
              : "Selecciona una línea WhatsApp (no «Todas las líneas»)"
          }
          aria-label="Arrastrar flujo a carpeta"
          onDragStart={(e) => onFlowDragStart?.(e, flow)}
          onDragEnd={onFlowDragEnd}
        >
          ⠿
        </span>
        <div className="flCardHeadMain">
          <h3 className="flCardTitle">{flow.nombre}</h3>
          <div className="flCardMeta">
            <span
              className="flBadge"
              style={{
                background: `${st.color}18`,
                color: st.color,
                border: `1px solid ${st.color}40`,
              }}
            >
              <span className="flBadgeDot" style={{ background: st.color }} />
              {st.label}
            </span>
            <span
              className="flMetaChip flMetaChipCarpeta"
              style={{
                borderColor: `${carpetaTheme.accent}40`,
                background: carpetaTheme.bg,
              }}
            >
              <span className="flMetaChipIcon" aria-hidden style={{ color: carpetaTheme.accent }}>
                {carpetaTheme.icon}
              </span>
              {folderLabel(flow, carpetas)}
            </span>
            {mostrarBadgeLinea && (
              <span className="flMetaChip flMetaChipLinea" title="Línea WhatsApp del flujo">
                <span className="flMetaChipIcon" aria-hidden>📱</span>
                {flow.conexion_nombre || (flow.conexion_whatsapp_id ? "Línea" : "Sin línea")}
              </span>
            )}
            <span className="flMetaChip" title="Activadores del flujo">
              <span className="flMetaChipIcon" aria-hidden>⚡</span>
              {activos}/{totalActivadores} activadores
            </span>
          </div>
        </div>
        <FlowActionsMenu
          flow={flow}
          isOpen={isMenuOpen}
          onOpenChange={onMenuOpenChange}
          onDuplicate={onDuplicate}
          onExport={onExport}
          onDelete={onDelete}
          onMoveFolder={onMoveFolder}
          onEditName={onEditName}
          onShowHistory={onShowHistory}
          carpetasMover={carpetasMover}
          carpetas={carpetas}
          puedeEscribir={puedeEscribir}
        />
      </div>

      <div className={`flPreviewWrap ${listMode ? "tall" : ""}`} draggable={false}>
        <FlowPreviewMini preview={flow.preview} />
      </div>

      <div className="flDash flDashCompact" draggable={false}>
        <div className="flDashPrimary">
          {PRIMARY_METRICS.map((item) => (
            <div
              key={item.key}
              className={`flDashKpi flDashKpi--${item.accent}`}
              title={item.title}
            >
              <b>{metricValue(m, item)}</b>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <div className="flDashSecondary">
          {SECONDARY_METRICS.map((item) => (
            <div key={item.key} className="flDashChip" title={item.title}>
              <span className="flDashChipLabel">{item.label}</span>
              <span
                className={`flDashChipValue ${item.isTimestamp ? "flDashChipValue--time" : ""}`}
              >
                {metricValue(m, item)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <FlowTimeline
        flowId={flow.id}
        conexionWhatsappId={conexionWhatsappId}
        expanded={showTimeline}
      />

      <div className="flCardFooter" draggable={false}>
        <span className="flCardModified">Modificado {formatDate(flow.meta?.actualizado_en)}</span>
        <div className="flQuickActions">
          <a
            href={builderUrl(flow, conexionWhatsappId)}
            target="_blank"
            rel="noreferrer"
            className="flQuickBtn flQuickBtnPrimary"
            draggable={false}
          >
            <span className="flQuickBtnIcon" aria-hidden>🛠</span>
            Constructor
          </a>
          <button
            type="button"
            className="flQuickBtn"
            draggable={false}
            onClick={() => onToggleEstado(flow)}
          >
            <span className="flQuickBtnIcon" aria-hidden>{isActivo ? "⏸" : "▶"}</span>
            {isActivo ? "Pausar" : "Activar"}
          </button>
          <button
            type="button"
            className={`flQuickBtn ${showTimeline ? "flQuickBtnActive" : ""}`}
            draggable={false}
            onClick={() => setShowTimeline(!showTimeline)}
          >
            <span className="flQuickBtnIcon" aria-hidden>📊</span>
            {showTimeline ? "Ocultar" : "Actividad"}
          </button>
        </div>
      </div>
    </article>
  );
}

export default memo(FlowCard);
