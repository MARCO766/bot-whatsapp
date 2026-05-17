/**
 * MacBot — Nodo Contenido (preview premium + panel derecho)
 */
window.MacBotContenido = (function () {
  const TIPOS_MEDIA = ["imagen", "audio", "video", "doc"];
  const TIPOS_ENTREGABLE = ["texto", "imagen", "audio", "video", "doc", "boton"];
  const COMPACT_FROM = 4;
  const SCROLL_FROM = 7;

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
      return !!(item.valor || item.texto || item.descripcion);
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
      const lbl = truncar(item.valor || item.texto || item.descripcion || "Botón", 24);
      if (!lbl) return "";
      return '<div class="cnt-cta">' + esc(lbl) + "</div>";
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

  function buildContenidoPreviewHtml(variantesValidasList) {
    const jsonVariantes = JSON.stringify(variantesValidasList)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const body = buildContenidoPreviewBody(variantesValidasList);

    return (
      '<textarea class="contenido-variantes-data" style="display:none;">' +
      jsonVariantes +
      "</textarea>" +
      (typeof body === "string" ? body : body.html)
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
    const stats = analizarVariantes(vars);
    const preview = buildContenidoPreviewBody(vars);

    actualizarStatusBadge(nodo, estado);

    if (!body) return;

    body.innerHTML = typeof preview === "string" ? preview : preview.html;
    aplicarLayoutDinamicoNodo(nodo, stats.bloques);
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

    nodo.classList.add("content-node");
    nodo.classList.remove("blue");
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
        '\')"></div>';
    const portOutHtml = portsOut
      ? portsOut.outerHTML
      : '<div class="port out" data-nodo="' +
        id +
        '" onmousedown="iniciarConexion(event, \'' +
        id +
        '\')"></div>';

    nodo.innerHTML =
      portInHtml +
      '<div class="node-actions">' +
      '<button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo(\'' +
      id +
      '\')">✎</button>' +
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

  function syncGlobalsDesdePanel() {
    if (typeof variantesContenido === "undefined") return;
    variantesContenido = JSON.parse(JSON.stringify(variantesActivas));
    varianteActual = variantePanelIndex;
    contenidoArmado = variantesContenido[varianteActual] || [];
  }

  function syncPanelDesdeGlobals() {
    if (typeof variantesContenido !== "undefined" && Array.isArray(variantesContenido)) {
      variantesActivas = JSON.parse(JSON.stringify(variantesContenido));
      variantePanelIndex =
        typeof varianteActual === "number" ? varianteActual : 0;
    }
  }

  function varianteActualPanel() {
    if (!variantesActivas[variantePanelIndex]) {
      variantesActivas[variantePanelIndex] = [];
    }
    return variantesActivas[variantePanelIndex];
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
        else if (item.tipo === "boton") resumen = truncar(item.valor || item.texto, 30);
        else resumen = truncar(item.descripcion || item.valor || "", 36);

        return (
          '<div class="cnt-block-row">' +
          "<span>" +
          iconoTipo(item.tipo) +
          " " +
          esc(etiquetaTipo(item.tipo)) +
          (resumen ? " · " + esc(resumen) : "") +
          "</span>" +
          '<button type="button" data-index="' +
          index +
          '">Quitar</button></div>'
        );
      })
      .join("");

    lista.querySelectorAll("button[data-index]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const idx = parseInt(btn.dataset.index, 10);
        varianteActualPanel().splice(idx, 1);
        onPanelChange();
      });
    });
  }

  function renderVariantChips() {
    const wrap = document.getElementById("cntVariantChips");
    if (!wrap) return;

    wrap.innerHTML = variantesActivas
      .map(function (_, i) {
        return (
          '<button type="button" class="cnt-variant-chip' +
          (i === variantePanelIndex ? " active" : "") +
          '" data-index="' +
          i +
          '">Variante ' +
          (i + 1) +
          "</button>"
        );
      })
      .join("");

    wrap.querySelectorAll(".cnt-variant-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        variantePanelIndex = parseInt(chip.dataset.index, 10);
        renderVariantChips();
        renderPanelPreview();
        renderPanelBloques();
        renderPanelStats();
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
    varianteActualPanel().push({ tipo: "texto", valor: texto });
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
    varianteActualPanel().push({ tipo: "tiempo", valor: String(t) });
    if (input) input.value = "";
    onPanelChange();
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

        varianteActualPanel().push(item);
        if (fileInput) fileInput.value = "";
        onPanelChange();
      })
      .catch(function () {
        alert("Error de red al subir");
      });
  }

  function agregarDocDesdePanel() {
    const url = document.getElementById("cntPanelDocUrl")?.value?.trim();
    if (!url) return;
    varianteActualPanel().push({ tipo: "doc", valor: url });
    document.getElementById("cntPanelDocUrl").value = "";
    onPanelChange();
  }

  function abrirEditorCompleto() {
    syncGlobalsDesdePanel();
    if (typeof abrirContenido === "function") {
      abrirContenido();
      setTimeout(function () {
        if (typeof refrescarVarianteActual === "function") {
          refrescarVarianteActual();
        }
      }, 80);
    }
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
      '<div class="cnt-panel-field"><label>Agregar bloque</label><div class="cnt-quick-add">' +
      '<button type="button" class="cnt-quick-btn" data-tipo="texto">💬 Texto</button>' +
      '<button type="button" class="cnt-quick-btn" data-tipo="tiempo">⏳ Pausa</button>' +
      '<button type="button" class="cnt-quick-btn" data-tipo="imagen">🖼 Imagen</button>' +
      '<button type="button" class="cnt-quick-btn" data-tipo="audio">🎧 Audio</button>' +
      '<button type="button" class="cnt-quick-btn" data-tipo="video">🎬 Video</button>' +
      '<button type="button" class="cnt-quick-btn" data-tipo="doc">📄 PDF</button>' +
      "</div></div>" +
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
      '<input type="file" id="cntPanelImagen" accept="image/*">' +
      '<textarea id="cntPanelDescImg" rows="2" placeholder="Descripción (opcional)"></textarea>' +
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
      '<div class="cnt-panel-field"><label>Vista previa en vivo</label>' +
      '<div id="cntPanelPreview" class="cnt-panel-preview"></div></div>' +
      '<div class="cnt-panel-field"><label>Bloques de la variante</label>' +
      '<div id="cntPanelBloques" class="cnt-blocks-mini"></div></div>' +
      '<div class="cnt-actions">' +
      '<button type="button" class="cnt-btn cnt-btn-ghost" id="cntEditorCompleto">Editor completo (modal)</button>' +
      '<button type="button" class="cnt-btn cnt-btn-primary" id="cntGuardarPanel">Guardar contenido</button>' +
      "</div></div>";

    const fields = {
      texto: "cntFieldTexto",
      tiempo: "cntFieldTiempo",
      imagen: "cntFieldImagen",
      audio: "cntFieldAudio",
      video: "cntFieldVideo",
      doc: "cntFieldDoc",
    };

    contenido.querySelectorAll(".cnt-quick-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        Object.keys(fields).forEach(function (k) {
          const el = document.getElementById(fields[k]);
          if (el) el.style.display = k === btn.dataset.tipo ? "block" : "none";
        });
      });
    });

    document.getElementById("cntAddVariante")?.addEventListener("click", function () {
      variantesActivas.push([]);
      variantePanelIndex = variantesActivas.length - 1;
      onPanelChange();
    });

    document.getElementById("cntAddTexto")?.addEventListener("click", agregarTextoDesdePanel);
    document.getElementById("cntAddTiempo")?.addEventListener("click", agregarTiempoDesdePanel);
    document.getElementById("cntSubirImagen")?.addEventListener("click", function () {
      subirArchivoPanel("cntPanelImagen", "imagen", true);
    });
    document.getElementById("cntSubirAudio")?.addEventListener("click", function () {
      subirArchivoPanel("cntPanelAudio", "audio", false);
    });
    document.getElementById("cntSubirVideo")?.addEventListener("click", function () {
      subirArchivoPanel("cntPanelVideo", "video", true);
    });
    document.getElementById("cntAddDoc")?.addEventListener("click", agregarDocDesdePanel);
    document.getElementById("cntEditorCompleto")?.addEventListener("click", abrirEditorCompleto);
    document.getElementById("cntGuardarPanel")?.addEventListener("click", guardarDesdePanel);

    renderPanelStats();
    renderVariantChips();
    renderPanelPreview();
    renderPanelBloques();
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
  }

  function getNodoActivo() {
    return nodoActivo;
  }

  return {
    buildContenidoPreviewHtml: buildContenidoPreviewHtml,
    buildContenidoPreviewBody: buildContenidoPreviewBody,
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
    syncPanelDesdeGlobals: syncPanelDesdeGlobals,
    etiquetaTipo: etiquetaTipo,
    iconoTipo: iconoTipo,
  };
})();
