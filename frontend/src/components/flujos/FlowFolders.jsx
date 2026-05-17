import React from "react";
import { FLOW_FOLDERS } from "../../flujos/constants";

export default function FlowFolders({ active, onChange, counts }) {
  return (
    <div className="flFolders">
      <button
        type="button"
        className={`flFolderChip ${active === "all" ? "active" : ""}`}
        onClick={() => onChange("all")}
      >
        Todos
        <span className="count">{counts.all ?? 0}</span>
      </button>
      {FLOW_FOLDERS.map((f) => (
        <button
          key={f.id}
          type="button"
          className={`flFolderChip ${active === f.id ? "active" : ""}`}
          onClick={() => onChange(f.id)}
        >
          {f.icon} {f.label}
          <span className="count">{counts[f.id] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
