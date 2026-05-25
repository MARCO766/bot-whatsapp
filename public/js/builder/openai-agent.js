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

  /* Logo OpenAI blossom (nudo entrelazado) — path compartido nodo + paleta */
  const OPENAI_LOGO_PATH =
    "M11.248 18.25q-.825 0-1.568-.314a4.3 4.3 0 0 1-1.32-.874 4 4 0 0 1-1.304.214 4 4 0 0 1-2.046-.544 4.27 4.27 0 0 1-1.518-1.485 4 4 0 0 1-.56-2.095q0-.48.131-1.04A4.4 4.4 0 0 1 2.04 10.71a4.07 4.07 0 0 1 .017-3.4 4.2 4.2 0 0 1 1.056-1.418 3.8 3.8 0 0 1 1.6-.842 3.9 3.9 0 0 1 .76-1.683q.593-.759 1.451-1.188a4.04 4.04 0 0 1 1.832-.429q.825 0 1.567.313.742.314 1.32.875a4 4 0 0 1 1.304-.215q1.106 0 2.046.545a4.14 4.14 0 0 1 1.501 1.485q.578.941.578 2.095 0 .48-.132 1.04.66.61 1.023 1.419.363.792.363 1.666 0 .892-.38 1.717a4.3 4.3 0 0 1-1.072 1.435 3.8 3.8 0 0 1-1.584.825 3.8 3.8 0 0 1-.775 1.683 4.06 4.06 0 0 1-1.436 1.188 4.04 4.04 0 0 1-1.832.429m-4.076-2.062q.825 0 1.435-.347l3.103-1.782a.36.36 0 0 0 .164-.313v-1.42L7.881 14.62a.67.67 0 0 1-.726 0l-3.118-1.798a.5.5 0 0 1-.017.115v.198q0 .841.396 1.551.413.693 1.139 1.089a3.2 3.2 0 0 0 1.617.412m.165-2.69a.4.4 0 0 0 .181.05q.083 0 .165-.05l1.238-.71-3.977-2.31a.7.7 0 0 1-.363-.643v-3.58q-.825.362-1.32 1.122a2.9 2.9 0 0 0-.495 1.65q0 .809.413 1.55.412.743 1.072 1.123zm3.91 3.663q.875 0 1.585-.396a2.96 2.96 0 0 0 1.534-2.64v-3.564a.32.32 0 0 0-.165-.297l-1.254-.726v4.604a.7.7 0 0 1-.363.643l-3.119 1.799a3 3 0 0 0 1.783.577m.627-6.039V8.878L10.01 7.822 8.129 8.878v2.244l1.881 1.056zM7.057 5.859a.7.7 0 0 1 .363-.644l3.119-1.798a3 3 0 0 0-1.782-.578q-.874 0-1.584.396A2.96 2.96 0 0 0 6.05 4.324a3.07 3.07 0 0 0-.396 1.551v3.547q0 .199.165.314l1.237.726zm8.383 7.887q.825-.364 1.303-1.123.495-.758.495-1.65a3.15 3.15 0 0 0-.412-1.55q-.413-.743-1.073-1.123l-3.086-1.782q-.099-.065-.181-.049a.3.3 0 0 0-.165.05l-1.238.692 3.993 2.327a.6.6 0 0 1 .264.264.64.64 0 0 1 .1.363zm-3.317-8.382a.63.63 0 0 1 .726 0l3.135 1.831v-.297q0-.792-.396-1.501a2.86 2.86 0 0 0-1.105-1.155q-.71-.43-1.65-.43-.825 0-1.436.347L8.294 5.941a.36.36 0 0 0-.165.314v1.418z";

  function buildOpenAILogoSvg(className) {
    return (
      '<svg class="' +
      className +
      '" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="' +
      OPENAI_LOGO_PATH +
      '"/>' +
      "</svg>"
    );
  }

  const OPENAI_ICON_SVG = buildOpenAILogoSvg("openai-agent-icon-svg");

  function initPaletteButtonIcon() {
    const btn = document.querySelector(".menu-nodo-btn-openai-agent");
    if (!btn) return;
    let wrap = btn.querySelector(".menu-nodo-btn-openai-agent__icon");
    if (!wrap) {
      wrap = document.createElement("span");
      wrap.className = "menu-nodo-btn-openai-agent__icon";
      wrap.setAttribute("aria-hidden", "true");
      btn.insertBefore(wrap, btn.firstChild);
    }
    wrap.innerHTML = buildOpenAILogoSvg("openai-palette-icon-svg");
  }

  const ROUTE_ICON_SVG = {
    qr:
      '<svg class="openai-agent-route-icon-svg" viewBox="0 0 16 16" aria-hidden="true">' +
      '<rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor"/>' +
      '<rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" opacity="0.55"/>' +
      '<rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.55"/>' +
      '<rect x="10" y="10" width="2" height="2" fill="currentColor"/>' +
      '<rect x="12" y="12" width="2" height="2" fill="currentColor"/></svg>',
    deposito:
      '<svg class="openai-agent-route-icon-svg" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path fill="currentColor" d="M2 6h12v7H2V6zm1-3h10l1 3H2l1-3zm2 8h2v2H5v-2zm4 0h2v2H9v-2z"/></svg>',
    garantia:
      '<svg class="openai-agent-route-icon-svg" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path fill="currentColor" d="M8 1.5L3 4v4.2c0 3.1 2.1 5.9 5 6.3 2.9-.4 5-3.2 5-6.3V4L8 1.5zm3.2 5.5L7.3 11 4.8 8.5l1-1 1.5 1.5 3.4-3.4 1.5 1.4z"/></svg>',
    default:
      '<svg class="openai-agent-route-icon-svg" viewBox="0 0 16 16" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="3" fill="currentColor"/></svg>',
  };

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

  function tipoIconoCamino(route) {
    const t = textoCamino(route).toLowerCase();
    if (/\bqr\b|codigo\s*qr|pago\s*qr/.test(t) || t.includes("qr")) return "qr";
    if (/deposito|depósito|banco|transferencia/.test(t)) return "deposito";
    if (/garantia|garantía|devolucion|devolución|reembolso/.test(t)) return "garantia";
    return "default";
  }

  function ensureBadgeEnCirculo(circle) {
    if (!circle || circle.querySelector(".openai-agent-status-badge")) return;
    const badge = document.createElement("span");
    badge.className = "openai-agent-status-badge";
    badge.textContent = "IA ACTIVA";
    circle.insertBefore(badge, circle.firstChild);
  }

  function ensureEstructuraCircular(nodo) {
    nodo.querySelector(".openai-agent-node-left")?.remove();

    let shell = nodo.querySelector(".openai-agent-node-shell");
    if (shell) {
      const circle = shell.querySelector(".openai-agent-circle");
      if (circle) {
        ensureBadgeEnCirculo(circle);
        const iconWrap = circle.querySelector(".openai-agent-icon-wrap");
        if (iconWrap) {
          iconWrap.innerHTML = OPENAI_ICON_SVG;
        } else {
          const wrap = document.createElement(TAG_DIV);
          wrap.className = "openai-agent-icon-wrap";
          wrap.innerHTML = OPENAI_ICON_SVG;
          const title = circle.querySelector(".openai-agent-title");
          circle.insertBefore(wrap, title || null);
        }
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
    ensureBadgeEnCirculo(circle);
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
    ensureBadgeEnCirculo(nodo.querySelector(".openai-agent-circle"));

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
        '<p class="openai-agent-subtitle openai-agent-subtitle--muted">OpenAI responde o enruta por caminos</p>' +
        '<p class="openai-agent-desc-pill openai-agent-desc-pill--empty">Doble click para configurar</p>';
      return;
    }

    nodo.classList.add("openai-agent-node--with-routes");
    body.innerHTML =
      '<p class="openai-agent-subtitle">OpenAI responde o enruta por caminos</p>';

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
      const iconTipo = tipoIconoCamino(route);
      const li = document.createElement("li");
      li.className =
        "openai-agent-route-pill openai-agent-route-pill--" + iconTipo;
      li.dataset.routeId = route.id;

      const iconWrap = document.createElement("span");
      iconWrap.className =
        "openai-agent-route-icon openai-agent-route-icon--" + iconTipo;
      iconWrap.innerHTML = ROUTE_ICON_SVG[iconTipo] || ROUTE_ICON_SVG.default;
      li.appendChild(iconWrap);

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
        '<p class="openai-agent-caminos-vacio oai-routes-empty">No hay caminos. Agrega uno.</p>';
      return;
    }
    wrap.innerHTML = routes
      .map(function (route, index) {
        const syns = Array.isArray(route.synonyms)
          ? route.synonyms.join(", ")
          : "";
        const label = textoCamino(route) || "Sin nombre";
        return (
          '<div class="openai-agent-ruta-row oai-route-card" data-route-id="' +
          esc(route.id) +
          '">' +
          '<div class="openai-agent-ruta-head oai-route-card__head">' +
          '<div class="oai-route-card__title">' +
          '<span class="oai-route-badge">Ruta ' +
          (index + 1) +
          "</span>" +
          '<span class="oai-route-name-preview">' +
          esc(label) +
          "</span></div>" +
          '<div class="oai-route-card__toolbar">' +
          '<label class="oai-toggle"><input type="checkbox" class="openai-agent-ruta-enabled"' +
          (route.enabled !== false ? " checked" : "") +
          '><span class="oai-toggle__track" aria-hidden="true"></span><span class="oai-toggle__label">Activo</span></label>' +
          '<button type="button" class="openai-agent-ruta-del oai-btn oai-btn--danger oai-btn--sm">Eliminar</button>' +
          "</div></div>" +
          '<div class="oai-route-card__body">' +
          '<div class="panel-campo oai-field"><label>Texto del camino</label><input class="openai-agent-ruta-texto oai-input" value="' +
          esc(textoCamino(route)) +
          '"></div>' +
          '<div class="panel-campo oai-field"><label>Sinónimos (coma)</label><textarea class="openai-agent-ruta-sinonimos ia-textarea oai-input oai-textarea" rows="2">' +
          esc(syns) +
          "</textarea></div>" +
          '<div class="oai-field-row">' +
          '<div class="panel-campo oai-field oai-field--half"><label>Prioridad</label><input type="number" class="openai-agent-ruta-prioridad oai-input" min="0" max="100" value="' +
          (route.priority || 50) +
          '"></div>' +
          '<div class="panel-campo oai-field oai-field--half"><label>Media ID / URL</label><input class="openai-agent-ruta-media oai-input" value="' +
          esc(route.mediaId || "") +
          '"></div></div>' +
          '<p class="ia-handle-hint oai-handle-hint">Handle conexión: <code>' +
          esc(route.id) +
          "</code></p></div></div>"
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

    const panelShell = document.getElementById("panelNodo");
    if (panelShell) {
      panelShell.classList.add("panel-nodo--openai-agent");
    }

    contenido.innerHTML =
      '<div class="openai-agent-panel oai-panel-root">' +
      '<header class="oai-panel-hero">' +
      '<div class="oai-panel-hero__top">' +
      '<div class="oai-panel-hero__titles">' +
      '<h4 class="oai-panel-hero__title">Agente OpenAI</h4>' +
      '<span class="oai-panel-hero__badge">IA activa</span>' +
      "</div></div>" +
      '<p class="ia-panel-desc oai-panel-hero__desc">OpenAI responde al lead o enruta por caminos sin texto extra.</p>' +
      "</header>" +
      '<div class="oai-panel-scroll">' +
      '<section class="oai-card oai-card--model">' +
      '<h5 class="oai-card__title">Configuración del modelo</h5>' +
      '<div class="panel-campo oai-field"><label>Nombre del nodo</label><input id="openaiAgentNombreNodo" class="oai-input" value="' +
      esc(configActiva.nombreNodo) +
      '"></div>' +
      '<div class="oai-field-row">' +
      '<div class="panel-campo oai-field oai-field--grow"><label>Modelo</label><input id="openaiAgentModel" class="oai-input" value="' +
      esc(configActiva.model || "gpt-4o-mini") +
      '"></div>' +
      '<div class="panel-campo oai-field oai-field--sm"><label>Temperatura</label><input id="openaiAgentTemperature" class="oai-input" type="number" min="0" max="1" step="0.1" value="' +
      (configActiva.temperature ?? 0.7) +
      '"></div></div>' +
      '<div class="panel-campo oai-field"><label>Score mínimo caminos</label><input id="openaiAgentScoreMinimo" class="oai-input" type="number" min="0" max="100" value="' +
      configActiva.scoreMinimo +
      '"></div></section>' +
      '<section class="oai-card oai-card--prompt">' +
      '<h5 class="oai-card__title">Prompt del producto</h5>' +
      '<div class="panel-campo oai-field oai-field--prompt"><label>Instrucciones y datos del producto</label>' +
      '<textarea id="openaiAgentPrompt" class="ia-textarea openai-agent-prompt-area oai-input oai-textarea oai-textarea--prompt" rows="12" placeholder="' +
      esc(PROMPT_PLACEHOLDER) +
      '">' +
      esc(configActiva.openaiPrompt || "") +
      "</textarea></div></section>" +
      '<section class="oai-card oai-card--routes">' +
      '<h5 class="oai-card__title">Caminos inteligentes</h5>' +
      '<p class="oai-card__hint">Cada salida usa sinónimos para detectar intención del lead.</p>' +
      '<div id="openaiAgentCaminosLista" class="oai-routes-list"></div>' +
      '<button type="button" class="panel-btn oai-btn oai-btn--add" id="openaiAgentAgregarCamino">+ Agregar camino</button>' +
      "</section>" +
      '<section class="oai-card oai-card--actions">' +
      '<h5 class="oai-card__title">Acciones</h5>' +
      '<button type="button" class="panel-btn oai-btn oai-btn--save" id="openaiAgentGuardarPanel">Guardar Agente OpenAI</button>' +
      "</section></div></div>";

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
    document.getElementById("panelNodo")?.classList.remove("panel-nodo--openai-agent");
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
      '<span class="openai-agent-status-badge">IA ACTIVA</span>' +
      '<div class="openai-agent-icon-wrap">' +
      OPENAI_ICON_SVG +
      '</div><h3 class="openai-agent-title">Agente OpenAI</h3></div>' +
      '<div class="openai-agent-body">' +
      '<p class="openai-agent-subtitle openai-agent-subtitle--muted">OpenAI responde o enruta por caminos</p>' +
      '<p class="openai-agent-desc-pill openai-agent-desc-pill--empty">Doble click para configurar</p></div></div></div>' +
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

  initPaletteButtonIcon();

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
    buildOpenAILogoSvg,
    initPaletteButtonIcon,
  };
})();

function agregarNodoOpenAIAgent() {
  if (window.MacBotOpenAIAgent && window.MacBotOpenAIAgent.crearNodoEnCanvas) {
    window.MacBotOpenAIAgent.crearNodoEnCanvas();
  }
}
