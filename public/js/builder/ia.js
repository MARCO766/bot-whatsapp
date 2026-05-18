/**
 * MacBot — Editor de nodo IA
 */
window.MacBotIA = (function () {
  const MODOS = [
    { id: "detectar_intencion", label: "Detectar intención" },
    { id: "clasificar_lead", label: "Clasificar lead" },
    { id: "responder_automatico", label: "Responder automático" },
  ];

  const MODELOS = [
    { id: "gpt-4o-mini", label: "gpt-4o-mini (recomendado)" },
    { id: "gpt-4o", label: "gpt-4o" },
    { id: "gpt-4.1-mini", label: "gpt-4.1-mini" },
  ];

  let nodoActivo = null;
  let configActiva = crearConfigPorDefecto();

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function crearConfigPorDefecto() {
    return {
      nombreNodo: "🤖 IA",
      modo: "detectar_intencion",
      promptSistema:
        "Eres un asistente de automatización WhatsApp. Responde solo con el formato solicitado.",
      instruccionesNegocio: "",
      maxCaracteres: 400,
      temperatura: 0.3,
      modelo: "gpt-4o-mini",
      variableResultado: "",
      siFalla: "continuar",
      mensajeFallback: "Gracias por escribirnos. En breve un asesor te atiende.",
    };
  }

  function labelModo(modo) {
    const m = MODOS.find((x) => x.id === modo);
    return m ? m.label : modo;
  }

  function normalizarConfig(data) {
    const cfg = { ...crearConfigPorDefecto(), ...(data || {}) };
    if (!MODOS.some((m) => m.id === cfg.modo)) cfg.modo = "detectar_intencion";
    cfg.maxCaracteres = Math.min(400, Math.max(50, parseInt(cfg.maxCaracteres, 10) || 400));
    cfg.temperatura = Math.min(1, Math.max(0, parseFloat(cfg.temperatura) || 0.3));
    cfg.siFalla = cfg.siFalla === "detener" ? "detener" : "continuar";
    return cfg;
  }

  function leerConfigDeNodo(nodo) {
    const box = nodo && nodo.querySelector(".ia-data");
    if (!box) return crearConfigPorDefecto();
    try {
      const raw = (box.value || box.textContent || "").trim();
      if (!raw) return crearConfigPorDefecto();
      return normalizarConfig(JSON.parse(raw));
    } catch (e) {
      console.warn("IA: JSON inválido", e.message);
      return crearConfigPorDefecto();
    }
  }

  function guardarConfigEnNodo(nodo, config) {
    const box = nodo.querySelector(".ia-data");
    const json = JSON.stringify(config);
    if (box) {
      box.value = json;
      box.textContent = json;
    }
    renderPreviewNodo(nodo, config);
    const h3 = nodo.querySelector(".ia-title");
    if (h3) h3.textContent = config.nombreNodo || "🤖 IA";
  }

  function previewPrompt(config) {
    const parts = [];
    if (config.promptSistema) parts.push(config.promptSistema.slice(0, 60));
    if (config.instruccionesNegocio) {
      parts.push("· " + config.instruccionesNegocio.slice(0, 40));
    }
    return parts.join(" ") || "Sin prompt configurado";
  }

  function renderPreviewNodo(nodo, config) {
    const body = nodo.querySelector(".ia-body");
    if (!body) return;

    const tieneFallback = !!(config.mensajeFallback || "").trim();

    body.innerHTML =
      '<span class="ia-badge-modo">' +
      esc(labelModo(config.modo)) +
      "</span>" +
      '<div class="ia-status"><span class="ia-status-dot"></span> IA activa</div>' +
      '<p class="ia-preview">' +
      esc(previewPrompt(config)) +
      "</p>" +
      (tieneFallback
        ? '<span class="ia-badge-fallback">Fallback</span>'
        : "");
  }

  function syncDesdeFormulario() {
    configActiva.nombreNodo =
      document.getElementById("iaNombreNodo")?.value.trim() || "🤖 IA";
    configActiva.modo = document.getElementById("iaModo")?.value || "detectar_intencion";
    configActiva.promptSistema =
      document.getElementById("iaPromptSistema")?.value.trim() || "";
    configActiva.instruccionesNegocio =
      document.getElementById("iaInstrucciones")?.value.trim() || "";
    configActiva.maxCaracteres =
      parseInt(document.getElementById("iaMaxChars")?.value, 10) || 400;
    configActiva.temperatura =
      parseFloat(document.getElementById("iaTemperatura")?.value) || 0.3;
    configActiva.modelo = document.getElementById("iaModelo")?.value || "gpt-4o-mini";
    configActiva.variableResultado =
      document.getElementById("iaVariable")?.value.trim() || "";
    configActiva.siFalla = document.getElementById("iaSiFalla")?.value || "continuar";
    configActiva.mensajeFallback =
      document.getElementById("iaFallback")?.value.trim() || "";
    configActiva = normalizarConfig(configActiva);
  }

  function renderPanel(nodo) {
    if (!nodo) return;
    nodoActivo = nodo;
    configActiva = leerConfigDeNodo(nodo);

    const contenido = document.getElementById("panelNodoContenido");
    if (!contenido) return;

    const modosOpts = MODOS.map(
      (m) =>
        '<option value="' +
        m.id +
        '"' +
        (configActiva.modo === m.id ? " selected" : "") +
        ">" +
        esc(m.label) +
        "</option>"
    ).join("");

    const modelosOpts = MODELOS.map(
      (m) =>
        '<option value="' +
        m.id +
        '"' +
        (configActiva.modelo === m.id ? " selected" : "") +
        ">" +
        esc(m.label) +
        "</option>"
    ).join("");

    contenido.innerHTML =
      '<div class="ia-panel">' +
      "<h4>🤖 Nodo IA</h4>" +
      '<p class="ia-panel-desc">Automatización segura con OpenAI (solo backend).</p>' +
      '<div class="panel-campo"><label>Nombre del nodo</label>' +
      '<input id="iaNombreNodo" value="' +
      esc(configActiva.nombreNodo) +
      '"></div>' +
      '<div class="panel-campo"><label>Modo IA</label>' +
      '<select id="iaModo">' +
      modosOpts +
      "</select></div>" +
      '<div class="panel-campo"><label>Prompt del sistema</label>' +
      '<textarea id="iaPromptSistema" class="ia-textarea" rows="3">' +
      esc(configActiva.promptSistema) +
      "</textarea></div>" +
      '<div class="panel-campo"><label>Instrucciones del negocio</label>' +
      '<textarea id="iaInstrucciones" class="ia-textarea" rows="3" placeholder="Ej: Vendemos cursos online. No dar precios sin confirmar.">' +
      esc(configActiva.instruccionesNegocio) +
      "</textarea></div>" +
      '<div class="panel-campo"><label>Respuesta máxima (caracteres)</label>' +
      '<input id="iaMaxChars" type="number" min="50" max="400" value="' +
      configActiva.maxCaracteres +
      '"></div>' +
      '<div class="panel-campo"><label>Temperatura (0–1)</label>' +
      '<input id="iaTemperatura" type="number" min="0" max="1" step="0.1" value="' +
      configActiva.temperatura +
      '"></div>' +
      '<div class="panel-campo"><label>Modelo</label>' +
      '<select id="iaModelo">' +
      modelosOpts +
      "</select></div>" +
      '<div class="panel-campo"><label>Guardar resultado en variable</label>' +
      '<input id="iaVariable" placeholder="opcional, ej: mi_intent" value="' +
      esc(configActiva.variableResultado) +
      '"></div>' +
      '<div class="panel-campo"><label>Si falla IA</label>' +
      '<select id="iaSiFalla">' +
      '<option value="continuar"' +
      (configActiva.siFalla === "continuar" ? " selected" : "") +
      ">Continuar flujo</option>" +
      '<option value="detener"' +
      (configActiva.siFalla === "detener" ? " selected" : "") +
      ">Detener flujo</option>" +
      "</select></div>" +
      '<div class="panel-campo"><label>Mensaje fallback</label>' +
      '<textarea id="iaFallback" class="ia-textarea" rows="2">' +
      esc(configActiva.mensajeFallback) +
      "</textarea></div>" +
      '<p class="ia-vars-hint">Variables: {{nombre}} {{telefono}} {{ultimo_mensaje}} {{intent}} {{score}}</p>' +
      '<button type="button" class="panel-btn" id="iaGuardarPanel">Guardar nodo IA</button>' +
      "</div>";

    document.getElementById("iaGuardarPanel")?.addEventListener("click", guardarDesdePanel);
    ["iaNombreNodo", "iaModo", "iaPromptSistema", "iaInstrucciones", "iaMaxChars", "iaTemperatura", "iaModelo", "iaVariable", "iaSiFalla", "iaFallback"].forEach(
      function (id) {
        document.getElementById(id)?.addEventListener("input", onFormChange);
        document.getElementById(id)?.addEventListener("change", onFormChange);
      }
    );
  }

  function onFormChange() {
    syncDesdeFormulario();
    if (nodoActivo) renderPreviewNodo(nodoActivo, configActiva);
    if (typeof window.macbotRecordHistoryDebounced === "function") {
      window.macbotRecordHistoryDebounced();
    }
  }

  function guardarDesdePanel() {
    if (!nodoActivo) return;
    syncDesdeFormulario();
    guardarConfigEnNodo(nodoActivo, configActiva);
  }

  function flushPanelToNode() {
    if (!nodoActivo) return;
    syncDesdeFormulario();
    guardarConfigEnNodo(nodoActivo, configActiva);
  }

  function clearPanelActivo() {
    nodoActivo = null;
    configActiva = crearConfigPorDefecto();
  }

  function getNodoActivo() {
    return nodoActivo;
  }

  function esNodoIA(nodo) {
    return (
      nodo &&
      (nodo.dataset.tipo === "ia" ||
        nodo.classList.contains("ia-node") ||
        !!nodo.querySelector(".ia-data"))
    );
  }

  function crearNodoEnCanvas() {
    const canvas = document.getElementById("canvasFlujo");
    if (!canvas) {
      alert("No existe canvasFlujo");
      return null;
    }

    if (typeof registrarHistorialBuilder === "function") {
      registrarHistorialBuilder();
    }

    if (typeof nodoCount !== "undefined") {
      nodoCount++;
    } else {
      window.nodoCount = (window.nodoCount || 0) + 1;
    }

    const id = "nodo_" + (typeof nodoCount !== "undefined" ? nodoCount : window.nodoCount);
    const nodo = document.createElement("div");
    nodo.className = "node ia-node";
    nodo.id = id;
    nodo.dataset.tipo = "ia";

    nodo.style.left = (280 + (typeof nodoCount !== "undefined" ? nodoCount : 1) * 40) + "px";
    nodo.style.top = (260 + (typeof nodoCount !== "undefined" ? nodoCount : 1) * 30) + "px";

    const cfg = crearConfigPorDefecto();
    const json = JSON.stringify(cfg);

    nodo.innerHTML =
      '<div class="port in" data-nodo="' +
      id +
      '" onmousedown="iniciarConexion(event, \'' +
      id +
      '\', \'in\')"></div>' +
      '<div class="node-actions">' +
      '<button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo(\'' +
      id +
      '\')">✎</button>' +
      '<button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo(\'' +
      id +
      '\')">×</button>' +
      "</div>" +
      '<div class="ia-header"><h3 class="ia-title">🤖 IA</h3></div>' +
      '<div class="ia-body"><span class="ia-badge-modo">Detectar intención</span></div>' +
      '<textarea class="ia-data" style="display:none;">' +
      json +
      "</textarea>" +
      '<div class="port out" data-nodo="' +
      id +
      '" onmousedown="iniciarConexion(event, \'' +
      id +
      '\', \'out\')"></div>';

    canvas.appendChild(nodo);

    if (typeof hacerMovible === "function") hacerMovible(nodo);
    initNodoRecienCreado(nodo);
    return nodo;
  }

  function initNodoRecienCreado(nodo) {
    guardarConfigEnNodo(nodo, crearConfigPorDefecto());
  }

  function refrescarNodoCargado(nodo) {
    try {
      guardarConfigEnNodo(nodo, leerConfigDeNodo(nodo));
    } catch (e) {
      console.warn("IA: error refrescando nodo", e.message);
    }
  }

  return {
    crearConfigPorDefecto,
    leerConfigDeNodo,
    guardarConfigEnNodo,
    renderPreviewNodo,
    renderPanel,
    esNodoIA,
    crearNodoEnCanvas,
    initNodoRecienCreado,
    refrescarNodoCargado,
    flushPanelToNode,
    clearPanelActivo,
    getNodoActivo,
  };
})();

function agregarNodoIA() {
  if (window.MacBotIA && window.MacBotIA.crearNodoEnCanvas) {
    window.MacBotIA.crearNodoEnCanvas();
    return;
  }
  agregarNodo("ia");
}
