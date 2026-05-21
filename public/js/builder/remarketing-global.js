/**
 * 🔥 Remarketing Global — herramienta fija del builder (no nodo canvas).
 * Persistencia: un registro virtual en flujos_builder.data.nodos
 */
window.MacBotRemarketingGlobal = (function () {
  const FIXED_NODE_ID = "remarketing_global_fixed";
  const UNIDADES = ["minutos", "horas", "dias"];
  const TIPOS = ["texto", "imagen", "audio", "pdf", "video"];
  const TABS = [
    "secuencia",
    "mensajes",
    "condiciones",
    "etiquetas",
    "inteligente",
    "estadisticas",
  ];

  let configActiva = crearConfigPorDefecto();
  let pasoActivoIndex = 0;
  let tabActiva = "secuencia";
  let fixedWrap = null;
  let modalOverlay = null;
  let inicializado = false;

  function crearConfigPorDefecto() {
    return {
      type: "remarketing_global",
      activo: true,
      fixed: true,
      noEdges: true,
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
        detenerSiResponde: true,
        reiniciarSiResponde: true,
        detenerSiCompra: true,
        detenerEtiqueta: "PAGADO",
        detenerSiHumano: true,
        detenerSiOtroFlujo: true,
      },
      etiquetas: {
        alEntrar: "REMARKETING ACTIVO",
        siResponde: "INTERESADO",
        siNoResponde: "NO RESPONDIÓ",
        siCompra: "PAGADO",
      },
      inteligente: {
        noRepetirMensaje: true,
        respetarVentana24h: true,
        minMinutosEntreBot: 5,
      },
    };
  }

  function esc(s) {
    return String(s || "")
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

  function formatearDelayLargo(paso) {
    const v = paso.delay != null ? paso.delay : paso.tiempo;
    const u = normalizarUnidad(paso.unidad);
    if (u === "minutos") return v + (v === 1 ? " minuto" : " minutos");
    if (u === "horas") return v + (v === 1 ? " hora" : " horas");
    return v + (v === 1 ? " día" : " días");
  }

  function pasoTieneMensaje(paso) {
    if (!paso) return false;
    if (paso.tipo === "texto") return !!(paso.texto || "").trim();
    return !!(paso.media_url || "").trim();
  }

  function migrarConfig(data) {
    if (!data || typeof data !== "object") return crearConfigPorDefecto();
    const base = crearConfigPorDefecto();
    const oldC = data.condiciones || {};
    const oldE = data.etiquetas || {};
    const oldI = data.modo_inteligente || data.inteligente || {};

    const condiciones = {
      detenerSiResponde:
        oldC.detenerSiResponde ?? oldC.detener_si_responde ?? base.condiciones.detenerSiResponde,
      reiniciarSiResponde:
        oldC.reiniciarSiResponde ?? oldC.reiniciar_si_responde ?? base.condiciones.reiniciarSiResponde,
      detenerSiCompra:
        oldC.detenerSiCompra ?? oldC.detener_si_compra ?? base.condiciones.detenerSiCompra,
      detenerEtiqueta:
        oldC.detenerEtiqueta || oldE.pagado || base.condiciones.detenerEtiqueta,
      detenerSiHumano:
        oldC.detenerSiHumano ?? oldC.detener_si_humano_toma_chat ?? base.condiciones.detenerSiHumano,
      detenerSiOtroFlujo:
        oldC.detenerSiOtroFlujo ?? oldC.detener_si_otro_flujo ?? base.condiciones.detenerSiOtroFlujo,
    };

    const etiquetas = {
      alEntrar: oldE.alEntrar || oldE.activo || base.etiquetas.alEntrar,
      siResponde: oldE.siResponde || oldE.interesado || base.etiquetas.siResponde,
      siNoResponde: oldE.siNoResponde || oldE.no_respondio || base.etiquetas.siNoResponde,
      siCompra: oldE.siCompra || oldE.pagado || base.etiquetas.siCompra,
    };

    const inteligente = {
      noRepetirMensaje:
        oldI.noRepetirMensaje ?? oldI.no_repetir_mensaje_seguido ?? base.inteligente.noRepetirMensaje,
      respetarVentana24h:
        oldI.respetarVentana24h ?? oldI.respetar_ventana_24h ?? base.inteligente.respetarVentana24h,
      minMinutosEntreBot:
        oldI.minMinutosEntreBot ??
        oldI.min_minutos_entre_envios ??
        base.inteligente.minMinutosEntreBot,
    };

    const steps = Array.isArray(data.steps)
      ? data.steps.map(function (s, i) {
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
        })
      : base.steps;

    return {
      type: "remarketing_global",
      activo: data.activo !== false,
      fixed: true,
      noEdges: true,
      steps,
      condiciones,
      etiquetas,
      inteligente,
    };
  }

  function parseJsonFromHtml(html) {
    if (!html) return null;
    const m = html.match(/remarketing-global-data[^>]*>([\s\S]*?)<\/textarea>/i);
    if (!m) return null;
    try {
      return JSON.parse(m[1].trim());
    } catch {
      return null;
    }
  }

  function loadFromSavedNode(savedNode) {
    if (!savedNode) {
      configActiva = crearConfigPorDefecto();
      return;
    }
    let raw = savedNode.config || parseJsonFromHtml(savedNode.html);
    if (!raw && savedNode.html) {
      try {
        raw = JSON.parse(savedNode.html);
      } catch {
        /* ignore */
      }
    }
    configActiva = migrarConfig(raw);
  }

  function buildStorageNode() {
    const json = JSON.stringify(configActiva).replace(/</g, "\\u003c");
    return {
      id: FIXED_NODE_ID,
      tipo: "remarketing_global",
      className: "remarketing-global-storage",
      left: "0px",
      top: "0px",
      html:
        '<textarea class="remarketing-global-data" style="display:none;">' +
        json +
        "</textarea>",
      config: configActiva,
    };
  }

  function mergeIntoNodosArray(nodos) {
    const filtered = nodos.filter(function (n) {
      return !esRegistroRemarketing(n);
    });
    filtered.push(buildStorageNode());
    return filtered;
  }

  function esRegistroRemarketing(n) {
    if (!n) return false;
    if (n.id === FIXED_NODE_ID) return true;
    if (n.tipo === "remarketing_global") return true;
    if (n.className && n.className.includes("remarketing-global")) return true;
    if (n.html && n.html.includes("remarketing-global-data")) return true;
    return false;
  }

  function esNodoRemarketingGlobal(nodo) {
    if (!nodo) return false;
    if (esRegistroRemarketing(nodo)) return true;
    return (
      nodo.dataset?.tipo === "remarketing_global" ||
      (nodo.classList && nodo.classList.contains("remarketing-global-node"))
    );
  }

  function eliminarNodosLegacyDelCanvas() {
    document.querySelectorAll("#canvasFlujo .remarketing-global-node").forEach(function (el) {
      el.remove();
    });
  }

  function renderFixedCard() {
    if (!fixedWrap) return;
    const activo = configActiva.activo !== false;
    const steps = (configActiva.steps || []).filter(function (s) {
      return s.activo !== false;
    });
    const total = configActiva.steps?.length || 0;
    const configurados = (configActiva.steps || []).filter(pasoTieneMensaje).length;

    let stepsHtml = "";
    (configActiva.steps || []).slice(0, 6).forEach(function (paso) {
      if (paso.activo === false) return;
      stepsHtml +=
        '<div class="rm-fixed-step-line"><strong>' +
        esc(paso.nombre) +
        "</strong><span>" +
        esc(formatearDelay(paso)) +
        "</span></div>";
    });

    fixedWrap.innerHTML =
      '<div class="rm-global-fixed-card' +
      (activo ? " rm-pulse" : "") +
      '" id="rmGlobalFixedCard" role="button" tabindex="0" aria-label="Abrir Remarketing Global">' +
      '<div class="rm-fixed-head">' +
      '<div><span class="rm-fixed-icon">🔥</span><h3 class="rm-fixed-title">Remarketing Global</h3></div>' +
      '<div class="rm-fixed-badges">' +
      '<span class="rm-badge rm-badge-global">GLOBAL</span>' +
      '<span class="rm-badge ' +
      (activo ? "rm-badge-activo" : "rm-badge-pausado") +
      '">' +
      (activo ? "ACTIVO" : "PAUSADO") +
      "</span></div></div>" +
      '<div class="rm-fixed-steps">' +
      (stepsHtml || '<p class="rm-fixed-footer">Sin pasos</p>') +
      "</div>" +
      '<p class="rm-fixed-footer">' +
      total +
      " paso" +
      (total === 1 ? "" : "s") +
      " · " +
      configurados +
      " configurado" +
      (configurados === 1 ? "" : "s") +
      "</p></div>";

    document.getElementById("rmGlobalFixedCard")?.addEventListener("click", abrirModal);
    document.getElementById("rmGlobalFixedCard")?.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrirModal();
      }
    });
  }

  function ensureDom() {
    const workspace = document.querySelector("#builderArea .flow-workspace");
    if (!workspace) return false;

    if (!fixedWrap) {
      fixedWrap = document.createElement("div");
      fixedWrap.id = "rmGlobalFixedWrap";
      fixedWrap.className = "rm-global-fixed-wrap";
      workspace.appendChild(fixedWrap);
    }

    if (!modalOverlay) {
      modalOverlay = document.createElement("div");
      modalOverlay.id = "modalRemarketingGlobal";
      modalOverlay.className = "rm-global-modal-overlay";
      modalOverlay.hidden = true;
      modalOverlay.innerHTML =
        '<div class="rm-global-modal" role="dialog" aria-modal="true" aria-labelledby="rmModalTitle">' +
        '<div class="rm-modal-header">' +
        '<button type="button" class="rm-modal-close" id="rmModalClose" aria-label="Cerrar">×</button>' +
        '<div class="rm-modal-hero">' +
        "<h2 id=\"rmModalTitle\">🔥 Remarketing Global</h2>" +
        '<span class="rm-badge rm-badge-global">GLOBAL</span>' +
        '<p class="rm-modal-sub">Motor automático de recuperación de leads sin respuesta.</p>' +
        '<div class="rm-modal-toolbar">' +
        '<div class="rm-toggle-row"><span style="color:#e2e8f0;font-size:13px;">Motor</span>' +
        '<label class="rm-switch"><input type="checkbox" id="rmModalActivo"><span class="rm-switch-slider"></span></label></div>' +
        '<div class="rm-modal-tabs" id="rmModalTabs"></div></div></div></div>' +
        '<div class="rm-modal-body" id="rmModalBody"></div>' +
        '<div class="rm-modal-footer">' +
        '<button type="button" class="rm-btn rm-btn-ghost" id="rmModalCancel">Cerrar</button>' +
        '<button type="button" class="rm-btn rm-btn-primary" id="rmModalGuardar">Guardar cambios</button>' +
        "</div></div>";
      document.body.appendChild(modalOverlay);

      modalOverlay.addEventListener("click", function (e) {
        if (e.target === modalOverlay) cerrarModal();
      });
      document.getElementById("rmModalClose")?.addEventListener("click", cerrarModal);
      document.getElementById("rmModalCancel")?.addEventListener("click", cerrarModal);
      document.getElementById("rmModalGuardar")?.addEventListener("click", guardarDesdeModal);
      document.getElementById("rmModalActivo")?.addEventListener("change", function () {
        configActiva.activo = !!this.checked;
        renderFixedCard();
      });
    }

    return true;
  }

  function renderTabs() {
    const labels = {
      secuencia: "Secuencia",
      mensajes: "Mensajes",
      condiciones: "Condiciones",
      etiquetas: "Etiquetas",
      inteligente: "Modo inteligente",
      estadisticas: "Estadísticas",
    };
    const wrap = document.getElementById("rmModalTabs");
    if (!wrap) return;
    wrap.innerHTML = TABS.map(function (t) {
      return (
        '<button type="button" class="rm-modal-tab' +
        (tabActiva === t ? " active" : "") +
        '" data-tab="' +
        t +
        '">' +
        labels[t] +
        "</button>"
      );
    }).join("");

    wrap.querySelectorAll(".rm-modal-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        syncDesdeFormularios();
        tabActiva = btn.dataset.tab;
        if (tabActiva === "mensajes" && configActiva.steps.length) {
          pasoActivoIndex = Math.min(pasoActivoIndex, configActiva.steps.length - 1);
        }
        renderModalContent();
      });
    });
  }

  function syncPasoEditor() {
    const paso = configActiva.steps[pasoActivoIndex];
    if (!paso) return;
    const n = document.getElementById("rmEdNombre");
    if (n) paso.nombre = n.value.trim() || paso.nombre;
    const d = document.getElementById("rmEdDelay");
    if (d) paso.delay = parseInt(d.value, 10) || 1;
    const u = document.getElementById("rmEdUnidad");
    if (u) paso.unidad = u.value;
    const t = document.getElementById("rmEdTexto");
    if (t) paso.texto = t.value;
    const m = document.getElementById("rmEdMedia");
    if (m) paso.media_url = m.value.trim() || null;
    const a = document.getElementById("rmEdActivo");
    if (a) paso.activo = a.checked;
  }

  function syncDesdeFormularios() {
    syncPasoEditor();
    const c = configActiva.condiciones;
    const e = configActiva.etiquetas;
    const i = configActiva.inteligente;

    if (document.getElementById("rmCDetenerResponde"))
      c.detenerSiResponde = document.getElementById("rmCDetenerResponde").checked;
    if (document.getElementById("rmCReiniciar"))
      c.reiniciarSiResponde = document.getElementById("rmCReiniciar").checked;
    if (document.getElementById("rmCCompra")) c.detenerSiCompra = document.getElementById("rmCCompra").checked;
    if (document.getElementById("rmCEtiqueta"))
      c.detenerEtiqueta = document.getElementById("rmCEtiqueta").value.trim() || "PAGADO";
    if (document.getElementById("rmCHumano")) c.detenerSiHumano = document.getElementById("rmCHumano").checked;
    if (document.getElementById("rmCOtroFlujo"))
      c.detenerSiOtroFlujo = document.getElementById("rmCOtroFlujo").checked;

    if (document.getElementById("rmEEntrar")) e.alEntrar = document.getElementById("rmEEntrar").value.trim();
    if (document.getElementById("rmEResponde")) e.siResponde = document.getElementById("rmEResponde").value.trim();
    if (document.getElementById("rmENoResponde"))
      e.siNoResponde = document.getElementById("rmENoResponde").value.trim();
    if (document.getElementById("rmECompra")) e.siCompra = document.getElementById("rmECompra").value.trim();

    if (document.getElementById("rmINoRepetir"))
      i.noRepetirMensaje = document.getElementById("rmINoRepetir").checked;
    if (document.getElementById("rmIVentana24"))
      i.respetarVentana24h = document.getElementById("rmIVentana24").checked;
    if (document.getElementById("rmIMinBot"))
      i.minMinutosEntreBot = parseInt(document.getElementById("rmIMinBot").value, 10) || 0;

    const act = document.getElementById("rmModalActivo");
    if (act) configActiva.activo = act.checked;
  }

  function renderTabSecuencia() {
    const steps = configActiva.steps || [];
    let html = '<div class="rm-seq-list">';
    steps.forEach(function (paso, index) {
      html +=
        '<div class="rm-seq-card' +
        (index === pasoActivoIndex ? " selected" : "") +
        (paso.activo === false ? " inactive" : "") +
        '" data-idx="' +
        index +
        '">' +
        '<div class="rm-seq-card-main"><strong>' +
        esc(paso.nombre) +
        "</strong><span>— " +
        esc(formatearDelayLargo(paso)) +
        " — " +
        (paso.activo !== false ? "activo" : "pausado") +
        (pasoTieneMensaje(paso) ? " · msg ✓" : " · sin msg") +
        "</span></div>" +
        '<div class="rm-seq-card-actions">' +
        '<button type="button" class="rm-btn rm-btn-ghost rm-btn-sm" data-a="edit">Editar</button>' +
        '<button type="button" class="rm-btn rm-btn-ghost rm-btn-sm" data-a="dup">Duplicar</button>' +
        '<button type="button" class="rm-btn rm-btn-ghost rm-btn-sm" data-a="up">↑</button>' +
        '<button type="button" class="rm-btn rm-btn-ghost rm-btn-sm" data-a="down">↓</button>' +
        '<button type="button" class="rm-btn rm-btn-danger rm-btn-sm" data-a="del">Eliminar</button>' +
        "</div></div>";
    });
    html +=
      '</div><button type="button" class="rm-btn rm-btn-ghost" id="rmAddPaso" style="margin-top:14px;width:100%;">+ Agregar paso</button>';
    return html;
  }

  function renderTabMensajes() {
    const paso = configActiva.steps[pasoActivoIndex];
    if (!paso) {
      return '<p style="color:#64748b;">Selecciona un paso en la pestaña Secuencia.</p>';
    }

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

    const unidadOpts = UNIDADES.map(function (u) {
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

    const esTexto = paso.tipo === "texto";
    const preview =
      esTexto
        ? esc((paso.texto || "").trim() || "(escribe un mensaje)")
        : "[" + esc(paso.tipo) + "] " + esc((paso.media_url || "").slice(0, 80) || "sin media");

    return (
      '<p style="color:#94a3b8;font-size:13px;margin:0 0 16px;">Editando <strong style="color:#ffb380;">' +
      esc(paso.nombre) +
      "</strong></p>" +
      '<div class="rm-editor-grid">' +
      '<div class="rm-field"><label>Nombre del paso</label><input id="rmEdNombre" value="' +
      esc(paso.nombre) +
      '"></div>' +
      '<div class="rm-field"><label><input type="checkbox" id="rmEdActivo"' +
      (paso.activo !== false ? " checked" : "") +
      "> Paso activo</label></div>" +
      '<div class="rm-field"><label>Retraso (número)</label><input type="number" id="rmEdDelay" min="1" value="' +
      esc(paso.delay) +
      '"></div>' +
      '<div class="rm-field"><label>Unidad</label><select id="rmEdUnidad">' +
      unidadOpts +
      "</select></div></div>" +
      '<div class="rm-field"><label>Tipo de mensaje</label><div class="rm-tipo-tabs" id="rmEdTipoTabs">' +
      tabsTipo +
      "</div></div>" +
      (esTexto
        ? '<div class="rm-field"><label>Contenido</label><textarea id="rmEdTexto">' +
          esc(paso.texto) +
          "</textarea></div>"
        : '<div class="rm-field"><label>URL media</label><input id="rmEdMedia" value="' +
          esc(paso.media_url || "") +
          '"><input type="file" id="rmEdArchivo" style="margin-top:8px;font-size:12px;"></div>') +
      '<div class="rm-field"><label>Vista previa WhatsApp</label><div class="rm-wa-preview"><div class="rm-wa-bubble" id="rmWaBubble">' +
      preview +
      "</div></div></div>" +
      '<button type="button" class="rm-btn rm-btn-primary" id="rmGuardarPaso">Guardar paso (sin cerrar)</button>'
    );
  }

  function renderTabCondiciones() {
    const c = configActiva.condiciones;
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
    return (
      '<div class="rm-check-list">' +
      chk("rmCDetenerResponde", c.detenerSiResponde, "Detener si responde") +
      chk("rmCReiniciar", c.reiniciarSiResponde, "Reiniciar secuencia si responde") +
      chk("rmCCompra", c.detenerSiCompra, "Detener si compra") +
      '<label style="flex-wrap:wrap;">Detener si etiqueta = <input id="rmCEtiqueta" value="' +
      esc(c.detenerEtiqueta || "PAGADO") +
      '" style="width:120px;margin-left:6px;"></label>' +
      chk("rmCHumano", c.detenerSiHumano, "Detener si humano toma el chat") +
      chk("rmCOtroFlujo", c.detenerSiOtroFlujo, "Detener si entra a otro flujo") +
      "</div>"
    );
  }

  function renderTabEtiquetas() {
    const e = configActiva.etiquetas;
    function field(id, val, label) {
      return (
        '<div class="rm-field"><label>' +
        esc(label) +
        '</label><input id="' +
        id +
        '" value="' +
        esc(val) +
        '"></div>'
      );
    }
    return (
      field("rmEEntrar", e.alEntrar, "Al entrar al remarketing") +
      field("rmEResponde", e.siResponde, "Si responde") +
      field("rmENoResponde", e.siNoResponde, "Si no responde (último paso)") +
      field("rmECompra", e.siCompra, "Si compra")
    );
  }

  function renderTabInteligente() {
    const i = configActiva.inteligente;
    return (
      '<div class="rm-check-list">' +
      '<label><input type="checkbox" id="rmINoRepetir"' +
      (i.noRepetirMensaje ? " checked" : "") +
      "> No repetir mismo mensaje dos veces seguidas</label>" +
      '<label><input type="checkbox" id="rmIVentana24"' +
      (i.respetarVentana24h ? " checked" : "") +
      "> Respetar ventana 24h de WhatsApp</label>" +
      '<label><input type="checkbox" id="rmIMinEntreCheck"' +
      (i.minMinutosEntreBot > 0 ? " checked" : "") +
      "> No enviar si el último mensaje del bot fue hace menos de X minutos</label>" +
      "</div>" +
      '<div class="rm-field"><label>Minutos mínimos entre envíos del bot</label>' +
      '<input type="number" id="rmIMinBot" min="0" value="' +
      esc(i.minMinutosEntreBot) +
      '"></div>' +
      '<div class="rm-hint-box">Si está fuera de la ventana de 24h y no hay plantilla configurada, <strong>no se envía</strong> y se registra el estado <code>fuera_ventana_24h</code> en logs.</div>'
    );
  }

  function renderTabEstadisticas() {
    const stats = [
      { n: 0, l: "Programados" },
      { n: 0, l: "Enviados" },
      { n: 0, l: "Respondieron" },
      { n: 0, l: "Detenidos" },
      { n: 0, l: "Fuera 24h" },
      { n: 0, l: "Conversiones" },
    ];
    return (
      '<p style="color:#64748b;font-size:13px;margin:0 0 16px;">Métricas del motor (próximamente con datos en vivo).</p>' +
      '<div class="rm-stats-grid">' +
      stats
        .map(function (s) {
          return (
            '<div class="rm-stat-card"><div class="rm-stat-num">' +
            s.n +
            '</div><div class="rm-stat-label">' +
            esc(s.l) +
            "</div></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function bindTabSecuencia() {
    document.querySelectorAll(".rm-seq-card").forEach(function (card) {
      const idx = parseInt(card.dataset.idx, 10);
      card.addEventListener("click", function (e) {
        if (e.target.closest("[data-a]")) return;
        pasoActivoIndex = idx;
        renderModalContent();
      });
      card.querySelector('[data-a="edit"]')?.addEventListener("click", function (e) {
        e.stopPropagation();
        pasoActivoIndex = idx;
        tabActiva = "mensajes";
        renderModalContent();
      });
      card.querySelector('[data-a="dup"]')?.addEventListener("click", function (e) {
        e.stopPropagation();
        syncDesdeFormularios();
        const copy = JSON.parse(JSON.stringify(configActiva.steps[idx]));
        copy.id = "r" + Date.now();
        copy.nombre = copy.nombre + " (copia)";
        configActiva.steps.splice(idx + 1, 0, copy);
        pasoActivoIndex = idx + 1;
        renderModalContent();
        renderFixedCard();
      });
      card.querySelector('[data-a="del"]')?.addEventListener("click", function (e) {
        e.stopPropagation();
        if (configActiva.steps.length <= 1) {
          alert("Debe haber al menos un paso.");
          return;
        }
        configActiva.steps.splice(idx, 1);
        pasoActivoIndex = Math.max(0, pasoActivoIndex - 1);
        renderModalContent();
        renderFixedCard();
      });
      card.querySelector('[data-a="up"]')?.addEventListener("click", function (e) {
        e.stopPropagation();
        if (idx <= 0) return;
        syncDesdeFormularios();
        const t = configActiva.steps[idx - 1];
        configActiva.steps[idx - 1] = configActiva.steps[idx];
        configActiva.steps[idx] = t;
        pasoActivoIndex = idx - 1;
        renderModalContent();
        renderFixedCard();
      });
      card.querySelector('[data-a="down"]')?.addEventListener("click", function (e) {
        e.stopPropagation();
        if (idx >= configActiva.steps.length - 1) return;
        syncDesdeFormularios();
        const t = configActiva.steps[idx + 1];
        configActiva.steps[idx + 1] = configActiva.steps[idx];
        configActiva.steps[idx] = t;
        pasoActivoIndex = idx + 1;
        renderModalContent();
        renderFixedCard();
      });
    });

    document.getElementById("rmAddPaso")?.addEventListener("click", function () {
      syncDesdeFormularios();
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
      renderModalContent();
      renderFixedCard();
    });
  }

  function bindTabMensajes() {
    const paso = configActiva.steps[pasoActivoIndex];
    if (!paso) return;

    function updatePreview() {
      syncPasoEditor();
      const p = configActiva.steps[pasoActivoIndex];
      const bubble = document.getElementById("rmWaBubble");
      if (!bubble || !p) return;
      if (p.tipo === "texto") {
        bubble.textContent = (p.texto || "").trim() || "(escribe un mensaje)";
      } else {
        bubble.textContent = "[" + p.tipo + "] " + (p.media_url || "sin media");
      }
      renderFixedCard();
    }

    ["rmEdNombre", "rmEdDelay", "rmEdUnidad", "rmEdTexto", "rmEdMedia", "rmEdActivo"].forEach(
      function (id) {
        document.getElementById(id)?.addEventListener("input", updatePreview);
        document.getElementById(id)?.addEventListener("change", updatePreview);
      }
    );

    document.querySelectorAll("#rmEdTipoTabs .rm-tipo-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        paso.tipo = btn.dataset.tipo;
        renderModalContent();
      });
    });

    document.getElementById("rmEdArchivo")?.addEventListener("change", function (e) {
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
            const m = document.getElementById("rmEdMedia");
            if (m) m.value = data.url;
            updatePreview();
          }
        });
    });

    document.getElementById("rmGuardarPaso")?.addEventListener("click", function () {
      syncPasoEditor();
      renderFixedCard();
      const toast = document.createElement("div");
      toast.textContent = "✓ Paso guardado";
      toast.style.cssText =
        "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:10px 20px;border-radius:8px;z-index:10060;font-size:13px;";
      document.body.appendChild(toast);
      setTimeout(function () {
        toast.remove();
      }, 1800);
    });
  }

  function renderModalContent() {
    const body = document.getElementById("rmModalBody");
    if (!body) return;

    const act = document.getElementById("rmModalActivo");
    if (act) act.checked = configActiva.activo !== false;

    renderTabs();

    let panelHtml = "";
    TABS.forEach(function (t) {
      let inner = "";
      if (t === "secuencia") inner = renderTabSecuencia();
      else if (t === "mensajes") inner = renderTabMensajes();
      else if (t === "condiciones") inner = renderTabCondiciones();
      else if (t === "etiquetas") inner = renderTabEtiquetas();
      else if (t === "inteligente") inner = renderTabInteligente();
      else if (t === "estadisticas") inner = renderTabEstadisticas();

      panelHtml +=
        '<div class="rm-tab-panel' +
        (tabActiva === t ? " active" : "") +
        '" data-panel="' +
        t +
        '">' +
        inner +
        "</div>";
    });

    body.innerHTML = panelHtml;

    if (tabActiva === "secuencia") bindTabSecuencia();
    if (tabActiva === "mensajes") bindTabMensajes();
  }

  function abrirModal() {
    if (!ensureDom()) return;
    tabActiva = "secuencia";
    renderModalContent();
    modalOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function cerrarModal() {
    syncDesdeFormularios();
    if (modalOverlay) modalOverlay.hidden = true;
    document.body.style.overflow = "";
    renderFixedCard();
    recordHistoryDebounced();
  }

  function guardarDesdeModal() {
    syncDesdeFormularios();
    renderFixedCard();
    recordHistoryDebounced();
    const toast = document.createElement("div");
    toast.textContent = "✓ Remarketing guardado — recuerda guardar el flujo completo";
    toast.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,#ff6b35,#ff9500);color:#1a0a04;padding:12px 22px;border-radius:10px;z-index:10060;font-size:13px;font-weight:600;";
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.remove();
    }, 2800);
  }

  function recordHistoryDebounced() {
    if (typeof window.macbotRecordHistoryDebounced === "function") {
      window.macbotRecordHistoryDebounced();
    }
  }

  function initBuilder() {
    if (!document.getElementById("builderArea")) return;
    if (!ensureDom()) return;
    eliminarNodosLegacyDelCanvas();
    renderFixedCard();
    inicializado = true;
  }

  function initAfterLoad() {
    if (typeof flujoCargado !== "undefined" && flujoCargado?.nodos) {
      const saved = flujoCargado.nodos.find(esRegistroRemarketing);
      loadFromSavedNode(saved);
    }
    initBuilder();
  }

  function abrirDesdePaleta() {
    initBuilder();
    abrirModal();
  }

  function getConfig() {
    return JSON.parse(JSON.stringify(configActiva));
  }

  function applyConfig(cfg) {
    configActiva = migrarConfig(cfg);
    renderFixedCard();
  }

  function flushPanelToNode() {
    /* no panel derecho */
  }

  function clearPanelActivo() {
    /* no panel derecho */
  }

  function refrescarNodoCargado() {
    renderFixedCard();
  }

  return {
    FIXED_NODE_ID: FIXED_NODE_ID,
    crearConfigPorDefecto: crearConfigPorDefecto,
    migrarConfig: migrarConfig,
    getConfig: getConfig,
    applyConfig: applyConfig,
    initBuilder: initBuilder,
    initAfterLoad: initAfterLoad,
    loadFromSavedNode: loadFromSavedNode,
    mergeIntoNodosArray: mergeIntoNodosArray,
    esNodoRemarketingGlobal: esNodoRemarketingGlobal,
    esRegistroRemarketing: esRegistroRemarketing,
    eliminarNodosLegacyDelCanvas: eliminarNodosLegacyDelCanvas,
    abrirModal: abrirModal,
    cerrarModal: cerrarModal,
    abrirDesdePaleta: abrirDesdePaleta,
    flushPanelToNode: flushPanelToNode,
    clearPanelActivo: clearPanelActivo,
    refrescarNodoCargado: refrescarNodoCargado,
  };
})();

function agregarRemarketingGlobal() {
  if (window.MacBotRemarketingGlobal) {
    window.MacBotRemarketingGlobal.abrirDesdePaleta();
  }
}
