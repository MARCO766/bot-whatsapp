/**
 * MacBot — Nodo cerebro: Remarketing Global 24h (Fase 1)
 * No avanza el flujo; configuración global del flujo.
 */
window.MacBotRemarketingGlobal = (function () {
  function crearConfigVacia() {
    return {
      version: 1,
      activo: false,
      tiempoInactividad: { valor: 23, unidad: "horas" },
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
    if (tipo === "documento" || tipo === "pdf" || tipo === "archivo") {
      return {
        tipo: "documento",
        url: String(item.url ?? ""),
        filename: String(item.filename ?? "archivo.pdf") || "archivo.pdf",
        caption: String(item.caption ?? ""),
      };
    }
    if (tipo === "retraso") {
      const cantidad = parseInt(item.cantidad, 10);
      return {
        tipo: "retraso",
        cantidad: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
        unidad: String(item.unidad || "minutos").toLowerCase(),
      };
    }
    return null;
  }

  function crearBloqueVacio(tipo) {
    let t = String(tipo || "texto").toLowerCase();
    if (t === "archivo") t = "documento";
    if (t === "texto") return { tipo: "texto", texto: "" };
    if (t === "imagen") return { tipo: "imagen", url: "", caption: "" };
    if (t === "audio") return { tipo: "audio", url: "" };
    if (t === "video") return { tipo: "video", url: "", caption: "" };
    if (t === "documento") {
      return { tipo: "documento", url: "", filename: "archivo.pdf", caption: "" };
    }
    if (t === "retraso") {
      return { tipo: "retraso", cantidad: 1, unidad: "minutos" };
    }
    return { tipo: "texto", texto: "" };
  }

  const RM24_TIPOS_PASO = [
    { tipo: "texto", icon: "💬", label: "Texto" },
    { tipo: "imagen", icon: "🖼", label: "Imagen" },
    { tipo: "video", icon: "🎥", label: "Video" },
    { tipo: "audio", icon: "🎧", label: "Audio" },
    { tipo: "documento", icon: "📄", label: "Archivo" },
    { tipo: "retraso", icon: "⏱", label: "Retraso", futuro: true },
  ];

  function htmlRm24AddPasoControl() {
    return (
      '<div class="rm24-add-paso-wrap rm24-add-paso-wrap--premium" id="rm24hAddPasoWrap">' +
      '<button type="button" class="rm24-add-paso-btn rm24-add-paso-btn--premium" id="rm24hAddPasoBtn" aria-expanded="false" aria-haspopup="menu">' +
      '<span class="rm24-add-paso-btn-icon" aria-hidden="true">＋</span>' +
      "<span>Agregar paso</span></button>" +
      '<div class="rm24-add-paso-menu rm24-add-paso-menu--premium" id="rm24hAddPasoMenu" role="menu" hidden>' +
      '<p class="rm24-add-paso-menu-title">Tipo de paso</p>' +
      RM24_TIPOS_PASO.map(function (c) {
        return (
          '<button type="button" class="rm24-add-paso-menu-item" role="menuitem" data-add-tipo="' +
          esc(c.tipo) +
          '">' +
          '<span class="rm24-add-paso-menu-icon" aria-hidden="true">' +
          c.icon +
          "</span>" +
          '<span class="rm24-add-paso-menu-label">' +
          esc(c.label) +
          "</span>" +
          (c.futuro
            ? '<span class="rm24-future-badge">visual / futuro</span>'
            : "") +
          "</button>"
        );
      }).join("") +
      "</div></div>"
    );
  }

  function toggleRm24AddPasoMenu(open) {
    const btn = document.getElementById("rm24hAddPasoBtn");
    const menu = document.getElementById("rm24hAddPasoMenu");
    if (!btn || !menu) return;
    const show = typeof open === "boolean" ? open : menu.hidden;
    menu.hidden = !show;
    btn.setAttribute("aria-expanded", show ? "true" : "false");
    btn.classList.toggle("rm24-add-paso-btn--open", show);
  }

  function resumenPasoFunnel(item) {
    if (!item) return "Vacío";
    if (item.tipo === "texto") {
      const t = String(item.texto || "").trim();
      if (!t) return "Sin texto";
      return t.length > 36 ? t.slice(0, 36) + "…" : t;
    }
    if (item.tipo === "retraso") {
      const n = parseInt(item.cantidad, 10) || 1;
      const u = String(item.unidad || "minutos");
      return n + " " + u + " (solo visual)";
    }
    const url = String(item.url || "").trim();
    if (url) {
      if (item.tipo === "documento") {
        return String(item.filename || "archivo").trim() || url.split("/").pop();
      }
      return url.split("/").pop() || "URL configurada";
    }
    return "Sin archivo";
  }

  function etiquetaRetrasoVisualBadge() {
    return '<span class="rm24-future-badge">visual / futuro</span>';
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
    if (m.tipo === "retraso") {
      const cantidad = parseInt(m.cantidad, 10);
      if (!cantidad || cantidad < 1) return null;
      const unidad = String(m.unidad || "minutos").toLowerCase();
      return {
        tipo: "retraso",
        cantidad: cantidad,
        unidad: ["segundos", "minutos", "horas"].includes(unidad) ? unidad : "minutos",
      };
    }
    return null;
  }

  function validarContenidoUi(item) {
    if (!item) return "Bloque vacío";
    if (item.tipo === "texto") {
      return item.texto ? null : "El texto no puede estar vacío";
    }
    if (item.tipo === "retraso") {
      const n = parseInt(item.cantidad, 10);
      if (!n || n < 1) return "Indica una cantidad mayor a 0";
      const u = String(item.unidad || "");
      if (!["segundos", "minutos", "horas"].includes(u)) {
        return "Unidad de retraso no válida";
      }
      return null;
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
      documento: "Archivo",
      retraso: "Retraso visual",
    };
    return map[tipo] || tipo;
  }

  function iconoTipoContenido(tipo) {
    const map = {
      texto: "💬",
      imagen: "🖼",
      audio: "🎧",
      video: "🎥",
      documento: "📄",
      retraso: "⏱",
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
  let rm24hSubidaEnCurso = false;
  let rm24hPasoSeleccionado = 0;
  let rm24hDragPasoIndex = null;

  const RM24H_MEDIA_CLIENT = {
    imagen: {
      maxBytes: 2 * 1024 * 1024,
      accept: "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
      label: "JPG, PNG o WEBP · máx 2 MB",
    },
    video: {
      maxBytes: 15 * 1024 * 1024,
      accept: "video/mp4,.mp4",
      label: "MP4 · máx 15 MB",
    },
    audio: {
      maxBytes: 5 * 1024 * 1024,
      accept: "audio/mpeg,audio/mp3,audio/ogg,audio/mp4,audio/x-m4a,.mp3,.ogg,.m4a",
      label: "MP3, OGG o M4A · máx 5 MB",
    },
    documento: {
      maxBytes: 8 * 1024 * 1024,
      accept:
        ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      label: "PDF, DOC o DOCX · máx 8 MB",
    },
  };

  const RM24_MEDIA_UPLOAD_UI = {
    imagen: {
      select: "🖼️ SELECCIONAR IMAGEN",
      change: "🖼️ CAMBIAR IMAGEN",
      hint: "MÁX 2MB (JPG/PNG/WEBP)",
    },
    video: {
      select: "🎬 SELECCIONAR VIDEO",
      change: "🎬 CAMBIAR VIDEO",
      hint: "MÁX 15MB (MP4)",
    },
    audio: {
      select: "🎵 SELECCIONAR AUDIO",
      change: "🎵 CAMBIAR AUDIO",
      hint: "MÁX 5MB (MP3/OGG/M4A)",
    },
    documento: {
      select: "📁 SELECCIONAR ARCHIVO",
      change: "📁 CAMBIAR ARCHIVO",
      hint: "MÁX 8MB (PDF/DOC/DOCX)",
    },
  };

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const PRESETS_TIEMPO_INACTIVIDAD = {
    minutos: [1, 5, 10, 15, 30],
    horas: [1, 2, 4, 8, 12, 23],
    dias: [1, 2, 3, 7],
  };

  function normalizarUnidadTiempoInactividad(unidad) {
    const s = String(unidad || "")
      .toLowerCase()
      .trim();
    if (s === "minuto" || s === "minutos" || s === "min") return "minutos";
    if (s === "hora" || s === "horas" || s === "h") return "horas";
    if (s === "dia" || s === "días" || s === "dias" || s === "day" || s === "days") {
      return "dias";
    }
    return null;
  }

  function normalizarTiempoInactividad(raw) {
    const fallback = { valor: 23, unidad: "horas" };
    if (!raw || typeof raw !== "object") return { ...fallback };

    const anidado = raw.tiempoInactividad;
    if (anidado && typeof anidado === "object") {
      const unidad = normalizarUnidadTiempoInactividad(anidado.unidad);
      const valor = parseInt(anidado.valor, 10);
      if (unidad && Number.isFinite(valor) && valor > 0) {
        return { valor: valor, unidad: unidad };
      }
    }

    if (raw.horasInactividad != null) {
      const valor = parseInt(raw.horasInactividad, 10);
      if (Number.isFinite(valor) && valor > 0) {
        return { valor: clampHorasInactividad(valor), unidad: "horas" };
      }
    }

    return { ...fallback };
  }

  function etiquetaTiempoInactividadResumen(tiempo) {
    const t = normalizarTiempoInactividad({ tiempoInactividad: tiempo });
    const v = t.valor;
    if (t.unidad === "minutos") return v + "min de inactividad";
    if (t.unidad === "horas") return v + "h de inactividad";
    if (t.unidad === "dias") {
      return v + (v === 1 ? " día" : " días") + " de inactividad";
    }
    return "23h de inactividad";
  }

  /** Etiqueta compacta para el embudo visual (ej. 5 min, 1 h, 2 días). */
  function etiquetaTiempoEmbudoCompacto(tiempo) {
    const t = normalizarTiempoInactividad({ tiempoInactividad: tiempo });
    const v = t.valor;
    if (t.unidad === "minutos") return v + " min";
    if (t.unidad === "horas") return v + " h";
    if (t.unidad === "dias") {
      return v + (v === 1 ? " día" : " días");
    }
    return "23 h";
  }

  function convertirTiempoAMinutos(valor, unidad) {
    const v = parseInt(valor, 10);
    if (!Number.isFinite(v) || v < 1) return 0;
    const u = String(unidad || "").toLowerCase();
    if (u === "segundos") return v / 60;
    if (u === "minutos") return v;
    if (u === "horas") return v * 60;
    if (u === "dias" || u === "días") return v * 24 * 60;
    return v;
  }

  function formatearTiempoTotalMinutos(totalMin) {
    if (!Number.isFinite(totalMin) || totalMin <= 0) return "0 min";
    if (totalMin < 1) return "menos de 1 min";
    if (totalMin < 60) return Math.round(totalMin) + " min";
    if (totalMin < 24 * 60) {
      const h = Math.floor(totalMin / 60);
      const m = Math.round(totalMin % 60);
      return m ? h + " h " + m + " min" : h + " h";
    }
    const d = Math.floor(totalMin / (24 * 60));
    const rest = totalMin - d * 24 * 60;
    const h = Math.floor(rest / 60);
    if (h) return d + " d " + h + " h";
    return d + (d === 1 ? " día" : " días");
  }

  function calcularTiempoTotalEmbudo(tiempo, contenidosRaw) {
    const t = normalizarTiempoInactividad({ tiempoInactividad: tiempo });
    let totalMin = convertirTiempoAMinutos(t.valor, t.unidad);
    (contenidosRaw || []).forEach(function (item) {
      const m = mapearItemContenidoUi(item);
      if (m && m.tipo === "retraso") {
        totalMin += convertirTiempoAMinutos(m.cantidad, m.unidad);
      }
    });
    return formatearTiempoTotalMinutos(totalMin);
  }

  function contarPasosEmbudo(contenidosRaw) {
    const n = (contenidosRaw || [])
      .map(function (item) {
        return mapearItemContenidoUi(item);
      })
      .filter(Boolean).length;
    return n + " paso" + (n === 1 ? "" : "s");
  }

  function obtenerContenidosParaEmbudo() {
    if (panelRemarketingAbierto()) {
      return leerContenidosDesdePanel();
    }
    return Array.isArray(configActiva.rm24h_contenidos) ? configActiva.rm24h_contenidos : [];
  }

  function resumenContenidoEmbudo(listaRaw) {
    const validos = (listaRaw || []).map(normalizarItemContenidoUi).filter(Boolean);
    if (!validos.length) {
      return {
        vacio: true,
        linea: "Sin contenido configurado",
        preview: "",
        chips: [],
      };
    }

    const primeroTexto = validos.find(function (c) {
      return c.tipo === "texto";
    });
    const preview = primeroTexto
      ? primeroTexto.texto.slice(0, 72) + (primeroTexto.texto.length > 72 ? "…" : "")
      : "";

    const conteo = {};
    validos.forEach(function (c) {
      const lbl = etiquetaTipoContenido(c.tipo);
      conteo[lbl] = (conteo[lbl] || 0) + 1;
    });
    const chips = Object.keys(conteo).map(function (lbl) {
      const n = conteo[lbl];
      return n + " " + lbl.toLowerCase() + (n > 1 ? "s" : "");
    });

    const linea =
      validos.length +
      " bloque" +
      (validos.length > 1 ? "s" : "") +
      (chips.length ? " · " + chips.join(", ") : "");

    return { vacio: false, linea: linea, preview: preview, chips: chips };
  }

  function htmlEmbudoRmSection() {
    return (
      '<section class="rm24-section rm24-section--embudo rm24-section--embudo-premium" id="rm24hEmbudoSection" aria-label="Embudo RM">' +
      '<div class="rm24-embudo-head">' +
      '<div class="rm24-embudo-head-title">' +
      '<span class="rm24-embudo-head-icon" aria-hidden="true">🔥</span>' +
      "<span>Embudo RM</span></div>" +
      '<div class="rm24-embudo-head-stats">' +
      '<span class="rm24-embudo-stat" id="rm24hEmbudoPasoCount">0 pasos</span>' +
      '<span class="rm24-embudo-stat rm24-embudo-stat--time" id="rm24hEmbudoTiempoTotal">Tiempo total: —</span>' +
      "</div></div>" +
      '<p class="rm24-embudo-intro">Selecciona un paso para editarlo · recorrido automático</p>' +
      '<div class="rm24-embudo rm24-embudo--premium" id="rm24hEmbudoRm" role="list"></div></section>'
    );
  }

  function htmlEmbudoConnector() {
    return (
      '<div class="rm24-embudo-connector rm24-embudo-connector--premium" aria-hidden="true">' +
      '<span class="rm24-embudo-connector-line"></span>' +
      '<span class="rm24-embudo-connector-arrow">▼</span></div>'
    );
  }

  function claseEmbudoNodeSelected(selected) {
    return selected ? " rm24-embudo-node--selected" : "";
  }

  function htmlEmbudoPasoWait(stepNum, tiempoLabel) {
    return (
      '<div class="rm24-embudo-step" role="listitem">' +
      '<div class="rm24-embudo-node rm24-embudo-node--wait">' +
      '<span class="rm24-embudo-badge" aria-hidden="true">' +
      stepNum +
      "</span>" +
      '<span class="rm24-embudo-icon" aria-hidden="true">⏱</span>' +
      '<div class="rm24-embudo-body">' +
      '<span class="rm24-embudo-label">Esperar inactividad</span>' +
      '<span class="rm24-embudo-value">' +
      esc(tiempoLabel) +
      "</span></div></div></div>"
    );
  }

  function htmlEmbudoPasoContenido(stepNum, item, contentIndex, selected) {
    const tipo = item?.tipo || "texto";
    const esRetraso = tipo === "retraso";
    const nodeClass = esRetraso
      ? "rm24-embudo-node rm24-embudo-node--delay rm24-embudo-node--clickable"
      : "rm24-embudo-node rm24-embudo-node--send rm24-embudo-node--clickable";
    const dragClass =
      rm24hDragPasoIndex === contentIndex ? " rm24-embudo-node--dragging" : "";
    return (
      '<div class="rm24-embudo-step" role="listitem">' +
      '<button type="button" class="' +
      nodeClass +
      claseEmbudoNodeSelected(selected) +
      dragClass +
      '" data-rm24-embudo-index="' +
      contentIndex +
      '" draggable="true" title="Editar paso ' +
      (contentIndex + 1) +
      '">' +
      '<span class="rm24-embudo-badge" aria-hidden="true">' +
      stepNum +
      "</span>" +
      '<span class="rm24-embudo-icon" aria-hidden="true">' +
      iconoTipoContenido(tipo) +
      "</span>" +
      '<div class="rm24-embudo-body">' +
      '<span class="rm24-embudo-label">' +
      esc(etiquetaTipoContenido(tipo)) +
      (esRetraso ? " " + etiquetaRetrasoVisualBadge() : "") +
      "</span>" +
      '<span class="rm24-embudo-value' +
      (resumenPasoFunnel(item) === "Vacío" ? " rm24-embudo-value--muted" : "") +
      '">' +
      esc(resumenPasoFunnel(item)) +
      "</span></div></button></div>"
    );
  }

  function htmlEmbudoPasoVacio(stepNum) {
    return (
      '<div class="rm24-embudo-step" role="listitem">' +
      '<div class="rm24-embudo-node rm24-embudo-node--send">' +
      '<span class="rm24-embudo-badge" aria-hidden="true">' +
      stepNum +
      "</span>" +
      '<span class="rm24-embudo-icon" aria-hidden="true">💬</span>' +
      '<div class="rm24-embudo-body">' +
      '<span class="rm24-embudo-label">Enviar contenido</span>' +
      '<span class="rm24-embudo-value rm24-embudo-value--muted">Sin contenido configurado</span>' +
      "</div></div></div>"
    );
  }

  function htmlEmbudoPasoFin(stepNum) {
    return (
      '<div class="rm24-embudo-step" role="listitem">' +
      '<div class="rm24-embudo-node rm24-embudo-node--end">' +
      '<span class="rm24-embudo-badge" aria-hidden="true">' +
      stepNum +
      "</span>" +
      '<span class="rm24-embudo-icon" aria-hidden="true">✅</span>' +
      '<div class="rm24-embudo-body">' +
      '<span class="rm24-embudo-label">Fin automático</span>' +
      '<span class="rm24-embudo-value rm24-embudo-value--wrap">' +
      "Después de enviar remarketing, el flujo se cierra como " +
      '<code class="rm24-embudo-code">cerrado_sin_respuesta</code>' +
      "</span></div></div></div>"
    );
  }

  function renderEmbudoRmStepsHtml(contenidosRaw, tiempo, pasoSeleccionado) {
    const items = (contenidosRaw || [])
      .map(function (item) {
        return mapearItemContenidoUi(item);
      })
      .filter(Boolean);
    const tiempoLabel = etiquetaTiempoEmbudoCompacto(tiempo);
    let html = htmlEmbudoPasoWait(1, tiempoLabel);
    let stepNum = 2;

    if (!items.length) {
      html += htmlEmbudoConnector() + htmlEmbudoPasoVacio(stepNum++);
    } else {
      items.forEach(function (item, i) {
        html +=
          htmlEmbudoConnector() +
          htmlEmbudoPasoContenido(stepNum++, item, i, i === pasoSeleccionado);
      });
    }

    html += htmlEmbudoConnector() + htmlEmbudoPasoFin(stepNum);
    return html;
  }

  function actualizarEmbudoRmPanel() {
    const embudo = document.getElementById("rm24hEmbudoRm");
    if (!embudo) return;

    const activo = !!document.getElementById("rm24hActivo")?.checked;
    const section = document.getElementById("rm24hEmbudoSection");
    if (section) {
      section.classList.toggle("rm24-section--embudo-inactivo", !activo);
    }
    embudo.classList.toggle("rm24-embudo--inactivo", !activo);

    const tiempo = panelRemarketingAbierto()
      ? leerTiempoDesdePanel()
      : configActiva.tiempoInactividad || { valor: 23, unidad: "horas" };

    const contenidos = obtenerContenidosParaEmbudo();
    const pasoCountEl = document.getElementById("rm24hEmbudoPasoCount");
    const tiempoTotalEl = document.getElementById("rm24hEmbudoTiempoTotal");
    if (pasoCountEl) pasoCountEl.textContent = contarPasosEmbudo(contenidos);
    if (tiempoTotalEl) {
      tiempoTotalEl.textContent =
        "Tiempo total: " + calcularTiempoTotalEmbudo(tiempo, contenidos);
    }

    clampPasoSeleccionado(
      (contenidos || [])
        .map(function (item) {
          return mapearItemContenidoUi(item);
        })
        .filter(Boolean).length
    );
    embudo.innerHTML = renderEmbudoRmStepsHtml(
      contenidos,
      tiempo,
      rm24hPasoSeleccionado
    );
  }

  function htmlPresetsTiempoInactividad(unidad, valorActivo) {
    const presets = PRESETS_TIEMPO_INACTIVIDAD[unidad] || PRESETS_TIEMPO_INACTIVIDAD.horas;
    return (
      '<div class="rm24-tiempo-presets" id="rm24hTiempoPresets" role="group" aria-label="Valores recomendados">' +
      presets
        .map(function (n) {
          const active = Number(valorActivo) === n ? " rm24-tiempo-preset-btn--active" : "";
          return (
            '<button type="button" class="rm24-tiempo-preset-btn' +
            active +
            '" data-rm24-preset-valor="' +
            n +
            '">' +
            esc(String(n)) +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function sincronizarHorasLegacyDesdeTiempo(config) {
    const tiempo = normalizarTiempoInactividad(config);
    config.tiempoInactividad = tiempo;
    if (tiempo.unidad === "horas") {
      config.horasInactividad = clampHorasInactividad(tiempo.valor);
    } else if (!Number.isFinite(parseInt(config.horasInactividad, 10))) {
      config.horasInactividad = 23;
    }
    return config;
  }

  function clampHorasInactividad(val) {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n)) return 23;
    if (n < 1) return 1;
    if (n > 23) return 23;
    return n;
  }

  function normalizarInputTiempoValor(inputEl, unidad) {
    if (!inputEl) return 23;
    const raw = String(inputEl.value || "").replace(/\D/g, "");
    let valor = raw === "" ? NaN : parseInt(raw, 10);
    if (!Number.isFinite(valor) || valor < 1) {
      const presets = PRESETS_TIEMPO_INACTIVIDAD[unidad] || PRESETS_TIEMPO_INACTIVIDAD.horas;
      valor = presets[0] || 23;
    }
    inputEl.value = String(valor);
    return valor;
  }

  function leerTiempoDesdePanel() {
    const unidad =
      normalizarUnidadTiempoInactividad(
        document.getElementById("rm24hTiempoUnidad")?.value
      ) || "horas";
    const valorEl = document.getElementById("rm24hTiempoValor");
    const valor = normalizarInputTiempoValor(valorEl, unidad);
    return normalizarTiempoInactividad({
      tiempoInactividad: { valor: valor, unidad: unidad },
    });
  }

  function renderPresetsTiempoPanel(tiempo) {
    const t = normalizarTiempoInactividad({ tiempoInactividad: tiempo });
    const mount = document.getElementById("rm24hTiempoPresets");
    if (!mount) return;
    mount.outerHTML = htmlPresetsTiempoInactividad(t.unidad, t.valor);
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
      detenerSiResponde: false,
      reiniciarAlResponder: parsed.reiniciarAlResponder !== false,
      detenerEnConversion: parsed.detenerEnConversion !== false,
      rm24h_contenidos: normalizarContenidosLista(
        parsed.rm24h_contenidos,
        parsed.mensajeRemarketing || parsed.mensaje_remarketing
      ),
    });
    sincronizarHorasLegacyDesdeTiempo(config);

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

    nodo.classList.add("rm24-global-node");
    nodo.classList.toggle("rm24-global-node-active", !!config.activo);

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
      documento: "Archivo",
      retraso: "Retraso visual",
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
        '<div class="rm24-preview-chips rm24-global-content-chips">' +
        chips
          .map(function (lbl) {
            return (
              '<span class="rm24-preview-chip rm24-global-content-chip">' +
              esc(lbl) +
              "</span>"
            );
          })
          .join("") +
        "</div>";
    }
    if (!previewHtml) {
      previewHtml =
        '<p class="rm24h-preview rm24-node-msg-preview">Sin contenido configurado</p>';
    }

    body.innerHTML =
      '<div class="rm24-status rm24-global-status rm24h-badge-on">ACTIVO</div>' +
      '<ul class="rm24-summary rm24-summary--compact" aria-label="Resumen del remarketing">' +
      '<li><span class="rm24-summary-dot"></span>' +
      esc(etiquetaTiempoInactividadResumen(config.tiempoInactividad)) +
      "</li>" +
      '<li><span class="rm24-summary-dot"></span>Reinicia si responde</li>' +
      '<li><span class="rm24-summary-dot"></span>1 solo envío</li>' +
      '<li><span class="rm24-summary-dot"></span>Termina flujo</li>' +
      "</ul>" +
      previewHtml;
  }

  function ensureDecoracionGlobalNodo(nodo) {
    if (!nodo.querySelector(".rm24-global-halo")) {
      const halo = document.createElement("div");
      halo.className = "rm24-global-halo";
      halo.setAttribute("aria-hidden", "true");
      nodo.insertBefore(halo, nodo.firstChild);
    }
    if (!nodo.querySelector(".rm24-global-orbit")) {
      const orbit = document.createElement("div");
      orbit.className = "rm24-global-orbit";
      orbit.setAttribute("aria-hidden", "true");
      const halo = nodo.querySelector(".rm24-global-halo");
      if (halo && halo.nextSibling) {
        nodo.insertBefore(orbit, halo.nextSibling);
      } else {
        nodo.insertBefore(orbit, nodo.firstChild);
      }
    }
    if (!nodo.querySelector(".rm24-global-badges")) {
      const badges = document.createElement("div");
      badges.className = "rm24-global-badges";
      badges.setAttribute("aria-label", "Tipo de nodo global");
      badges.innerHTML =
        '<span class="rm24-global-badge">GLOBAL</span>' +
        '<span class="rm24-global-badge rm24-global-badge--watchdog">WATCHDOG</span>' +
        '<span class="rm24-global-badge rm24-global-badge--type rm24h-chip">RM24H</span>';
      const header = nodo.querySelector(".rm24h-header, .rm24-node-header");
      if (header) {
        nodo.insertBefore(badges, header);
      } else {
        const body = nodo.querySelector(".rm24h-body, .rm24-node-body");
        if (body) nodo.insertBefore(badges, body);
        else nodo.appendChild(badges);
      }
    }
    if (!nodo.querySelector(".rm24-global-taglines")) {
      const taglines = document.createElement("div");
      taglines.className = "rm24-global-taglines";
      taglines.innerHTML =
        '<p class="rm24-global-tagline">Cerebro global del flujo</p>' +
        '<p class="rm24-global-tagline rm24-global-tagline--sub">No mueve leads entre nodos</p>';
      const header = nodo.querySelector(".rm24h-header, .rm24-node-header");
      if (header) {
        header.insertAdjacentElement("afterend", taglines);
      } else {
        const badges = nodo.querySelector(".rm24-global-badges");
        if (badges) badges.insertAdjacentElement("afterend", taglines);
        else nodo.appendChild(taglines);
      }
    }
  }

  function aplicarShellVisualNodo(nodo) {
    if (!esNodoRemarketingGlobal(nodo)) return;
    nodo.classList.add("rm24-node", "rm24-global-node");
    ensureDecoracionGlobalNodo(nodo);

    const chip =
      nodo.querySelector(".rm24-global-badges .rm24h-chip") ||
      nodo.querySelector(".rm24h-chip");
    if (chip) {
      chip.textContent = "RM24H";
      chip.classList.add(
        "rm24-badge",
        "rm24-badge--type",
        "rm24-badge--pill",
        "rm24-global-badge",
        "rm24-global-badge--type"
      );
    }
    const chipDuplicadoTitulo = nodo.querySelector(
      ".rm24-node-title-row .rm24h-chip, .rm24-node-title-row .rm24-badge"
    );
    if (chipDuplicadoTitulo && nodo.querySelector(".rm24-global-badges")) {
      chipDuplicadoTitulo.remove();
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

  function syncEditorPasoToContenidos() {
    const editor = document.getElementById("rm24hStepEditor");
    if (!editor) return;
    const card = editor.querySelector(".rm24-contenido-item");
    if (!card) return;
    const index = parseInt(card.dataset.index, 10);
    if (!Number.isFinite(index) || index < 0) return;
    const lista = Array.isArray(configActiva.rm24h_contenidos)
      ? configActiva.rm24h_contenidos.slice()
      : [];
    if (index >= lista.length) return;

    const tipo = card.dataset.tipo;
    const item = Object.assign({}, lista[index] || crearBloqueVacio(tipo));
    if (tipo === "texto") {
      item.tipo = "texto";
      item.texto = String(card.querySelector(".rm24-contenido-texto")?.value ?? "");
    } else if (tipo === "retraso") {
      const cantidad = parseInt(card.querySelector(".rm24-contenido-cantidad")?.value, 10);
      item.tipo = "retraso";
      item.cantidad = Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1;
      item.unidad = String(card.querySelector(".rm24-contenido-unidad")?.value || "minutos");
    } else {
      item.tipo = tipo;
      item.url = String(card.querySelector(".rm24-contenido-url")?.value ?? "");
      item.caption = String(card.querySelector(".rm24-contenido-caption")?.value ?? "");
      if (tipo === "documento") {
        item.filename = String(card.querySelector(".rm24-contenido-filename")?.value ?? "archivo.pdf");
      }
    }
    lista[index] = item;
    configActiva.rm24h_contenidos = lista;
  }

  function leerContenidosDesdePanel() {
    syncEditorPasoToContenidos();
    return Array.isArray(configActiva.rm24h_contenidos)
      ? configActiva.rm24h_contenidos.slice()
      : [];
  }

  function clampPasoSeleccionado(total) {
    if (!total || total < 1) {
      rm24hPasoSeleccionado = 0;
      return;
    }
    if (rm24hPasoSeleccionado < 0) rm24hPasoSeleccionado = 0;
    if (rm24hPasoSeleccionado >= total) rm24hPasoSeleccionado = total - 1;
  }

  function selectRm24Paso(index) {
    syncEditorPasoToContenidos();
    const total = getRm24ContenidosActivos().length;
    if (!total) {
      rm24hPasoSeleccionado = 0;
      renderRm24ContentBlocks();
      return;
    }
    rm24hPasoSeleccionado = Math.max(0, Math.min(index, total - 1));
    renderRm24ContentBlocks();
    requestAnimationFrame(function () {
      document
        .getElementById("rm24hStepEditor")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function getRm24ContenidosActivos() {
    if (!Array.isArray(configActiva.rm24h_contenidos)) {
      configActiva.rm24h_contenidos = [];
    }
    return configActiva.rm24h_contenidos;
  }

  function addRm24ContentBlock(tipo) {
    const t = String(tipo || "texto").toLowerCase();
    const tipoNorm = t === "archivo" ? "documento" : t;
    toggleRm24AddPasoMenu(false);
    const lista = leerContenidosDesdePanel();
    lista.push(crearBloqueVacio(tipoNorm));
    configActiva.rm24h_contenidos = lista;
    rm24hPasoSeleccionado = lista.length - 1;
    renderRm24ContentBlocks();
    mostrarErrorContenidos("");
    persistirContenidosEnNodo();
    if (RM24H_MEDIA_CLIENT[tipoNorm]) {
      requestAnimationFrame(function () {
        const input = document
          .getElementById("rm24hStepEditor")
          ?.querySelector(".rm24-contenido-file");
        input?.click();
      });
    }
  }

  function removeRm24ContentBlock(index) {
    const lista = leerContenidosDesdePanel();
    if (index < 0 || index >= lista.length) return;
    lista.splice(index, 1);
    configActiva.rm24h_contenidos = lista;
    clampPasoSeleccionado(lista.length);
    renderRm24ContentBlocks();
    persistirContenidosEnNodo();
  }

  function moveRm24ContentBlock(index, delta) {
    const lista = leerContenidosDesdePanel();
    const next = index + delta;
    if (index < 0 || index >= lista.length || next < 0 || next >= lista.length) return;
    const tmp = lista[index];
    lista[index] = lista[next];
    lista[next] = tmp;
    configActiva.rm24h_contenidos = lista;
    if (rm24hPasoSeleccionado === index) {
      rm24hPasoSeleccionado = next;
    } else if (rm24hPasoSeleccionado === next) {
      rm24hPasoSeleccionado = index;
    }
    renderRm24ContentBlocks();
    persistirContenidosEnNodo();
  }

  function reorderRm24ContentBlock(fromIndex, toIndex) {
    const lista = leerContenidosDesdePanel();
    if (
      fromIndex < 0 ||
      fromIndex >= lista.length ||
      toIndex < 0 ||
      toIndex >= lista.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const selectedId = rm24hPasoSeleccionado;
    const item = lista.splice(fromIndex, 1)[0];
    lista.splice(toIndex, 0, item);
    configActiva.rm24h_contenidos = lista;
    if (selectedId === fromIndex) {
      rm24hPasoSeleccionado = toIndex;
    } else if (fromIndex < selectedId && toIndex >= selectedId) {
      rm24hPasoSeleccionado = selectedId - 1;
    } else if (fromIndex > selectedId && toIndex <= selectedId) {
      rm24hPasoSeleccionado = selectedId + 1;
    }
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
    actualizarEmbudoRmPanel();
  }

  function validarArchivoRm24hCliente(file, tipo) {
    const reglas = RM24H_MEDIA_CLIENT[tipo];
    if (!reglas || !file) return "Archivo no válido";
    if (file.size > reglas.maxBytes) {
      const mb = Math.round(reglas.maxBytes / (1024 * 1024));
      return "El archivo supera el máximo de " + mb + " MB";
    }
    const name = (file.name || "").toLowerCase();
    if (tipo === "imagen" && !/\.(jpe?g|png|webp)$/.test(name)) {
      return "Imagen: solo JPG, PNG o WEBP";
    }
    if (tipo === "video" && !/\.mp4$/.test(name)) return "Video: solo MP4";
    if (tipo === "audio" && !/\.(mp3|ogg|m4a)$/.test(name)) {
      return "Audio: solo MP3, OGG o M4A";
    }
    if (tipo === "documento" && !/\.(pdf|doc|docx)$/.test(name)) {
      return "Archivo: solo PDF, DOC o DOCX";
    }
    return null;
  }

  function setProgresoSubidaRm24h(card, pct, texto) {
    if (!card) return;
    const wrap = card.querySelector(".rm24-upload-progress");
    const fill = card.querySelector(".rm24-upload-progress-fill");
    const label = card.querySelector(".rm24-upload-progress-text");
    if (!wrap) return;
    wrap.hidden = false;
    const n = Math.max(0, Math.min(100, Math.round(pct)));
    if (fill) fill.style.width = n + "%";
    if (label) label.textContent = texto || n + "%";
  }

  function ocultarProgresoSubidaRm24h(card) {
    const wrap = card?.querySelector(".rm24-upload-progress");
    if (wrap) wrap.hidden = true;
  }

  const RM24H_BUCKET = "rm24h-media";

  function getRm24hSupabaseClient() {
    const cfg = window.MACBOT_BUILDER || {};
    const url = String(cfg.supabaseUrl || "").trim();
    const key = String(cfg.supabaseAnonKey || "").trim();
    if (!url || !key) {
      return {
        client: null,
        error:
          "Supabase no configurado: añade SUPABASE_ANON_KEY en .env (clave anon/public, no service_role)",
      };
    }
    const lib = window.supabase;
    if (!lib || typeof lib.createClient !== "function") {
      return { client: null, error: "Biblioteca @supabase/supabase-js no cargada" };
    }
    if (!window.__rm24hSupabaseClient) {
      window.__rm24hSupabaseClient = lib.createClient(url, key);
    }
    return { client: window.__rm24hSupabaseClient, error: null };
  }

  function mensajeErrorRm24hUpload(err) {
    if (!err) return "Error desconocido al subir";
    if (typeof err === "string") return err;
    return (
      err.message ||
      err.error_description ||
      err.error ||
      (err.statusCode ? String(err.statusCode) : "") ||
      "Error al subir"
    );
  }

  function nombreArchivoRm24hSeguro(name) {
    return String(name || "archivo").replace(/[^a-zA-Z0-9._-]+/g, "-");
  }

  async function verificarBucketRm24hMedia(client) {
    const { error } = await client.storage.from(RM24H_BUCKET).list("rm24h", { limit: 1 });
    if (!error) return null;
    const msg = mensajeErrorRm24hUpload(error);
    if (/bucket not found|does not exist|no existe|not found/i.test(msg)) {
      return "Bucket rm24h-media no existe";
    }
    if (/policy|denied|permission|unauthorized|403|401/i.test(msg)) {
      return msg;
    }
    return null;
  }

  async function subirArchivoRm24hEnBloque(card, file) {
    if (!card || !file || rm24hSubidaEnCurso) return;
    const tipo = card.dataset.tipo;
    if (!RM24H_MEDIA_CLIENT[tipo]) return;

    const errVal = validarArchivoRm24hCliente(file, tipo);
    if (errVal) {
      mostrarErrorContenidos(errVal);
      return;
    }

    const { client, error: clientErr } = getRm24hSupabaseClient();
    if (!client) {
      mostrarErrorContenidos(clientErr);
      return;
    }

    rm24hSubidaEnCurso = true;
    mostrarErrorContenidos("");
    setProgresoSubidaRm24h(card, 5, "Verificando bucket…");

    try {
      const bucketErr = await verificarBucketRm24hMedia(client);
      if (bucketErr) {
        mostrarErrorContenidos(bucketErr);
        return;
      }

      const bucketName = RM24H_BUCKET;
      const uploadPath =
        "rm24h/test-" + Date.now() + "-" + nombreArchivoRm24hSeguro(file.name);

      console.log("[RM24H_UPLOAD] file:", file);
      console.log("[RM24H_UPLOAD] bucket:", bucketName);
      console.log("[RM24H_UPLOAD] path:", uploadPath);

      setProgresoSubidaRm24h(card, 25, "Subiendo…");

      const { data: uploadData, error: uploadError } = await client.storage
        .from(bucketName)
        .upload(uploadPath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (uploadError) {
        throw uploadError;
      }

      console.log("[RM24H_UPLOAD] result:", uploadData);

      const { data: pubData } = client.storage.from(bucketName).getPublicUrl(uploadPath);
      const publicUrl = pubData?.publicUrl || "";
      if (!publicUrl) {
        throw new Error("No se obtuvo URL pública del archivo");
      }

      setProgresoSubidaRm24h(card, 100, "Listo");

      const urlInput = card.querySelector(".rm24-contenido-url");
      if (urlInput) urlInput.value = publicUrl;
      if (tipo === "documento") {
        const fn = card.querySelector(".rm24-contenido-filename");
        if (fn) fn.value = file.name || "archivo.pdf";
      }

      configActiva.rm24h_contenidos = leerContenidosDesdePanel();
      renderRm24ContentBlocks();
      persistirContenidosEnNodo();
    } catch (error) {
      console.error("[RM24H_UPLOAD] error:", error);
      mostrarErrorContenidos(mensajeErrorRm24hUpload(error));
    } finally {
      rm24hSubidaEnCurso = false;
      ocultarProgresoSubidaRm24h(card);
    }
  }

  function htmlCamposMedia(item, index, tipo) {
    const reglas = RM24H_MEDIA_CLIENT[tipo];
    const ui = RM24_MEDIA_UPLOAD_UI[tipo];
    const url = String(item.url || "").trim();
    const manualOpen = item._manualUrl || (!url && false);
    const btnLabel = url ? ui.change : ui.select;

    let html =
      '<div class="rm24-media-upload">' +
      '<input type="file" class="rm24-contenido-file" accept="' +
      esc(reglas.accept) +
      '" hidden>' +
      '<button type="button" class="rm24-upload-btn" data-rm24-pick-file="' +
      index +
      '">' +
      esc(btnLabel) +
      "</button>" +
      '<p class="rm24-upload-hint">' +
      esc(ui.hint) +
      "</p>" +
      '<div class="rm24-upload-progress" hidden>' +
      '<div class="rm24-upload-progress-bar"><span class="rm24-upload-progress-fill"></span></div>' +
      '<span class="rm24-upload-progress-text">0%</span></div>' +
      '<button type="button" class="rm24-link-manual" data-rm24-toggle-manual="' +
      index +
      '">Pegar URL pública manualmente</button>' +
      '<div class="rm24-manual-url' +
      (manualOpen ? " rm24-manual-url--open" : "") +
      '">' +
      '<input type="url" class="rm24-input rm24-contenido-url" placeholder="https://... URL pública HTTPS" value="' +
      esc(url) +
      '"></div>';

    if (tipo === "imagen" || tipo === "video" || tipo === "documento") {
      html +=
        '<input type="text" class="rm24-input rm24-contenido-caption" placeholder="Caption (opcional)" value="' +
        esc(item.caption) +
        '">';
    }
    if (tipo === "documento") {
      html +=
        '<input type="text" class="rm24-input rm24-contenido-filename" placeholder="Nombre archivo (ej. oferta.pdf)" value="' +
        esc(item.filename || "") +
        '">';
    }

    if (url) {
      html += '<div class="rm24-contenido-preview rm24-preview-premium">';
      if (tipo === "imagen") {
        html +=
          '<img src="' +
          esc(url) +
          '" alt="" class="rm24-contenido-preview-img" onerror="this.style.display=\'none\'">';
      } else if (tipo === "audio") {
        html +=
          '<audio class="rm24-contenido-preview-audio" controls preload="none" src="' +
          esc(url) +
          '"></audio>';
      } else if (tipo === "video") {
        html +=
          '<video class="rm24-contenido-preview-video" controls preload="metadata" src="' +
          esc(url) +
          '"></video>';
      } else if (tipo === "documento") {
        const fn = String(item.filename || "").trim() || "Documento";
        html +=
          '<p class="rm24-contenido-preview-filename">📄 ' +
          esc(fn) +
          "</p>" +
          '<a class="rm24-contenido-preview-link" href="' +
          esc(url) +
          '" target="_blank" rel="noopener">Abrir archivo</a>';
      } else {
        html += '<span class="rm24-contenido-preview-link">' + esc(url) + "</span>";
      }
      html += "</div>";
    }

    html += "</div>";
    return html;
  }

  function htmlStepEditorBody(item, index) {
    const tipo = item.tipo || "texto";
    let campos = "";
    if (tipo === "retraso") {
      const cantidad = item.cantidad ?? 1;
      const unidad = String(item.unidad || "minutos").toLowerCase();
      campos =
        '<div class="rm24-block-body-inner">' +
        '<p class="rm24-block-body-label">⏱️ RETRASO VISUAL ' +
        etiquetaRetrasoVisualBadge() +
        "</p>" +
        '<div class="rm24-delay-grid">' +
        '<input type="number" class="rm24-input rm24-contenido-cantidad" min="1" step="1" value="' +
        esc(String(cantidad)) +
        '" placeholder="Cantidad" aria-label="Cantidad">' +
        '<select class="rm24-input rm24-contenido-unidad" aria-label="Unidad">' +
        '<option value="segundos"' +
        (unidad === "segundos" ? " selected" : "") +
        ">Segundos</option>" +
        '<option value="minutos"' +
        (unidad === "minutos" ? " selected" : "") +
        ">Minutos</option>" +
        '<option value="horas"' +
        (unidad === "horas" ? " selected" : "") +
        ">Horas</option></select></div>" +
        '<p class="rm24-upload-hint">Solo visual en Fase 1 · el envío actual no espera este retraso</p></div>';
    } else if (tipo === "texto") {
      campos =
        '<div class="rm24-block-body-inner">' +
        '<p class="rm24-block-body-label">📝 MENSAJE DE TEXTO</p>' +
        '<textarea class="rm24-input rm24-textarea rm24-textarea-premium rm24-contenido-texto" rows="6" placeholder="Escribe el mensaje de remarketing…">' +
        esc(item.texto) +
        "</textarea></div>";
    } else if (RM24H_MEDIA_CLIENT[tipo]) {
      campos =
        '<div class="rm24-block-body-inner">' + htmlCamposMedia(item, index, tipo) + "</div>";
    }

    return (
      '<div class="rm24-contenido-item rm24-step-editor-card" data-tipo="' +
      esc(tipo) +
      '" data-index="' +
      index +
      '">' +
      campos +
      "</div>"
    );
  }

  function htmlStepEditorShell(item, index, total) {
    const tipo = item.tipo || "texto";
    return (
      '<div class="rm24-step-editor-shell">' +
      '<div class="rm24-step-editor-head">' +
      '<div class="rm24-step-editor-head-main">' +
      '<p class="rm24-step-editor-kicker">✏️ Editando paso #' +
      (index + 1) +
      "</p>" +
      '<p class="rm24-step-editor-type">' +
      iconoTipoContenido(tipo) +
      " " +
      esc(etiquetaTipoContenido(tipo)) +
      (tipo === "retraso" ? " " + etiquetaRetrasoVisualBadge() : "") +
      "</p></div>" +
      '<div class="rm24-step-editor-actions">' +
      '<button type="button" class="rm24-action-icon" data-rm24-move-up="' +
      index +
      '" title="Subir"' +
      (index === 0 ? " disabled" : "") +
      '>↑</button>' +
      '<button type="button" class="rm24-action-icon" data-rm24-move-down="' +
      index +
      '" title="Bajar"' +
      (index >= total - 1 ? " disabled" : "") +
      '>↓</button>' +
      '<button type="button" class="rm24-action-icon rm24-action-icon--danger" data-rm24-remove="' +
      index +
      '" title="Eliminar paso">×</button></div></div>' +
      htmlStepEditorBody(item, index) +
      "</div>"
    );
  }

  function renderRm24StepEditor() {
    const mount = document.getElementById("rm24hStepEditor");
    if (!mount) return;
    const items = getRm24ContenidosActivos();
    clampPasoSeleccionado(items.length);
    if (!items.length) {
      mount.innerHTML =
        '<div class="rm24-step-editor-empty rm24-step-editor-empty--premium">' +
        "<p><strong>Sin pasos aún</strong></p>" +
        "<p>Usa <strong>＋ Agregar paso</strong> o selecciona un paso en el embudo izquierdo.</p></div>";
      return;
    }
    const item =
      mapearItemContenidoUi(items[rm24hPasoSeleccionado]) || items[rm24hPasoSeleccionado];
    mount.innerHTML = htmlStepEditorShell(item, rm24hPasoSeleccionado, items.length);
  }

  function renderRm24ContentBlocks() {
    renderRm24StepEditor();
    actualizarEmbudoRmPanel();
  }

  function bindContenidosPanelEvents() {
    const mount = document.getElementById("panelNodoContenido");
    if (!mount) return;

    if (mount._rm24hOnClick) {
      mount.removeEventListener("click", mount._rm24hOnClick);
    }
    if (mount._rm24hOnChange) {
      mount.removeEventListener("change", mount._rm24hOnChange);
    }
    if (mount._rm24hOnInput) {
      mount.removeEventListener("input", mount._rm24hOnInput);
    }
    if (mount._rm24hOnDragStart) {
      mount.removeEventListener("dragstart", mount._rm24hOnDragStart);
    }
    if (mount._rm24hOnDragOver) {
      mount.removeEventListener("dragover", mount._rm24hOnDragOver);
    }
    if (mount._rm24hOnDrop) {
      mount.removeEventListener("drop", mount._rm24hOnDrop);
    }
    if (mount._rm24hOnDragEnd) {
      mount.removeEventListener("dragend", mount._rm24hOnDragEnd);
    }

    mount._rm24hOnClick = function (ev) {
      const addBtn = ev.target.closest("#rm24hAddPasoBtn");
      if (addBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleRm24AddPasoMenu();
        return;
      }

      const addTipoBtn = ev.target.closest("[data-add-tipo]");
      if (addTipoBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        addRm24ContentBlock(addTipoBtn.getAttribute("data-add-tipo"));
        return;
      }

      const selectBtn = ev.target.closest("[data-rm24-embudo-index]");
      if (selectBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        selectRm24Paso(parseInt(selectBtn.getAttribute("data-rm24-embudo-index"), 10));
        return;
      }

      const removeBtn = ev.target.closest("[data-rm24-remove]");
      if (removeBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        const idx = parseInt(removeBtn.getAttribute("data-rm24-remove"), 10);
        removeRm24ContentBlock(idx);
        return;
      }

      const moveUpBtn = ev.target.closest("[data-rm24-move-up]");
      if (moveUpBtn && !moveUpBtn.disabled) {
        ev.preventDefault();
        ev.stopPropagation();
        moveRm24ContentBlock(parseInt(moveUpBtn.getAttribute("data-rm24-move-up"), 10), -1);
        return;
      }

      const moveDownBtn = ev.target.closest("[data-rm24-move-down]");
      if (moveDownBtn && !moveDownBtn.disabled) {
        ev.preventDefault();
        ev.stopPropagation();
        moveRm24ContentBlock(parseInt(moveDownBtn.getAttribute("data-rm24-move-down"), 10), 1);
        return;
      }

      const pickBtn = ev.target.closest("[data-rm24-pick-file]");
      if (pickBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        const card = pickBtn.closest(".rm24-contenido-item");
        card?.querySelector(".rm24-contenido-file")?.click();
        return;
      }

      const toggleManual = ev.target.closest("[data-rm24-toggle-manual]");
      if (toggleManual) {
        ev.preventDefault();
        ev.stopPropagation();
        const card = toggleManual.closest(".rm24-contenido-item");
        card?.querySelector(".rm24-manual-url")?.classList.toggle("rm24-manual-url--open");
      }
    };

    mount._rm24hOnChange = function (ev) {
      const fileInput = ev.target.closest(".rm24-contenido-file");
      if (fileInput?.files?.[0]) {
        const card = fileInput.closest(".rm24-contenido-item");
        subirArchivoRm24hEnBloque(card, fileInput.files[0]);
        fileInput.value = "";
        return;
      }
      if (
        !ev.target.closest(".rm24-contenido-url") &&
        !ev.target.closest(".rm24-contenido-unidad") &&
        !ev.target.closest(".rm24-contenido-cantidad")
      ) {
        return;
      }
      syncEditorPasoToContenidos();
      if (ev.target.closest(".rm24-contenido-url")) {
        renderRm24ContentBlocks();
      }
      persistirContenidosEnNodo();
    };

    mount._rm24hOnInput = function (ev) {
      if (!ev.target.closest("#rm24hStepEditor")) return;
      mostrarErrorContenidos("");
      syncEditorPasoToContenidos();
      sincronizarMensajeRemarketingDesdeContenidos(configActiva);
      actualizarEmbudoRmPanel();
      persistirContenidosEnNodo();
    };

    mount._rm24hOnDragStart = function (ev) {
      const step = ev.target.closest("[data-rm24-embudo-index]");
      if (!step) return;
      rm24hDragPasoIndex = parseInt(step.getAttribute("data-rm24-embudo-index"), 10);
      step.classList.add("rm24-embudo-node--dragging");
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", String(rm24hDragPasoIndex));
      }
    };

    mount._rm24hOnDragOver = function (ev) {
      const step = ev.target.closest("[data-rm24-embudo-index]");
      if (!step) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      document.querySelectorAll(".rm24-embudo-node--drop-target").forEach(function (el) {
        el.classList.remove("rm24-embudo-node--drop-target");
      });
      step.classList.add("rm24-embudo-node--drop-target");
    };

    mount._rm24hOnDrop = function (ev) {
      const step = ev.target.closest("[data-rm24-embudo-index]");
      if (!step) return;
      ev.preventDefault();
      const from =
        rm24hDragPasoIndex != null
          ? rm24hDragPasoIndex
          : parseInt(ev.dataTransfer?.getData("text/plain"), 10);
      const to = parseInt(step.getAttribute("data-rm24-embudo-index"), 10);
      document.querySelectorAll(".rm24-embudo-node--drop-target").forEach(function (el) {
        el.classList.remove("rm24-embudo-node--drop-target");
      });
      if (Number.isFinite(from) && Number.isFinite(to)) {
        reorderRm24ContentBlock(from, to);
      }
    };

    mount._rm24hOnDragEnd = function () {
      rm24hDragPasoIndex = null;
      document.querySelectorAll(".rm24-embudo-node--dragging").forEach(function (el) {
        el.classList.remove("rm24-embudo-node--dragging");
      });
      document.querySelectorAll(".rm24-embudo-node--drop-target").forEach(function (el) {
        el.classList.remove("rm24-embudo-node--drop-target");
      });
    };

    mount.addEventListener("click", mount._rm24hOnClick);
    mount.addEventListener("change", mount._rm24hOnChange);
    mount.addEventListener("input", mount._rm24hOnInput);
    mount.addEventListener("dragstart", mount._rm24hOnDragStart);
    mount.addEventListener("dragover", mount._rm24hOnDragOver);
    mount.addEventListener("drop", mount._rm24hOnDrop);
    mount.addEventListener("dragend", mount._rm24hOnDragEnd);

    if (!mount._rm24hDocClick) {
      mount._rm24hDocClick = function (ev) {
        if (!panelRemarketingAbierto()) return;
        if (ev.target.closest("#rm24hAddPasoWrap")) return;
        toggleRm24AddPasoMenu(false);
      };
      document.addEventListener("click", mount._rm24hDocClick);
    }
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
    const cfg = sincronizarHorasLegacyDesdeTiempo(
      Object.assign({}, config || configActiva)
    );
    const activoEl = document.getElementById("rm24hActivo");
    const unidadEl = document.getElementById("rm24hTiempoUnidad");
    const valorEl = document.getElementById("rm24hTiempoValor");
    const reiniciarEl = document.getElementById("rm24hReiniciar");
    const detenerConvEl = document.getElementById("rm24hDetenerConversion");

    if (activoEl) activoEl.checked = !!cfg.activo;
    if (unidadEl) unidadEl.value = cfg.tiempoInactividad.unidad;
    if (valorEl) valorEl.value = String(cfg.tiempoInactividad.valor);
    renderPresetsTiempoPanel(cfg.tiempoInactividad);
    if (reiniciarEl) reiniciarEl.checked = cfg.reiniciarAlResponder !== false;
    if (detenerConvEl) detenerConvEl.checked = cfg.detenerEnConversion !== false;
    renderRm24ContentBlocks();
    mostrarErrorContenidos("");
    actualizarHintTiempoPanel(cfg.tiempoInactividad);
  }

  function actualizarHintTiempoPanel(tiempo) {
    const hint = document.getElementById("rm24hTiempoHint");
    if (!hint) return;
    const t = normalizarTiempoInactividad({ tiempoInactividad: tiempo });
    hint.textContent =
      "Se envía tras " +
      etiquetaTiempoInactividadResumen(t).replace(" de inactividad", "") +
      " sin respuesta del lead.";
    actualizarEmbudoRmPanel();
  }

  function renderPanel(nodo) {
    if (!nodo) return;

    nodoActivo = nodo;
    rm24hPasoSeleccionado = 0;
    hydrateRm24ContentBlocksFromNode(nodo);
    sincronizarHorasLegacyDesdeTiempo(configActiva);

    const contenido = document.getElementById("panelNodoContenido");
    const panelShell = document.getElementById("panelNodo");
    if (!contenido) return;

    if (panelShell) {
      panelShell.classList.add(
        "panel-nodo--rm24h",
        "panel-nodo--rm24h-wide",
        "rm-panel-wide"
      );
    }

    const tiempo = configActiva.tiempoInactividad || { valor: 23, unidad: "horas" };
    const introTiempo = etiquetaTiempoInactividadResumen(tiempo);

    contenido.innerHTML =
      '<div class="rm24h-panel rm24-config-panel rm-panel-wide">' +
      '<div class="rm24-card rm24-card--hero">' +
      '<span class="rm24h-panel-icon" aria-hidden="true">🔥</span>' +
      "<div>" +
      "<h4>Remarketing Global 24h</h4>" +
      "<p>Cerebro global del flujo · no mueve leads entre nodos</p>" +
      "</div></div>" +
      '<div class="rm24-config-scroll">' +
      '<section class="rm24-section rm24-section--estado">' +
      '<h5 class="rm24-section-title">Estado</h5>' +
      '<label class="rm24-switch rm24h-toggle">' +
      '<input type="checkbox" id="rm24hActivo" ' +
      (configActiva.activo ? "checked" : "") +
      ">" +
      '<span class="rm24-switch-track" aria-hidden="true"></span>' +
      "<span class=\"rm24-switch-label\">Activar remarketing global</span></label>" +
      "</section>" +
      '<div class="rm24-config-workspace">' +
      '<aside class="rm24-config-col rm24-config-col--funnel" aria-label="Embudo RM">' +
      htmlEmbudoRmSection() +
      "</aside>" +
      '<div class="rm24-config-col rm24-config-col--editor">' +
      '<section class="rm24-section">' +
      '<h5 class="rm24-section-title">Tiempo de inactividad</h5>' +
      '<div class="rm24-tiempo-grid">' +
      '<div class="rm24h-field rm24-field">' +
      "<label for=\"rm24hTiempoUnidad\">Unidad</label>" +
      '<select id="rm24hTiempoUnidad" class="rm24-input rm24-tiempo-unidad">' +
      '<option value="minutos"' +
      (tiempo.unidad === "minutos" ? " selected" : "") +
      ">Minutos (pruebas)</option>" +
      '<option value="horas"' +
      (tiempo.unidad === "horas" ? " selected" : "") +
      ">Horas</option>" +
      '<option value="dias"' +
      (tiempo.unidad === "dias" ? " selected" : "") +
      ">Días</option></select></div>" +
      '<div class="rm24h-field rm24-field">' +
      "<label for=\"rm24hTiempoValor\">Valor</label>" +
      '<input type="number" id="rm24hTiempoValor" class="rm24-input" min="1" step="1" inputmode="numeric" value="' +
      esc(String(tiempo.valor)) +
      '"></div></div>' +
      htmlPresetsTiempoInactividad(tiempo.unidad, tiempo.valor) +
      '<p class="rm24h-hint" id="rm24hTiempoHint">Se envía tras ' +
      esc(introTiempo.replace(" de inactividad", "")) +
      " sin respuesta del lead.</p></section>" +
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
      '<p class="rm24h-hint rm24-contenidos-intro">Selecciona un paso en el embudo izquierdo o agrega uno nuevo. URLs HTTPS públicas.</p>' +
      '<div id="rm24hContenidosError" class="rm24-contenidos-error" hidden></div>' +
      htmlRm24AddPasoControl() +
      '<div id="rm24hStepEditor" class="rm24-step-editor rm24-step-editor--premium"></div>' +
      "</section>" +
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
      "</div></div></div></div></div>";

    bindContenidosPanelEvents();
    bindTiempoPanelEvents();
    aplicarConfigAlPanel(configActiva);

    document.getElementById("rm24hActivo")?.addEventListener("change", onPanelChange);
    document
      .getElementById("rm24hGuardarPanel")
      ?.addEventListener("click", guardarDesdePanel);

    actualizarEmbudoRmPanel();
  }

  function bindTiempoPanelEvents() {
    const unidadEl = document.getElementById("rm24hTiempoUnidad");
    const valorEl = document.getElementById("rm24hTiempoValor");
    const mount = document.getElementById("panelNodoContenido");
    if (!mount) return;

    if (mount._rm24hTiempoClick) {
      mount.removeEventListener("click", mount._rm24hTiempoClick);
    }
    if (mount._rm24hTiempoChange) {
      mount.removeEventListener("change", mount._rm24hTiempoChange);
    }
    if (mount._rm24hTiempoInput) {
      mount.removeEventListener("input", mount._rm24hTiempoInput);
    }

    mount._rm24hTiempoClick = function (ev) {
      const presetBtn = ev.target.closest("[data-rm24-preset-valor]");
      if (!presetBtn) return;
      ev.preventDefault();
      ev.stopPropagation();
      const valor = parseInt(presetBtn.getAttribute("data-rm24-preset-valor"), 10);
      if (!Number.isFinite(valor) || valor < 1) return;
      if (valorEl) valorEl.value = String(valor);
      onTiempoPanelChange();
    };

    mount._rm24hTiempoChange = function (ev) {
      if (
        ev.target.id === "rm24hTiempoUnidad" ||
        ev.target.id === "rm24hTiempoValor"
      ) {
        if (ev.target.id === "rm24hTiempoUnidad") {
          const unidad =
            normalizarUnidadTiempoInactividad(unidadEl?.value) || "horas";
          const presets =
            PRESETS_TIEMPO_INACTIVIDAD[unidad] || PRESETS_TIEMPO_INACTIVIDAD.horas;
          if (valorEl) valorEl.value = String(presets[0] || 23);
          renderPresetsTiempoPanel({ valor: presets[0] || 23, unidad: unidad });
        }
        onTiempoPanelChange();
      }
    };

    mount._rm24hTiempoInput = function (ev) {
      if (ev.target.id !== "rm24hTiempoValor") return;
      const cleaned = String(ev.target.value || "").replace(/\D/g, "");
      if (cleaned !== ev.target.value) ev.target.value = cleaned;
      onTiempoPanelChange();
    };

    mount.addEventListener("click", mount._rm24hTiempoClick);
    mount.addEventListener("change", mount._rm24hTiempoChange);
    mount.addEventListener("input", mount._rm24hTiempoInput);

    valorEl?.addEventListener("blur", onTiempoPanelCommit);
    valorEl?.addEventListener("keydown", function (e) {
      if (["e", "E", "+", "-", ".", ","].includes(e.key)) {
        e.preventDefault();
      }
    });
  }

  function onTiempoPanelCommit() {
    const unidad =
      normalizarUnidadTiempoInactividad(
        document.getElementById("rm24hTiempoUnidad")?.value
      ) || "horas";
    normalizarInputTiempoValor(document.getElementById("rm24hTiempoValor"), unidad);
    onTiempoPanelChange();
  }

  function onTiempoPanelChange() {
    syncDesdePanel();
    renderPresetsTiempoPanel(configActiva.tiempoInactividad);
    actualizarHintTiempoPanel(configActiva.tiempoInactividad);
    persistirContenidosEnNodo();
  }

  function syncDesdePanel() {
    if (!panelRemarketingAbierto()) return;

    const activoEl = document.getElementById("rm24hActivo");

    if (activoEl) configActiva.activo = !!activoEl.checked;
    configActiva.tiempoInactividad = leerTiempoDesdePanel();
    sincronizarHorasLegacyDesdeTiempo(configActiva);
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
    rm24hPasoSeleccionado = 0;
    const panelShell = document.getElementById("panelNodo");
    panelShell?.classList.remove(
      "panel-nodo--rm24h",
      "panel-nodo--rm24h-wide",
      "rm-panel-wide"
    );
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
    nodo.className =
      "node remarketing-global-node node-remarketing-global rm24-node rm24-global-node";
    nodo.id = id;
    nodo.dataset.tipo = "remarketing_global";
    nodo.style.left = 80 + nodoCount * 40 + "px";
    nodo.style.top = 120 + nodoCount * 30 + "px";

    nodo.innerHTML =
      '<div class="rm24-global-halo" aria-hidden="true"></div>' +
      '<div class="rm24-global-orbit" aria-hidden="true"></div>' +
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
      '<div class="rm24-global-badges" aria-label="Tipo de nodo global">' +
      '<span class="rm24-global-badge">GLOBAL</span>' +
      '<span class="rm24-global-badge rm24-global-badge--watchdog">WATCHDOG</span>' +
      '<span class="rm24-global-badge rm24-global-badge--type rm24h-chip">RM24H</span>' +
      "</div>" +
      '<header class="rm24-node-header rm24h-header">' +
      '<span class="rm24-node-icon" aria-hidden="true">🔥</span>' +
      '<div class="rm24-node-title-group">' +
      '<div class="rm24-node-title-row">' +
      '<span class="rm24-node-title">Remarketing Global 24h</span>' +
      "</div></div></header>" +
      '<div class="rm24-global-taglines">' +
      '<p class="rm24-global-tagline">Cerebro global del flujo</p>' +
      '<p class="rm24-global-tagline rm24-global-tagline--sub">No mueve leads entre nodos</p>' +
      "</div>" +
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
