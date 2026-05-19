/**
 * MacBot — Nodo IA local ultra (router silencioso + caminos dinámicos)
 */
window.MacBotIA = (function () {
  const TAG_DIV = "di" + "v";

  let nodoActivo = null;
  let configActiva = crearConfigPorDefecto();

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
      version: 3,
      nombreNodo: "Agente IA",
      scoreMinimo: 40,
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
    asegurarArraysCaminos(cfg);
    return normalizarConfig(cfg);
  }

  function obtenerRoutes(cfg) {
    const raw = cfg?.routes ?? cfg?.caminos;
    return Array.isArray(raw) ? raw : [];
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

  function labelCaminoVisual(route) {
    const t = textoCamino(route);
    return t || "Camino sin nombre";
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

  function normalizarConfig(data) {
    const base = migrarConfigLegacy(data || {});
    const validos = normalizarCaminos(obtenerRoutes(base), true);
    base.caminos = validos;
    base.routes = validos;
    base.scoreMinimo = Math.min(100, Math.max(0, parseInt(base.scoreMinimo, 10) || 40));
    return base;
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
    '<svg class="ia-icon-svg" viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">' +
    '<path fill="#ffffff" d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4.91.52 6.05 6.05 0 0 0-2.9 6.51 5.97 5.97 0 0 0 .52 4.91 6.05 6.05 0 0 0 2.9 6.51 5.98 5.98 0 0 0 4.91.52 6.05 6.05 0 0 0 6.51-2.9 5.98 5.98 0 0 0 .52-4.91 6.05 6.05 0 0 0-2.9-6.51zM12 6.5l1.45 2.79 3.11-.45-2.25 2.19.53 3.11-2.79-1.45-2.79 1.45-.53-3.11-2.25-2.19 3.11.45L12 6.5z"/>' +
    "</svg>";

  function ensureEstructuraCircularIA(nodo) {
    nodo.querySelector(".ia-node-left")?.remove();
    nodo.querySelector(".ia-header")?.remove();

    let shell = nodo.querySelector(".ia-node-shell");
    if (shell) {
      const circle = shell.querySelector(".ia-circle");
      if (circle) {
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

    nodo.querySelector(".ia-routes-branch")?.remove();
    nodo.querySelector(".ia-ports-out")?.remove();
    nodo.querySelectorAll(".port.out").forEach(function (p) {
      p.remove();
    });

    const body = nodo.querySelector(".ia-body");
    const titleEl = nodo.querySelector(".ia-title");
    if (!body || !titleEl) return;

    const titulo = config.nombreNodo || "Agente IA";
    titleEl.textContent = titulo;

    nodo.classList.remove("ia-node--with-routes");

    if (!activos.length) {
      body.innerHTML =
        '<p class="ia-desc-pill ia-desc-pill--empty">Doble click para configurar</p>';
      return;
    }

    nodo.classList.add("ia-node--with-routes");
    body.innerHTML =
      '<p class="ia-desc-pill">IA responde consultas o avanza por un camino</p>';

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
      console.log("🔌 Handle ruta:", route.id, label);
      console.log("🔌 Source handle:", route.id);

      const li = document.createElement("li");
      li.className =
        "ia-route-pill" + (sinNombre ? " ia-route-pill--sin-nombre" : "");
      li.dataset.routeId = route.id;

      const dot = document.createElement("span");
      dot.className = "ia-route-dot";
      li.appendChild(dot);

      const name = document.createElement("span");
      name.className = "ia-route-name";
      name.textContent = label;
      li.appendChild(name);

      const port = document.createElement(TAG_DIV);
      port.className = "port out ia-port-route";
      port.dataset.nodo = nodo.id;
      port.dataset.handle = route.id;
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

  function guardarConfigEnNodo(nodo, config) {
    const cfg = normalizarConfig(config);
    console.log("💾 Guardando IA:", cfg);
    console.log("🧠 Guardando caminos IA:", cfg.caminos);

    const box = nodo.querySelector(".ia-data");
    const json = JSON.stringify(cfg);
    if (box) {
      box.value = json;
      box.textContent = json;
    }

    renderVisualNodoIA(nodo, cfg);
  }

  function syncCaminosDesdeDom() {
    const rows = document.querySelectorAll(".ia-ruta-row");
    const caminos = [];
    rows.forEach(function (row) {
      const id = row.dataset.routeId;
      if (!id) return;
      const text = row.querySelector(".ia-ruta-texto")?.value.trim() || "";
      const synsRaw = row.querySelector(".ia-ruta-sinonimos")?.value || "";
      const syns = synsRaw
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      const mediaRaw = row.querySelector(".ia-ruta-media")?.value.trim() || "";
      caminos.push({
        id: id,
        text: text,
        nombre: text,
        type: "texto",
        synonyms: syns,
        priority: parseInt(row.querySelector(".ia-ruta-prioridad")?.value, 10) || 50,
        mediaId: mediaRaw || null,
        enabled: row.querySelector(".ia-ruta-enabled")?.checked !== false,
      });
    });
    asegurarArraysCaminos(configActiva);
  }

  /** Lee el panel sin borrar caminos vacíos (solo borrador). */
  function syncCamposPanelDraft() {
    if (!configActiva || typeof configActiva !== "object") {
      configActiva = crearConfigPorDefecto();
    }
    configActiva.nombreNodo =
      document.getElementById("iaNombreNodo")?.value.trim() || "🤖 IA";
    configActiva.scoreMinimo =
      parseInt(document.getElementById("iaScoreMinimo")?.value, 10) || 40;
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
    console.log("🧠 localIA routes:", configActiva.routes);
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
        '<p class="ia-caminos-vacio">No hay caminos todavía. Agrega uno.</p>';
      return;
    }

    wrap.innerHTML = routes
      .map(function (route, index) {
        const syns = Array.isArray(route.synonyms)
          ? route.synonyms.join(", ")
          : String(route.synonyms || "");
        const mediaLabel = route.mediaId ? esc(route.mediaId) : "Sin medio";
        return (
          '<div class="ia-ruta-row" data-route-id="' +
          esc(route.id) +
          '">' +
          '<div class="ia-ruta-head">' +
          '<span class="ia-ruta-num">Ruta ' +
          (index + 1) +
          "</span>" +
          '<label class="ia-ruta-enabled-wrap"><input type="checkbox" class="ia-ruta-enabled"' +
          (route.enabled !== false ? " checked" : "") +
          "> Activo</label>" +
          '<button type="button" class="ia-ruta-del" data-action="del">Eliminar</button>' +
          "</div>" +
          '<div class="panel-campo"><label>Texto del camino</label>' +
          '<input class="ia-ruta-texto" placeholder="Ej: qr" value="' +
          esc(textoCamino(route)) +
          '"></div>' +
          '<div class="panel-campo"><label>Sinónimos (coma)</label>' +
          '<textarea class="ia-ruta-sinonimos ia-textarea" rows="2">' +
          esc(syns) +
          "</textarea></div>" +
          '<div class="ia-ruta-meta">' +
          '<div class="panel-campo"><label>Prioridad</label>' +
          '<input type="number" class="ia-ruta-prioridad" min="0" max="100" value="' +
          (route.priority || 50) +
          '"></div>' +
          '<div class="panel-campo"><label>Media ID / URL</label>' +
          '<input class="ia-ruta-media" placeholder="Sin medio" value="' +
          esc(route.mediaId || "") +
          '"><small class="ia-media-hint">' +
          mediaLabel +
          "</small></div>" +
          "</div>" +
          '<p class="ia-handle-hint">Handle: <code>' +
          esc(route.id) +
          "</code></p>" +
          "</div>"
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

  function renderPanel(nodo) {
    if (!nodo) return;
    nodoActivo = nodo;
    configActiva = leerConfigDeNodo(nodo);
    asegurarArraysCaminos(configActiva);

    const contenido = document.getElementById("panelNodoContenido");
    if (!contenido) return;

    contenido.innerHTML =
      '<div class="ia-panel">' +
      "<h4>🤖 IA local ultra</h4>" +
      '<p class="ia-panel-desc">Router silencioso: no responde ni avanza hasta que el lead escriba.</p>' +
      '<section class="ia-panel-seccion"><h5>1. Config compartida</h5>' +
      '<div class="panel-campo"><label>Nombre del nodo</label>' +
      '<input id="iaNombreNodo" value="' +
      esc(configActiva.nombreNodo) +
      '"></div>' +
      '<div class="panel-campo"><label>Score mínimo (threshold)</label>' +
      '<input id="iaScoreMinimo" type="number" min="0" max="100" value="' +
      configActiva.scoreMinimo +
      '"></div></section>' +
      '<section class="ia-panel-seccion"><h5>2. Biblioteca media</h5>' +
      '<p class="ia-panel-desc">Asigna mediaId por camino (URL o id guardado).</p></section>' +
      '<section class="ia-panel-seccion"><h5>3. Config del nodo</h5>' +
      '<p class="ia-panel-desc">Modo silencioso: pausa el flujo y espera al lead.</p></section>' +
      '<section class="ia-panel-seccion"><h5>4. Caminos de ruteo</h5>' +
      '<div id="iaCaminosLista" class="ia-caminos-lista"></div>' +
      '<button type="button" class="panel-btn ia-btn-add-ruta" id="iaAgregarCamino">+ Agregar camino</button></section>' +
      '<section class="ia-panel-seccion"><h5>5. Comportamiento</h5>' +
      '<label class="ia-toggle"><input type="checkbox" id="iaResponderFallback"' +
      (configActiva.comportamiento.responderSiNoCoincide ? " checked" : "") +
      "> Responder si no coincide</label>" +
      '<div class="panel-campo"><label>Mensaje fallback</label>' +
      '<textarea id="iaMensajeFallback" class="ia-textarea" rows="3">' +
      esc(configActiva.comportamiento.mensajeFallback) +
      "</textarea></div>" +
      '<label class="ia-toggle"><input type="checkbox" id="iaActivarFlujos"' +
      (configActiva.comportamiento.activarOtrosFlujos ? " checked" : "") +
      "> Activar otros flujos (antes del fallback)</label>" +
      '<label class="ia-toggle"><input type="checkbox" id="iaResponderAudio"' +
      (configActiva.comportamiento.responderConAudio ? " checked" : "") +
      "> Responder con audio (usa transcripción si existe)</label></section>" +
      '<div class="ia-prueba-block">' +
      "<label>Prueba interna</label>" +
      '<input id="iaContextoPrueba" placeholder="Contexto: última pregunta del bot" />' +
      '<input id="iaMensajePrueba" placeholder="Ej: quiero pagar por qr" />' +
      '<button type="button" class="panel-btn ia-btn-prueba" id="iaBtnPrueba">Probar detección</button>' +
      '<div id="iaResultadoPrueba" class="ia-resultado-prueba"></div></div>' +
      '<p class="ia-vars-hint">Variables: {{intent}} {{score}} {{route}} {{ultimo_mensaje}}</p>' +
      '<button type="button" class="panel-btn" id="iaGuardarPanel">Guardar nodo IA</button>' +
      "</div>";

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
        guardarDesdePanel();
      };
    }
    document.getElementById("iaBtnPrueba")?.addEventListener("click", ejecutarPruebaInterna);

    [
      "iaNombreNodo",
      "iaScoreMinimo",
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
    syncCamposPanelDraft();
    if (nodoActivo) {
      renderVisualNodoIA(nodoActivo, configActiva);
    }
    if (typeof window.macbotRecordHistoryDebounced === "function") {
      window.macbotRecordHistoryDebounced();
    }
  }

  function guardarDesdePanel() {
    if (!nodoActivo) {
      console.warn("💾 Guardar IA: sin nodo activo");
      return;
    }
    syncCamposPanelDraft();
    guardarConfigEnNodo(nodoActivo, configActiva);
    if (typeof cerrarPanelNodo === "function") {
      cerrarPanelNodo();
    }
  }

  function flushPanelToNode() {
    if (!nodoActivo) return;
    syncCamposPanelDraft();
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

    const id =
      "nodo_" + (typeof nodoCount !== "undefined" ? nodoCount : window.nodoCount);
    const nodo = document.createElement(TAG_DIV);
    nodo.className = "node ia-node";
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
      '<button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo(\'' +
      id +
      '\')">×</button>' +
      "</div>" +
      '<div class="ia-icon-wrap">' +
      IA_ICON_SVG +
      "</div>" +
      '<h3 class="ia-title">Agente IA</h3>' +
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
