/**
 * MacBot — Nodo 🔒 Seguimiento CRM V2 (builder UI)
 */
window.MacBotSeguimientoV2 = (function () {
  const UNIDADES = ["segundos", "minutos", "horas", "dias"];
  const UNIDAD_LABELS = {
    segundos: { one: "seg", many: "seg" },
    minutos: { one: "min", many: "min" },
    horas: { one: "hora", many: "horas" },
    dias: { one: "día", many: "días" },
  };

  let nodoActivo = null;
  let configActiva = null;
  let pasoActivoIndex = 0;

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function decodeHtmlJson(raw) {
    return String(raw || "")
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .trim();
  }

  function normalizarUnidad(unidad) {
    const u = String(unidad || "minutos").toLowerCase();
    if (u === "segundo" || u === "segundos" || u === "sec" || u === "s") return "segundos";
    if (u === "dia" || u === "día" || u === "dias" || u === "días") return "dias";
    if (u === "hora" || u === "horas") return "horas";
    return "minutos";
  }

  function crearPasoVacio(index) {
    return {
      pasoId: "paso_" + (index + 1),
      delay: { valor: 5, unidad: "minutos" },
      tipo: "texto",
      contenido: "",
    };
  }

  function crearConfigDefault() {
    return {
      version: 1,
      cancelarSiResponde: true,
      pasos: [crearPasoVacio(0), { ...crearPasoVacio(1), delay: { valor: 1, unidad: "horas" } }],
    };
  }

  function normalizarPaso(paso, index) {
    if (!paso || typeof paso !== "object") return null;

    const delay = paso.delay || {};
    const valor = parseInt(delay.valor != null ? delay.valor : paso.minutos, 10);
    const unidad = normalizarUnidad(delay.unidad || "minutos");
    const contenido = String(paso.contenido || paso.texto || paso.mensaje || "").trim();
    const tipo = String(paso.tipo || "texto").toLowerCase();

    if (isNaN(valor) || valor <= 0) return null;

    return {
      pasoId: String(paso.pasoId || "paso_" + (index + 1)).trim(),
      delay: { valor, unidad },
      tipo: tipo === "texto" ? "texto" : tipo,
      contenido,
    };
  }

  function parseConfigAlmacenada(raw) {
    const base = crearConfigDefault();
    if (!raw || typeof raw !== "object") return base;

    const pasos = Array.isArray(raw.pasos)
      ? raw.pasos.map(function (p, i) {
          return normalizarPaso(p, i);
        }).filter(Boolean)
      : base.pasos;

    return {
      version: 1,
      cancelarSiResponde: raw.cancelarSiResponde !== false,
      pasos: pasos.length ? pasos : base.pasos,
    };
  }

  function leerConfigDeNodo(nodo) {
    const box = nodo && nodo.querySelector(".seguimiento-v2-data");
    if (!box) return crearConfigDefault();

    try {
      const raw = decodeHtmlJson(box.value || box.textContent || "");
      if (!raw) return crearConfigDefault();
      return parseConfigAlmacenada(JSON.parse(raw));
    } catch (e) {
      console.warn("[SEG_V2_BUILDER] JSON inválido en nodo", nodo.id, e.message);
      return crearConfigDefault();
    }
  }

  function formatearDelayCorto(delay) {
    if (!delay) return "—";
    const v = parseInt(delay.valor, 10);
    const u = normalizarUnidad(delay.unidad);
    const labels = UNIDAD_LABELS[u] || UNIDAD_LABELS.minutos;
    const suf = v === 1 ? labels.one : labels.many;
    return v + " " + suf;
  }

  function resumenConfig(config) {
    const n = (config.pasos || []).length;
    const cancela = config.cancelarSiResponde !== false ? "cancela si responde" : "sin cancelación";
    return n + " paso" + (n === 1 ? "" : "s") + " · " + cancela;
  }

  function buildTimelineHtml(pasos) {
    if (!pasos.length) {
      return '<p class="segv2-empty">Configura pasos en el panel →</p>';
    }

    let html = '<div class="segv2-timeline">';
    pasos.forEach(function (paso, index) {
      html +=
        '<div class="segv2-timeline-item">' +
        '<span class="segv2-timeline-rail" aria-hidden="true"><span class="segv2-timeline-dot"></span></span>' +
        '<span class="segv2-timeline-label">' +
        esc(String(index + 1) + ": " + formatearDelayCorto(paso.delay)) +
        "</span></div>";
    });
    html += "</div>";
    return html;
  }

  function buildNodoInnerHtml(nodoId, config) {
    const cfg = parseConfigAlmacenada(config);
    const json = JSON.stringify(cfg).replace(/</g, "\\u003c");
    const pasoCount = cfg.pasos.length;

    return (
      '<div class="node-actions">' +
      '<button type="button" class="edit-node segv2-action-btn" onclick="event.stopPropagation(); editarNodo(\'' +
      nodoId +
      '\')" aria-label="Editar">✎</button>' +
      '<button type="button" class="delete-node segv2-action-btn" onclick="event.stopPropagation(); borrarNodo(\'' +
      nodoId +
      '\')" aria-label="Eliminar">×</button>' +
      "</div>" +
      '<div class="segv2-shell" data-tipo="seguimiento_crm_v2">' +
      '<div class="segv2-header">' +
      '<span class="segv2-lock" aria-hidden="true">🔒</span>' +
      '<div class="segv2-header-main">' +
      '<span class="segv2-title">🔒 Seguimiento CRM V2</span>' +
      '<span class="segv2-badge">V2 Seguro</span>' +
      "</div></div>" +
      '<p class="segv2-subbadge">Seguro multi-número</p>' +
      '<p class="segv2-summary">' +
      esc(resumenConfig(cfg)) +
      "</p>" +
      '<div class="segv2-body">' +
      (pasoCount
        ? '<p class="segv2-paso-count">' + esc(String(pasoCount) + " pasos") + "</p>" + buildTimelineHtml(cfg.pasos)
        : buildTimelineHtml(cfg.pasos)) +
      "</div>" +
      "</div>" +
      '<textarea class="seguimiento-v2-data" style="display:none;">' +
      json +
      "</textarea>"
    );
  }

  function renderPreviewNodo(nodo, config) {
    if (!nodo) return;

    const cfg = parseConfigAlmacenada(config);
    const summary = nodo.querySelector(".segv2-summary");
    const body = nodo.querySelector(".segv2-body");
    const pasoCountEl = nodo.querySelector(".segv2-paso-count");

    if (summary) summary.textContent = resumenConfig(cfg);

    if (body) {
      const countHtml = cfg.pasos.length
        ? '<p class="segv2-paso-count">' + esc(String(cfg.pasos.length) + " pasos") + "</p>"
        : "";
      body.innerHTML = countHtml + buildTimelineHtml(cfg.pasos);
    } else if (pasoCountEl && cfg.pasos.length) {
      pasoCountEl.textContent = cfg.pasos.length + " pasos";
    }

    const box = nodo.querySelector(".seguimiento-v2-data");
    if (box) {
      const json = JSON.stringify(cfg);
      box.value = json;
      box.textContent = json;
    }

    requestAnimationFrame(function () {
      document.dispatchEvent(new CustomEvent("macbot:nodo-layout"));
    });
  }

  function guardarConfigEnNodo(nodo, config) {
    if (!nodo) return null;
    const cfg = parseConfigAlmacenada(config);
    renderPreviewNodo(nodo, cfg);
    return cfg;
  }

  function renderNodoVisual(nodo, config) {
    if (!nodo) return null;

    const cfg = parseConfigAlmacenada(config || leerConfigDeNodo(nodo));
    nodo.dataset.tipo = "seguimiento_crm_v2";
    nodo.classList.add("seguimiento-v2-node", "follow-node-v2", "node-seguimiento-v2");

    nodo.innerHTML =
      '<div class="port in" data-nodo="' +
      nodo.id +
      '" onmousedown="iniciarConexion(event, \'' +
      nodo.id +
      '\', \'in\')"></div>' +
      buildNodoInnerHtml(nodo.id, cfg) +
      '<div class="port out" data-nodo="' +
      nodo.id +
      '" onmousedown="iniciarConexion(event, \'' +
      nodo.id +
      '\', \'out\')"></div>';

    return guardarConfigEnNodo(nodo, cfg);
  }

  function esNodoSeguimientoV2(nodo) {
    if (!nodo) return false;
    return (
      nodo.dataset.tipo === "seguimiento_crm_v2" ||
      nodo.classList.contains("seguimiento-v2-node") ||
      nodo.classList.contains("follow-node-v2") ||
      nodo.classList.contains("node-seguimiento-v2") ||
      !!nodo.querySelector(".seguimiento-v2-data")
    );
  }

  function crearNodoEnCanvas() {
    const canvas = document.getElementById("canvasFlujo");
    if (!canvas) {
      alert("No existe canvasFlujo");
      return null;
    }

    if (typeof nodoCount !== "number") {
      window.nodoCount = 0;
    }
    nodoCount += 1;

    const nodo = document.createElement("div");
    nodo.className = "node seguimiento-v2-node follow-node-v2 node-seguimiento-v2";
    nodo.id = "nodo_" + nodoCount;
    nodo.dataset.tipo = "seguimiento_crm_v2";

    nodo.style.left = 280 + nodoCount * 40 + "px";
    nodo.style.top = 260 + nodoCount * 30 + "px";

    renderNodoVisual(nodo, crearConfigDefault());
    canvas.appendChild(nodo);

    if (typeof hacerMovible === "function") {
      hacerMovible(nodo);
    }

    return nodo;
  }

  function refrescarNodoCargado(nodo) {
    if (!esNodoSeguimientoV2(nodo)) return;
    const config = leerConfigDeNodo(nodo);
    const tieneMarkup = !!nodo.querySelector(".segv2-shell");
    if (!tieneMarkup) {
      renderNodoVisual(nodo, config);
    } else {
      nodo.dataset.tipo = "seguimiento_crm_v2";
      nodo.classList.add("seguimiento-v2-node", "follow-node-v2", "node-seguimiento-v2");
      guardarConfigEnNodo(nodo, config);
    }
  }

  function syncPasoDesdeFormulario() {
    if (!configActiva || pasoActivoIndex < 0) return;

    const paso = configActiva.pasos[pasoActivoIndex];
    if (!paso) return;

    const valorEl = document.getElementById("segv2DelayValor");
    const unidadEl = document.getElementById("segv2DelayUnidad");
    const msgEl = document.getElementById("segv2Mensaje");

    paso.delay = {
      valor: parseInt(valorEl?.value, 10) || 1,
      unidad: normalizarUnidad(unidadEl?.value || "minutos"),
    };
    paso.contenido = String(msgEl?.value || "").trim();
    paso.tipo = "texto";
  }

  function renderListaPasos() {
    const lista = document.getElementById("segv2ListaPasos");
    if (!lista || !configActiva) return;

    if (!configActiva.pasos.length) {
      lista.innerHTML = '<p class="segv2-panel-empty">Sin pasos — agrega uno abajo.</p>';
      return;
    }

    lista.innerHTML = configActiva.pasos
      .map(function (paso, index) {
        const activo = index === pasoActivoIndex ? " segv2-paso-card--active" : "";
        const preview = paso.contenido
          ? esc(paso.contenido.slice(0, 48) + (paso.contenido.length > 48 ? "…" : ""))
          : '<span class="segv2-muted">Sin mensaje</span>';
        return (
          '<button type="button" class="segv2-paso-card' +
          activo +
          '" data-index="' +
          index +
          '">' +
          '<span class="segv2-paso-card-num">Paso ' +
          (index + 1) +
          "</span>" +
          '<span class="segv2-paso-card-delay">⏱ ' +
          esc(formatearDelayCorto(paso.delay)) +
          "</span>" +
          '<span class="segv2-paso-card-msg">' +
          preview +
          "</span></button>"
        );
      })
      .join("");

    lista.querySelectorAll(".segv2-paso-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        syncPasoDesdeFormulario();
        pasoActivoIndex = parseInt(btn.getAttribute("data-index"), 10) || 0;
        renderListaPasos();
        renderFormularioPaso();
      });
    });
  }

  function renderFormularioPaso() {
    const form = document.getElementById("segv2FormPaso");
    if (!form || !configActiva) return;

    const paso = configActiva.pasos[pasoActivoIndex];
    if (!paso) {
      form.innerHTML = "";
      return;
    }

    const unidadOpts = UNIDADES.map(function (u) {
      const sel = normalizarUnidad(paso.delay?.unidad) === u ? " selected" : "";
      const label = u.charAt(0).toUpperCase() + u.slice(1);
      return '<option value="' + u + '"' + sel + ">" + label + "</option>";
    }).join("");

    form.innerHTML =
      '<div class="segv2-form">' +
      "<h5>Paso " +
      (pasoActivoIndex + 1) +
      "</h5>" +
      '<div class="segv2-form-row">' +
      '<label>Tiempo</label>' +
      '<input type="number" id="segv2DelayValor" min="1" step="1" value="' +
      esc(paso.delay?.valor ?? 5) +
      '">' +
      '<select id="segv2DelayUnidad" class="segv2-select">' +
      unidadOpts +
      "</select></div>" +
      '<div class="segv2-form-row">' +
      "<label>Mensaje</label>" +
      '<textarea id="segv2Mensaje" rows="4" placeholder="Texto del seguimiento…">' +
      esc(paso.contenido || "") +
      "</textarea></div>" +
      '<button type="button" class="segv2-btn segv2-btn-danger" id="segv2EliminarPaso">Eliminar paso</button>' +
      "</div>";

    document.getElementById("segv2EliminarPaso")?.addEventListener("click", function () {
      if (configActiva.pasos.length <= 1) {
        alert("Debe haber al menos un paso.");
        return;
      }
      syncPasoDesdeFormulario();
      configActiva.pasos.splice(pasoActivoIndex, 1);
      pasoActivoIndex = Math.min(pasoActivoIndex, configActiva.pasos.length - 1);
      configActiva.pasos.forEach(function (p, i) {
        p.pasoId = "paso_" + (i + 1);
      });
      renderListaPasos();
      renderFormularioPaso();
      onPanelChange();
    });

    ["segv2DelayValor", "segv2DelayUnidad", "segv2Mensaje"].forEach(function (id) {
      document.getElementById(id)?.addEventListener("input", onPanelChange);
      document.getElementById(id)?.addEventListener("change", onPanelChange);
    });
  }

  function onPanelChange() {
    if (!nodoActivo) return;
    syncPasoDesdeFormulario();
    configActiva.cancelarSiResponde = !!document.getElementById("segv2CancelarSiResponde")?.checked;
    configActiva.pasos = configActiva.pasos
      .map(function (p, i) {
        return normalizarPaso(p, i);
      })
      .filter(Boolean);
    guardarConfigEnNodo(nodoActivo, configActiva);
    renderListaPasos();
  }

  function renderPanel(nodo) {
    if (!nodo) return;

    nodoActivo = nodo;
    configActiva = leerConfigDeNodo(nodo);
    pasoActivoIndex = 0;

    const contenido = document.getElementById("panelNodoContenido");
    if (!contenido) return;

    contenido.innerHTML =
      '<div class="segv2-panel">' +
      "<h4>🔒 Seguimiento CRM V2</h4>" +
      '<p class="segv2-panel-desc">Seguimiento seguro multi-número. Los pasos se envían desde la línea que recibió al lead.</p>' +
      '<label class="segv2-toggle">' +
      '<input type="checkbox" id="segv2CancelarSiResponde"' +
      (configActiva.cancelarSiResponde !== false ? " checked" : "") +
      "> Cancelar si responde</label>" +
      '<div id="segv2ListaPasos" class="segv2-pasos-list"></div>' +
      '<div class="segv2-panel-actions">' +
      '<button type="button" class="segv2-btn segv2-btn-ghost" id="segv2AddPaso">+ Agregar paso</button>' +
      "</div>" +
      '<div id="segv2FormPaso"></div>' +
      "</div>";

    document.getElementById("segv2CancelarSiResponde")?.addEventListener("change", onPanelChange);

    document.getElementById("segv2AddPaso")?.addEventListener("click", function () {
      syncPasoDesdeFormulario();
      configActiva.pasos.push(crearPasoVacio(configActiva.pasos.length));
      pasoActivoIndex = configActiva.pasos.length - 1;
      renderListaPasos();
      renderFormularioPaso();
      onPanelChange();
    });

    renderListaPasos();
    renderFormularioPaso();
    guardarConfigEnNodo(nodo, configActiva);
  }

  function flushPanelToNode() {
    if (!nodoActivo || !configActiva) return;
    syncPasoDesdeFormulario();
    configActiva.cancelarSiResponde = !!document.getElementById("segv2CancelarSiResponde")?.checked;
    configActiva.pasos = configActiva.pasos
      .map(function (p, i) {
        return normalizarPaso(p, i);
      })
      .filter(Boolean);
    guardarConfigEnNodo(nodoActivo, configActiva);
  }

  function clearPanelActivo() {
    nodoActivo = null;
    configActiva = null;
    pasoActivoIndex = 0;
  }

  function getNodoActivo() {
    return nodoActivo;
  }

  function getPersistPayload(nodo) {
    const cfg = leerConfigDeNodo(nodo);
    return {
      type: "seguimiento_crm_v2",
      data: {
        type: "seguimiento_crm_v2",
        label: "Seguimiento CRM V2",
        version: 1,
        pasos: cfg.pasos,
        cancelarSiResponde: cfg.cancelarSiResponde !== false,
      },
    };
  }

  return {
    crearConfigDefault,
    leerConfigDeNodo,
    guardarConfigEnNodo,
    renderPreviewNodo,
    renderPanel,
    esNodoSeguimientoV2,
    crearNodoEnCanvas,
    refrescarNodoCargado,
    flushPanelToNode,
    clearPanelActivo,
    getNodoActivo,
    getPersistPayload,
  };
})();
