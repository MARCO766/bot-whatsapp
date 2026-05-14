import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "macbot_flujos_respondio_dark_v3";

const NODE_TYPES = [
  {
    type: "trigger",
    title: "Desencadenador",
    icon: "⚡",
    color: "#f43f5e",
    description: "Inicia el flujo cuando el cliente escribe, entra desde un anuncio o cumple una condición.",
  },
  {
    type: "message",
    title: "Enviar mensaje",
    icon: "➤",
    color: "#14b8a6",
    description: "Envía texto, imagen, audio, video o documento al contacto.",
  },
  {
    type: "branch",
    title: "Sucursal",
    icon: "🔀",
    color: "#f59e0b",
    description: "Crea ramas según etiquetas, estado, respuesta o condición del cliente.",
  },
  {
    type: "delay",
    title: "Esperar",
    icon: "⏱️",
    color: "#8b5cf6",
    description: "Espera minutos, horas o días antes de continuar el flujo.",
  },
  {
    type: "tag",
    title: "Etiqueta",
    icon: "🏷️",
    color: "#3b82f6",
    description: "Agrega o elimina etiquetas del contacto.",
  },
  {
    type: "payment",
    title: "Pago",
    icon: "💳",
    color: "#22c55e",
    description: "Envía QR, depósito, Tigo Money, Hotmart o link de pago.",
  },
  {
    type: "ai",
    title: "Bot IA",
    icon: "🤖",
    color: "#ec4899",
    description: "Clasifica o responde automáticamente con IA.",
  },
  {
    type: "end",
    title: "Finalizar",
    icon: "✅",
    color: "#84cc16",
    description: "Termina el flujo para este contacto.",
  },
];

const DEFAULT_FLOW = {
  name: "impermeable",
  status: "Borrador",
  nodes: [
    {
      id: "n1",
      type: "trigger",
      title: "Desencadenador",
      text: "Se inició la conversación",
      x: 780,
      y: 120,
    },
    {
      id: "n2",
      type: "message",
      title: "Enviar mensaje #1",
      text: "No se proporcionó ningún mensaje.",
      x: 780,
      y: 300,
    },
  ],
  edges: [{ from: "n1", to: "n2", label: "" }],
};

function uid() {
  return "node_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
}

