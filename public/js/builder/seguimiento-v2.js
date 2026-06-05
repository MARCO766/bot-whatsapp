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
  const BLOQUES_TIPO = [
    { id: "texto", label: "TEXTO", labelCorto: "Texto", icon: "💬" },
    { id: "imagen", label: "IMAGEN", labelCorto: "Imagen", icon: "🖼", maxMb: 5 },
    { id: "audio", label: "AUDIO", labelCorto: "Audio", icon: "🎧", maxMb: 5, recomendado: true },
    { id: "video", label: "VIDEO", labelCorto: "Video", icon: "🎬", maxMb: 15, recomendado: true },
    { id: "documento", label: "ARCHIVO", labelCorto: "Archivo", icon: "📄", maxMb: 10, anchoCompleto: true },
  ];
  const TIPOS_PASO = BLOQUES_TIPO;
  const MEDIA_TYPE_MAP = {
    imagen: "image",
    audio: "audio",
    video: "video",
    documento: "document",
  };
  const UPLOAD_ENDPOINT = "/api/seguimiento-v2/upload-media";
  const UPLOAD_V2_HABILITADO = true;
  const EXT_BLOQUEADAS = [".exe", ".bat", ".cmd", ".js", ".sh"];

  let nodoActivo = null;
  let configActiva = null;
  let pasoActivoIndex = -1;
  let mostrarSelectorBloques = false;
  const archivosLocales = {};

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
    return item ? item.labelCorto || item.label : "Texto";
  }

  function bloquePorTipo(tipo) {
    return (
      BLOQUES_TIPO.find(function (x) {
        return x.id === normalizarTipo(tipo);
      }) || BLOQUES_TIPO[0]
    );
  }

  function limiteMbPorTipo(tipo) {
    return bloquePorTipo(tipo).maxMb || null;
  }

  function formatearPeso(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  function claveArchivoLocal(paso, index) {
    if (!paso) return "paso_unknown";
    if (paso.pasoId) return String(paso.pasoId);
    if (typeof index === "number") return "idx_" + index;
    return "idx_" + pasoActivoIndex;
  }

  function limpiarArchivoLocal(paso) {
    const key = claveArchivoLocal(paso);
    const prev = archivosLocales[key];
    if (prev?.blobUrl) {
      try {
        URL.revokeObjectURL(prev.blobUrl);
      } catch (_e) {
        /* ignore */
      }
    }
    delete archivosLocales[key];
  }

  function limpiarTodosArchivosLocales() {
    Object.keys(archivosLocales).forEach(function (key) {
      const prev = archivosLocales[key];
      if (prev?.blobUrl) {
        try {
          URL.revokeObjectURL(prev.blobUrl);
        } catch (_e) {
          /* ignore */
        }
      }
    });
    Object.keys(archivosLocales).forEach(function (key) {
      delete archivosLocales[key];
    });
  }

  function getAcceptPorTipo(tipo) {
    const t = normalizarTipo(tipo);
    if (t === "imagen") return "image/*";
    if (t === "audio") return "audio/*";
    if (t === "video") return "video/*";
    if (t === "documento") return "application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/*";
    return "*/*";
  }

  function extensionArchivo(nombre) {
    const partes = String(nombre || "").split(".");
    if (partes.length < 2) return "";
    return ("." + partes.pop()).toLowerCase();
  }

  function esExtensionBloqueada(nombre) {
    return EXT_BLOQUEADAS.indexOf(extensionArchivo(nombre)) >= 0;
  }

  function obtenerConexionWhatsappIdUpload() {
    const api = window.MacBotSeguimientoApi;
    if (api && typeof api.obtenerConexionWhatsappIdBuilderContext === "function") {
      return api.obtenerConexionWhatsappIdBuilderContext();
    }
    return null;
  }

  function validarArchivoLocal(file, tipo) {
    if (!file) return null;

    if (esExtensionBloqueada(file.name)) {
      return "Tipo de archivo no permitido (.exe, .bat, .cmd, .js, .sh bloqueados).";
    }

    const bloque = bloquePorTipo(tipo);
    const maxMb = bloque.maxMb;
    if (!maxMb) return null;

    const maxBytes = maxMb * 1024 * 1024;
    if (file.size > maxBytes) {
      const pref = bloque.recomendado ? "recomendado máximo" : "máximo";
      return (
        bloque.labelCorto +
        ": el archivo supera el " +
        pref +
        " de " +
        maxMb +
        " MB (" +
        formatearPeso(file.size) +
        ")."
      );
    }
    return null;
  }

  function textoLimiteTipo(tipo) {
    const bloque = bloquePorTipo(tipo);
    if (!bloque.maxMb) return "";
    const pref = bloque.recomendado ? "Recomendado máx." : "Máx.";
    return pref + " " + bloque.maxMb + " MB";
  }

  function buildBloquesTipoHtml(tipoActual, opts) {
    const modoSelector = opts && opts.modoSelector;
    const cards = BLOQUES_TIPO.map(function (item) {
      const activo =
        !modoSelector && normalizarTipo(tipoActual) === item.id ? " segv2-block-card--active" : "";
      const ancho = item.anchoCompleto ? " segv2-block-card--wide" : "";
      return (
        '<button type="button" class="segv2-block-card' +
        activo +
        ancho +
        '" data-tipo="' +
        item.id +
        '" aria-label="' +
        esc(item.label) +
        '">' +
        '<span class="segv2-block-icon" aria-hidden="true">' +
        item.icon +
        "</span>" +
        '<span class="segv2-block-label">' +
        esc(item.label) +
        "</span></button>"
      );
    }).join("");

    const titulo = modoSelector ? "Elige un bloque" : "Tipo de bloque";

    return (
      '<div class="segv2-bloques-wrap' +
      (modoSelector ? " segv2-bloques-wrap--selector" : "") +
      '">' +
      '<p class="segv2-bloques-title">' +
      esc(titulo) +
      "</p>" +
      '<div class="segv2-block-picker">' +
      cards +
      "</div></div>"
    );
  }

  function esTipoMedia(tipo) {
    return normalizarTipo(tipo) !== "texto";
  }

  function crearPasoDesdeTipo(tipo, index) {
    return {
      pasoId: "paso_" + (index + 1),
      delay: { valor: 5, unidad: "minutos" },
      tipo: normalizarTipo(tipo),
      contenido: "",
    };
  }

  function crearConfigDefault() {
    return {
      version: 1,
      cancelarSiResponde: true,
      pasos: [],
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
    if (esTipoMedia(tipo)) {
      const local = archivosLocales[claveArchivoLocal(paso, index)];
      if (local?.sizeError) {
        errores.push("Paso " + n + ": " + local.sizeError);
      }
      if (local?.uploading) {
        errores.push("Paso " + n + ": espera a que termine la subida del archivo.");
      }
      if (local?.uploadError) {
        errores.push("Paso " + n + ": " + local.uploadError);
      }
      if (!mediaUrl) {
        errores.push(
          "Paso " +
            n +
            ": no puedes guardar este paso hasta subir el archivo o pegar una URL."
        );
      }
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
    const filename = String(paso.media_filename || paso.filename || "").trim();

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

    if (filename) {
      out.media_filename = filename;
    }

    return out;
  }

  function parseConfigAlmacenada(raw) {
    if (!raw || typeof raw !== "object") return crearConfigDefault();

    const pasos = Array.isArray(raw.pasos)
      ? raw.pasos.map(function (p, i) {
          return normalizarPaso(p, i);
        }).filter(Boolean)
      : [];

    return {
      version: 1,
      cancelarSiResponde: raw.cancelarSiResponde !== false,
      pasos: pasos,
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
    if (!n) return "Sin pasos · agrega bloques";
    const cancela = config.cancelarSiResponde !== false ? "cancela si responde" : "sin cancelación";
    return n + " paso" + (n === 1 ? "" : "s") + " · " + cancela;
  }

  function normalizarErrorUpload(msg) {
    const m = String(msg || "").toLowerCase();
    if (
      m.indexOf("bucket") >= 0 ||
      m.indexOf("not found") >= 0 ||
      m.indexOf("no existe") >= 0 ||
      m.indexOf("no encontrado") >= 0 ||
      m.indexOf("público") >= 0 ||
      m.indexOf("public") >= 0
    ) {
      return "No se pudo subir: bucket no existe o no está público.";
    }
    return msg || "No se pudo subir el archivo";
  }

  function buildTimelineHtml(pasos) {
    if (!pasos.length) {
      return '<p class="segv2-empty">Sin pasos · agrega bloques</p>';
    }

    const maxVisibles = 3;
    const visibles = pasos.slice(0, maxVisibles);
    const restantes = pasos.length - visibles.length;

    let html = '<div class="segv2-timeline">';
    visibles.forEach(function (paso, index) {
      const esUltimo = index === visibles.length - 1 && restantes <= 0;
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
        '<span class="segv2-chip segv2-chip--delay">⏱ ' +
        esc(formatearDelayCorto(paso.delay)) +
        "</span></div>" +
        '<p class="segv2-timeline-preview">' +
        preview +
        "</p></div></div>";
    });

    if (restantes > 0) {
      html +=
        '<p class="segv2-timeline-more">+' +
        esc(String(restantes)) +
        " más</p>";
    }

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
      '<span class="segv2-badge">Seguro multi-número</span>' +
      "</div></div>" +
      '<p class="segv2-subbadge">Envía mensajes programados sin mezclar líneas.</p>' +
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
      if (tipo === "documento") {
        const nombre = String(p.media_filename || p.filename || "").trim();
        if (nombre) out.media_filename = nombre;
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
    const tipoEl = document.getElementById("segv2TipoSelect");
    const msgEl = document.getElementById("segv2Mensaje");
    const mediaUrlEl = document.getElementById("segv2MediaUrl");
    const captionEl = document.getElementById("segv2Caption");
    const filenameEl = document.getElementById("segv2MediaFilename");

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
      delete paso.media_filename;
      delete paso.filename;
      return;
    }

    paso.media_url = String(mediaUrlEl?.value || "").trim();
    paso.media_type = tipoToMediaType(tipo);
    paso.contenido = String(captionEl?.value || "").trim();

    if (tipo === "documento") {
      const nombreArchivo = String(filenameEl?.value || "").trim();
      if (nombreArchivo) {
        paso.media_filename = nombreArchivo;
      } else {
        delete paso.media_filename;
      }
    } else if (!paso.media_filename) {
      delete paso.media_filename;
    }
    delete paso.filename;
  }

  function estadoMediaPaso(paso) {
    const local = archivosLocales[claveArchivoLocal(paso)];
    const mediaUrl = String(paso?.media_url || "").trim();

    if (local?.uploadError) {
      const err = normalizarErrorUpload(local.uploadError);
      const esBucket =
        err.indexOf("bucket") >= 0 ||
        String(local.uploadError || "").toLowerCase().indexOf("bucket") >= 0;
      return {
        tipo: "error",
        texto: err,
        detalle: esBucket
          ? "Bucket seguimiento-v2-media no encontrado. Créalo en Supabase Storage como público."
          : err,
      };
    }
    if (local?.uploading) {
      return { tipo: "uploading", texto: "Subiendo al servidor…" };
    }
    if (mediaUrl) {
      return { tipo: "ready", texto: "Archivo listo para enviar" };
    }
    if (local?.file && !local.sizeError) {
      return { tipo: "local", texto: "Preview local — aún no guardado" };
    }
    return { tipo: "empty", texto: "" };
  }

  function renderArchivoLocalBox(paso) {
    const box = document.getElementById("segv2ArchivoLocal");
    if (!box || !paso) return;

    const tipo = normalizarTipo(paso.tipo);
    const local = archivosLocales[claveArchivoLocal(paso)];
    const limite = textoLimiteTipo(tipo);
    const estado = estadoMediaPaso(paso);

    if (!local?.file) {
      box.innerHTML =
        '<p class="segv2-upload-hint">' +
        esc(limite) +
        " · selecciona un archivo desde tu PC</p>";
      return;
    }

    if (local.sizeError) {
      box.innerHTML =
        '<div class="segv2-upload-error">' +
        esc(local.sizeError) +
        "</div>";
      return;
    }

    if (local.uploading) {
      box.innerHTML =
        '<div class="segv2-upload-fileinfo">' +
        "<strong>" +
        esc(local.nombre || "Archivo") +
        "</strong>" +
        "<span>" +
        formatearPeso(local.size) +
        " · Subiendo…</span></div>" +
        '<p class="segv2-upload-hint segv2-upload-status--uploading">Guardando en Supabase Storage…</p>';
      return;
    }

    let statusClass = "segv2-media-status--neutral";
    if (estado.tipo === "ready") statusClass = "segv2-media-status--ready";
    if (estado.tipo === "local") statusClass = "segv2-media-status--local";
    if (estado.tipo === "error") statusClass = "segv2-media-status--error";

    box.innerHTML =
      '<div class="segv2-upload-fileinfo">' +
      "<strong>" +
      esc(local.nombre || "Archivo") +
      "</strong>" +
      "<span>" +
      formatearPeso(local.size) +
      "</span></div>" +
      (estado.texto
        ? '<p class="segv2-media-status ' +
          statusClass +
          '">' +
          esc(estado.detalle || estado.texto) +
          "</p>"
        : "") +
      (tipo === "documento"
        ? '<div class="segv2-upload-doc"><span aria-hidden="true">📄</span><span>' +
          esc(local.nombre || "Archivo") +
          "</span></div>"
        : "");
  }

  function onArchivoSeleccionado(ev) {
    const file = ev.target?.files?.[0];
    const paso = configActiva?.pasos?.[pasoActivoIndex];
    if (!paso) return;

    limpiarArchivoLocal(paso);
    delete paso.media_url;
    delete paso.media_filename;
    const urlElReset = document.getElementById("segv2MediaUrl");
    if (urlElReset) urlElReset.value = "";

    if (!file) {
      renderArchivoLocalBox(paso);
      onPanelChange();
      return;
    }

    const tipo = normalizarTipo(paso.tipo);
    const sizeError = validarArchivoLocal(file, tipo);
    const key = claveArchivoLocal(paso);
    const blobUrl = URL.createObjectURL(file);

    archivosLocales[key] = {
      file: file,
      blobUrl: blobUrl,
      size: file.size,
      nombre: file.name,
      sizeError: sizeError,
      uploadedUrl: "",
      uploadError: "",
      uploading: false,
    };

    if (!sizeError) {
      paso.media_filename = file.name;
      if (tipo === "documento") {
        const filenameEl = document.getElementById("segv2MediaFilename");
        if (filenameEl) filenameEl.value = file.name;
      }
    }

    renderArchivoLocalBox(paso);
    renderVistaPreviaMensaje();
    renderErroresValidacion();
    onPanelChange();

    if (!sizeError && UPLOAD_V2_HABILITADO) {
      intentarSubirArchivoLocal(file, paso);
    }
  }

  function intentarSubirArchivoLocal(file, paso) {
    const key = claveArchivoLocal(paso);
    const local = archivosLocales[key];
    if (!local || local.sizeError) return;

    const tipo = normalizarTipo(paso.tipo);
    const conexionWhatsappId = obtenerConexionWhatsappIdUpload();
    const status = document.getElementById("segv2UploadStatus");

    if (!conexionWhatsappId) {
      local.uploadError =
        "Falta la línea de WhatsApp del flujo (conexion_whatsapp_id). Abre el flujo con una línea asignada o pega una URL manual.";
      if (status) status.textContent = "Sin línea — URL manual";
      renderArchivoLocalBox(paso);
      renderErroresValidacion();
      return;
    }

    local.uploading = true;
    local.uploadError = "";
    if (status) {
      status.textContent = "Subiendo…";
      status.classList.add("segv2-upload-status--uploading");
    }
    renderArchivoLocalBox(paso);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("tipo", tipo);
    formData.append("conexion_whatsapp_id", conexionWhatsappId);

    fetch(UPLOAD_ENDPOINT, { method: "POST", body: formData, credentials: "same-origin" })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) {
            const errMsg = data?.error || "Error subiendo archivo";
            const err = new Error(errMsg);
            err.rawMessage = errMsg;
            throw err;
          }
          return data;
        });
      })
      .then(function (data) {
        if (!data?.publicUrl) {
          throw new Error("Respuesta sin URL pública");
        }
        local.uploading = false;
        local.uploadedUrl = data.publicUrl;
        local.uploadError = "";
        paso.media_url = data.publicUrl;
        paso.media_filename = data.filename || file.name;
        const urlEl = document.getElementById("segv2MediaUrl");
        if (urlEl) urlEl.value = data.publicUrl;
        if (status) {
          status.textContent = "✓ Archivo subido";
          status.classList.remove("segv2-upload-status--uploading");
        }
        renderArchivoLocalBox(paso);
        renderVistaPreviaMensaje();
        renderErroresValidacion();
        onPanelChange();
      })
      .catch(function (err) {
        local.uploading = false;
        const raw = err?.rawMessage || err?.message || "No se pudo subir el archivo";
        const esBucket =
          String(raw).toLowerCase().indexOf("bucket") >= 0 ||
          String(raw).toLowerCase().indexOf("seguimiento-v2-media") >= 0;
        local.uploadError = esBucket
          ? "Bucket seguimiento-v2-media no encontrado. Créalo en Supabase Storage como público."
          : normalizarErrorUpload(raw);
        if (status) {
          status.textContent = "Error al subir";
          status.classList.remove("segv2-upload-status--uploading");
        }
        renderArchivoLocalBox(paso);
        renderVistaPreviaMensaje();
        renderErroresValidacion();
      });
  }

  function buildCamposMediaHtml(paso, tipoActual) {
    const limite = textoLimiteTipo(tipoActual);
    const accept = getAcceptPorTipo(tipoActual);
    const conCaption =
      tipoActual === "imagen" || tipoActual === "video" || tipoActual === "documento";

    return (
      '<div class="segv2-media-panel">' +
      '<div class="segv2-form-row segv2-campo-upload">' +
      "<label>Subir desde PC <span class=\"segv2-limit-badge\">" +
      esc(limite) +
      "</span></label>" +
      '<div class="segv2-upload-row">' +
      '<input type="file" id="segv2ArchivoInput" accept="' +
      esc(accept) +
      '">' +
      '<span id="segv2UploadStatus" class="segv2-upload-status">Selecciona un archivo</span></div>' +
      '<div id="segv2ArchivoLocal" class="segv2-upload-preview-box"></div></div>' +
      '<details class="segv2-campo-url-advanced">' +
      "<summary>URL manual (opción avanzada)</summary>" +
      '<div class="segv2-form-row segv2-campo-url">' +
      "<label>URL pública del archivo</label>" +
      '<input type="url" id="segv2MediaUrl" placeholder="https://…" value="' +
      esc(paso.media_url || "") +
      '"></div></details>' +
      (conCaption
        ? '<div class="segv2-form-row segv2-campo-caption">' +
          "<label>Caption (opcional)</label>" +
          '<textarea id="segv2Caption" rows="2" placeholder="Texto que acompaña el archivo…">' +
          esc(paso.contenido || "") +
          "</textarea></div>"
        : "") +
      (tipoActual === "documento"
        ? '<div class="segv2-form-row segv2-campo-filename">' +
          "<label>Nombre de archivo (opcional)</label>" +
          '<input type="text" id="segv2MediaFilename" placeholder="ej. catalogo.pdf" value="' +
          esc(paso.media_filename || paso.filename || "") +
          '"></div>'
        : "") +
      "</div>"
    );
  }

  function wireBloquesTipo(paso, opts) {
    const modoSelector = opts && opts.modoSelector;
    document.querySelectorAll(".segv2-block-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const nuevoTipo = normalizarTipo(btn.getAttribute("data-tipo"));

        if (modoSelector) {
          agregarPasoDesdeTipo(nuevoTipo);
          return;
        }

        const tipoAnterior = normalizarTipo(paso.tipo);
        syncPasoDesdeFormulario();
        if (nuevoTipo !== tipoAnterior) {
          limpiarArchivoLocal(paso);
        }
        paso.tipo = nuevoTipo;
        renderFormularioPaso();
        onPanelChange();
      });
    });
  }

  function agregarPasoDesdeTipo(tipo) {
    if (!configActiva) return;
    syncPasoDesdeFormulario();
    const nuevo = crearPasoDesdeTipo(tipo, configActiva.pasos.length);
    configActiva.pasos.push(nuevo);
    pasoActivoIndex = configActiva.pasos.length - 1;
    mostrarSelectorBloques = false;
    renderSelectorBloques();
    renderListaPasos();
    renderFormularioPaso();
    onPanelChange();
  }

  function renderVistaPreviaMensaje() {
    const section = document.getElementById("segv2PreviewSection");
    const box = document.getElementById("segv2VistaPrevia");
    if (!box || !configActiva) return;

    const paso = configActiva.pasos[pasoActivoIndex];
    if (!paso) {
      if (section) section.style.display = "none";
      box.innerHTML = "";
      return;
    }

    if (section) section.style.display = "";

    const tipo = normalizarTipo(paso.tipo);
    const texto = String(paso.contenido || "").trim();
    const local = archivosLocales[claveArchivoLocal(paso)];
    const mediaUrlGuardada = String(paso.media_url || "").trim();
    const mediaUrl =
      mediaUrlGuardada || (local?.blobUrl && !local.sizeError ? local.blobUrl : "");
    const delay = formatearDelayCorto(paso.delay);
    const icon = iconoTipoPaso(tipo);
    const estado = estadoMediaPaso(paso);

    let statusHtml = "";
    if (esTipoMedia(tipo)) {
      if (estado.tipo === "error") {
        statusHtml =
          '<div class="segv2-preview-status segv2-preview-status--error">' +
          esc(estado.detalle || estado.texto) +
          "</div>";
      } else if (estado.tipo === "local") {
        statusHtml =
          '<div class="segv2-preview-status segv2-preview-status--local">' +
          esc(estado.texto) +
          "</div>";
      } else if (estado.tipo === "ready") {
        statusHtml =
          '<div class="segv2-preview-status segv2-preview-status--ready">' +
          esc(estado.texto) +
          "</div>";
      } else if (estado.tipo === "uploading") {
        statusHtml =
          '<div class="segv2-preview-status segv2-preview-status--uploading">' +
          esc(estado.texto) +
          "</div>";
      }
    }

    if (tipo === "texto" && !texto) {
      box.innerHTML =
        statusHtml +
        '<div class="segv2-preview-empty">Escribe un mensaje para ver la vista previa</div>';
      return;
    }

    if (esTipoMedia(tipo) && local?.sizeError) {
      box.innerHTML =
        statusHtml +
        '<div class="segv2-preview-empty segv2-preview-error">' +
        esc(local.sizeError) +
        "</div>";
      return;
    }

    if (esTipoMedia(tipo) && !mediaUrl) {
      box.innerHTML =
        statusHtml +
        '<div class="segv2-preview-empty">Sube un archivo o pega una URL para ver la vista previa</div>';
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
      const nombre = paso.media_filename || paso.filename || local?.nombre || "Documento";
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
      statusHtml +
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
      "<strong>No se puede guardar — corrige los pasos marcados en rojo:</strong><ul>" +
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
      '<div class="segv2-diag-card segv2-diag-card--ok"><span class="segv2-diag-label">Estado</span>' +
      '<span class="segv2-diag-value">V2 activo</span></div>' +
      "</div>";
  }

  function renderEstadoVacio() {
    const box = document.getElementById("segv2EstadoVacio");
    if (!box || !configActiva) return;

    const vacio = !configActiva.pasos.length;
    box.style.display = vacio ? "" : "none";

    if (vacio) {
      box.innerHTML =
        '<div class="segv2-empty-state">' +
        '<p class="segv2-empty-state-title">Aún no hay pasos</p>' +
        '<p class="segv2-empty-state-desc">Agrega tu primer bloque para iniciar el seguimiento</p>' +
        "</div>";
    }
  }

  function renderSelectorBloques() {
    const box = document.getElementById("segv2SelectorBloques");
    const btnAdd = document.getElementById("segv2AddBloque");
    if (!box || !configActiva) return;

    const sinPasos = !configActiva.pasos.length;
    const visible = sinPasos || mostrarSelectorBloques;

    box.style.display = visible ? "" : "none";
    if (btnAdd) btnAdd.style.display = sinPasos ? "none" : "";

    if (!visible) {
      box.innerHTML = "";
      return;
    }

    box.innerHTML = buildBloquesTipoHtml(null, { modoSelector: true });
    wireBloquesTipo(null, { modoSelector: true });
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

  function captionPasoLista(paso) {
    const contenido = String(paso.contenido || "").trim();
    if (contenido) {
      return esc(contenido.slice(0, 40) + (contenido.length > 40 ? "…" : ""));
    }
    return '<span class="segv2-muted">Sin texto</span>';
  }

  function eliminarPaso(index) {
    if (!configActiva || !configActiva.pasos[index]) return;
    syncPasoDesdeFormulario();
    const paso = configActiva.pasos[index];
    limpiarArchivoLocal(paso);
    configActiva.pasos.splice(index, 1);
    reasignarPasoIds(configActiva.pasos);

    if (!configActiva.pasos.length) {
      pasoActivoIndex = -1;
      mostrarSelectorBloques = true;
    } else {
      pasoActivoIndex = Math.min(index, configActiva.pasos.length - 1);
    }

    renderEstadoVacio();
    renderSelectorBloques();
    renderListaPasos();
    renderFormularioPaso();
    onPanelChange();
  }

  function renderListaPasos() {
    const lista = document.getElementById("segv2ListaPasos");
    const section = document.getElementById("segv2ListaSection");
    if (!lista || !configActiva) return;

    const tienePasos = configActiva.pasos.length > 0;
    if (section) section.style.display = tienePasos ? "" : "none";

    if (!tienePasos) {
      lista.innerHTML = "";
      return;
    }

    lista.innerHTML = configActiva.pasos
      .map(function (paso, index) {
        const activo = index === pasoActivoIndex ? " segv2-paso-card--active" : "";
        const erroresPaso = validarPaso(paso, index);
        const invalido = erroresPaso.length ? " segv2-paso-card--invalid" : "";
        const caption = captionPasoLista(paso);
        const puedeSubir = index > 0;
        const puedeBajar = index < configActiva.pasos.length - 1;
        const titulo =
          "Paso " +
          (index + 1) +
          " · " +
          labelTipo(paso.tipo) +
          " · " +
          formatearDelayCorto(paso.delay);

        return (
          '<div class="segv2-paso-card-wrap' +
          activo +
          invalido +
          '" data-index="' +
          index +
          '">' +
          '<div class="segv2-paso-card">' +
          '<div class="segv2-paso-card-head">' +
          '<span class="segv2-paso-card-title">' +
          esc(titulo) +
          "</span>" +
          '<span class="segv2-paso-card-caption">' +
          caption +
          "</span></div>" +
          '<div class="segv2-paso-card-actions">' +
          '<button type="button" class="segv2-paso-action" data-action="select" title="Editar">Editar</button>' +
          '<button type="button" class="segv2-paso-action" data-action="dup" title="Duplicar">Duplicar</button>' +
          '<button type="button" class="segv2-paso-action segv2-paso-action--danger" data-action="del" title="Eliminar">Eliminar</button>' +
          '<button type="button" class="segv2-icon-btn" data-action="up"' +
          (puedeSubir ? "" : " disabled") +
          ' title="Mover arriba" aria-label="Mover arriba">↑</button>' +
          '<button type="button" class="segv2-icon-btn" data-action="down"' +
          (puedeBajar ? "" : " disabled") +
          ' title="Mover abajo" aria-label="Mover abajo">↓</button>' +
          "</div></div></div>"
        );
      })
      .join("");

    lista.querySelectorAll(".segv2-paso-card-wrap").forEach(function (wrap) {
      const index = parseInt(wrap.getAttribute("data-index"), 10) || 0;

      wrap.querySelector('[data-action="select"]')?.addEventListener("click", function () {
        syncPasoDesdeFormulario();
        pasoActivoIndex = index;
        mostrarSelectorBloques = false;
        renderSelectorBloques();
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

      wrap.querySelector('[data-action="del"]')?.addEventListener("click", function (ev) {
        ev.stopPropagation();
        eliminarPaso(index);
      });
    });
  }

  function renderFormularioPaso() {
    const form = document.getElementById("segv2FormPaso");
    const section = document.getElementById("segv2EditorSection");
    if (!form || !configActiva) return;

    const paso = configActiva.pasos[pasoActivoIndex];
    if (!paso) {
      form.innerHTML = "";
      if (section) section.style.display = "none";
      renderVistaPreviaMensaje();
      return;
    }

    if (section) section.style.display = "";

    const unidadOpts = UNIDADES.map(function (u) {
      const sel = normalizarUnidad(paso.delay?.unidad) === u ? " selected" : "";
      const label = u.charAt(0).toUpperCase() + u.slice(1);
      return '<option value="' + u + '"' + sel + ">" + label + "</option>";
    }).join("");

    const tipoOpts = BLOQUES_TIPO.map(function (item) {
      const sel = normalizarTipo(paso.tipo) === item.id ? " selected" : "";
      return (
        '<option value="' +
        item.id +
        '"' +
        sel +
        ">" +
        item.icon +
        " " +
        esc(item.labelCorto) +
        "</option>"
      );
    }).join("");

    const total = configActiva.pasos.length;
    const tipoActual = normalizarTipo(paso.tipo);
    const esMedia = esTipoMedia(tipoActual);
    const erroresPaso = validarPaso(paso, pasoActivoIndex);

    const camposTexto = !esMedia
      ? '<div class="segv2-form-row segv2-campo-texto">' +
        "<label>Contenido</label>" +
        '<textarea id="segv2Mensaje" rows="4" placeholder="Texto del seguimiento…">' +
        esc(paso.contenido || "") +
        "</textarea></div>"
      : "";

    const camposMedia = esMedia ? buildCamposMediaHtml(paso, tipoActual) : "";

    form.innerHTML =
      '<div class="segv2-form">' +
      '<div class="segv2-form-head">' +
      "<h5>Editar paso " +
      (pasoActivoIndex + 1) +
      " de " +
      total +
      "</h5></div>" +
      '<div class="segv2-form-row">' +
      "<label>Tipo de bloque</label>" +
      '<select id="segv2TipoSelect" class="segv2-select">' +
      tipoOpts +
      "</select></div>" +
      '<div class="segv2-form-row segv2-form-row--delay">' +
      '<label>Tiempo de espera</label>' +
      '<div class="segv2-delay-inputs">' +
      '<input type="number" id="segv2DelayValor" min="1" step="1" value="' +
      esc(paso.delay?.valor ?? 5) +
      '" required>' +
      '<select id="segv2DelayUnidad" class="segv2-select" required>' +
      unidadOpts +
      "</select></div></div>" +
      camposTexto +
      camposMedia +
      (erroresPaso.length
        ? '<div class="segv2-paso-errores"><ul>' +
          erroresPaso
            .map(function (e) {
              return "<li>" + esc(e) + "</li>";
            })
            .join("") +
          "</ul></div>"
        : "") +
      '<button type="button" class="segv2-btn segv2-btn-danger" id="segv2EliminarPaso">Eliminar paso</button>' +
      "</div>";

    document.getElementById("segv2EliminarPaso")?.addEventListener("click", function () {
      eliminarPaso(pasoActivoIndex);
    });

    document.getElementById("segv2TipoSelect")?.addEventListener("change", function () {
      const nuevoTipo = normalizarTipo(this.value);
      const tipoAnterior = normalizarTipo(paso.tipo);
      syncPasoDesdeFormulario();
      if (nuevoTipo !== tipoAnterior) {
        limpiarArchivoLocal(paso);
        delete paso.media_url;
        delete paso.media_filename;
      }
      paso.tipo = nuevoTipo;
      renderFormularioPaso();
      onPanelChange();
    });

    document.getElementById("segv2ArchivoInput")?.addEventListener("change", onArchivoSeleccionado);

    [
      "segv2DelayValor",
      "segv2DelayUnidad",
      "segv2Mensaje",
      "segv2MediaUrl",
      "segv2Caption",
      "segv2MediaFilename",
    ].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", onPanelChange);
      el.addEventListener("change", onPanelChange);
    });

    renderArchivoLocalBox(paso);
    renderVistaPreviaMensaje();
    renderErroresValidacion();
  }

  function onPanelChange() {
    if (!nodoActivo) return;
    syncPasoDesdeFormulario();
    configActiva.cancelarSiResponde = !!document.getElementById("segv2CancelarSiResponde")?.checked;

    renderPreviewNodo(nodoActivo, buildConfigPreview(configActiva));
    renderEstadoVacio();
    renderSelectorBloques();
    renderListaPasos();
    renderDiagPanel();
    renderVistaPreviaMensaje();
    renderErroresValidacion();
    actualizarBotonGuardar();
  }

  function actualizarBotonGuardar() {
    const btn = document.getElementById("btnGuardarFlujo");
    if (!btn) return;
    if (!configActiva || !nodoActivo) {
      btn.disabled = false;
      btn.title = "";
      return;
    }
    const errores = validarConfig(configActiva);
    btn.disabled = errores.length > 0;
    btn.title = errores.length
      ? "Corrige los pasos inválidos antes de guardar"
      : "";
  }

  function renderPanel(nodo) {
    if (!nodo) return;

    nodoActivo = nodo;
    configActiva = leerConfigDeNodo(nodo);
    pasoActivoIndex = configActiva.pasos.length ? 0 : -1;
    mostrarSelectorBloques = !configActiva.pasos.length;

    const contenido = document.getElementById("panelNodoContenido");
    if (!contenido) return;

    contenido.innerHTML =
      '<div class="segv2-panel">' +
      '<header class="segv2-panel-header">' +
      "<h4>🔒 Seguimiento CRM V2</h4>" +
      '<span class="segv2-panel-badge">Seguro multi-número</span>' +
      '<p class="segv2-panel-desc">Envía mensajes programados sin mezclar líneas.</p>' +
      "</header>" +
      '<div id="segv2Errores" class="segv2-errores"></div>' +
      '<section class="segv2-section segv2-section--resumen">' +
      '<h5 class="segv2-section-title">Resumen</h5>' +
      '<div id="segv2DiagPanel" class="segv2-diag-panel"></div>' +
      '<label class="segv2-toggle">' +
      '<input type="checkbox" id="segv2CancelarSiResponde"' +
      (configActiva.cancelarSiResponde !== false ? " checked" : "") +
      "> Cancelar si responde</label>" +
      "</section>" +
      '<div id="segv2EstadoVacio" class="segv2-empty-state-wrap"></div>' +
      '<div id="segv2SelectorBloques" class="segv2-selector-bloques"></div>' +
      '<section id="segv2ListaSection" class="segv2-section segv2-section--pasos">' +
      '<h5 class="segv2-section-title">Pasos</h5>' +
      '<div id="segv2ListaPasos" class="segv2-pasos-list"></div>' +
      '<div class="segv2-panel-actions">' +
      '<button type="button" class="segv2-btn segv2-btn-ghost" id="segv2AddBloque">+ Agregar bloque</button>' +
      "</div></section>" +
      '<section id="segv2EditorSection" class="segv2-section segv2-section--editor">' +
      '<h5 class="segv2-section-title">Editor del paso</h5>' +
      '<div id="segv2FormPaso"></div>' +
      "</section>" +
      '<section id="segv2PreviewSection" class="segv2-section segv2-section--preview">' +
      '<h5 class="segv2-section-title">Vista previa</h5>' +
      '<div id="segv2VistaPrevia" class="segv2-preview"></div>' +
      "</section></div>";

    document.getElementById("segv2CancelarSiResponde")?.addEventListener("change", onPanelChange);

    document.getElementById("segv2AddBloque")?.addEventListener("click", function () {
      mostrarSelectorBloques = true;
      renderSelectorBloques();
    });

    renderDiagPanel();
    renderEstadoVacio();
    renderSelectorBloques();
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
      renderListaPasos();
      actualizarBotonGuardar();
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
    actualizarBotonGuardar();
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

    limpiarTodosArchivosLocales();
    nodoActivo = null;
    configActiva = null;
    pasoActivoIndex = -1;
    mostrarSelectorBloques = false;
    actualizarBotonGuardar();
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
