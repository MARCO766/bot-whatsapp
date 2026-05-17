import React, { memo, useState } from "react";
import { builderUrl } from "../../flujos/api";
import { folderLabel, formatDate, formatMetric, stateMeta } from "../../flujos/utils";
import FlowActionsMenu from "./FlowActionsMenu";
import FlowCampaignsPanel from "./FlowCampaignsPanel";
import FlowPreviewMini from "./FlowPreviewMini";
import FlowTimeline from "./FlowTimeline";

function FlowCard({
  flow,
  listMode,
  openMenuId,
  onMenuOpenChange,
  onToggleEstado,
  onDuplicate,
  onDelete,
  onMoveFolder,
  onUpdateCampanas,
  onEditName,
}) {
  const [showTimeline, setShowTimeline] = useState(false);
  const st = stateMeta(flow.meta?.estado);
  const m = flow.metricas || {};
  const isMenuOpen = openMenuId === flow.id;

  return (
    <article className={`flCard ${listMode ? "listMode" : ""} ${isMenuOpen ? "flCardMenuOpen" : ""}`}>
      <div className="flCardHead">
        <div>
          <h3 className="flCardTitle">{flow.nombre}</h3>
          <div className="flCardMeta">
            <span
              className="flBadge"
              style={{
                background: `${st.color}22`,
                color: st.color,
                border: `1px solid ${st.color}44`,
              }}
            >
              <span className="flBadgeDot" style={{ background: st.color }} />
              {st.label}
            </span>
            <span className="flCardMetaItem">📁 {folderLabel(flow.meta?.carpeta)}</span>
            <span className="flCardMetaItem">
              ⚡ {flow.activadores?.filter((a) => a.activo).length || 0}/
              {flow.activadores?.length || 0} activadores
            </span>
          </div>
        </div>
        <FlowActionsMenu
          flow={flow}
          isOpen={isMenuOpen}
          onOpenChange={onMenuOpenChange}
          onToggleEstado={onToggleEstado}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onMoveFolder={onMoveFolder}
          onEditName={onEditName}
          onShowStats={() => setShowTimeline(true)}
        />
      </div>

      <div className={`flPreviewWrap ${listMode ? "tall" : ""}`} style={listMode ? { flex: "0 0 160px" } : undefined}>
        <FlowPreviewMini preview={flow.preview} />
      </div>

      <div className="flMetrics flMetricsCompact">
        <div className="flMetric" title="Clientes únicos en seguimientos de este flujo">
          <b>{formatMetric(m.clientesEnFlujo)}</b>
          <span>En flujo</span>
        </div>
        <div className="flMetric" title="Entradas registradas hoy">
          <b>{formatMetric(m.leadsHoy)}</b>
          <span>Hoy</span>
        </div>
        <div className="flMetric" title="Seguimientos respondidos en este flujo">
          <b>{formatMetric(m.respuestas)}</b>
          <span>Respuestas</span>
        </div>
        <div className="flMetric" title="Conversiones del nodo 💰 (crm_conversiones)">
          <b>{formatMetric(m.conversiones ?? 0)}</b>
          <span>Conversiones</span>
        </div>
      </div>

      <FlowCampaignsPanel
        campanas={flow.meta?.campanas || []}
        readOnly={false}
        onToggle={(id) => {
          const current = flow.meta?.campanas || [];
          const next = current.includes(id)
            ? current.filter((c) => c !== id)
            : [...current, id];
          onUpdateCampanas(flow.id, next);
        }}
      />

      <FlowTimeline flowId={flow.id} expanded={showTimeline} />

      <div className="flCardFooter">
        <span>
          Últ. ejecución: {formatDate(m.ultimaEjecucion)} · Modificado:{" "}
          {formatDate(flow.meta?.actualizado_en)}
        </span>
        <div className="flQuickActions">
          <a href={builderUrl(flow)} target="_blank" rel="noreferrer" className="flQuickBtn">
            Constructor
          </a>
          <button type="button" className="flQuickBtn" onClick={() => onToggleEstado(flow)}>
            {flow.meta?.estado === "activo" ? "Pausar" : "Activar"}
          </button>
          <button type="button" className="flQuickBtn" onClick={() => setShowTimeline(!showTimeline)}>
            {showTimeline ? "Ocultar" : "Actividad"}
          </button>
        </div>
      </div>
    </article>
  );
}

export default memo(FlowCard);
