/**
 * MacBot — Nodo cerebro: Remarketing Global 24h (Fase 1)
 * No avanza el flujo; configuración global del flujo.
 */
window.MacBotRemarketingGlobal = (function () {
  function crearConfigVacia() {
    return {
      version: 1,
      activo: false,
      horasInactividad: 23,
      detenerSiResponde: false,
      reiniciarAlResponder: true,
      detenerEnConversion: true,
      mensajeRemarketing: "",
      rm24h_contenidos: [],
      modoContextual: false,
    };
  }

  /** Mapea un ítem para edición en panel (conserva bloques vacíos). */
  function mapearItemContenidoUi(item) {
    if (!item || typeof item !== "object") return null;
    const tipo = String(item.tipo || "").toLowerCase();
    if (tipo === "texto") {
      return { tipo: "texto", texto: String(item.texto ?? "") };
    }
    if (tipo === "imagen") {
      return {
        tipo: "imagen",
        url: String(item.url ?? ""),
        caption: String(item.caption ?? ""),
      };
    }
    if (tipo === "audio") {
      return { tipo: "audio", url: String(item.url ?? "") };
    }
    if (tipo === "video") {
      return {
        tipo: "video",
        url: String(item.url ?? ""),
        caption: String(item.caption ?? ""),
      };
    }
    if (tipo === "documento" || tipo === "pdf") {
      return {
        tipo: "documento",
        url: String(item.url ?? ""),
        filename: String(item.filename ?? "archivo.pdf") || "archivo.pdf",
        caption: String(item.caption ?? ""),
      };
    }
    return null;
  }

  function crearBloqueVacio(tipo) {
    const t = String(tipo || "texto").toLowerCase();
    if (t === "texto") return { tipo: "texto", texto: "" };
    if (t === "imagen") return { tipo: "imagen", url: "", caption: "" };
    if (t === "audio") return { tipo: "audio", url: "" };
    if (t === "video") return { tipo: "video", url: "", caption: "" };
    if (t === "documento") {
      return { tipo: "documento", url: "", filename: "archivo.pdf", caption: "" };
    }
    return { tipo: "texto", texto: "" };
  }

  function hydrateRm24ContentBlocksFromNode(nodo) {
    const cfg = leerConfigDeNodo(nodo);
    let lista = [];
    if (Array.isArray(cfg.rm24h_contenidos) && cfg.rm24h_contenidos.length) {
      lista = cfg.rm24h_contenidos.map(mapearItemContenidoUi).filter(Boolean);
    }
    if (!lista.length) {
      const legacy = String(
        cfg.mensajeRemarketing || cfg.mensaje_remarketing || ""
      ).trim();
      if (legacy) lista.push({ tipo: "texto", texto: legacy });
    }
    configActiva = cfg;
    configActiva.rm24h_contenidos = lista;
    return lista;
  }

  function normalizarContenidosLista(raw, mensajeLegacy) {
    const lista = [];
    if (Array.isArray(raw)) {
      raw.forEach(function (item) {
        const n = mapearItemContenidoUi(item);
        if (n) lista.push(n);
      });
    }
    if (!lista.length) {
      const legacy = String(mensajeLegacy || "").trim();
      if (legacy) lista.push({ tipo: "texto", texto: legacy });
    }
    return lista;
  }

  /** Solo para validación / resumen (descarta bloques vacíos). */
  function normalizarItemContenidoUi(item) {
    const m = mapearItemContenidoUi(item);
    if (!m) return null;
    if (m.tipo === "texto") {
      const texto = String(m.texto || "").trim();
      if (!texto) return null;
      return { tipo: "texto", texto: texto };
    }
    const url = String(m.url || "").trim();
    if (!url) return null;
    if (m.tipo === "imagen") {
      return { tipo: "imagen", url: url, caption: String(m.caption || "").trim() };
    }
    if (m.tipo === "audio") return { tipo: "audio", url: url };
    if (m.tipo === "video") {
      return { tipo: "video", url: url, caption: String(m.caption || "").trim() };
    }
    if (m.tipo === "documento") {
      return {
        tipo: "documento",
        url: url,
        filename: String(m.filename || "archivo.pdf").trim() || "archivo.pdf",
        caption: String(m.caption || "").trim(),
      };
    }
    return null;
  }

  function validarContenidoUi(item) {
    if (!item) return "Bloque vacío";
    if (item.tipo === "texto") {
      return item.texto ? null : "El texto no puede estar vacío";
    }
    if (!item.url) return "La URL HTTPS es obligatoria";
    if (!/^https:\/\//i.test(item.url)) {
      return "Usa una URL pública HTTPS";
    }
    if (item.tipo === "imagen" && !/\.(jpe?g|png|webp)(\?|$)/i.test(item.url)) {
      return "Imagen: .jpg, .png o .webp";
    }
    if (item.tipo === "audio" && !/\.(mp3|ogg|m4a)(\?|$)/i.test(item.url)) {
      return "Audio: .mp3, .ogg o .m4a";
    }
    if (item.tipo === "video" && !/\.mp4(\?|$)/i.test(item.url)) {
      return "Video: .mp4";
    }
    if (item.tipo === "documento") {
      const fn = item.filename || "";
      if (!/\.(pdf|docx?)(\?|$)/i.test(item.url) && !/\.(pdf|docx?)$/i.test(fn)) {
        return "Documento: .pdf, .doc o .docx";
      }
    }
    return null;
  }

  function etiquetaTipoContenido(tipo) {
    const map = {
      texto: "Texto",
      imagen: "Imagen",
      audio: "Audio",
      video: "Video",
      documento: "Documento",
    };
    return map[tipo] || tipo;
  }

  function iconoTipoContenido(tipo) {
    const map = {
      texto: "💬",
      imagen: "🖼️",
      audio: "🎵",
      video: "🎬",
      documento: "📄",
    };
    return map[tipo] || "📎";
  }

  function sincronizarMensajeRemarketingDesdeContenidos(config) {
    const lista = Array.isArray(config.rm24h_contenidos) ? config.rm24h_contenidos : [];
    const primeroTexto = lista.find(function (c) {
      return c.tipo === "texto" && String(c.texto || "").trim();
    });
    if (primeroTexto) {
      config.mensajeRemarketing = String(primeroTexto.texto).trim();
    }
    return config;
  }

  let nodoActivo = null;
  let configActiva = crearConfigVacia();

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function leerTextareaJson(ta) {
    if (!ta) return null;
    const raw = String(ta.value || ta.textContent || "").trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function leerConfigDeNodo(nodo) {
    const base = crearConfigVacia();
    if (!nodo) return base;

    const ta = nodo.querySelector?.(".remarketing-global-data");
    let parsed = leerTextareaJson(ta);

    if (!parsed && nodo.__rm24hConfig && typeof nodo.__rm24hConfig === "object") {
      parsed = nodo.__rm24hConfig;
    }

    if (!parsed || typeof parsed !== "object") return base;

    const config = Object.assign({}, base, parsed, {
      horasInactividad: 23,
      detenerSiResponde: false,
      reiniciarAlResponder: parsed.reiniciarAlResponder !== false,
      detenerEnConversion: parsed.detenerEnConversion !== false,
      rm24h_contenidos: normalizarContenidosLista(
        parsed.rm24h_contenidos,
        parsed.mensajeRemarketing || parsed.mensaje_remarketing
      ),
    });

    sincronizarMensajeRemarketingDesdeContenidos(config);
    nodo.__rm24hConfig = config;
    return config;
  }

  function guardarConfigEnNodo(nodo, config) {
    if (!nodo || !config) return;
    const json = JSON.stringify(config);
    const ta = nodo.querySelector(".remarketing-global-data");
    if (ta) {
      ta.value = json;
      ta.textContent = json;
    }
    nodo.__rm24hConfig = config;
    renderPreviewNodo(nodo, config);
  }

  function renderPreviewNodo(nodo, config) {
    const body = nodo.querySelector(".rm24h-body");
    if (!body) return;

    if (!config.activo) {
      body.innerHTML =
        '<p class="rm24h-empty rm24-node-idle">Inactivo · abre el panel para activar</p>';
      return;
    }

    const borrador = Array.isArray(config.rm24h_contenidos)
      ? config.rm24h_contenidos.map(mapearItemContenidoUi).filter(Boolean)
      : [];
    const validos = borrador.map(normalizarItemContenidoUi).filter(Boolean);
    const chipLabel = {
      texto: "Texto",
      imagen: "Imagen",
      audio: "Audio",
      video: "Video",
      documento: "Doc",
    };
    let previewHtml = "";
    const primeroTexto = validos.find(function (c) {
      return c.tipo === "texto";
    });
    if (primeroTexto) {
      const corto =
        primeroTexto.texto.slice(0, 40) + (primeroTexto.texto.length > 40 ? "…" : "");
      previewHtml +=
        '<p class="rm24h-preview rm24-node-msg-preview">' + esc(corto) + "</p>";
    }
    const chips = validos
      .map(function (c) {
        return chipLabel[c.tipo] || c.tipo;
      })
      .filter(function (v, i, a) {
        return a.indexOf(v) === i;
      });
    if (chips.length) {
      previewHtml +=
        '<div class="rm24-preview-chips">' +
        chips
          .map(function (lbl) {
            return '<span class="rm24-preview-chip">' + esc(lbl) + "</span>";
          })
          .join("") +
        "</div>";
    }
    if (!previewHtml) {
      previewHtml =
        '<p class="rm24h-preview rm24-node-msg-preview">Sin contenido configurado</p>';
    }

    body.innerHTML =
      '<div class="rm24-status rm24h-badge-on">ACTIVO</div>' +
      '<ul class="rm24-summary rm24-summary--compact" aria-label="Resumen del remarketing">' +
      '<li><span class="rm24-summary-dot"></span>23h de inactividad</li>' +
      '<li><span class="rm24-summary-dot"></span>Reinicia si responde</li>' +
      '<li><span class="rm24-summary-dot"></span>1 solo envío</li>' +
      '<li><span class="rm24-summary-dot"></span>Termina flujo</li>' +
      "</ul>" +
      previewHtml;
  }

  function aplicarShellVisualNodo(nodo) {
    if (!esNodoRemarketingGlobal(nodo)) return;
    nodo.classList.add("rm24-node");

    const chip = nodo.querySelector(".rm24h-chip");
    if (chip) {
      chip.textContent = "RM24H";
      chip.classList.add("rm24-badge", "rm24-badge--type", "rm24-badge--pill");
    }

    const header = nodo.querySelector(".rm24h-header");
    if (header) header.classList.add("rm24-node-header");

    const titleGroup = nodo.querySelector(".rm24-node-title-group");
    if (titleGroup && !titleGroup.querySelector(".rm24-node-title-row")) {
      const titleEl =
        titleGroup.querySelector(".rm24-node-title") ||
        titleGroup.querySelector("span:not(.rm24h-chip):not(.rm24-badge)");
      const chipEl = titleGroup.querySelector(".rm24h-chip, .rm24-badge");
      if (titleEl && chipEl && titleEl !== chipEl) {
        const row = document.createElement("div");
        row.className = "rm24-node-title-row";
        titleGroup.textContent = "";
        titleGroup.appendChild(row);
        row.appendChild(titleEl);
        row.appendChild(chipEl);
      }
    }

    const body = nodo.querySelector(".rm24h-body");
    if (body) body.classList.add("rm24-node-body");

    const edit = nodo.querySelector(".edit-node");
    const del = nodo.querySelector(".delete-node");
    if (edit && del && !nodo.querySelector(".rm24-node-actions")) {
      const wrap = document.createElement("div");
      wrap.className = "rm24-node-actions node-actions";
      nodo.insertBefore(wrap, edit);
      wrap.appendChild(edit);
      wrap.appendChild(del);
    }
  }

  function mostrarErrorContenidos(msg) {
    const el = document.getElementById("rm24hContenidosError");
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  }

  function leerContenidosDesdePanel() {
    const lista = [];
    const root = document.getElementById("rm24hContenidosLista");
    if (!root) return lista;
    root.querySelectorAll(".rm24-contenido-item").forEach(function (card) {
      const tipo = card.dataset.tipo;
      if (tipo === "texto") {
        lista.push({
          tipo: "texto",
          texto: String(card.querySelector(".rm24-contenido-texto")?.value ?? ""),
        });
        return;
      }
      const url = String(card.querySelector(".rm24-contenido-url")?.value ?? "");
      const caption = String(card.querySelector(".rm24-contenido-caption")?.value ?? "");
      const filename = String(card.querySelector(".rm24-contenido-filename")?.value ?? "");
      if (tipo === "imagen") {
        lista.push({ tipo: "imagen", url: url, caption: caption });
      } else if (tipo === "audio") {
        lista.push({ tipo: "audio", url: url });
      } else if (tipo === "video") {
        lista.push({ tipo: "video", url: url, caption: caption });
      } else if (tipo === "documento") {
        lista.push({
          tipo: "documento",
          url: url,
          filename: filename || "archivo.pdf",
          caption: caption,
        });
      }
    });
    return lista;
  }

  function getRm24ContenidosActivos() {
    if (!Array.isArray(configActiva.rm24h_contenidos)) {
      configActiva.rm24h_contenidos = [];
    }
    return configActiva.rm24h_contenidos;
  }

  function addRm24ContentBlock(tipo) {
    const lista = leerContenidosDesdePanel();
    lista.push(crearBloqueVacio(tipo));
    configActiva.rm24h_contenidos = lista;
    renderRm24ContentBlocks();
    mostrarErrorContenidos("");
    persistirContenidosEnNodo();
  }

  function removeRm24ContentBlock(index) {
    const lista = leerContenidosDesdePanel();
    if (index < 0 || index >= lista.length) return;
    lista.splice(index, 1);
    configActiva.rm24h_contenidos = lista;
    renderRm24ContentBlocks();
    persistirContenidosEnNodo();
  }

  function updateRm24ContentBlock(index, field, value) {
    const lista = leerContenidosDesdePanel();
    if (index < 0 || index >= lista.length) return;
    lista[index][field] = value;
    configActiva.rm24h_contenidos = lista;
    sincronizarMensajeRemarketingDesdeContenidos(configActiva);
    persistirContenidosEnNodo();
  }

  function persistirContenidosEnNodo() {
    if (!nodoActivo) return;
    sincronizarMensajeRemarketingDesdeContenidos(configActiva);
    guardarConfigEnNodo(nodoActivo, configActiva);
    if (typeof window.macbotRecordHistoryDebounced === "function") {
      window.macbotRecordHistoryDebounced();
    }
  }

  function htmlBloqueContenido(item, index) {
    const tipo = item.tipo || "texto";
    const orden = index + 1;
    let campos = "";
    if (tipo === "texto") {
      campos =
        '<textarea class="rm24-input rm24-textarea rm24-contenido-texto" rows="3" placeholder="Mensaje de texto">' +
        esc(item.texto) +
        "</textarea>";
    } else {
      campos =
        '<input type="url" class="rm24-input rm24-contenido-url" placeholder="https://... URL pública HTTPS" value="' +
        esc(item.url) +
        '">';
      if (tipo === "imagen" || tipo === "video" || tipo === "documento") {
        campos +=
          '<input type="text" class="rm24-input rm24-contenido-caption" placeholder="Caption (opcional)" value="' +
          esc(item.caption) +
          '">';
      }
      if (tipo === "documento") {
        campos +=
          '<input type="text" class="rm24-input rm24-contenido-filename" placeholder="Nombre archivo (ej. oferta.pdf)" value="' +
          esc(item.filename || "archivo.pdf") +
          '">';
      }
      const urlPreview = String(item.url || "").trim();
      if (urlPreview) {
        campos += '<div class="rm24-contenido-preview">';
        if (tipo === "imagen") {
          campos +=
            '<img src="' +
            esc(urlPreview) +
            '" alt="" class="rm24-contenido-preview-img" onerror="this.style.display=\'none\'">';
        } else if (tipo === "audio") {
          campos +=
            '<audio class="rm24-contenido-preview-audio" controls preload="none" src="' +
            esc(urlPreview) +
            '"></audio>';
        } else if (tipo === "video") {
          campos +=
            '<video class="rm24-contenido-preview-video" controls preload="metadata" src="' +
            esc(urlPreview) +
            '"></video>';
        } else {
          campos +=
            '<span class="rm24-contenido-preview-link">' + esc(urlPreview) + "</span>";
        }
        campos += "</div>";
      }
    }

    return (
      '<div class="rm24-contenido-item" data-tipo="' +
      esc(tipo) +
      '" data-index="' +
      index +
      '">' +
      '<div class="rm24-contenido-item-head">' +
      '<span class="rm24-contenido-orden">#' +
      orden +
      "</span>" +
      '<span class="rm24-contenido-tipo">' +
      iconoTipoContenido(tipo) +
      " " +
      etiquetaTipoContenido(tipo) +
      "</span>" +
      '<button type="button" class="rm24-contenido-remove" data-rm24-remove="' +
      index +
      '" title="Eliminar">×</button>' +
      "</div>" +
      '<div class="rm24-contenido-fields">' +
      campos +
      "</div></div>"
    );
  }

  function renderRm24ContentBlocks() {
    const listaEl = document.getElementById("rm24hContenidosLista");
    if (!listaEl) return;
    const items = getRm24ContenidosActivos();
    if (!items.length) {
      listaEl.innerHTML =
        '<p class="rm24-contenidos-empty">Sin bloques. Usa los botones de abajo para agregar contenido.</p>';
      return;
    }
    listaEl.innerHTML = items
      .map(function (item, i) {
        return htmlBloqueContenido(mapearItemContenidoUi(item) || item, i);
      })
      .join("");
  }

  function bindContenidosPanelEvents() {
    const mount = document.getElementById("panelNodoContenido");
    if (!mount) return;

    if (mount.dataset.rm24hContenidosBound === "1") return;
    mount.dataset.rm24hContenidosBound = "1";

    mount.addEventListener("click", function (ev) {
      const addBtn = ev.target.closest("[data-add-tipo]");
      if (addBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        addRm24ContentBlock(addBtn.getAttribute("data-add-tipo"));
        return;
      }
      const removeBtn = ev.target.closest("[data-rm24-remove]");
      if (removeBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        const idx = parseInt(removeBtn.getAttribute("data-rm24-remove"), 10);
        removeRm24ContentBlock(idx);
      }
    });

    mount.addEventListener("input", function (ev) {
      if (!ev.target.closest("#rm24hContenidosLista")) return;
      mostrarErrorContenidos("");
      configActiva.rm24h_contenidos = leerContenidosDesdePanel();
      sincronizarMensajeRemarketingDesdeContenidos(configActiva);
      persistirContenidosEnNodo();
    });

    mount.addEventListener("change", function (ev) {
      if (!ev.target.closest(".rm24-contenido-url")) return;
      configActiva.rm24h_contenidos = leerContenidosDesdePanel();
      renderRm24ContentBlocks();
      persistirContenidosEnNodo();
    });
  }

  function esNodoRemarketingGlobal(nodo) {
    return (
      nodo &&
      (nodo.dataset.tipo === "remarketing_global" ||
        nodo.classList.contains("remarketing-global-node"))
    );
  }

  function panelRemarketingAbierto() {
    return !!document.getElementById("rm24hActivo");
  }

  function aplicarConfigAlPanel(config) {
    const cfg = config || configActiva;
    const activoEl = document.getElementById("rm24hActivo");
    const horasEl = document.getElementById("rm24hHoras");
    const reiniciarEl = document.getElementById("rm24hReiniciar");
    const detenerConvEl = document.getElementById("rm24hDetenerConversion");

    if (activoEl) activoEl.checked = !!cfg.activo;
    if (horasEl) horasEl.value = String(cfg.horasInactividad ?? 23);
    if (reiniciarEl) reiniciarEl.checked = cfg.reiniciarAlResponder !== false;
    if (detenerConvEl) detenerConvEl.checked = cfg.detenerEnConversion !== false;
    renderRm24ContentBlocks();
    mostrarErrorContenidos("");
  }

  function renderPanel(nodo) {
    if (!nodo) return;

    nodoActivo = nodo;
    hydrateRm24ContentBlocksFromNode(nodo);

    const contenido = document.getElementById("panelNodoContenido");
    const panelShell = document.getElementById("panelNodo");
    if (!contenido) return;

    delete contenido.dataset.rm24hContenidosBound;

    if (panelShell) panelShell.classList.add("panel-nodo--rm24h");

    contenido.innerHTML =
      '<div class="rm24h-panel rm24-config-panel">' +
      '<div class="rm24-card rm24-card--hero">' +
      '<span class="rm24h-panel-icon" aria-hidden="true">🔥</span>' +
      "<div>" +
      "<h4>Remarketing Global 24h</h4>" +
      "<p>Cerebro global del flujo · no mueve leads entre nodos</p>" +
      "</div></div>" +
      '<div class="rm24-config-scroll">' +
      '<section class="rm24-section">' +
      '<h5 class="rm24-section-title">Estado</h5>' +
      '<label class="rm24-switch rm24h-toggle">' +
      '<input type="checkbox" id="rm24hActivo" ' +
      (configActiva.activo ? "checked" : "") +
      ">" +
      '<span class="rm24-switch-track" aria-hidden="true"></span>' +
      "<span class=\"rm24-switch-label\">Activar remarketing global</span></label>" +
      "</section>" +
      '<section class="rm24-section">' +
      '<h5 class="rm24-section-title">Tiempo de inactividad</h5>' +
      '<div class="rm24h-field rm24-field">' +
      "<label for=\"rm24hHoras\">Horas de inactividad</label>" +
      '<input type="number" id="rm24hHoras" class="rm24-input rm24-input--readonly" value="23" disabled readonly>' +
      '<p class="rm24h-hint">23h (ventana WhatsApp Cloud API)</p></div></section>' +
      '<section class="rm24-section rm24-section--rules">' +
      '<h5 class="rm24-section-title">Reglas automáticas</h5>' +
      '<div class="rm24-rule rm24h-field--locked">' +
      '<label class="rm24-switch rm24-switch--locked">' +
      '<input type="checkbox" id="rm24hDetenerSiResponde" disabled>' +
      '<span class="rm24-switch-track" aria-hidden="true"></span>' +
      '<span class="rm24-switch-label">Detener si responde</span></label>' +
      '<p class="rm24h-hint rm24-rule-hint">NO — responder reinicia el contador</p></div>' +
      '<div class="rm24-rule rm24h-field--locked">' +
      '<label class="rm24-switch rm24-switch--locked rm24-switch--on">' +
      '<input type="checkbox" id="rm24hReiniciar" checked disabled>' +
      '<span class="rm24-switch-track" aria-hidden="true"></span>' +
      '<span class="rm24-switch-label">Reiniciar contador al responder</span></label>' +
      '<p class="rm24h-hint rm24-rule-hint">SÍ (fijo en Fase 1)</p></div>' +
      '<div class="rm24-rule rm24h-field--locked">' +
      '<label class="rm24-switch rm24-switch--locked rm24-switch--on">' +
      '<input type="checkbox" id="rm24hDetenerConversion" checked disabled>' +
      '<span class="rm24-switch-track" aria-hidden="true"></span>' +
      '<span class="rm24-switch-label">Detener al llegar a Conversión</span></label>' +
      '<p class="rm24h-hint rm24-rule-hint">SÍ (fijo en Fase 1)</p></div></section>' +
      '<section class="rm24-section rm24-section--contenidos">' +
      '<h5 class="rm24-section-title">Contenido de remarketing</h5>' +
      '<p class="rm24h-hint rm24-contenidos-intro">Se envían en orden tras 23h sin respuesta. URLs HTTPS públicas.</p>' +
      '<div id="rm24hContenidosError" class="rm24-contenidos-error" hidden></div>' +
      '<div id="rm24hContenidosLista" class="rm24-contenidos-lista"></div>' +
      '<div id="rm24hContenidosToolbar" class="rm24-contenidos-toolbar">' +
      '<button type="button" class="rm24-contenido-add" data-add-tipo="texto">+ Texto</button>' +
      '<button type="button" class="rm24-contenido-add" data-add-tipo="imagen">+ Imagen</button>' +
      '<button type="button" class="rm24-contenido-add" data-add-tipo="audio">+ Audio</button>' +
      '<button type="button" class="rm24-contenido-add" data-add-tipo="video">+ Video</button>' +
      '<button type="button" class="rm24-contenido-add" data-add-tipo="documento">+ Documento</button>' +
      "</div></section>" +
      '<section class="rm24-section rm24-section--future">' +
      '<h5 class="rm24-section-title">Opciones futuras</h5>' +
      '<div class="rm24-rule rm24h-field--locked">' +
      '<label class="rm24-switch rm24-switch--locked">' +
      '<input type="checkbox" id="rm24hModoContextual" disabled>' +
      '<span class="rm24-switch-track" aria-hidden="true"></span>' +
      '<span class="rm24-switch-label">Modo contextual (futuro)</span></label>' +
      '<p class="rm24h-hint rm24-rule-hint">Desactivado en Fase 1</p></div></section>' +
      '<div class="rm24-config-footer">' +
      '<button type="button" class="panel-btn rm24-btn-save" id="rm24hGuardarPanel">Guardar nodo</button>' +
      "</div></div></div>";

    bindContenidosPanelEvents();
    aplicarConfigAlPanel(configActiva);

    document.getElementById("rm24hActivo")?.addEventListener("change", onPanelChange);
    document
      .getElementById("rm24hGuardarPanel")
      ?.addEventListener("click", guardarDesdePanel);
  }

  function syncDesdePanel() {
    if (!panelRemarketingAbierto()) return;

    const activoEl = document.getElementById("rm24hActivo");

    if (activoEl) configActiva.activo = !!activoEl.checked;
    configActiva.horasInactividad = 23;
    configActiva.detenerSiResponde = false;
    configActiva.reiniciarAlResponder = true;
    configActiva.detenerEnConversion = true;
    configActiva.modoContextual = false;
    configActiva.rm24h_contenidos = leerContenidosDesdePanel();
    sincronizarMensajeRemarketingDesdeContenidos(configActiva);
  }

  function onPanelChange() {
    syncDesdePanel();
    persistirContenidosEnNodo();
  }

  function guardarDesdePanel() {
    if (!nodoActivo) return;
    syncDesdePanel();
    const lista = (configActiva.rm24h_contenidos || [])
      .map(normalizarItemContenidoUi)
      .filter(Boolean);
    for (let i = 0; i < lista.length; i++) {
      const err = validarContenidoUi(lista[i]);
      if (err) {
        mostrarErrorContenidos("Bloque " + (i + 1) + ": " + err);
        return;
      }
    }
    if (configActiva.activo && !lista.length) {
      mostrarErrorContenidos("Agrega al menos un contenido con el remarketing activo.");
      return;
    }
    mostrarErrorContenidos("");
    guardarConfigEnNodo(nodoActivo, configActiva);
    alert("Remarketing Global guardado. Recuerda guardar el flujo completo.");
  }

  function flushPanelToNode() {
    if (!nodoActivo) return;
    syncDesdePanel();
    guardarConfigEnNodo(nodoActivo, configActiva);
  }

  function clearPanelActivo() {
    const restaurando =
      typeof builderHistorial !== "undefined" && builderHistorial.restaurando;
    if (!restaurando && nodoActivo) {
      syncDesdePanel();
      guardarConfigEnNodo(nodoActivo, configActiva);
    }
    nodoActivo = null;
    configActiva = crearConfigVacia();
    document.getElementById("panelNodo")?.classList.remove("panel-nodo--rm24h");
    delete document.getElementById("panelNodoContenido")?.dataset.rm24hContenidosBound;
  }

  function initNodoRecienCreado(nodo) {
    aplicarShellVisualNodo(nodo);
    renderPreviewNodo(nodo, leerConfigDeNodo(nodo));
  }

  function refrescarNodoCargado(nodo) {
    try {
      aplicarShellVisualNodo(nodo);
      renderPreviewNodo(nodo, leerConfigDeNodo(nodo));
    } catch (e) {
      console.warn("RM24H: error refrescando nodo", e.message);
    }
  }

  function crearNodoEnCanvas() {
    const canvas = document.getElementById("canvasFlujo");
    if (!canvas) return null;

    if (typeof nodoCount !== "undefined") nodoCount++;
    const id = "nodo_" + nodoCount;
    const cfg = JSON.stringify(crearConfigVacia());

    const nodo = document.createElement("div");
    nodo.className = "node remarketing-global-node node-remarketing-global rm24-node";
    nodo.id = id;
    nodo.dataset.tipo = "remarketing_global";
    nodo.style.left = 80 + nodoCount * 40 + "px";
    nodo.style.top = 120 + nodoCount * 30 + "px";

    nodo.innerHTML =
      '<div class="port in" data-nodo="' +
      id +
      '" onmousedown="iniciarConexion(event, \'' +
      id +
      '\', \'in\')"></div>' +
      '<div class="rm24-node-actions node-actions">' +
      '<button type="button" class="edit-node" onclick="event.stopPropagation(); abrirEditorRemarketingGlobal(\'' +
      id +
      '\')">✎</button>' +
      '<button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo(\'' +
      id +
      '\')">×</button></div>' +
      '<header class="rm24-node-header rm24h-header">' +
      '<span class="rm24-node-icon" aria-hidden="true">🔥</span>' +
      '<div class="rm24-node-title-group">' +
      '<div class="rm24-node-title-row">' +
      '<span class="rm24-node-title">Remarketing Global 24h</span>' +
      '<span class="rm24-badge rm24-badge--pill rm24-badge--type rm24h-chip">RM24H</span>' +
      "</div></div></header>" +
      '<div class="rm24h-body rm24-node-body"><p class="rm24h-empty rm24-node-idle">Inactivo · abre el panel para activar</p></div>' +
      '<textarea class="remarketing-global-data" style="display:none;">' +
      cfg +
      "</textarea>";

    canvas.appendChild(nodo);
    initNodoRecienCreado(nodo);
    if (typeof hacerMovible === "function") hacerMovible(nodo);
    return nodo;
  }

  return {
    crearConfigVacia,
    leerConfigDeNodo,
    guardarConfigEnNodo,
    renderPreviewNodo,
    renderPanel,
    esNodoRemarketingGlobal,
    initNodoRecienCreado,
    refrescarNodoCargado,
    flushPanelToNode,
    clearPanelActivo,
    crearNodoEnCanvas,
    abrirEditorRemarketingGlobal: function (id) {
      const n = document.getElementById(id);
      if (n && typeof abrirPanelNodo === "function") abrirPanelNodo(n);
    },
  };
})();

function agregarNodoRemarketingGlobal() {
  if (typeof registrarHistorialBuilder === "function") registrarHistorialBuilder();
  if (window.MacBotRemarketingGlobal?.crearNodoEnCanvas) {
    window.MacBotRemarketingGlobal.crearNodoEnCanvas();
  }
}

function abrirEditorRemarketingGlobal(id) {
  const n = document.getElementById(id);
  if (n && typeof abrirPanelNodo === "function") abrirPanelNodo(n);
}
