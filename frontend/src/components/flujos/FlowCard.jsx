import React, { memo, useState } from "react";
import { builderUrl } from "../../flujos/api";
import {
  folderLabel,
  formatDate,
  formatMetric,
  formatRelativeTime,
  formatUltimoLead,
  stateMeta,
} from "../../flujos/utils";
import FlowActionsMenu from "./FlowActionsMenu";
import FlowPreviewMini from "./FlowPreviewMini";
import FlowTimeline from "./FlowTimeline";

const FLOW_METRICS = [
  { key: "clientesEnFlujo", label: "En flujo", title: "Clientes únicos en seguimientos de este flujo" },
  { key: "leadsHoy", label: "Hoy", title: "Actividad real registrada hoy" },
  { key: "respuestas", label: "Respuestas", title: "Leads que respondieron" },
  { key: "conversiones", label: "Conversiones", title: "Registros en crm_conversiones", fallback: 0 },
  { key: "seguimientosActivos", label: "Seg. activos", title: "Seguimientos programados pendientes" },
];

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
}) {
  const [showTimeline, setShowTimeline] = useState(false);
  const st = stateMeta(flow.meta?.estado);
  const m = flow.metricas || {};
  const isMenuOpen = openMenuId === flow.id;
  const activos = flow.activadores?.filter((a) => a.activo).length || 0;
  const totalActivadores = flow.activadores?.length || 0;
  const isActivo = flow.meta?.estado === "activo";

  const actividadRel = formatRelativeTime(m.ultimaActividad);
  const ultimoLeadTxt = formatUltimoLead(m.ultimoLead);

  return (
    <article className={`flCard ${listMode ? "listMode" : ""} ${isMenuOpen ? "flCardMenuOpen" : ""}`}>
      <div className="flCardHead">
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
            <span className="flMetaChip">
              <span className="flMetaChipIcon" aria-hidden>📁</span>
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

      <div className={`flPreviewWrap ${listMode ? "tall" : ""}`}>
        <FlowPreviewMini preview={flow.preview} />
      </div>

      <div className="flMetrics flMetricsCompact flMetrics5">
        {FLOW_METRICS.map((item) => (
          <div key={item.key} className="flMetric" title={item.title}>
            <b>{formatMetric(m[item.key] ?? item.fallback ?? 0)}</b>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="flCardActivity">
        <div className="flCardActivityItem">
          <span className="flCardActivityLabel">Última actividad</span>
          <span className="flCardActivityValue">{actividadRel || "Sin actividad"}</span>
        </div>
        <div className="flCardActivityItem">
          <span className="flCardActivityLabel">Último lead</span>
          <span className="flCardActivityValue flCardActivityLead">
            {ultimoLeadTxt || "—"}
          </span>
        </div>
      </div>

      <FlowTimeline
        flowId={flow.id}
        conexionWhatsappId={conexionWhatsappId}
        expanded={showTimeline}
      />

      <div className="flCardFooter">
        <span className="flCardModified">Modificado {formatDate(flow.meta?.actualizado_en)}</span>
        <div className="flQuickActions">
          <a
            href={builderUrl(flow, conexionWhatsappId)}
            target="_blank"
            rel="noreferrer"
            className="flQuickBtn flQuickBtnPrimary"
          >
            <span className="flQuickBtnIcon" aria-hidden>🛠</span>
            Constructor
          </a>
          <button type="button" className="flQuickBtn" onClick={() => onToggleEstado(flow)}>
            <span className="flQuickBtnIcon" aria-hidden>{isActivo ? "⏸" : "▶"}</span>
            {isActivo ? "Pausar" : "Activar"}
          </button>
          <button
            type="button"
            className={`flQuickBtn ${showTimeline ? "flQuickBtnActive" : ""}`}
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
