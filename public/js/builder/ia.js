/**
 * MacBot — Nodo IA local ultra (router silencioso + caminos dinámicos)
 */
window.MacBotIA = (function () {
  const TAG_DIV = "di" + "v";

  let nodoActivo = null;
  let configActiva = crearConfigPorDefecto();
  let renderVisualTimer = null;

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

  const CAMPOS_CONFIG_TOP_CONOCIDOS = new Set([
    "version",
    "nombreNodo",
    "label",
    "scoreMinimo",
    "threshold",
    "caminos",
    "routes",
    "comportamiento",
    "behavior",
    "esperarRespuesta",
    "correccionOrtografica",
    "ttlHoras",
    "session",
  ]);

  const ROUTE_ICON_SVG = {
    texto:
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 4h12v1.5H2V4zm0 3.5h8v1.5H2V7.5zm0 3.5h10v1.5H2V11z"/></svg>',
    default:
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  };

  function crearConfigPorDefecto() {
    return {
      version: 3,
      nombreNodo: "Agente Rápido",
      scoreMinimo: 40,
      esperarRespuesta: true,
      correccionOrtografica: true,
      ttlHoras: null,
      session: {
        esperarRespuesta: true,
        ttlHoras: null,
      },
      caminos: [],
      comportamiento: {
        responderSiNoCoincide: true,
        mensajeFallback:
          "No entendí bien 😊\n¿Buscas QR, depósito o Tigo Money?",
        activarOtrosFlujos: false,
        responderConAudio: false,
      },
    };
  }

  function preservarCamposExtraTop(src, conocidos) {
    const extras = {};
    if (!src || typeof src !== "object") return extras;
    Object.keys(src).forEach(function (key) {
      if (!conocidos.has(key)) extras[key] = src[key];
    });
    return extras;
  }

  function normalizarOpcionesSesion(src) {
    const base = src && typeof src === "object" ? src : {};
    const session =
      base.session && typeof base.session === "object" ? { ...base.session } : {};
    const esperarRespuesta = base.esperarRespuesta ?? session.esperarRespuesta;
    const ttlRaw = base.ttlHoras ?? session.ttlHoras;
    let ttlHoras = null;
    if (ttlRaw != null && String(ttlRaw).trim() !== "") {
      const parsed = parseInt(ttlRaw, 10);
      ttlHoras = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    return {
      esperarRespuesta: esperarRespuesta !== false,
      correccionOrtografica: base.correccionOrtografica !== false,
      ttlHoras: ttlHoras,
      session: {
        ...session,
        esperarRespuesta: esperarRespuesta !== false,
        ttlHoras: ttlHoras,
      },
    };
  }

  function migrarConfigLegacy(data) {
    const cfg = crearConfigPorDefecto();
    if (!data || typeof data !== "object") return cfg;

    Object.assign(cfg, data);
    cfg.version = 3;

    if (!obtenerRoutes(cfg).length) {
      const caminos = [];
      const reglas = data.reglas || {};
      Object.keys(reglas).forEach(function (key) {
        const syns = Array.isArray(reglas[key]) ? reglas[key] : [];
        if (!syns.length) return;
        caminos.push({
          id: generarRouteId(),
          nombre: key,
          synonyms: syns,
          priority: 50,
          mediaId: "",
          enabled: true,
        });
      });
      cfg.caminos = caminos;
      cfg.routes = caminos;
    }

    cfg.comportamiento = {
      responderSiNoCoincide:
        data.comportamiento?.responderSiNoCoincide !== false,
      mensajeFallback:
        data.comportamiento?.mensajeFallback ||
        data.mensajeFallback ||
        cfg.comportamiento.mensajeFallback,
      activarOtrosFlujos: !!(
        data.comportamiento?.activarOtrosFlujos || data.activarOtrosFlujos
      ),
      responderConAudio: !!(
        data.comportamiento?.responderConAudio || data.responderConAudio
      ),
    };

    cfg.scoreMinimo = parseInt(cfg.scoreMinimo, 10) || 40;
    Object.assign(cfg, normalizarOpcionesSesion(cfg));
    asegurarArraysCaminos(cfg);
    return cfg;
  }

  /** Solo JSON plano — nunca DOM, eventos ni referencias circulares. */
  function sanitizeIAData(localIA) {
    const src = localIA && typeof localIA === "object" ? localIA : {};
    const routesRaw = obtenerRoutes(src);
    const routes = normalizarCaminos(routesRaw, true);
    const comp = src.comportamiento || src.behavior || {};
    const opcionesSesion = normalizarOpcionesSesion(src);
    const extrasTop = preservarCamposExtraTop(src, CAMPOS_CONFIG_TOP_CONOCIDOS);

    return {
      version: 3,
      nombreNodo: String(src.nombreNodo || src.label || "Agente Rápido").trim(),
      scoreMinimo: Math.min(
        100,
        Math.max(0, parseInt(src.scoreMinimo ?? src.threshold, 10) || 40)
      ),
      ...opcionesSesion,
      caminos: routes,
      routes: routes,
      comportamiento: {
        responderSiNoCoincide: comp.responderSiNoCoincide !== false && comp.fallback !== false,
        mensajeFallback: String(
          comp.mensajeFallback ||
            comp.fallbackMessage ||
            crearConfigPorDefecto().comportamiento.mensajeFallback
        ).trim(),
        activarOtrosFlujos: !!comp.activarOtrosFlujos,
        responderConAudio: !!(comp.responderConAudio ?? comp.responderAudio),
      },
      ...extrasTop,
    };
  }

  function obtenerRoutes(cfg) {
    const raw = cfg?.routes ?? cfg?.caminos;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object") {
      return Object.values(raw).filter(function (r) {
        return r && typeof r === "object";
      });
    }
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

  function unlockCanvasBuilder() {
    if (typeof window.macbotUnlockCanvasInteraction === "function") {
      window.macbotUnlockCanvasInteraction();
    }
    console.log("🔓 CANVAS UNLOCKED");
  }

  function labelCaminoVisual(route) {
    const t = textoCamino(route);
    return t || "Camino sin nombre";
  }

  function normalizarTipoCamino(raw) {
    const tipo = String(raw || "texto").trim();
    return tipo === "payment_reader" ? "payment_reader" : "texto";
  }

  function normalizarRutaExtensible(route) {
    const r = route && typeof route === "object" ? route : {};
    const syns = Array.isArray(r.synonyms)
      ? r.synonyms
      : String(r.synonyms || "")
          .split(",")
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean);
    const text = textoCamino(r);
    const base = {
      id: String(r.id || generarRouteId()).trim(),
      text: text,
      name: text,
      nombre: text,
      type: normalizarTipoCamino(r.type),
      synonyms: syns,
      priority: parseInt(r.priority, 10) || 50,
      mediaId: r.mediaId ? String(r.mediaId).trim() : null,
      enabled: r.enabled !== false,
    };

    const conocidos = new Set([
      "id",
      "text",
      "name",
      "nombre",
      "type",
      "synonyms",
      "priority",
      "mediaId",
      "enabled",
      "keywords",
      "palabras",
      "etiquetas",
    ]);
    const extras = {};
    Object.keys(r).forEach(function (key) {
      if (!conocidos.has(key)) extras[key] = r[key];
    });

    return { ...extras, ...base };
  }

  function normalizarCaminos(caminos, soloValidos) {
    if (!Array.isArray(caminos)) return [];
    return caminos
      .map(normalizarRutaExtensible)
      .filter(function (r) {
        if (!r.id) return false;
        if (soloValidos === false) return true;
        return !!r.text;
      });
  }

  function normalizarConfig(data) {
    const base = migrarConfigLegacy(data || {});
    return sanitizeIAData(base);
  }

  function caminosParaVisual(config) {
    return normalizarCaminos(obtenerRoutes(config), false).filter(function (r) {
      return r.enabled !== false;
    });
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

  const IA_ICON_SVG =
    '<svg class="ia-icon-svg" viewBox="0 0 32 32" width="38" height="38" aria-hidden="true">' +
    '<defs><linearGradient id="iaIconGradFast" x1="0%" y1="0%" x2="100%" y2="100%">' +
    '<stop offset="0%" stop-color="#6ee7b7"/><stop offset="45%" stop-color="#22d3ee"/>' +
    '<stop offset="100%" stop-color="#34d399"/></linearGradient></defs>' +
    '<circle cx="16" cy="16" r="13" fill="none" stroke="url(#iaIconGradFast)" stroke-width="1.3" opacity="0.9"/>' +
    '<path fill="url(#iaIconGradFast)" d="M18.5 6.2l-1.6 8.1 5.8 2.5-8.4 11.2v-5.8l-5.8-2.5 8.4-11.2h-5z"/></svg>';

  function ensureBadgeEnCirculoIA(circle) {
    if (!circle) return;
    let badge = circle.querySelector(".ia-speed-badge");
    if (!badge) {
      badge = document.createElement(TAG_DIV);
      badge.className = "ia-speed-badge";
      badge.textContent = "RÁPIDO";
      circle.insertBefore(badge, circle.firstChild);
    }
  }

  function ensureEstructuraCircularIA(nodo) {
    nodo.querySelector(".ia-node-left")?.remove();
    nodo.querySelector(".ia-header")?.remove();

    let shell = nodo.querySelector(".ia-node-shell");
    if (shell) {
      const circle = shell.querySelector(".ia-circle");
      if (circle) {
        ensureBadgeEnCirculoIA(circle);
        const portIn = nodo.querySelector(".port.in");
        const actions = nodo.querySelector(".node-actions");
        if (portIn && portIn.parentElement !== circle) circle.insertBefore(portIn, circle.firstChild);
        if (actions && actions.parentElement !== circle) {
          const afterPort = circle.querySelector(".port.in");
          if (afterPort && afterPort.nextSibling) circle.insertBefore(actions, afterPort.nextSibling);
          else circle.appendChild(actions);
        }
        if (!circle.querySelector(".ia-icon-wrap")) {
          const iconWrap = document.createElement(TAG_DIV);
          iconWrap.className = "ia-icon-wrap";
          iconWrap.innerHTML = IA_ICON_SVG;
          const title = circle.querySelector(".ia-title");
          circle.insertBefore(iconWrap, title || null);
        }
        const title = nodo.querySelector(".ia-title");
        if (title && title.parentElement !== circle) circle.appendChild(title);
      }
      return;
    }

    const portIn = nodo.querySelector(".port.in");
    const actions = nodo.querySelector(".node-actions");
    let titleEl = nodo.querySelector(".ia-title");
    let bodyEl = nodo.querySelector(".ia-body");

    shell = document.createElement(TAG_DIV);
    shell.className = "ia-node-shell";

    const coreCol = document.createElement(TAG_DIV);
    coreCol.className = "ia-core-column";

    const circle = document.createElement(TAG_DIV);
    circle.className = "ia-circle";
    ensureBadgeEnCirculoIA(circle);
    if (portIn) circle.appendChild(portIn);
    if (actions) circle.appendChild(actions);

    if (!circle.querySelector(".ia-icon-wrap")) {
      const iconWrap = document.createElement(TAG_DIV);
      iconWrap.className = "ia-icon-wrap";
      iconWrap.innerHTML = IA_ICON_SVG;
      circle.appendChild(iconWrap);
    }

    if (!titleEl) {
      titleEl = document.createElement("h3");
    }
    titleEl.className = "ia-title";
    if (titleEl.parentElement !== circle) circle.appendChild(titleEl);

    if (!bodyEl) {
      bodyEl = document.createElement(TAG_DIV);
    }
    bodyEl.className = "ia-body";
    coreCol.appendChild(circle);
    coreCol.appendChild(bodyEl);

    shell.appendChild(coreCol);

    const data = nodo.querySelector(".ia-data");
    if (data) nodo.insertBefore(shell, data);
    else nodo.appendChild(shell);
  }

  function renderVisualNodoIA(nodo, config) {
    const activos = caminosParaVisual(config);
    console.log("🎨 Renderizando salidas IA:", activos);

    ensureEstructuraCircularIA(nodo);
    ensureBadgeEnCirculoIA(nodo.querySelector(".ia-circle"));

    nodo.querySelector(".ia-routes-branch")?.remove();
    nodo.querySelector(".ia-ports-out")?.remove();
    nodo.querySelectorAll(".port.out").forEach(function (p) {
      p.remove();
    });

    const body = nodo.querySelector(".ia-body");
    const titleEl = nodo.querySelector(".ia-title");
    if (!body || !titleEl) return;

    const titulo = config.nombreNodo || "Agente Rápido";
    titleEl.textContent = titulo;

    nodo.classList.remove("ia-node--with-routes");

    if (!activos.length) {
      body.innerHTML =
        '<p class="ia-subtitle ia-subtitle--muted">Detección local + rutas</p>' +
        '<p class="ia-desc-pill ia-desc-pill--empty">Doble click para configurar</p>';
      return;
    }

    nodo.classList.add("ia-node--with-routes");
    body.innerHTML =
      '<p class="ia-subtitle">Detección local + rutas</p>' +
      '<p class="ia-desc-pill">Enruta por intención sin IA generativa</p>';

    const shell = nodo.querySelector(".ia-node-shell");
    const branch = document.createElement(TAG_DIV);
    branch.className = "ia-routes-branch";

    const stem = document.createElement(TAG_DIV);
    stem.className = "ia-routes-stem";
    stem.setAttribute("aria-hidden", "true");
    branch.appendChild(stem);

    const list = document.createElement("ul");
    list.className = "ia-routes-list";

    activos.forEach(function (route) {
      const label = labelCaminoVisual(route);
      const sinNombre = !textoCamino(route);
      const tipo = normalizarTipoCamino(route.type);
      console.log("🔌 Handle ruta:", route.id, label);
      console.log("🔌 Source handle:", route.id);

      const li = document.createElement("li");
      li.className =
        "ia-route-pill ia-route-pill--" +
        tipo +
        (sinNombre ? " ia-route-pill--sin-nombre" : "");
      li.dataset.routeId = route.id;

      const iconWrap = document.createElement("span");
      iconWrap.className = "ia-route-icon ia-route-icon--" + tipo;
      iconWrap.innerHTML = ROUTE_ICON_SVG[tipo] || ROUTE_ICON_SVG.default;
      li.appendChild(iconWrap);

      const name = document.createElement("span");
      name.className = "ia-route-name";
      name.textContent = label;
      li.appendChild(name);

      const port = document.createElement(TAG_DIV);
      port.className = "port out ia-port-route";
      port.dataset.nodo = nodo.id;
      port.dataset.handle = route.id;
      port.dataset.routeType = tipo;
      port.title = label;
      li.appendChild(port);

      list.appendChild(li);
    });

    branch.appendChild(list);
    if (shell) shell.appendChild(branch);
    else nodo.appendChild(branch);

    if (typeof actualizarHandlersPuertosCanvas === "function") {
      actualizarHandlersPuertosCanvas();
    }
    if (typeof actualizarLineas === "function") actualizarLineas();
  }

  function actualizarHTMLNodoIA(nodo, cleanData) {
    if (!nodo) return;

    const cfg = sanitizeIAData(cleanData);
    const json = JSON.stringify(cfg);
    console.log("🧪 JSON OK:", json.length);

    const box = nodo.querySelector(".ia-data");
    if (box) {
      box.value = json;
      box.textContent = json;
    } else {
      const ta = document.createElement("textarea");
      ta.className = "ia-data";
      ta.style.display = "none";
      ta.value = json;
      nodo.appendChild(ta);
    }

    renderVisualNodoIA(nodo, cfg);
    configActiva = cfg;
    console.log("✅ NODO IA HTML ACTUALIZADO");
    console.log("✅ NODO IA GUARDADO SIN RECURSIÓN");
  }

  function guardarConfigEnNodo(nodo, config) {
    actualizarHTMLNodoIA(nodo, config);
  }

  function updateRoute(routeId, patch) {
    if (!routeId) return;
    asegurarArraysCaminos(configActiva);
    const lista = obtenerRoutes(configActiva);
    configActiva.caminos = lista.map(function (r) {
      if (r.id !== routeId) return r;
      const merged = { ...r, ...patch };
      const nombre = String(
        merged.name || merged.text || merged.nombre || ""
      ).trim();
      merged.text = nombre;
      merged.name = nombre;
      merged.nombre = nombre;
      return merged;
    });
    configActiva.routes = configActiva.caminos;
    console.log("✏️ updateRoute:", routeId, patch);
  }

  function syncCaminosDesdeDom() {
    const rows = document.querySelectorAll(".ia-ruta-row");
    const existentes = obtenerRoutes(configActiva);
    const caminos = [];
    rows.forEach(function (row) {
      const id = row.dataset.routeId;
      if (!id) return;
      const existing =
        existentes.find(function (r) {
          return r.id === id;
        }) || {};
      const text = row.querySelector(".ia-ruta-texto")?.value.trim() || "";
      console.log("✏️ CAMBIO NOMBRE RUTA:", id, text);
      const synsRaw = row.querySelector(".ia-ruta-sinonimos")?.value || "";
      const syns = synsRaw
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      const mediaRaw = row.querySelector(".ia-ruta-media")?.value.trim() || "";
      caminos.push(
        normalizarRutaExtensible({
          ...existing,
          id: id,
          text: text,
          name: text,
          nombre: text,
          synonyms: syns,
          priority: parseInt(row.querySelector(".ia-ruta-prioridad")?.value, 10) || 50,
          mediaId: mediaRaw || null,
          enabled: row.querySelector(".ia-ruta-enabled")?.checked !== false,
        })
      );
    });
    configActiva.caminos = caminos;
    configActiva.routes = caminos;
    return caminos;
  }

  /** Lee el panel sin borrar caminos vacíos (solo borrador). */
  function syncCamposPanelDraft() {
    if (!configActiva || typeof configActiva !== "object") {
      configActiva = crearConfigPorDefecto();
    }
    configActiva.nombreNodo =
      document.getElementById("iaNombreNodo")?.value.trim() || "Agente Rápido";
    configActiva.scoreMinimo =
      parseInt(document.getElementById("iaScoreMinimo")?.value, 10) || 40;
    const esperarRespuestaEl = document.getElementById("iaEsperarRespuesta");
    const correccionEl = document.getElementById("iaCorreccionOrtografica");
    const ttlEl = document.getElementById("iaTtlHoras");
    const opcionesSesion = normalizarOpcionesSesion({
      ...configActiva,
      esperarRespuesta: esperarRespuestaEl ? esperarRespuestaEl.checked : configActiva.esperarRespuesta,
      correccionOrtografica: correccionEl
        ? correccionEl.checked
        : configActiva.correccionOrtografica,
      ttlHoras: ttlEl ? ttlEl.value : configActiva.ttlHoras,
      session: configActiva.session,
    });
    Object.assign(configActiva, opcionesSesion);
    syncCaminosDesdeDom();
    configActiva.comportamiento = {
      responderSiNoCoincide: !!document.getElementById("iaResponderFallback")?.checked,
      mensajeFallback:
        document.getElementById("iaMensajeFallback")?.value.trim() ||
        crearConfigPorDefecto().comportamiento.mensajeFallback,
      activarOtrosFlujos: !!document.getElementById("iaActivarFlujos")?.checked,
      responderConAudio: !!document.getElementById("iaResponderAudio")?.checked,
    };
    asegurarArraysCaminos(configActiva);
    return configActiva;
  }

  function agregarCaminoIA() {
    console.log("➕ Agregar camino IA click");
    syncCamposPanelDraft();

    const nuevo = {
      id: generarRouteId(),
      text: "",
      name: "",
      nombre: "",
      type: "texto",
      synonyms: [],
      priority: 50,
      mediaId: null,
      enabled: true,
    };

    asegurarArraysCaminos(configActiva);
    configActiva.caminos.push(nuevo);
    configActiva.routes = configActiva.caminos;
    console.log("🧠 localIA routes:", configActiva.routes);

    renderCaminosEditor();

    if (nodoActivo) {
      renderVisualNodoIA(nodoActivo, configActiva);
    }
  }

  function renderCaminosEditor() {
    const wrap = document.getElementById("iaCaminosLista");
    if (!wrap) return;

    const routes = obtenerRoutes(configActiva);
    console.log("🎨 Render IA routes:", routes);

    if (!routes.length) {
      wrap.innerHTML =
        '<div class="ia-caminos-vacio-wrap">' +
        '<p class="ia-caminos-vacio">No hay caminos todavía</p>' +
        '<span class="ia-caminos-vacio-hint">Agrega un camino para enrutar por intención</span>' +
        "</div>";
      return;
    }

    wrap.innerHTML = routes
      .map(function (route, index) {
        const syns = Array.isArray(route.synonyms)
          ? route.synonyms.join(", ")
          : String(route.synonyms || "");
        const label = textoCamino(route) || "Sin nombre";
        const tipo = normalizarTipoCamino(route.type);
        return (
          '<div class="ia-ruta-row ia-route-card" data-route-id="' +
          esc(route.id) +
          '">' +
          '<div class="ia-ruta-head ia-route-card__head">' +
          '<div class="ia-route-card__title">' +
          '<span class="ia-ruta-num ia-route-badge">Ruta ' +
          (index + 1) +
          "</span>" +
          '<span class="ia-route-name-preview">' +
          esc(label) +
          "</span></div>" +
          '<div class="ia-route-card__toolbar">' +
          '<label class="ia-ruta-enabled-wrap ia-toggle"><input type="checkbox" class="ia-ruta-enabled"' +
          (route.enabled !== false ? " checked" : "") +
          '><span class="ia-toggle__track" aria-hidden="true"></span><span class="ia-toggle__label">Activo</span></label>' +
          '<button type="button" class="ia-ruta-del ia-btn ia-btn--danger ia-btn--sm" data-action="del">Eliminar</button>' +
          "</div></div>" +
          '<div class="ia-route-card__body">' +
          '<div class="panel-campo ia-field"><label>Texto del camino</label>' +
          '<input class="ia-ruta-texto ia-input" placeholder="Ej: qr, depósito, precio" value="' +
          esc(textoCamino(route)) +
          '"></div>' +
          '<div class="panel-campo ia-field"><label>Sinónimos (coma)</label>' +
          '<textarea class="ia-ruta-sinonimos ia-textarea ia-input" rows="2" placeholder="palabra1, palabra2">' +
          esc(syns) +
          "</textarea></div>" +
          '<div class="ia-ruta-meta ia-field-row">' +
          '<div class="panel-campo ia-field ia-field--sm"><label>Prioridad</label>' +
          '<input type="number" class="ia-ruta-prioridad ia-input" min="0" max="100" value="' +
          (route.priority || 50) +
          '"></div>' +
          '<div class="panel-campo ia-field ia-field--grow"><label>Media ID / URL (legacy)</label>' +
          '<input class="ia-ruta-media ia-input" placeholder="Opcional" value="' +
          esc(route.mediaId || "") +
          '"></div></div>' +
          '<p class="ia-handle-hint oai-handle-hint">Handle conexión: <code>' +
          esc(route.id) +
          "</code></p>" +
          (tipo === "payment_reader"
            ? '<p class="ia-card__hint ia-route-future-hint">Ruta payment_reader guardada — lectura de pago se activará en una fase posterior.</p>'
            : "") +
          "</div></div>"
        );
      })
      .join("");

    wrap.querySelectorAll('[data-action="del"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        const row = btn.closest(".ia-ruta-row");
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

    wrap.querySelectorAll(".ia-ruta-texto").forEach(function (input) {
      input.addEventListener("input", function () {
        const row = input.closest(".ia-ruta-row");
        const rid = row?.dataset.routeId;
        const value = input.value;
        console.log("✏️ CAMBIO NOMBRE RUTA:", rid, value);
        if (rid) updateRoute(rid, { name: value, text: value, nombre: value });
      });
    });
  }

  async function ejecutarPruebaInterna() {
    syncCamposPanelDraft();
    const mensaje = document.getElementById("iaMensajePrueba")?.value.trim() || "";
    const out = document.getElementById("iaResultadoPrueba");
    if (!out) return;

    if (!mensaje) {
      out.innerHTML =
        '<span class="ia-prueba-error">Escribe un mensaje de prueba.</span>';
      return;
    }

    out.innerHTML = '<span class="ia-prueba-loading">Analizando…</span>';

    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: configActiva,
          ultimo_mensaje: mensaje,
          ultimaSalidaBot:
            document.getElementById("iaContextoPrueba")?.value.trim() || "",
          memoriaIA: {
            ultimaPregunta:
              document.getElementById("iaContextoPrueba")?.value.trim() || "",
          },
          nombre: "Cliente prueba",
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        out.innerHTML =
          '<span class="ia-prueba-error">' +
          esc(data.error || "Error en prueba") +
          "</span>";
        return;
      }

      out.innerHTML =
        '<div class="ia-prueba-ok">' +
        "<strong>Resultado:</strong> <code>" +
        esc(data.resultado) +
        "</code><br>" +
        (data.context?.intent
          ? "<strong>{{intent}}:</strong> " + esc(data.context.intent) + "<br>"
          : "") +
        (data.context?.score != null
          ? "<strong>{{score}}:</strong> " + esc(data.context.score) + "<br>"
          : "") +
        (data.context?.route
          ? "<strong>{{route}}:</strong> <code>" +
            esc(data.context.route) +
            "</code>"
          : "") +
        "</div>";
    } catch (e) {
      out.innerHTML =
        '<span class="ia-prueba-error">Error de red: ' + esc(e.message) + "</span>";
    }
  }

  function scheduleRenderVisualNodo() {
    if (!nodoActivo) return;
    if (renderVisualTimer) clearTimeout(renderVisualTimer);
    renderVisualTimer = setTimeout(function () {
      renderVisualTimer = null;
      try {
        renderVisualNodoIA(nodoActivo, configActiva);
      } catch (err) {
        console.warn("IA: error render visual", err.message);
      }
    }, 180);
  }

  function renderPanel(nodo) {
    if (!nodo) return;
    console.log("🧠 IA PANEL OPEN");
    unlockCanvasBuilder();
    nodoActivo = nodo;
    configActiva = leerConfigDeNodo(nodo);
    asegurarArraysCaminos(configActiva);
    const opcionesSesion = normalizarOpcionesSesion(configActiva);

    const contenido = document.getElementById("panelNodoContenido");
    if (!contenido) return;

    const panelShell = document.getElementById("panelNodo");
    if (panelShell) {
      panelShell.classList.add("panel-nodo--ia");
      panelShell.classList.remove("panel-nodo--openai-agent");
    }

    contenido.innerHTML =
      '<div class="ia-panel ia-panel-premium ia-panel-root">' +
      '<header class="ia-panel-hero oai-panel-hero">' +
      '<div class="ia-panel-hero__top oai-panel-hero__top">' +
      '<div class="ia-panel-hero__titles oai-panel-hero__titles">' +
      '<h4 class="ia-panel-hero__title oai-panel-hero__title">Agente Rápido</h4>' +
      '<span class="ia-panel-hero__badge oai-panel-hero__badge">Local</span>' +
      "</div></div>" +
      '<p class="ia-panel-desc ia-panel-hero__desc oai-panel-hero__desc">Detección local por palabras clave — sin IA generativa. Pausa el flujo y espera al lead.</p>' +
      "</header>" +
      '<div class="ia-panel-scroll oai-panel-scroll">' +
      '<section class="ia-card oai-card ia-card--general">' +
      '<h5 class="ia-card__title oai-card__title">Configuración básica</h5>' +
      '<div class="panel-campo ia-field oai-field"><label>Nombre del nodo</label>' +
      '<input id="iaNombreNodo" class="ia-input oai-input" value="' +
      esc(configActiva.nombreNodo) +
      '"></div></section>' +
      '<section class="ia-card oai-card ia-card--score">' +
      '<h5 class="ia-card__title oai-card__title">Opciones de score</h5>' +
      '<p class="ia-card__hint oai-card__hint">Umbral mínimo (0–100) para considerar una coincidencia de camino.</p>' +
      '<div class="panel-campo ia-field oai-field"><label>Score mínimo</label>' +
      '<input id="iaScoreMinimo" class="ia-input oai-input" type="number" min="0" max="100" value="' +
      configActiva.scoreMinimo +
      '"></div></section>' +
      '<section class="ia-card oai-card ia-card--session">' +
      '<h5 class="ia-card__title oai-card__title">Esperar respuesta</h5>' +
      '<p class="ia-card__hint oai-card__hint">Controla si el nodo pausa el flujo al entrar. La activación en runtime se habilitará en una fase posterior.</p>' +
      '<label class="ia-toggle ia-toggle-premium oai-toggle"><input type="checkbox" id="iaEsperarRespuesta"' +
      (opcionesSesion.esperarRespuesta ? " checked" : "") +
      '><span class="ia-toggle__track oai-toggle__track" aria-hidden="true"></span><span class="ia-toggle__label oai-toggle__label">Esperar respuesta del lead</span></label>' +
      '<div class="panel-campo ia-field oai-field ia-field--sm"><label>TTL sesión (horas)</label>' +
      '<input id="iaTtlHoras" class="ia-input oai-input" type="number" min="0" step="1" placeholder="Sin límite" value="' +
      esc(opcionesSesion.ttlHoras == null ? "" : opcionesSesion.ttlHoras) +
      '"></div></section>' +
      '<section class="ia-card oai-card ia-card--spelling">' +
      '<h5 class="ia-card__title oai-card__title">Corrección ortográfica</h5>' +
      '<p class="ia-card__hint oai-card__hint">Corrige typos comunes al analizar mensajes (ej. kiero → quiero). Activación en runtime: fase posterior.</p>' +
      '<label class="ia-toggle ia-toggle-premium oai-toggle"><input type="checkbox" id="iaCorreccionOrtografica"' +
      (opcionesSesion.correccionOrtografica ? " checked" : "") +
      '><span class="ia-toggle__track oai-toggle__track" aria-hidden="true"></span><span class="ia-toggle__label oai-toggle__label">Activar corrección ortográfica</span></label></section>' +
      '<section class="ia-card oai-card ia-card--routes">' +
      '<h5 class="ia-card__title oai-card__title">Caminos</h5>' +
      '<p class="ia-card__hint oai-card__hint">Cada salida usa su <code>route.id</code> como source handle en el canvas.</p>' +
      '<div id="iaCaminosLista" class="ia-caminos-lista oai-routes-list"></div>' +
      '<button type="button" class="panel-btn ia-btn-add-ruta oai-btn oai-btn--add" id="iaAgregarCamino">+ Agregar camino</button></section>' +
      '<section class="ia-card oai-card ia-card--behavior">' +
      '<h5 class="ia-card__title oai-card__title">Comportamiento</h5>' +
      '<p class="ia-card__hint oai-card__hint">Opciones legacy del router — se conservan al guardar.</p>' +
      '<label class="ia-toggle ia-toggle-premium oai-toggle"><input type="checkbox" id="iaResponderFallback"' +
      (configActiva.comportamiento.responderSiNoCoincide ? " checked" : "") +
      '><span class="ia-toggle__track oai-toggle__track" aria-hidden="true"></span><span class="ia-toggle__label oai-toggle__label">Responder si no coincide</span></label>' +
      '<div class="panel-campo ia-field oai-field"><label>Mensaje fallback</label>' +
      '<textarea id="iaMensajeFallback" class="ia-textarea ia-input oai-input oai-textarea" rows="3">' +
      esc(configActiva.comportamiento.mensajeFallback) +
      "</textarea></div>" +
      '<label class="ia-toggle ia-toggle-premium oai-toggle"><input type="checkbox" id="iaActivarFlujos"' +
      (configActiva.comportamiento.activarOtrosFlujos ? " checked" : "") +
      '><span class="ia-toggle__track oai-toggle__track" aria-hidden="true"></span><span class="ia-toggle__label oai-toggle__label">Activar otros flujos (antes del fallback)</span></label>' +
      '<label class="ia-toggle ia-toggle-premium oai-toggle"><input type="checkbox" id="iaResponderAudio"' +
      (configActiva.comportamiento.responderConAudio ? " checked" : "") +
      '><span class="ia-toggle__track oai-toggle__track" aria-hidden="true"></span><span class="ia-toggle__label oai-toggle__label">Responder con audio (usa transcripción si existe)</span></label></section>' +
      '<section class="ia-card oai-card ia-card--test ia-prueba-block">' +
      '<h5 class="ia-card__title oai-card__title">Prueba interna</h5>' +
      '<div class="panel-campo ia-field oai-field"><label>Contexto</label>' +
      '<input id="iaContextoPrueba" class="ia-input oai-input" placeholder="Última pregunta del bot" /></div>' +
      '<div class="panel-campo ia-field oai-field"><label>Mensaje de prueba</label>' +
      '<input id="iaMensajePrueba" class="ia-input oai-input" placeholder="Ej: quiero pagar por qr" /></div>' +
      '<button type="button" class="panel-btn ia-btn-prueba oai-btn" id="iaBtnPrueba">Probar detección</button>' +
      '<div id="iaResultadoPrueba" class="ia-resultado-prueba"></div></section>' +
      '<p class="ia-vars-hint">Variables: {{intent}} {{score}} {{route}} {{ultimo_mensaje}}</p>' +
      '<section class="ia-card oai-card ia-card--actions">' +
      '<button type="button" class="panel-btn ia-btn-save oai-btn oai-btn--save" id="iaGuardarPanel">Guardar Agente Rápido</button>' +
      "</section></div></div>";

    renderCaminosEditor();

    const btnAgregar = document.getElementById("iaAgregarCamino");
    if (btnAgregar) {
      btnAgregar.type = "button";
      btnAgregar.onclick = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        agregarCaminoIA();
      };
    }

    const btnGuardar = document.getElementById("iaGuardarPanel");
    if (btnGuardar) {
      btnGuardar.type = "button";
      btnGuardar.onclick = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        guardarDesdePanel(ev);
      };
    }
    document.getElementById("iaBtnPrueba")?.addEventListener("click", ejecutarPruebaInterna);

    [
      "iaNombreNodo",
      "iaScoreMinimo",
      "iaEsperarRespuesta",
      "iaTtlHoras",
      "iaCorreccionOrtografica",
      "iaMensajeFallback",
      "iaResponderFallback",
      "iaActivarFlujos",
      "iaResponderAudio",
    ].forEach(function (id) {
      document.getElementById(id)?.addEventListener("input", onFormChange);
      document.getElementById(id)?.addEventListener("change", onFormChange);
    });
  }

  function onFormChange() {
    try {
      syncCamposPanelDraft();
      scheduleRenderVisualNodo();
      if (typeof window.macbotRecordHistoryDebounced === "function") {
        window.macbotRecordHistoryDebounced();
      }
    } catch (err) {
      console.warn("IA: onFormChange", err.message);
      unlockCanvasBuilder();
    }
  }

  function guardarDesdePanel(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (ev && ev.stopPropagation) ev.stopPropagation();

    console.log("💾 CLICK GUARDAR NODO IA");
    if (!nodoActivo) {
      console.warn("💾 Guardar IA: sin nodo activo");
      return;
    }

    try {
      if (renderVisualTimer) {
        clearTimeout(renderVisualTimer);
        renderVisualTimer = null;
      }

      syncCamposPanelDraft();
      const cleanData = sanitizeIAData(configActiva);
      console.log("🧹 IA DATA SANITIZADA:", cleanData);

      actualizarHTMLNodoIA(nodoActivo, cleanData);

      if (typeof actualizarHandlersPuertosCanvas === "function") {
        actualizarHandlersPuertosCanvas();
      }
      if (typeof actualizarLineas === "function") actualizarLineas();

      unlockCanvasBuilder();
      console.log("🔓 CANVAS DESBLOQUEADO");

      if (typeof cerrarPanelNodo === "function") {
        cerrarPanelNodo();
      }

      if (typeof registrarHistorialBuilder === "function") {
        registrarHistorialBuilder();
      }
    } catch (err) {
      console.error("❌ ERROR GUARDAR IA:", err);
      unlockCanvasBuilder();
      alert("No se pudo guardar el nodo IA: " + err.message);
    }
  }

  function flushPanelToNode() {
    if (!nodoActivo) return;
    try {
      syncCamposPanelDraft();
      actualizarHTMLNodoIA(nodoActivo, sanitizeIAData(configActiva));
    } catch (err) {
      console.warn("IA: flushPanelToNode", err.message);
    }
  }

  function clearPanelActivo() {
    if (renderVisualTimer) {
      clearTimeout(renderVisualTimer);
      renderVisualTimer = null;
    }
    nodoActivo = null;
    configActiva = crearConfigPorDefecto();
    document.getElementById("panelNodo")?.classList.remove("panel-nodo--ia");
    unlockCanvasBuilder();
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

    const id =
      "nodo_" + (typeof nodoCount !== "undefined" ? nodoCount : window.nodoCount);
    const nodo = document.createElement(TAG_DIV);
    nodo.className = "node ia-node node-ia";
    nodo.id = id;
    nodo.dataset.tipo = "ia";

    nodo.style.left =
      (280 + (typeof nodoCount !== "undefined" ? nodoCount : 1) * 40) + "px";
    nodo.style.top =
      (260 + (typeof nodoCount !== "undefined" ? nodoCount : 1) * 30) + "px";

    const cfg = crearConfigPorDefecto();
    const json = JSON.stringify(cfg);

    nodo.innerHTML =
      '<div class="ia-node-shell">' +
      '<div class="ia-core-column">' +
      '<div class="ia-circle">' +
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
      '\')">×</button>' +
      "</div>" +
      '<div class="ia-icon-wrap">' +
      IA_ICON_SVG +
      "</div>" +
      '<h3 class="ia-title">Agente Rápido</h3>' +
      "</div>" +
      '<div class="ia-body"><p class="ia-desc-pill ia-desc-pill--empty">Doble click para configurar</p></div>' +
      "</div>" +
      "</div>" +
      '<textarea class="ia-data" style="display:none;">' +
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
    guardarConfigEnNodo(nodo, crearConfigPorDefecto());
  }

  function refrescarNodoCargado(nodo) {
    try {
      nodo.querySelectorAll(".port.out:not(.ia-port-route)").forEach(function (p) {
        p.remove();
      });
      if (!nodo.dataset.iaDblBound) {
        nodo.dataset.iaDblBound = "1";
        nodo.addEventListener("dblclick", function (ev) {
          ev.stopPropagation();
          if (typeof editarNodo === "function") editarNodo(nodo.id);
        });
      }
      guardarConfigEnNodo(nodo, leerConfigDeNodo(nodo));
    } catch (e) {
      console.warn("IA: error refrescando nodo", e.message);
    }
  }

  return {
    crearConfigPorDefecto: crearConfigPorDefecto,
    leerConfigDeNodo: leerConfigDeNodo,
    guardarConfigEnNodo: guardarConfigEnNodo,
    renderVisualNodoIA: renderVisualNodoIA,
    agregarCaminoIA: agregarCaminoIA,
    guardarDesdePanel: guardarDesdePanel,
    renderPanel: renderPanel,
    esNodoIA: esNodoIA,
    crearNodoEnCanvas: crearNodoEnCanvas,
    initNodoRecienCreado: initNodoRecienCreado,
    refrescarNodoCargado: refrescarNodoCargado,
    flushPanelToNode: flushPanelToNode,
    clearPanelActivo: clearPanelActivo,
    getNodoActivo: getNodoActivo,
  };
})();

function agregarNodoIA() {
  if (window.MacBotIA && window.MacBotIA.crearNodoEnCanvas) {
    window.MacBotIA.crearNodoEnCanvas();
    return;
  }
  agregarNodo("ia");
}
