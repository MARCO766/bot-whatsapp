import React, { memo, useState } from "react";
import FlowCard from "./FlowCard";
import EmptyState from "./EmptyState";

function FlowList({
  flows,
  loading,
  viewMode,
  mostrarBadgeLinea = false,
  conexionWhatsappId,
  onToggleEstado,
  onDuplicate,
  onExport,
  onDelete,
  onMoveFolder,
  onEditName,
  onShowHistory,
  onCreate,
  onImport,
  apiOnline,
  carpetas = [],
  carpetasMover = [],
  puedeEscribir = false,
}) {
  const [openMenuId, setOpenMenuId] = useState(null);

  if (loading) {
    const skeletons = Array.from({ length: 6 }, (_, i) => i);
    return (
      <div className={viewMode === "cards" ? "flGrid" : "flList"}>
        {skeletons.map((i) => (
          <div key={i} className="flSkeleton" />
        ))}
      </div>
    );
  }

  if (!flows.length) {
    return <EmptyState onCreate={onCreate} onImport={onImport} apiOnline={apiOnline} />;
  }

  const listMode = viewMode === "list";

  return (
    <div className={listMode ? "flList" : "flGrid"}>
      {flows.map((flow) => (
        <FlowCard
          key={flow.id}
          flow={flow}
          listMode={listMode}
          mostrarBadgeLinea={mostrarBadgeLinea}
          conexionWhatsappId={conexionWhatsappId}
          openMenuId={openMenuId}
          onMenuOpenChange={setOpenMenuId}
          onToggleEstado={onToggleEstado}
          onDuplicate={onDuplicate}
          onExport={onExport}
          onDelete={onDelete}
          onMoveFolder={onMoveFolder}
          onEditName={onEditName}
          onShowHistory={onShowHistory}
          carpetas={carpetas}
          carpetasMover={carpetasMover}
          puedeEscribir={puedeEscribir}
        />
      ))}
    </div>
  );
}

export default memo(FlowList);