export default function Flujos() {
  const canvasRef = useRef(null);
  const draggingCanvas = useRef(false);
  const draggingNode = useRef(null);
  const dragStart = useRef({ x: 0, y: 0 });

  const [flow, setFlow] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_FLOW;
  });

  const [selectedId, setSelectedId] = useState("n2");
  const [addMenuFor, setAddMenuFor] = useState(null);
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 40, y: 10 });
  const [toast, setToast] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flow));
  }, [flow]);

  const selectedNode = useMemo(
    () => flow.nodes.find((n) => n.id === selectedId),
    [flow.nodes, selectedId]
  );

  function meta(type) {
    return NODE_TYPES.find((n) => n.type === type) || NODE_TYPES[1];
  }

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(""), 1600);
  }

  function updateNode(id, updates) {
    setFlow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
    }));
  }

  function addNodeAfter(parentId, type) {
    const parent = flow.nodes.find((n) => n.id === parentId);
    if (!parent) return;

    const item = meta(type);
    const childrenCount = flow.edges.filter((e) => e.from === parentId).length;

    const newNode = {
      id: uid(),
      type,
      title:
        type === "message"
          ? `Enviar mensaje #${flow.nodes.filter((n) => n.type === "message").length + 1}`
          : item.title,
      text: item.description,
      x:
        parent.type === "branch"
          ? parent.x + (childrenCount === 0 ? -260 : 260)
          : parent.x,
      y: parent.y + 185,
    };

    setFlow((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      edges: [
        ...prev.edges,
        {
          from: parentId,
          to: newNode.id,
          label: parent.type === "branch" ? (childrenCount === 0 ? "Sucursal 1" : "Demás") : "",
        },
      ],
    }));

    setSelectedId(newNode.id);
    setAddMenuFor(null);
    showToast("Nodo agregado");
  }

  function deleteNode(id) {
    if (flow.nodes.length <= 1) {
      showToast("No puedes borrar el único nodo");
      return;
    }

    setFlow((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      edges: prev.edges.filter((e) => e.from !== id && e.to !== id),
    }));

    const next = flow.nodes.find((n) => n.id !== id);
    setSelectedId(next?.id || null);
    showToast("Nodo eliminado");
  }

  function duplicateNode(id) {
    const node = flow.nodes.find((n) => n.id === id);
    if (!node) return;

    const copy = {
      ...node,
      id: uid(),
      title: node.title + " copia",
      x: node.x + 70,
      y: node.y + 70,
    };

    setFlow((prev) => ({
      ...prev,
      nodes: [...prev.nodes, copy],
    }));

    setSelectedId(copy.id);
    showToast("Nodo duplicado");
  }

  function saveFlow() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flow));
    showToast("Flujo guardado");
  }

  function publishFlow() {
    setFlow((prev) => ({ ...prev, status: "Publicado" }));
    showToast("Flujo publicado");
  }

  function resetFlow() {
    if (!confirm("¿Resetear flujo?")) return;
    setFlow(DEFAULT_FLOW);
    setSelectedId("n2");
    setZoom(0.9);
    setPan({ x: 40, y: 10 });
    showToast("Flujo reiniciado");
  }

  function canvasMouseDown(e) {
    if (
      e.target.closest(".flowNode") ||
      e.target.closest(".addMenu") ||
      e.target.closest(".plusBtn") ||
      e.target.closest(".canvasTools")
    ) {
      return;
    }

    draggingCanvas.current = true;
    dragStart.current = {
      x: e.clientX - pan.x,
      y: e.clientY - pan.y,
    };
  }

  function mouseMove(e) {
    if (draggingCanvas.current) {
      setPan({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    }

    if (draggingNode.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - pan.x) / zoom;
      const worldY = (e.clientY - rect.top - pan.y) / zoom;

      updateNode(draggingNode.current.id, {
        x: Math.round(worldX - draggingNode.current.offsetX),
        y: Math.round(worldY - draggingNode.current.offsetY),
      });
    }
  }

  function mouseUp() {
    draggingCanvas.current = false;
    draggingNode.current = null;
  }

  function nodeMouseDown(e, node) {
    if (e.target.closest("button") || e.target.closest(".addMenu")) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - pan.x) / zoom;
    const worldY = (e.clientY - rect.top - pan.y) / zoom;

    draggingNode.current = {
      id: node.id,
      offsetX: worldX - node.x,
      offsetY: worldY - node.y,
    };

    setSelectedId(node.id);
  }

  function edgePath(edge) {
    const from = flow.nodes.find((n) => n.id === edge.from);
    const to = flow.nodes.find((n) => n.id === edge.to);
    if (!from || !to) return "";

    const startX = from.x + 135;
    const startY = from.y + 105;
    const endX = to.x + 135;
    const endY = to.y;

    const midY = startY + (endY - startY) / 2;

    return `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
  }

  function Node({ node }) {
    const item = meta(node.type);
    const selected = selectedId === node.id;

    return (
      <div
        className={`flowNode ${selected ? "selected" : ""}`}
        style={{
          left: node.x,
          top: node.y,
          borderColor: selected ? "#60a5fa" : item.color,
        }}
        onMouseDown={(e) => nodeMouseDown(e, node)}
        onClick={() => setSelectedId(node.id)}
      >
        <div className="nodeHead">
          <div className="nodeIcon" style={{ color: item.color }}>
            {item.icon}
          </div>

          <div>
            <h3>{node.title}</h3>
            <small>{item.title}</small>
          </div>
        </div>

        <p>{node.text}</p>

        <div className="nodeTools">
          <button onClick={() => duplicateNode(node.id)}>⧉</button>
          <button onClick={() => deleteNode(node.id)}>🗑</button>
        </div>

        <button
          className="plusBtn"
          onClick={(e) => {
            e.stopPropagation();
            setAddMenuFor(addMenuFor === node.id ? null : node.id);
          }}
        >
          +
        </button>

        {addMenuFor === node.id && (
          <div className="addMenu">
            <div className="addTitle">Agregar paso</div>

            {NODE_TYPES.map((option) => (
              <button key={option.type} onClick={() => addNodeAfter(node.id, option.type)}>
                <span style={{ color: option.color }}>{option.icon}</span>
                <div>
                  <b>{option.title}</b>
                  <small>{option.description}</small>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="respondFlow" onMouseMove={mouseMove} onMouseUp={mouseUp}>
      <style>{styles}</style>

      {toast && <div className="toast">{toast}</div>}

      <header className="rfTopbar">
        <div className="rfLeft">
          <button className="backBtn">‹</button>
          <div>
            <h1>{flow.name}</h1>
            <p>papel</p>
          </div>
          <button className="editName">✎</button>
        </div>

        <div className="rfRight">
          <span>Última actualización hace 3 horas</span>
          <button className="plain">⚙</button>
          <button className="plain">Ahorrar</button>
          <button className="plain">Prueba</button>
          <button className="publish" onClick={publishFlow}>Publicar</button>
        </div>
      </header>

      <div className="notice">
        <span>ℹ</span>
        Tu periodo de prueba finaliza pronto. Actualiza ahora para evitar interrupciones.
        <button>Actualiza ahora</button>
      </div>

      <section className="rfWorkspace">
        <aside className="miniSidebar">
          <button>N/</button>
          <button>📘</button>
          <button>▦</button>
          <button>⏱</button>
          <button>👤</button>
          <button>📣</button>
          <button>🔀</button>
          <button>📊</button>
          <button>⚙</button>
        </aside>

        <main className="canvas" ref={canvasRef} onMouseDown={canvasMouseDown}>
          <div className="canvasTools">
            <button onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(1)))}>+</button>
            <button onClick={() => setZoom((z) => Math.max(0.45, +(z - 0.1).toFixed(1)))}>−</button>
            <button onClick={() => { setZoom(0.9); setPan({ x: 40, y: 10 }); }}>⌖</button>
          </div>

          <div className="undoRedo">
            <button>↶</button>
            <button>↷</button>
          </div>

          <div className="zoomBadge">{Math.round(zoom * 100)}%</div>

          <div
            className="world"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            <svg width="2800" height="1900" className="edges">
              {flow.edges.map((edge, index) => {
                const from = flow.nodes.find((n) => n.id === edge.from);
                const to = flow.nodes.find((n) => n.id === edge.to);
                if (!from || !to) return null;

                const labelX = (from.x + to.x) / 2 + 135;
                const labelY = (from.y + to.y) / 2 + 70;

                return (
                  <g key={index}>
                    <path d={edgePath(edge)} className="edgePath" />
                    {edge.label && (
                      <foreignObject x={labelX - 45} y={labelY - 13} width="90" height="28">
                        <div className="edgeLabel">{edge.label}</div>
                      </foreignObject>
                    )}
                  </g>
                );
              })}
            </svg>

            {flow.nodes.map((node) => (
              <Node node={node} key={node.id} />
            ))}
          </div>
        </main>

        <aside className="rightPanel">
          {selectedNode ? (
            <>
              <div className="panelTitle">
                <div className="panelIcon" style={{ color: meta(selectedNode.type).color }}>
                  {meta(selectedNode.type).icon}
                </div>
                <div>
                  <h2>{selectedNode.title}</h2>
                  <a>Aprenda las mejores prácticas de este paso ↗</a>
                </div>
              </div>

              <p className="helpText">{meta(selectedNode.type).description}</p>

              <div className="field">
                <label>Nombre del paso</label>
                <input
                  value={selectedNode.title}
                  onChange={(e) => updateNode(selectedNode.id, { title: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Tipo de paso</label>
                <select
                  value={selectedNode.type}
                  onChange={(e) => {
                    const next = meta(e.target.value);
                    updateNode(selectedNode.id, {
                      type: e.target.value,
                      title: next.title,
                      text: next.description,
                    });
                  }}
                >
                  {NODE_TYPES.map((n) => (
                    <option value={n.type} key={n.type}>
                      {n.icon} {n.title}
                    </option>
                  ))}
                </select>
              </div>

              {selectedNode.type === "message" && (
                <>
                  <div className="field">
                    <label>Canal</label>
                    <select>
                      <option>Último canal con el que interactuó</option>
                      <option>WhatsApp</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>Tipo de mensaje</label>
                    <select>
                      <option>Texto</option>
                      <option>Imagen</option>
                      <option>Audio</option>
                      <option>Video</option>
                      <option>Documento</option>
                    </select>
                  </div>
                </>
              )}

              <div className="field">
                <label>Contenido del mensaje</label>
                <textarea
                  value={selectedNode.text}
                  onChange={(e) => updateNode(selectedNode.id, { text: e.target.value })}
                />
              </div>

              {selectedNode.type === "branch" && (
                <div className="configBox">
                  <h3>Sucursal N.º 1</h3>

                  <div className="conditionLine">
                    <select>
                      <option>Lifecycle</option>
                      <option>Etiqueta</option>
                      <option>Mensaje recibido</option>
                      <option>Estado de pago</option>
                    </select>

                    <select>
                      <option>exists</option>
                      <option>contiene</option>
                      <option>es igual a</option>
                    </select>
                  </div>

                  <div className="conditionLine">
                    <select>
                      <option>Assignee Status</option>
                      <option>Interesado</option>
                      <option>Pagó</option>
                    </select>

                    <select>
                      <option>Operador</option>
                      <option>Admin</option>
                    </select>
                  </div>

                  <button className="blueButton">+ Agregar filtro</button>
                </div>
              )}

              {selectedNode.type === "delay" && (
                <div className="configBox">
                  <h3>Tiempo de espera</h3>
                  <div className="conditionLine">
                    <input placeholder="23" />
                    <select>
                      <option>minutos</option>
                      <option>horas</option>
                      <option>días</option>
                    </select>
                  </div>
                </div>
              )}

              {selectedNode.type === "payment" && (
                <div className="configBox">
                  <h3>Métodos de pago</h3>
                  <div className="payGrid">
                    <button>QR</button>
                    <button>Depósito</button>
                    <button>Tigo Money</button>
                    <button>Hotmart</button>
                  </div>
                </div>
              )}

              <button className="addResponse">+ Agregar respuesta de canal</button>

              <div className="advanced">
                <h3>Configuración avanzada</h3>
                <label><input type="checkbox" /> Agregar rama de error de mensaje</label>
                <label><input type="checkbox" /> Detener si el contacto responde</label>
              </div>

              <div className="panelActions">
                <button className="save" onClick={saveFlow}>Guardar cambios</button>
                <button className="delete" onClick={() => deleteNode(selectedNode.id)}>Eliminar paso</button>
              </div>
            </>
          ) : (
            <div className="empty">Selecciona un nodo</div>
          )}
        </aside>
      </section>
    </div>
  );
}

const styles = `
.respondFlow {
  height: calc(100vh - 150px);
  min-height: 780px;
  background: #07101f;
  border: 1px solid rgba(148,163,184,.14);
  border-radius: 26px;
  overflow: hidden;
  color: #e5e7eb;
  display: flex;
  flex-direction: column;
}

.rfTopbar {
  height: 58px;
  min-height: 58px;
  background: rgba(15,23,42,.98);
  border-bottom: 1px solid rgba(148,163,184,.14);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
}

.rfLeft,
.rfRight {
  display: flex;
  align-items: center;
  gap: 10px;
}

.backBtn,
.editName,
.plain,
.publish {
  height: 34px;
  border: 0;
  border-radius: 11px;
  padding: 0 12px;
  cursor: pointer;
  font-weight: 900;
}

.backBtn,
.editName,
.plain {
  background: rgba(255,255,255,.07);
  color: white;
}

.publish {
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  color: #031827;
}

.rfLeft h1 {
  margin: 0;
  font-size: 16px;
}

.rfLeft p {
  margin: 1px 0 0;
  color: #94a3b8;
  font-size: 12px;
}

.rfRight span {
  color: #94a3b8;
  font-size: 12px;
}

.notice {
  height: 38px;
  min-height: 38px;
  background: rgba(37,99,235,.16);
  border-bottom: 1px solid rgba(96,165,250,.16);
  color: #bfdbfe;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 16px;
  font-size: 13px;
}

.notice button {
  margin-left: auto;
  height: 28px;
  border: 0;
  border-radius: 9px;
  background: #2563eb;
  color: white;
  font-weight: 900;
  padding: 0 12px;
}

.rfWorkspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 48px 1fr 390px;
}

