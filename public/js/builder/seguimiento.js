/**
 * MacBot — Editor de nodo Seguimiento CRM
 */
window.MacBotSeguimiento = (function () {
  const UNIDADES = ["minutos", "horas", "dias"];
  const TIPOS = ["texto", "imagen", "audio", "pdf", "video"];
  const MAX_BOTONES = 3;
  const MAX_TEXTO_BOTON = 20;
  const MAX_VIDEO_MB = 15;
  const MAX_IMAGEN_MB = 2;
  const MAX_AUDIO_MB = 5;
  const MAX_DOCUMENTO_MB = 5;
  function crearConfigVacia() {
    return {
      version: 2,
      soloSiNoRespondio: true,
      detenerSiResponde: true,
      pasos: [],
    };
  }

  let nodoActivo = null;
  let configActiva = crearConfigVacia();
  let pasoActivoIndex = 0;
  const uiBloqueActivoPorPaso = {};

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizarUnidad(unidad) {
    const u = String(unidad || "minutos").toLowerCase();
    if (u === "dia" || u === "día" || u === "dias" || u === "días") return "dias";
    if (u === "hora" || u === "horas") return "horas";
    return "minutos";
  }

  function delayToSeconds(valor, unidad) {
    const n = parseInt(valor, 10);
    if (isNaN(n) || n <= 0) return 0;
    const u = normalizarUnidad(unidad);
    if (u === "horas") return n * 3600;
    if (u === "dias") return n * 86400;
    return n * 60;
  }

  function formatearDelay(delay) {
    if (!delay) return "—";
    const v = delay.valor;
    const u = normalizarUnidad(delay.unidad);
    const map = { minutos: "min", horas: "h", dias: "d" };
    return v + " " + (map[u] || u);
  }

  function formatearDuracionTotal(segundos) {
    if (!segundos) return "Inmediato";
    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor((segundos % 86400) / 3600);
    const mins = Math.floor((segundos % 3600) / 60);
    const partes = [];
    if (dias) partes.push(dias + "d");
    if (horas) partes.push(horas + "h");
    if (mins) partes.push(mins + "min");
    if (!partes.length) partes.push(segundos + "s");
    return partes.join(" ");
  }

  function iconoTipo(tipo) {
    const map = {
      texto: "📝",
      imagen: "🖼️",
      audio: "🎵",
      pdf: "📁",
      video: "🎬",
    };
    return map[tipo] || "📝";
  }

  function normalizarBotones(botones, pasoId) {
    if (!Array.isArray(botones)) return [];

    return botones
      .slice(0, MAX_BOTONES)
      .map(function (btn, index) {
        const texto = String(btn?.texto || btn?.text || "")
          .trim()
          .slice(0, MAX_TEXTO_BOTON);
        if (!texto) return null;
        return {
          id: String(btn?.id || "seg_" + pasoId + "_b" + index).slice(0, 128),
          texto,
        };
      })
      .filter(Boolean);
  }

  function normalizarMensaje(mensaje, legacy) {
    if (mensaje && typeof mensaje === "object") {
      const tipo = String(mensaje.tipo || "texto").toLowerCase();
      return {
        tipo: TIPOS.includes(tipo) ? tipo : "texto",
        texto: (mensaje.texto || mensaje.valor || "").trim(),
        url: (mensaje.url || "").trim(),
        caption: (mensaje.caption || mensaje.descripcion || "").trim(),
      };
    }
    return { tipo: "texto", texto: String(legacy || "").trim(), url: "", caption: "" };
  }

  function normalizarPaso(paso, index) {
    if (!paso || typeof paso !== "object") return null;

    const delay = paso.delay || {};
    const valor = delay.valor != null ? delay.valor : paso.minutos;
    const unidad = normalizarUnidad(delay.unidad || "minutos");
    const mensaje = normalizarMensaje(paso.mensaje, paso.mensaje || paso.texto);
    const segundos = delayToSeconds(valor, unidad);

    if (segundos <= 0) return null;
    if (!mensaje.texto && !mensaje.url) return null;

    const pasoId = paso.id || "paso_" + (index + 1);

    return {
      id: pasoId,
      delay: { valor: parseInt(valor, 10) || 1, unidad },
      segundos,
      mensaje,
      botones: normalizarBotones(paso.botones, pasoId),
    };
  }

  function normalizarConfig(data) {
    if (!data) return crearConfigVacia();

    if (Array.isArray(data)) {
      const pasos = data
        .map((item, i) =>
          normalizarPaso(
            {
              id: "paso_" + (i + 1),
              delay: { valor: item.minutos, unidad: "minutos" },
              mensaje: { tipo: "texto", texto: item.mensaje || "" },
            },
            i
          )
        )
        .filter(Boolean);

      return {
        version: 2,
        soloSiNoRespondio: true,
        detenerSiResponde: true,
        pasos,
      };
    }

    if (data.version === 2 || Array.isArray(data.pasos)) {
      const pasos = (data.pasos || [])
        .map((p, i) => normalizarPaso(p, i))
        .filter(Boolean);

      return {
        version: 2,
        soloSiNoRespondio: data.soloSiNoRespondio !== false,
        detenerSiResponde: data.detenerSiResponde !== false,
        pasos,
      };
    }

    return crearConfigVacia();
  }

  function leerTextareaJson(box) {
    const fromValue = String(box.value || "").trim();
    const fromContent = String(box.textContent || "").trim();
    const raw = fromValue || fromContent;
    if (!raw) return null;
    return JSON.parse(raw);
  }

  /** Lee JSON del nodo sin filtrar pasos (fuente de verdad en .seguimiento-data). */
  function parseConfigAlmacenada(data) {
    if (!data) return crearConfigVacia();

    if (Array.isArray(data)) {
      return normalizarConfig(data);
    }

    if (data.version === 2 || Array.isArray(data.pasos)) {
      const pasos = (data.pasos || []).map(function (p, i) {
        const paso = asegurarPaso(
          Object.assign(
            {
              id: "paso_" + (i + 1),
              delay: { valor: 15, unidad: "minutos" },
              segundos: 15 * 60,
              mensaje: { tipo: "texto", texto: "", url: "", caption: "" },
              botones: [],
            },
            p || {}
          )
        );
        if (!paso.segundos && paso.delay) {
          paso.segundos = delayToSeconds(paso.delay.valor, paso.delay.unidad);
        }
        return paso;
      });

      return {
        version: 2,
        soloSiNoRespondio: data.soloSiNoRespondio !== false,
        detenerSiResponde: data.detenerSiResponde !== false,
        pasos: pasos,
      };
    }

    return normalizarConfig(data);
  }

  function leerConfigDeNodo(nodo) {
    const box = nodo && nodo.querySelector(".seguimiento-data");
    if (!box) return crearConfigVacia();

    try {
      const parsed = leerTextareaJson(box);
      if (parsed == null) return crearConfigVacia();
      return parseConfigAlmacenada(parsed);
    } catch (e) {
      console.warn("Seguimiento: JSON inválido en nodo", nodo.id, e.message);
      return crearConfigVacia();
    }
  }

  function guardarConfigEnNodo(nodo, config) {
    const box = nodo.querySelector(".seguimiento-data");
    if (box) {
      const json = JSON.stringify(config);
      box.value = json;
      box.textContent = json;
    }
    renderPreviewNodo(nodo, config);
  }

  const FOLLOW_COMPACT_FROM = 5;
  const FOLLOW_SCROLL_FROM = 8;

  function notificarLayoutCanvas() {
    requestAnimationFrame(function () {
      document.dispatchEvent(new CustomEvent("macbot:nodo-layout"));
    });
  }

  function aplicarLayoutDinamicoNodo(nodo, pasoCount) {
    if (!nodo) return;

    const body = nodo.querySelector(".follow-body");
    const count = pasoCount || 0;

    nodo.classList.toggle("follow-node--compact", count >= FOLLOW_COMPACT_FROM);
    if (body) {
      body.classList.toggle("follow-body--scroll", count >= FOLLOW_SCROLL_FROM);
    }

    notificarLayoutCanvas();
  }

  function calcularTimeline(pasos) {
    let acum = 0;
    return pasos.map((paso) => {
      acum += paso.segundos || delayToSeconds(paso.delay.valor, paso.delay.unidad);
      return { paso, acumulado: acum };
    });
  }

  function renderPreviewNodo(nodo, config) {
    const body = nodo.querySelector(".follow-body");
    if (!body) return;

    if (!config.pasos.length) {
      body.innerHTML =
        '<p class="follow-empty">Configura pasos de seguimiento en el panel →</p>';
      body.classList.remove("follow-body--scroll");
      nodo.classList.remove("follow-node--compact");
      notificarLayoutCanvas();
      return;
    }

    const timeline = calcularTimeline(config.pasos);
    let html =
      '<div class="follow-title">Automatización · ' +
      config.pasos.length +
      " paso(s)</div><div class=\"follow-steps\">";

    timeline.forEach((item, index) => {
      const p = item.paso;
      html +=
        '<div class="follow-step"><div class="follow-step-meta">' +
        '<span class="follow-step-name">Paso ' +
        (index + 1) +
        " · " +
        esc(formatearDuracionTotal(item.acumulado)) +
        "</span>" +
        '<span class="follow-step-delay">⏱ ' +
        esc(formatearDelay(p.delay)) +
        "</span>" +
        '<span class="follow-step-tipo">' +
        iconoTipo(p.mensaje.tipo) +
        " " +
        esc(p.mensaje.tipo) +
        ((p.botones && p.botones.length) ? " · " + p.botones.length + " btn" : "") +
        "</span></div></div>";
    });

    html += "</div>";

    body.innerHTML = html;
    aplicarLayoutDinamicoNodo(nodo, config.pasos.length);
  }

  function crearPasoVacio() {
    return {
      id: "paso_" + Date.now(),
      delay: { valor: 15, unidad: "minutos" },
      segundos: 15 * 60,
      mensaje: { tipo: "texto", texto: "", url: "", caption: "" },
      botones: [],
    };
  }

  function asegurarPaso(paso) {
    if (!paso.delay) paso.delay = { valor: 15, unidad: "minutos" };
    if (!paso.mensaje) paso.mensaje = { tipo: "texto", texto: "", url: "", caption: "" };
    if (!Array.isArray(paso.botones)) paso.botones = [];
    return paso;
  }

  function syncPasoDesdeFormulario() {
    const paso = configActiva.pasos[pasoActivoIndex];
    if (!paso) return;

    asegurarPaso(paso);

    paso.delay.valor = parseInt(document.getElementById("segDelayValor")?.value, 10) || 1;
    paso.delay.unidad = document.getElementById("segDelayUnidad")?.value || "minutos";
    paso.segundos = delayToSeconds(paso.delay.valor, paso.delay.unidad);
    paso.mensaje.tipo =
      document.querySelector(".seg-block-card.seg-block-card-active[data-tipo]")?.dataset.tipo ||
      document.querySelector(".seg-tipo-tab.active")?.dataset.tipo ||
      "texto";
    paso.mensaje.texto = document.getElementById("segTexto")?.value.trim() || "";
    paso.mensaje.caption = document.getElementById("segCaption")?.value.trim() || "";

    const urlPreview = document.getElementById("segUrlPreview");
    if (urlPreview && urlPreview.dataset.url) {
      paso.mensaje.url = urlPreview.dataset.url;
    }

    paso.botones = normalizarBotones(
      leerBotonesDesdeFormulario(paso.id),
      paso.id
    );
  }

  function leerBotonesDesdeFormulario(pasoId) {
    const inputs = document.querySelectorAll(
      '#segBotonesLista input[data-seg-boton="1"]'
    );
    const lista = [];

    inputs.forEach(function (input, index) {
      const texto = input.value.trim();
      if (!texto) return;
      lista.push({
        id: "seg_" + pasoId + "_b" + index,
        texto,
      });
    });

    return lista;
  }

  function renderCamposMensaje(paso) {
    const box = document.getElementById("segCamposMensaje");
    if (!box) return;

    asegurarPaso(paso);

    if (paso.mensaje.tipo === "texto") {
      box.innerHTML =
        '<div class="seg-field"><label>Texto WhatsApp</label>' +
        '<textarea id="segTexto" placeholder="Escribe el mensaje">' +
        esc(paso.mensaje.texto) +
        "</textarea></div>";
      document.getElementById("segTexto")?.addEventListener("input", onFormChange);
      return;
    }

    const conCaption =
      paso.mensaje.tipo === "imagen" ||
      paso.mensaje.tipo === "pdf" ||
      paso.mensaje.tipo === "video";

    const captionField = conCaption
      ? '<div class="seg-field"><label>Leyenda (opcional)</label><input id="segCaption" value="' +
        esc(paso.mensaje.caption) +
        '"></div>'
      : "";

    box.innerHTML =
      '<div class="seg-field"><label>Archivo (' +
      esc(paso.mensaje.tipo) +
      ")</label>" +
      '<div class="seg-upload-row">' +
      '<input type="file" id="segArchivo" accept="' +
      getAccept(paso.mensaje.tipo) +
      '">' +
      '<span class="seg-upload-preview" id="segUrlPreview" data-url="' +
      esc(paso.mensaje.url) +
      '">' +
      (paso.mensaje.url ? "✓ Archivo cargado" : "Sin archivo") +
      "</span></div></div>" +
      (paso.mensaje.tipo === "video" && paso.mensaje.url
        ? '<div class="seg-video-preview"><video src="' +
          esc(paso.mensaje.url) +
          '" controls muted playsinline></video></div>'
        : "") +
      captionField;

    document.getElementById("segArchivo")?.addEventListener("change", subirArchivo);
    document.getElementById("segCaption")?.addEventListener("input", onFormChange);
  }

  function renderBotonesPaso(paso) {
    const box = document.getElementById("segBotonesLista");
    if (!box) return;

    asegurarPaso(paso);
    const botones = paso.botones || [];
    const slots = Math.max(1, Math.min(MAX_BOTONES, botones.length + 1));

    let html =
      '<p class="seg-panel-desc seg-botones-hint">Solo en mensajes de texto · máx. ' +
      MAX_BOTONES +
      "</p>";

    for (let i = 0; i < slots; i++) {
      const btn = botones[i] || { texto: "" };
      html +=
        '<div class="seg-boton-row"><span class="seg-boton-num">' +
        (i + 1) +
        '</span><input type="text" data-seg-boton="1" maxlength="' +
        MAX_TEXTO_BOTON +
        '" placeholder="Ej: Sí me interesa" value="' +
        esc(btn.texto) +
        '"></div>';
    }

    if (botones.length < MAX_BOTONES) {
      html +=
        '<button type="button" class="seg-btn seg-btn-ghost seg-btn-sm" id="segAddBoton">+ Botón</button>';
    }

    box.innerHTML = html;

    box.querySelectorAll('input[data-seg-boton="1"]').forEach(function (input) {
      input.addEventListener("input", onFormChange);
    });

    document.getElementById("segAddBoton")?.addEventListener("click", function () {
      syncPasoDesdeFormulario();
      const p = configActiva.pasos[pasoActivoIndex];
      if (!p || p.botones.length >= MAX_BOTONES) return;
      p.botones.push({ id: "seg_" + p.id + "_b" + p.botones.length, texto: "" });
      renderBotonesPaso(p);
      onFormChange();
    });
  }

  function renderFormularioPaso() {
    const wrap = document.getElementById("segFormPaso");
    if (!wrap) return;

    const paso = configActiva.pasos[pasoActivoIndex];
    if (!paso) {
      wrap.innerHTML = '<p class="seg-panel-desc">Agrega un paso de seguimiento.</p>';
      return;
    }

    asegurarPaso(paso);

    const timeline = calcularTimeline(configActiva.pasos);
    const item = timeline[pasoActivoIndex];
    const acumulado = item ? item.acumulado : paso.segundos;

    const opcionesUnidad = UNIDADES.map(function (u) {
      return (
        '<option value="' +
        u +
        '"' +
        (paso.delay.unidad === u ? " selected" : "") +
        ">" +
        u +
        "</option>"
      );
    }).join("");

    const tarjetasTipo = [
      { tipo: "texto", icon: "📝", label: "TEXTO" },
      { tipo: "imagen", icon: "🖼️", label: "IMAGEN" },
      { tipo: "video", icon: "🎬", label: "VIDEO" },
      { tipo: "pdf", icon: "📁", label: "ARCHIVO" },
      { tipo: "audio", icon: "🎵", label: "AUDIO" },
      { tipo: "retraso", icon: "⏱️", label: "RETRASO" },
    ];
    const bloqueUiActivo = uiBloqueActivoPorPaso[paso.id] || paso.mensaje.tipo;
    const pickerTipo = tarjetasTipo
      .map(function (item) {
        const esTipoMensaje = item.tipo !== "retraso";
        const activo = bloqueUiActivo === item.tipo || (item.tipo === paso.mensaje.tipo && esTipoMensaje);
        return (
          '<button type="button" class="seg-block-card seg-tipo-tab' +
          (activo ? " seg-block-card-active active" : "") +
          '"' +
          (esTipoMensaje ? ' data-tipo="' + item.tipo + '"' : ' data-action="delay"') +
          ' aria-label="' +
          item.label +
          '">' +
          '<span class="seg-block-icon" aria-hidden="true">' +
          item.icon +
          "</span>" +
          '<span class="seg-block-label">' +
          item.label +
          "</span></button>"
        );
      })
      .join("");

    wrap.innerHTML =
      '<div class="seg-visual-timer"><strong>⏱ Temporizador acumulado</strong>' +
      "<span>Se envía ~" +
      esc(formatearDuracionTotal(acumulado)) +
      " después de activar el nodo</span></div>" +
      '<div class="seg-delay-row">' +
      '<div class="seg-field"><label>Retraso</label><input id="segDelayValor" type="number" min="1" value="' +
      esc(paso.delay.valor) +
      '"></div>' +
      '<div class="seg-field"><label>Unidad</label><select id="segDelayUnidad">' +
      opcionesUnidad +
      "</select></div></div>" +
      '<div class="seg-type-panel seg-field"><label>Tipo de mensaje</label><div class="seg-block-picker seg-tipo-tabs">' +
      pickerTipo +
      '</div></div></div><div id="segCamposMensaje"></div>';

    renderCamposMensaje(paso);

    let botonesWrap = document.getElementById("segBotonesWrap");
    if (!botonesWrap) {
      botonesWrap = document.createElement("div");
      botonesWrap.id = "segBotonesWrap";
      botonesWrap.className = "seg-field seg-botones-block";
      botonesWrap.innerHTML =
        '<label>Botones WhatsApp</label><div id="segBotonesLista"></div>';
      wrap.appendChild(botonesWrap);
    }
    botonesWrap.style.display = paso.mensaje.tipo === "texto" ? "block" : "none";
    if (paso.mensaje.tipo === "texto") renderBotonesPaso(paso);

    document.getElementById("segDelayValor")?.addEventListener("input", onFormChange);
    document.getElementById("segDelayUnidad")?.addEventListener("change", onFormChange);

    wrap.querySelectorAll(".seg-block-card[data-tipo]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        syncPasoDesdeFormulario();
        uiBloqueActivoPorPaso[paso.id] = btn.dataset.tipo;
        paso.mensaje.tipo = btn.dataset.tipo;
        paso.mensaje.texto = "";
        paso.mensaje.url = "";
        paso.mensaje.caption = "";
        if (paso.mensaje.tipo !== "texto") paso.botones = [];
        renderFormularioPaso();
        renderListaPasos();
      });
    });

    wrap.querySelector('.seg-block-card[data-action="delay"]')?.addEventListener("click", function () {
      uiBloqueActivoPorPaso[paso.id] = "retraso";
      renderFormularioPaso();
      document.getElementById("segDelayValor")?.focus();
    });
  }

  function getAccept(tipo) {
    if (tipo === "imagen") return "image/*";
    if (tipo === "audio") return "audio/*";
    if (tipo === "video") return "video/*";
    if (tipo === "pdf") return "application/pdf,.pdf";
    return "*/*";
  }

  function subirArchivo(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const paso = configActiva.pasos[pasoActivoIndex];
    const tipoMedia = paso && paso.mensaje ? paso.mensaje.tipo : null;
    let maxMb = null;
    let labelLimite = null;
    if (tipoMedia === "imagen") {
      maxMb = MAX_IMAGEN_MB;
      labelLimite = "La imagen debe ser menor a " + MAX_IMAGEN_MB + "MB";
    } else if (tipoMedia === "video") {
      maxMb = MAX_VIDEO_MB;
      labelLimite = "El video debe ser menor a " + MAX_VIDEO_MB + "MB";
    } else if (tipoMedia === "audio") {
      maxMb = MAX_AUDIO_MB;
      labelLimite = "El audio debe ser menor a " + MAX_AUDIO_MB + "MB";
    } else if (tipoMedia === "pdf") {
      maxMb = MAX_DOCUMENTO_MB;
      labelLimite = "El documento debe ser menor a " + MAX_DOCUMENTO_MB + "MB";
    }
    if (maxMb != null && file.size > maxMb * 1024 * 1024) {
      alert(labelLimite);
      e.target.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("archivo", file);

    const preview = document.getElementById("segUrlPreview");
    if (preview) preview.textContent = "Subiendo…";

    fetch("/subir-archivo", { method: "POST", body: formData })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.url) {
          alert("Error subiendo archivo");
          return;
        }
        syncPasoDesdeFormulario();
        const paso = configActiva.pasos[pasoActivoIndex];
        if (paso) paso.mensaje.url = data.url;
        if (preview) {
          preview.dataset.url = data.url;
          preview.textContent = "✓ Listo";
        }
        onFormChange();
      })
      .catch(function () {
        alert("Error de red al subir");
      });
  }

  function syncOpcionesGlobalesDesdePanel() {
    const solo = document.getElementById("segSoloNoRespondio");
    const detener = document.getElementById("segDetenerSiResponde");
    if (solo) configActiva.soloSiNoRespondio = !!solo.checked;
    if (detener) configActiva.detenerSiResponde = !!detener.checked;
  }

  function persistirConfigActivaEnNodo() {
    if (!nodoActivo) return;
    syncPasoDesdeFormulario();
    syncOpcionesGlobalesDesdePanel();
    guardarConfigEnNodo(nodoActivo, configActiva);
  }

  function onFormChange() {
    syncPasoDesdeFormulario();
    renderListaPasos();
    if (nodoActivo) {
      renderPreviewNodo(nodoActivo, configActiva);
      persistirConfigActivaEnNodo();
    }
    if (typeof window.macbotRecordHistoryDebounced === "function") {
      window.macbotRecordHistoryDebounced();
    }
  }

  function flushPanelToNode() {
    persistirConfigActivaEnNodo();
  }

  function clearPanelActivo() {
    const restaurando =
      typeof builderHistorial !== "undefined" && builderHistorial.restaurando;
    if (!restaurando) {
      persistirConfigActivaEnNodo();
    }
    nodoActivo = null;
    configActiva = crearConfigVacia();
    pasoActivoIndex = 0;
    Object.keys(uiBloqueActivoPorPaso).forEach(function (k) {
      delete uiBloqueActivoPorPaso[k];
    });
  }

  function getNodoActivo() {
    return nodoActivo;
  }

  function renderListaPasos() {
    const lista = document.getElementById("segListaPasos");
    if (!lista) return;

    if (!configActiva.pasos.length) {
      lista.innerHTML = '<p class="seg-panel-desc">Sin pasos. Agrega el primero abajo.</p>';
      return;
    }

    const timeline = calcularTimeline(configActiva.pasos);

    lista.innerHTML = configActiva.pasos
      .map(function (paso, index) {
        return (
          '<div class="seg-step-card' +
          (index === pasoActivoIndex ? " active" : "") +
          '" data-index="' +
          index +
          '">' +
          '<div class="seg-step-head" data-action="select">' +
          "<strong>Paso " +
          (index + 1) +
          "</strong><small>⏱ " +
          esc(formatearDuracionTotal((timeline[index] && timeline[index].acumulado) || 0)) +
          "</small></div>" +
          '<div class="seg-step-body"><span class="seg-panel-desc">' +
          iconoTipo(paso.mensaje.tipo) +
          " · " +
          esc(formatearDelay(paso.delay)) +
          ((paso.botones && paso.botones.length) ? " · " + paso.botones.length + " btn" : "") +
          '</span><button type="button" class="seg-btn seg-btn-danger" data-action="delete">Eliminar</button></div></div>'
        );
      })
      .join("")
      ;

    lista.querySelectorAll(".seg-step-card").forEach(function (card) {
      const index = parseInt(card.dataset.index, 10);

      card.querySelector('[data-action="select"]')?.addEventListener("click", function () {
        syncPasoDesdeFormulario();
        pasoActivoIndex = index;
        renderListaPasos();
        renderFormularioPaso();
      });

      card.querySelector('[data-action="delete"]')?.addEventListener("click", function (ev) {
        ev.stopPropagation();
        configActiva.pasos.splice(index, 1);
        pasoActivoIndex = Math.max(0, pasoActivoIndex - 1);
        renderListaPasos();
        renderFormularioPaso();
        onFormChange();
      });
    });
  }

  function renderEstadoSeguimientosCliente(numero) {
    const lista = document.getElementById("segEstadoClienteLista");
    if (!lista) return;

    const api = window.MacBotSeguimientoApi;
    if (!api || typeof api.fetchSeguimientosCliente !== "function") {
      lista.innerHTML =
        '<p class="seg-panel-desc">Vista por línea no disponible.</p>';
      return;
    }

    const n = String(numero || "").trim();
    if (!n) {
      lista.innerHTML =
        '<p class="seg-panel-desc">Indica un número para ver seguimientos de esta línea.</p>';
      return;
    }

    lista.innerHTML = '<p class="seg-panel-desc">Cargando…</p>';

    api.fetchSeguimientosCliente(n).then(function (result) {
      if (result.motivo === "sin_conexion") {
        lista.innerHTML =
          '<p class="seg-panel-desc">Selecciona la línea del flujo (URL con conexion_whatsapp_id) para ver seguimientos del lead.</p>';
        return;
      }

      if (!result.ok) {
        lista.innerHTML =
          '<p class="seg-panel-desc">No se pudieron cargar seguimientos.</p>';
        return;
      }

      if (!result.items.length) {
        lista.innerHTML =
          '<p class="seg-panel-desc">Sin seguimientos en esta línea para ese número.</p>';
        return;
      }

      lista.innerHTML = result.items
        .slice(0, 8)
        .map(function (row) {
          const paso = row.paso_index != null ? row.paso_index + 1 : "?";
          const conn = row.conexion_whatsapp_id || result.conexion_whatsapp_id || "—";
          return (
            '<div class="seg-step-card">' +
            "<strong>Paso " +
            paso +
            "</strong> · " +
            esc(row.estado || "—") +
            "<br><small>Línea: " +
            esc(String(conn).slice(0, 8)) +
            "…</small></div>"
          );
        })
        .join("");
    });
  }

  function initPreviewSeguimientosClientePanel() {
    const input = document.getElementById("segPreviewNumero");
    if (!input) return;

    let debounceTimer = null;
    input.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        renderEstadoSeguimientosCliente(input.value);
      }, 400);
    });

    const inicial = String(input.value || "").trim();
    if (inicial) renderEstadoSeguimientosCliente(inicial);
  }

  function renderPanel(nodo) {
    if (!nodo) return;

    nodoActivo = nodo;
    configActiva = leerConfigDeNodo(nodo);
    pasoActivoIndex = 0;

    const contenido = document.getElementById("panelNodoContenido");
    if (!contenido) return;

    contenido.innerHTML =
      '<div class="seg-panel">' +
      "<h4>⏱ Seguimiento CRM (Legacy)</h4>" +
      '<p class="seg-panel-legacy-warn">⚠ Obsoleto — utiliza Seguimiento CRM V2 para flujos nuevos.</p>' +
      '<p class="seg-panel-desc">Automatiza recordatorios si el lead no responde.</p>' +
      '<div class="seg-field seg-estado-linea">' +
      "<label>Vista seguimientos del lead (solo esta línea)</label>" +
      '<input type="text" id="segPreviewNumero" placeholder="Número WhatsApp del lead" autocomplete="off">' +
      '<div id="segEstadoClienteLista" class="seg-steps-list"></div>' +
      "</div>" +
      '<div class="seg-toggle-row">' +
      '<label class="seg-toggle"><input type="checkbox" id="segSoloNoRespondio"' +
      (configActiva.soloSiNoRespondio ? " checked" : "") +
      "> Solo si el lead <strong>no respondió</strong></label>" +
      '<label class="seg-toggle"><input type="checkbox" id="segDetenerSiResponde"' +
      (configActiva.detenerSiResponde ? " checked" : "") +
      "> Detener si <strong>respondió</strong></label>" +
      "</div>" +
      '<div id="segListaPasos" class="seg-steps-list"></div>' +
      '<div class="seg-actions"><button type="button" class="seg-btn seg-btn-ghost" id="segAddPaso">+ Paso</button></div>' +
      '<div id="segFormPaso"></div>' +
      '<div class="seg-actions"><button type="button" class="seg-btn seg-btn-primary" id="segGuardarPanel">Guardar seguimiento</button></div>' +
      "</div>";

    document.getElementById("segAddPaso")?.addEventListener("click", function () {
      syncPasoDesdeFormulario();
      configActiva.pasos.push(crearPasoVacio());
      pasoActivoIndex = configActiva.pasos.length - 1;
      renderListaPasos();
      renderFormularioPaso();
      onFormChange();
    });

    document.getElementById("segGuardarPanel")?.addEventListener("click", guardarDesdePanel);

    renderListaPasos();
    renderFormularioPaso();
    initPreviewSeguimientosClientePanel();
    guardarConfigEnNodo(nodo, configActiva);
  }

  function guardarDesdePanel() {
    if (!nodoActivo) return;

    syncPasoDesdeFormulario();
    configActiva.soloSiNoRespondio = !!document.getElementById("segSoloNoRespondio")?.checked;
    configActiva.detenerSiResponde = !!document.getElementById("segDetenerSiResponde")?.checked;
    configActiva.pasos = configActiva.pasos
      .map(function (p, i) {
        return normalizarPaso(p, i);
      })
      .filter(Boolean);

    guardarConfigEnNodo(nodoActivo, configActiva);
    alert("Seguimiento guardado. Recuerda guardar el flujo completo.");
  }

  function esNodoSeguimiento(nodo) {
    if (!nodo) return false;
    if (
      nodo.dataset.tipo === "seguimiento_crm_v2" ||
      nodo.classList.contains("seguimiento-v2-node") ||
      nodo.classList.contains("follow-node-v2") ||
      nodo.classList.contains("node-seguimiento-v2") ||
      nodo.querySelector(".seguimiento-v2-data")
    ) {
      return false;
    }
    return (
      nodo.dataset.tipo === "seguimiento" || nodo.classList.contains("follow-node")
    );
  }

  function initNodoRecienCreado(nodo) {
    guardarConfigEnNodo(nodo, crearConfigVacia());
  }

  function refrescarNodoCargado(nodo) {
    try {
      const config = leerConfigDeNodo(nodo);
      renderPreviewNodo(nodo, config);
    } catch (e) {
      console.warn("Seguimiento: error refrescando nodo", e.message);
    }
  }

  return {
    crearConfigVacia: crearConfigVacia,
    leerConfigDeNodo: leerConfigDeNodo,
    guardarConfigEnNodo: guardarConfigEnNodo,
    renderPreviewNodo: renderPreviewNodo,
    renderPanel: renderPanel,
    esNodoSeguimiento: esNodoSeguimiento,
    initNodoRecienCreado: initNodoRecienCreado,
    refrescarNodoCargado: refrescarNodoCargado,
    renderEstadoSeguimientosCliente: renderEstadoSeguimientosCliente,
    abrirEditorSeguimiento: function (id) {
      const n = document.getElementById(id);
      if (n) renderPanel(n);
    },
    flushPanelToNode: flushPanelToNode,
    clearPanelActivo: clearPanelActivo,
    getNodoActivo: getNodoActivo,
    fetchSeguimientosCliente: function (numero) {
      const api = window.MacBotSeguimientoApi;
      if (!api) {
        console.info(
          "[SEGUIMIENTO_BUILDER] MacBotSeguimientoApi no cargado — omitiendo consulta"
        );
        return Promise.resolve({ ok: false, items: [], motivo: "api_no_cargada" });
      }
      return api.fetchSeguimientosCliente(numero);
    },
    obtenerConexionWhatsappIdBuilder: function () {
      const api = window.MacBotSeguimientoApi;
      return api ? api.obtenerConexionWhatsappIdBuilderContext() : null;
    },
  };
})();
