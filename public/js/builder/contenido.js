/**
 * MacBot — Nodo Contenido (preview premium + panel derecho)
 */
window.MacBotContenido = (function () {
  const TIPOS_MEDIA = ["imagen", "audio", "video", "doc"];
  const TIPOS_ENTREGABLE = ["texto", "imagen", "audio", "video", "doc", "boton"];
  const COMPACT_FROM = 4;
  const SCROLL_FROM = 7;
  const MAX_IMAGEN_FLUJO_BYTES = 2 * 1024 * 1024;
  const MAX_BOTONES = 3;
  const MAX_TEXTO_BOTON = 20;
  let subidaImagenActiva = false;

  const ETIQUETAS = {
    texto: "Texto",
    tiempo: "Pausa",
    imagen: "Imagen",
    audio: "Audio",
    video: "Video",
    doc: "PDF / Doc",
    boton: "Botón",
  };

  let nodoActivo = null;
  let variantesActivas = [[]];
  let variantePanelIndex = 0;
  let isEditingBlock = false;
  let editingBlockIndex = -1;

  const BTN_AGREGAR_POR_TIPO = {
    texto: "Agregar texto",
    tiempo: "Agregar pausa",
    imagen: "Subir imagen",
    audio: "Subir audio",
    video: "Subir video",
    doc: "Agregar documento",
    boton: "Agregar botón",
  };
  const BTN_GUARDAR_CAMBIOS = "Guardar cambios";

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function iconoTipo(tipo) {
    const map = {
      texto: "💬",
      tiempo: "⏳",
      imagen: "🖼️",
      audio: "🎧",
      video: "🎬",
      doc: "📄",
      boton: "🔘",
    };
    return map[tipo] || "📎";
  }

  function etiquetaTipo(tipo) {
    return ETIQUETAS[tipo] || "Bloque";
  }

  function htmlAgregarBloquePicker() {
    const cards = [
      { tipo: "texto", icon: "📝", label: "TEXTO" },
      { tipo: "tiempo", icon: "⏳", label: "PAUSA" },
      { tipo: "imagen", icon: "🖼️", label: "IMAGEN" },
      { tipo: "audio", icon: "🎵", label: "AUDIO" },
      { tipo: "video", icon: "🎬", label: "VIDEO" },
      { tipo: "doc", icon: "📁", label: "ARCHIVO" },
      { tipo: "boton", icon: "🔘", label: "BOTÓN" },
    ];

    return (
      '<div class="content-block-picker content-block-grid cnt-quick-add" role="group" aria-label="Agregar bloque">' +
      cards
        .map(function (c) {
          return (
            '<button type="button" class="content-block-card cnt-quick-btn" data-tipo="' +
            c.tipo +
            '" aria-label="' +
            c.label +
            '">' +
            '<span class="content-block-icon" aria-hidden="true">' +
            c.icon +
            "</span>" +
            '<span class="content-block-label">' +
            c.label +
            "</span></button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function parseJsonTextarea(raw) {
    const texto = String(raw || "[]")
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");

    const data = JSON.parse(texto);
    if (!Array.isArray(data)) return [[]];
    if (!data.length) return [[]];
    return data.map(function (v) {
      return Array.isArray(v) ? v : [];
    });
  }

  function leerVariantesDeNodo(nodo) {
    const ta = nodo?.querySelector(".contenido-variantes-data");
    if (!ta) return [[]];

    try {
      return parseJsonTextarea(ta.value || ta.textContent || "[]");
    } catch (e) {
      return [[]];
    }
  }

  function variantesValidas(variantes) {
    return (variantes || []).filter(function (v) {
      return Array.isArray(v) && v.length > 0;
    });
  }

  function analizarVariantes(variantes) {
    const todas = variantes || [];
    const validas = variantesValidas(todas);
    let bloques = 0;
    let media = 0;
    let botones = 0;

    validas.forEach(function (v) {
      v.forEach(function (item) {
        bloques++;
        if (TIPOS_MEDIA.indexOf(item.tipo) >= 0) media++;
        if (item.tipo === "boton") botones++;
      });
    });

    return {
      variantes: validas.length,
      totalVariantes: todas.length,
      bloques: bloques,
      media: media,
      botones: botones,
    };
  }

  function itemTieneValor(item) {
    if (!item || !item.tipo) return false;
    if (item.tipo === "tiempo") {
      const s = parseInt(item.valor, 10);
      return !isNaN(s) && s > 0;
    }
    if (item.tipo === "boton") {
      const texto = String(item.texto || item.valor || item.descripcion || "").trim();
      const lista = Array.isArray(item.botones) ? item.botones : [];
      const conTexto = lista.filter(function (b) {
        return b && String(b.texto || "").trim();
      });
      return !!texto && conTexto.length >= 1;
    }
    return !!(item.valor || item.descripcion);
  }

  function varianteTieneEntregable(variante) {
    if (!Array.isArray(variante)) return false;
    return variante.some(function (item) {
      if (item.tipo === "tiempo") return false;
      return TIPOS_ENTREGABLE.indexOf(item.tipo) >= 0 && itemTieneValor(item);
    });
  }

  function calcularEstado(variantes) {
    const todas = variantes || [];
    const validas = variantesValidas(todas);

    if (!validas.length) return "vacio";

    const conEntregable = validas.filter(varianteTieneEntregable);
    const vacias = todas.length - validas.length;

    if (!conEntregable.length) return "incompleto";
    if (vacias > 0 || conEntregable.length < validas.length) return "incompleto";
    return "completo";
  }

  function textoEstado(estado) {
    if (estado === "completo") return "Completo";
    if (estado === "incompleto") return "Incompleto";
    return "Sin contenido";
  }

  function truncar(str, max) {
    const s = String(str || "").trim();
    if (s.length <= max) return s;
    return s.slice(0, max) + "…";
  }

  function renderBubbleMini(item) {
    if (!item || !item.tipo) return "";

    if (item.tipo === "texto") {
      const t = truncar(item.valor, 72);
      if (!t) return "";
      return '<div class="cnt-bubble cnt-bubble--text">' + esc(t) + "</div>";
    }

    if (item.tipo === "tiempo") {
      const s = parseInt(item.valor, 10);
      if (isNaN(s) || s <= 0) return "";
      return (
        '<div class="cnt-bubble cnt-bubble--pause">' +
        iconoTipo("tiempo") +
        " Pausa " +
        s +
        "s</div>"
      );
    }

    if (item.tipo === "imagen" && item.valor) {
      return (
        '<div class="cnt-bubble cnt-bubble--media">' +
        '<div class="cnt-bubble-media"><img src="' +
        esc(item.valor) +
        '" alt="" loading="lazy"></div>' +
        (item.descripcion
          ? '<span class="cnt-bubble-media-label">' + esc(truncar(item.descripcion, 40)) + "</span>"
          : '<span class="cnt-bubble-media-label">' +
            iconoTipo("imagen") +
            " Imagen</span>") +
        "</div>"
      );
    }

    if (item.tipo === "audio" && item.valor) {
      return (
        '<div class="cnt-bubble cnt-bubble--media">' +
        '<span class="cnt-bubble-media-label">' +
        iconoTipo("audio") +
        " Audio</span></div>"
      );
    }

    if (item.tipo === "video" && item.valor) {
      return (
        '<div class="cnt-bubble cnt-bubble--media">' +
        '<span class="cnt-bubble-media-label">' +
        iconoTipo("video") +
        " " +
        esc(truncar(item.descripcion || "Video", 36)) +
        "</span></div>"
      );
    }

    if (item.tipo === "doc" && item.valor) {
      return (
        '<div class="cnt-bubble cnt-bubble--media">' +
        '<span class="cnt-bubble-media-label">' +
        iconoTipo("doc") +
        " Documento</span></div>"
      );
    }

    if (item.tipo === "boton") {
      const body = String(item.texto || item.valor || item.descripcion || "").trim();
      const botones = Array.isArray(item.botones) ? item.botones : [];
      if (!body && !botones.length) return "";

      let html = "";
      if (body) {
        html +=
          '<div class="cnt-bubble cnt-bubble--text">' + esc(truncar(body, 72)) + "</div>";
      }
      const pills = botones
        .map(function (b) {
          const t = String(b?.texto || "").trim();
          if (!t) return "";
          return '<span class="cnt-btn-pill">' + esc(t) + "</span>";
        })
        .filter(Boolean)
        .join("");
      if (pills) {
        html += '<div class="cnt-btn-pills">' + pills + "</div>";
      }
      return html;
    }

    return "";
  }

  function iconosVariante(variante) {
    const seen = {};
    const icons = [];

    (variante || []).forEach(function (item) {
      if (!item.tipo || seen[item.tipo]) return;
      seen[item.tipo] = true;
      icons.push(iconoTipo(item.tipo));
    });

    return icons.join("");
  }

  function renderVarianteCard(variante, index) {
    const bubbles = (variante || []).map(renderBubbleMini).filter(Boolean).join("");
    const preview = bubbles
      ? '<div class="cnt-wa-thread">' + bubbles + "</div>"
      : '<p class="content-empty">Sin bloques</p>';

    return (
      '<div class="content-variant-card">' +
      '<div class="content-variant-head">' +
      '<span class="content-variant-name">Variante ' +
      (index + 1) +
      "</span>" +
      '<span class="content-variant-icons">' +
      iconosVariante(variante) +
      "</span></div>" +
      '<div class="content-variant-preview">' +
      preview +
      "</div></div>"
    );
  }

  function buildContenidoPreviewBody(variantes) {
    const validas = variantesValidas(variantes);
    const stats = analizarVariantes(variantes);
    const estado = calcularEstado(variantes);

    if (!validas.length) {
      return (
        '<p class="content-empty">Agrega bloques en el panel o en el editor →</p>'
      );
    }

    let html =
      '<div class="content-stats">' +
      '<span class="content-stat">' +
      iconoTipo("texto") +
      ' <strong>' +
      stats.variantes +
      "</strong> var.</span>" +
      '<span class="content-stat">📦 <strong>' +
      stats.bloques +
      "</strong> bloques</span>" +
      '<span class="content-stat">🖼 <strong>' +
      stats.media +
      "</strong> media</span>";

    if (stats.botones > 0) {
      html +=
        '<span class="content-stat">' +
        iconoTipo("boton") +
        " <strong>" +
        stats.botones +
        "</strong> btn</span>";
    }

    html += "</div>";
    html += '<div class="content-variants-title">Variantes</div>';
    html += '<div class="content-variants">';

    validas.forEach(function (variante, index) {
      html += renderVarianteCard(variante, index);
    });

    html += "</div>";

    return { html: html, estado: estado, bloques: stats.bloques };
  }

  function buildContenidoPreviewCompact(variantes) {
    void variantes;
    return (
      '<div class="content-compact-icon" aria-hidden="true">💬</div>' +
      '<div class="content-compact-label">Contenido</div>'
    );
  }

  function buildContenidoPreviewHtml(variantesValidasList) {
    const jsonVariantes = JSON.stringify(variantesValidasList)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    return (
      '<textarea class="contenido-variantes-data" style="display:none;">' +
      jsonVariantes +
      "</textarea>" +
      buildContenidoPreviewCompact(variantesValidasList)
    );
  }

  function notificarLayoutCanvas() {
    requestAnimationFrame(function () {
      document.dispatchEvent(new CustomEvent("macbot:nodo-layout"));
    });
  }

  function aplicarLayoutDinamicoNodo(nodo, bloqueCount) {
    if (!nodo) return;
    const body = nodo.querySelector(".content-body");
    const count = bloqueCount || 0;

    nodo.classList.toggle("content-node--compact", count >= COMPACT_FROM);
    if (body) {
      body.classList.toggle("content-body--scroll", count >= SCROLL_FROM);
    }
    notificarLayoutCanvas();
  }

  function actualizarStatusBadge(nodo, estado) {
    const badge = nodo?.querySelector(".content-status");
    if (!badge) return;
    badge.className = "content-status content-status--" + estado;
    badge.textContent = textoEstado(estado);
    badge.dataset.status = estado;
  }

  function renderPreviewNodo(nodo, variantes) {
    if (!nodo) return;

    const vars = variantes || leerVariantesDeNodo(nodo);
    const body = nodo.querySelector(".content-body");
    const estado = calcularEstado(vars);

    nodo.classList.add("content-node--visual-compact-square");
    nodo.classList.remove("content-node--visual-compact", "content-node--compact");
    if (body) {
      body.classList.remove("content-body--scroll");
    }

    actualizarStatusBadge(nodo, estado);

    if (!body) return;

    body.innerHTML = buildContenidoPreviewCompact(vars);
    notificarLayoutCanvas();
  }

  function guardarVariantesEnNodo(nodo, variantes) {
    if (!nodo) return;

    const validas = variantesValidas(variantes);
    const ta = nodo.querySelector(".contenido-variantes-data");

    if (ta) {
      ta.value = JSON.stringify(variantes);
    } else {
      const hidden = document.createElement("textarea");
      hidden.className = "contenido-variantes-data";
      hidden.style.display = "none";
      hidden.value = JSON.stringify(variantes);
      nodo.appendChild(hidden);
    }

    renderPreviewNodo(nodo, variantes);
  }

  function asegurarEstructuraNodo(nodo) {
    if (!nodo) return;

    nodo.classList.add("content-node", "node-contenido", "content-node--visual-compact-square");
    nodo.classList.remove("blue", "content-node--compact", "content-node--visual-compact");
    nodo.dataset.tipo = "contenido";

    if (nodo.querySelector(".content-header")) return;

    const variantes = leerVariantesDeNodo(nodo);
    const previewHtml = buildContenidoPreviewHtml(variantesValidas(variantes).length ? variantes : variantes);
    const estado = calcularEstado(variantes);
    const id = nodo.id;

    const portsIn = nodo.querySelector(".port.in");
    const portsOut = nodo.querySelector(".port.out");
    const portInHtml = portsIn
      ? portsIn.outerHTML
      : '<div class="port in" data-nodo="' +
        id +
        '" onmousedown="iniciarConexion(event, \'' +
        id +
        '\', \'in\')"></div>';
    const portOutHtml = portsOut
      ? portsOut.outerHTML
      : '<div class="port out" data-nodo="' +
        id +
        '" onmousedown="iniciarConexion(event, \'' +
        id +
        '\', \'out\')"></div>';

    nodo.innerHTML =
      portInHtml +
      '<div class="node-actions">' +
      '<button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo(\'' +
      id +
      '\')">✎</button>' +
      '<button type="button" class="duplicate-node" onclick="event.stopPropagation(); duplicarNodo(\'' +
      id +
      '\')" title="Duplicar" aria-label="Duplicar">⧉</button>' +
      '<button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo(\'' +
      id +
      '\')">×</button></div>' +
      '<div class="content-header">' +
      '<span class="content-header-title">💬 Contenido</span>' +
      '<span class="content-status content-status--' +
      estado +
      '" data-status="' +
      estado +
      '">' +
      textoEstado(estado) +
      '</span></div>' +
      '<div class="content-body"></div>' +
      portOutHtml;

    const taMatch = previewHtml.match(
      /<textarea[^>]*class="contenido-variantes-data"[^>]*>[\s\S]*?<\/textarea>/i
    );
    if (taMatch) {
      nodo.insertAdjacentHTML("beforeend", taMatch[0]);
    }

    renderPreviewNodo(nodo, variantes);
  }

  function refrescarNodoCargado(nodo) {
    try {
      asegurarEstructuraNodo(nodo);
      renderPreviewNodo(nodo, leerVariantesDeNodo(nodo));
    } catch (e) {
      console.warn("Contenido: error refrescando nodo", e.message);
    }
  }

  function esNodoContenido(nodo) {
    return (
      nodo &&
      (nodo.dataset.tipo === "contenido" ||
        nodo.classList.contains("content-node") ||
        !!nodo.querySelector(".contenido-variantes-data") ||
        (nodo.querySelector(".node-title")?.innerText || "").includes("Contenido"))
    );
  }

  function varianteActualPanel() {
    if (!variantesActivas[variantePanelIndex]) {
      variantesActivas[variantePanelIndex] = [];
    }
    return variantesActivas[variantePanelIndex];
  }

  function botonAgregarPorTipo(tipo) {
    const map = {
      texto: "cntAddTexto",
      tiempo: "cntAddTiempo",
      imagen: "cntSubirImagen",
      audio: "cntSubirAudio",
      video: "cntSubirVideo",
      doc: "cntAddDoc",
      boton: "cntAddBoton",
    };
    const id = map[tipo];
    return id ? document.getElementById(id) : null;
  }

  function generarBloqueIdNuevo() {
    const base = String(nodoActivo?.id || "nodo").replace(/^nodo_/, "");
    return base + "_" + Date.now().toString(36);
  }

  function asegurarBloqueId(item) {
    if (!item.bloqueId) {
      item.bloqueId = generarBloqueIdNuevo();
    }
    return item.bloqueId;
  }

  function normalizarBotonesContenido(botonesRaw, bloqueId) {
    const idBase = String(bloqueId || generarBloqueIdNuevo()).trim();
    if (!Array.isArray(botonesRaw)) return [];

    return botonesRaw
      .slice(0, MAX_BOTONES)
      .map(function (btn, index) {
        const texto = String(btn?.texto || btn?.text || "")
          .trim()
          .slice(0, MAX_TEXTO_BOTON);
        if (!texto) return null;
        const idPref =
          btn?.id && String(btn.id).startsWith("cnt_")
            ? String(btn.id).slice(0, 128)
            : "cnt_" + idBase + "_b" + index;
        return { id: idPref, texto };
      })
      .filter(Boolean);
  }

  function leerBotonesDesdeFormularioContenido() {
    const inputs = document.querySelectorAll(
      '#cntBotonesLista input[data-cnt-boton="1"]'
    );
    const lista = [];

    inputs.forEach(function (input) {
      const texto = String(input.value || "")
        .trim()
        .slice(0, MAX_TEXTO_BOTON);
      if (!texto) return;
      lista.push({ texto });
    });

    return lista;
  }

  function renderFormularioBotonesContenido(botones, bloqueId) {
    const box = document.getElementById("cntBotonesLista");
    if (!box) return;

    const lista = Array.isArray(botones) ? botones : [];
    const slots = Math.max(1, Math.min(MAX_BOTONES, lista.length + 1));

    let html =
      '<p class="cnt-botones-hint">Máx. ' +
      MAX_BOTONES +
      " botones · " +
      MAX_TEXTO_BOTON +
      " caracteres c/u</p>";

    for (let i = 0; i < slots; i++) {
      const btn = lista[i] || { texto: "" };
      html +=
        '<div class="cnt-boton-row"><span class="cnt-boton-num">' +
        (i + 1) +
        '</span><input type="text" data-cnt-boton="1" maxlength="' +
        MAX_TEXTO_BOTON +
        '" placeholder="Ej: QR" value="' +
        esc(btn.texto) +
        '"></div>';
    }

    if (lista.length < MAX_BOTONES) {
      html +=
        '<button type="button" class="cnt-btn cnt-btn-ghost cnt-btn-sm" id="cntAddBotonSlot">+ Botón</button>';
    }

    box.innerHTML = html;
    box.dataset.bloqueId = bloqueId || "";

    box.querySelectorAll('input[data-cnt-boton="1"]').forEach(function (input) {
      input.addEventListener("input", function () {
        if (input.value.length > MAX_TEXTO_BOTON) {
          input.value = input.value.slice(0, MAX_TEXTO_BOTON);
        }
      });
    });

    document.getElementById("cntAddBotonSlot")?.addEventListener("click", function () {
      const actuales = leerBotonesDesdeFormularioContenido();
      if (actuales.length >= MAX_BOTONES) return;
      actuales.push({ texto: "" });
      renderFormularioBotonesContenido(actuales, box.dataset.bloqueId || bloqueId);
    });
  }

  function construirItemBotonDesdePanel(bloqueIdExistente) {
    const textoEl = document.getElementById("cntPanelBotonTexto");
    const texto = String(textoEl?.value || "").trim();
    const bloqueId = bloqueIdExistente || generarBloqueIdNuevo();
    const botones = normalizarBotonesContenido(
      leerBotonesDesdeFormularioContenido(),
      bloqueId
    );

    return {
      tipo: "boton",
      texto,
      bloqueId,
      botones,
    };
  }

  function restaurarBotonesAgregar() {
    Object.keys(BTN_AGREGAR_POR_TIPO).forEach(function (tipo) {
      const btn = botonAgregarPorTipo(tipo);
      if (btn) btn.textContent = BTN_AGREGAR_POR_TIPO[tipo];
    });
  }

  function aplicarBotonModoEdicion(tipo) {
    restaurarBotonesAgregar();
    const btn = botonAgregarPorTipo(tipo);
    if (btn) btn.textContent = BTN_GUARDAR_CAMBIOS;
  }

  function limpiarCamposEditor() {
    const texto = document.getElementById("cntPanelTexto");
    const tiempo = document.getElementById("cntPanelTiempo");
    const descImg = document.getElementById("cntPanelDescImg");
    const descVid = document.getElementById("cntPanelDescVid");
    const docUrl = document.getElementById("cntPanelDocUrl");
    const fileImg = document.getElementById("cntPanelImagen");
    const fileAud = document.getElementById("cntPanelAudio");
    const fileVid = document.getElementById("cntPanelVideo");
    const done = document.getElementById("cntImgUploadDone");

    if (texto) texto.value = "";
    if (tiempo) tiempo.value = "";
    if (descImg) descImg.value = "";
    if (descVid) descVid.value = "";
    if (docUrl) docUrl.value = "";
    if (fileImg) fileImg.value = "";
    if (fileAud) fileAud.value = "";
    if (fileVid) fileVid.value = "";
    if (done) done.style.display = "none";
    ocultarProgresoImagen();

    const botonTexto = document.getElementById("cntPanelBotonTexto");
    if (botonTexto) botonTexto.value = "";
    renderFormularioBotonesContenido([], null);
  }

  function mostrarCampoTipoEnPanel(tipo) {
    const fields = {
      texto: "cntFieldTexto",
      tiempo: "cntFieldTiempo",
      imagen: "cntFieldImagen",
      audio: "cntFieldAudio",
      video: "cntFieldVideo",
      doc: "cntFieldDoc",
      boton: "cntFieldBoton",
    };

    Object.keys(fields).forEach(function (k) {
      const el = document.getElementById(fields[k]);
      if (el) el.style.display = k === tipo ? "block" : "none";
    });

    document.querySelectorAll(".content-block-card[data-tipo]").forEach(function (btn) {
      const activo = btn.dataset.tipo === tipo;
      btn.classList.toggle("active", activo);
      btn.classList.toggle("content-block-card-active", activo);
    });
  }

  function cancelarEdicionBloque() {
    isEditingBlock = false;
    editingBlockIndex = -1;
    restaurarBotonesAgregar();
    limpiarCamposEditor();
    renderPanelBloques();
  }

  function cargarBloqueEnEditor(item) {
    if (!item || !item.tipo) return;

    mostrarCampoTipoEnPanel(item.tipo);
    limpiarCamposEditor();

    if (item.tipo === "texto") {
      const el = document.getElementById("cntPanelTexto");
      if (el) el.value = item.valor || "";
    } else if (item.tipo === "tiempo") {
      const el = document.getElementById("cntPanelTiempo");
      if (el) el.value = item.valor || "";
    } else if (item.tipo === "imagen") {
      const desc = document.getElementById("cntPanelDescImg");
      if (desc) desc.value = item.descripcion || "";
      if (item.valor) {
        mostrarPreviewImagenLista(item.valor);
      }
    } else if (item.tipo === "video") {
      const desc = document.getElementById("cntPanelDescVid");
      if (desc) desc.value = item.descripcion || "";
    } else if (item.tipo === "doc") {
      const el = document.getElementById("cntPanelDocUrl");
      if (el) el.value = item.valor || "";
    } else if (item.tipo === "boton") {
      const el = document.getElementById("cntPanelBotonTexto");
      if (el) el.value = item.texto || item.valor || "";
      asegurarBloqueId(item);
      renderFormularioBotonesContenido(item.botones || [], item.bloqueId);
    }

    aplicarBotonModoEdicion(item.tipo);
  }

  function entrarEdicionBloque(index) {
    const variante = varianteActualPanel();
    const item = variante[index];
    if (!item || !item.tipo) return;

    const editables = ["texto", "tiempo", "imagen", "audio", "video", "doc", "boton"];
    if (editables.indexOf(item.tipo) < 0) return;

    if (isEditingBlock && editingBlockIndex === index) return;

    isEditingBlock = true;
    editingBlockIndex = index;
    cargarBloqueEnEditor(item);
    renderPanelBloques();
  }

  function finalizarEdicionBloque(item) {
    if (!isEditingBlock || editingBlockIndex < 0) return false;
    varianteActualPanel()[editingBlockIndex] = item;
    cancelarEdicionBloque();
    onPanelChange();
    return true;
  }

  function renderPanelPreview() {
    const box = document.getElementById("cntPanelPreview");
    if (!box) return;

    const variante = varianteActualPanel();
    const html = (variante || []).map(renderBubbleMini).filter(Boolean).join("");

    box.innerHTML = html
      ? '<div class="cnt-wa-thread">' + html + "</div>"
      : '<p class="content-empty" style="margin:0;">Sin bloques en esta variante</p>';
  }

  function renderPanelBloques() {
    const lista = document.getElementById("cntPanelBloques");
    if (!lista) return;

    const variante = varianteActualPanel();

    if (!variante.length) {
      lista.innerHTML = '<p class="cnt-panel-desc">Aún no hay bloques.</p>';
      return;
    }

    lista.innerHTML = variante
      .map(function (item, index) {
        let resumen = "";
        if (item.tipo === "texto") resumen = truncar(item.valor, 40);
        else if (item.tipo === "tiempo") resumen = item.valor + "s";
        else if (item.tipo === "boton") {
          const nBtn = (item.botones || []).length;
          resumen =
            truncar(item.texto || item.valor, 28) +
            (nBtn ? " · " + nBtn + " btn" : "");
        }
        else resumen = truncar(item.descripcion || item.valor || "", 36);

        const editables = ["texto", "tiempo", "imagen", "audio", "video", "doc", "boton"];
        const puedeEditar = editables.indexOf(item.tipo) >= 0;
        const editando =
          isEditingBlock && editingBlockIndex === index;

        return (
          '<div class="cnt-block-row' +
          (editando ? " cnt-block-row--editing" : "") +
          '">' +
          "<span>" +
          iconoTipo(item.tipo) +
          " " +
          esc(etiquetaTipo(item.tipo)) +
          (resumen ? " · " + esc(resumen) : "") +
          "</span>" +
          '<span class="cnt-block-actions">' +
          '<button type="button" class="cnt-block-move" data-action="up" data-index="' +
          index +
          '" title="Subir">↑</button>' +
          '<button type="button" class="cnt-block-move" data-action="down" data-index="' +
          index +
          '" title="Bajar">↓</button>' +
          (puedeEditar
            ? '<button type="button" class="cnt-block-edit" data-action="edit" data-index="' +
              index +
              '" title="Editar">✏️ Editar</button>'
            : "") +
          '<button type="button" data-action="del" data-index="' +
          index +
          '">Quitar</button></span></div>'
        );
      })
      .join("");

    lista.querySelectorAll("button[data-index]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const idx = parseInt(btn.dataset.index, 10);
        const variante = varianteActualPanel();
        const action = btn.dataset.action;

        if (action === "edit") {
          entrarEdicionBloque(idx);
          return;
        }

        if (action === "up" && idx > 0) {
          const item = variante.splice(idx, 1)[0];
          variante.splice(idx - 1, 0, item);
          if (isEditingBlock) {
            if (editingBlockIndex === idx) editingBlockIndex = idx - 1;
            else if (editingBlockIndex === idx - 1) editingBlockIndex = idx;
          }
        } else if (action === "down" && idx < variante.length - 1) {
          const item = variante.splice(idx, 1)[0];
          variante.splice(idx + 1, 0, item);
          if (isEditingBlock) {
            if (editingBlockIndex === idx) editingBlockIndex = idx + 1;
            else if (editingBlockIndex === idx + 1) editingBlockIndex = idx;
          }
        } else if (action === "del") {
          variante.splice(idx, 1);
          if (isEditingBlock) {
            if (editingBlockIndex === idx) {
              cancelarEdicionBloque();
              onPanelChange();
              return;
            }
            if (editingBlockIndex > idx) editingBlockIndex--;
          }
        }

        onPanelChange();
      });
    });
  }

  function eliminarVariante(index) {
    if (variantesActivas.length <= 1) return;

    const idx = parseInt(index, 10);
    if (isNaN(idx) || idx < 0 || idx >= variantesActivas.length) return;

    if (!confirm("¿Eliminar esta variante?")) return;

    if (isEditingBlock) cancelarEdicionBloque();

    const eraActiva = variantePanelIndex === idx;
    variantesActivas.splice(idx, 1);

    if (eraActiva) {
      variantePanelIndex = idx > 0 ? idx - 1 : 0;
    } else if (variantePanelIndex > idx) {
      variantePanelIndex--;
    }

    onPanelChange();
  }

  function renderVariantChips() {
    const wrap = document.getElementById("cntVariantChips");
    if (!wrap) return;

    const puedeEliminar = variantesActivas.length > 1;

    wrap.innerHTML = variantesActivas
      .map(function (_, i) {
        const delBtn = puedeEliminar
          ? '<button type="button" class="cnt-variant-del" data-index="' +
            i +
            '" title="Eliminar variante" aria-label="Eliminar variante ' +
            (i + 1) +
            '">×</button>'
          : "";

        return (
          '<span class="cnt-variant-chip-wrap">' +
          '<button type="button" class="cnt-variant-chip' +
          (i === variantePanelIndex ? " active" : "") +
          '" data-index="' +
          i +
          '">Variante ' +
          (i + 1) +
          "</button>" +
          delBtn +
          "</span>"
        );
      })
      .join("");

    wrap.querySelectorAll(".cnt-variant-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        if (isEditingBlock) cancelarEdicionBloque();
        variantePanelIndex = parseInt(chip.dataset.index, 10);
        renderVariantChips();
        renderPanelPreview();
        renderPanelBloques();
        renderPanelStats();
      });
    });

    wrap.querySelectorAll(".cnt-variant-del").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        eliminarVariante(parseInt(btn.dataset.index, 10));
      });
    });
  }

  function renderPanelStats() {
    const stats = analizarVariantes(variantesActivas);
    const estado = calcularEstado(variantesActivas);

    ["cntStatVar", "cntStatBlk", "cntStatMed", "cntStatBtn"].forEach(function (id, i) {
      const el = document.getElementById(id);
      if (!el) return;
      const vals = [stats.variantes, stats.bloques, stats.media, stats.botones];
      el.textContent = String(vals[i]);
    });

    const badge = document.getElementById("cntEstadoBadge");
    if (badge) {
      badge.className = "cnt-estado-badge cnt-estado-badge--" + estado;
      badge.innerHTML = "● " + textoEstado(estado);
    }
  }

  function onPanelChange() {
    renderPanelPreview();
    renderPanelBloques();
    renderPanelStats();
    renderVariantChips();
    if (nodoActivo) {
      guardarVariantesEnNodo(nodoActivo, variantesActivas);
    }
    if (typeof macbotRecordHistoryDebounced === "function") {
      macbotRecordHistoryDebounced();
    }
  }

  function agregarTextoDesdePanel() {
    const input = document.getElementById("cntPanelTexto");
    const texto = input?.value?.trim();
    if (!texto) {
      input?.focus();
      return;
    }
    const item = { tipo: "texto", valor: texto };
    if (finalizarEdicionBloque(item)) return;
    varianteActualPanel().push(item);
    if (input) input.value = "";
    onPanelChange();
  }

  function agregarTiempoDesdePanel() {
    const input = document.getElementById("cntPanelTiempo");
    const t = parseInt(input?.value, 10);
    if (isNaN(t) || t <= 0) {
      input?.focus();
      return;
    }
    const item = { tipo: "tiempo", valor: String(t) };
    if (finalizarEdicionBloque(item)) return;
    varianteActualPanel().push(item);
    if (input) input.value = "";
    onPanelChange();
  }

  function mostrarToastContenido(texto) {
    if (typeof window.mostrarToast === "function") {
      window.mostrarToast(texto);
      return;
    }
    let toast = document.getElementById("cntToastFlujo");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "cntToastFlujo";
      toast.className = "cnt-toast-flujo";
      document.body.appendChild(toast);
    }
    toast.textContent = texto;
    toast.classList.add("cnt-toast-flujo--show");
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(function () {
      toast.classList.remove("cnt-toast-flujo--show");
    }, 3200);
  }

  function setProgresoImagen(pct, etiqueta) {
    const box = document.getElementById("cntImgUploadBox");
    const fill = document.getElementById("cntImgUploadBarFill");
    const pctEl = document.getElementById("cntImgUploadPct");
    const status = document.getElementById("cntImgUploadStatus");
    if (!box || !fill || !pctEl) return;
    box.style.display = "block";
    const n = Math.max(0, Math.min(100, Math.round(pct)));
    fill.style.width = n + "%";
    pctEl.textContent = n + "%";
    if (status && etiqueta) status.textContent = etiqueta;
  }

  function ocultarProgresoImagen() {
    const box = document.getElementById("cntImgUploadBox");
    if (box) box.style.display = "none";
  }

  function mostrarPreviewImagenLista(url) {
    const done = document.getElementById("cntImgUploadDone");
    const thumb = document.getElementById("cntImgDoneThumb");
    if (!done || !thumb) return;
    thumb.src = url;
    done.style.display = "flex";
    ocultarProgresoImagen();
  }

  function subirImagenNodoFlujo(file) {
    if (!file || subidaImagenActiva) return;

    if (file.size > MAX_IMAGEN_FLUJO_BYTES) {
      mostrarToastContenido(
        "⚠️ La imagen supera el límite de 2MB. Usa una imagen más ligera."
      );
      setProgresoImagen(0, "⚠️ Máximo permitido: 2MB");
      return;
    }

    subidaImagenActiva = true;
    const done = document.getElementById("cntImgUploadDone");
    if (done) done.style.display = "none";

    const thumb = document.getElementById("cntImgUploadThumb");
    if (thumb) {
      thumb.src = URL.createObjectURL(file);
    }

    console.log("📤 preparando imagen");
    setProgresoImagen(1, "Subiendo imagen…");

    const formData = new FormData();
    formData.append("archivo", file);

    const xhr = new XMLHttpRequest();
    let faseOptim = false;

    xhr.upload.addEventListener("progress", function (ev) {
      if (!ev.lengthComputable) return;
      const ratio = ev.loaded / ev.total;
      const pct = 15 + Math.round(ratio * 47);
      setProgresoImagen(pct, "Subiendo imagen…");
    });

    xhr.addEventListener("loadstart", function () {
      setProgresoImagen(15, "Subiendo imagen…");
    });

    xhr.addEventListener("readystatechange", function () {
      if (xhr.readyState === 3 && !faseOptim) {
        faseOptim = true;
        setProgresoImagen(62, "Optimizando…");
        console.log("🖼 optimizando webp");
      }
    });

    xhr.addEventListener("load", function () {
      subidaImagenActiva = false;
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch (e) {
        data = {};
      }

      if (xhr.status >= 200 && xhr.status < 300 && data.url) {
        console.log("☁️ subiendo a supabase");
        setProgresoImagen(84, "Finalizando…");
        setProgresoImagen(100, "✅ Imagen lista");
        console.log("✅ upload completado");

        const item = { tipo: "imagen", valor: data.url };
        const desc = document.getElementById("cntPanelDescImg")?.value?.trim();
        if (desc) item.descripcion = desc;

        if (finalizarEdicionBloque(item)) {
          const fileInput = document.getElementById("cntPanelImagen");
          if (fileInput) fileInput.value = "";
          mostrarPreviewImagenLista(data.url);
          return;
        }

        varianteActualPanel().push(item);
        const fileInput = document.getElementById("cntPanelImagen");
        if (fileInput) fileInput.value = "";

        mostrarPreviewImagenLista(data.url);
        onPanelChange();
        return;
      }

      const msg =
        data.error ||
        (xhr.status === 400
          ? "⚠️ La imagen supera el límite de 2MB. Usa una imagen más ligera."
          : "❌ Error al subir imagen");
      setProgresoImagen(0, "❌ Error al subir imagen");
      mostrarToastContenido(msg);
      ocultarProgresoImagen();
    });

    xhr.addEventListener("error", function () {
      subidaImagenActiva = false;
      setProgresoImagen(0, "❌ Error al subir imagen");
      mostrarToastContenido("❌ Error al subir imagen");
      ocultarProgresoImagen();
    });

    xhr.open("POST", "/subir-imagen-nodo-flujo");
    xhr.send(formData);
  }

  function guardarImagenDesdePanel() {
    if (isEditingBlock && editingBlockIndex >= 0) {
      const fileInput = document.getElementById("cntPanelImagen");
      const file = fileInput?.files?.[0];
      if (file) {
        subirImagenNodoFlujo(file);
        return;
      }
      const bloque = varianteActualPanel()[editingBlockIndex];
      if (!bloque || bloque.tipo !== "imagen" || !bloque.valor) return;
      const item = { tipo: "imagen", valor: bloque.valor };
      const desc = document.getElementById("cntPanelDescImg")?.value?.trim();
      if (desc) item.descripcion = desc;
      finalizarEdicionBloque(item);
      return;
    }
    iniciarSubidaImagenDesdePanel();
  }

  function iniciarSubidaImagenDesdePanel() {
    const fileInput = document.getElementById("cntPanelImagen");
    const file = fileInput?.files?.[0];
    if (!file) {
      fileInput?.click();
      return;
    }
    subirImagenNodoFlujo(file);
  }

  function subirArchivoPanel(inputId, tipo, conDescripcion) {
    const fileInput = document.getElementById(inputId);
    const file = fileInput?.files?.[0];
    if (!file) {
      fileInput?.click();
      return;
    }

    const formData = new FormData();
    formData.append("archivo", file);

    fetch("/subir-archivo", { method: "POST", body: formData })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data.url) {
          alert("Error al subir archivo");
          return;
        }

        const item = { tipo: tipo, valor: data.url };
        if (conDescripcion) {
          const descId =
            tipo === "imagen" ? "cntPanelDescImg" : "cntPanelDescVid";
          item.descripcion = document.getElementById(descId)?.value?.trim() || "";
        }

        if (finalizarEdicionBloque(item)) {
          if (fileInput) fileInput.value = "";
          return;
        }

        varianteActualPanel().push(item);
        if (fileInput) fileInput.value = "";
        onPanelChange();
      })
      .catch(function () {
        alert("Error de red al subir");
      });
  }

  function guardarMediaSinArchivo(tipo) {
    if (!isEditingBlock || editingBlockIndex < 0) return false;
    const bloque = varianteActualPanel()[editingBlockIndex];
    if (!bloque || bloque.tipo !== tipo || !bloque.valor) return false;

    const item = { tipo: tipo, valor: bloque.valor };
    if (tipo === "video") {
      const desc = document.getElementById("cntPanelDescVid")?.value?.trim();
      if (desc) item.descripcion = desc;
    }
    finalizarEdicionBloque(item);
    return true;
  }

  function guardarAudioDesdePanel() {
    if (guardarMediaSinArchivo("audio")) return;
    subirArchivoPanel("cntPanelAudio", "audio", false);
  }

  function guardarVideoDesdePanel() {
    const file = document.getElementById("cntPanelVideo")?.files?.[0];
    if (isEditingBlock && !file && guardarMediaSinArchivo("video")) return;
    subirArchivoPanel("cntPanelVideo", "video", true);
  }

  function agregarDocDesdePanel() {
    const url = document.getElementById("cntPanelDocUrl")?.value?.trim();
    if (!url) return;
    const item = { tipo: "doc", valor: url };
    if (finalizarEdicionBloque(item)) return;
    varianteActualPanel().push(item);
    document.getElementById("cntPanelDocUrl").value = "";
    onPanelChange();
  }

  function agregarBotonDesdePanel() {
    let bloqueIdExistente = null;
    if (isEditingBlock && editingBlockIndex >= 0) {
      const existing = varianteActualPanel()[editingBlockIndex];
      if (existing?.bloqueId) bloqueIdExistente = existing.bloqueId;
    }

    const item = construirItemBotonDesdePanel(bloqueIdExistente);

    if (!item.texto) {
      document.getElementById("cntPanelBotonTexto")?.focus();
      mostrarToastContenido("⚠️ Escribe el texto del mensaje.");
      return;
    }
    if (!item.botones.length) {
      mostrarToastContenido("⚠️ Agrega al menos un botón.");
      return;
    }

    if (finalizarEdicionBloque(item)) return;

    varianteActualPanel().push(item);
    const textoEl = document.getElementById("cntPanelBotonTexto");
    if (textoEl) textoEl.value = "";
    renderFormularioBotonesContenido([], null);
    onPanelChange();
  }

  function guardarDesdePanel() {
    if (!nodoActivo) return;
    guardarVariantesEnNodo(nodoActivo, variantesActivas);
    if (typeof registrarHistorialBuilder === "function") {
      registrarHistorialBuilder();
    }
    alert("Contenido actualizado. Recuerda guardar el flujo completo.");
  }

  function renderPanel(nodo) {
    if (!nodo) return;

    nodoActivo = nodo;
    variantesActivas = leerVariantesDeNodo(nodo);
    if (!variantesActivas.length) variantesActivas = [[]];
    variantePanelIndex = 0;
    isEditingBlock = false;
    editingBlockIndex = -1;

    const contenido = document.getElementById("panelNodoContenido");
    if (!contenido) return;

    contenido.innerHTML =
      '<div class="cnt-panel">' +
      "<h4>💬 Contenido</h4>" +
      '<p class="cnt-panel-desc">Mensajes y variantes para WhatsApp. Elige variante, agrega bloques y revisa la vista previa.</p>' +
      '<div id="cntEstadoBadge" class="cnt-estado-badge"></div>' +
      '<div class="cnt-stats-row">' +
      '<div class="cnt-stat-box"><span id="cntStatVar">0</span><small>Variantes</small></div>' +
      '<div class="cnt-stat-box"><span id="cntStatBlk">0</span><small>Bloques</small></div>' +
      '<div class="cnt-stat-box"><span id="cntStatMed">0</span><small>Media</small></div>' +
      '<div class="cnt-stat-box"><span id="cntStatBtn">0</span><small>Botones</small></div>' +
      "</div>" +
      '<div class="cnt-panel-field"><label>Variantes</label><div id="cntVariantChips" class="cnt-variant-chips"></div>' +
      '<button type="button" class="cnt-btn cnt-btn-ghost" id="cntAddVariante" style="margin-top:6px;">+ Variante</button></div>' +
      '<div class="cnt-panel-field"><label>Agregar bloque</label>' +
      htmlAgregarBloquePicker() +
      "</div>" +
      '<div class="cnt-panel-field" id="cntFieldTexto">' +
      "<label>Texto</label>" +
      '<textarea id="cntPanelTexto" rows="3" placeholder="Escribe el mensaje…"></textarea>' +
      '<button type="button" class="cnt-btn cnt-btn-ghost" id="cntAddTexto" style="margin-top:6px;">Agregar texto</button></div>' +
      '<div class="cnt-panel-field" id="cntFieldTiempo" style="display:none;">' +
      "<label>Pausa (segundos)</label>" +
      '<input type="number" id="cntPanelTiempo" min="1" max="60" placeholder="1–60">' +
      '<button type="button" class="cnt-btn cnt-btn-ghost" id="cntAddTiempo" style="margin-top:6px;">Agregar pausa</button></div>' +
      '<div class="cnt-panel-field" id="cntFieldImagen" style="display:none;">' +
      "<label>Imagen</label>" +
      '<input type="file" id="cntPanelImagen" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.bmp,.gif,.heic,.heif">' +
      '<textarea id="cntPanelDescImg" rows="2" placeholder="Descripción (opcional)"></textarea>' +
      '<div id="cntImgUploadBox" class="cnt-img-upload" style="display:none;">' +
      '<div class="cnt-img-upload-card">' +
      '<img id="cntImgUploadThumb" class="cnt-img-upload-thumb" alt="" />' +
      '<p id="cntImgUploadStatus" class="cnt-img-upload-status">Subiendo imagen…</p>' +
      '<div class="cnt-img-upload-bar"><span id="cntImgUploadBarFill"></span></div>' +
      '<span id="cntImgUploadPct" class="cnt-img-upload-pct">0%</span>' +
      "</div></div>" +
      '<div id="cntImgUploadDone" class="cnt-img-upload-done" style="display:none;">' +
      '<img id="cntImgDoneThumb" class="cnt-img-done-thumb" alt="" />' +
      "<span>✅ Imagen lista</span></div>" +
      '<button type="button" class="cnt-btn cnt-btn-ghost" id="cntSubirImagen" style="margin-top:6px;">Subir imagen</button></div>' +
      '<div class="cnt-panel-field" id="cntFieldAudio" style="display:none;">' +
      "<label>Audio</label>" +
      '<input type="file" id="cntPanelAudio" accept="audio/*">' +
      '<button type="button" class="cnt-btn cnt-btn-ghost" id="cntSubirAudio" style="margin-top:6px;">Subir audio</button></div>' +
      '<div class="cnt-panel-field" id="cntFieldVideo" style="display:none;">' +
      "<label>Video</label>" +
      '<input type="file" id="cntPanelVideo" accept="video/*">' +
      '<textarea id="cntPanelDescVid" rows="2" placeholder="Descripción (opcional)"></textarea>' +
      '<button type="button" class="cnt-btn cnt-btn-ghost" id="cntSubirVideo" style="margin-top:6px;">Subir video</button></div>' +
      '<div class="cnt-panel-field" id="cntFieldDoc" style="display:none;">' +
      "<label>Documento (URL)</label>" +
      '<input type="text" id="cntPanelDocUrl" placeholder="URL pública del PDF">' +
      '<button type="button" class="cnt-btn cnt-btn-ghost" id="cntAddDoc" style="margin-top:6px;">Agregar documento</button></div>' +
      '<div class="cnt-panel-field" id="cntFieldBoton" style="display:none;">' +
      "<label>Texto del mensaje</label>" +
      '<textarea id="cntPanelBotonTexto" rows="3" placeholder="¿Cómo deseas pagar?"></textarea>' +
      "<label>Botones WhatsApp</label>" +
      '<div id="cntBotonesLista" class="cnt-botones-lista"></div>' +
      '<button type="button" class="cnt-btn cnt-btn-ghost" id="cntAddBoton" style="margin-top:6px;">Agregar botón</button></div>' +
      '<div class="cnt-panel-field"><label>Vista previa en vivo</label>' +
      '<div id="cntPanelPreview" class="cnt-panel-preview"></div></div>' +
      '<div class="cnt-panel-field"><label>Bloques de la variante</label>' +
      '<div id="cntPanelBloques" class="cnt-blocks-mini"></div></div>' +
      '<div class="cnt-actions">' +
      '<button type="button" class="cnt-btn cnt-btn-primary" id="cntGuardarPanel">Guardar en el nodo</button>' +
      "</div></div>";

    const fields = {
      texto: "cntFieldTexto",
      tiempo: "cntFieldTiempo",
      imagen: "cntFieldImagen",
      audio: "cntFieldAudio",
      video: "cntFieldVideo",
      doc: "cntFieldDoc",
      boton: "cntFieldBoton",
    };

    contenido.querySelectorAll(".content-block-card[data-tipo]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (isEditingBlock) cancelarEdicionBloque();
        mostrarCampoTipoEnPanel(btn.dataset.tipo);
        if (btn.dataset.tipo === "boton") {
          renderFormularioBotonesContenido([], null);
        }
      });
    });

    document.getElementById("cntAddVariante")?.addEventListener("click", function () {
      variantesActivas.push([]);
      variantePanelIndex = variantesActivas.length - 1;
      onPanelChange();
    });

    document.getElementById("cntAddTexto")?.addEventListener("click", agregarTextoDesdePanel);
    document.getElementById("cntAddTiempo")?.addEventListener("click", agregarTiempoDesdePanel);
    document.getElementById("cntSubirImagen")?.addEventListener("click", guardarImagenDesdePanel);
    document.getElementById("cntPanelImagen")?.addEventListener("change", function () {
      const f = this.files?.[0];
      if (f) subirImagenNodoFlujo(f);
    });
    document.getElementById("cntSubirAudio")?.addEventListener("click", guardarAudioDesdePanel);
    document.getElementById("cntSubirVideo")?.addEventListener("click", guardarVideoDesdePanel);
    document.getElementById("cntAddDoc")?.addEventListener("click", agregarDocDesdePanel);
    document.getElementById("cntAddBoton")?.addEventListener("click", agregarBotonDesdePanel);
    document.getElementById("cntGuardarPanel")?.addEventListener("click", guardarDesdePanel);

    renderPanelStats();
    renderVariantChips();
    renderPanelPreview();
    renderPanelBloques();
    mostrarCampoTipoEnPanel("texto");
  }

  function flushPanelToNode() {
    if (nodoActivo && variantesActivas) {
      guardarVariantesEnNodo(nodoActivo, variantesActivas);
    }
  }

  function clearPanelActivo() {
    nodoActivo = null;
    variantesActivas = [[]];
    variantePanelIndex = 0;
    isEditingBlock = false;
    editingBlockIndex = -1;
  }

  function getNodoActivo() {
    return nodoActivo;
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

    if (typeof nodoCount !== "number") {
      window.nodoCount = 0;
    }
    nodoCount += 1;

    const variantes = [[]];
    const estado = calcularEstado(variantes);
    const bodyHtml = buildContenidoPreviewCompact(variantes);
    const jsonVariantes = JSON.stringify(variantes)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const nodo = document.createElement("div");
    nodo.className = "node content-node node-contenido content-node--visual-compact-square";
    nodo.id = "nodo_" + nodoCount;
    nodo.dataset.tipo = "contenido";
    nodo.style.left = 120 + nodoCount * 20 + "px";
    nodo.style.top = 120 + nodoCount * 20 + "px";

    nodo.innerHTML =
      '<div class="port in" data-nodo="' +
      nodo.id +
      '" onmousedown="iniciarConexion(event, \'' +
      nodo.id +
      '\', \'in\')"></div>' +
      '<div class="node-actions">' +
      '<button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo(\'' +
      nodo.id +
      '\')">✎</button>' +
      '<button type="button" class="duplicate-node" onclick="event.stopPropagation(); duplicarNodo(\'' +
      nodo.id +
      '\')" title="Duplicar" aria-label="Duplicar">⧉</button>' +
      '<button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo(\'' +
      nodo.id +
      '\')">×</button></div>' +
      '<div class="content-header">' +
      '<span class="content-header-title">💬 Contenido</span>' +
      '<span class="content-status content-status--' +
      estado +
      '" data-status="' +
      estado +
      '">' +
      textoEstado(estado) +
      "</span></div>" +
      '<div class="content-body">' +
      bodyHtml +
      "</div>" +
      '<textarea class="contenido-variantes-data" style="display:none;">' +
      jsonVariantes +
      "</textarea>" +
      '<div class="port out" data-nodo="' +
      nodo.id +
      '" onmousedown="iniciarConexion(event, \'' +
      nodo.id +
      '\', \'out\')"></div>';

    canvas.appendChild(nodo);

    if (typeof hacerMovible === "function") {
      hacerMovible(nodo);
    }

    renderPreviewNodo(nodo, variantes);

    if (typeof abrirPanelNodo === "function") {
      abrirPanelNodo(nodo);
    } else {
      renderPanel(nodo);
      document.getElementById("panelNodo")?.classList.add("activo");
    }

    return nodo;
  }

  return {
    buildContenidoPreviewHtml: buildContenidoPreviewHtml,
    buildContenidoPreviewBody: buildContenidoPreviewBody,
    buildContenidoPreviewCompact: buildContenidoPreviewCompact,
    calcularEstado: calcularEstado,
    textoEstado: textoEstado,
    renderPreviewNodo: renderPreviewNodo,
    renderPanel: renderPanel,
    esNodoContenido: esNodoContenido,
    refrescarNodoCargado: refrescarNodoCargado,
    leerVariantesDeNodo: leerVariantesDeNodo,
    guardarVariantesEnNodo: guardarVariantesEnNodo,
    flushPanelToNode: flushPanelToNode,
    clearPanelActivo: clearPanelActivo,
    getNodoActivo: getNodoActivo,
    crearNodoEnCanvas: crearNodoEnCanvas,
    etiquetaTipo: etiquetaTipo,
    iconoTipo: iconoTipo,
  };
})();