.miniSidebar {
  background: rgba(8,13,30,.98);
  border-right: 1px solid rgba(148,163,184,.12);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 6px;
  gap: 9px;
}

.miniSidebar button {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: rgba(255,255,255,.07);
  color: white;
  cursor: pointer;
}

.canvas {
  position: relative;
  overflow: hidden;
  cursor: grab;
  background:
    radial-gradient(circle at 65% 20%, rgba(6,182,212,.06), transparent 34%),
    linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px),
    #07101f;
  background-size: auto, 22px 22px, 22px 22px, auto;
}

.canvas:active {
  cursor: grabbing;
}

.canvasTools {
  position: absolute;
  left: 16px;
  top: 16px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  background: rgba(15,23,42,.94);
  border: 1px solid rgba(148,163,184,.14);
  border-radius: 13px;
  overflow: hidden;
}

.canvasTools button,
.undoRedo button {
  width: 38px;
  height: 36px;
  border: 0;
  background: transparent;
  color: white;
  cursor: pointer;
  font-size: 18px;
}

.canvasTools button:hover,
.undoRedo button:hover {
  background: rgba(6,182,212,.16);
}

.undoRedo {
  position: absolute;
  left: 16px;
  top: 142px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  background: rgba(15,23,42,.94);
  border: 1px solid rgba(148,163,184,.14);
  border-radius: 13px;
  overflow: hidden;
}

