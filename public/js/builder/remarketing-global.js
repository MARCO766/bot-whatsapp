/**
 * MacBot — Nodo cerebro: Remarketing Global 24h (Fase 1)
 * No avanza el flujo; configuración global del flujo.
 */
window.MacBotRemarketingGlobal = (function () {
  function crearConfigVacia() {
    return {
      version: 1,
      activo: false,
      horasInactividad: 23,
      detenerSiResponde: false,
      reiniciarAlResponder: true,
      detenerEnConversion: true,
      mensajeRemarketing: "",
      modoContextual: false,
    };
  }

  let nodoActivo = null;
  let configActiva = crearConfigVacia();

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function leerTextareaJson(ta) {
    if (!ta) return null;
    const raw = String(ta.value || ta.textContent || "").trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function leerConfigDeNodo(nodo) {
    const base = crearConfigVacia();
    if (!nodo) return base;

    const ta = nodo.querySelector?.(".remarketing-global-data");
    let parsed = leerTextareaJson(ta);

    if (!parsed && nodo.__rm24hConfig && typeof nodo.__rm24hConfig === "object") {
      parsed = nodo.__rm24hConfig;
    }

    if (!parsed || typeof parsed !== "object") return base;

    const config = Object.assign({}, base, parsed, {
      horasInactividad: 23,
      detenerSiResponde: false,
      reiniciarAlResponder: parsed.reiniciarAlResponder !== false,
      detenerEnConversion: parsed.detenerEnConversion !== false,
    });

    nodo.__rm24hConfig = config;
    return config;
  }

  function guardarConfigEnNodo(nodo, config) {
    if (!nodo || !config) return;
    const json = JSON.stringify(config);
    const ta = nodo.querySelector(".remarketing-global-data");
    if (ta) {
      ta.value = json;
      ta.textContent = json;
    }
    nodo.__rm24hConfig = config;
    renderPreviewNodo(nodo, config);
  }

  function renderPreviewNodo(nodo, config) {
    const body = nodo.querySelector(".rm24h-body");
    if (!body) return;

    if (!config.activo) {
      body.innerHTML =
        '<p class="rm24h-empty">Inactivo · abre el panel para activar</p>';
      return;
    }

    const msg = (config.mensajeRemarketing || "").trim();
    const preview = msg
      ? msg.slice(0, 48) + (msg.length > 48 ? "…" : "")
      : "Sin mensaje configurado";

    body.innerHTML =
      '<div class="rm24h-badge-on">ACTIVO</div>' +
      '<p class="rm24h-meta">⏱ 23h inactividad · reinicia al responder</p>' +
      '<p class="rm24h-preview">' +
      esc(preview) +
      "</p>";
  }

  function esNodoRemarketingGlobal(nodo) {
    return (
      nodo &&
      (nodo.dataset.tipo === "remarketing_global" ||
        nodo.classList.contains("remarketing-global-node"))
    );
  }

  function panelRemarketingAbierto() {
    return !!document.getElementById("rm24hActivo");
  }

  function aplicarConfigAlPanel(config) {
    const cfg = config || configActiva;
    const activoEl = document.getElementById("rm24hActivo");
    const mensajeEl = document.getElementById("rm24hMensaje");
    const horasEl = document.getElementById("rm24hHoras");
    const reiniciarEl = document.getElementById("rm24hReiniciar");
    const detenerConvEl = document.getElementById("rm24hDetenerConversion");

    if (activoEl) activoEl.checked = !!cfg.activo;
    if (horasEl) horasEl.value = String(cfg.horasInactividad ?? 23);
    if (mensajeEl) mensajeEl.value = cfg.mensajeRemarketing ?? "";
    if (reiniciarEl) reiniciarEl.checked = cfg.reiniciarAlResponder !== false;
    if (detenerConvEl) detenerConvEl.checked = cfg.detenerEnConversion !== false;
  }

  function renderPanel(nodo) {
    if (!nodo) return;

    nodoActivo = nodo;
    configActiva = leerConfigDeNodo(nodo);

    const contenido = document.getElementById("panelNodoContenido");
    const panelShell = document.getElementById("panelNodo");
    if (!contenido) return;

    if (panelShell) panelShell.classList.add("panel-nodo--rm24h");

    contenido.innerHTML =
      '<div class="rm24h-panel">' +
      '<div class="rm24h-panel-hero">' +
      '<span class="rm24h-panel-icon">🔥</span>' +
      "<div>" +
      "<h3>Remarketing Global 24h</h3>" +
      "<p>Cerebro global del flujo · no mueve leads entre nodos</p>" +
      "</div></div>" +
      '<label class="rm24h-toggle">' +
      '<input type="checkbox" id="rm24hActivo" ' +
      (configActiva.activo ? "checked" : "") +
      ">" +
      "<span>Activar remarketing global</span></label>" +
      '<div class="rm24h-field">' +
      "<label>Horas de inactividad</label>" +
      '<input type="number" id="rm24hHoras" value="23" disabled readonly>' +
      '<p class="rm24h-hint">23h (ventana WhatsApp Cloud API)</p></div>' +
      '<div class="rm24h-field rm24h-field--locked">' +
      "<label>Detener si responde</label>" +
      '<input type="checkbox" id="rm24hDetenerSiResponde" disabled>' +
      '<p class="rm24h-hint">NO — responder reinicia el contador</p></div>' +
      '<div class="rm24h-field rm24h-field--locked">' +
      "<label>Reiniciar contador al responder</label>" +
      '<input type="checkbox" id="rm24hReiniciar" checked disabled>' +
      '<p class="rm24h-hint">SÍ (fijo en Fase 1)</p></div>' +
      '<div class="rm24h-field rm24h-field--locked">' +
      "<label>Detener al llegar a Conversión</label>" +
      '<input type="checkbox" id="rm24hDetenerConversion" checked disabled>' +
      '<p class="rm24h-hint">SÍ (fijo en Fase 1)</p></div>' +
      '<div class="rm24h-field">' +
      "<label>Mensaje de remarketing</label>" +
      '<textarea id="rm24hMensaje" rows="5" placeholder="Mensaje cuando venza el contador (Fase 2 enviará por WA)">' +
      esc(configActiva.mensajeRemarketing) +
      "</textarea></div>" +
      '<div class="rm24h-field rm24h-field--locked">' +
      "<label>Modo contextual (futuro)</label>" +
      '<input type="checkbox" id="rm24hModoContextual" disabled>' +
      '<p class="rm24h-hint">Desactivado en Fase 1</p></div>' +
      '<button type="button" class="panel-btn" id="rm24hGuardarPanel">Guardar nodo</button>' +
      "</div>";

    aplicarConfigAlPanel(configActiva);

    document.getElementById("rm24hActivo")?.addEventListener("change", onPanelChange);
    document.getElementById("rm24hMensaje")?.addEventListener("input", onPanelChange);
    document
      .getElementById("rm24hGuardarPanel")
      ?.addEventListener("click", guardarDesdePanel);
  }

  function syncDesdePanel() {
    if (!panelRemarketingAbierto()) return;

    const activoEl = document.getElementById("rm24hActivo");
    const mensajeEl = document.getElementById("rm24hMensaje");

    if (activoEl) configActiva.activo = !!activoEl.checked;
    configActiva.horasInactividad = 23;
    configActiva.detenerSiResponde = false;
    configActiva.reiniciarAlResponder = true;
    configActiva.detenerEnConversion = true;
    configActiva.modoContextual = false;
    if (mensajeEl) {
      configActiva.mensajeRemarketing = String(mensajeEl.value || "").trim();
    }
  }

  function onPanelChange() {
    syncDesdePanel();
    if (nodoActivo) {
      guardarConfigEnNodo(nodoActivo, configActiva);
    }
    if (typeof window.macbotRecordHistoryDebounced === "function") {
      window.macbotRecordHistoryDebounced();
    }
  }

  function guardarDesdePanel() {
    if (!nodoActivo) return;
    syncDesdePanel();
    guardarConfigEnNodo(nodoActivo, configActiva);
    alert("Remarketing Global guardado. Recuerda guardar el flujo completo.");
  }

  function flushPanelToNode() {
    if (!nodoActivo) return;
    syncDesdePanel();
    guardarConfigEnNodo(nodoActivo, configActiva);
  }

  function clearPanelActivo() {
    const restaurando =
      typeof builderHistorial !== "undefined" && builderHistorial.restaurando;
    if (!restaurando && nodoActivo) {
      syncDesdePanel();
      guardarConfigEnNodo(nodoActivo, configActiva);
    }
    nodoActivo = null;
    configActiva = crearConfigVacia();
    document.getElementById("panelNodo")?.classList.remove("panel-nodo--rm24h");
  }

  function initNodoRecienCreado(nodo) {
    renderPreviewNodo(nodo, leerConfigDeNodo(nodo));
  }

  function refrescarNodoCargado(nodo) {
    try {
      renderPreviewNodo(nodo, leerConfigDeNodo(nodo));
    } catch (e) {
      console.warn("RM24H: error refrescando nodo", e.message);
    }
  }

  function crearNodoEnCanvas() {
    const canvas = document.getElementById("canvasFlujo");
    if (!canvas) return null;

    if (typeof nodoCount !== "undefined") nodoCount++;
    const id = "nodo_" + nodoCount;
    const cfg = JSON.stringify(crearConfigVacia());

    const nodo = document.createElement("div");
    nodo.className = "node remarketing-global-node node-remarketing-global";
    nodo.id = id;
    nodo.dataset.tipo = "remarketing_global";
    nodo.style.left = 80 + nodoCount * 40 + "px";
    nodo.style.top = 120 + nodoCount * 30 + "px";

    nodo.innerHTML =
      '<div class="port in" data-nodo="' +
      id +
      '" onmousedown="iniciarConexion(event, \'' +
      id +
      '\', \'in\')"></div>' +
      '<div class="rm24h-header">' +
      "<span>🔥 Remarketing Global 24h</span>" +
      '<span class="rm24h-chip">CEREBRO</span></div>' +
      '<button type="button" class="edit-node" onclick="event.stopPropagation(); abrirEditorRemarketingGlobal(\'' +
      id +
      '\')">✎</button>' +
      '<button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo(\'' +
      id +
      '\')">×</button>' +
      '<div class="rm24h-body"><p class="rm24h-empty">Inactivo · abre el panel</p></div>' +
      '<textarea class="remarketing-global-data" style="display:none;">' +
      cfg +
      "</textarea>";

    canvas.appendChild(nodo);
    initNodoRecienCreado(nodo);
    if (typeof hacerMovible === "function") hacerMovible(nodo);
    return nodo;
  }

  return {
    crearConfigVacia,
    leerConfigDeNodo,
    guardarConfigEnNodo,
    renderPreviewNodo,
    renderPanel,
    esNodoRemarketingGlobal,
    initNodoRecienCreado,
    refrescarNodoCargado,
    flushPanelToNode,
    clearPanelActivo,
    crearNodoEnCanvas,
    abrirEditorRemarketingGlobal: function (id) {
      const n = document.getElementById(id);
      if (n && typeof abrirPanelNodo === "function") abrirPanelNodo(n);
    },
  };
})();

function agregarNodoRemarketingGlobal() {
  if (typeof registrarHistorialBuilder === "function") registrarHistorialBuilder();
  if (window.MacBotRemarketingGlobal?.crearNodoEnCanvas) {
    window.MacBotRemarketingGlobal.crearNodoEnCanvas();
  }
}

function abrirEditorRemarketingGlobal(id) {
  const n = document.getElementById(id);
  if (n && typeof abrirPanelNodo === "function") abrirPanelNodo(n);
}
