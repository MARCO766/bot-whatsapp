/**
 * MacBot — Minimapa del flow builder (solo lectura / visual).
 * Fase 1: refleja nodos, conexiones y viewport. Pan por click/drag en fase 2.
 */
(function () {
  "use strict";

  const MIN_NODE_W = 6;
  const MIN_NODE_H = 4;
  const WORLD_PAD = 56;

  const state = {
    root: null,
    svg: null,
    gridEl: null,
    edgesGroup: null,
    nodesGroup: null,
    viewportEl: null,
    rafId: 0,
    pending: false,
    getViewport: null,
    getConnections: null,
    getCanvas: null,
    getWrap: null,
    lastViewBox: "",
  };

  function readNodeBounds(nodo) {
    const left = parseFloat(nodo.style.left);
    const top = parseFloat(nodo.style.top);
    const x = Number.isFinite(left) ? left : nodo.offsetLeft;
    const y = Number.isFinite(top) ? top : nodo.offsetTop;
    const w = Math.max(nodo.offsetWidth || MIN_NODE_W, MIN_NODE_W);
    const h = Math.max(nodo.offsetHeight || MIN_NODE_H, MIN_NODE_H);

    return {
      x,
      y,
      w,
      h,
      cx: x + w / 2,
      cy: y + h / 2,
    };
  }

  function computeWorldBounds(canvas, nodes) {
    const canvasW = canvas.offsetWidth || 800;
    const canvasH = canvas.offsetHeight || 600;

    let minX = 0;
    let minY = 0;
    let maxX = canvasW;
    let maxY = canvasH;

    nodes.forEach(function (nodo) {
      const b = readNodeBounds(nodo);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    });

    minX -= WORLD_PAD;
    minY -= WORLD_PAD;
    maxX += WORLD_PAD;
    maxY += WORLD_PAD;

    const width = Math.max(maxX - minX, 120);
    const height = Math.max(maxY - minY, 120);

    return { minX, minY, width, height };
  }

  function computeVisibleWorldRect(getViewport, getWrap) {
    const wrap = getWrap && getWrap();
    const viewport = (getViewport && getViewport()) || { panX: 0, panY: 0, zoom: 1 };
    const zoom = viewport.zoom > 0 ? viewport.zoom : 1;

    if (!wrap) {
      return { x: 0, y: 0, w: 400, h: 300 };
    }

    const rect = wrap.getBoundingClientRect();

    return {
      x: -viewport.panX / zoom,
      y: -viewport.panY / zoom,
      w: rect.width / zoom,
      h: rect.height / zoom,
    };
  }

  function nodeFillForTipo(tipo) {
    if (tipo === "inicio") return "rgba(57, 255, 20, 0.85)";
    if (tipo === "seguimiento_crm_v2") return "rgba(34, 211, 238, 0.72)";
    if (tipo === "remarketing_global") return "rgba(255, 122, 24, 0.78)";
    return "rgba(75, 207, 250, 0.62)";
  }

  function renderMinimapNodes(nodesGroup, nodes) {
    if (!nodesGroup) return;

    const frag = document.createDocumentFragment();

    nodes.forEach(function (nodo) {
      const b = readNodeBounds(nodo);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("class", "builder-minimap-node");
      rect.setAttribute("x", String(b.x));
      rect.setAttribute("y", String(b.y));
      rect.setAttribute("width", String(Math.max(b.w, MIN_NODE_W)));
      rect.setAttribute("height", String(Math.max(b.h, MIN_NODE_H)));
      rect.setAttribute("rx", "2");
      rect.setAttribute("fill", nodeFillForTipo(nodo.dataset.tipo || ""));
      frag.appendChild(rect);
    });

    nodesGroup.replaceChildren(frag);
  }

  function renderMinimapEdges(edgesGroup, connections, nodeById) {
    if (!edgesGroup) return;

    const frag = document.createDocumentFragment();

    (connections || []).forEach(function (conn) {
      const desde = conn && conn.desde;
      const hasta = conn && conn.hasta;
      if (!desde || !hasta) return;
      if (!document.body.contains(desde) || !document.body.contains(hasta)) return;

      const a = readNodeBounds(desde);
      const b = readNodeBounds(hasta);

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "builder-minimap-edge");
      line.setAttribute("x1", String(a.cx));
      line.setAttribute("y1", String(a.cy));
      line.setAttribute("x2", String(b.cx));
      line.setAttribute("y2", String(b.cy));
      frag.appendChild(line);

      if (nodeById) {
        nodeById[desde.id] = true;
        nodeById[hasta.id] = true;
      }
    });

    edgesGroup.replaceChildren(frag);
  }

  function renderMinimapViewport(viewportEl, visible) {
    if (!viewportEl || !visible) return;

    viewportEl.setAttribute("x", String(visible.x));
    viewportEl.setAttribute("y", String(visible.y));
    viewportEl.setAttribute("width", String(Math.max(visible.w, 8)));
    viewportEl.setAttribute("height", String(Math.max(visible.h, 8)));
  }

  function syncGridBackground(bounds) {
    if (!state.gridEl || !bounds) return;

    const step = Math.max(12, Math.round(Math.min(bounds.width, bounds.height) / 14));
    state.gridEl.style.backgroundSize = step + "px " + step + "px";
  }

  function updateBuilderMinimap() {
    if (!state.root || !state.svg) return;

    const canvas = state.getCanvas && state.getCanvas();
    if (!canvas) return;

    const nodes = Array.from(canvas.querySelectorAll(".node"));
    const bounds = computeWorldBounds(canvas, nodes);
    const viewBox = bounds.minX + " " + bounds.minY + " " + bounds.width + " " + bounds.height;

    if (state.lastViewBox !== viewBox) {
      state.svg.setAttribute("viewBox", viewBox);
      state.lastViewBox = viewBox;
      syncGridBackground(bounds);
    }

    renderMinimapEdges(state.edgesGroup, state.getConnections && state.getConnections(), null);
    renderMinimapNodes(state.nodesGroup, nodes);
    renderMinimapViewport(
      state.viewportEl,
      computeVisibleWorldRect(state.getViewport, state.getWrap)
    );
  }

  function scheduleUpdateBuilderMinimap() {
    if (state.pending) return;
    state.pending = true;

    state.rafId = window.requestAnimationFrame(function () {
      state.pending = false;
      updateBuilderMinimap();
    });
  }

  function bindMinimapPan() {
    /* Fase 2: click/drag en minimapa para mover viewport del canvas. */
  }

  function initBuilderMinimap(options) {
    options = options || {};

    const wrap = options.getWrap && options.getWrap();
    if (!wrap || wrap.querySelector(".builder-minimap")) {
      state.getViewport = options.getViewport || null;
      state.getConnections = options.getConnections || null;
      state.getCanvas = options.getCanvas || null;
      state.getWrap = options.getWrap || null;
      scheduleUpdateBuilderMinimap();
      return;
    }

    state.getViewport = options.getViewport || null;
    state.getConnections = options.getConnections || null;
    state.getCanvas = options.getCanvas || null;
    state.getWrap = options.getWrap || null;

    const root = document.createElement("div");
    root.className = "builder-minimap";
    root.setAttribute("role", "img");
    root.setAttribute("aria-label", "Minimapa del flujo");

    const gridEl = document.createElement("div");
    gridEl.className = "builder-minimap-grid";
    gridEl.setAttribute("aria-hidden", "true");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "builder-minimap-svg");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const edgesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    edgesGroup.setAttribute("class", "builder-minimap-edges");

    const nodesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    nodesGroup.setAttribute("class", "builder-minimap-nodes");

    const viewportEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    viewportEl.setAttribute("class", "builder-minimap-viewport");

    svg.appendChild(edgesGroup);
    svg.appendChild(nodesGroup);
    svg.appendChild(viewportEl);

    root.appendChild(gridEl);
    root.appendChild(svg);
    wrap.appendChild(root);

    state.root = root;
    state.svg = svg;
    state.gridEl = gridEl;
    state.edgesGroup = edgesGroup;
    state.nodesGroup = nodesGroup;
    state.viewportEl = viewportEl;

    bindMinimapPan();
    scheduleUpdateBuilderMinimap();
  }

  window.MacBotBuilderMinimap = {
    init: initBuilderMinimap,
    update: updateBuilderMinimap,
    scheduleUpdate: scheduleUpdateBuilderMinimap,
    renderMinimapNodes: renderMinimapNodes,
    renderMinimapEdges: renderMinimapEdges,
    renderMinimapViewport: renderMinimapViewport,
    bindMinimapPan: bindMinimapPan,
  };
})();