.zoomBadge {
  position: absolute;
  left: 65px;
  top: 16px;
  z-index: 20;
  background: rgba(15,23,42,.94);
  border: 1px solid rgba(148,163,184,.14);
  border-radius: 12px;
  padding: 8px 10px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 900;
}

.world {
  position: absolute;
  width: 2800px;
  height: 1900px;
  transform-origin: 0 0;
}

.edges {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.edgePath {
  fill: none;
  stroke: #14b8a6;
  stroke-width: 3;
  stroke-linecap: round;
  opacity: .9;
}

.edgeLabel {
  width: 100%;
  height: 26px;
  border-radius: 999px;
  background: rgba(37,99,235,.2);
  color: #93c5fd;
  border: 1px solid rgba(147,197,253,.28);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 1000;
}

.flowNode {
  position: absolute;
  width: 270px;
  min-height: 105px;
  border: 2px solid #14b8a6;
  border-radius: 16px;
  background: rgba(15,23,42,.98);
  padding: 12px;
  cursor: grab;
  user-select: none;
  box-shadow: 0 22px 70px rgba(0,0,0,.3);
  transition: transform .16s ease, box-shadow .16s ease;
}

.flowNode:hover {
  transform: translateY(-2px);
}

.flowNode.selected {
  box-shadow: 0 0 0 5px rgba(96,165,250,.14), 0 22px 70px rgba(0,0,0,.34);
}

.nodeHead {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nodeIcon {
  width: 32px;
  height: 32px;
  border-radius: 11px;
  background: rgba(255,255,255,.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.flowNode h3 {
  margin: 0;
  font-size: 13px;
}

.flowNode small {
  color: #94a3b8;
  font-size: 11px;
}

.flowNode p {
  margin: 10px 0 0;
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1.45;
}

.nodeTools {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.nodeTools button {
  height: 26px;
  border: 0;
  border-radius: 8px;
  background: rgba(255,255,255,.08);
  color: #cbd5e1;
  cursor: pointer;
}

.plusBtn {
  position: absolute;
  left: 50%;
  bottom: -44px;
  transform: translateX(-50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid rgba(20,184,166,.72);
  background: #07101f;
  color: #5eead4;
  font-weight: 1000;
  font-size: 18px;
  cursor: pointer;
  z-index: 50;
}

.plusBtn:hover {
  background: #14b8a6;
  color: #031827;
}

.addMenu {
  position: absolute;
  left: 50%;
  bottom: -410px;
  transform: translateX(-50%);
  width: 330px;
  padding: 12px;
  background: rgba(8,13,30,.99);
  border: 1px solid rgba(148,163,184,.16);
  border-radius: 20px;
  box-shadow: 0 34px 110px rgba(0,0,0,.58);
  z-index: 90;
}

.addTitle {
  color: #67e8f9;
  font-size: 12px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin: 4px 8px 10px;
}

.addMenu button {
  width: 100%;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: white;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px;
  text-align: left;
  cursor: pointer;
}

.addMenu button:hover {
  background: rgba(6,182,212,.12);
}

.addMenu button span {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: 12px;
  background: rgba(255,255,255,.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.addMenu b {
  display: block;
}

.addMenu small {
  color: #94a3b8;
  display: block;
  margin-top: 2px;
}

.rightPanel {
  background: rgba(15,23,42,.98);
  border-left: 1px solid rgba(148,163,184,.12);
  padding: 18px;
  overflow-y: auto;
}

.panelTitle {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.panelIcon {
  width: 44px;
  height: 44px;
  min-width: 44px;
  border-radius: 15px;
  background: rgba(255,255,255,.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.panelTitle h2 {
  margin: 0;
  font-size: 20px;
}

.panelTitle a {
  display: block;
  color: #60a5fa;
  font-size: 12px;
  margin-top: 4px;
}

.helpText {
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.55;
  margin: 0 0 18px;
}

.field {
  margin-bottom: 14px;
}

.field label {
  display: block;
  font-size: 12px;
  color: #cbd5e1;
  font-weight: 1000;
  margin-bottom: 7px;
}

.field input,
.field select,
.field textarea,
.configBox input,
.configBox select {
  width: 100%;
  border: 1px solid rgba(148,163,184,.16);
  border-radius: 13px;
  background: rgba(255,255,255,.06);
  color: white;
  padding: 12px;
  outline: none;
}

.field textarea {
  min-height: 130px;
  resize: vertical;
}

.configBox {
  border-radius: 18px;
  background: rgba(255,255,255,.045);
  border: 1px solid rgba(148,163,184,.12);
  padding: 14px;
  margin-bottom: 14px;
}

.configBox h3,
.advanced h3 {
  margin: 0 0 12px;
}

.conditionLine {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 8px;
}

.blueButton,
.addResponse {
  height: 38px;
  border: 0;
  border-radius: 12px;
  background: #2563eb;
  color: white;
  font-weight: 900;
  padding: 0 12px;
  cursor: pointer;
}

.addResponse {
  width: 100%;
  margin-bottom: 18px;
}

.payGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.payGrid button {
  height: 38px;
  border: 0;
  border-radius: 12px;
  background: rgba(6,182,212,.14);
  color: #67e8f9;
  font-weight: 900;
  cursor: pointer;
}

.advanced {
  padding-top: 16px;
  margin-top: 16px;
  border-top: 1px solid rgba(148,163,184,.12);
}

.advanced label {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #cbd5e1;
  margin-bottom: 10px;
  font-size: 13px;
}

.panelActions {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 18px;
}

.save,
.delete {
  height: 44px;
  border: 0;
  border-radius: 14px;
  font-weight: 1000;
  cursor: pointer;
}

.save {
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  color: #031827;
}

.delete {
  background: rgba(127,29,29,.85);
  color: #fecaca;
}

.toast {
  position: fixed;
  top: 22px;
  right: 24px;
  z-index: 9999;
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  color: #031827;
  padding: 13px 18px;
  border-radius: 16px;
  font-weight: 1000;
}

.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
}

@media (max-width: 1100px) {
  .rfWorkspace {
    grid-template-columns: 48px 1fr;
  }

  .rightPanel {
    grid-column: 1 / -1;
    min-height: 420px;
  }
}

@media (max-width: 760px) {
  .respondFlow {
    height: auto;
  }

  .rfWorkspace {
    grid-template-columns: 1fr;
  }

  .miniSidebar {
    flex-direction: row;
  }

  .canvas {
    min-height: 760px;
  }

  .rfTopbar {
    height: auto;
    padding: 14px;
    flex-direction: column;
    align-items: flex-start;
  }

  .rfRight {
    flex-wrap: wrap;
  }
}
`;