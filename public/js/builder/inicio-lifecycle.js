/**
 * MacBot — Ciclo de Vida en nodo Inicio (Fase 5).
 * Solo builder: guarda lifecycle en node.data. El runtime aún no lo usa.
 */
(function () {
  const UNITS = ["minutes", "hours", "days"];
  const UNIT_LABELS = {
    minutes: "Minutos",
    hours: "Horas",
    days: "Días",
  };
  const DEFAULT_VALUE = 30;
  const DEFAULT_UNIT = "minutes";

  let panelNodoActivo = null;

  function escaparHTML(texto) {
    return String(texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function decodeHtmlEntities(str) {
    return String(str || "")
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .trim();
  }

  function esNodoInicio(nodo) {
    if (!nodo) return false;
    return (
      nodo.id === "nodo_inicio" ||
      nodo.dataset.tipo === "inicio" ||
      nodo.classList.contains("node-start")
    );
  }

  function normalizarUnit(raw) {
    const s = String(raw || "")
      .trim()
      .toLowerCase();
    if (UNITS.includes(s)) return s;
    if (s === "minutos" || s === "minuto" || s === "min") return "minutes";
    if (s === "horas" || s === "hora" || s === "h") return "hours";
    if (s === "dias" || s === "días" || s === "dia" || s === "día" || s === "d")
      return "days";
    return DEFAULT_UNIT;
  }

  function normalizarValue(raw) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_VALUE;
    return n;
  }

  /**
   * Normaliza lifecycle para UI / persistencia.
   * Si no hay config (flujos antiguos): enabled false solo en UI (no escribe JSON).
   */
  function normalizarLifecycle(raw, { forPersist } = {}) {
    if (!raw || typeof raw !== "object") {
      if (forPersist) return null;
      return { enabled: false };
    }

    if (raw.enabled !== true) {
      return { enabled: false };
    }

    return {
      enabled: true,
      value: normalizarValue(raw.value),
      unit: normalizarUnit(raw.unit),
    };
  }

  function leerLifecycleDesdeNodo(nodo) {
    if (!nodo) return null;

    try {
      const raw = nodo.querySelector(".inicio-lifecycle-data")?.value;
      if (raw) {
        return normalizarLifecycle(JSON.parse(decodeHtmlEntities(raw)), {
          forPersist: true,
        });
      }
    } catch (e) {
      console.warn("[INICIO_LIFECYCLE] JSON inválido en nodo:", e.message);
    }

    return null;
  }

  /** UI: sin lifecycle guardado → Sin límite (no muta JSON). */
  function lifecycleParaUI(nodo) {
    const stored = leerLifecycleDesdeNodo(nodo);
    if (!stored) return { enabled: false };
    return stored;
  }

  function asegurarTextarea(nodo) {
    let ta = nodo.querySelector(".inicio-lifecycle-data");
    if (ta) return ta;

    ta = document.createElement("textarea");
    ta.className = "inicio-lifecycle-data";
    ta.style.display = "none";
    ta.setAttribute("aria-hidden", "true");
    nodo.appendChild(ta);
    return ta;
  }

  function syncLifecycleToNodo(nodo, lifecycle) {
    if (!nodo || !esNodoInicio(nodo)) return null;

    const normalized = normalizarLifecycle(lifecycle, { forPersist: true });
    if (!normalized) return null;

    const ta = asegurarTextarea(nodo);
    const json = JSON.stringify(normalized);
    ta.value = json;
    ta.textContent = json;
    return normalized;
  }

  function applyDataToNodo(nodo, data) {
    if (!nodo || !data) return;
    if (data.lifecycle) {
      syncLifecycleToNodo(nodo, data.lifecycle);
    }
  }

  function asegurarBotonEditar(nodo) {
    if (!nodo || !esNodoInicio(nodo)) return;
    if (nodo.querySelector(".edit-node")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "edit-node";
    btn.title = "Configurar";
    btn.setAttribute("aria-label", "Configurar Inicio");
    btn.textContent = "✎";
    btn.setAttribute(
      "onclick",
      "event.stopPropagation(); editarNodo('nodo_inicio')"
    );
    nodo.appendChild(btn);
  }

  function refrescarNodoCargado(nodo) {
    if (!esNodoInicio(nodo)) return;
    nodo.dataset.tipo = "inicio";
    nodo.classList.add("node-start");
    asegurarBotonEditar(nodo);
  }

  function getPersistPayload(nodo) {
    const lifecycle = leerLifecycleDesdeNodo(nodo);
    if (!lifecycle) return null;
    return {
      tipo: "inicio",
      data: { lifecycle },
    };
  }

  function leerLifecycleDesdePanel() {
    const sinLimite = document.getElementById("inicioLifecycleSinLimite");
    const expira = document.getElementById("inicioLifecycleExpira");
    const valorEl = document.getElementById("inicioLifecycleValor");
    const unidadEl = document.getElementById("inicioLifecycleUnidad");

    if (!sinLimite && !expira) return null;

    if (expira && expira.checked) {
      return {
        enabled: true,
        value: normalizarValue(valorEl?.value),
        unit: normalizarUnit(unidadEl?.value),
      };
    }

    return { enabled: false };
  }

  function refrescarLifecycleUI() {
    const expira = document.getElementById("inicioLifecycleExpira")?.checked;
    const wrap = document.getElementById("inicioLifecycleDurationWrap");
    if (wrap) {
      wrap.hidden = !expira;
    }

    document.querySelectorAll(".inicio-lifecycle-option").forEach((label) => {
      const input = label.querySelector('input[type="radio"]');
      label.classList.toggle(
        "inicio-lifecycle-option--active",
        !!(input && input.checked)
      );
    });
  }

  function bindLifecycleUI() {
    ["inicioLifecycleSinLimite", "inicioLifecycleExpira"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => {
        refrescarLifecycleUI();
        if (typeof macbotRecordHistoryDebounced === "function") {
          macbotRecordHistoryDebounced();
        }
      });
    });

    const valor = document.getElementById("inicioLifecycleValor");
    valor?.addEventListener("change", () => {
      const n = parseInt(valor.value, 10);
      if (!Number.isFinite(n) || n < 1) {
        valor.value = "1";
      } else {
        valor.value = String(n);
      }
      if (typeof macbotRecordHistoryDebounced === "function") {
        macbotRecordHistoryDebounced();
      }
    });
    valor?.addEventListener("input", () => {
      if (typeof macbotRecordHistoryDebounced === "function") {
        macbotRecordHistoryDebounced();
      }
    });

    document
      .getElementById("inicioLifecycleUnidad")
      ?.addEventListener("change", () => {
        if (typeof macbotRecordHistoryDebounced === "function") {
          macbotRecordHistoryDebounced();
        }
      });
  }

  function renderPanel(nodo) {
    panelNodoActivo = nodo;

    const panel = document.getElementById("panelNodo");
    const contenido = document.getElementById("panelNodoContenido");
    if (!panel || !contenido) return;

    const lc = lifecycleParaUI(nodo);
    const enabled = lc.enabled === true;
    const value = enabled ? normalizarValue(lc.value) : DEFAULT_VALUE;
    const unit = enabled ? normalizarUnit(lc.unit) : DEFAULT_UNIT;

    panel.classList.add("activo");
    panel.setAttribute("aria-hidden", "false");

    if (typeof marcarNodoSeleccionado === "function") {
      marcarNodoSeleccionado(nodo);
    }

    const unitOptions = UNITS.map((u) => {
      return (
        '<option value="' +
        u +
        '"' +
        (unit === u ? " selected" : "") +
        ">" +
        UNIT_LABELS[u] +
        "</option>"
      );
    }).join("");

    contenido.innerHTML =
      '<div class="inicio-lifecycle-panel">' +
      '<div class="panel-campo">' +
      "<label>Nodo</label>" +
      '<input type="text" value="Inicio del Flujo" disabled>' +
      "</div>" +
      '<section class="inicio-lifecycle-section">' +
      '<div class="inicio-lifecycle-section-title">CICLO DE VIDA</div>' +
      '<div class="inicio-lifecycle-options" role="radiogroup" aria-label="Ciclo de vida">' +
      '<label class="inicio-lifecycle-option' +
      (!enabled ? " inicio-lifecycle-option--active" : "") +
      '">' +
      '<input type="radio" name="inicioLifecycleMode" id="inicioLifecycleSinLimite" value="none"' +
      (!enabled ? " checked" : "") +
      ">" +
      "<span>Sin límite</span>" +
      "</label>" +
      '<label class="inicio-lifecycle-option' +
      (enabled ? " inicio-lifecycle-option--active" : "") +
      '">' +
      '<input type="radio" name="inicioLifecycleMode" id="inicioLifecycleExpira" value="expire"' +
      (enabled ? " checked" : "") +
      ">" +
      "<span>Expira después de</span>" +
      "</label>" +
      "</div>" +
      '<div id="inicioLifecycleDurationWrap" class="inicio-lifecycle-duration"' +
      (enabled ? "" : " hidden") +
      ">" +
      '<div class="inicio-lifecycle-duration-grid">' +
      '<input type="number" id="inicioLifecycleValor" class="inicio-lifecycle-valor" min="1" step="1" inputmode="numeric" value="' +
      escaparHTML(String(value)) +
      '">' +
      '<select id="inicioLifecycleUnidad" class="inicio-lifecycle-unidad">' +
      unitOptions +
      "</select>" +
      "</div>" +
      "</div>" +
      "</section>" +
      '<button type="button" class="panel-btn" onclick="guardarPanelNodo()">Guardar cambios</button>' +
      "</div>";

    bindLifecycleUI();
    refrescarLifecycleUI();
  }

  function flushPanelToNode() {
    if (!panelNodoActivo || !document.body.contains(panelNodoActivo)) return;
    const lc = leerLifecycleDesdePanel();
    if (!lc) return;
    syncLifecycleToNodo(panelNodoActivo, lc);
  }

  function guardarPanelInicio() {
    if (!panelNodoActivo) return;
    if (typeof registrarHistorialBuilder === "function") {
      registrarHistorialBuilder();
    }
    flushPanelToNode();
  }

  function clearPanelActivo() {
    panelNodoActivo = null;
  }

  window.MacBotInicioLifecycle = {
    esNodoInicio,
    renderPanel,
    flushPanelToNode,
    clearPanelActivo,
    guardarPanelInicio,
    getPersistPayload,
    applyDataToNodo,
    refrescarNodoCargado,
    syncLifecycleToNodo,
    leerLifecycleDesdeNodo,
    lifecycleParaUI,
  };
})();
