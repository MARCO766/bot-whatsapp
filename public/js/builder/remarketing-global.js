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

  function htmlRm24BlockPicker() {
    const cards = [
    { tipo: "texto", icon: "📝", label: "Texto" },
    { tipo: "imagen", icon: "🖼️", label: "Imagen" },
    { tipo: "video", icon: "🎬", label: "Video" },
    { tipo: "documento", icon: "📁", label: "Archivo" },
    { tipo: "audio", icon: "🎵", label: "Audio" },
    { tipo: "retraso", icon: "⏱️", label: "Retraso" },
  ];
    return (
      '<div class="rm24-block-picker" id="rm24hBlockPicker" role="group" aria-label="Añadir bloque">' +
      cards
        .map(function (c) {
          return (
            '<button type="button" class="rm24-block-card" data-add-tipo="' +
            esc(c.tipo) +
            '" title="Añadir ' +
            esc(c.label) +
            '">' +
            '<span class="rm24-block-icon" aria-hidden="true">' +
            c.icon +
            "</span>" +
            '<span class="rm24-block-label">' +
            esc(c.label) +
            "</span></button>"
          );
        })
        .join("") +
      "</div>"
    );
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
      retraso: "Retraso",
    };
    return map[tipo] || tipo;
  }

  function iconoTipoContenido(tipo) {
    const map = {
      texto: "📝",
      imagen: "🖼️",
      audio: "🎵",
      video: "🎬",
      documento: "📁",
      retraso: "⏱️",
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
      documento: "Archivo",
      retraso: "Retraso",
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
      } else if (tipo === "retraso") {
        const cantidad = parseInt(
          card.querySelector(".rm24-contenido-cantidad")?.value,
          10
        );
        lista.push({
          tipo: "retraso",
          cantidad: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
          unidad: String(card.querySelector(".rm24-contenido-unidad")?.value || "minutos"),
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
    const t = String(tipo || "texto").toLowerCase();
    const tipoNorm = t === "archivo" ? "documento" : t;
    const lista = leerContenidosDesdePanel();
    lista.push(crearBloqueVacio(tipoNorm));
    configActiva.rm24h_contenidos = lista;
    renderRm24ContentBlocks();
    mostrarErrorContenidos("");
    persistirContenidosEnNodo();
    if (RM24H_MEDIA_CLIENT[tipoNorm]) {
      requestAnimationFrame(function () {
        const mount = document.getElementById("rm24hContenidosLista");
        const input = mount?.querySelector(
          ".rm24-contenido-item:last-child .rm24-contenido-file"
        );
        input?.click();
      });
    }
  }

  function removeRm24ContentBlock(index) {
    const lista = leerContenidosDesdePanel();
    if (index < 0 || index >= lista.length) return;
    lista.splice(index, 1);
    configActiva.rm24h_contenidos = lista;
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

  function htmlBloqueContenido(item, index, total) {
    const tipo = item.tipo || "texto";
    const totalBlocks = typeof total === "number" ? total : 1;
    const tituloUpper = etiquetaTipoContenido(tipo).toUpperCase();
    let campos = "";
    if (tipo === "retraso") {
      const cantidad = item.cantidad ?? 1;
      const unidad = String(item.unidad || "minutos").toLowerCase();
      campos =
        '<div class="rm24-block-body-inner">' +
        '<p class="rm24-block-body-label">⏱️ RETRASO</p>' +
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
        '<p class="rm24-upload-hint">Pausa antes del siguiente bloque</p></div>';
    } else if (tipo === "texto") {
      campos =
        '<div class="rm24-block-body-inner">' +
        '<p class="rm24-block-body-label">📝 MENSAJE DE TEXTO</p>' +
        '<textarea class="rm24-input rm24-textarea rm24-textarea-premium rm24-contenido-texto" rows="4" placeholder="Escribe el mensaje de remarketing…">' +
        esc(item.texto) +
        "</textarea></div>";
    } else if (RM24H_MEDIA_CLIENT[tipo]) {
      campos =
        '<div class="rm24-block-body-inner">' + htmlCamposMedia(item, index, tipo) + "</div>";
    }

    return (
      '<div class="rm24-content-block rm24-contenido-item" data-tipo="' +
      esc(tipo) +
      '" data-index="' +
      index +
      '">' +
      '<div class="rm24-content-block-header rm24-contenido-item-head">' +
      '<div class="rm24-content-block-title">' +
      '<span class="rm24-block-type-icon" aria-hidden="true">' +
      iconoTipoContenido(tipo) +
      "</span>" +
      '<span class="rm24-block-type-label">' +
      esc(tituloUpper) +
      "</span></div>" +
      '<div class="rm24-content-actions">' +
      '<button type="button" class="rm24-action-icon" data-rm24-move-up="' +
      index +
      '" title="Subir"' +
      (index === 0 ? " disabled" : "") +
      '>↑</button>' +
      '<button type="button" class="rm24-action-icon" data-rm24-move-down="' +
      index +
      '" title="Bajar"' +
      (index >= totalBlocks - 1 ? " disabled" : "") +
      '>↓</button>' +
      '<button type="button" class="rm24-action-icon rm24-action-icon--danger" data-rm24-remove="' +
      index +
      '" title="Eliminar">×</button></div></div>' +
      '<div class="rm24-content-block-body rm24-contenido-fields">' +
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
        '<p class="rm24-contenidos-empty">Sin bloques. Elige un tipo en el selector de arriba.</p>';
      return;
    }
    listaEl.innerHTML = items
      .map(function (item, i) {
        return htmlBloqueContenido(mapearItemContenidoUi(item) || item, i, items.length);
      })
      .join("");
  }

  function bindContenidosPanelEvents() {
    const mount = document.getElementById("panelNodoContenido");
    if (!mount) return;

    if (mount.dataset.rm24hContenidosBound === "1") return;
    mount.dataset.rm24hContenidosBound = "1";

    mount.addEventListener("click", function (ev) {
      const addBtn = ev.target.closest("[data-add-tipo], .rm24-block-card");
      if (addBtn && addBtn.getAttribute("data-add-tipo")) {
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
        return;
      }

      const moveUpBtn = ev.target.closest("[data-rm24-move-up]");
      if (moveUpBtn && !moveUpBtn.disabled) {
        ev.preventDefault();
        moveRm24ContentBlock(parseInt(moveUpBtn.getAttribute("data-rm24-move-up"), 10), -1);
        return;
      }

      const moveDownBtn = ev.target.closest("[data-rm24-move-down]");
      if (moveDownBtn && !moveDownBtn.disabled) {
        ev.preventDefault();
        moveRm24ContentBlock(parseInt(moveDownBtn.getAttribute("data-rm24-move-down"), 10), 1);
        return;
      }

      const pickBtn = ev.target.closest("[data-rm24-pick-file]");
      if (pickBtn) {
        ev.preventDefault();
        const card = pickBtn.closest(".rm24-contenido-item");
        card?.querySelector(".rm24-contenido-file")?.click();
        return;
      }

      const toggleManual = ev.target.closest("[data-rm24-toggle-manual]");
      if (toggleManual) {
        ev.preventDefault();
        const card = toggleManual.closest(".rm24-contenido-item");
        card?.querySelector(".rm24-manual-url")?.classList.toggle("rm24-manual-url--open");
      }
    });

    mount.addEventListener("change", function (ev) {
      const fileInput = ev.target.closest(".rm24-contenido-file");
      if (fileInput?.files?.[0]) {
        const card = fileInput.closest(".rm24-contenido-item");
        subirArchivoRm24hEnBloque(card, fileInput.files[0]);
        fileInput.value = "";
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
      if (
        !ev.target.closest(".rm24-contenido-url") &&
        !ev.target.closest(".rm24-contenido-unidad") &&
        !ev.target.closest(".rm24-contenido-cantidad")
      ) {
        return;
      }
      configActiva.rm24h_contenidos = leerContenidosDesdePanel();
      if (ev.target.closest(".rm24-contenido-url")) {
        renderRm24ContentBlocks();
      }
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
      htmlRm24BlockPicker() +
      '<div id="rm24hContenidosLista" class="rm24-contenidos-lista"></div>' +
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
