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
  const TIPOS_PASO = [
    { id: "texto", label: "Texto", icon: "💬" },
    { id: "imagen", label: "Imagen", icon: "🖼" },
    { id: "audio", label: "Audio", icon: "🎧" },
    { id: "video", label: "Video", icon: "🎬" },
    { id: "documento", label: "Documento", icon: "📄" },
  ];
  const MEDIA_TYPE_MAP = {
    imagen: "image",
    audio: "audio",
    video: "video",
    documento: "document",
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
    if (UNIDADES.indexOf(u) >= 0) return u;
    return "minutos";
  }

  function normalizarTipo(tipo) {
    const t = String(tipo || "texto").toLowerCase();
    if (t === "image" || t === "imagen") return "imagen";
    if (t === "document" || t === "documento" || t === "pdf" || t === "doc") return "documento";
    if (t === "audio") return "audio";
    if (t === "video") return "video";
    return "texto";
  }

  function tipoToMediaType(tipo) {
    return MEDIA_TYPE_MAP[normalizarTipo(tipo)] || null;
  }

  function labelTipo(tipo) {
    const t = normalizarTipo(tipo);
    const item = TIPOS_PASO.find(function (x) {
      return x.id === t;
    });
    return item ? item.label : "Texto";
  }

  function esTipoMedia(tipo) {
    return normalizarTipo(tipo) !== "texto";
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

  function reasignarPasoIds(pasos) {
    pasos.forEach(function (p, i) {
      p.pasoId = "paso_" + (i + 1);
    });
  }

  function validarPaso(paso, index) {
    const errores = [];
    const n = index + 1;
    const delay = paso?.delay || {};
    const valor = parseInt(delay.valor, 10);
    const unidad = String(delay.unidad || "").trim();
    const tipo = normalizarTipo(paso?.tipo);
    const contenido = String(paso?.contenido || "").trim();
    const mediaUrl = String(paso?.media_url || "").trim();

    if (isNaN(valor) || valor < 1) {
      errores.push("Paso " + n + ": el tiempo mínimo es 1.");
    }
    if (!unidad || UNIDADES.indexOf(normalizarUnidad(unidad)) < 0) {
      errores.push("Paso " + n + ": la unidad de tiempo es obligatoria.");
    }
    if (tipo === "texto" && !contenido) {
      errores.push("Paso " + n + ": el mensaje no puede estar vacío.");
    }
    if (esTipoMedia(tipo) && !mediaUrl) {
      errores.push("Paso " + n + ": la URL del archivo es obligatoria.");
    }
    return errores;
  }

  function validarConfig(config) {
    const errores = [];
    (config?.pasos || []).forEach(function (paso, i) {
      errores.push.apply(errores, validarPaso(paso, i));
    });
    return errores;
  }

  function normalizarPaso(paso, index) {
    if (!paso || typeof paso !== "object") return null;

    const delay = paso.delay || {};
    const valor = parseInt(delay.valor != null ? delay.valor : paso.minutos, 10);
    const unidad = normalizarUnidad(delay.unidad || "minutos");
    const tipo = normalizarTipo(paso.tipo);
    const contenido = String(paso.contenido || paso.texto || paso.mensaje || "").trim();
    const mediaUrl = String(paso.media_url || "").trim();
    const filename = String(paso.filename || "").trim();

    if (isNaN(valor) || valor <= 0) return null;

    if (tipo === "texto") {
      if (!contenido) return null;
      return {
        pasoId: String(paso.pasoId || "paso_" + (index + 1)).trim(),
        delay: { valor, unidad },
        tipo: "texto",
        contenido,
      };
    }

    if (!mediaUrl) return null;

    const out = {
      pasoId: String(paso.pasoId || "paso_" + (index + 1)).trim(),
      delay: { valor, unidad },
      tipo: tipo,
      contenido: contenido,
      media_url: mediaUrl,
      media_type: tipoToMediaType(tipo),
    };

    if (tipo === "documento" && filename) {
      out.filename = filename;
    }

    return out;
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

  function iconoTipoPaso(tipo) {
    const t = normalizarTipo(tipo);
    const item = TIPOS_PASO.find(function (x) {
      return x.id === t;
    });
    return item ? item.icon : "💬";
  }

  function previewPasoTexto(paso) {
    const tipo = normalizarTipo(paso.tipo);
    const contenido = String(paso.contenido || "").trim();
    const mediaUrl = String(paso.media_url || "").trim();

    if (tipo === "texto") {
      return contenido
        ? esc(contenido.slice(0, 48) + (contenido.length > 48 ? "…" : ""))
        : '<span class="segv2-muted">Sin mensaje</span>';
    }

    if (contenido) {
      return esc(contenido.slice(0, 48) + (contenido.length > 48 ? "…" : ""));
    }

    if (mediaUrl) {
      const corta = mediaUrl.length > 42 ? mediaUrl.slice(0, 42) + "…" : mediaUrl;
      return '<span class="segv2-muted">' + esc(corta) + "</span>";
    }

    return '<span class="segv2-muted">Sin archivo</span>';
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
      const esUltimo = index === pasos.length - 1;
      const preview = previewPasoTexto(paso);

      html +=
        '<div class="segv2-timeline-item' +
        (esUltimo ? " segv2-timeline-item--last" : "") +
        '">' +
        '<span class="segv2-timeline-rail" aria-hidden="true">' +
        '<span class="segv2-timeline-num">' +
        esc(String(index + 1)) +
        "</span>" +
        '<span class="segv2-timeline-dot"></span></span>' +
        '<div class="segv2-timeline-content">' +
        '<div class="segv2-timeline-badges">' +
        '<span class="segv2-chip segv2-chip--tipo">' +
        iconoTipoPaso(paso.tipo) +
        " " +
        esc(labelTipo(paso.tipo)) +
        "</span>" +
        '<span class="segv2-chip segv2-chip--delay">⏱ Espera ' +
        esc(formatearDelayCorto(paso.delay)) +
        "</span></div>" +
        '<p class="segv2-timeline-preview">' +
        preview +
        "</p></div></div>";
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
      '<div class="segv2-diag segv2-diag--compact">' +
      '<span class="segv2-diag-item"><strong>' +
      esc(String(pasoCount)) +
      '</strong> pasos</span>' +
      '<span class="segv2-diag-item">' +
      (cfg.cancelarSiResponde !== false ? "✓ Cancela si responde" : "○ Sin cancelación") +
      "</span>" +
      '<span class="segv2-diag-item segv2-diag--active">● V2 activo</span>' +
      "</div>" +
      '<p class="segv2-summary">' +
      esc(resumenConfig(cfg)) +
      "</p>" +
      '<div class="segv2-body">' +
      buildTimelineHtml(cfg.pasos) +
      "</div>" +
      "</div>" +
      '<textarea class="seguimiento-v2-data" style="display:none;">' +
      json +
      "</textarea>"
    );
  }

  function renderPreviewNodo(nodo, config, opts) {
    if (!nodo) return;

    const cfg =
      config && Array.isArray(config.pasos) ? config : parseConfigAlmacenada(config);
    const persist = opts && opts.persist;
    const summary = nodo.querySelector(".segv2-summary");
    const body = nodo.querySelector(".segv2-body");
    const diag = nodo.querySelector(".segv2-diag--compact");

    if (summary) summary.textContent = resumenConfig(cfg);

    if (diag) {
      diag.innerHTML =
        '<span class="segv2-diag-item"><strong>' +
        esc(String(cfg.pasos.length)) +
        '</strong> pasos</span>' +
        '<span class="segv2-diag-item">' +
        (cfg.cancelarSiResponde !== false ? "✓ Cancela si responde" : "○ Sin cancelación") +
        "</span>" +
        '<span class="segv2-diag-item segv2-diag--active">● V2 activo</span>';
    }

    if (body) {
      body.innerHTML = buildTimelineHtml(cfg.pasos);
    }

    if (persist) {
      const box = nodo.querySelector(".seguimiento-v2-data");
      if (box) {
        const json = JSON.stringify(cfg);
        box.value = json;
        box.textContent = json;
      }
    }

    requestAnimationFrame(function () {
      document.dispatchEvent(new CustomEvent("macbot:nodo-layout"));
    });
  }

  function buildPasoPreview(p, i) {
    const delay = p.delay || {};
    const valor = parseInt(delay.valor, 10);
    const tipo = normalizarTipo(p.tipo);
    const out = {
      pasoId: p.pasoId || "paso_" + (i + 1),
      delay: {
        valor: isNaN(valor) || valor < 1 ? 1 : valor,
        unidad: normalizarUnidad(delay.unidad || "minutos"),
      },
      tipo: tipo,
      contenido: String(p.contenido || ""),
    };

    if (esTipoMedia(tipo)) {
      out.media_url = String(p.media_url || "");
      out.media_type = tipoToMediaType(tipo);
      if (tipo === "documento" && p.filename) {
        out.filename = String(p.filename || "");
      }
    }

    return out;
  }

  function buildConfigPreview(config) {
    return {
      version: 1,
      cancelarSiResponde: config.cancelarSiResponde !== false,
      pasos: (config.pasos || []).map(buildPasoPreview),
    };
  }

  function buildConfigStrict(config) {
    return {
      version: 1,
      cancelarSiResponde: config.cancelarSiResponde !== false,
      pasos: (config.pasos || [])
        .map(function (p, i) {
          return normalizarPaso(p, i);
        })
        .filter(Boolean),
    };
  }

  function guardarConfigEnNodo(nodo, config, opts) {
    if (!nodo) return null;
    const strict = opts && opts.strict;
    const previewOnly = opts && opts.previewOnly;
    const errores = validarConfig(config);

    if (strict && errores.length) {
      return { ok: false, errores: errores, cfg: null };
    }

    const cfg = strict ? buildConfigStrict(config) : parseConfigAlmacenada(config);
    const visual = previewOnly ? buildConfigPreview(config) : cfg;
    renderPreviewNodo(nodo, visual, { persist: !previewOnly });

    return { ok: true, errores: errores, cfg: cfg };
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

    const result = guardarConfigEnNodo(nodo, cfg);
    return result ? result.cfg : null;
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
    const tipoEl = document.getElementById("segv2TipoPaso");
    const msgEl = document.getElementById("segv2Mensaje");
    const mediaUrlEl = document.getElementById("segv2MediaUrl");
    const captionEl = document.getElementById("segv2Caption");
    const filenameEl = document.getElementById("segv2Filename");

    const valor = parseInt(valorEl?.value, 10);
    const tipo = normalizarTipo(tipoEl?.value || paso.tipo || "texto");

    paso.delay = {
      valor: isNaN(valor) || valor < 1 ? 1 : valor,
      unidad: normalizarUnidad(unidadEl?.value || "minutos"),
    };
    paso.tipo = tipo;

    if (tipo === "texto") {
      paso.contenido = String(msgEl?.value || "");
      delete paso.media_url;
      delete paso.media_type;
      delete paso.filename;
      return;
    }

    paso.media_url = String(mediaUrlEl?.value || "").trim();
    paso.media_type = tipoToMediaType(tipo);
    paso.contenido = String(captionEl?.value || "").trim();

    if (tipo === "documento") {
      paso.filename = String(filenameEl?.value || "").trim();
    } else {
      delete paso.filename;
    }
  }

  function renderVistaPreviaMensaje() {
    const box = document.getElementById("segv2VistaPrevia");
    if (!box || !configActiva) return;

    const paso = configActiva.pasos[pasoActivoIndex];
    if (!paso) {
      box.innerHTML = "";
      return;
    }

    const tipo = normalizarTipo(paso.tipo);
    const texto = String(paso.contenido || "").trim();
    const mediaUrl = String(paso.media_url || "").trim();
    const delay = formatearDelayCorto(paso.delay);
    const icon = iconoTipoPaso(tipo);

    if (tipo === "texto" && !texto) {
      box.innerHTML =
        '<div class="segv2-preview-empty">Escribe un mensaje para ver la vista previa</div>';
      return;
    }

    if (esTipoMedia(tipo) && !mediaUrl) {
      box.innerHTML =
        '<div class="segv2-preview-empty">Ingresa la URL del archivo para ver la vista previa</div>';
      return;
    }

    let cuerpo = "";

    if (tipo === "texto") {
      cuerpo =
        '<div class="segv2-preview-bubble">' +
        '<span class="segv2-preview-icon" aria-hidden="true">' +
        icon +
        '</span><p class="segv2-preview-text">' +
        esc(texto).replace(/\n/g, "<br>") +
        "</p></div>";
    } else if (tipo === "imagen") {
      cuerpo =
        '<div class="segv2-preview-media">' +
        '<img src="' +
        esc(mediaUrl) +
        '" alt="Vista previa imagen" class="segv2-preview-img" loading="lazy">' +
        (texto ? '<p class="segv2-preview-caption">' + esc(texto) + "</p>" : "") +
        "</div>";
    } else if (tipo === "video") {
      cuerpo =
        '<div class="segv2-preview-media">' +
        '<video src="' +
        esc(mediaUrl) +
        '" controls muted playsinline class="segv2-preview-video"></video>' +
        (texto ? '<p class="segv2-preview-caption">' + esc(texto) + "</p>" : "") +
        "</div>";
    } else if (tipo === "audio") {
      cuerpo =
        '<div class="segv2-preview-media">' +
        '<audio src="' +
        esc(mediaUrl) +
        '" controls class="segv2-preview-audio"></audio></div>';
    } else {
      const nombre = paso.filename || "Documento";
      cuerpo =
        '<div class="segv2-preview-doc">' +
        '<span class="segv2-preview-icon" aria-hidden="true">📄</span>' +
        '<div><strong>' +
        esc(nombre) +
        '</strong><p class="segv2-preview-doc-url">' +
        esc(mediaUrl) +
        "</p>" +
        (texto ? '<p class="segv2-preview-caption">' + esc(texto) + "</p>" : "") +
        "</div></div>";
    }

    box.innerHTML =
      '<div class="segv2-preview-meta">' +
      icon +
      " " +
      esc(labelTipo(tipo)) +
      " · se envía tras <strong>" +
      esc(delay) +
      "</strong></div>" +
      cuerpo;
  }

  function renderErroresValidacion() {
    const box = document.getElementById("segv2Errores");
    if (!box || !configActiva) return;

    syncPasoDesdeFormulario();
    const errores = validarConfig(configActiva);

    if (!errores.length) {
      box.innerHTML = "";
      box.classList.remove("segv2-errores--visible");
      return;
    }

    box.classList.add("segv2-errores--visible");
    box.innerHTML =
      "<strong>Revisa la configuración:</strong><ul>" +
      errores.map(function (e) {
        return "<li>" + esc(e) + "</li>";
      }).join("") +
      "</ul>";
  }

  function renderDiagPanel() {
    const box = document.getElementById("segv2DiagPanel");
    if (!box || !configActiva) return;

    const cancelar = !!document.getElementById("segv2CancelarSiResponde")?.checked;
    const total = configActiva.pasos.length;

    box.innerHTML =
      '<div class="segv2-diag-grid">' +
      '<div class="segv2-diag-card"><span class="segv2-diag-label">Total pasos</span>' +
      '<span class="segv2-diag-value">' +
      esc(String(total)) +
      "</span></div>" +
      '<div class="segv2-diag-card"><span class="segv2-diag-label">Cancelar si responde</span>' +
      '<span class="segv2-diag-value">' +
      (cancelar ? "Sí" : "No") +
      "</span></div>" +
      '<div class="segv2-diag-card"><span class="segv2-diag-label">Modo</span>' +
      '<span class="segv2-diag-value">Seguro multi-número</span></div>' +
      '<div class="segv2-diag-card segv2-diag-card--ok"><span class="segv2-diag-label">Estado</span>' +
      '<span class="segv2-diag-value">V2 activo</span></div>' +
      "</div>";
  }

  function moverPaso(index, dir) {
    const newIndex = index + dir;
    if (!configActiva || newIndex < 0 || newIndex >= configActiva.pasos.length) return;

    syncPasoDesdeFormulario();
    const pasos = configActiva.pasos;
    const tmp = pasos[index];
    pasos[index] = pasos[newIndex];
    pasos[newIndex] = tmp;
    reasignarPasoIds(pasos);
    pasoActivoIndex = newIndex;
    renderListaPasos();
    renderFormularioPaso();
    onPanelChange();
  }

  function duplicarPaso(index) {
    if (!configActiva || !configActiva.pasos[index]) return;

    syncPasoDesdeFormulario();
    const copia = JSON.parse(JSON.stringify(configActiva.pasos[index]));
    configActiva.pasos.splice(index + 1, 0, copia);
    reasignarPasoIds(configActiva.pasos);
    pasoActivoIndex = index + 1;
    renderListaPasos();
    renderFormularioPaso();
    onPanelChange();
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
        const erroresPaso = validarPaso(paso, index);
        const invalido = erroresPaso.length ? " segv2-paso-card--invalid" : "";
        const preview = previewPasoTexto(paso);
        const puedeSubir = index > 0;
        const puedeBajar = index < configActiva.pasos.length - 1;

        return (
          '<div class="segv2-paso-card-wrap' +
          activo +
          invalido +
          '" data-index="' +
          index +
          '">' +
          '<button type="button" class="segv2-paso-card" data-action="select">' +
          '<span class="segv2-paso-card-rail"><span class="segv2-paso-card-num">' +
          (index + 1) +
          "</span></span>" +
          '<span class="segv2-paso-card-body">' +
          '<span class="segv2-paso-card-badges">' +
          '<span class="segv2-chip segv2-chip--tipo">' +
          iconoTipoPaso(paso.tipo) +
          " " +
          esc(labelTipo(paso.tipo)) +
          "</span>" +
          '<span class="segv2-chip segv2-chip--delay">⏱ Espera ' +
          esc(formatearDelayCorto(paso.delay)) +
          "</span></span>" +
          '<span class="segv2-paso-card-msg">' +
          preview +
          "</span></span></button>" +
          '<div class="segv2-paso-card-tools">' +
          '<button type="button" class="segv2-icon-btn" data-action="up"' +
          (puedeSubir ? "" : " disabled") +
          ' title="Mover arriba" aria-label="Mover arriba">↑</button>' +
          '<button type="button" class="segv2-icon-btn" data-action="down"' +
          (puedeBajar ? "" : " disabled") +
          ' title="Mover abajo" aria-label="Mover abajo">↓</button>' +
          '<button type="button" class="segv2-icon-btn" data-action="dup" title="Duplicar paso" aria-label="Duplicar paso">⧉</button>' +
          "</div></div>"
        );
      })
      .join("");

    lista.querySelectorAll(".segv2-paso-card-wrap").forEach(function (wrap) {
      const index = parseInt(wrap.getAttribute("data-index"), 10) || 0;

      wrap.querySelector('[data-action="select"]')?.addEventListener("click", function () {
        syncPasoDesdeFormulario();
        pasoActivoIndex = index;
        renderListaPasos();
        renderFormularioPaso();
      });

      wrap.querySelector('[data-action="up"]')?.addEventListener("click", function (ev) {
        ev.stopPropagation();
        moverPaso(index, -1);
      });

      wrap.querySelector('[data-action="down"]')?.addEventListener("click", function (ev) {
        ev.stopPropagation();
        moverPaso(index, 1);
      });

      wrap.querySelector('[data-action="dup"]')?.addEventListener("click", function (ev) {
        ev.stopPropagation();
        duplicarPaso(index);
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

    const total = configActiva.pasos.length;
    const puedeSubir = pasoActivoIndex > 0;
    const puedeBajar = pasoActivoIndex < total - 1;
    const tipoActual = normalizarTipo(paso.tipo);
    const esMedia = esTipoMedia(tipoActual);

    const tipoOpts = TIPOS_PASO.map(function (item) {
      const sel = tipoActual === item.id ? " selected" : "";
      return (
        '<option value="' +
        item.id +
        '"' +
        sel +
        ">" +
        item.icon +
        " " +
        item.label +
        "</option>"
      );
    }).join("");

    const camposTexto = !esMedia
      ? '<div class="segv2-form-row segv2-campo-texto">' +
        "<label>Mensaje</label>" +
        '<textarea id="segv2Mensaje" rows="4" placeholder="Texto del seguimiento…">' +
        esc(paso.contenido || "") +
        "</textarea></div>"
      : "";

    const camposMedia = esMedia
      ? '<div class="segv2-form-row segv2-campo-media">' +
        "<label>URL del archivo</label>" +
        '<input type="url" id="segv2MediaUrl" placeholder="https://…" value="' +
        esc(paso.media_url || "") +
        '"></div>' +
        (tipoActual === "imagen" || tipoActual === "video" || tipoActual === "documento"
          ? '<div class="segv2-form-row segv2-campo-caption">' +
            "<label>Caption (opcional)</label>" +
            '<textarea id="segv2Caption" rows="2" placeholder="Texto que acompaña el archivo…">' +
            esc(paso.contenido || "") +
            "</textarea></div>"
          : "") +
        (tipoActual === "documento"
          ? '<div class="segv2-form-row segv2-campo-filename">' +
            "<label>Nombre de archivo (opcional)</label>" +
            '<input type="text" id="segv2Filename" placeholder="ej. catalogo.pdf" value="' +
            esc(paso.filename || "") +
            '"></div>'
          : "")
      : "";

    form.innerHTML =
      '<div class="segv2-form">' +
      '<div class="segv2-form-head">' +
      "<h5>Paso " +
      (pasoActivoIndex + 1) +
      " de " +
      total +
      "</h5>" +
      '<div class="segv2-form-tools">' +
      '<button type="button" class="segv2-icon-btn" id="segv2MoverArriba"' +
      (puedeSubir ? "" : " disabled") +
      ' title="Mover arriba">↑</button>' +
      '<button type="button" class="segv2-icon-btn" id="segv2MoverAbajo"' +
      (puedeBajar ? "" : " disabled") +
      ' title="Mover abajo">↓</button>' +
      '<button type="button" class="segv2-icon-btn" id="segv2DuplicarPaso" title="Duplicar paso">⧉ Duplicar</button>' +
      "</div></div>" +
      '<div class="segv2-form-row segv2-form-row--delay">' +
      '<label>Tiempo de espera</label>' +
      '<div class="segv2-delay-inputs">' +
      '<input type="number" id="segv2DelayValor" min="1" step="1" value="' +
      esc(paso.delay?.valor ?? 5) +
      '" required>' +
      '<select id="segv2DelayUnidad" class="segv2-select" required>' +
      unidadOpts +
      "</select></div></div>" +
      '<div class="segv2-form-row">' +
      "<label>Tipo</label>" +
      '<select id="segv2TipoPaso" class="segv2-select">' +
      tipoOpts +
      "</select></div>" +
      camposTexto +
      camposMedia +
      '<div class="segv2-preview-wrap">' +
      '<label class="segv2-preview-label">Vista previa</label>' +
      '<div id="segv2VistaPrevia" class="segv2-preview"></div></div>' +
      '<button type="button" class="segv2-btn segv2-btn-danger" id="segv2EliminarPaso">Eliminar paso</button>' +
      "</div>";

    document.getElementById("segv2MoverArriba")?.addEventListener("click", function () {
      moverPaso(pasoActivoIndex, -1);
    });

    document.getElementById("segv2MoverAbajo")?.addEventListener("click", function () {
      moverPaso(pasoActivoIndex, 1);
    });

    document.getElementById("segv2DuplicarPaso")?.addEventListener("click", function () {
      duplicarPaso(pasoActivoIndex);
    });

    document.getElementById("segv2EliminarPaso")?.addEventListener("click", function () {
      if (configActiva.pasos.length <= 1) {
        alert("Debe haber al menos un paso.");
        return;
      }
      syncPasoDesdeFormulario();
      configActiva.pasos.splice(pasoActivoIndex, 1);
      pasoActivoIndex = Math.min(pasoActivoIndex, configActiva.pasos.length - 1);
      reasignarPasoIds(configActiva.pasos);
      renderListaPasos();
      renderFormularioPaso();
      onPanelChange();
    });

    document.getElementById("segv2TipoPaso")?.addEventListener("change", function () {
      syncPasoDesdeFormulario();
      renderFormularioPaso();
      onPanelChange();
    });

    [
      "segv2DelayValor",
      "segv2DelayUnidad",
      "segv2Mensaje",
      "segv2MediaUrl",
      "segv2Caption",
      "segv2Filename",
    ].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", onPanelChange);
      el.addEventListener("change", onPanelChange);
    });

    renderVistaPreviaMensaje();
    renderErroresValidacion();
  }

  function onPanelChange() {
    if (!nodoActivo) return;
    syncPasoDesdeFormulario();
    configActiva.cancelarSiResponde = !!document.getElementById("segv2CancelarSiResponde")?.checked;

    renderPreviewNodo(nodoActivo, buildConfigPreview(configActiva));
    renderListaPasos();
    renderDiagPanel();
    renderVistaPreviaMensaje();
    renderErroresValidacion();
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
      '<div id="segv2DiagPanel" class="segv2-diag-panel"></div>' +
      '<div id="segv2Errores" class="segv2-errores"></div>' +
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

    renderDiagPanel();
    renderListaPasos();
    renderFormularioPaso();
    onPanelChange();
  }

  function flushPanelToNode(opts) {
    if (!nodoActivo || !configActiva) return true;

    const silent = opts && opts.silent;
    syncPasoDesdeFormulario();
    configActiva.cancelarSiResponde = !!document.getElementById("segv2CancelarSiResponde")?.checked;

    const errores = validarConfig(configActiva);
    if (errores.length) {
      renderErroresValidacion();
      if (!silent) {
        alert("Seguimiento CRM V2:\n\n" + errores.join("\n"));
      }
      return false;
    }

    const result = guardarConfigEnNodo(nodoActivo, configActiva, { strict: true });
    if (!result || !result.ok) {
      return false;
    }

    configActiva = result.cfg;
    return true;
  }

  function clearPanelActivo() {
    const restaurando =
      typeof builderHistorial !== "undefined" && builderHistorial.restaurando;

    if (!restaurando && nodoActivo && configActiva) {
      const ok = flushPanelToNode({ silent: true });
      if (!ok) {
        renderPreviewNodo(nodoActivo, leerConfigDeNodo(nodoActivo));
      }
    }

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
