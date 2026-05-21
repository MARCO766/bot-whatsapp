/**
 * MacBot — Nodo aislado 🔥 Remarketing Global
 * Sin handles; motor en segundo plano por flujo + lead.
 */
window.MacBotRemarketingGlobal = (function () {
  const UNIDADES = ["minutos", "horas", "dias"];
  const TIPOS = ["texto", "imagen", "audio", "pdf", "video"];

  function crearConfigPorDefecto() {
    return {
      type: "remarketing_global",
      activo: true,
      steps: [
        {
          id: "r1",
          nombre: "R1",
          delay: 1,
          unidad: "minutos",
          tipo: "texto",
          texto: "¿Sigues interesado? 😊",
          media_url: null,
          activo: true,
        },
        {
          id: "r2",
          nombre: "R2",
          delay: 16,
          unidad: "horas",
          tipo: "texto",
          texto: "",
          media_url: null,
          activo: true,
        },
        {
          id: "r3",
          nombre: "R3",
          delay: 23,
          unidad: "horas",
          tipo: "texto",
          texto: "",
          media_url: null,
          activo: true,
        },
        {
          id: "r4",
          nombre: "R4",
          delay: 2,
          unidad: "dias",
          tipo: "texto",
          texto: "",
          media_url: null,
          activo: true,
        },
      ],
      condiciones: {
        detener_si_responde: true,
        reiniciar_si_responde: true,
        detener_si_compra: true,
        detener_si_etiqueta_pagado: true,
        detener_si_humano_toma_chat: true,
        detener_si_otro_flujo: true,
      },
      etiquetas: {
        activo: "REMARKETING ACTIVO",
        interesado: "INTERESADO",
        no_respondio: "NO RESPONDIÓ",
        pagado: "PAGADO",
      },
      modo_inteligente: {
        no_repetir_mensaje_seguido: true,
        min_minutos_entre_envios: 0,
        respetar_ventana_24h: true,
      },
    };
  }

  let nodoActivo = null;
  let configActiva = crearConfigPorDefecto();
  let pasoActivoIndex = 0;
  let nodoCountRef = function () {
    return typeof nodoCount !== "undefined" ? nodoCount : 0;
  };

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizarUnidad(u) {
    const s = String(u || "minutos").toLowerCase();
    if (s === "dias" || s === "días" || s === "dia") return "dias";
    if (s === "horas" || s === "hora") return "horas";
    return "minutos";
  }

  function formatearDelay(paso) {
    const v = paso.delay != null ? paso.delay : paso.tiempo;
    const u = normalizarUnidad(paso.unidad);
    const map = { minutos: "min", horas: "h", dias: "d" };
    return v + (map[u] || u);
  }

  function pasoTieneMensaje(paso) {
    if (!paso) return false;
    if (paso.tipo === "texto") return !!(paso.texto || "").trim();
    return !!(paso.media_url || paso.texto || "").trim();
  }

  function leerConfigDeNodo(nodo) {
    const ta = nodo?.querySelector(".remarketing-global-data");
    if (!ta) return crearConfigPorDefecto();
    try {
      const data = JSON.parse(ta.value || ta.textContent || "{}");
      return normalizarConfig(data);
    } catch {
      return crearConfigPorDefecto();
    }
  }

  function normalizarConfig(data) {
    const base = crearConfigPorDefecto();
    if (!data || typeof data !== "object") return base;

    const steps = Array.isArray(data.steps) ? data.steps : base.steps;

    return {
      type: "remarketing_global",
      activo: data.activo !== false,
      steps: steps.map(function (s, i) {
        return {
          id: s.id || "r" + (i + 1),
          nombre: s.nombre || "R" + (i + 1),
          delay: parseInt(s.delay, 10) || 1,
          unidad: normalizarUnidad(s.unidad),
          tipo: TIPOS.includes(s.tipo) ? s.tipo : "texto",
          texto: s.texto || "",
          media_url: s.media_url || null,
          activo: s.activo !== false,
        };
      }),
      condiciones: Object.assign({}, base.condiciones, data.condiciones || {}),
      etiquetas: Object.assign({}, base.etiquetas, data.etiquetas || {}),
      modo_inteligente: Object.assign(
        {},
        base.modo_inteligente,
        data.modo_inteligente || {}
      ),
    };
  }

  function guardarConfigEnNodo(nodo, config) {
    let ta = nodo.querySelector(".remarketing-global-data");
    if (!ta) {
      ta = document.createElement("textarea");
      ta.className = "remarketing-global-data";
      ta.style.display = "none";
      nodo.appendChild(ta);
    }
    ta.value = JSON.stringify(config);
    renderPreviewNodo(nodo, config);
  }

  function renderPreviewNodo(nodo, config) {
    const body = nodo.querySelector(".rm-global-body");
    if (!body) return;

    const activo = config.activo !== false;
    const badgeActivo = nodo.querySelector(".rm-badge-activo, .rm-badge-pausado");

    if (badgeActivo) {
      badgeActivo.textContent = activo ? "ACTIVO" : "PAUSADO";
      badgeActivo.className = "rm-badge " + (activo ? "rm-badge-activo" : "rm-badge-pausado");
    }

    const steps = (config.steps || []).filter(function (s) {
      return s.activo !== false;
    });

    if (!steps.length) {
      body.innerHTML = '<p class="rm-global-empty">Configura pasos en el panel →</p>';
      return;
    }

    body.innerHTML =
      '<div class="rm-global-steps-preview">' +
      steps
        .map(function (paso) {
          const ok = pasoTieneMensaje(paso);
          return (
            '<div class="rm-step-line"><strong>' +
            esc(paso.nombre) +
            "</strong><span>" +
            esc(formatearDelay(paso)) +
            '</span><span class="rm-step-status">' +
            (ok ? "✓ msg" : "○ sin msg") +
            "</span></div>"
          );
        })
        .join("") +
      "</div>";
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
    }

    const id = "nodo_" + nodoCountRef();
    const nodo = document.createElement("div");

    nodo.id = id;
    nodo.className = "node remarketing-global-node";
    nodo.dataset.tipo = "remarketing_global";
    nodo.style.left = 320 + nodoCountRef() * 40 + "px";
    nodo.style.top = 180 + nodoCountRef() * 30 + "px";

    const config = crearConfigPorDefecto();

    nodo.innerHTML =
      '<button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo(\'' +
      id +
      "')\">✎</button>" +
      '<button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo(\'' +
      id +
      "')\">×</button>" +
      '<div class="rm-global-header">' +
      '<h3 class="rm-global-title">🔥 Remarketing Global</h3>' +
      '<div class="rm-global-badges">' +
      '<span class="rm-badge rm-badge-global">GLOBAL</span>' +
      '<span class="rm-badge rm-badge-activo">ACTIVO</span>' +
      "</div></div>" +
      '<div class="rm-global-body"><p class="rm-global-empty">Cargando…</p></div>' +
      '<textarea class="remarketing-global-data" style="display:none;"></textarea>';

    canvas.appendChild(nodo);
    guardarConfigEnNodo(nodo, config);

    if (typeof hacerMovible === "function") {
      hacerMovible(nodo);
    }

    return nodo;
  }

  function syncPasoDesdeFormulario() {
    const paso = configActiva.steps[pasoActivoIndex];
    if (!paso) return;

    paso.nombre = document.getElementById("rmPasoNombre")?.value?.trim() || paso.nombre;
    paso.delay = parseInt(document.getElementById("rmDelayValor")?.value, 10) || 1;
    paso.unidad = document.getElementById("rmDelayUnidad")?.value || "minutos";
    paso.tipo = paso.tipo || "texto";
    paso.texto = document.getElementById("rmTexto")?.value || "";
    paso.media_url = document.getElementById("rmMediaUrl")?.value?.trim() || null;
    paso.activo = document.getElementById("rmPasoActivo")?.checked !== false;
  }

  function renderPreviewMensaje(paso) {
    const box = document.getElementById("rmPreviewBox");
    if (!box || !paso) return;

    if (paso.tipo === "texto") {
      const t = (paso.texto || "").trim() || "(sin texto)";
      box.innerHTML = '<div class="rm-preview-bubble">' + esc(t) + "</div>";
      return;
    }

    const url = paso.media_url || "";
    box.innerHTML =
      '<div class="rm-preview-bubble">[' +
      esc(paso.tipo.toUpperCase()) +
      "]</div>" +
      (url
        ? '<div class="rm-preview-media">' + esc(url.slice(0, 60)) + "…</div>"
        : '<div class="rm-preview-media">Sin archivo</div>');
  }

  function renderFormularioPaso() {
    const wrap = document.getElementById("rmFormPaso");
    if (!wrap) return;

    const paso = configActiva.steps[pasoActivoIndex];
    if (!paso) {
      wrap.innerHTML = '<p class="rm-panel-desc">Agrega un paso de remarketing.</p>';
      return;
    }

    const opcionesUnidad = UNIDADES.map(function (u) {
      return (
        '<option value="' +
        u +
        '"' +
        (paso.unidad === u ? " selected" : "") +
        ">" +
        u +
        "</option>"
      );
    }).join("");

    const tabsTipo = TIPOS.map(function (t) {
      return (
        '<button type="button" class="rm-tipo-tab' +
        (paso.tipo === t ? " active" : "") +
        '" data-tipo="' +
        t +
        '">' +
        t +
        "</button>"
      );
    }).join("");

    const esMedia = paso.tipo !== "texto";

    wrap.innerHTML =
      '<div class="rm-field"><label>Paso activo</label><label><input type="checkbox" id="rmPasoActivo"' +
      (paso.activo !== false ? " checked" : "") +
      "> Enviar este paso</label></div>" +
      '<div class="rm-field"><label>Nombre del paso</label><input id="rmPasoNombre" value="' +
      esc(paso.nombre) +
      '"></div>' +
      '<div class="rm-delay-row">' +
      '<div class="rm-field"><label>Tiempo</label><input id="rmDelayValor" type="number" min="1" value="' +
      esc(paso.delay) +
      '"></div>' +
      '<div class="rm-field"><label>Unidad</label><select id="rmDelayUnidad">' +
      opcionesUnidad +
      "</select></div></div>" +
      '<div class="rm-field"><label>Tipo de mensaje</label><div class="rm-tipo-tabs" id="rmTipoTabs">' +
      tabsTipo +
      "</div></div>" +
      (esMedia
        ? '<div class="rm-field"><label>URL media</label><input id="rmMediaUrl" value="' +
          esc(paso.media_url || "") +
          '"><input type="file" id="rmArchivo" style="margin-top:6px;font-size:11px;"></div>'
        : '<div class="rm-field"><label>Contenido del mensaje</label><textarea id="rmTexto">' +
          esc(paso.texto) +
          "</textarea></div>") +
      '<div class="rm-field"><label>Vista previa</label><div class="rm-preview-box" id="rmPreviewBox"></div></div>';

    renderPreviewMensaje(paso);

    ["rmPasoNombre", "rmDelayValor", "rmDelayUnidad", "rmTexto", "rmMediaUrl", "rmPasoActivo"].forEach(
      function (id) {
        document.getElementById(id)?.addEventListener("input", onFormChange);
        document.getElementById(id)?.addEventListener("change", onFormChange);
      }
    );

    document.getElementById("rmTipoTabs")?.querySelectorAll(".rm-tipo-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        syncPasoDesdeFormulario();
        paso.tipo = btn.dataset.tipo;
        renderFormularioPaso();
        onFormChange();
      });
    });

    document.getElementById("rmArchivo")?.addEventListener("change", function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append("archivo", file);
      fetch("/subir-archivo", { method: "POST", body: fd })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data.url) {
            paso.media_url = data.url;
            document.getElementById("rmMediaUrl").value = data.url;
            onFormChange();
          }
        });
    });
  }

  function renderListaPasos() {
    const lista = document.getElementById("rmListaPasos");
    if (!lista) return;

    if (!configActiva.steps.length) {
      lista.innerHTML = '<p style="font-size:12px;color:#64748b;">Sin pasos. Agrega R1 abajo.</p>';
      return;
    }

    lista.innerHTML = configActiva.steps
      .map(function (paso, index) {
        return (
          '<div class="rm-step-card' +
          (index === pasoActivoIndex ? " active" : "") +
          '" data-index="' +
          index +
          '">' +
          '<div class="rm-step-card-head"><strong>' +
          esc(paso.nombre) +
          "</strong><small>⏱ " +
          esc(formatearDelay(paso)) +
          "</small></div>" +
          '<div class="rm-step-card-meta">' +
          esc(paso.tipo) +
          " · " +
          (pasoTieneMensaje(paso) ? "configurado" : "sin mensaje") +
          '</div><div class="rm-step-actions">' +
          '<button type="button" class="rm-btn rm-btn-ghost rm-btn-sm" data-action="up">↑</button>' +
          '<button type="button" class="rm-btn rm-btn-ghost rm-btn-sm" data-action="down">↓</button>' +
          '<button type="button" class="rm-btn rm-btn-danger rm-btn-sm" data-action="delete">Eliminar</button>' +
          "</div></div>"
        );
      })
      .join("");

    lista.querySelectorAll(".rm-step-card").forEach(function (card) {
      const index = parseInt(card.dataset.index, 10);

      card.addEventListener("click", function (e) {
        if (e.target.closest("[data-action]")) return;
        syncPasoDesdeFormulario();
        pasoActivoIndex = index;
        renderListaPasos();
        renderFormularioPaso();
      });

      card.querySelector('[data-action="delete"]')?.addEventListener("click", function (ev) {
        ev.stopPropagation();
        configActiva.steps.splice(index, 1);
        pasoActivoIndex = Math.max(0, pasoActivoIndex - 1);
        onFormChange();
      });

      card.querySelector('[data-action="up"]')?.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (index <= 0) return;
        syncPasoDesdeFormulario();
        const tmp = configActiva.steps[index - 1];
        configActiva.steps[index - 1] = configActiva.steps[index];
        configActiva.steps[index] = tmp;
        pasoActivoIndex = index - 1;
        onFormChange();
      });

      card.querySelector('[data-action="down"]')?.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (index >= configActiva.steps.length - 1) return;
        syncPasoDesdeFormulario();
        const tmp = configActiva.steps[index + 1];
        configActiva.steps[index + 1] = configActiva.steps[index];
        configActiva.steps[index] = tmp;
        pasoActivoIndex = index + 1;
        onFormChange();
      });
    });
  }

  function onFormChange() {
    syncPasoDesdeFormulario();
    renderListaPasos();
    renderFormularioPaso();
    if (nodoActivo) {
      guardarConfigEnNodo(nodoActivo, configActiva);
    }
    if (typeof window.macbotRecordHistoryDebounced === "function") {
      window.macbotRecordHistoryDebounced();
    }
  }

  function syncGlobalDesdePanel() {
    const toggle = document.getElementById("rmActivoToggle");
    if (toggle) configActiva.activo = toggle.checked;

    const checks = {
      detener_si_responde: "rmDetenerResponde",
      reiniciar_si_responde: "rmReiniciarResponde",
      detener_si_compra: "rmDetenerCompra",
      detener_si_etiqueta_pagado: "rmDetenerPagado",
      detener_si_humano_toma_chat: "rmDetenerHumano",
      detener_si_otro_flujo: "rmDetenerOtroFlujo",
    };

    Object.keys(checks).forEach(function (key) {
      const el = document.getElementById(checks[key]);
      if (el) configActiva.condiciones[key] = el.checked;
    });

    const tags = {
      activo: "rmTagActivo",
      interesado: "rmTagInteresado",
      no_respondio: "rmTagNoRespondio",
      pagado: "rmTagPagado",
    };

    Object.keys(tags).forEach(function (key) {
      const el = document.getElementById(tags[key]);
      if (el) configActiva.etiquetas[key] = el.value.trim();
    });

    const modoChecks = {
      no_repetir_mensaje_seguido: "rmModoNoRepetir",
      respetar_ventana_24h: "rmModoVentana24",
    };

    Object.keys(modoChecks).forEach(function (key) {
      const el = document.getElementById(modoChecks[key]);
      if (el) configActiva.modo_inteligente[key] = el.checked;
    });

    const minEntre = document.getElementById("rmMinEntreEnvios");
    if (minEntre) {
      configActiva.modo_inteligente.min_minutos_entre_envios =
        parseInt(minEntre.value, 10) || 0;
    }
  }

  function renderPanel(nodo) {
    if (!nodo) return;

    nodoActivo = nodo;
    configActiva = leerConfigDeNodo(nodo);
    pasoActivoIndex = 0;

    const contenido = document.getElementById("panelNodoContenido");
    if (!contenido) return;

    const c = configActiva.condiciones;
    const e = configActiva.etiquetas;
    const m = configActiva.modo_inteligente;

    contenido.innerHTML =
      '<div class="rm-panel">' +
      '<div class="rm-panel-hero">' +
      "<h4>🔥 Remarketing Global</h4>" +
      "<p>Motor automático de recuperación de leads sin respuesta.</p></div>" +
      '<div class="rm-section"><p class="rm-section-title">1. Estado</p>' +
      '<div class="rm-toggle-row"><span class="rm-toggle-label">Motor remarketing</span>' +
      '<label class="rm-switch"><input type="checkbox" id="rmActivoToggle"' +
      (configActiva.activo ? " checked" : "") +
      '><span class="rm-switch-slider"></span></label></div></div>' +
      '<div class="rm-section"><p class="rm-section-title">2. Secuencia</p>' +
      '<div id="rmListaPasos" class="rm-steps-list"></div>' +
      '<button type="button" class="rm-btn rm-btn-ghost" id="rmAddPaso" style="margin-top:8px;width:100%;">+ Agregar paso</button></div>' +
      '<div class="rm-section" id="rmFormPaso"></div>' +
      '<div class="rm-section"><p class="rm-section-title">4. Condiciones de parada</p>' +
      '<div class="rm-check-list">' +
      chk("rmDetenerResponde", c.detener_si_responde, "Detener si responde") +
      chk("rmReiniciarResponde", c.reiniciar_si_responde, "Reiniciar secuencia si responde (vuelve a R1)") +
      chk("rmDetenerCompra", c.detener_si_compra, "Detener si compra") +
      chk("rmDetenerPagado", c.detener_si_etiqueta_pagado, "Detener si etiqueta = PAGADO") +
      chk("rmDetenerHumano", c.detener_si_humano_toma_chat, "Detener si humano toma el chat") +
      chk("rmDetenerOtroFlujo", c.detener_si_otro_flujo, "Detener si entra a otro flujo") +
      "</div></div>" +
      '<div class="rm-section"><p class="rm-section-title">5. Etiquetas automáticas</p>' +
      tagField("rmTagActivo", e.activo, "Al entrar al remarketing") +
      tagField("rmTagInteresado", e.interesado, "Si responde") +
      tagField("rmTagNoRespondio", e.no_respondio, "Si no responde (último paso)") +
      tagField("rmTagPagado", e.pagado, "Si compra") +
      "</div>" +
      '<div class="rm-section"><p class="rm-section-title">6. Modo inteligente</p>' +
      '<div class="rm-check-list">' +
      chk("rmModoNoRepetir", m.no_repetir_mensaje_seguido, "No repetir mismo mensaje dos veces seguidas") +
      chk("rmModoVentana24", m.respetar_ventana_24h, "Respetar ventana 24h de WhatsApp") +
      "</div>" +
      '<div class="rm-field"><label>Mín. minutos entre envíos del bot</label>' +
      '<input type="number" id="rmMinEntreEnvios" min="0" value="' +
      esc(m.min_minutos_entre_envios || 0) +
      '"></div>' +
      '<p style="font-size:11px;color:#64748b;margin:0;">Fuera de 24h sin plantilla: no envía y registra estado <code>fuera_ventana_24h</code>.</p></div>' +
      '<button type="button" class="rm-btn rm-btn-primary" id="rmGuardarPanel" style="width:100%;">Guardar remarketing</button></div>';

    function chk(id, val, label) {
      return (
        '<label><input type="checkbox" id="' +
        id +
        '"' +
        (val ? " checked" : "") +
        "> " +
        esc(label) +
        "</label>"
      );
    }

    function tagField(id, val, hint) {
      return (
        '<div class="rm-field"><label>' +
        esc(hint) +
        '</label><input id="' +
        id +
        '" value="' +
        esc(val) +
        '"></div>'
      );
    }

    document.getElementById("rmActivoToggle")?.addEventListener("change", onFormChange);
    document.querySelectorAll(
      "#rmDetenerResponde,#rmReiniciarResponde,#rmDetenerCompra,#rmDetenerPagado,#rmDetenerHumano,#rmDetenerOtroFlujo,#rmModoNoRepetir,#rmModoVentana24"
    ).forEach(function (el) {
      el.addEventListener("change", onFormChange);
    });
    ["rmTagActivo", "rmTagInteresado", "rmTagNoRespondio", "rmTagPagado", "rmMinEntreEnvios"].forEach(
      function (id) {
        document.getElementById(id)?.addEventListener("input", onFormChange);
      }
    );

    document.getElementById("rmAddPaso")?.addEventListener("click", function () {
      syncPasoDesdeFormulario();
      syncGlobalDesdePanel();
      const n = configActiva.steps.length + 1;
      configActiva.steps.push({
        id: "r" + n,
        nombre: "R" + n,
        delay: 1,
        unidad: "horas",
        tipo: "texto",
        texto: "",
        media_url: null,
        activo: true,
      });
      pasoActivoIndex = configActiva.steps.length - 1;
      onFormChange();
    });

    document.getElementById("rmGuardarPanel")?.addEventListener("click", function () {
      syncPasoDesdeFormulario();
      syncGlobalDesdePanel();
      guardarConfigEnNodo(nodoActivo, configActiva);
      alert("Remarketing guardado. Recuerda guardar el flujo completo.");
    });

    renderListaPasos();
    renderFormularioPaso();
    guardarConfigEnNodo(nodo, configActiva);
  }

  function persistir() {
    if (!nodoActivo) return;
    syncPasoDesdeFormulario();
    syncGlobalDesdePanel();
    guardarConfigEnNodo(nodoActivo, configActiva);
  }

  function flushPanelToNode() {
    persistir();
  }

  function clearPanelActivo() {
    const restaurando =
      typeof builderHistorial !== "undefined" && builderHistorial.restaurando;
    if (!restaurando) persistir();
    nodoActivo = null;
    configActiva = crearConfigPorDefecto();
    pasoActivoIndex = 0;
  }

  function esNodoRemarketingGlobal(nodo) {
    return (
      nodo &&
      (nodo.dataset.tipo === "remarketing_global" ||
        nodo.classList.contains("remarketing-global-node"))
    );
  }

  function refrescarNodoCargado(nodo) {
    try {
      const config = leerConfigDeNodo(nodo);
      renderPreviewNodo(nodo, config);
    } catch (e) {
      console.warn("Remarketing: error refrescando nodo", e.message);
    }
  }

  return {
    crearNodoEnCanvas: crearNodoEnCanvas,
    renderPanel: renderPanel,
    esNodoRemarketingGlobal: esNodoRemarketingGlobal,
    refrescarNodoCargado: refrescarNodoCargado,
    flushPanelToNode: flushPanelToNode,
    clearPanelActivo: clearPanelActivo,
    leerConfigDeNodo: leerConfigDeNodo,
    crearConfigPorDefecto: crearConfigPorDefecto,
  };
})();

function agregarRemarketingGlobal() {
  if (window.MacBotRemarketingGlobal && window.MacBotRemarketingGlobal.crearNodoEnCanvas) {
    const nodo = window.MacBotRemarketingGlobal.crearNodoEnCanvas();
    if (nodo && typeof abrirPanelNodo === "function") {
      abrirPanelNodo(nodo);
    }
    return;
  }
  alert("Módulo Remarketing Global no disponible");
}
