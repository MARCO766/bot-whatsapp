import React, { useMemo } from "react";
import { NODE_PREVIEW_COLORS } from "../../flujos/constants";

export default function FlowPreviewMini({ preview }) {
  const { nodos = [], conexiones = [] } = preview || {};

  const layout = useMemo(() => {
    if (!nodos.length) return { nodes: [], lines: [] };
    const xs = nodos.map((n) => n.x);
    const ys = nodos.map((n) => n.y);
    const minX = Math.min(...xs, 0);
    const minY = Math.min(...ys, 0);
    const maxX = Math.max(...xs, 100);
    const maxY = Math.max(...ys, 80);
    const w = Math.max(maxX - minX, 80);
    const h = Math.max(maxY - minY, 60);

    const scaled = nodos.map((n) => ({
      ...n,
      sx: 12 + ((n.x - minX) / w) * 136,
      sy: 12 + ((n.y - minY) / h) * 56,
    }));

    const nodeMap = Object.fromEntries(scaled.map((n) => [n.id, n]));
    const lines = conexiones
      .map((c) => {
        const a = nodeMap[c.desde];
        const b = nodeMap[c.hasta];
        if (!a || !b) return null;
        return { x1: a.sx, y1: a.sy, x2: b.sx, y2: b.sy };
      })
      .filter(Boolean);

    return { nodes: scaled, lines };
  }, [nodos, conexiones]);

  if (!nodos.length) {
    return (
      <div className="flPreviewInner flPreviewEmpty">
        <span className="flPreviewEmptyIcon" aria-hidden>◇</span>
        <span>Sin nodos — abre el constructor</span>
      </div>
    );
  }

  return (
    <div className="flPreviewInner">
      <svg width="100%" height="100%" viewBox="0 0 160 80" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <defs>
          <linearGradient id="flPreviewLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(34,197,94,.15)" />
            <stop offset="50%" stopColor="rgba(34,197,94,.55)" />
            <stop offset="100%" stopColor="rgba(6,182,212,.4)" />
          </linearGradient>
        </defs>
        {layout.lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="url(#flPreviewLineGrad)"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        ))}
        {layout.nodes.map((n) => (
          <g key={n.id}>
            <circle
              cx={n.sx}
              cy={n.sy}
              r="7"
              fill={NODE_PREVIEW_COLORS[n.tipo] || "#14b8a6"}
              opacity="0.25"
            />
            <circle
              cx={n.sx}
              cy={n.sy}
              r="5"
              fill={NODE_PREVIEW_COLORS[n.tipo] || "#14b8a6"}
              stroke="rgba(255,255,255,.35)"
              strokeWidth="1.25"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
