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
    '<svg class="ia-pro-icon-svg" viewBox="0 0 32 32" width="38" height="38" aria-hidden="true">' +
    '<defs><linearGradient id="iaproIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
    '<stop offset="0%" stop-color="#c4b5fd"/><stop offset="50%" stop-color="#a78bfa"/>' +
    '<stop offset="100%" stop-color="#67e8f9"/></linearGradient></defs>' +
    '<circle cx="16" cy="16" r="14" fill="none" stroke="url(#iaproIconGrad)" stroke-width="1.4" opacity="0.9"/>' +
    '<path fill="url(#iaproIconGrad)" d="M16 8c2.8 0 5 2.2 5 5v1h1.5a3.5 3.5 0 0 1 3.5 3.5V20a2 2 0 0 1-2 2h-1v1.5a2.5 2.5 0 0 1-5 0V22h-1a2 2 0 0 1-2-2v-2.5A3.5 3.5 0 0 1 9.5 14H11v-1c0-2.8 2.2-5 5-5zm-3.5 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>';

  const ROUTE_ICON_SVG = {
    qr:
      '<svg class="ia-pro-route-icon-svg" viewBox="0 0 16 16" aria-hidden="true">' +
      '<rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor"/>' +
      '<rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" opacity="0.55"/>' +
      '<rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.55"/>' +
      '<rect x="10" y="10" width="2" height="2" fill="currentColor"/></svg>',
    deposito:
      '<svg class="ia-pro-route-icon-svg" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path fill="currentColor" d="M2 6h12v7H2V6zm1-3h10l1 3H2l1-3zm2 8h2v2H5v-2zm4 0h2v2H9v-2z"/></svg>',
    garantia:
      '<svg class="ia-pro-route-icon-svg" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path fill="currentColor" d="M8 1.5L3 4v4.2c0 3.1 2.1 5.9 5 6.3 2.9-.4 5-3.2 5-6.3V4L8 1.5zm3.2 5.5L7.3 11 4.8 8.5l1-1 1.5 1.5 3.4-3.4 1.5 1.4z"/></svg>',
    default:
      '<svg class="ia-pro-route-icon-svg" viewBox="0 0 16 16" aria-hidden="true">' +
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

  function tipoIconoCamino(route) {
    const t = textoCamino(route).toLowerCase();
    if (/\bqr\b|codigo\s*qr|pago\s*qr/.test(t) || t.includes("qr")) return "qr";
    if (/deposito|depósito|banco|transferencia/.test(t)) return "deposito";
    if (/garantia|garantía|devolucion|devolución|reembolso/.test(t)) return "garantia";
    return "default";
  }

  function ensureBadgeEnCirculo(circle) {
    if (!circle || circle.querySelector(".ia-pro-status-badge")) return;
    const badge = document.createElement("span");
    badge.className = "ia-pro-status-badge";
    badge.textContent = "IA PRO";
    circle.insertBefore(badge, circle.firstChild);
  }

  function ensureEstructuraCircular(nodo) {
    nodo.querySelector(".ia-pro-node-left")?.remove();

    let shell = nodo.querySelector(".ia-pro-node-shell");
    if (shell) {
      const circle = shell.querySelector(".ia-pro-circle");
      if (circle) {
        ensureBadgeEnCirculo(circle);
        if (!circle.querySelector(".ia-pro-icon-wrap")) {
          const iconWrap = document.createElement(TAG_DIV);
          iconWrap.className = "ia-pro-icon-wrap";
          iconWrap.innerHTML = IA_PRO_ICON_SVG;
          const title = circle.querySelector(".ia-pro-title");
          circle.insertBefore(iconWrap, title || null);
        }
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
    ensureBadgeEnCirculo(circle);
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
    ensureBadgeEnCirculo(nodo.querySelector(".ia-pro-circle"));

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
        '<p class="ia-pro-subtitle ia-pro-subtitle--muted">Conversación + rutas inteligentes</p>' +
        '<p class="ia-pro-desc-pill ia-pro-desc-pill--empty">Doble click para configurar</p>';
      return;
    }

    nodo.classList.add("ia-pro-node--with-routes");
    body.innerHTML =
      '<p class="ia-pro-subtitle">Conversación + rutas inteligentes</p>';

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
      const iconTipo = tipoIconoCamino(route);
      const li = document.createElement("li");
      li.className = "ia-pro-route-pill ia-pro-route-pill--" + iconTipo;
      li.dataset.routeId = route.id;

      const iconWrap = document.createElement("span");
      iconWrap.className = "ia-pro-route-icon ia-pro-route-icon--" + iconTipo;
      iconWrap.innerHTML = ROUTE_ICON_SVG[iconTipo] || ROUTE_ICON_SVG.default;
      li.appendChild(iconWrap);

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
        '<div class="iapro-routes-empty">' +
        '<p class="ia-pro-caminos-vacio iapro-routes-empty__title">No hay caminos todavía</p>' +
        '<p class="iapro-routes-empty__desc">Agrega rutas para que la IA avance según intención del lead</p>' +
        "</div>";
      return;
    }
    wrap.innerHTML = routes
      .map(function (route, index) {
        const syns = Array.isArray(route.synonyms)
          ? route.synonyms.join(", ")
          : "";
        const label = textoCamino(route) || "Sin nombre";
        return (
          '<div class="ia-pro-ruta-row iapro-route-card" data-route-id="' +
          esc(route.id) +
          '">' +
          '<div class="ia-pro-ruta-head iapro-route-card__head">' +
          '<div class="iapro-route-card__title">' +
          '<span class="iapro-route-badge">Ruta ' +
          (index + 1) +
          "</span>" +
          '<span class="iapro-route-name-preview">' +
          esc(label) +
          "</span></div>" +
          '<div class="iapro-route-card__toolbar">' +
          '<label class="iapro-toggle"><input type="checkbox" class="ia-pro-ruta-enabled"' +
          (route.enabled !== false ? " checked" : "") +
          '><span class="iapro-toggle__track" aria-hidden="true"></span><span class="iapro-toggle__label">Activo</span></label>' +
          '<button type="button" class="ia-pro-ruta-del iapro-btn iapro-btn--danger iapro-btn--sm">Eliminar</button>' +
          "</div></div>" +
          '<div class="iapro-route-card__body">' +
          '<div class="panel-campo iapro-field"><label>Texto del camino</label><input class="ia-pro-ruta-texto iapro-input" placeholder="Ej: precio, pago, garantía" value="' +
          esc(textoCamino(route)) +
          '"></div>' +
          '<div class="panel-campo iapro-field"><label>Sinónimos (coma)</label><textarea class="ia-pro-ruta-sinonimos ia-textarea iapro-input iapro-textarea" rows="2" placeholder="barato, cuánto cuesta, valor">' +
          esc(syns) +
          "</textarea></div>" +
          '<div class="iapro-field-row">' +
          '<div class="panel-campo iapro-field iapro-field--half"><label>Prioridad</label><input type="number" class="ia-pro-ruta-prioridad iapro-input" min="0" max="100" value="' +
          (route.priority || 50) +
          '"></div>' +
          '<div class="panel-campo iapro-field iapro-field--half"><label>Media ID / URL</label><input class="ia-pro-ruta-media iapro-input" placeholder="ID o URL de imagen/video" value="' +
          esc(route.mediaId || "") +
          '"></div></div>' +
          '<p class="ia-handle-hint iapro-handle-hint">Handle conexión: <code>' +
          esc(route.id) +
          "</code></p></div></div>"
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

    const panelShell = document.getElementById("panelNodo");
    if (panelShell) {
      panelShell.classList.add("panel-nodo--ia-pro");
    }

    contenido.innerHTML =
      '<div class="ia-pro-panel iapro-panel-root">' +
      '<header class="iapro-panel-hero">' +
      '<div class="iapro-panel-hero__top">' +
      '<div class="iapro-panel-hero__titles">' +
      '<h4 class="iapro-panel-hero__title">Agente IA Pro</h4>' +
      '<span class="iapro-panel-hero__badge">IA activa</span>' +
      "</div></div>" +
      '<p class="ia-panel-desc iapro-panel-hero__desc">Conversación con datos del producto o enruta por caminos inteligentes.</p>' +
      "</header>" +
      '<div class="iapro-panel-scroll">' +
      '<section class="iapro-card iapro-card--general">' +
      '<h5 class="iapro-card__title">Configuración general</h5>' +
      '<div class="panel-campo iapro-field"><label>Nombre del nodo</label><input id="iaProNombreNodo" class="iapro-input" placeholder="Agente IA Pro" value="' +
      esc(configActiva.nombreNodo) +
      '"></div>' +
      '<div class="panel-campo iapro-field"><label>Score mínimo caminos</label><input id="iaProScoreMinimo" class="iapro-input" type="number" min="0" max="100" value="' +
      configActiva.scoreMinimo +
      '"></div></section>' +
      '<section class="iapro-card iapro-card--product">' +
      '<h5 class="iapro-card__title">Datos del producto</h5>' +
      '<p class="iapro-card__hint">La IA usa estos datos para responder sin inventar información.</p>' +
      '<div class="iapro-product-grid">' +
      '<div class="panel-campo iapro-field"><label>Nombre producto</label><input id="iaProProductName" class="iapro-input" placeholder="Ej: Pack 4000 plantillas papercraft" value="' +
      esc(pd.name) +
      '"></div>' +
      '<div class="panel-campo iapro-field"><label>Descripción breve</label><textarea id="iaProProductDesc" class="ia-textarea iapro-input iapro-textarea" rows="2" placeholder="Resumen en 1-2 líneas para la IA">' +
      esc(pd.description) +
      "</textarea></div>" +
      '<div class="panel-campo iapro-field"><label>Precio</label><input id="iaProProductPrice" class="iapro-input" placeholder="Ej: 29 Bs / $9 USD" value="' +
      esc(pd.price) +
      '"></div>' +
      '<div class="panel-campo iapro-field"><label>Qué incluye</label><textarea id="iaProProductIncludes" class="ia-textarea iapro-input iapro-textarea" rows="2" placeholder="Lista lo que recibe el cliente">' +
      esc(pd.includes) +
      "</textarea></div>" +
      '<div class="panel-campo iapro-field"><label>Bonos</label><textarea id="iaProProductBonuses" class="ia-textarea iapro-input iapro-textarea" rows="2" placeholder="Bonos extra incluidos">' +
      esc(pd.bonuses) +
      "</textarea></div>" +
      '<div class="panel-campo iapro-field"><label>Garantía</label><input id="iaProProductGuarantee" class="iapro-input" placeholder="Ej: 7 días de garantía" value="' +
      esc(pd.guarantee) +
      '"></div>' +
      '<div class="panel-campo iapro-field"><label>Acceso / entrega</label><input id="iaProProductAccess" class="iapro-input" placeholder="Ej: enlace por WhatsApp al instante" value="' +
      esc(pd.access) +
      '"></div>' +
      '<div class="panel-campo iapro-field"><label>Métodos de pago</label><textarea id="iaProProductPayment" class="ia-textarea iapro-input iapro-textarea" rows="2" placeholder="QR, depósito, Yape, etc.">' +
      esc(pd.paymentMethods) +
      "</textarea></div>" +
      '<div class="panel-campo iapro-field"><label>FAQ extra</label><textarea id="iaProProductFaq" class="ia-textarea iapro-input iapro-textarea" rows="3" placeholder="Preguntas frecuentes adicionales">' +
      esc(pd.faq) +
      "</textarea></div></div></section>" +
      '<section class="iapro-card iapro-card--conversation">' +
      '<h5 class="iapro-card__title">Conversación IA</h5>' +
      '<div class="panel-campo iapro-field"><label>Tono conversación</label><select id="iaProTone" class="node-select iapro-input iapro-select">' +
      toneOptions(configActiva.tone) +
      "</select></div>" +
      '<label class="ia-toggle iapro-toggle iapro-toggle--conversation"><input type="checkbox" id="iaProEnabledConversation"' +
      (configActiva.enabledConversation ? " checked" : "") +
      '><span class="iapro-toggle__track" aria-hidden="true"></span><span class="iapro-toggle__label">Activar conversación IA</span></label>' +
      '<div class="panel-campo iapro-field"><label>Mensaje fallback</label><textarea id="iaProMensajeFallback" class="ia-textarea iapro-input iapro-textarea" rows="3" placeholder="Mensaje si la IA no entiende al lead">' +
      esc(configActiva.mensajeFallback) +
      "</textarea></div></section>" +
      '<section class="iapro-card iapro-card--routes">' +
      '<h5 class="iapro-card__title">Caminos inteligentes</h5>' +
      '<p class="iapro-card__hint">Cada salida detecta intención por texto y sinónimos.</p>' +
      '<div id="iaProCaminosLista" class="iapro-routes-list"></div>' +
      '<button type="button" class="panel-btn iapro-btn iapro-btn--add" id="iaProAgregarCamino">+ Agregar camino</button>' +
      "</section>" +
      '<section class="iapro-card iapro-card--actions">' +
      '<h5 class="iapro-card__title">Acciones</h5>' +
      '<button type="button" class="panel-btn iapro-btn iapro-btn--save" id="iaProGuardarPanel">Guardar nodo IA Pro</button>' +
      "</section></div></div>";

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
    document.getElementById("panelNodo")?.classList.remove("panel-nodo--ia-pro");
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
      '<button type="button" class="duplicate-node" onclick="event.stopPropagation(); duplicarNodo(\'' +
      id +
      '\')" title="Duplicar" aria-label="Duplicar">⧉</button>' +
      '<button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo(\'' +
      id +
      '\')">×</button></div>' +
      '<span class="ia-pro-status-badge">IA PRO</span>' +
      '<div class="ia-pro-icon-wrap">' +
      IA_PRO_ICON_SVG +
      '</div><h3 class="ia-pro-title">Agente IA Pro</h3></div>' +
      '<div class="ia-pro-body">' +
      '<p class="ia-pro-subtitle ia-pro-subtitle--muted">Conversación + rutas inteligentes</p>' +
      '<p class="ia-pro-desc-pill ia-pro-desc-pill--empty">Doble click para configurar</p></div></div></div>' +
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
