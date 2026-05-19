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
      nombreNodo: "🤖 IA",
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

    if (!Array.isArray(cfg.caminos) || !cfg.caminos.length) {
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
    return normalizarConfig(cfg);
  }

  function normalizarCaminos(caminos) {
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
        return {
          id: String(r.id || generarRouteId()).trim(),
          nombre: String(r.nombre || "").trim(),
          synonyms: syns,
          priority: parseInt(r.priority, 10) || 50,
          mediaId: String(r.mediaId || "").trim(),
          enabled: r.enabled !== false,
        };
      })
      .filter(function (r) {
        return r.id && r.nombre;
      });
  }

  function normalizarConfig(data) {
    const base = migrarConfigLegacy(data || {});
    base.caminos = normalizarCaminos(base.caminos);
    base.scoreMinimo = Math.min(100, Math.max(0, parseInt(base.scoreMinimo, 10) || 40));
    return base;
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

  function renderPuertosRuta(nodo, caminos) {
    const existente = nodo.querySelector(".ia-ports-out");
    if (existente) existente.remove();

    const activos = (caminos || []).filter(function (r) {
      return r.enabled !== false;
    });
    if (!activos.length) return;

    const wrap = document.createElement(TAG_DIV);
    wrap.className = "ia-ports-out";

    activos.forEach(function (route, index) {
      const port = document.createElement(TAG_DIV);
      port.className = "port out ia-port-route";
      port.dataset.nodo = nodo.id;
      port.dataset.handle = route.id;
      port.title = route.nombre;
      port.style.top = 36 + index * 22 + "px";

      const label = document.createElement("span");
      label.className = "ia-port-label";
      label.textContent = route.nombre;
      port.appendChild(label);

      wrap.appendChild(port);
    });

    nodo.appendChild(wrap);

    if (typeof actualizarHandlersPuertosCanvas === "function") {
      actualizarHandlersPuertosCanvas();
    }
  }

  function guardarConfigEnNodo(nodo, config) {
    const cfg = normalizarConfig(config);
    const box = nodo.querySelector(".ia-data");
    const json = JSON.stringify(cfg);
    if (box) {
      box.value = json;
      box.textContent = json;
    }
    renderPreviewNodo(nodo, cfg);
    renderPuertosRuta(nodo, cfg.caminos);
    const h3 = nodo.querySelector(".ia-title");
    if (h3) h3.textContent = cfg.nombreNodo || "🤖 IA";
    if (typeof actualizarLineas === "function") actualizarLineas();
  }

  function renderPreviewNodo(nodo, config) {
    const body = nodo.querySelector(".ia-body");
    if (!body) return;

    const rutas = (config.caminos || []).filter(function (r) {
      return r.enabled !== false;
    });
    const nombres = rutas
      .slice(0, 3)
      .map(function (r) {
        return r.nombre;
      })
      .join(", ");

    body.innerHTML =
      '<span class="ia-badge-modo">Router local</span>' +
      '<div class="ia-status"><span class="ia-status-dot"></span> Espera lead · silencioso</div>' +
      '<p class="ia-preview">' +
      esc(
        rutas.length
          ? rutas.length + " camino(s): " + (nombres || "—")
          : "Sin caminos — agrega rutas en el panel"
      ) +
      "</p>" +
      (config.comportamiento?.responderSiNoCoincide
        ? '<span class="ia-badge-fallback">Fallback</span>'
        : "");
  }

  function syncCaminosDesdeDom() {
    const rows = document.querySelectorAll(".ia-ruta-row");
    const caminos = [];
    rows.forEach(function (row) {
      const id = row.dataset.routeId;
      const nombre = row.querySelector(".ia-ruta-nombre")?.value.trim();
      if (!id || !nombre) return;
      const synsRaw = row.querySelector(".ia-ruta-sinonimos")?.value || "";
      const syns = synsRaw
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      caminos.push({
        id: id,
        nombre: nombre,
        synonyms: syns,
        priority: parseInt(row.querySelector(".ia-ruta-prioridad")?.value, 10) || 50,
        mediaId: row.querySelector(".ia-ruta-media")?.value.trim() || "",
        enabled: row.querySelector(".ia-ruta-enabled")?.checked !== false,
      });
    });
    configActiva.caminos = caminos;
  }

  function syncDesdeFormulario() {
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
    configActiva = normalizarConfig(configActiva);
  }

  function renderCaminosEditor() {
    const wrap = document.getElementById("iaCaminosLista");
    if (!wrap) return;

    wrap.innerHTML = (configActiva.caminos || [])
      .map(function (route, index) {
        const syns = (route.synonyms || []).join(", ");
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
          '<div class="panel-campo"><label>Nombre</label>' +
          '<input class="ia-ruta-nombre" value="' +
          esc(route.nombre) +
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
          esc(route.mediaId) +
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
    syncDesdeFormulario();
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

    document.getElementById("iaAgregarCamino")?.addEventListener("click", function () {
      syncCaminosDesdeDom();
      configActiva.caminos.push({
        id: generarRouteId(),
        nombre: "nuevo",
        synonyms: [],
        priority: 50,
        mediaId: "",
        enabled: true,
      });
      renderCaminosEditor();
      onFormChange();
    });

    document.getElementById("iaGuardarPanel")?.addEventListener("click", guardarDesdePanel);
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
    syncDesdeFormulario();
    if (nodoActivo) guardarConfigEnNodo(nodoActivo, configActiva);
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
      '<div class="ia-body"></div>' +
      '<textarea class="ia-data" style="display:none;">' +
      json +
      "</textarea>";

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
    crearConfigPorDefecto: crearConfigPorDefecto,
    leerConfigDeNodo: leerConfigDeNodo,
    guardarConfigEnNodo: guardarConfigEnNodo,
    renderPreviewNodo: renderPreviewNodo,
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
