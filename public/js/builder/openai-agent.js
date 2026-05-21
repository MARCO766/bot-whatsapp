/**
 * MacBot — Nodo Agente OpenAI (independiente)
 */
window.MacBotOpenAIAgent = (function () {
  const TAG_DIV = "di" + "v";

  let nodoActivo = null;
  let configActiva = crearConfigPorDefecto();
  let renderVisualTimer = null;

  const PROMPT_PLACEHOLDER =
    "Ejemplo:\n" +
    "Eres un vendedor amable de WhatsApp.\n" +
    "Producto: 4000 plantillas de papercraft.\n" +
    "Precio: 29 Bs.\n" +
    "Incluye: 4000 plantillas + 6 bonos.\n" +
    "Bonos: abecedario 3D, lámparas origami, Goku, Vegeta y Kid Buu.\n" +
    "Métodos de pago: QR y depósito bancario.\n" +
    "Responde corto, humano y sin inventar datos.";

  const OPENAI_ICON_SVG =
    '<svg class="openai-agent-icon-svg" viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">' +
    '<path fill="#67e8f9" d="M12 3l1.8 5.5H20l-4.6 3.3 1.8 5.5L12 14l-5.2 3.3 1.8-5.5L4 8.5h6.2z"/>' +
    '<circle cx="12" cy="12" r="9" fill="none" stroke="#a5f3fc" stroke-width="1.2"/>' +
    "</svg>";

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function generarRouteId() {
    return "route_" + Math.random().toString(36).slice(2, 8);
  }

  function productDataATexto(pd) {
    const p = pd || {};
    const lineas = [];
    if (p.name) lineas.push("Producto: " + p.name);
    if (p.description) lineas.push("Descripción: " + p.description);
    if (p.price) lineas.push("Precio: " + p.price);
    if (p.includes) lineas.push("Incluye: " + p.includes);
    if (p.bonuses) lineas.push("Bonos: " + p.bonuses);
    if (p.guarantee) lineas.push("Garantía: " + p.guarantee);
    if (p.access) lineas.push("Acceso/entrega: " + p.access);
    if (p.paymentMethods) lineas.push("Métodos de pago: " + p.paymentMethods);
    if (p.faq) lineas.push("FAQ: " + p.faq);
    return lineas.join("\n");
  }

  function crearConfigPorDefecto() {
    return {
      version: 1,
      nombreNodo: "Agente OpenAI",
      scoreMinimo: 40,
      temperature: 0.7,
      model: "gpt-4o-mini",
      openaiPrompt: "",
      caminos: [],
      routes: [],
    };
  }

  function obtenerRoutes(cfg) {
    const raw = cfg?.routes ?? cfg?.caminos;
    if (Array.isArray(raw)) return raw;
    return [];
  }

  function textoCamino(route) {
    return String(route?.text || route?.name || route?.nombre || "").trim();
  }

  function asegurarArraysCaminos(cfg) {
    const lista = obtenerRoutes(cfg).map(function (r) {
      return { ...r };
    });
    cfg.caminos = lista;
    cfg.routes = lista;
    return cfg;
  }

  function normalizarCaminos(caminos, soloValidos) {
    if (!Array.isArray(caminos)) return [];
    return caminos
      .map(function (r) {
        const syns = Array.isArray(r.synonyms)
          ? r.synonyms
          : String(r.synonyms || "")
              .split(",")
              .map(function (s) {
                return s.trim();
              })
              .filter(Boolean);
        const text = textoCamino(r);
        return {
          id: String(r.id || generarRouteId()).trim(),
          text: text,
          nombre: text,
          type: String(r.type || "texto").trim() || "texto",
          synonyms: syns,
          priority: parseInt(r.priority, 10) || 50,
          mediaId: r.mediaId ? String(r.mediaId).trim() : null,
          enabled: r.enabled !== false,
        };
      })
      .filter(function (r) {
        if (!r.id) return false;
        if (soloValidos === false) return true;
        return !!r.text;
      });
  }

  function sanitizeOpenAIData(local) {
    const src = local && typeof local === "object" ? local : {};
    const routes = normalizarCaminos(obtenerRoutes(src), true);
    const temp = parseFloat(src.temperature);
    let openaiPrompt = String(src.openaiPrompt || "").trim();
    if (!openaiPrompt) {
      openaiPrompt = productDataATexto(src.productData || {});
      if (!openaiPrompt && src.promptExtra) openaiPrompt = String(src.promptExtra).trim();
    }

    return {
      version: 1,
      nombreNodo: String(src.nombreNodo || "Agente OpenAI").trim(),
      scoreMinimo: Math.min(
        100,
        Math.max(0, parseInt(src.scoreMinimo, 10) || 40)
      ),
      temperature: Number.isFinite(temp) ? Math.min(1, Math.max(0, temp)) : 0.7,
      model: String(src.model || "gpt-4o-mini").trim() || "gpt-4o-mini",
      openaiPrompt: openaiPrompt,
      caminos: routes,
      routes: routes,
    };
  }

  function normalizarConfig(data) {
    const base = { ...crearConfigPorDefecto(), ...(data || {}) };
    return sanitizeOpenAIData(base);
  }

  function caminosParaVisual(config) {
    return normalizarCaminos(obtenerRoutes(config), false).filter(function (r) {
      return r.enabled !== false;
    });
  }

  function leerConfigDeNodo(nodo) {
    const box = nodo && nodo.querySelector(".openai-agent-data");
    if (!box) return crearConfigPorDefecto();
    try {
      const raw = (box.value || box.textContent || "").trim();
      if (!raw) return crearConfigPorDefecto();
      return normalizarConfig(JSON.parse(raw));
    } catch (e) {
      console.warn("IA Pro: JSON inválido", e.message);
      return crearConfigPorDefecto();
    }
  }

  function labelCaminoVisual(route) {
    const t = textoCamino(route);
    return t || "Camino sin nombre";
  }

  function ensureEstructuraCircular(nodo) {
    nodo.querySelector(".openai-agent-node-left")?.remove();

    let shell = nodo.querySelector(".openai-agent-node-shell");
    if (shell) {
      const circle = shell.querySelector(".openai-agent-circle");
      if (circle && !circle.querySelector(".openai-agent-icon-wrap")) {
        const iconWrap = document.createElement(TAG_DIV);
        iconWrap.className = "openai-agent-icon-wrap";
        iconWrap.innerHTML = OPENAI_ICON_SVG;
        const title = circle.querySelector(".openai-agent-title");
        circle.insertBefore(iconWrap, title || null);
      }
      return;
    }

    const portIn = nodo.querySelector(".port.in");
    const actions = nodo.querySelector(".node-actions");
    let titleEl = nodo.querySelector(".openai-agent-title");
    let bodyEl = nodo.querySelector(".openai-agent-body");

    shell = document.createElement(TAG_DIV);
    shell.className = "openai-agent-node-shell";

    const coreCol = document.createElement(TAG_DIV);
    coreCol.className = "openai-agent-core-column";

    const circle = document.createElement(TAG_DIV);
    circle.className = "openai-agent-circle";
    if (portIn) circle.appendChild(portIn);
    if (actions) circle.appendChild(actions);

    const iconWrap = document.createElement(TAG_DIV);
    iconWrap.className = "openai-agent-icon-wrap";
    iconWrap.innerHTML = OPENAI_ICON_SVG;
    circle.appendChild(iconWrap);

    if (!titleEl) titleEl = document.createElement("h3");
    titleEl.className = "openai-agent-title";
    circle.appendChild(titleEl);

    if (!bodyEl) bodyEl = document.createElement(TAG_DIV);
    bodyEl.className = "openai-agent-body";
    coreCol.appendChild(circle);
    coreCol.appendChild(bodyEl);
    shell.appendChild(coreCol);

    const data = nodo.querySelector(".openai-agent-data");
    if (data) nodo.insertBefore(shell, data);
    else nodo.appendChild(shell);
  }

  function renderVisualNodo(nodo, config) {
    const activos = caminosParaVisual(config);
    ensureEstructuraCircular(nodo);

    nodo.querySelector(".openai-agent-routes-branch")?.remove();
    nodo.querySelectorAll(".port.out").forEach(function (p) {
      p.remove();
    });

    const body = nodo.querySelector(".openai-agent-body");
    const titleEl = nodo.querySelector(".openai-agent-title");
    if (!body || !titleEl) return;

    titleEl.textContent = config.nombreNodo || "Agente OpenAI";
    nodo.classList.remove("openai-agent-node--with-routes");

    if (!activos.length) {
      body.innerHTML =
        '<p class="openai-agent-desc-pill openai-agent-desc-pill--empty">Doble click para configurar</p>';
      return;
    }

    nodo.classList.add("openai-agent-node--with-routes");
    body.innerHTML =
      '<p class="openai-agent-desc-pill">OpenAI o avanza por camino</p>';

    const shell = nodo.querySelector(".openai-agent-node-shell");
    const branch = document.createElement(TAG_DIV);
    branch.className = "openai-agent-routes-branch";

    const stem = document.createElement(TAG_DIV);
    stem.className = "openai-agent-routes-stem";
    stem.setAttribute("aria-hidden", "true");
    branch.appendChild(stem);

    const list = document.createElement("ul");
    list.className = "openai-agent-routes-list";

    activos.forEach(function (route) {
      const label = labelCaminoVisual(route);
      const li = document.createElement("li");
      li.className = "openai-agent-route-pill";
      li.dataset.routeId = route.id;

      const dot = document.createElement("span");
      dot.className = "openai-agent-route-dot";
      li.appendChild(dot);

      const name = document.createElement("span");
      name.className = "openai-agent-route-name";
      name.textContent = label;
      li.appendChild(name);

      const port = document.createElement(TAG_DIV);
      port.className = "port out openai-agent-port-route";
      port.dataset.nodo = nodo.id;
      port.dataset.handle = route.id;
      port.title = label;
      li.appendChild(port);

      list.appendChild(li);
    });

    branch.appendChild(list);
    if (shell) shell.appendChild(branch);

    if (typeof actualizarHandlersPuertosCanvas === "function") {
      actualizarHandlersPuertosCanvas();
    }
    if (typeof actualizarLineas === "function") actualizarLineas();
  }

  function actualizarHTMLNodo(nodo, cleanData) {
    if (!nodo) return;
    const cfg = sanitizeOpenAIData(cleanData);
    const json = JSON.stringify(cfg);
    const box = nodo.querySelector(".openai-agent-data");
    if (box) {
      box.value = json;
      box.textContent = json;
    } else {
      const ta = document.createElement("textarea");
      ta.className = "openai-agent-data";
      ta.style.display = "none";
      ta.value = json;
      nodo.appendChild(ta);
    }
    renderVisualNodo(nodo, cfg);
    configActiva = cfg;
  }

  function syncCaminosDesdeDom() {
    const rows = document.querySelectorAll(".openai-agent-ruta-row");
    const caminos = [];
    rows.forEach(function (row) {
      const id = row.dataset.routeId;
      if (!id) return;
      const text = row.querySelector(".openai-agent-ruta-texto")?.value.trim() || "";
      const synsRaw = row.querySelector(".openai-agent-ruta-sinonimos")?.value || "";
      const syns = synsRaw
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      caminos.push({
        id: id,
        text: text,
        name: text,
        nombre: text,
        type: "texto",
        synonyms: syns,
        priority: parseInt(row.querySelector(".openai-agent-ruta-prioridad")?.value, 10) || 50,
        mediaId: row.querySelector(".openai-agent-ruta-media")?.value.trim() || null,
        enabled: row.querySelector(".openai-agent-ruta-enabled")?.checked !== false,
      });
    });
    configActiva.caminos = caminos;
    configActiva.routes = caminos;
  }

  function syncCamposPanelDraft() {
    if (!configActiva || typeof configActiva !== "object") {
      configActiva = crearConfigPorDefecto();
    }
    configActiva.nombreNodo =
      document.getElementById("openaiAgentNombreNodo")?.value.trim() || "Agente OpenAI";
    configActiva.scoreMinimo =
      parseInt(document.getElementById("openaiAgentScoreMinimo")?.value, 10) || 40;
    const temp = parseFloat(document.getElementById("openaiAgentTemperature")?.value);
    configActiva.temperature = Number.isFinite(temp)
      ? Math.min(1, Math.max(0, temp))
      : 0.7;
    configActiva.model =
      document.getElementById("openaiAgentModel")?.value.trim() || "gpt-4o-mini";
    configActiva.openaiPrompt =
      document.getElementById("openaiAgentPrompt")?.value.trim() || "";
    syncCaminosDesdeDom();
    asegurarArraysCaminos(configActiva);
    return configActiva;
  }

  function renderCaminosEditor() {
    const wrap = document.getElementById("openaiAgentCaminosLista");
    if (!wrap) return;
    const routes = obtenerRoutes(configActiva);
    if (!routes.length) {
      wrap.innerHTML =
        '<p class="openai-agent-caminos-vacio">No hay caminos. Agrega uno.</p>';
      return;
    }
    wrap.innerHTML = routes
      .map(function (route, index) {
        const syns = Array.isArray(route.synonyms)
          ? route.synonyms.join(", ")
          : "";
        return (
          '<div class="openai-agent-ruta-row" data-route-id="' +
          esc(route.id) +
          '">' +
          '<div class="openai-agent-ruta-head"><span>Ruta ' +
          (index + 1) +
          '</span><label><input type="checkbox" class="openai-agent-ruta-enabled"' +
          (route.enabled !== false ? " checked" : "") +
          '> Activo</label><button type="button" class="openai-agent-ruta-del">Eliminar</button></div>' +
          '<div class="panel-campo"><label>Texto del camino</label><input class="openai-agent-ruta-texto" value="' +
          esc(textoCamino(route)) +
          '"></div>' +
          '<div class="panel-campo"><label>Sinónimos (coma)</label><textarea class="openai-agent-ruta-sinonimos ia-textarea" rows="2">' +
          esc(syns) +
          "</textarea></div>" +
          '<div class="panel-campo"><label>Prioridad</label><input type="number" class="openai-agent-ruta-prioridad" min="0" max="100" value="' +
          (route.priority || 50) +
          '"></div>' +
          '<div class="panel-campo"><label>Media ID / URL</label><input class="openai-agent-ruta-media" value="' +
          esc(route.mediaId || "") +
          '"></div>' +
          '<p class="ia-handle-hint">Handle: <code>' +
          esc(route.id) +
          "</code></p></div>"
        );
      })
      .join("");

    wrap.querySelectorAll(".openai-agent-ruta-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const row = btn.closest(".openai-agent-ruta-row");
        const rid = row?.dataset.routeId;
        configActiva.caminos = (configActiva.caminos || []).filter(function (r) {
          return r.id !== rid;
        });
        if (nodoActivo && typeof window.eliminarConexionesPorHandle === "function") {
          window.eliminarConexionesPorHandle(nodoActivo.id, rid);
        }
        renderCaminosEditor();
        onFormChange();
      });
    });
    wrap.querySelectorAll("input, textarea").forEach(function (el) {
      el.addEventListener("input", onFormChange);
      el.addEventListener("change", onFormChange);
    });
  }

  function agregarCamino() {
    syncCamposPanelDraft();
    const nuevo = {
      id: generarRouteId(),
      text: "",
      name: "",
      nombre: "",
      synonyms: [],
      priority: 50,
      mediaId: null,
      enabled: true,
    };
    asegurarArraysCaminos(configActiva);
    configActiva.caminos.push(nuevo);
    configActiva.routes = configActiva.caminos;
    renderCaminosEditor();
    if (nodoActivo) renderVisualNodo(nodoActivo, configActiva);
  }

  function renderPanel(nodo) {
    if (!nodo) return;
    nodoActivo = nodo;
    configActiva = leerConfigDeNodo(nodo);
    asegurarArraysCaminos(configActiva);
    const contenido = document.getElementById("panelNodoContenido");
    if (!contenido) return;

    contenido.innerHTML =
      '<div class="openai-agent-panel">' +
      "<h4>🤖 Agente OpenAI</h4>" +
      '<p class="ia-panel-desc">OpenAI responde al lead o enruta por caminos sin texto.</p>' +
      '<div class="panel-campo"><label>Nombre del nodo</label><input id="openaiAgentNombreNodo" value="' +
      esc(configActiva.nombreNodo) +
      '"></div>' +
      '<div class="panel-campo"><label>Modelo</label><input id="openaiAgentModel" value="' +
      esc(configActiva.model || "gpt-4o-mini") +
      '"></div>' +
      '<div class="panel-campo"><label>Temperatura (0–1)</label><input id="openaiAgentTemperature" type="number" min="0" max="1" step="0.1" value="' +
      (configActiva.temperature ?? 0.7) +
      '"></div>' +
      '<div class="panel-campo"><label>Score mínimo caminos</label><input id="openaiAgentScoreMinimo" type="number" min="0" max="100" value="' +
      configActiva.scoreMinimo +
      '"></div>' +
      '<div class="panel-campo"><label>Instrucciones y datos del producto</label>' +
      '<textarea id="openaiAgentPrompt" class="ia-textarea openai-agent-prompt-area" rows="14" placeholder="' +
      esc(PROMPT_PLACEHOLDER) +
      '">' +
      esc(configActiva.openaiPrompt || "") +
      "</textarea></div>" +
      "<h5>Caminos</h5>" +
      '<div id="openaiAgentCaminosLista"></div>' +
      '<button type="button" class="panel-btn" id="openaiAgentAgregarCamino">+ Agregar camino</button>' +
      '<button type="button" class="panel-btn" id="openaiAgentGuardarPanel">Guardar Agente OpenAI</button>' +
      "</div>";

    renderCaminosEditor();
    document.getElementById("openaiAgentAgregarCamino")?.addEventListener("click", function (ev) {
      ev.preventDefault();
      agregarCamino();
    });
    document.getElementById("openaiAgentGuardarPanel")?.addEventListener("click", function (ev) {
      ev.preventDefault();
      guardarDesdePanel(ev);
    });
    [
      "openaiAgentNombreNodo",
      "openaiAgentScoreMinimo",
      "openaiAgentTemperature",
      "openaiAgentModel",
      "openaiAgentPrompt",
    ].forEach(function (id) {
      document.getElementById(id)?.addEventListener("input", onFormChange);
      document.getElementById(id)?.addEventListener("change", onFormChange);
    });
  }

  function scheduleRenderVisual() {
    if (!nodoActivo) return;
    if (renderVisualTimer) clearTimeout(renderVisualTimer);
    renderVisualTimer = setTimeout(function () {
      renderVisualTimer = null;
      renderVisualNodo(nodoActivo, configActiva);
    }, 180);
  }

  function onFormChange() {
    syncCamposPanelDraft();
    scheduleRenderVisual();
    if (typeof window.macbotRecordHistoryDebounced === "function") {
      window.macbotRecordHistoryDebounced();
    }
  }

  function guardarDesdePanel(ev) {
    if (ev?.preventDefault) ev.preventDefault();
    if (!nodoActivo) return;
    if (renderVisualTimer) {
      clearTimeout(renderVisualTimer);
      renderVisualTimer = null;
    }
    syncCamposPanelDraft();
    actualizarHTMLNodo(nodoActivo, sanitizeOpenAIData(configActiva));
    if (typeof actualizarHandlersPuertosCanvas === "function") {
      actualizarHandlersPuertosCanvas();
    }
    if (typeof actualizarLineas === "function") actualizarLineas();
    if (typeof cerrarPanelNodo === "function") cerrarPanelNodo();
    if (typeof registrarHistorialBuilder === "function") registrarHistorialBuilder();
  }

  function flushPanelToNode() {
    if (!nodoActivo) return;
    syncCamposPanelDraft();
    actualizarHTMLNodo(nodoActivo, sanitizeOpenAIData(configActiva));
  }

  function clearPanelActivo() {
    if (renderVisualTimer) clearTimeout(renderVisualTimer);
    renderVisualTimer = null;
    nodoActivo = null;
    configActiva = crearConfigPorDefecto();
  }

  function getNodoActivo() {
    return nodoActivo;
  }

  function esNodoOpenAIAgent(nodo) {
    return (
      nodo &&
      (nodo.dataset.tipo === "openai_agent" ||
        nodo.classList.contains("openai-agent-node") ||
        !!nodo.querySelector(".openai-agent-data"))
    );
  }

  function crearNodoEnCanvas() {
    const canvas = document.getElementById("canvasFlujo");
    if (!canvas) {
      alert("No existe canvasFlujo");
      return null;
    }
    if (typeof registrarHistorialBuilder === "function") registrarHistorialBuilder();
    if (typeof nodoCount !== "undefined") {
      nodoCount++;
    } else {
      window.nodoCount = (window.nodoCount || 0) + 1;
    }
    const id =
      "nodo_" + (typeof nodoCount !== "undefined" ? nodoCount : window.nodoCount);
    const cfg = crearConfigPorDefecto();
    const json = JSON.stringify(cfg);

    const nodo = document.createElement(TAG_DIV);
    nodo.className = "node openai-agent-node";
    nodo.id = id;
    nodo.dataset.tipo = "openai_agent";

    nodo.style.left = (280 + nodoCount * 40) + "px";
    nodo.style.top = (260 + nodoCount * 30) + "px";

    nodo.innerHTML =
      '<div class="openai-agent-node-shell"><div class="openai-agent-core-column">' +
      '<div class="openai-agent-circle">' +
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
      '\')">×</button></div>' +
      '<div class="openai-agent-icon-wrap">' +
      OPENAI_ICON_SVG +
      '</div><h3 class="openai-agent-title">Agente OpenAI</h3></div>' +
      '<div class="openai-agent-body"><p class="openai-agent-desc-pill openai-agent-desc-pill--empty">Doble click para configurar</p></div></div></div>' +
      '<textarea class="openai-agent-data" style="display:none;">' +
      json +
      "</textarea>";

    canvas.appendChild(nodo);
    nodo.addEventListener("dblclick", function (ev) {
      ev.stopPropagation();
      if (typeof editarNodo === "function") editarNodo(id);
    });
    if (typeof hacerMovible === "function") hacerMovible(nodo);
    initNodoRecienCreado(nodo);
    return nodo;
  }

  function initNodoRecienCreado(nodo) {
    actualizarHTMLNodo(nodo, crearConfigPorDefecto());
  }

  function refrescarNodoCargado(nodo) {
    try {
      nodo.querySelectorAll(".port.out:not(.openai-agent-port-route)").forEach(function (p) {
        p.remove();
      });
      if (!nodo.dataset.openaiAgentDblBound) {
        nodo.dataset.openaiAgentDblBound = "1";
        nodo.addEventListener("dblclick", function (ev) {
          ev.stopPropagation();
          if (typeof editarNodo === "function") editarNodo(nodo.id);
        });
      }
      actualizarHTMLNodo(nodo, leerConfigDeNodo(nodo));
    } catch (e) {
      console.warn("OpenAI Agent: error refrescando", e.message);
    }
  }

  return {
    crearConfigPorDefecto,
    leerConfigDeNodo,
    renderPanel,
    guardarDesdePanel,
    esNodoOpenAIAgent,
    crearNodoEnCanvas,
    initNodoRecienCreado,
    refrescarNodoCargado,
    flushPanelToNode,
    clearPanelActivo,
    getNodoActivo,
  };
})();

function agregarNodoOpenAIAgent() {
  if (window.MacBotOpenAIAgent && window.MacBotOpenAIAgent.crearNodoEnCanvas) {
    window.MacBotOpenAIAgent.crearNodoEnCanvas();
  }
}
