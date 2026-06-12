/**
 * MacBot — Minimapa del flow builder.
 * Fase 2: click/drag en minimapa mueve el viewport del canvas.
 */
(function () {
  "use strict";

  /** Contenido ocupa ~88% del área del minimapa (margen ~6% por lado). */
  const CONTENT_FILL = 0.88;
  const MIN_CONTENT_SPAN = 64;

  const NODE_COLORS = {
    inicio: { fill: "#39ff14", stroke: "#ecfccb" },
    openai_agent: { fill: "#8b5cf6", stroke: "#ddd6fe" },
    ia_pro: { fill: "#a78bfa", stroke: "#ede9fe" },
    ia: { fill: "#38bdf8", stroke: "#e0f2fe" },
    lector_pago: { fill: "#f59e0b", stroke: "#fef3c7" },
    conversion: { fill: "#22c55e", stroke: "#bbf7d0" },
    contenido: { fill: "#06b6d4", stroke: "#cffafe" },
    seguimiento_crm_v2: { fill: "#22d3ee", stroke: "#cffafe" },
    seguimiento: { fill: "#64748b", stroke: "#cbd5e1" },
    remarketing_global: { fill: "#ff7a18", stroke: "#ffedd5" },
    espera: { fill: "#475569", stroke: "#94a3b8" },
    etiqueta: { fill: "#ec4899", stroke: "#fce7f3" },
  };

  const state = {
    root: null,
    svg: null,
    gridEl: null,
    edgesGroup: null,
    nodesGroup: null,
    viewportGlowEl: null,
    viewportEl: null,
    rafId: 0,
    pending: false,
    getViewport: null,
    getConnections: null,
    getCanvas: null,
    getWrap: null,
    setViewportCenter: null,
    lastViewBox: "",
    lastBounds: null,
    panBound: false,
  };

  const panState = {
    active: false,
    pointerId: null,
    panRafId: 0,
    pendingCenter: null,
  };

  function readNodeBounds(nodo) {
    const left = parseFloat(nodo.style.left);
    const top = parseFloat(nodo.style.top);
    const x = Number.isFinite(left) ? left : nodo.offsetLeft;
    const y = Number.isFinite(top) ? top : nodo.offsetTop;
    const w = Math.max(nodo.offsetWidth || 0, 1);
    const h = Math.max(nodo.offsetHeight || 0, 1);

    return {
      x,
      y,
      w,
      h,
      cx: x + w / 2,
      cy: y + h / 2,
    };
  }

  function expandBounds(acc, x, y, w, h) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const spanW = Math.max(w, 0);
    const spanH = Math.max(h, 0);

    acc.minX = Math.min(acc.minX, x);
    acc.minY = Math.min(acc.minY, y);
    acc.maxX = Math.max(acc.maxX, x + spanW);
    acc.maxY = Math.max(acc.maxY, y + spanH);
    acc.has = true;
  }

  /**
   * Bounds del flujo (solo nodos), auto-fit ~88% y centrado.
   * El viewport se dibuja en coords mundo; puede recortarse si está muy lejos.
   */
  function computeContentBounds(nodes) {
    const acc = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      has: false,
    };

    nodes.forEach(function (nodo) {
      const b = readNodeBounds(nodo);
      expandBounds(acc, b.x, b.y, b.w, b.h);
    });

    if (!acc.has) {
      return { minX: 0, minY: 0, width: 320, height: 200, span: 320 };
    }

    const contentW = Math.max(acc.maxX - acc.minX, MIN_CONTENT_SPAN);
    const contentH = Math.max(acc.maxY - acc.minY, MIN_CONTENT_SPAN);
    const cx = (acc.minX + acc.maxX) / 2;
    const cy = (acc.minY + acc.maxY) / 2;

    const viewW = contentW / CONTENT_FILL;
    const viewH = contentH / CONTENT_FILL;

    return {
      minX: cx - viewW / 2,
      minY: cy - viewH / 2,
      width: viewW,
      height: viewH,
      span: Math.max(viewW, viewH),
    };
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

  function strokeForBounds(bounds, ratio, minPx) {
    const span = bounds && bounds.span ? bounds.span : 400;
    return Math.max(span * ratio, minPx);
  }

  function nodeColorsForTipo(tipo) {
    return NODE_COLORS[tipo] || { fill: "#4b9efa", stroke: "#bfdbfe" };
  }

  function renderMinimapNodes(nodesGroup, nodes, bounds) {
    if (!nodesGroup) return;

    const minW = strokeForBounds(bounds, 0.032, 10);
    const minH = strokeForBounds(bounds, 0.042, 7);
    const nodeStroke = strokeForBounds(bounds, 0.004, 1.2);
    const frag = document.createDocumentFragment();

    nodes.forEach(function (nodo) {
      const b = readNodeBounds(nodo);
      const w = Math.max(b.w, minW);
      const h = Math.max(b.h, minH);
      const x = b.x + (b.w - w) / 2;
      const y = b.y + (b.h - h) / 2;
      const colors = nodeColorsForTipo(nodo.dataset.tipo || "");
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");

      rect.setAttribute("class", "builder-minimap-node");
      rect.setAttribute("data-tipo", nodo.dataset.tipo || "");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(w));
      rect.setAttribute("height", String(h));
      rect.setAttribute("rx", String(Math.min(w, h) * 0.22));
      rect.setAttribute("fill", colors.fill);
      rect.setAttribute("stroke", colors.stroke);
      rect.setAttribute("stroke-width", String(nodeStroke));
      frag.appendChild(rect);
    });

    nodesGroup.replaceChildren(frag);
  }

  function renderMinimapEdges(edgesGroup, connections, bounds) {
    if (!edgesGroup) return;

    const edgeStroke = strokeForBounds(bounds, 0.0055, 2.2);
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
      line.setAttribute("stroke-width", String(edgeStroke));
      frag.appendChild(line);
    });

    edgesGroup.replaceChildren(frag);
  }

  function renderMinimapViewport(glowEl, viewportEl, visible, bounds) {
    if (!viewportEl || !visible) return;

    const x = visible.x;
    const y = visible.y;
    const w = Math.max(visible.w, strokeForBounds(bounds, 0.04, 12));
    const h = Math.max(visible.h, strokeForBounds(bounds, 0.05, 10));
    const strokeW = strokeForBounds(bounds, 0.011, 3.5);
    const glowPad = strokeForBounds(bounds, 0.008, 2.5);

    viewportEl.setAttribute("x", String(x));
    viewportEl.setAttribute("y", String(y));
    viewportEl.setAttribute("width", String(w));
    viewportEl.setAttribute("height", String(h));
    viewportEl.setAttribute("stroke-width", String(strokeW));
    viewportEl.setAttribute("rx", String(strokeForBounds(bounds, 0.006, 2)));

    if (glowEl) {
      glowEl.setAttribute("x", String(x - glowPad));
      glowEl.setAttribute("y", String(y - glowPad));
      glowEl.setAttribute("width", String(w + glowPad * 2));
      glowEl.setAttribute("height", String(h + glowPad * 2));
      glowEl.setAttribute("stroke-width", String(strokeW + 1.5));
      glowEl.setAttribute("rx", String(strokeForBounds(bounds, 0.008, 3)));
    }
  }

  function syncGridBackground() {
    if (!state.gridEl) return;
    state.gridEl.style.backgroundSize = "10px 10px";
  }

  function updateBuilderMinimap() {
    if (!state.root || !state.svg) return;

    const canvas = state.getCanvas && state.getCanvas();
    if (!canvas) return;

    const nodes = Array.from(canvas.querySelectorAll(".node"));
    const visibleRect = computeVisibleWorldRect(state.getViewport, state.getWrap);
    const bounds = computeContentBounds(nodes);
    const viewBox =
      bounds.minX + " " + bounds.minY + " " + bounds.width + " " + bounds.height;

    if (state.lastViewBox !== viewBox) {
      state.svg.setAttribute("viewBox", viewBox);
      state.lastViewBox = viewBox;
      syncGridBackground();
    }

    state.lastBounds = bounds;

    renderMinimapEdges(state.edgesGroup, state.getConnections && state.getConnections(), bounds);
    renderMinimapNodes(state.nodesGroup, nodes, bounds);
    renderMinimapViewport(
      state.viewportGlowEl,
      state.viewportEl,
      visibleRect,
      bounds
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

  function clientPointToWorld(clientX, clientY) {
    const svg = state.svg;
    if (!svg || typeof svg.createSVGPoint !== "function") return null;

    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;

    const ctm = svg.getScreenCTM();
    if (!ctm) return null;

    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function flushPanToWorld() {
    panState.panRafId = 0;
    if (!panState.pendingCenter || !state.setViewportCenter) return;

    const target = panState.pendingCenter;
    panState.pendingCenter = null;
    state.setViewportCenter(target.x, target.y);
  }

  function schedulePanToWorld(worldX, worldY) {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;

    panState.pendingCenter = { x: worldX, y: worldY };

    if (!panState.panRafId) {
      panState.panRafId = window.requestAnimationFrame(flushPanToWorld);
    }
  }

  function onMinimapPointerDown(e) {
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const world = clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;

    panState.active = true;
    panState.pointerId = e.pointerId;

    if (state.root && state.root.setPointerCapture) {
      state.root.setPointerCapture(e.pointerId);
    }

    state.root.classList.add("builder-minimap--dragging");
    schedulePanToWorld(world.x, world.y);
  }

  function onMinimapPointerMove(e) {
    if (!panState.active || e.pointerId !== panState.pointerId) return;

    e.preventDefault();
    e.stopPropagation();

    const world = clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;

    schedulePanToWorld(world.x, world.y);
  }

  function endMinimapPan(e) {
    if (!panState.active || (e && e.pointerId !== panState.pointerId)) return;

    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    panState.active = false;
    panState.pointerId = null;

    if (state.root) {
      if (e && state.root.releasePointerCapture) {
        try {
          state.root.releasePointerCapture(e.pointerId);
        } catch (_err) {
          /* pointer already released */
        }
      }
      state.root.classList.remove("builder-minimap--dragging");
    }

    flushPanToWorld();
    scheduleUpdateBuilderMinimap();
  }

  function onMinimapWheel(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function bindMinimapPan() {
    if (state.panBound || !state.root) return;

    state.root.addEventListener("pointerdown", onMinimapPointerDown);
    state.root.addEventListener("pointermove", onMinimapPointerMove);
    state.root.addEventListener("pointerup", endMinimapPan);
    state.root.addEventListener("pointercancel", endMinimapPan);
    state.root.addEventListener("wheel", onMinimapWheel, { passive: false });

    state.panBound = true;
  }

  function assignMinimapOptions(options) {
    state.getViewport = options.getViewport || null;
    state.getConnections = options.getConnections || null;
    state.getCanvas = options.getCanvas || null;
    state.getWrap = options.getWrap || null;
    state.setViewportCenter = options.setViewportCenter || null;
  }

  function cacheMinimapElements(wrap) {
    const root = wrap.querySelector(".builder-minimap");
    if (!root) return false;

    state.root = root;
    state.svg = root.querySelector(".builder-minimap-svg");
    state.gridEl = root.querySelector(".builder-minimap-grid");
    state.edgesGroup = state.svg && state.svg.querySelector(".builder-minimap-edges");
    state.nodesGroup = state.svg && state.svg.querySelector(".builder-minimap-nodes");
    state.viewportGlowEl = state.svg && state.svg.querySelector(".builder-minimap-viewport-glow");
    state.viewportEl = state.svg && state.svg.querySelector(".builder-minimap-viewport");
    return Boolean(state.svg);
  }

  function initBuilderMinimap(options) {
    options = options || {};

    const wrap = options.getWrap && options.getWrap();
    if (!wrap) return;

    assignMinimapOptions(options);

    if (wrap.querySelector(".builder-minimap")) {
      cacheMinimapElements(wrap);
      bindMinimapPan();
      scheduleUpdateBuilderMinimap();
      return;
    }

    const root = document.createElement("div");
    root.className = "builder-minimap";
    root.setAttribute("role", "application");
    root.setAttribute("aria-label", "Minimapa del flujo — click o arrastra para navegar");

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

    const viewportGlowEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    viewportGlowEl.setAttribute("class", "builder-minimap-viewport-glow");

    const viewportEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    viewportEl.setAttribute("class", "builder-minimap-viewport");

    svg.appendChild(edgesGroup);
    svg.appendChild(nodesGroup);
    svg.appendChild(viewportGlowEl);
    svg.appendChild(viewportEl);

    root.appendChild(gridEl);
    root.appendChild(svg);
    wrap.appendChild(root);

    state.root = root;
    state.svg = svg;
    state.gridEl = gridEl;
    state.edgesGroup = edgesGroup;
    state.nodesGroup = nodesGroup;
    state.viewportGlowEl = viewportGlowEl;
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
