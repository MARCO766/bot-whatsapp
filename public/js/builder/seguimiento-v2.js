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
    { id: "texto", label: "Texto", labelCorto: "Texto", icon: "📝" },
    { id: "imagen", label: "Imagen", labelCorto: "Imagen", icon: "🖼", maxMb: 5 },
    { id: "video", label: "Video", labelCorto: "Video", icon: "🎥", maxMb: 15, recomendado: true },
    { id: "audio", label: "Audio", labelCorto: "Audio", icon: "🎵", maxMb: 5, recomendado: true },
    { id: "documento", label: "Archivo", labelCorto: "Archivo", icon: "📄", maxMb: 10 },
  ];
  const PRESETS_DELAY = [
    { key: "10s", label: "10 segundos", valor: 10, unidad: "segundos" },
    { key: "30s", label: "30 segundos", valor: 30, unidad: "segundos" },
    { key: "1m", label: "1 minuto", valor: 1, unidad: "minutos" },
    { key: "5m", label: "5 minutos", valor: 5, unidad: "minutos" },
    { key: "15m", label: "15 minutos", valor: 15, unidad: "minutos" },
    { key: "1h", label: "1 hora", valor: 1, unidad: "horas" },
  ];
  const NUMEROS_PASO = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  const TIPOS_PASO = BLOQUES_TIPO;
  const MEDIA_TYPE_MAP = {
    imagen: "image",
    audio: "audio",
    video: "video",
    documento: "document",
  };
  const UPLOAD_ENDPOINT = "/api/seguimiento-v2/upload-media";
  const STORAGE_STATUS_ENDPOINT = "/api/seguimiento-v2/storage-status";
  const UPLOAD_V2_HABILITADO = true;
  const EXT_BLOQUEADAS = [".exe", ".bat", ".cmd", ".js", ".sh"];

  let nodoActivo = null;
  let configActiva = null;
  let pasoActivoIndex = -1;
  let wizardAbierto = false;
  let storageStatus = null;
  let storageStatusFetched = false;
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

  function numeroPasoVisual(index) {
    return NUMEROS_PASO[index] || String(index + 1);
  }

  function lineaPasoLista(paso, index) {
    return (
      numeroPasoVisual(index) +
      " " +
      labelTipo(paso.tipo) +
      " · " +
      formatearDelayCorto(paso.delay)
    );
  }

  function presetDelayActivo(delay) {
    if (!delay) return null;
    const u = normalizarUnidad(delay.unidad);
    const v = parseInt(delay.valor, 10);
    return (
      PRESETS_DELAY.find(function (p) {
        return p.valor === v && p.unidad === u;
      }) || null
    );
  }

  function buildWizardHtml() {
    const cards = BLOQUES_TIPO.map(function (item) {
      return (
        '<button type="button" class="segv2-wizard-card" data-tipo="' +
        item.id +
        '">' +
        '<span class="segv2-wizard-icon" aria-hidden="true">' +
        item.icon +
        "</span>" +
        '<span class="segv2-wizard-label">' +
        esc(item.label) +
        "</span></button>"
      );
    }).join("");

    return (
      '<div class="segv2-wizard-overlay" id="segv2WizardOverlay">' +
      '<div class="segv2-wizard-sheet" role="dialog" aria-label="Elegir tipo de paso">' +
      '<button type="button" class="segv2-wizard-close" id="segv2WizardClose" aria-label="Cerrar">×</button>' +
      '<h5 class="segv2-wizard-title">¿Qué deseas enviar?</h5>' +
      '<div class="segv2-wizard-grid">' +
      cards +
      "</div></div></div>"
    );
  }

  function buildPresetsDelayHtml(paso) {
    const activo = presetDelayActivo(paso.delay);
    const esCustom = !activo;
    const unidadOpts = UNIDADES.map(function (u) {
      const sel = normalizarUnidad(paso.delay?.unidad) === u ? " selected" : "";
      const label = u.charAt(0).toUpperCase() + u.slice(1);
      return '<option value="' + u + '"' + sel + ">" + label + "</option>";
    }).join("");

    const presets = PRESETS_DELAY.map(function (p) {
      const sel = activo && activo.key === p.key ? " segv2-preset--active" : "";
      return (
        '<button type="button" class="segv2-preset' +
        sel +
        '" data-preset="' +
        p.key +
        '">' +
        esc(p.label) +
        "</button>"
      );
    }).join("");

    return (
      '<div class="segv2-form-row segv2-form-row--delay">' +
      "<label>Tiempo de espera</label>" +
      '<div class="segv2-delay-presets">' +
      presets +
      '<button type="button" class="segv2-preset' +
      (esCustom ? " segv2-preset--active" : "") +
      '" data-preset="custom">Personalizado</button></div>' +
      '<div class="segv2-delay-custom"' +
      (esCustom ? "" : ' style="display:none"') +
      ">" +
      '<div class="segv2-delay-inputs">' +
      '<input type="number" id="segv2DelayValor" min="1" step="1" value="' +
      esc(paso.delay?.valor ?? 5) +
      '" required>' +
      '<select id="segv2DelayUnidad" class="segv2-select" required>' +
      unidadOpts +
      "</select></div></div></div>"
    );
  }

  function esTipoMedia(tipo) {
    return normalizarTipo(tipo) !== "texto";
  }

  function crearPasoDesdeTipo(tipo, index) {
    return {
      pasoId: "paso_" + (index + 1),
      delay: { valor: 1, unidad: "minutos" },
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
    if (!n) return "";
    return n + " paso" + (n === 1 ? "" : "s");
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
    if (!pasos.length) return "";

    const maxVisibles = 3;
    const visibles = pasos.slice(0, maxVisibles);
    const restantes = pasos.length - visibles.length;

    let html = '<div class="segv2-timeline segv2-timeline--compact">';
    visibles.forEach(function (paso, index) {
      html +=
        '<p class="segv2-timeline-line">' +
        esc(lineaPasoLista(paso, index)) +
        "</p>";
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

  function buildCanvasBodyHtml(pasos) {
    if (!pasos.length) {
      return (
        '<div class="segv2-canvas-empty-wrap segv2-canvas-empty-wrap--compact">' +
        '<p class="segv2-canvas-empty">Sin configurar</p>' +
        "</div>"
      );
    }
    const resumen = resumenConfig({ pasos: pasos });
    return (
      (resumen ? '<p class="segv2-summary">' + esc(resumen) + "</p>" : "") +
      '<div class="segv2-body">' +
      buildTimelineHtml(pasos) +
      "</div>"
    );
  }

  function buildNodoInnerHtml(nodoId, config) {
    const cfg = parseConfigAlmacenada(config);
    const json = JSON.stringify(cfg).replace(/</g, "\\u003c");

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
      '<div class="segv2-badges-row">' +
      '<span class="segv2-badge">V2 Seguro</span>' +
      '<span class="segv2-badge segv2-badge--soft">Multi-número</span>' +
      "</div></div></div>" +
      '<div class="segv2-canvas-content">' +
      buildCanvasBodyHtml(cfg.pasos) +
      "</div></div>" +
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
    const canvasContent = nodo.querySelector(".segv2-canvas-content");
    if (canvasContent) {
      canvasContent.innerHTML = buildCanvasBodyHtml(cfg.pasos);
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
    const msgEl = document.getElementById("segv2Mensaje");
    const mediaUrlEl = document.getElementById("segv2MediaUrl");
    const captionEl = document.getElementById("segv2Caption");
    const filenameEl = document.getElementById("segv2MediaFilename");

    const valor = parseInt(valorEl?.value, 10);
    const tipo = normalizarTipo(paso.tipo || "texto");

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
      return { tipo: "uploading", texto: "Subiendo…" };
    }
    if (mediaUrl) {
      return { tipo: "ready", texto: "Archivo listo" };
    }
    if (local?.file && !local.sizeError) {
      return { tipo: "pending", texto: "Archivo seleccionado — pendiente de subir" };
    }
    return { tipo: "empty", texto: "" };
  }

  function debeMostrarStorageBanner(tipo, paso) {
    if (!esTipoMedia(tipo)) return false;
    const local = archivosLocales[claveArchivoLocal(paso)];
    return !!(local?.file || local?.uploading || local?.uploadError);
  }

  function fetchStorageStatusSiMedia(tipo, paso) {
    if (!debeMostrarStorageBanner(tipo, paso)) {
      renderStorageBanner(tipo, paso);
      return Promise.resolve(null);
    }
    if (storageStatusFetched && storageStatus) {
      renderStorageBanner(tipo, paso);
      return Promise.resolve(storageStatus);
    }
    return fetch(STORAGE_STATUS_ENDPOINT, { credentials: "same-origin" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        storageStatus = data;
        storageStatusFetched = true;
        renderStorageBanner(tipo, paso);
        return data;
      })
      .catch(function () {
        storageStatus = null;
        storageStatusFetched = true;
        renderStorageBanner(tipo, paso);
        return null;
      });
  }

  function renderStorageBanner(tipo, paso) {
    const box = document.getElementById("segv2StorageBanner");
    if (!box) return;

    if (!debeMostrarStorageBanner(tipo, paso)) {
      box.innerHTML = "";
      box.style.display = "none";
      return;
    }

    if (!storageStatus || (storageStatus.bucketExists && storageStatus.publicUrlReady)) {
      box.innerHTML = "";
      box.style.display = "none";
      return;
    }

    const msg =
      storageStatus.message ||
      "Bucket seguimiento-v2-media no encontrado. Créalo como público en Supabase Storage.";

    box.style.display = "";
    box.innerHTML = '<div class="segv2-storage-warn">' + esc(msg) + "</div>";
  }

  function renderArchivoLocalBox(paso) {
    const box = document.getElementById("segv2ArchivoLocal");
    const statusEl = document.getElementById("segv2UploadStatus");
    if (!box || !paso) return;

    const local = archivosLocales[claveArchivoLocal(paso)];
    const estado = estadoMediaPaso(paso);

    if (!local?.file) {
      box.innerHTML = "";
      if (statusEl) {
        statusEl.textContent = "";
        statusEl.className = "segv2-upload-status";
      }
      return;
    }

    if (local.sizeError) {
      box.innerHTML =
        '<div class="segv2-upload-error">' + esc(local.sizeError) + "</div>";
      if (statusEl) {
        statusEl.textContent = "Error";
        statusEl.className = "segv2-upload-status segv2-media-status--error";
      }
      return;
    }

    let statusClass = "segv2-media-status--neutral";
    let statusText = estado.texto || "";
    if (estado.tipo === "ready") {
      statusClass = "segv2-media-status--ready";
      statusText = estado.texto;
    } else if (estado.tipo === "uploading") {
      statusClass = "segv2-media-status--uploading";
      statusText = "Subiendo…";
    } else if (estado.tipo === "error") {
      statusClass = "segv2-media-status--error";
      statusText = estado.detalle || estado.texto;
    } else if (estado.tipo === "pending") {
      statusClass = "segv2-media-status--local";
      statusText = estado.texto;
    }

    box.innerHTML =
      '<div class="segv2-upload-fileinfo">' +
      "<strong>" +
      esc(local.nombre || "Archivo") +
      "</strong>" +
      "<span>" +
      formatearPeso(local.size) +
      "</span></div>";

    if (statusEl) {
      statusEl.textContent = statusText;
      statusEl.className =
        "segv2-upload-status " +
        statusClass +
        (estado.tipo === "uploading" ? " segv2-upload-status--uploading" : "");
    }
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
      renderStorageBanner(normalizarTipo(paso.tipo), paso);
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
    fetchStorageStatusSiMedia(tipo, paso);

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
          status.textContent = "Archivo listo";
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
        fetchStorageStatusSiMedia(tipo, paso);
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
      "<label>Subir archivo <span class=\"segv2-limit-badge\">" +
      esc(limite) +
      "</span></label>" +
      '<div class="segv2-upload-row">' +
      '<input type="file" id="segv2ArchivoInput" accept="' +
      esc(accept) +
      '" class="segv2-file-input-hidden">' +
      '<button type="button" class="segv2-btn segv2-btn-upload" id="segv2BtnSeleccionar">Seleccionar archivo</button>' +
      '<span id="segv2UploadStatus" class="segv2-upload-status"></span></div>' +
      '<div id="segv2ArchivoLocal" class="segv2-upload-info-box"></div>' +
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

  function abrirWizard() {
    wizardAbierto = true;
    renderWizard();
  }

  function cerrarWizard() {
    wizardAbierto = false;
    renderWizard();
  }

  function wireWizard() {
    document.getElementById("segv2WizardClose")?.addEventListener("click", cerrarWizard);
    document.getElementById("segv2WizardOverlay")?.addEventListener("click", function (ev) {
      if (ev.target?.id === "segv2WizardOverlay") cerrarWizard();
    });
    document.querySelectorAll(".segv2-wizard-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        agregarPasoDesdeTipo(normalizarTipo(btn.getAttribute("data-tipo")));
      });
    });
  }

  function renderWizard() {
    const host = document.getElementById("segv2WizardHost");
    if (!host) return;
    if (!wizardAbierto) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML = buildWizardHtml();
    wireWizard();
  }

  function agregarPasoDesdeTipo(tipo) {
    if (!configActiva) return;
    syncPasoDesdeFormulario();
    const nuevo = crearPasoDesdeTipo(tipo, configActiva.pasos.length);
    configActiva.pasos.push(nuevo);
    wizardAbierto = false;
    renderWizard();
    abrirEditorPaso(configActiva.pasos.length - 1);
    onPanelChange();
  }

  function wirePresetsDelay(paso) {
    document.querySelectorAll(".segv2-preset").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const key = btn.getAttribute("data-preset");
        const customBox = document.querySelector(".segv2-delay-custom");
        document.querySelectorAll(".segv2-preset").forEach(function (b) {
          b.classList.remove("segv2-preset--active");
        });
        btn.classList.add("segv2-preset--active");

        if (key === "custom") {
          if (customBox) customBox.style.display = "";
          return;
        }

        if (customBox) customBox.style.display = "none";
        const preset = PRESETS_DELAY.find(function (p) {
          return p.key === key;
        });
        if (preset) {
          paso.delay = { valor: preset.valor, unidad: preset.unidad };
          const valorEl = document.getElementById("segv2DelayValor");
          const unidadEl = document.getElementById("segv2DelayUnidad");
          if (valorEl) valorEl.value = String(preset.valor);
          if (unidadEl) unidadEl.value = preset.unidad;
        }
        onPanelChange();
      });
    });
  }

  function renderVistaPreviaMensaje() {
    const box = document.getElementById("segv2VistaPrevia");
    const wrap = document.getElementById("segv2PreviewWrap");
    if (!box || !configActiva) return;

    const paso = configActiva.pasos[pasoActivoIndex];
    if (!paso) {
      box.innerHTML = "";
      if (wrap) wrap.style.display = "none";
      return;
    }

    const tipo = normalizarTipo(paso.tipo);
    const texto = String(paso.contenido || "").trim();
    const local = archivosLocales[claveArchivoLocal(paso)];
    const mediaUrlGuardada = String(paso.media_url || "").trim();
    const mediaUrl =
      mediaUrlGuardada || (local?.blobUrl && !local.sizeError ? local.blobUrl : "");

    if (tipo === "texto" && !texto) {
      box.innerHTML = "";
      if (wrap) wrap.style.display = "none";
      return;
    }

    if (esTipoMedia(tipo) && !mediaUrl) {
      box.innerHTML = "";
      if (wrap) wrap.style.display = "none";
      return;
    }

    if (wrap) wrap.style.display = "";

    let burbuja = "";

    if (tipo === "texto") {
      burbuja =
        '<div class="segv2-wa-bubble">' +
        '<p class="segv2-preview-text">' +
        esc(texto).replace(/\n/g, "<br>") +
        "</p></div>";
    } else if (tipo === "imagen") {
      burbuja =
        '<div class="segv2-wa-bubble segv2-wa-bubble--media">' +
        '<img src="' +
        esc(mediaUrl) +
        '" alt="" class="segv2-preview-img" loading="lazy">' +
        (texto ? '<p class="segv2-preview-caption">' + esc(texto) + "</p>" : "") +
        "</div>";
    } else if (tipo === "video") {
      burbuja =
        '<div class="segv2-wa-bubble segv2-wa-bubble--media">' +
        '<video src="' +
        esc(mediaUrl) +
        '" controls muted playsinline class="segv2-preview-video"></video>' +
        (texto ? '<p class="segv2-preview-caption">' + esc(texto) + "</p>" : "") +
        "</div>";
    } else if (tipo === "audio") {
      burbuja =
        '<div class="segv2-wa-bubble segv2-wa-bubble--media">' +
        '<audio src="' +
        esc(mediaUrl) +
        '" controls class="segv2-preview-audio"></audio></div>';
    } else {
      const nombre = paso.media_filename || paso.filename || local?.nombre || "Archivo";
      const peso = local?.size ? formatearPeso(local.size) : "";
      burbuja =
        '<div class="segv2-wa-bubble segv2-wa-bubble--doc">' +
        '<span class="segv2-preview-icon" aria-hidden="true">📄</span>' +
        "<div><strong>" +
        esc(nombre) +
        "</strong>" +
        (peso ? '<p class="segv2-preview-doc-size">' + esc(peso) + "</p>" : "") +
        (texto ? '<p class="segv2-preview-caption">' + esc(texto) + "</p>" : "") +
        "</div></div>";
    }

    box.innerHTML =
      '<div class="segv2-wa-phone">' +
      '<div class="segv2-wa-chat">' +
      burbuja +
      "</div></div>";
  }

  function renderErroresValidacion() {
    const box = document.getElementById("segv2Errores");
    if (!box || !configActiva || pasoActivoIndex < 0) {
      if (box) {
        box.innerHTML = "";
        box.classList.remove("segv2-errores--visible");
      }
      return;
    }

    syncPasoDesdeFormulario();
    const errores = validarConfig(configActiva);

    if (!errores.length) {
      box.innerHTML = "";
      box.classList.remove("segv2-errores--visible");
      return;
    }

    box.classList.add("segv2-errores--visible");
    box.innerHTML =
      "<strong>Revisa este paso antes de guardar:</strong><ul>" +
      errores.map(function (e) {
        return "<li>" + esc(e) + "</li>";
      }).join("") +
      "</ul>";
  }

  function renderVistaLista() {
    const emptyWrap = document.getElementById("segv2EmptyWrap");
    const sectionHeading = document.getElementById("segv2SectionHeading");
    const listaSection = document.getElementById("segv2ListaSection");
    const btnAgregar = document.getElementById("segv2BtnAgregar");
    const toggleWrap = document.getElementById("segv2ToggleWrap");
    if (!configActiva) return;

    const vacio = !configActiva.pasos.length;
    const panelRoot = document.querySelector(".segv2-panel");
    if (panelRoot) panelRoot.classList.toggle("segv2-panel--idle", vacio);
    if (emptyWrap) emptyWrap.style.display = vacio ? "" : "none";
    if (sectionHeading) sectionHeading.style.display = vacio ? "none" : "";
    if (listaSection) {
      listaSection.classList.toggle("segv2-pasos-section--empty", vacio);
    }
    if (btnAgregar) {
      btnAgregar.textContent = vacio ? "+ Crear primer paso" : "+ Agregar paso";
      btnAgregar.classList.toggle("segv2-btn-primary--empty", vacio);
    }
    if (toggleWrap) toggleWrap.style.display = vacio ? "none" : "";
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
    abrirEditorPaso(index + 1);
    onPanelChange();
  }

  function eliminarPaso(index) {
    if (!configActiva || !configActiva.pasos[index]) return;
    syncPasoDesdeFormulario();
    const paso = configActiva.pasos[index];
    limpiarArchivoLocal(paso);
    configActiva.pasos.splice(index, 1);
    reasignarPasoIds(configActiva.pasos);

    const estabaEditando = pasoActivoIndex >= 0;

    if (!configActiva.pasos.length) {
      pasoActivoIndex = -1;
      wizardAbierto = false;
      renderStorageBanner(null, null);
      setVistaPanel("lista");
      renderVistaLista();
      renderWizard();
      renderListaPasos();
      renderFormularioPaso();
      onPanelChange();
      return;
    }

    if (pasoActivoIndex === index) {
      pasoActivoIndex = Math.min(index, configActiva.pasos.length - 1);
    } else if (pasoActivoIndex > index) {
      pasoActivoIndex -= 1;
    }

    if (estabaEditando) {
      abrirEditorPaso(pasoActivoIndex);
    } else {
      renderVistaLista();
      renderWizard();
      renderListaPasos();
      renderFormularioPaso();
    }
    onPanelChange();
  }

  function reordenarPaso(fromIndex, toIndex) {
    if (!configActiva || fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= configActiva.pasos.length || toIndex >= configActiva.pasos.length) return;

    syncPasoDesdeFormulario();
    const pasos = configActiva.pasos;
    const item = pasos.splice(fromIndex, 1)[0];
    pasos.splice(toIndex, 0, item);
    reasignarPasoIds(pasos);

    if (pasoActivoIndex === fromIndex) pasoActivoIndex = toIndex;
    else if (fromIndex < pasoActivoIndex && toIndex >= pasoActivoIndex) pasoActivoIndex -= 1;
    else if (fromIndex > pasoActivoIndex && toIndex <= pasoActivoIndex) pasoActivoIndex += 1;

    renderListaPasos();
    renderFormularioPaso();
    onPanelChange();
  }

  function wireDragDropLista() {
    const lista = document.getElementById("segv2ListaPasos");
    if (!lista) return;

    let dragIndex = null;

    lista.querySelectorAll(".segv2-paso-item").forEach(function (item) {
      item.addEventListener("dragstart", function (ev) {
        dragIndex = parseInt(item.getAttribute("data-index"), 10);
        item.classList.add("segv2-paso-item--dragging");
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "move";
          ev.dataTransfer.setData("text/plain", String(dragIndex));
        }
      });

      item.addEventListener("dragend", function () {
        item.classList.remove("segv2-paso-item--dragging");
        lista.querySelectorAll(".segv2-paso-item").forEach(function (el) {
          el.classList.remove("segv2-paso-item--over");
        });
        dragIndex = null;
      });

      item.addEventListener("dragover", function (ev) {
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        item.classList.add("segv2-paso-item--over");
      });

      item.addEventListener("dragleave", function () {
        item.classList.remove("segv2-paso-item--over");
      });

      item.addEventListener("drop", function (ev) {
        ev.preventDefault();
        item.classList.remove("segv2-paso-item--over");
        const from =
          dragIndex != null
            ? dragIndex
            : parseInt(ev.dataTransfer?.getData("text/plain"), 10);
        const to = parseInt(item.getAttribute("data-index"), 10);
        if (!isNaN(from) && !isNaN(to)) reordenarPaso(from, to);
      });
    });
  }

  function setVistaPanel(modo) {
    const listaSection = document.getElementById("segv2ListaSection");
    const editorSection = document.getElementById("segv2EditorSection");
    const errores = document.getElementById("segv2Errores");
    const toggleWrap = document.getElementById("segv2ToggleWrap");

    if (modo === "editar") {
      if (listaSection) listaSection.style.display = "none";
      if (editorSection) editorSection.style.display = "";
      if (toggleWrap) toggleWrap.style.display = "none";
    } else {
      if (listaSection) listaSection.style.display = "";
      if (editorSection) editorSection.style.display = "none";
      if (toggleWrap) toggleWrap.style.display = configActiva?.pasos?.length ? "" : "none";
      if (errores && modo === "lista") {
        errores.innerHTML = "";
        errores.classList.remove("segv2-errores--visible");
      }
    }
  }

  function abrirEditorPaso(index) {
    syncPasoDesdeFormulario();
    pasoActivoIndex = index;
    wizardAbierto = false;
    renderWizard();
    setVistaPanel("editar");
    renderListaPasos();
    renderFormularioPaso();
  }

  function renderListaPasos() {
    const lista = document.getElementById("segv2ListaPasos");
    if (!lista || !configActiva) return;

    if (!configActiva.pasos.length) {
      lista.innerHTML = "";
      renderVistaLista();
      return;
    }

    lista.innerHTML = configActiva.pasos
      .map(function (paso, index) {
        const activo = index === pasoActivoIndex ? " segv2-paso-item--active" : "";
        const erroresPaso = validarPaso(paso, index);
        const invalido = erroresPaso.length ? " segv2-paso-item--invalid" : "";

        return (
          '<div class="segv2-paso-item' +
          activo +
          invalido +
          '" data-index="' +
          index +
          '" draggable="true">' +
          '<span class="segv2-paso-drag" title="Arrastrar" aria-hidden="true">⠿</span>' +
          '<span class="segv2-paso-label">' +
          esc(lineaPasoLista(paso, index)) +
          "</span>" +
          '<div class="segv2-paso-actions">' +
          '<button type="button" class="segv2-paso-icon-btn" data-action="edit" title="Editar" aria-label="Editar">✏</button>' +
          '<button type="button" class="segv2-paso-icon-btn" data-action="dup" title="Duplicar" aria-label="Duplicar">⧉</button>' +
          '<button type="button" class="segv2-paso-icon-btn segv2-paso-icon-btn--danger" data-action="del" title="Eliminar" aria-label="Eliminar">🗑</button>' +
          "</div></div>"
        );
      })
      .join("");

    lista.querySelectorAll(".segv2-paso-item").forEach(function (wrap) {
      const index = parseInt(wrap.getAttribute("data-index"), 10) || 0;

      wrap.querySelector('[data-action="edit"]')?.addEventListener("click", function (ev) {
        ev.stopPropagation();
        abrirEditorPaso(index);
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

    wireDragDropLista();
    renderVistaLista();
  }

  function renderFormularioPaso() {
    const form = document.getElementById("segv2FormPaso");
    const section = document.getElementById("segv2EditorSection");
    if (!form || !configActiva) return;

    const paso = configActiva.pasos[pasoActivoIndex];
    if (!paso) {
      form.innerHTML = "";
      if (section) section.style.display = "none";
      renderStorageBanner(null, null);
      renderVistaPreviaMensaje();
      return;
    }

    if (section) section.style.display = "";

    const tipoActual = normalizarTipo(paso.tipo);
    const esMedia = esTipoMedia(tipoActual);
    const bloque = bloquePorTipo(tipoActual);
    const erroresPaso = validarPaso(paso, pasoActivoIndex);

    const camposTexto = !esMedia
      ? '<textarea id="segv2Mensaje" rows="4" placeholder="Escribe el mensaje…">' +
        esc(paso.contenido || "") +
        "</textarea>"
      : "";

    const camposMedia = esMedia ? buildCamposMediaHtml(paso, tipoActual) : "";

    form.innerHTML =
      '<div class="segv2-form">' +
      '<div class="segv2-form-head">' +
      "<h5>PASO " +
      (pasoActivoIndex + 1) +
      "</h5>" +
      '<button type="button" class="segv2-form-back" id="segv2CerrarEditor">← Volver</button></div>' +
      '<div class="segv2-tipo-badge">' +
      '<span class="segv2-tipo-badge-icon" aria-hidden="true">' +
      bloque.icon +
      "</span>" +
      "<span>Tipo: <strong>" +
      esc(bloque.label) +
      "</strong></span></div>" +
      buildPresetsDelayHtml(paso) +
      '<div class="segv2-form-row segv2-campo-contenido">' +
      "<label>Contenido</label>" +
      (esMedia ? camposMedia : camposTexto) +
      "</div>" +
      '<div id="segv2StorageBanner" class="segv2-storage-banner" style="display:none"></div>' +
      '<div id="segv2PreviewWrap" class="segv2-preview-wrap" style="display:none">' +
      '<div id="segv2VistaPrevia" class="segv2-preview"></div></div>' +
      (erroresPaso.length
        ? '<div class="segv2-paso-errores"><ul>' +
          erroresPaso
            .map(function (e) {
              return "<li>" + esc(e) + "</li>";
            })
            .join("") +
          "</ul></div>"
        : "") +
      "</div>";

    wirePresetsDelay(paso);

    document.getElementById("segv2CerrarEditor")?.addEventListener("click", function () {
      syncPasoDesdeFormulario();
      pasoActivoIndex = -1;
      renderStorageBanner(null, null);
      setVistaPanel("lista");
      renderListaPasos();
      renderFormularioPaso();
      onPanelChange();
    });

    document.getElementById("segv2BtnSeleccionar")?.addEventListener("click", function () {
      document.getElementById("segv2ArchivoInput")?.click();
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

    renderStorageBanner(tipoActual, paso);
    renderArchivoLocalBox(paso);
    renderVistaPreviaMensaje();
    renderErroresValidacion();
  }

  function onPanelChange() {
    if (!nodoActivo) return;
    syncPasoDesdeFormulario();
    configActiva.cancelarSiResponde = !!document.getElementById("segv2CancelarSiResponde")?.checked;

    renderPreviewNodo(nodoActivo, buildConfigPreview(configActiva));
    renderVistaLista();
    if (pasoActivoIndex >= 0) {
      renderListaPasos();
      renderVistaPreviaMensaje();
      renderErroresValidacion();
    }
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
    pasoActivoIndex = -1;
    wizardAbierto = false;
    storageStatus = null;
    storageStatusFetched = false;

    const contenido = document.getElementById("panelNodoContenido");
    if (!contenido) return;

    contenido.innerHTML =
      '<div class="segv2-panel segv2-panel--idle">' +
      '<section class="segv2-pasos-section segv2-pasos-section--empty" id="segv2ListaSection">' +
      '<div id="segv2EmptyWrap" class="segv2-panel-empty-compact">' +
      '<p class="segv2-panel-empty-title">🔒 Seguimiento CRM V2</p>' +
      '<p class="segv2-panel-empty-sub">Sin configurar</p>' +
      "</div>" +
      '<h5 class="segv2-section-heading" id="segv2SectionHeading" style="display:none">📋 Pasos del seguimiento</h5>' +
      '<div id="segv2ListaPasos" class="segv2-pasos-list"></div>' +
      '<button type="button" class="segv2-btn segv2-btn-primary segv2-btn-primary--empty" id="segv2BtnAgregar">+ Crear primer paso</button>' +
      "</section>" +
      '<div id="segv2WizardHost"></div>' +
      '<section id="segv2EditorSection" class="segv2-section segv2-section--editor" style="display:none">' +
      '<div id="segv2FormPaso"></div>' +
      "</section>" +
      '<div id="segv2Errores" class="segv2-errores"></div>' +
      '<label class="segv2-toggle-minimal" id="segv2ToggleWrap" style="display:none">' +
      '<input type="checkbox" id="segv2CancelarSiResponde"' +
      (configActiva.cancelarSiResponde !== false ? " checked" : "") +
      "> Cancelar si responde</label>" +
      "</div>";

    document.getElementById("segv2CancelarSiResponde")?.addEventListener("change", onPanelChange);

    document.getElementById("segv2BtnAgregar")?.addEventListener("click", function () {
      abrirWizard();
    });

    renderVistaLista();
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
    wizardAbierto = false;
    storageStatus = null;
    storageStatusFetched = false;
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
