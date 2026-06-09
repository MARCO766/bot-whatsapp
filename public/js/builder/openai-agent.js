/**
 * MacBot — Nodo Agente OpenAI (independiente)
 */
window.MacBotOpenAIAgent = (function () {
  const TAG_DIV = "di" + "v";

  let nodoActivo = null;
  let configActiva = crearConfigPorDefecto();
  let renderVisualTimer = null;

  const PROMPT_PLACEHOLDER =
    "Ejemplo:\n" +
    "Eres un vendedor amable de WhatsApp.\n" +
    "Producto: 4000 plantillas de papercraft.\n" +
    "Precio: 29 Bs.\n" +
    "Incluye: 4000 plantillas + 6 bonos.\n" +
    "Bonos: abecedario 3D, lámparas origami, Goku, Vegeta y Kid Buu.\n" +
    "Métodos de pago: QR y depósito bancario.\n" +
    "Responde corto, humano y sin inventar datos.";

  /* Logo OpenAI blossom (nudo entrelazado) — path compartido nodo + paleta */
  const OPENAI_LOGO_PATH =
    "M11.248 18.25q-.825 0-1.568-.314a4.3 4.3 0 0 1-1.32-.874 4 4 0 0 1-1.304.214 4 4 0 0 1-2.046-.544 4.27 4.27 0 0 1-1.518-1.485 4 4 0 0 1-.56-2.095q0-.48.131-1.04A4.4 4.4 0 0 1 2.04 10.71a4.07 4.07 0 0 1 .017-3.4 4.2 4.2 0 0 1 1.056-1.418 3.8 3.8 0 0 1 1.6-.842 3.9 3.9 0 0 1 .76-1.683q.593-.759 1.451-1.188a4.04 4.04 0 0 1 1.832-.429q.825 0 1.567.313.742.314 1.32.875a4 4 0 0 1 1.304-.215q1.106 0 2.046.545a4.14 4.14 0 0 1 1.501 1.485q.578.941.578 2.095 0 .48-.132 1.04.66.61 1.023 1.419.363.792.363 1.666 0 .892-.38 1.717a4.3 4.3 0 0 1-1.072 1.435 3.8 3.8 0 0 1-1.584.825 3.8 3.8 0 0 1-.775 1.683 4.06 4.06 0 0 1-1.436 1.188 4.04 4.04 0 0 1-1.832.429m-4.076-2.062q.825 0 1.435-.347l3.103-1.782a.36.36 0 0 0 .164-.313v-1.42L7.881 14.62a.67.67 0 0 1-.726 0l-3.118-1.798a.5.5 0 0 1-.017.115v.198q0 .841.396 1.551.413.693 1.139 1.089a3.2 3.2 0 0 0 1.617.412m.165-2.69a.4.4 0 0 0 .181.05q.083 0 .165-.05l1.238-.71-3.977-2.31a.7.7 0 0 1-.363-.643v-3.58q-.825.362-1.32 1.122a2.9 2.9 0 0 0-.495 1.65q0 .809.413 1.55.412.743 1.072 1.123zm3.91 3.663q.875 0 1.585-.396a2.96 2.96 0 0 0 1.534-2.64v-3.564a.32.32 0 0 0-.165-.297l-1.254-.726v4.604a.7.7 0 0 1-.363.643l-3.119 1.799a3 3 0 0 0 1.783.577m.627-6.039V8.878L10.01 7.822 8.129 8.878v2.244l1.881 1.056zM7.057 5.859a.7.7 0 0 1 .363-.644l3.119-1.798a3 3 0 0 0-1.782-.578q-.874 0-1.584.396A2.96 2.96 0 0 0 6.05 4.324a3.07 3.07 0 0 0-.396 1.551v3.547q0 .199.165.314l1.237.726zm8.383 7.887q.825-.364 1.303-1.123.495-.758.495-1.65a3.15 3.15 0 0 0-.412-1.55q-.413-.743-1.073-1.123l-3.086-1.782q-.099-.065-.181-.049a.3.3 0 0 0-.165.05l-1.238.692 3.993 2.327a.6.6 0 0 1 .264.264.64.64 0 0 1 .1.363zm-3.317-8.382a.63.63 0 0 1 .726 0l3.135 1.831v-.297q0-.792-.396-1.501a2.86 2.86 0 0 0-1.105-1.155q-.71-.43-1.65-.43-.825 0-1.436.347L8.294 5.941a.36.36 0 0 0-.165.314v1.418z";

  function buildOpenAILogoSvg(className) {
    return (
      '<svg class="' +
      className +
      '" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="' +
      OPENAI_LOGO_PATH +
      '"/>' +
      "</svg>"
    );
  }

  const OPENAI_ICON_SVG = buildOpenAILogoSvg("openai-agent-icon-svg");

  function initPaletteButtonIcon() {
    const btn = document.querySelector(".menu-nodo-btn-openai-agent");
    if (!btn) return;
    let wrap = btn.querySelector(".menu-nodo-btn-openai-agent__icon");
    if (!wrap) {
      wrap = document.createElement("span");
      wrap.className = "menu-nodo-btn-openai-agent__icon";
      wrap.setAttribute("aria-hidden", "true");
      btn.insertBefore(wrap, btn.firstChild);
    }
    wrap.innerHTML = buildOpenAILogoSvg("openai-palette-icon-svg");
  }

  const ROUTE_ICON_SVG = {
    qr:
      '<svg class="openai-agent-route-icon-svg" viewBox="0 0 16 16" aria-hidden="true">' +
      '<rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor"/>' +
      '<rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" opacity="0.55"/>' +
      '<rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.55"/>' +
      '<rect x="10" y="10" width="2" height="2" fill="currentColor"/>' +
      '<rect x="12" y="12" width="2" height="2" fill="currentColor"/></svg>',
    deposito:
      '<svg class="openai-agent-route-icon-svg" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path fill="currentColor" d="M2 6h12v7H2V6zm1-3h10l1 3H2l1-3zm2 8h2v2H5v-2zm4 0h2v2H9v-2z"/></svg>',
    garantia:
      '<svg class="openai-agent-route-icon-svg" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path fill="currentColor" d="M8 1.5L3 4v4.2c0 3.1 2.1 5.9 5 6.3 2.9-.4 5-3.2 5-6.3V4L8 1.5zm3.2 5.5L7.3 11 4.8 8.5l1-1 1.5 1.5 3.4-3.4 1.5 1.4z"/></svg>',
    default:
      '<svg class="openai-agent-route-icon-svg" viewBox="0 0 16 16" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="3" fill="currentColor"/></svg>',
  };

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function generarRouteId() {
    return (
      "route_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function generarListId() {
    return (
      "list_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function generarItemId() {
    return (
      "foto_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  const PRIORITY_MODES_VALIDOS = [
    "routes_library_gpt",
    "library_routes_gpt",
    "gpt_only",
  ];
  const SEND_MODES_VALIDOS = ["random", "all", "first"];
  const CAPTION_MODES_VALIDOS = ["caption_item", "same_caption", "none"];

  const MAX_FOTO_BIBLIOTECA_BYTES = 5 * 1024 * 1024;
  const UPLOAD_BIBLIOTECA_ENDPOINT = "/api/seguimiento-v2/upload-media";
  const MIME_FOTOS_BIBLIOTECA = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  let subidaFotoBibliotecaActiva = false;

  const DESCRIPCIONES_IA_BIBLIOTECA = {
    muestras:
      "Contiene ejemplos reales y trabajos terminados. Usa esta biblioteca cuando el lead pida fotos, muestras, ejemplos o quiera ver cómo se ve el producto final.",
    catalogo:
      "Contiene imágenes del catálogo completo de productos. Usa esta biblioteca cuando el lead quiera ver productos, diseños disponibles, modelos o catálogo.",
    testimonios:
      "Contiene capturas y pruebas de clientes satisfechos. Usa esta biblioteca cuando el lead tenga dudas sobre la calidad o solicite referencias.",
    comprobantes:
      "Contiene ejemplos de pagos y comprobantes. Usa esta biblioteca cuando el lead pregunte cómo pagan otros clientes o solicite evidencia de pagos.",
  };

  /** Textos cortos de versiones anteriores — para no pisar descripciones ya personalizadas. */
  const DESCRIPCIONES_IA_LEGACY_BIBLIOTECA = [
    "Fotos de ejemplos terminados del producto",
    "Fotos del catálogo o productos disponibles",
    "Capturas o fotos de clientes satisfechos",
    "Ejemplos de comprobantes o pagos",
  ];

  const LISTAS_PREDETERMINADAS_BIBLIOTECA = [
    {
      id: "muestras",
      name: "Muestras",
      description: DESCRIPCIONES_IA_BIBLIOTECA.muestras,
    },
    {
      id: "catalogo",
      name: "Catálogo",
      description: DESCRIPCIONES_IA_BIBLIOTECA.catalogo,
    },
    {
      id: "testimonios",
      name: "Testimonios",
      description: DESCRIPCIONES_IA_BIBLIOTECA.testimonios,
    },
    {
      id: "comprobantes",
      name: "Comprobantes",
      description: DESCRIPCIONES_IA_BIBLIOTECA.comprobantes,
    },
  ];

  const TIPOS_LISTA_OPCIONES = [
    { value: "muestras", label: "muestras" },
    { value: "catalogo", label: "catálogo" },
    { value: "testimonios", label: "testimonios" },
    { value: "comprobantes", label: "comprobantes" },
    { value: "personalizada", label: "personalizada" },
  ];

  function esIdTipoListaPreset(id) {
    return LISTAS_PREDETERMINADAS_BIBLIOTECA.some(function (def) {
      return def.id === String(id || "").trim();
    });
  }

  function obtenerDefTipoListaPreset(tipoId) {
    return (
      LISTAS_PREDETERMINADAS_BIBLIOTECA.find(function (def) {
        return def.id === String(tipoId || "").trim();
      }) || null
    );
  }

  function obtenerDescripcionIAPorTipo(tipoId) {
    const id = String(tipoId || "").trim();
    if (!id || id === "personalizada") return "";
    return String(DESCRIPCIONES_IA_BIBLIOTECA[id] || "").trim();
  }

  function conjuntoDescripcionesDefaultBiblioteca() {
    const conocidas = new Set();
    Object.keys(DESCRIPCIONES_IA_BIBLIOTECA).forEach(function (key) {
      const t = String(DESCRIPCIONES_IA_BIBLIOTECA[key] || "").trim();
      if (t) conocidas.add(t);
    });
    DESCRIPCIONES_IA_LEGACY_BIBLIOTECA.forEach(function (t) {
      const s = String(t || "").trim();
      if (s) conocidas.add(s);
    });
    return conocidas;
  }

  function debeAutorrellenarDescripcionIA(texto) {
    const actual = String(texto || "").trim();
    if (!actual) return true;
    return conjuntoDescripcionesDefaultBiblioteca().has(actual);
  }

  function aplicarDescripcionIATipoEnFila(row, tipoNuevo) {
    const descEl = row.querySelector(".oai-media-list-desc");
    if (!descEl) return;

    const tipo = String(tipoNuevo || "").trim();
    if (!tipo || tipo === "personalizada") return;

    const sugerida = obtenerDescripcionIAPorTipo(tipo);
    if (!sugerida) return;

    if (debeAutorrellenarDescripcionIA(descEl.value)) {
      descEl.value = sugerida;
    }
  }

  function resolverTipoListaDesdeLista(lista) {
    const id = String(lista?.id || "").trim();
    if (esIdTipoListaPreset(id)) return id;
    return "personalizada";
  }

  function etiquetaTipoLista(lista) {
    const tipo = resolverTipoListaDesdeLista(lista);
    if (tipo === "personalizada") {
      return String(lista?.name || "").trim() || "personalizada";
    }
    const op = TIPOS_LISTA_OPCIONES.find(function (o) {
      return o.value === tipo;
    });
    return op ? op.label : tipo;
  }

  function tiposListaOcupados(excluirListId) {
    const ocupados = new Set();
    const excluir = String(excluirListId || "").trim();
    (configActiva?.mediaLibrary?.lists || []).forEach(function (lista) {
      if (String(lista.id || "").trim() === excluir) return;
      const tipo = resolverTipoListaDesdeLista(lista);
      if (tipo !== "personalizada") ocupados.add(tipo);
    });
    return ocupados;
  }

  function renderOpcionesTipoLista(lista) {
    const tipoActual = resolverTipoListaDesdeLista(lista);
    const ocupados = tiposListaOcupados(lista.id);
    return TIPOS_LISTA_OPCIONES.map(function (op) {
      const selected = tipoActual === op.value ? " selected" : "";
      const disabled =
        op.value !== "personalizada" &&
        ocupados.has(op.value) &&
        tipoActual !== op.value
          ? " disabled"
          : "";
      return (
        '<option value="' +
        esc(op.value) +
        '"' +
        selected +
        disabled +
        ">" +
        esc(op.label) +
        "</option>"
      );
    }).join("");
  }

  function crearListaBibliotecaVacia(overrides) {
    const base = overrides && typeof overrides === "object" ? overrides : {};
    return {
      id: String(base.id || "").trim() || generarListId(),
      name: String(base.name || "").trim(),
      description: String(base.description || "").trim(),
      sendMode: "random",
      sendCount: 3,
      introText: "",
      captionMode: "caption_item",
      items: [],
    };
  }

  function tituloListaBiblioteca(lista) {
    const tipo = resolverTipoListaDesdeLista(lista);
    const def = obtenerDefTipoListaPreset(tipo);
    if (def) return def.name;
    const custom = String(lista?.name || "").trim();
    return custom || "Lista personalizada";
  }

  function fusionarItemsLista(destino, origen) {
    const items = Array.isArray(origen?.items) ? origen.items : [];
    if (!Array.isArray(destino.items)) destino.items = [];
    const idsVistos = new Set(
      destino.items.map(function (it) {
        return String(it?.id || "").trim();
      })
    );
    items.forEach(function (it) {
      const normalizado = normalizarItemBiblioteca(it);
      if (!normalizado.url && !normalizado.caption) return;
      if (normalizado.id && idsVistos.has(normalizado.id)) return;
      destino.items.push(normalizado);
      if (normalizado.id) idsVistos.add(normalizado.id);
    });
  }

  function deduplicarListasBiblioteca(ml) {
    if (!ml || !Array.isArray(ml.lists)) return ml;

    const resultado = [];
    const porId = new Map();
    const porTipoPreset = new Map();

    ml.lists.forEach(function (lista) {
      const normalizada = normalizarListaBiblioteca(lista, true);
      const tipo = resolverTipoListaDesdeLista(normalizada);

      if (tipo !== "personalizada") {
        if (porTipoPreset.has(tipo)) {
          fusionarItemsLista(porTipoPreset.get(tipo), normalizada);
          return;
        }
        const canonica = { ...normalizada, id: tipo };
        const def = obtenerDefTipoListaPreset(tipo);
        if (def) canonica.name = def.name;
        porTipoPreset.set(tipo, canonica);
        porId.set(tipo, canonica);
        resultado.push(canonica);
        return;
      }

      const id = String(normalizada.id || "").trim() || generarListId();
      normalizada.id = id;
      if (porId.has(id)) {
        fusionarItemsLista(porId.get(id), normalizada);
        return;
      }
      porId.set(id, normalizada);
      resultado.push(normalizada);
    });

    ml.lists = resultado;
    return ml;
  }

  /**
   * Agrega solo las listas predeterminadas que aún no existen (por tipo/id).
   * @returns {boolean} true si se agregó al menos una lista
   */
  function asegurarListasPredeterminadasBiblioteca(ml) {
    if (!ml || !ml.enabled || !Array.isArray(ml.lists)) return false;

    deduplicarListasBiblioteca(ml);
    let agregadas = false;

    LISTAS_PREDETERMINADAS_BIBLIOTECA.forEach(function (def) {
      const existe = ml.lists.some(function (lista) {
        return resolverTipoListaDesdeLista(lista) === def.id;
      });
      if (!existe) {
        ml.lists.push(crearListaBibliotecaVacia(def));
        agregadas = true;
      }
    });

    if (agregadas) deduplicarListasBiblioteca(ml);
    return agregadas;
  }

  function persistirBibliotecaActivaEnNodo() {
    if (!configActiva) return;
    deduplicarListasBiblioteca(configActiva.mediaLibrary);
    if (nodoActivo) {
      actualizarHTMLNodo(nodoActivo, sanitizeOpenAIData(configActiva));
    }
  }

  function scrollToListaBiblioteca(listId) {
    const lid = String(listId || "").trim();
    if (!lid) return;
    const row = document.querySelector(
      '.oai-media-list-row[data-list-id="' + lid + '"]'
    );
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    row.classList.add("oai-media-list-row--highlight");
    window.setTimeout(function () {
      row.classList.remove("oai-media-list-row--highlight");
    }, 2200);
  }

  function resaltarUltimaFotoLista(listId) {
    const lid = String(listId || "").trim();
    const row = document.querySelector(
      '.oai-media-list-row[data-list-id="' + lid + '"]'
    );
    if (!row) return;
    const fotos = row.querySelectorAll(".oai-media-item-row");
    const ultima = fotos[fotos.length - 1];
    if (!ultima) return;
    ultima.classList.add("oai-media-item-row--highlight");
    window.setTimeout(function () {
      ultima.classList.remove("oai-media-item-row--highlight");
    }, 2200);
  }

  function crearMediaLibraryPorDefecto() {
    return {
      enabled: false,
      priorityMode: "routes_library_gpt",
      lists: [],
    };
  }

  function asegurarMediaLibrary(cfg) {
    if (!cfg || typeof cfg !== "object") return crearMediaLibraryPorDefecto();
    if (!cfg.mediaLibrary || typeof cfg.mediaLibrary !== "object") {
      cfg.mediaLibrary = crearMediaLibraryPorDefecto();
    }
    if (!Array.isArray(cfg.mediaLibrary.lists)) {
      cfg.mediaLibrary.lists = [];
    }
    return cfg.mediaLibrary;
  }

  function mostrarToastBiblioteca(mensaje, tipo) {
    if (typeof showBuilderFlowToast === "function") {
      showBuilderFlowToast(mensaje, tipo || "warn");
      return;
    }
    alert(mensaje);
  }

  function formatoTamanoArchivo(bytes) {
    const n = Math.max(0, parseInt(bytes, 10) || 0);
    if (!n) return "";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function nombreArchivoDesdeItem(item) {
    const guardado = String(item?.filename || "").trim();
    if (guardado) return guardado;
    const url = String(item?.url || "").trim();
    if (!url) return "imagen";
    try {
      const parte = url.split("/").pop() || "";
      return decodeURIComponent(parte.split("?")[0]) || "imagen";
    } catch (e) {
      return "imagen";
    }
  }

  function esImagenBibliotecaPermitida(file) {
    if (!file) return false;
    const mime = String(file.type || "").toLowerCase();
    if (MIME_FOTOS_BIBLIOTECA.includes(mime)) return true;
    const ext = String(file.name || "")
      .split(".")
      .pop()
      .toLowerCase();
    return ["jpg", "jpeg", "png", "webp"].includes(ext);
  }

  function obtenerConexionWhatsappIdBiblioteca() {
    if (typeof window.leerConexionWhatsappIdBuilder === "function") {
      return window.leerConexionWhatsappIdBuilder();
    }
    const raw = new URLSearchParams(window.location.search).get(
      "conexion_whatsapp_id"
    );
    return raw ? String(raw).trim() : null;
  }

  function normalizarItemBiblioteca(item) {
    return {
      id: String(item?.id || "").trim() || generarItemId(),
      url: String(item?.url || "").trim(),
      caption: String(item?.caption || "").trim(),
      filename: String(item?.filename || "").trim(),
      sizeBytes: Math.max(0, parseInt(item?.sizeBytes, 10) || 0),
    };
  }

  function normalizarListaBiblioteca(lista, conservarVacias) {
    let id = String(lista?.id || "").trim() || generarListId();
    const preset = obtenerDefTipoListaPreset(id);
    let name = String(lista?.name || "").trim();
    if (preset) {
      id = preset.id;
      name = preset.name;
    }
    const sendMode = SEND_MODES_VALIDOS.includes(lista?.sendMode)
      ? lista.sendMode
      : "random";
    const captionMode = CAPTION_MODES_VALIDOS.includes(lista?.captionMode)
      ? lista.captionMode
      : "caption_item";
    const sendCount = Math.min(20, Math.max(1, parseInt(lista?.sendCount, 10) || 3));
    const items = Array.isArray(lista?.items)
      ? lista.items.map(normalizarItemBiblioteca)
      : [];
    const itemsFiltrados = conservarVacias
      ? items
      : items.filter(function (it) {
          return !!(it.url || it.caption);
        });

    return {
      id: id,
      name: name,
      description: String(lista?.description || "").trim(),
      sendMode: sendMode,
      sendCount: sendCount,
      introText: String(lista?.introText || "").trim(),
      captionMode: captionMode,
      items: itemsFiltrados,
    };
  }

  function normalizarMediaLibrary(raw, conservarVacias) {
    const src = raw && typeof raw === "object" ? raw : {};
    const priorityMode = PRIORITY_MODES_VALIDOS.includes(src.priorityMode)
      ? src.priorityMode
      : "routes_library_gpt";
    const lists = Array.isArray(src.lists)
      ? src.lists.map(function (lista) {
          return normalizarListaBiblioteca(lista, conservarVacias);
        })
      : [];
    const listsFiltradas = conservarVacias
      ? lists
      : lists.filter(function (lista) {
          return !!(lista.name || lista.description || lista.items.length);
        });

    const ml = {
      enabled: src.enabled === true,
      priorityMode: priorityMode,
      lists: listsFiltradas,
    };
    return deduplicarListasBiblioteca(ml);
  }

  function contarListasBiblioteca(config) {
    const ml = config?.mediaLibrary;
    if (!ml?.enabled || !Array.isArray(ml.lists)) return 0;
    return ml.lists.length;
  }

  function obtenerRouteId(route) {
    return String(route?.id || route?.handle || route?.routeId || "").trim();
  }

  function asegurarIdsEnRoutes(cfg) {
    const lista = obtenerRoutes(cfg).map(function (r) {
      const id = obtenerRouteId(r) || generarRouteId();
      return { ...r, id: id };
    });
    cfg.caminos = lista;
    cfg.routes = lista;
    return lista;
  }

  function productDataATexto(pd) {
    const p = pd || {};
    const lineas = [];
    if (p.name) lineas.push("Producto: " + p.name);
    if (p.description) lineas.push("Descripción: " + p.description);
    if (p.price) lineas.push("Precio: " + p.price);
    if (p.includes) lineas.push("Incluye: " + p.includes);
    if (p.bonuses) lineas.push("Bonos: " + p.bonuses);
    if (p.guarantee) lineas.push("Garantía: " + p.guarantee);
    if (p.access) lineas.push("Acceso/entrega: " + p.access);
    if (p.paymentMethods) lineas.push("Métodos de pago: " + p.paymentMethods);
    if (p.faq) lineas.push("FAQ: " + p.faq);
    return lineas.join("\n");
  }

  function crearConfigPorDefecto() {
    return {
      version: 1,
      nombreNodo: "Agente OpenAI",
      scoreMinimo: 40,
      temperature: 0.7,
      model: "gpt-4o-mini",
      openaiPrompt: "",
      mediaLibrary: crearMediaLibraryPorDefecto(),
      caminos: [],
      routes: [],
    };
  }

  function obtenerRoutes(cfg) {
    const raw = cfg?.routes ?? cfg?.caminos;
    if (Array.isArray(raw)) return raw;
    return [];
  }

  function textoCamino(route) {
    return String(route?.text || route?.name || route?.nombre || "").trim();
  }

  function asegurarArraysCaminos(cfg) {
    const routes = Array.isArray(cfg?.routes) ? cfg.routes : [];
    const caminos = Array.isArray(cfg?.caminos) ? cfg.caminos : [];
    const base = caminos.length ? caminos : routes.length ? routes : [];
    const lista = base.map(function (r) {
      const copia = { ...r };
      const id = obtenerRouteId(copia) || generarRouteId();
      copia.id = id;
      return copia;
    });
    cfg.caminos = lista;
    cfg.routes = lista;
    return cfg;
  }

  function normalizarCaminos(caminos, soloValidos) {
    if (!Array.isArray(caminos)) return [];
    return caminos
      .map(function (r) {
        const syns = Array.isArray(r.synonyms)
          ? r.synonyms
          : String(r.synonyms || "")
              .split(",")
              .map(function (s) {
                return s.trim();
              })
              .filter(Boolean);
        const text = textoCamino(r);
        return {
          id: obtenerRouteId(r) || generarRouteId(),
          text: text,
          nombre: text,
          type: String(r.type || "texto").trim() || "texto",
          synonyms: syns,
          priority: parseInt(r.priority, 10) || 50,
          mediaId: r.mediaId ? String(r.mediaId).trim() : null,
          enabled: r.enabled !== false,
        };
      })
      .filter(function (r) {
        if (!r.id) return false;
        if (soloValidos === false) return true;
        return !!r.text;
      });
  }

  function sanitizeOpenAIData(local) {
    const src = local && typeof local === "object" ? local : {};
    const routes = normalizarCaminos(obtenerRoutes(src), true);
    const temp = parseFloat(src.temperature);
    let openaiPrompt = String(src.openaiPrompt || "").trim();
    if (!openaiPrompt) {
      openaiPrompt = productDataATexto(src.productData || {});
      if (!openaiPrompt && src.promptExtra) openaiPrompt = String(src.promptExtra).trim();
    }

    return {
      version: 1,
      nombreNodo: String(src.nombreNodo || "Agente OpenAI").trim(),
      scoreMinimo: Math.min(
        100,
        Math.max(0, parseInt(src.scoreMinimo, 10) || 40)
      ),
      temperature: Number.isFinite(temp) ? Math.min(1, Math.max(0, temp)) : 0.7,
      model: String(src.model || "gpt-4o-mini").trim() || "gpt-4o-mini",
      openaiPrompt: openaiPrompt,
      mediaLibrary: normalizarMediaLibrary(src.mediaLibrary, false),
      caminos: routes,
      routes: routes,
    };
  }

  function normalizarConfig(data) {
    const base = { ...crearConfigPorDefecto(), ...(data || {}) };
    return sanitizeOpenAIData(base);
  }

  function caminosParaVisual(config) {
    return normalizarCaminos(obtenerRoutes(config), false).filter(function (r) {
      return r.enabled !== false;
    });
  }

  function leerConfigDeNodo(nodo) {
    const box = nodo && nodo.querySelector(".openai-agent-data");
    if (!box) return crearConfigPorDefecto();
    try {
      const raw = (box.value || box.textContent || "").trim();
      if (!raw) return crearConfigPorDefecto();
      return normalizarConfig(JSON.parse(raw));
    } catch (e) {
      console.warn("IA Pro: JSON inválido", e.message);
      return crearConfigPorDefecto();
    }
  }

  function labelCaminoVisual(route) {
    const t = textoCamino(route);
    return t || "Camino sin nombre";
  }

  function tipoIconoCamino(route) {
    const t = textoCamino(route).toLowerCase();
    if (/\bqr\b|codigo\s*qr|pago\s*qr/.test(t) || t.includes("qr")) return "qr";
    if (/deposito|depósito|banco|transferencia/.test(t)) return "deposito";
    if (/garantia|garantía|devolucion|devolución|reembolso/.test(t)) return "garantia";
    return "default";
  }

  function ensureBadgeEnCirculo(circle) {
    if (!circle || circle.querySelector(".openai-agent-status-badge")) return;
    const badge = document.createElement("span");
    badge.className = "openai-agent-status-badge";
    badge.textContent = "IA ACTIVA";
    circle.insertBefore(badge, circle.firstChild);
  }

  function ensureEstructuraCircular(nodo) {
    nodo.querySelector(".openai-agent-node-left")?.remove();

    let shell = nodo.querySelector(".openai-agent-node-shell");
    if (shell) {
      const circle = shell.querySelector(".openai-agent-circle");
      if (circle) {
        ensureBadgeEnCirculo(circle);
        const iconWrap = circle.querySelector(".openai-agent-icon-wrap");
        if (iconWrap) {
          iconWrap.innerHTML = OPENAI_ICON_SVG;
        } else {
          const wrap = document.createElement(TAG_DIV);
          wrap.className = "openai-agent-icon-wrap";
          wrap.innerHTML = OPENAI_ICON_SVG;
          const title = circle.querySelector(".openai-agent-title");
          circle.insertBefore(wrap, title || null);
        }
      }
      return;
    }

    const portIn = nodo.querySelector(".port.in");
    const actions = nodo.querySelector(".node-actions");
    let titleEl = nodo.querySelector(".openai-agent-title");
    let bodyEl = nodo.querySelector(".openai-agent-body");

    shell = document.createElement(TAG_DIV);
    shell.className = "openai-agent-node-shell";

    const coreCol = document.createElement(TAG_DIV);
    coreCol.className = "openai-agent-core-column";

    const circle = document.createElement(TAG_DIV);
    circle.className = "openai-agent-circle";
    ensureBadgeEnCirculo(circle);
    if (portIn) circle.appendChild(portIn);
    if (actions) circle.appendChild(actions);

    const iconWrap = document.createElement(TAG_DIV);
    iconWrap.className = "openai-agent-icon-wrap";
    iconWrap.innerHTML = OPENAI_ICON_SVG;
    circle.appendChild(iconWrap);

    if (!titleEl) titleEl = document.createElement("h3");
    titleEl.className = "openai-agent-title";
    circle.appendChild(titleEl);

    if (!bodyEl) bodyEl = document.createElement(TAG_DIV);
    bodyEl.className = "openai-agent-body";
    coreCol.appendChild(circle);
    coreCol.appendChild(bodyEl);
    shell.appendChild(coreCol);

    const data = nodo.querySelector(".openai-agent-data");
    if (data) nodo.insertBefore(shell, data);
    else nodo.appendChild(shell);
  }

  function renderVisualNodo(nodo, config) {
    const activos = caminosParaVisual(config);
    const numListas = contarListasBiblioteca(config);
    ensureEstructuraCircular(nodo);
    ensureBadgeEnCirculo(nodo.querySelector(".openai-agent-circle"));

    nodo.querySelector(".openai-agent-routes-branch")?.remove();
    nodo.querySelectorAll(".port.out").forEach(function (p) {
      p.remove();
    });

    const body = nodo.querySelector(".openai-agent-body");
    const titleEl = nodo.querySelector(".openai-agent-title");
    if (!body || !titleEl) return;

    titleEl.textContent = config.nombreNodo || "Agente OpenAI";
    nodo.classList.remove("openai-agent-node--with-routes");

    const partesCuerpo = [];
    partesCuerpo.push(
      '<p class="openai-agent-subtitle' +
        (activos.length || numListas ? "" : " openai-agent-subtitle--muted") +
        '">OpenAI responde o enruta por caminos</p>'
    );

    if (numListas > 0) {
      partesCuerpo.push(
        '<p class="openai-agent-media-pill">🖼 ' +
          numListas +
          (numListas === 1 ? " lista" : " listas") +
          "</p>"
      );
    }

    if (!activos.length && !numListas) {
      partesCuerpo.push(
        '<p class="openai-agent-desc-pill openai-agent-desc-pill--empty">Doble click para configurar</p>'
      );
      body.innerHTML = partesCuerpo.join("");
      return;
    }

    body.innerHTML = partesCuerpo.join("");

    if (!activos.length) {
      return;
    }

    nodo.classList.add("openai-agent-node--with-routes");

    const shell = nodo.querySelector(".openai-agent-node-shell");
    const branch = document.createElement(TAG_DIV);
    branch.className = "openai-agent-routes-branch";

    const stem = document.createElement(TAG_DIV);
    stem.className = "openai-agent-routes-stem";
    stem.setAttribute("aria-hidden", "true");
    branch.appendChild(stem);

    const list = document.createElement("ul");
    list.className = "openai-agent-routes-list";

    activos.forEach(function (route) {
      const label = labelCaminoVisual(route);
      const iconTipo = tipoIconoCamino(route);
      const li = document.createElement("li");
      li.className =
        "openai-agent-route-pill openai-agent-route-pill--" + iconTipo;
      li.dataset.routeId = route.id;

      const iconWrap = document.createElement("span");
      iconWrap.className =
        "openai-agent-route-icon openai-agent-route-icon--" + iconTipo;
      iconWrap.innerHTML = ROUTE_ICON_SVG[iconTipo] || ROUTE_ICON_SVG.default;
      li.appendChild(iconWrap);

      const name = document.createElement("span");
      name.className = "openai-agent-route-name";
      name.textContent = label;
      li.appendChild(name);

      const port = document.createElement(TAG_DIV);
      port.className = "port out openai-agent-port-route";
      port.dataset.nodo = nodo.id;
      port.dataset.handle = route.id;
      port.title = label;
      li.appendChild(port);

      list.appendChild(li);
    });

    branch.appendChild(list);
    if (shell) shell.appendChild(branch);

    if (typeof actualizarHandlersPuertosCanvas === "function") {
      actualizarHandlersPuertosCanvas();
    }
    if (typeof actualizarLineas === "function") actualizarLineas();
  }

  function actualizarHTMLNodo(nodo, cleanData) {
    if (!nodo) return;
    const cfg = sanitizeOpenAIData(cleanData);
    const json = JSON.stringify(cfg);
    const box = nodo.querySelector(".openai-agent-data");
    if (box) {
      box.value = json;
      box.textContent = json;
    } else {
      const ta = document.createElement("textarea");
      ta.className = "openai-agent-data";
      ta.style.display = "none";
      ta.value = json;
      nodo.appendChild(ta);
    }
    renderVisualNodo(nodo, cfg);
    configActiva = cfg;
  }

  function syncCaminosDesdeDom() {
    const wrap = document.getElementById("openaiAgentCaminosLista");
    const rows = wrap
      ? wrap.querySelectorAll(".openai-agent-ruta-row")
      : [];
    const caminos = [];
    rows.forEach(function (row) {
      const id = String(row.dataset.routeId || "").trim();
      if (!id) return;
      const text = row.querySelector(".openai-agent-ruta-texto")?.value.trim() || "";
      const synsRaw = row.querySelector(".openai-agent-ruta-sinonimos")?.value || "";
      const syns = synsRaw
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      caminos.push({
        id: id,
        text: text,
        name: text,
        nombre: text,
        type: "texto",
        synonyms: syns,
        priority: parseInt(row.querySelector(".openai-agent-ruta-prioridad")?.value, 10) || 50,
        mediaId: row.querySelector(".openai-agent-ruta-media")?.value.trim() || null,
        enabled: row.querySelector(".openai-agent-ruta-enabled")?.checked !== false,
      });
    });
    configActiva.caminos = caminos;
    configActiva.routes = caminos;
    return caminos;
  }

  function eliminarRutaPorId(routeId) {
    const rid = String(routeId || "").trim();
    if (!rid) return;

    syncCaminosDesdeDom();
    asegurarArraysCaminos(configActiva);

    const antes = obtenerRoutes(configActiva).map(function (r) {
      return obtenerRouteId(r);
    });
    console.log("[OPENAI_ROUTES] eliminar ruta", { routeId: rid });
    console.log("[OPENAI_ROUTES] rutas antes", antes);

    const filtrada = obtenerRoutes(configActiva).filter(function (r) {
      return obtenerRouteId(r) !== rid;
    });
    configActiva.caminos = filtrada;
    configActiva.routes = filtrada;

    console.log(
      "[OPENAI_ROUTES] rutas después",
      filtrada.map(function (r) {
        return obtenerRouteId(r);
      })
    );

    if (nodoActivo && typeof window.eliminarConexionesPorHandle === "function") {
      window.eliminarConexionesPorHandle(nodoActivo.id, rid);
    }

    renderCaminosEditor();
    onFormChange();
  }

  function syncMediaLibraryDesdeDom() {
    const ml = asegurarMediaLibrary(configActiva);
    ml.enabled =
      document.getElementById("openaiAgentMediaEnabled")?.checked === true;
    const priorityRaw =
      document.getElementById("openaiAgentPriorityMode")?.value || "";
    ml.priorityMode = PRIORITY_MODES_VALIDOS.includes(priorityRaw)
      ? priorityRaw
      : "routes_library_gpt";

    const wrap = document.getElementById("openaiAgentMediaLists");
    const rows = wrap ? wrap.querySelectorAll(".oai-media-list-row") : [];
    const lists = [];

    rows.forEach(function (row) {
      const listId = String(row.dataset.listId || "").trim();
      if (!listId) return;

      const itemRows = row.querySelectorAll(".oai-media-item-row");
      const items = [];
      itemRows.forEach(function (itemRow) {
        const itemId = String(itemRow.dataset.itemId || "").trim();
        if (!itemId) return;
        items.push({
          id: itemId,
          url: itemRow.querySelector(".oai-media-item-url")?.value.trim() || "",
          caption:
            itemRow.querySelector(".oai-media-item-caption")?.value.trim() || "",
          filename:
            itemRow.querySelector(".oai-media-item-filename")?.value.trim() ||
            itemRow.dataset.filename ||
            "",
          sizeBytes:
            parseInt(
              itemRow.querySelector(".oai-media-item-sizebytes")?.value,
              10
            ) ||
            parseInt(itemRow.dataset.sizeBytes, 10) ||
            0,
        });
      });

      const tipoSel =
        row.querySelector(".oai-media-list-tipo")?.value || "personalizada";
      let idLista = listId;
      let nombreLista = "";

      if (tipoSel !== "personalizada" && obtenerDefTipoListaPreset(tipoSel)) {
        const def = obtenerDefTipoListaPreset(tipoSel);
        idLista = def.id;
        nombreLista = def.name;
      } else {
        if (esIdTipoListaPreset(listId)) {
          idLista = generarListId();
        }
        nombreLista =
          row.querySelector(".oai-media-list-custom-name")?.value.trim() || "";
      }

      const listaNueva = {
        id: idLista,
        name: nombreLista,
        description:
          row.querySelector(".oai-media-list-desc")?.value.trim() || "",
        sendMode: row.querySelector(".oai-media-list-sendmode")?.value || "random",
        sendCount:
          parseInt(row.querySelector(".oai-media-list-sendcount")?.value, 10) || 3,
        introText:
          row.querySelector(".oai-media-list-intro")?.value.trim() || "",
        captionMode:
          row.querySelector(".oai-media-list-captionmode")?.value || "caption_item",
        items: items,
      };

      const duplicada = lists.find(function (l) {
        return l.id === listaNueva.id;
      });
      if (duplicada) {
        fusionarItemsLista(duplicada, listaNueva);
        return;
      }

      lists.push(listaNueva);
    });

    ml.lists = lists;
    deduplicarListasBiblioteca(ml);
    if (ml.enabled && ml.lists.length === 0) {
      asegurarListasPredeterminadasBiblioteca(ml);
    }
    configActiva.mediaLibrary = ml;
    return ml;
  }

  function syncCamposPanelDraft() {
    if (!configActiva || typeof configActiva !== "object") {
      configActiva = crearConfigPorDefecto();
    }
    configActiva.nombreNodo =
      document.getElementById("openaiAgentNombreNodo")?.value.trim() || "Agente OpenAI";
    configActiva.scoreMinimo =
      parseInt(document.getElementById("openaiAgentScoreMinimo")?.value, 10) || 40;
    const temp = parseFloat(document.getElementById("openaiAgentTemperature")?.value);
    configActiva.temperature = Number.isFinite(temp)
      ? Math.min(1, Math.max(0, temp))
      : 0.7;
    configActiva.model =
      document.getElementById("openaiAgentModel")?.value.trim() || "gpt-4o-mini";
    configActiva.openaiPrompt =
      document.getElementById("openaiAgentPrompt")?.value.trim() || "";
    syncCaminosDesdeDom();
    asegurarArraysCaminos(configActiva);
    if (document.getElementById("openaiAgentMediaLists")) {
      syncMediaLibraryDesdeDom();
    } else {
      asegurarMediaLibrary(configActiva);
    }
    return configActiva;
  }

  function renderCaminosEditor() {
    const wrap = document.getElementById("openaiAgentCaminosLista");
    if (!wrap) return;
    asegurarIdsEnRoutes(configActiva);
    const routes = obtenerRoutes(configActiva);
    if (!routes.length) {
      wrap.innerHTML =
        '<p class="openai-agent-caminos-vacio oai-routes-empty">No hay caminos. Agrega uno.</p>';
      return;
    }
    wrap.innerHTML = routes
      .map(function (route, index) {
        const syns = Array.isArray(route.synonyms)
          ? route.synonyms.join(", ")
          : "";
        const label = textoCamino(route) || "Sin nombre";
        return (
          '<div class="openai-agent-ruta-row oai-route-card" data-route-id="' +
          esc(route.id) +
          '">' +
          '<div class="openai-agent-ruta-head oai-route-card__head">' +
          '<div class="oai-route-card__title">' +
          '<span class="oai-route-badge">Ruta ' +
          (index + 1) +
          "</span>" +
          '<span class="oai-route-name-preview">' +
          esc(label) +
          "</span></div>" +
          '<div class="oai-route-card__toolbar">' +
          '<label class="oai-toggle"><input type="checkbox" class="openai-agent-ruta-enabled"' +
          (route.enabled !== false ? " checked" : "") +
          '><span class="oai-toggle__track" aria-hidden="true"></span><span class="oai-toggle__label">Activo</span></label>' +
          '<button type="button" class="openai-agent-ruta-del oai-btn oai-btn--danger oai-btn--sm" data-route-id="' +
          esc(route.id) +
          '">Eliminar</button>' +
          "</div></div>" +
          '<div class="oai-route-card__body">' +
          '<div class="panel-campo oai-field"><label>Texto del camino</label><input class="openai-agent-ruta-texto oai-input" value="' +
          esc(textoCamino(route)) +
          '"></div>' +
          '<div class="panel-campo oai-field"><label>Sinónimos (coma)</label><textarea class="openai-agent-ruta-sinonimos ia-textarea oai-input oai-textarea" rows="2">' +
          esc(syns) +
          "</textarea></div>" +
          '<div class="oai-field-row">' +
          '<div class="panel-campo oai-field oai-field--half"><label>Prioridad</label><input type="number" class="openai-agent-ruta-prioridad oai-input" min="0" max="100" value="' +
          (route.priority || 50) +
          '"></div>' +
          '<div class="panel-campo oai-field oai-field--half"><label>Media ID / URL</label><input class="openai-agent-ruta-media oai-input" value="' +
          esc(route.mediaId || "") +
          '"></div></div>' +
          '<p class="ia-handle-hint oai-handle-hint">Handle conexión: <code>' +
          esc(route.id) +
          "</code></p></div></div>"
        );
      })
      .join("");

    wrap.querySelectorAll(".openai-agent-ruta-del").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const rid =
          String(btn.dataset.routeId || "").trim() ||
          String(btn.closest(".openai-agent-ruta-row")?.dataset.routeId || "").trim();
        eliminarRutaPorId(rid);
      });
    });
    wrap.querySelectorAll("input, textarea").forEach(function (el) {
      el.addEventListener("input", onFormChange);
      el.addEventListener("change", onFormChange);
    });
  }

  function agregarCamino() {
    syncCamposPanelDraft();
    const nuevo = {
      id: generarRouteId(),
      text: "",
      name: "",
      nombre: "",
      synonyms: [],
      priority: 50,
      mediaId: null,
      enabled: true,
    };
    asegurarArraysCaminos(configActiva);
    configActiva.caminos.push(nuevo);
    configActiva.routes = configActiva.caminos;
    renderCaminosEditor();
    if (nodoActivo) renderVisualNodo(nodoActivo, configActiva);
  }

  function renderItemsBibliotecaEditor(lista) {
    const items = Array.isArray(lista?.items) ? lista.items : [];
    if (!items.length) {
      return '<p class="oai-media-items-empty">Sin fotos. Usa «Subir foto».</p>';
    }
    return items
      .map(function (item, idx) {
        const nombre = nombreArchivoDesdeItem(item);
        const tamano = formatoTamanoArchivo(item.sizeBytes);
        const url = String(item.url || "").trim();
        return (
          '<div class="oai-media-item-row" data-item-id="' +
          esc(item.id) +
          '" data-filename="' +
          esc(nombre) +
          '" data-size-bytes="' +
          esc(String(item.sizeBytes || 0)) +
          '">' +
          '<div class="oai-media-item-head">' +
          '<span class="oai-media-item-badge">Foto ' +
          (idx + 1) +
          "</span>" +
          '<button type="button" class="oai-media-item-del oai-btn oai-btn--danger oai-btn--sm" data-list-id="' +
          esc(lista.id) +
          '" data-item-id="' +
          esc(item.id) +
          '">Eliminar</button></div>' +
          '<div class="oai-media-item-preview">' +
          (url
            ? '<img class="oai-media-item-thumb" src="' +
              esc(url) +
              '" alt="' +
              esc(nombre) +
              '">'
            : '<div class="oai-media-item-thumb oai-media-item-thumb--empty">Sin imagen</div>') +
          '<div class="oai-media-item-meta">' +
          '<span class="oai-media-item-filename-text">' +
          esc(nombre) +
          "</span>" +
          (tamano
            ? '<span class="oai-media-item-size-text">' + esc(tamano) + "</span>"
            : "") +
          "</div></div>" +
          '<input type="hidden" class="oai-media-item-url" value="' +
          esc(url) +
          '">' +
          '<input type="hidden" class="oai-media-item-filename" value="' +
          esc(nombre) +
          '">' +
          '<input type="hidden" class="oai-media-item-sizebytes" value="' +
          esc(String(item.sizeBytes || 0)) +
          '">' +
          '<div class="panel-campo oai-field"><label>Caption</label>' +
          '<input class="oai-media-item-caption oai-input" value="' +
          esc(item.caption || "") +
          '"></div></div>'
        );
      })
      .join("");
  }

  function marcarSubidaFotoBiblioteca(listId, activa) {
    const lid = String(listId || "").trim();
    const btn = document.querySelector(
      '.oai-media-list-upload-foto[data-list-id="' + lid + '"]'
    );
    if (!btn) return;
    btn.disabled = !!activa;
    btn.textContent = activa ? "Subiendo…" : "Subir foto";
    btn.classList.toggle("oai-btn--uploading", !!activa);
  }

  function subirFotoBiblioteca(listId, file) {
    const lid = String(listId || "").trim();
    let listIdCanon = lid;
    if (!lid || !file || subidaFotoBibliotecaActiva) return;

    if (!esImagenBibliotecaPermitida(file)) {
      mostrarToastBiblioteca(
        "Formato no permitido. Usa JPG, JPEG, PNG o WEBP.",
        "warn"
      );
      return;
    }

    if (file.size >= MAX_FOTO_BIBLIOTECA_BYTES) {
      mostrarToastBiblioteca("La imagen supera el límite de 5 MB.", "warn");
      return;
    }

    const conexionWhatsappId = obtenerConexionWhatsappIdBiblioteca();
    if (!conexionWhatsappId) {
      mostrarToastBiblioteca(
        "Asigna una línea WhatsApp al flujo para subir fotos.",
        "warn"
      );
      return;
    }

    syncCamposPanelDraft();
    asegurarMediaLibrary(configActiva);
    deduplicarListasBiblioteca(configActiva.mediaLibrary);

    const listaRef = configActiva.mediaLibrary.lists.find(function (l) {
      return l.id === lid;
    });
    if (!listaRef) return;

    const tituloLista = tituloListaBiblioteca(listaRef);
    listIdCanon = listaRef.id;

    subidaFotoBibliotecaActiva = true;
    marcarSubidaFotoBiblioteca(listIdCanon, true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("tipo", "imagen");
    formData.append("conexion_whatsapp_id", conexionWhatsappId);

    fetch(UPLOAD_BIBLIOTECA_ENDPOINT, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) {
            throw new Error(data?.error || "Error al subir imagen");
          }
          return data;
        });
      })
      .then(function (data) {
        const publicUrl = String(data?.publicUrl || data?.url || "").trim();
        if (!publicUrl) {
          throw new Error("Respuesta sin URL pública");
        }

        const lista = configActiva.mediaLibrary.lists.find(function (l) {
          return l.id === listIdCanon;
        });
        if (!lista) {
          throw new Error("La lista ya no existe en el panel");
        }

        if (!Array.isArray(lista.items)) lista.items = [];
        lista.items.push({
          id: generarItemId(),
          url: publicUrl,
          caption: "",
          filename: data.filename || file.name || "",
          sizeBytes: data.size || file.size || 0,
        });

        deduplicarListasBiblioteca(configActiva.mediaLibrary);
        renderMediaLibraryEditor();
        persistirBibliotecaActivaEnNodo();
        scheduleRenderVisual();
        scrollToListaBiblioteca(listIdCanon);
        resaltarUltimaFotoLista(listIdCanon);
        mostrarToastBiblioteca("Foto subida a " + tituloLista, "success");
      })
      .catch(function (err) {
        mostrarToastBiblioteca(
          err?.message || "❌ Error al subir imagen",
          "error"
        );
      })
      .finally(function () {
        subidaFotoBibliotecaActiva = false;
        marcarSubidaFotoBiblioteca(listIdCanon, false);
      });
  }

  function iniciarSubidaFotoBiblioteca(listId) {
    const lid = String(listId || "").trim();
    if (!lid || subidaFotoBibliotecaActiva) return;
    const input = document.querySelector(
      '.oai-media-file-input[data-list-id="' + lid + '"]'
    );
    if (!input) return;
    input.value = "";
    input.click();
  }

  function bindMediaLibraryEditorEvents() {
    const wrap = document.getElementById("openaiAgentMediaLists");
    if (!wrap) return;

    wrap.querySelectorAll(".oai-media-list-del").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        eliminarListaPorId(btn.dataset.listId);
      });
    });

    wrap.querySelectorAll(".oai-media-item-del").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        eliminarFotoPorId(btn.dataset.listId, btn.dataset.itemId);
      });
    });

    wrap.querySelectorAll(".oai-media-list-upload-foto").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        iniciarSubidaFotoBiblioteca(btn.dataset.listId);
      });
    });

    wrap.querySelectorAll(".oai-media-file-input").forEach(function (input) {
      input.addEventListener("change", function () {
        const file = input.files?.[0];
        if (!file) return;
        subirFotoBiblioteca(input.dataset.listId, file);
        input.value = "";
      });
    });

    wrap.querySelectorAll(".oai-media-list-tipo").forEach(function (sel) {
      sel.addEventListener("change", function () {
        const row = sel.closest(".oai-media-list-row");
        if (!row) return;

        const wrapNombre = row.querySelector(".oai-media-list-custom-name-wrap");
        const esPersonalizada = sel.value === "personalizada";
        if (wrapNombre) {
          wrapNombre.style.display = esPersonalizada ? "" : "none";
        }

        if (!esPersonalizada && obtenerDefTipoListaPreset(sel.value)) {
          row.dataset.listId = sel.value;
          const hint = row.querySelector(".oai-media-list-id-hint code");
          if (hint) hint.textContent = sel.value;
        } else if (esPersonalizada && esIdTipoListaPreset(row.dataset.listId)) {
          const nuevoId = generarListId();
          row.dataset.listId = nuevoId;
          const hint = row.querySelector(".oai-media-list-id-hint code");
          if (hint) hint.textContent = nuevoId;
        }

        aplicarDescripcionIATipoEnFila(row, sel.value);

        onFormChange();
        renderMediaLibraryEditor();
      });
    });

    wrap.querySelectorAll("input, textarea, select").forEach(function (el) {
      if (el.classList.contains("oai-media-list-tipo")) return;
      el.addEventListener("input", onFormChange);
      el.addEventListener("change", onFormChange);
    });
  }

  function renderMediaLibraryEditor() {
    const wrap = document.getElementById("openaiAgentMediaLists");
    if (!wrap) return;

    asegurarMediaLibrary(configActiva);
    deduplicarListasBiblioteca(configActiva.mediaLibrary);
    const lists = configActiva.mediaLibrary.lists || [];

    if (!lists.length) {
      wrap.innerHTML =
        '<p class="oai-media-lists-empty">No hay listas. Agrega una biblioteca.</p>';
      return;
    }

    wrap.innerHTML = lists
      .map(function (lista, index) {
        const titulo = tituloListaBiblioteca(lista);
        const tipoLista = resolverTipoListaDesdeLista(lista);
        const esPersonalizada = tipoLista === "personalizada";
        const esPreset = tipoLista !== "personalizada";
        return (
          '<div class="oai-media-list-row' +
          (esPreset ? " oai-media-list-row--preset" : "") +
          '" data-list-id="' +
          esc(lista.id) +
          '">' +
          '<div class="oai-media-list-head">' +
          '<div class="oai-media-list-title">' +
          '<span class="oai-media-list-badge">Lista ' +
          (index + 1) +
          "</span>" +
          '<h6 class="oai-media-list-title-heading">' +
          esc(titulo) +
          "</h6></div>" +
          '<button type="button" class="oai-media-list-del oai-btn oai-btn--danger oai-btn--sm" data-list-id="' +
          esc(lista.id) +
          '">Eliminar lista</button></div>' +
          '<div class="oai-media-list-body">' +
          '<div class="panel-campo oai-field"><label>Tipo de lista</label>' +
          '<select class="oai-media-list-tipo oai-input">' +
          renderOpcionesTipoLista(lista) +
          "</select></div>" +
          '<div class="oai-media-list-custom-name-wrap panel-campo oai-field"' +
          (esPersonalizada ? "" : ' style="display:none;"') +
          '><label>Nombre personalizado</label>' +
          '<input class="oai-media-list-custom-name oai-input" value="' +
          esc(esPersonalizada ? lista.name || "" : "") +
          '" placeholder="Ej: promociones"></div>' +
          '<div class="panel-campo oai-field"><label>Descripción para IA</label>' +
          '<textarea class="oai-media-list-desc oai-input oai-textarea" rows="2" placeholder="Ej: Fotos de ejemplos del producto">' +
          esc(lista.description || "") +
          "</textarea></div>" +
          '<div class="oai-field-row">' +
          '<div class="panel-campo oai-field oai-field--half"><label>Modo envío</label>' +
          '<select class="oai-media-list-sendmode oai-input">' +
          '<option value="random"' +
          (lista.sendMode === "random" ? " selected" : "") +
          '>Aleatorio</option>' +
          '<option value="all"' +
          (lista.sendMode === "all" ? " selected" : "") +
          '>Todas</option>' +
          '<option value="first"' +
          (lista.sendMode === "first" ? " selected" : "") +
          '>Primera</option></select></div>' +
          '<div class="panel-campo oai-field oai-field--half"><label>Cantidad</label>' +
          '<input type="number" class="oai-media-list-sendcount oai-input" min="1" max="20" value="' +
          (lista.sendCount || 3) +
          '"></div></div>' +
          '<div class="oai-field-row">' +
          '<div class="panel-campo oai-field oai-field--grow"><label>Texto previo</label>' +
          '<input class="oai-media-list-intro oai-input" value="' +
          esc(lista.introText || "") +
          '" placeholder="Mensaje antes de enviar fotos"></div>' +
          '<div class="panel-campo oai-field oai-field--half"><label>Caption</label>' +
          '<select class="oai-media-list-captionmode oai-input">' +
          '<option value="caption_item"' +
          (lista.captionMode === "caption_item" ? " selected" : "") +
          '>Por foto</option>' +
          '<option value="same_caption"' +
          (lista.captionMode === "same_caption" ? " selected" : "") +
          '>Igual todas</option>' +
          '<option value="none"' +
          (lista.captionMode === "none" ? " selected" : "") +
          '>Sin caption</option></select></div></div>' +
          '<p class="ia-handle-hint oai-handle-hint oai-media-list-id-hint">ID lista: <code>' +
          esc(lista.id) +
          "</code></p>" +
          '<div class="oai-media-items-wrap">' +
          renderItemsBibliotecaEditor(lista) +
          "</div>" +
          '<div class="oai-media-list-upload-wrap">' +
          '<input type="file" class="oai-media-file-input" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" style="display:none" data-list-id="' +
          esc(lista.id) +
          '">' +
          '<button type="button" class="oai-media-list-upload-foto oai-btn oai-btn--add oai-btn--sm" data-list-id="' +
          esc(lista.id) +
          '">Subir foto</button></div></div></div>'
        );
      })
      .join("");

    bindMediaLibraryEditorEvents();
  }

  function eliminarListaPorId(listId) {
    const lid = String(listId || "").trim();
    if (!lid) return;

    syncMediaLibraryDesdeDom();
    asegurarMediaLibrary(configActiva);
    configActiva.mediaLibrary.lists = configActiva.mediaLibrary.lists.filter(
      function (lista) {
        return lista.id !== lid;
      }
    );
    renderMediaLibraryEditor();
    onFormChange();
  }

  function eliminarFotoPorId(listId, itemId) {
    const lid = String(listId || "").trim();
    const iid = String(itemId || "").trim();
    if (!lid || !iid) return;

    syncMediaLibraryDesdeDom();
    asegurarMediaLibrary(configActiva);
    const lista = configActiva.mediaLibrary.lists.find(function (l) {
      return l.id === lid;
    });
    if (!lista) return;
    lista.items = (lista.items || []).filter(function (it) {
      return it.id !== iid;
    });
    renderMediaLibraryEditor();
    onFormChange();
  }

  function agregarListaBiblioteca() {
    syncCamposPanelDraft();
    asegurarMediaLibrary(configActiva);
    configActiva.mediaLibrary.enabled = true;
    configActiva.mediaLibrary.lists.push(crearListaBibliotecaVacia());
    const enabledEl = document.getElementById("openaiAgentMediaEnabled");
    if (enabledEl) enabledEl.checked = true;
    renderMediaLibraryEditor();
    onFormChange();
  }

  function renderPanel(nodo) {
    if (!nodo) return;
    nodoActivo = nodo;
    configActiva = leerConfigDeNodo(nodo);
    asegurarIdsEnRoutes(configActiva);
    asegurarMediaLibrary(configActiva);
    deduplicarListasBiblioteca(configActiva.mediaLibrary);
    if (configActiva.mediaLibrary.enabled) {
      asegurarListasPredeterminadasBiblioteca(configActiva.mediaLibrary);
    }
    const ml = configActiva.mediaLibrary;
    const contenido = document.getElementById("panelNodoContenido");
    if (!contenido) return;

    const panelShell = document.getElementById("panelNodo");
    if (panelShell) {
      panelShell.classList.add("panel-nodo--openai-agent");
    }

    contenido.innerHTML =
      '<div class="openai-agent-panel oai-panel-root">' +
      '<header class="oai-panel-hero">' +
      '<div class="oai-panel-hero__top">' +
      '<div class="oai-panel-hero__titles">' +
      '<h4 class="oai-panel-hero__title">Agente OpenAI</h4>' +
      '<span class="oai-panel-hero__badge">IA activa</span>' +
      "</div></div>" +
      '<p class="ia-panel-desc oai-panel-hero__desc">OpenAI responde al lead o enruta por caminos sin texto extra.</p>' +
      "</header>" +
      '<div class="oai-panel-scroll">' +
      '<section class="oai-card oai-card--model">' +
      '<h5 class="oai-card__title">Configuración del modelo</h5>' +
      '<div class="panel-campo oai-field"><label>Nombre del nodo</label><input id="openaiAgentNombreNodo" class="oai-input" value="' +
      esc(configActiva.nombreNodo) +
      '"></div>' +
      '<div class="oai-field-row">' +
      '<div class="panel-campo oai-field oai-field--grow"><label>Modelo</label><input id="openaiAgentModel" class="oai-input" value="' +
      esc(configActiva.model || "gpt-4o-mini") +
      '"></div>' +
      '<div class="panel-campo oai-field oai-field--sm"><label>Temperatura</label><input id="openaiAgentTemperature" class="oai-input" type="number" min="0" max="1" step="0.1" value="' +
      (configActiva.temperature ?? 0.7) +
      '"></div></div>' +
      '<div class="panel-campo oai-field"><label>Score mínimo caminos</label><input id="openaiAgentScoreMinimo" class="oai-input" type="number" min="0" max="100" value="' +
      configActiva.scoreMinimo +
      '"></div></section>' +
      '<section class="oai-card oai-card--prompt">' +
      '<h5 class="oai-card__title">Prompt del producto</h5>' +
      '<div class="panel-campo oai-field oai-field--prompt"><label>Instrucciones y datos del producto</label>' +
      '<textarea id="openaiAgentPrompt" class="ia-textarea openai-agent-prompt-area oai-input oai-textarea oai-textarea--prompt" rows="12" placeholder="' +
      esc(PROMPT_PLACEHOLDER) +
      '">' +
      esc(configActiva.openaiPrompt || "") +
      "</textarea></div></section>" +
      '<section class="oai-card oai-card--media-library">' +
      '<h5 class="oai-card__title">🖼 Biblioteca Multimedia IA</h5>' +
      '<p class="oai-card__hint">Listas de fotos que OpenAI podrá elegir por nombre (sin analizar imágenes).</p>' +
      '<div class="oai-field-row oai-field-row--media-toggle">' +
      '<label class="oai-toggle oai-toggle--media"><input type="checkbox" id="openaiAgentMediaEnabled"' +
      (ml.enabled ? " checked" : "") +
      '><span class="oai-toggle__track" aria-hidden="true"></span><span class="oai-toggle__label">Biblioteca activa</span></label></div>' +
      '<div class="panel-campo oai-field"><label>Prioridad</label>' +
      '<select id="openaiAgentPriorityMode" class="oai-input">' +
      '<option value="routes_library_gpt"' +
      (ml.priorityMode === "routes_library_gpt" ? " selected" : "") +
      '>Caminos → Biblioteca → GPT</option>' +
      '<option value="library_routes_gpt"' +
      (ml.priorityMode === "library_routes_gpt" ? " selected" : "") +
      '>Biblioteca → Caminos → GPT</option>' +
      '<option value="gpt_only"' +
      (ml.priorityMode === "gpt_only" ? " selected" : "") +
      '>Solo GPT</option></select></div>' +
      '<div id="openaiAgentMediaLists" class="oai-media-lists"></div>' +
      '<button type="button" class="panel-btn oai-btn oai-btn--add" id="openaiAgentAgregarLista">+ Lista</button>' +
      "</section>" +
      '<section class="oai-card oai-card--routes">' +
      '<h5 class="oai-card__title">Caminos inteligentes</h5>' +
      '<p class="oai-card__hint">Cada salida usa sinónimos para detectar intención del lead.</p>' +
      '<div id="openaiAgentCaminosLista" class="oai-routes-list"></div>' +
      '<button type="button" class="panel-btn oai-btn oai-btn--add" id="openaiAgentAgregarCamino">+ Agregar camino</button>' +
      "</section>" +
      '<section class="oai-card oai-card--actions">' +
      '<h5 class="oai-card__title">Acciones</h5>' +
      '<button type="button" class="panel-btn oai-btn oai-btn--save" id="openaiAgentGuardarPanel">Guardar Agente OpenAI</button>' +
      "</section></div></div>";

    renderMediaLibraryEditor();
    renderCaminosEditor();
    document.getElementById("openaiAgentAgregarLista")?.addEventListener("click", function (ev) {
      ev.preventDefault();
      agregarListaBiblioteca();
    });
    document.getElementById("openaiAgentAgregarCamino")?.addEventListener("click", function (ev) {
      ev.preventDefault();
      agregarCamino();
    });
    document.getElementById("openaiAgentGuardarPanel")?.addEventListener("click", function (ev) {
      ev.preventDefault();
      guardarDesdePanel(ev);
    });
    [
      "openaiAgentNombreNodo",
      "openaiAgentScoreMinimo",
      "openaiAgentTemperature",
      "openaiAgentModel",
      "openaiAgentPrompt",
      "openaiAgentMediaEnabled",
      "openaiAgentPriorityMode",
    ].forEach(function (id) {
      document.getElementById(id)?.addEventListener("input", onFormChange);
      document.getElementById(id)?.addEventListener("change", onFormChange);
    });
  }

  function scheduleRenderVisual() {
    if (!nodoActivo) return;
    if (renderVisualTimer) clearTimeout(renderVisualTimer);
    renderVisualTimer = setTimeout(function () {
      renderVisualTimer = null;
      renderVisualNodo(nodoActivo, configActiva);
    }, 180);
  }

  function onFormChange() {
    const listasAntes =
      configActiva?.mediaLibrary?.lists?.length || 0;
    const enabledAntes = configActiva?.mediaLibrary?.enabled === true;
    syncCamposPanelDraft();
    const ml = configActiva?.mediaLibrary;
    const debeRenderBiblioteca =
      document.getElementById("openaiAgentMediaLists") &&
      (ml?.lists?.length !== listasAntes ||
        (ml?.enabled && !enabledAntes && ml?.lists?.length > 0));
    if (debeRenderBiblioteca) {
      renderMediaLibraryEditor();
    }
    scheduleRenderVisual();
    if (typeof window.macbotRecordHistoryDebounced === "function") {
      window.macbotRecordHistoryDebounced();
    }
  }

  function guardarDesdePanel(ev) {
    if (ev?.preventDefault) ev.preventDefault();
    if (!nodoActivo) return;
    if (renderVisualTimer) {
      clearTimeout(renderVisualTimer);
      renderVisualTimer = null;
    }
    syncCamposPanelDraft();
    actualizarHTMLNodo(nodoActivo, sanitizeOpenAIData(configActiva));
    if (typeof actualizarHandlersPuertosCanvas === "function") {
      actualizarHandlersPuertosCanvas();
    }
    if (typeof actualizarLineas === "function") actualizarLineas();
    if (typeof cerrarPanelNodo === "function") cerrarPanelNodo();
    if (typeof registrarHistorialBuilder === "function") registrarHistorialBuilder();
  }

  function flushPanelToNode() {
    if (!nodoActivo) return;
    syncCamposPanelDraft();
    actualizarHTMLNodo(nodoActivo, sanitizeOpenAIData(configActiva));
  }

  function clearPanelActivo() {
    if (renderVisualTimer) clearTimeout(renderVisualTimer);
    renderVisualTimer = null;
    nodoActivo = null;
    configActiva = crearConfigPorDefecto();
    document.getElementById("panelNodo")?.classList.remove("panel-nodo--openai-agent");
  }

  function getNodoActivo() {
    return nodoActivo;
  }

  function esNodoOpenAIAgent(nodo) {
    return (
      nodo &&
      (nodo.dataset.tipo === "openai_agent" ||
        nodo.classList.contains("openai-agent-node") ||
        !!nodo.querySelector(".openai-agent-data"))
    );
  }

  function crearNodoEnCanvas() {
    const canvas = document.getElementById("canvasFlujo");
    if (!canvas) {
      alert("No existe canvasFlujo");
      return null;
    }
    if (typeof registrarHistorialBuilder === "function") registrarHistorialBuilder();
    if (typeof nodoCount !== "undefined") {
      nodoCount++;
    } else {
      window.nodoCount = (window.nodoCount || 0) + 1;
    }
    const id =
      "nodo_" + (typeof nodoCount !== "undefined" ? nodoCount : window.nodoCount);
    const cfg = crearConfigPorDefecto();
    const json = JSON.stringify(cfg);

    const nodo = document.createElement(TAG_DIV);
    nodo.className = "node openai-agent-node";
    nodo.id = id;
    nodo.dataset.tipo = "openai_agent";

    nodo.style.left = (280 + nodoCount * 40) + "px";
    nodo.style.top = (260 + nodoCount * 30) + "px";

    nodo.innerHTML =
      '<div class="openai-agent-node-shell"><div class="openai-agent-core-column">' +
      '<div class="openai-agent-circle">' +
      '<div class="port in" data-nodo="' +
      id +
      '" onmousedown="iniciarConexion(event, \'' +
      id +
      '\', \'in\')"></div>' +
      '<div class="node-actions">' +
      '<button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo(\'' +
      id +
      '\')">✎</button>' +
      '<button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo(\'' +
      id +
      '\')">×</button></div>' +
      '<span class="openai-agent-status-badge">IA ACTIVA</span>' +
      '<div class="openai-agent-icon-wrap">' +
      OPENAI_ICON_SVG +
      '</div><h3 class="openai-agent-title">Agente OpenAI</h3></div>' +
      '<div class="openai-agent-body">' +
      '<p class="openai-agent-subtitle openai-agent-subtitle--muted">OpenAI responde o enruta por caminos</p>' +
      '<p class="openai-agent-desc-pill openai-agent-desc-pill--empty">Doble click para configurar</p></div></div></div>' +
      '<textarea class="openai-agent-data" style="display:none;">' +
      json +
      "</textarea>";

    canvas.appendChild(nodo);
    nodo.addEventListener("dblclick", function (ev) {
      ev.stopPropagation();
      if (typeof editarNodo === "function") editarNodo(id);
    });
    if (typeof hacerMovible === "function") hacerMovible(nodo);
    initNodoRecienCreado(nodo);
    return nodo;
  }

  function initNodoRecienCreado(nodo) {
    actualizarHTMLNodo(nodo, crearConfigPorDefecto());
  }

  function refrescarNodoCargado(nodo) {
    try {
      nodo.querySelectorAll(".port.out:not(.openai-agent-port-route)").forEach(function (p) {
        p.remove();
      });
      if (!nodo.dataset.openaiAgentDblBound) {
        nodo.dataset.openaiAgentDblBound = "1";
        nodo.addEventListener("dblclick", function (ev) {
          ev.stopPropagation();
          if (typeof editarNodo === "function") editarNodo(nodo.id);
        });
      }
      actualizarHTMLNodo(nodo, leerConfigDeNodo(nodo));
    } catch (e) {
      console.warn("OpenAI Agent: error refrescando", e.message);
    }
  }

  initPaletteButtonIcon();

  return {
    crearConfigPorDefecto,
    leerConfigDeNodo,
    renderPanel,
    guardarDesdePanel,
    esNodoOpenAIAgent,
    crearNodoEnCanvas,
    initNodoRecienCreado,
    refrescarNodoCargado,
    flushPanelToNode,
    clearPanelActivo,
    getNodoActivo,
    buildOpenAILogoSvg,
    initPaletteButtonIcon,
  };
})();

function agregarNodoOpenAIAgent() {
  if (window.MacBotOpenAIAgent && window.MacBotOpenAIAgent.crearNodoEnCanvas) {
    window.MacBotOpenAIAgent.crearNodoEnCanvas();
  }
}
