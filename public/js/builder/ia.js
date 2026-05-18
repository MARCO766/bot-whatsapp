/**
 * MacBot — Editor de nodo IA (híbrido: local + OpenAI)
 */
window.MacBotIA = (function () {
  const MODOS = [
    { id: "detectar_intencion", label: "Detectar intención" },
    { id: "clasificar_lead", label: "Clasificar lead" },
    { id: "responder_automatico", label: "Responder automático" },
  ];

  const PROVEEDORES = [
    { id: "automatico", label: "Automático (OpenAI si hay key, si no local)" },
    { id: "local", label: "Solo IA local (reglas)" },
    { id: "openai", label: "Solo OpenAI" },
  ];

  const MODELOS = [
    { id: "gpt-4o-mini", label: "gpt-4o-mini" },
    { id: "gpt-4o", label: "gpt-4o" },
    { id: "gpt-4.1-mini", label: "gpt-4.1-mini" },
  ];

  const REGLAS_DEFAULT = {
    saludo: "hola, buenos dias, buenas tardes, hey, que tal",
    precio: "precio, cuanto cuesta, costo, valor, cotizar",
    compra: "comprar, quiero, me interesa, pagar, pedido",
    comprobante: "comprobante, recibo, transferencia, ya pague, voucher",
    soporte: "ayuda, soporte, problema, no funciona, duda",
    no_interesado: "no me interesa, no gracias, no quiero, basta",
    reclamo: "reclamo, queja, devolucion, estafa",
  };

  let nodoActivo = null;
  let configActiva = crearConfigPorDefecto();
  let iaStatusServidor = { openaiDisponible: false };

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function crearConfigPorDefecto() {
    const reglas = {};
    Object.keys(REGLAS_DEFAULT).forEach(function (k) {
      reglas[k] = REGLAS_DEFAULT[k].split(",").map(function (s) {
        return s.trim();
      });
    });
    return {
      nombreNodo: "🤖 IA",
      modo: "detectar_intencion",
      proveedorIA: "automatico",
      reglas: reglas,
      reglasScore: {
        caliente: ["quiero comprar", "urgente", "hoy", "precio"],
        frio: ["solo mirando", "despues", "no me interesa", "luego"],
      },
      respuestasLocales: {
        saludo: "¡Hola! Gracias por escribirnos. ¿En qué te ayudamos?",
        precio: "Gracias por tu interés. Te compartimos precios en breve.",
        compra: "¡Genial! Un asesor te ayudará con tu compra pronto.",
        soporte: "Entendemos tu consulta. Te atendemos en breve.",
        comprobante: "Recibimos tu mensaje. Revisaremos el comprobante.",
        no_interesado: "Entendido. Si cambias de opinión, aquí estamos.",
        desconocido: "",
      },
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
    const m = MODOS.find(function (x) {
      return x.id === modo;
    });
    return m ? m.label : modo;
  }

  function labelProveedor(prov) {
    if (prov === "local") return "Local";
    if (prov === "openai") return "OpenAI";
    return iaStatusServidor.openaiDisponible ? "Auto · OpenAI" : "Auto · Local";
  }

  function reglasToTextarea(reglas) {
    const lines = [];
    Object.keys(REGLAS_DEFAULT).forEach(function (key) {
      const arr = reglas?.[key] || [];
      const txt = Array.isArray(arr) ? arr.join(", ") : String(arr || "");
      lines.push(key + ": " + txt);
    });
    return lines.join("\n");
  }

  function parseReglasFromTextarea(text) {
    const reglas = {};
    String(text || "")
      .split("\n")
      .forEach(function (line) {
        const idx = line.indexOf(":");
        if (idx < 1) return;
        const key = line.slice(0, idx).trim().toLowerCase();
        const vals = line
          .slice(idx + 1)
          .split(",")
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean);
        if (vals.length) reglas[key] = vals;
      });
    return reglas;
  }

  function normalizarConfig(data) {
    const cfg = crearConfigPorDefecto();
    Object.assign(cfg, data || {});

    if (!MODOS.some(function (m) {
      return m.id === cfg.modo;
    })) {
      cfg.modo = "detectar_intencion";
    }

    if (!["automatico", "local", "openai"].includes(cfg.proveedorIA)) {
      cfg.proveedorIA = "automatico";
    }

    cfg.reglas = { ...crearConfigPorDefecto().reglas, ...(cfg.reglas || {}) };
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

  function fetchIAStatus() {
    fetch("/api/ai/status", { credentials: "same-origin" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        iaStatusServidor = data || { openaiDisponible: false };
        const badge = document.getElementById("iaStatusServidor");
        if (badge) {
          badge.textContent = data.openaiDisponible
            ? "OpenAI disponible en servidor"
            : "Sin OPENAI_API_KEY — solo IA local";
          badge.className =
            "ia-status-servidor " + (data.openaiDisponible ? "ok" : "local");
        }
        if (nodoActivo) renderPreviewNodo(nodoActivo, configActiva);
      })
      .catch(function () {
        iaStatusServidor = { openaiDisponible: false };
      });
  }

  function renderPreviewNodo(nodo, config) {
    const body = nodo.querySelector(".ia-body");
    if (!body) return;

    const tieneFallback = !!(config.mensajeFallback || "").trim();
    const provLabel = labelProveedor(config.proveedorIA);

    body.innerHTML =
      '<span class="ia-badge-proveedor">' +
      esc(provLabel) +
      "</span>" +
      '<span class="ia-badge-modo">' +
      esc(labelModo(config.modo)) +
      "</span>" +
      '<div class="ia-status"><span class="ia-status-dot"></span> IA activa</div>' +
      '<p class="ia-preview">' +
      esc("Reglas: " + Object.keys(config.reglas || {}).length + " categorías") +
      "</p>" +
      (tieneFallback ? '<span class="ia-badge-fallback">Fallback</span>' : "");
  }

  function syncDesdeFormulario() {
    configActiva.nombreNodo =
      document.getElementById("iaNombreNodo")?.value.trim() || "🤖 IA";
    configActiva.modo =
      document.getElementById("iaModo")?.value || "detectar_intencion";
    configActiva.proveedorIA =
      document.getElementById("iaProveedor")?.value || "automatico";
    configActiva.reglas = parseReglasFromTextarea(
      document.getElementById("iaReglas")?.value
    );
    configActiva.promptSistema =
      document.getElementById("iaPromptSistema")?.value.trim() || "";
    configActiva.instruccionesNegocio =
      document.getElementById("iaInstrucciones")?.value.trim() || "";
    configActiva.maxCaracteres =
      parseInt(document.getElementById("iaMaxChars")?.value, 10) || 400;
    configActiva.temperatura =
      parseFloat(document.getElementById("iaTemperatura")?.value) || 0.3;
    configActiva.modelo =
      document.getElementById("iaModelo")?.value || "gpt-4o-mini";
    configActiva.variableResultado =
      document.getElementById("iaVariable")?.value.trim() || "";
    configActiva.siFalla =
      document.getElementById("iaSiFalla")?.value || "continuar";
    configActiva.mensajeFallback =
      document.getElementById("iaFallback")?.value.trim() || "";
    configActiva = normalizarConfig(configActiva);
  }

  function toggleOpenAIFields() {
    const prov = document.getElementById("iaProveedor")?.value || "automatico";
    const bloque = document.getElementById("iaOpenAIFields");
    if (bloque) {
      bloque.style.display = prov === "local" ? "none" : "block";
    }
  }

  async function ejecutarPruebaInterna() {
    syncDesdeFormulario();
    const mensaje =
      document.getElementById("iaMensajePrueba")?.value.trim() || "";
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

      const motor = data.motor || "local";
      const resultado = data.resultado || "—";
      const tipo = data.tipo || configActiva.modo;

      out.innerHTML =
        '<div class="ia-prueba-ok">' +
        "<strong>Motor:</strong> " +
        esc(motor) +
        " · <strong>Proveedor config:</strong> " +
        esc(configActiva.proveedorIA) +
        "<br><strong>Resultado:</strong> <code>" +
        esc(resultado) +
        "</code>" +
        (data.context?.intent
          ? "<br><strong>context.intent:</strong> " + esc(data.context.intent)
          : "") +
        (data.context?.score
          ? "<br><strong>context.score:</strong> " + esc(data.context.score)
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
    fetchIAStatus();

    const contenido = document.getElementById("panelNodoContenido");
    if (!contenido) return;

    const modosOpts = MODOS.map(function (m) {
      return (
        '<option value="' +
        m.id +
        '"' +
        (configActiva.modo === m.id ? " selected" : "") +
        ">" +
        esc(m.label) +
        "</option>"
      );
    }).join("");

    const provOpts = PROVEEDORES.map(function (p) {
      return (
        '<option value="' +
        p.id +
        '"' +
        (configActiva.proveedorIA === p.id ? " selected" : "") +
        ">" +
        esc(p.label) +
        "</option>"
      );
    }).join("");

    const modelosOpts = MODELOS.map(function (m) {
      return (
        '<option value="' +
        m.id +
        '"' +
        (configActiva.modelo === m.id ? " selected" : "") +
        ">" +
        esc(m.label) +
        "</option>"
      );
    }).join("");

    const reglasText = reglasToTextarea(configActiva.reglas);

    contenido.innerHTML =
      '<div class="ia-panel">' +
      "<h4>🤖 Nodo IA híbrido</h4>" +
      '<p id="iaStatusServidor" class="ia-status-servidor local">Comprobando servidor…</p>' +
      '<div class="panel-campo"><label>Nombre del nodo</label>' +
      '<input id="iaNombreNodo" value="' +
      esc(configActiva.nombreNodo) +
      '"></div>' +
      '<div class="panel-campo"><label>Motor IA</label>' +
      '<select id="iaProveedor">' +
      provOpts +
      "</select></div>" +
      '<div class="panel-campo"><label>Acción del nodo</label>' +
      '<select id="iaModo">' +
      modosOpts +
      "</select></div>" +
      '<div class="panel-campo ia-reglas-block">' +
      "<label>Reglas locales (palabras clave)</label>" +
      '<p class="ia-panel-desc">Una línea por categoría: <code>precio: cuanto cuesta, valor</code></p>' +
      '<textarea id="iaReglas" class="ia-textarea ia-reglas-ta" rows="8">' +
      esc(reglasText) +
      "</textarea></div>" +
      '<div class="ia-prueba-block">' +
      "<label>Prueba interna</label>" +
      '<input id="iaMensajePrueba" placeholder="Ej: hola, cuánto cuesta el curso?" />' +
      '<button type="button" class="panel-btn ia-btn-prueba" id="iaBtnPrueba">Probar detección</button>' +
      '<div id="iaResultadoPrueba" class="ia-resultado-prueba"></div>' +
      "</div>" +
      '<div id="iaOpenAIFields">' +
      '<div class="panel-campo"><label>Prompt del sistema (OpenAI)</label>' +
      '<textarea id="iaPromptSistema" class="ia-textarea" rows="2">' +
      esc(configActiva.promptSistema) +
      "</textarea></div>" +
      '<div class="panel-campo"><label>Instrucciones del negocio</label>' +
      '<textarea id="iaInstrucciones" class="ia-textarea" rows="2">' +
      esc(configActiva.instruccionesNegocio) +
      "</textarea></div>" +
      '<div class="panel-campo"><label>Modelo OpenAI</label><select id="iaModelo">' +
      modelosOpts +
      "</select></div>" +
      '<div class="panel-campo"><label>Temperatura</label>' +
      '<input id="iaTemperatura" type="number" min="0" max="1" step="0.1" value="' +
      configActiva.temperatura +
      '"></div>' +
      "</div>" +
      '<div class="panel-campo"><label>Respuesta máx. (caracteres)</label>' +
      '<input id="iaMaxChars" type="number" min="50" max="400" value="' +
      configActiva.maxCaracteres +
      '"></div>' +
      '<div class="panel-campo"><label>Variable resultado</label>' +
      '<input id="iaVariable" placeholder="opcional" value="' +
      esc(configActiva.variableResultado) +
      '"></div>' +
      '<div class="panel-campo"><label>Si falla IA</label>' +
      '<select id="iaSiFalla">' +
      '<option value="continuar"' +
      (configActiva.siFalla === "continuar" ? " selected" : "") +
      ">Continuar</option>" +
      '<option value="detener"' +
      (configActiva.siFalla === "detener" ? " selected" : "") +
      ">Detener</option>" +
      "</select></div>" +
      '<div class="panel-campo"><label>Mensaje fallback</label>' +
      '<textarea id="iaFallback" class="ia-textarea" rows="2">' +
      esc(configActiva.mensajeFallback) +
      "</textarea></div>" +
      '<p class="ia-vars-hint">Variables: {{nombre}} {{telefono}} {{ultimo_mensaje}} {{intent}} {{score}}</p>' +
      '<button type="button" class="panel-btn" id="iaGuardarPanel">Guardar nodo IA</button>' +
      "</div>";

    document.getElementById("iaGuardarPanel")?.addEventListener("click", guardarDesdePanel);
    document.getElementById("iaBtnPrueba")?.addEventListener("click", ejecutarPruebaInterna);
    document.getElementById("iaProveedor")?.addEventListener("change", function () {
      toggleOpenAIFields();
      onFormChange();
    });

    [
      "iaNombreNodo",
      "iaModo",
      "iaReglas",
      "iaPromptSistema",
      "iaInstrucciones",
      "iaMaxChars",
      "iaTemperatura",
      "iaModelo",
      "iaVariable",
      "iaSiFalla",
      "iaFallback",
    ].forEach(function (id) {
      document.getElementById(id)?.addEventListener("input", onFormChange);
      document.getElementById(id)?.addEventListener("change", onFormChange);
    });

    toggleOpenAIFields();
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

    const id =
      "nodo_" + (typeof nodoCount !== "undefined" ? nodoCount : window.nodoCount);
    const nodo = document.createElement("div");
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
      '<div class="ia-body"><span class="ia-badge-proveedor">Auto</span></div>' +
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
