/**
 * MacBot — Nodo Agente IA Pro (separado de Agente Rápido / ia.js)
 */
window.MacBotIAPro = (function () {
  const TAG_DIV = "di" + "v";

  let nodoActivo = null;
  let configActiva = crearConfigPorDefecto();
  let renderVisualTimer = null;

  const TONOS = ["amable", "vendedor", "premium", "tecnico", "agresivo"];

  const IA_PRO_ICON_SVG =
    '<svg class="ia-pro-icon-svg" viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">' +
    '<path fill="#ffffff" d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A2.5 2.5 0 0 0 5 15.5 2.5 2.5 0 0 0 7.5 18a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 7.5 13m9 0a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0-2.5-2.5"/>' +
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

  function crearConfigPorDefecto() {
    return {
      version: 1,
      nombreNodo: "Agente IA Pro",
      scoreMinimo: 40,
      enabledConversation: true,
      tone: "amable",
      mensajeFallback:
        "No entendí bien 😊 ¿Te ayudo con precio, qué incluye o formas de pago?",
      productData: {
        name: "",
        description: "",
        price: "",
        includes: "",
        bonuses: "",
        guarantee: "",
        access: "",
        paymentMethods: "",
        faq: "",
      },
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

  function sanitizeProData(local) {
    const src = local && typeof local === "object" ? local : {};
    const routes = normalizarCaminos(obtenerRoutes(src), true);
    const pd = src.productData || {};
    const tone = String(src.tone || "amable").toLowerCase();

    return {
      version: 1,
      nombreNodo: String(src.nombreNodo || "Agente IA Pro").trim(),
      scoreMinimo: Math.min(
        100,
        Math.max(0, parseInt(src.scoreMinimo, 10) || 40)
      ),
      enabledConversation: src.enabledConversation !== false,
      tone: TONOS.indexOf(tone) >= 0 ? tone : "amable",
      mensajeFallback: String(
        src.mensajeFallback || crearConfigPorDefecto().mensajeFallback
      ).trim(),
      productData: {
        name: String(pd.name || "").trim(),
        description: String(pd.description || "").trim(),
        price: String(pd.price || "").trim(),
        includes: String(pd.includes || "").trim(),
        bonuses: String(pd.bonuses || "").trim(),
        guarantee: String(pd.guarantee || "").trim(),
        access: String(pd.access || "").trim(),
        paymentMethods: String(pd.paymentMethods || "").trim(),
        faq: String(pd.faq || "").trim(),
      },
      caminos: routes,
      routes: routes,
    };
  }

  function normalizarConfig(data) {
    const base = { ...crearConfigPorDefecto(), ...(data || {}) };
    return sanitizeProData(base);
  }

  function caminosParaVisual(config) {
    return normalizarCaminos(obtenerRoutes(config), false).filter(function (r) {
      return r.enabled !== false;
    });
  }

  function leerConfigDeNodo(nodo) {
    const box = nodo && nodo.querySelector(".ia-pro-data");
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
    nodo.querySelector(".ia-pro-node-left")?.remove();

    let shell = nodo.querySelector(".ia-pro-node-shell");
    if (shell) {
      const circle = shell.querySelector(".ia-pro-circle");
      if (circle && !circle.querySelector(".ia-pro-icon-wrap")) {
        const iconWrap = document.createElement(TAG_DIV);
        iconWrap.className = "ia-pro-icon-wrap";
        iconWrap.innerHTML = IA_PRO_ICON_SVG;
        const title = circle.querySelector(".ia-pro-title");
        circle.insertBefore(iconWrap, title || null);
      }
      return;
    }

    const portIn = nodo.querySelector(".port.in");
    const actions = nodo.querySelector(".node-actions");
    let titleEl = nodo.querySelector(".ia-pro-title");
    let bodyEl = nodo.querySelector(".ia-pro-body");

    shell = document.createElement(TAG_DIV);
    shell.className = "ia-pro-node-shell";

    const coreCol = document.createElement(TAG_DIV);
    coreCol.className = "ia-pro-core-column";

    const circle = document.createElement(TAG_DIV);
    circle.className = "ia-pro-circle";
    if (portIn) circle.appendChild(portIn);
    if (actions) circle.appendChild(actions);

    const iconWrap = document.createElement(TAG_DIV);
    iconWrap.className = "ia-pro-icon-wrap";
    iconWrap.innerHTML = IA_PRO_ICON_SVG;
    circle.appendChild(iconWrap);

    if (!titleEl) titleEl = document.createElement("h3");
    titleEl.className = "ia-pro-title";
    circle.appendChild(titleEl);

    if (!bodyEl) bodyEl = document.createElement(TAG_DIV);
    bodyEl.className = "ia-pro-body";
    coreCol.appendChild(circle);
    coreCol.appendChild(bodyEl);
    shell.appendChild(coreCol);

    const data = nodo.querySelector(".ia-pro-data");
    if (data) nodo.insertBefore(shell, data);
    else nodo.appendChild(shell);
  }

  function renderVisualNodo(nodo, config) {
    const activos = caminosParaVisual(config);
    ensureEstructuraCircular(nodo);

    nodo.querySelector(".ia-pro-routes-branch")?.remove();
    nodo.querySelectorAll(".port.out").forEach(function (p) {
      p.remove();
    });

    const body = nodo.querySelector(".ia-pro-body");
    const titleEl = nodo.querySelector(".ia-pro-title");
    if (!body || !titleEl) return;

    titleEl.textContent = config.nombreNodo || "Agente IA Pro";
    nodo.classList.remove("ia-pro-node--with-routes");

    if (!activos.length) {
      body.innerHTML =
        '<p class="ia-pro-desc-pill ia-pro-desc-pill--empty">Doble click para configurar</p>';
      return;
    }

    nodo.classList.add("ia-pro-node--with-routes");
    body.innerHTML =
      '<p class="ia-pro-desc-pill">Conversa o avanza por un camino</p>';

    const shell = nodo.querySelector(".ia-pro-node-shell");
    const branch = document.createElement(TAG_DIV);
    branch.className = "ia-pro-routes-branch";

    const stem = document.createElement(TAG_DIV);
    stem.className = "ia-pro-routes-stem";
    stem.setAttribute("aria-hidden", "true");
    branch.appendChild(stem);

    const list = document.createElement("ul");
    list.className = "ia-pro-routes-list";

    activos.forEach(function (route) {
      const label = labelCaminoVisual(route);
      const li = document.createElement("li");
      li.className = "ia-pro-route-pill";
      li.dataset.routeId = route.id;

      const dot = document.createElement("span");
      dot.className = "ia-pro-route-dot";
      li.appendChild(dot);

      const name = document.createElement("span");
      name.className = "ia-pro-route-name";
      name.textContent = label;
      li.appendChild(name);

      const port = document.createElement(TAG_DIV);
      port.className = "port out ia-pro-port-route";
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
    const cfg = sanitizeProData(cleanData);
    const json = JSON.stringify(cfg);
    const box = nodo.querySelector(".ia-pro-data");
    if (box) {
      box.value = json;
      box.textContent = json;
    } else {
      const ta = document.createElement("textarea");
      ta.className = "ia-pro-data";
      ta.style.display = "none";
      ta.value = json;
      nodo.appendChild(ta);
    }
    renderVisualNodo(nodo, cfg);
    configActiva = cfg;
  }

  function syncProductoDesdeDom() {
    const g = function (id) {
      return document.getElementById(id)?.value.trim() || "";
    };
    configActiva.productData = {
      name: g("iaProProductName"),
      description: g("iaProProductDesc"),
      price: g("iaProProductPrice"),
      includes: g("iaProProductIncludes"),
      bonuses: g("iaProProductBonuses"),
      guarantee: g("iaProProductGuarantee"),
      access: g("iaProProductAccess"),
      paymentMethods: g("iaProProductPayment"),
      faq: g("iaProProductFaq"),
    };
  }

  function syncCaminosDesdeDom() {
    const rows = document.querySelectorAll(".ia-pro-ruta-row");
    const caminos = [];
    rows.forEach(function (row) {
      const id = row.dataset.routeId;
      if (!id) return;
      const text = row.querySelector(".ia-pro-ruta-texto")?.value.trim() || "";
      const synsRaw = row.querySelector(".ia-pro-ruta-sinonimos")?.value || "";
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
        priority: parseInt(row.querySelector(".ia-pro-ruta-prioridad")?.value, 10) || 50,
        mediaId: row.querySelector(".ia-pro-ruta-media")?.value.trim() || null,
        enabled: row.querySelector(".ia-pro-ruta-enabled")?.checked !== false,
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
      document.getElementById("iaProNombreNodo")?.value.trim() || "Agente IA Pro";
    configActiva.scoreMinimo =
      parseInt(document.getElementById("iaProScoreMinimo")?.value, 10) || 40;
    configActiva.enabledConversation = !!document.getElementById(
      "iaProEnabledConversation"
    )?.checked;
    configActiva.tone =
      document.getElementById("iaProTone")?.value || "amable";
    configActiva.mensajeFallback =
      document.getElementById("iaProMensajeFallback")?.value.trim() ||
      crearConfigPorDefecto().mensajeFallback;
    syncProductoDesdeDom();
    syncCaminosDesdeDom();
    asegurarArraysCaminos(configActiva);
    return configActiva;
  }

  function renderCaminosEditor() {
    const wrap = document.getElementById("iaProCaminosLista");
    if (!wrap) return;
    const routes = obtenerRoutes(configActiva);
    if (!routes.length) {
      wrap.innerHTML =
        '<p class="ia-pro-caminos-vacio">No hay caminos. Agrega uno.</p>';
      return;
    }
    wrap.innerHTML = routes
      .map(function (route, index) {
        const syns = Array.isArray(route.synonyms)
          ? route.synonyms.join(", ")
          : "";
        return (
          '<div class="ia-pro-ruta-row" data-route-id="' +
          esc(route.id) +
          '">' +
          '<div class="ia-pro-ruta-head"><span>Ruta ' +
          (index + 1) +
          '</span><label><input type="checkbox" class="ia-pro-ruta-enabled"' +
          (route.enabled !== false ? " checked" : "") +
          '> Activo</label><button type="button" class="ia-pro-ruta-del">Eliminar</button></div>' +
          '<div class="panel-campo"><label>Texto del camino</label><input class="ia-pro-ruta-texto" value="' +
          esc(textoCamino(route)) +
          '"></div>' +
          '<div class="panel-campo"><label>Sinónimos (coma)</label><textarea class="ia-pro-ruta-sinonimos ia-textarea" rows="2">' +
          esc(syns) +
          "</textarea></div>" +
          '<div class="panel-campo"><label>Prioridad</label><input type="number" class="ia-pro-ruta-prioridad" min="0" max="100" value="' +
          (route.priority || 50) +
          '"></div>' +
          '<div class="panel-campo"><label>Media ID / URL</label><input class="ia-pro-ruta-media" value="' +
          esc(route.mediaId || "") +
          '"></div>' +
          '<p class="ia-handle-hint">Handle: <code>' +
          esc(route.id) +
          "</code></p></div>"
        );
      })
      .join("");

    wrap.querySelectorAll(".ia-pro-ruta-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const row = btn.closest(".ia-pro-ruta-row");
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

  function toneOptions(selected) {
    return TONOS.map(function (t) {
      return (
        '<option value="' +
        t +
        '"' +
        (t === selected ? " selected" : "") +
        ">" +
        t +
        "</option>"
      );
    }).join("");
  }

  function renderPanel(nodo) {
    if (!nodo) return;
    nodoActivo = nodo;
    configActiva = leerConfigDeNodo(nodo);
    asegurarArraysCaminos(configActiva);
    const pd = configActiva.productData || {};
    const contenido = document.getElementById("panelNodoContenido");
    if (!contenido) return;

    contenido.innerHTML =
      '<div class="ia-pro-panel">' +
      "<h4>🤖 Agente IA Pro</h4>" +
      '<p class="ia-panel-desc">Conversa con datos del producto o enruta por caminos.</p>' +
      '<div class="panel-campo"><label>Nombre del nodo</label><input id="iaProNombreNodo" value="' +
      esc(configActiva.nombreNodo) +
      '"></div>' +
      '<div class="panel-campo"><label>Score mínimo</label><input id="iaProScoreMinimo" type="number" min="0" max="100" value="' +
      configActiva.scoreMinimo +
      '"></div>' +
      "<h5>Producto</h5>" +
      '<div class="panel-campo"><label>Nombre producto</label><input id="iaProProductName" value="' +
      esc(pd.name) +
      '"></div>' +
      '<div class="panel-campo"><label>Descripción breve</label><textarea id="iaProProductDesc" class="ia-textarea" rows="2">' +
      esc(pd.description) +
      "</textarea></div>" +
      '<div class="panel-campo"><label>Precio</label><input id="iaProProductPrice" value="' +
      esc(pd.price) +
      '"></div>' +
      '<div class="panel-campo"><label>Qué incluye</label><textarea id="iaProProductIncludes" class="ia-textarea" rows="2">' +
      esc(pd.includes) +
      "</textarea></div>" +
      '<div class="panel-campo"><label>Bonos</label><textarea id="iaProProductBonuses" class="ia-textarea" rows="2">' +
      esc(pd.bonuses) +
      "</textarea></div>" +
      '<div class="panel-campo"><label>Garantía</label><input id="iaProProductGuarantee" value="' +
      esc(pd.guarantee) +
      '"></div>' +
      '<div class="panel-campo"><label>Acceso / entrega</label><input id="iaProProductAccess" value="' +
      esc(pd.access) +
      '"></div>' +
      '<div class="panel-campo"><label>Métodos de pago</label><textarea id="iaProProductPayment" class="ia-textarea" rows="2">' +
      esc(pd.paymentMethods) +
      "</textarea></div>" +
      '<div class="panel-campo"><label>FAQ extra</label><textarea id="iaProProductFaq" class="ia-textarea" rows="3">' +
      esc(pd.faq) +
      "</textarea></div>" +
      '<div class="panel-campo"><label>Tono conversación</label><select id="iaProTone" class="node-select">' +
      toneOptions(configActiva.tone) +
      "</select></div>" +
      '<label class="ia-toggle"><input type="checkbox" id="iaProEnabledConversation"' +
      (configActiva.enabledConversation ? " checked" : "") +
      "> Activar conversación IA</label>" +
      '<div class="panel-campo"><label>Mensaje fallback</label><textarea id="iaProMensajeFallback" class="ia-textarea" rows="2">' +
      esc(configActiva.mensajeFallback) +
      "</textarea></div>" +
      "<h5>Caminos</h5>" +
      '<div id="iaProCaminosLista"></div>' +
      '<button type="button" class="panel-btn" id="iaProAgregarCamino">+ Agregar camino</button>' +
      '<button type="button" class="panel-btn" id="iaProGuardarPanel">Guardar nodo IA Pro</button>' +
      "</div>";

    renderCaminosEditor();
    document.getElementById("iaProAgregarCamino")?.addEventListener("click", function (ev) {
      ev.preventDefault();
      agregarCamino();
    });
    document.getElementById("iaProGuardarPanel")?.addEventListener("click", function (ev) {
      ev.preventDefault();
      guardarDesdePanel(ev);
    });
    [
      "iaProNombreNodo",
      "iaProScoreMinimo",
      "iaProProductName",
      "iaProProductDesc",
      "iaProProductPrice",
      "iaProProductIncludes",
      "iaProProductBonuses",
      "iaProProductGuarantee",
      "iaProProductAccess",
      "iaProProductPayment",
      "iaProProductFaq",
      "iaProTone",
      "iaProEnabledConversation",
      "iaProMensajeFallback",
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
    actualizarHTMLNodo(nodoActivo, sanitizeProData(configActiva));
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
    actualizarHTMLNodo(nodoActivo, sanitizeProData(configActiva));
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

  function esNodoIAPro(nodo) {
    return (
      nodo &&
      (nodo.dataset.tipo === "ia_pro" ||
        nodo.classList.contains("ia-pro-node") ||
        !!nodo.querySelector(".ia-pro-data"))
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
    nodo.className = "node ia-pro-node";
    nodo.id = id;
    nodo.dataset.tipo = "ia_pro";

    nodo.style.left = (280 + nodoCount * 40) + "px";
    nodo.style.top = (260 + nodoCount * 30) + "px";

    nodo.innerHTML =
      '<div class="ia-pro-node-shell"><div class="ia-pro-core-column">' +
      '<div class="ia-pro-circle">' +
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
      '<div class="ia-pro-icon-wrap">' +
      IA_PRO_ICON_SVG +
      '</div><h3 class="ia-pro-title">Agente IA Pro</h3></div>' +
      '<div class="ia-pro-body"><p class="ia-pro-desc-pill ia-pro-desc-pill--empty">Doble click para configurar</p></div></div></div>' +
      '<textarea class="ia-pro-data" style="display:none;">' +
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
      nodo.querySelectorAll(".port.out:not(.ia-pro-port-route)").forEach(function (p) {
        p.remove();
      });
      if (!nodo.dataset.iaProDblBound) {
        nodo.dataset.iaProDblBound = "1";
        nodo.addEventListener("dblclick", function (ev) {
          ev.stopPropagation();
          if (typeof editarNodo === "function") editarNodo(nodo.id);
        });
      }
      actualizarHTMLNodo(nodo, leerConfigDeNodo(nodo));
    } catch (e) {
      console.warn("IA Pro: error refrescando", e.message);
    }
  }

  return {
    crearConfigPorDefecto,
    leerConfigDeNodo,
    renderPanel,
    guardarDesdePanel,
    esNodoIAPro,
    crearNodoEnCanvas,
    initNodoRecienCreado,
    refrescarNodoCargado,
    flushPanelToNode,
    clearPanelActivo,
    getNodoActivo,
  };
})();

function agregarNodoIAPro() {
  if (window.MacBotIAPro && window.MacBotIAPro.crearNodoEnCanvas) {
    window.MacBotIAPro.crearNodoEnCanvas();
  }
}
