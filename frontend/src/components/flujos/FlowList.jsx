import React from "react";
import FlowCard from "./FlowCard";
import EmptyState from "./EmptyState";

export default function FlowList({
  flows,
  loading,
  viewMode,
  onToggleEstado,
  onDuplicate,
  onDelete,
  onMoveFolder,
  onUpdateCampanas,
  onEditName,
  onCreate,
  onImport,
  apiOnline,
}) {
  if (loading) {
    const skeletons = Array.from({ length: 6 });
    return (
      <div className={viewMode === "cards" ? "flGrid" : "flList"}>
        {skeletons.map((_, i) => (
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
          onToggleEstado={onToggleEstado}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onMoveFolder={onMoveFolder}
          onUpdateCampanas={onUpdateCampanas}
          onEditName={onEditName}
        />
      ))}
    </div>
  );
}
