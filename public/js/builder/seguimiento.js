/**
 * MacBot — Editor de nodo Seguimiento CRM (panel derecho + preview en canvas)
 */
window.MacBotSeguimiento = (function () {
  const UNIDADES = ["minutos", "horas", "dias"];
  const TIPOS = ["texto", "imagen", "audio", "pdf"];
  const ESTADOS_LABEL = {
    pendiente: "Pendiente",
    enviado: "Enviado",
    cancelado: "Cancelado",
    respondido: "Respondido",
  };

  let nodoActivo = null;
  let configActiva = crearConfigVacia();
  let pasoActivoIndex = 0;

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function crearConfigVacia() {
    return {
      version: 2,
      soloSiNoRespondio: true,
      detenerSiResponde: true,
      pasos: [],
    };
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
    return v + " " + map[u];
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
    const map = { texto: "💬", imagen: "🖼️", audio: "🎧", pdf: "📄" };
    return map[tipo] || "💬";
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
    if (!paso) return null;
    const delay = paso.delay || {};
    const valor = delay.valor != null ? delay.valor : paso.minutos;
    const unidad = normalizarUnidad(delay.unidad || "minutos");
    const mensaje = normalizarMensaje(paso.mensaje, paso.mensaje || paso.texto);
    const segundos = delayToSeconds(valor, unidad);

    if (segundos <= 0) return null;
    if (!mensaje.texto && !mensaje.url) return null;

    return {
      id: paso.id || "paso_" + (index + 1),
      delay: { valor: parseInt(valor, 10) || 1, unidad },
      segundos,
      mensaje,
      estado: paso.estado || "pendiente",
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

  function leerConfigDeNodo(nodo) {
    const box = nodo?.querySelector(".seguimiento-data");
    if (!box) return crearConfigVacia();
    try {
      return normalizarConfig(JSON.parse(box.value || "[]"));
    } catch (e) {
      return crearConfigVacia();
    }
  }

  function guardarConfigEnNodo(nodo, config) {
    const box = nodo.querySelector(".seguimiento-data");
    if (box) {
      box.value = JSON.stringify(config);
    }
    renderPreviewNodo(nodo, config);
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
      return;
    }

    const timeline = calcularTimeline(config.pasos);
    const maxSeg = timeline[timeline.length - 1]?.acumulado || 1;
    const pct = 100;

    let html =
      '<motion class="follow-title">Automatización · ' +
      config.pasos.length +
      " paso(s)</div>";

    html += '<div class="follow-steps">';

    timeline.forEach((item, index) => {
      const p = item.paso;
      html +=
        '<div class="follow-step">' +
        '<motion class="follow-step-meta">' +
        '<span class="follow-step-name">Paso ' +
        (index + 1) +
        " · " +
        esc(formatearDuracionTotal(item.acumulado)) +
        "</span>" +
        '<span class="follow-step-delay">⏱ ' +
        esc(formatearDelay(p.delay)) +
        " después del anterior</span>" +
        '<span class="follow-step-tipo">' +
        iconoTipo(p.mensaje.tipo) +
        " " +
        esc(p.mensaje.tipo) +
        "</span>" +
        "</div>" +
        '<span class="follow-badge">' +
        esc(ESTADOS_LABEL[p.estado] || "pendiente") +
        "</span>" +
        "</div>";
    });

    html += "</motion>";
    html +=
      '<div class="follow-timer-bar"><div class="follow-timer-fill" style="width:' +
      pct +
      '%"></div></div>';

    body.innerHTML = html.replace(/<motion/g, "<div").replace(/<\/motion>/g, "</div>");
  }

  function crearPasoVacio() {
    return {
      id: "paso_" + Date.now(),
      delay: { valor: 15, unidad: "minutos" },
      segundos: 15 * 60,
      mensaje: { tipo: "texto", texto: "", url: "", caption: "" },
      estado: "pendiente",
    };
  }

  function syncPasoDesdeFormulario() {
    const paso = configActiva.pasos[pasoActivoIndex];
    if (!paso) return;

    paso.delay.valor =
      parseInt(document.getElementById("segDelayValor")?.value, 10) || 1;
    paso.delay.unidad = document.getElementById("segDelayUnidad")?.value || "minutos";
    paso.segundos = delayToSeconds(paso.delay.valor, paso.delay.unidad);
    paso.mensaje.tipo =
      document.querySelector(".seg-tipo-tab.active")?.dataset.tipo || "texto";
    paso.mensaje.texto = document.getElementById("segTexto")?.value.trim() || "";
    paso.mensaje.caption = document.getElementById("segCaption")?.value.trim() || "";
    const urlPreview = document.getElementById("segUrlPreview");
    if (urlPreview?.dataset.url) {
      paso.mensaje.url = urlPreview.dataset.url;
    }
  }

  function renderFormularioPaso() {
    const paso = configActiva.pasos[pasoActivoIndex];
    const wrap = document.getElementById("segFormPaso");
    if (!wrap || !paso) {
      if (wrap) wrap.innerHTML = '<p class="seg-panel-desc">Agrega un paso de seguimiento.</p>';
      return;
    }

    const timeline = calcularTimeline(configActiva.pasos);
    const item = timeline[pasoActivoIndex];
    const acumulado = item ? item.acumulado : paso.segundos;

    wrap.innerHTML =
      '<div class="seg-visual-timer">' +
      "<strong>⏱ Temporizador acumulado</strong>" +
      "<span>Se envía ~" +
      esc(formatearDuracionTotal(acumulado)) +
      " después de activar el nodo</span>" +
      "</div>" +
      '<motion class="seg-delay-row">' +
      '<motion class="seg-field"><label>Retraso</label><input id="segDelayValor" type="number" min="1" value="' +
      esc(paso.delay.valor) +
      '"></div>' +
      '<motion class="seg-field"><label>Unidad</label><select id="segDelayUnidad">' +
      UNIDADES.map(
        (u) =>
          '<option value="' +
          u +
          '"' +
          (paso.delay.unidad === u ? " selected" : "") +
          ">" +
          u +
          "</option>"
      ).join("") +
      "</select></motion>" +
      "</div>" +
      '<motion class="seg-field"><label>Tipo de mensaje</label><div class="seg-tipo-tabs">' +
      TIPOS.map(
        (t) =>
          '<button type="button" class="seg-tipo-tab' +
          (paso.mensaje.tipo === t ? " active" : "") +
          '" data-tipo="' +
          t +
          '">' +
          iconoTipo(t) +
          " " +
          t +
          "</button>"
      ).join("") +
      "</div></div>" +
      '<div id="segCamposMensaje"></motion>' +
      "</motion>";

    wrap.innerHTML = wrap.innerHTML.replace(/<motion/g, "<motion").replace(/<\/motion>/g, "</motion>");
    wrap.innerHTML = wrap.innerHTML
      .replace(/<motion/g, "<div")
      .replace(/<\/motion>/g, "</motion>")
      .replace(/<\/motion>/g, "</div>");

    renderCamposMensaje(paso);

    document.getElementById("segDelayValor")?.addEventListener("input", onFormChange);
    document.getElementById("segDelayUnidad")?.addEventListener("change", onFormChange);
    wrap.querySelectorAll(".seg-tipo-tab").forEach((btn) => {
      btn.addEventListener("click", function () {
        syncPasoDesdeFormulario();
        paso.mensaje.tipo = btn.dataset.tipo;
        paso.mensaje.texto = "";
        paso.mensaje.url = "";
        paso.mensaje.caption = "";
        renderFormularioPaso();
        renderListaPasos();
      });
    });
  }

  function renderCamposMensaje(paso) {
    const box = document.getElementById("segCamposMensaje");
    if (!box) return;

    if (paso.mensaje.tipo === "texto") {
      box.innerHTML =
        '<motion class="seg-field"><label>Texto WhatsApp</label>' +
        '<textarea id="segTexto" placeholder="Escribe el mensaje de seguimiento">' +
        esc(paso.mensaje.texto) +
        "</textarea></div>";
    } else {
      box.innerHTML =
        '<motion class="seg-field"><label>Archivo (' +
        paso.mensaje.tipo +
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
        (paso.mensaje.tipo === "imagen" || paso.mensaje.tipo === "pdf"
          ? '<motion class="seg-field"><label>Leyenda (opcional)</label><input id="segCaption" value="' +
            esc(paso.mensaje.caption) +
            '"></div>'
          : "");

      box.innerHTML = box.innerHTML
        .replace(/<motion/g, "<div")
        .replace(/<\/motion>/g, "</div>");

      document.getElementById("segArchivo")?.addEventListener("change", subirArchivo);
    }

    document.getElementById("segTexto")?.addEventListener("input", onFormChange);
    document.getElementById("segCaption")?.addEventListener("input", onFormChange);
  }

  function getAccept(tipo) {
    if (tipo === "imagen") return "image/*";
    if (tipo === "audio") return "audio/*";
    if (tipo === "pdf") return "application/pdf,.pdf";
    return "*/*";
  }

  function subirArchivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("archivo", file);

    const preview = document.getElementById("segUrlPreview");
    if (preview) preview.textContent = "Subiendo…";

    fetch("/subir-archivo", { method: "POST", body: formData })
      .then((r) => r.json())
      .then((data) => {
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
      .catch(() => alert("Error de red al subir"));
  }

  function onFormChange() {
    syncPasoDesdeFormulario();
    renderListaPasos();
    if (nodoActivo) renderPreviewNodo(nodoActivo, configActiva);
    const timerLabel = document.getElementById("segTimerLabel");
    if (timerLabel) {
      const timeline = calcularTimeline(configActiva.pasos);
      const item = timeline[pasoActivoIndex];
      timerLabel.textContent = item
        ? "~" + formatearDuracionTotal(item.acumulado)
        : "—";
    }
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
      .map((paso, index) => {
        const acum = timeline[index]?.acumulado || 0;
        return (
          '<div class="seg-step-card' +
          (index === pasoActivoIndex ? " active" : "") +
          '" data-index="' +
          index +
          '">' +
          '<div class="seg-step-head" data-action="select">' +
          "<strong>Paso " +
          (index + 1) +
          "</strong>" +
          "<small>⏱ " +
          esc(formatearDuracionTotal(acum)) +
          "</small>" +
          "</div>" +
          '<div class="seg-step-body">' +
          '<span class="seg-panel-desc">' +
          iconoTipo(paso.mensaje.tipo) +
          " · " +
          esc(formatearDelay(paso.delay)) +
          "</span>" +
          '<button type="button" class="seg-btn seg-btn-danger" data-action="delete">Eliminar paso</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    lista.querySelectorAll(".seg-step-card").forEach((card) => {
      const index = parseInt(card.dataset.index, 10);
      card.querySelector('[data-action="select"]')?.addEventListener("click", () => {
        syncPasoDesdeFormulario();
        pasoActivoIndex = index;
        renderListaPasos();
        renderFormularioPaso();
      });
      card.querySelector('[data-action="delete"]')?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        configActiva.pasos.splice(index, 1);
        pasoActivoIndex = Math.max(0, pasoActivoIndex - 1);
        renderListaPasos();
        renderFormularioPaso();
        onFormChange();
      });
    });
  }

  async function cargarEstadosLive(nodo) {
    const box = document.getElementById("segEstadosLive");
    if (!box) return;

    const flujoId = window.MACBOT_BUILDER?.flujoEditandoId;
    if (!flujoId) {
      box.innerHTML =
        '<p class="seg-panel-desc">Guarda el flujo para ver ejecuciones en vivo.</p>';
      return;
    }

    try {
      const res = await fetch(
        "/api/seguimientos/nodo?flujo_id=" +
          encodeURIComponent(flujoId) +
          "&nodo_id=" +
          encodeURIComponent(nodo.id)
      );
      const data = await res.json();
      const items = data.items || [];

      if (!items.length) {
        box.innerHTML =
          '<p class="seg-panel-desc">Aún no hay seguimientos ejecutados para este nodo.</p>';
        return;
      }

      box.innerHTML = items
        .slice(0, 12)
        .map(
          (item) =>
            '<div class="seg-estado-item">' +
            "<span>#" +
            (item.paso_index + 1) +
            " · " +
            esc(item.cliente_numero) +
            "</span>" +
            '<span class="seg-estado-pill ' +
            esc(item.estado) +
            '">' +
            esc(ESTADOS_LABEL[item.estado] || item.estado) +
            "</span>" +
            "</div>"
        )
        .join("");
    } catch (e) {
      box.innerHTML = '<p class="seg-panel-desc">No se pudieron cargar estados.</p>';
    }
  }

  function renderPanel(nodo) {
    nodoActivo = nodo;
    configActiva = leerConfigDeNodo(nodo);
    pasoActivoIndex = 0;

    const contenido = document.getElementById("panelNodoContenido");
    if (!contenido) return;

    contenido.innerHTML =
      '<div class="seg-panel">' +
      "<h4>⏱ Seguimiento CRM</h4>" +
      '<p class="seg-panel-desc">Automatiza recordatorios si el lead no responde. Los mensajes se programan en segundo plano y se envían por WhatsApp.</p>' +
      '<div class="seg-toggle-row">' +
      '<label class="seg-toggle"><input type="checkbox" id="segSoloNoRespondio"' +
      (configActiva.soloSiNoRespondio ? " checked" : "") +
      "> Solo enviar si el lead <strong>no respondió</strong></label>" +
      '<label class="seg-toggle"><input type="checkbox" id="segDetenerSiResponde"' +
      (configActiva.detenerSiResponde ? " checked" : "") +
      "> Detener seguimiento si <strong>respondió</strong></label>" +
      "</motion>" +
      '<div class="seg-visual-timer" id="segTimerBox">' +
      "<strong>Temporizador del paso activo</strong>" +
      '<span id="segTimerLabel">—</span>' +
      "</div>" +
      '<div id="segListaPasos" class="seg-steps-list"></div>' +
      '<div class="seg-actions">' +
      '<button type="button" class="seg-btn seg-btn-ghost" id="segAddPaso">+ Agregar paso</button>' +
      "</div>" +
      '<motion id="segFormPaso"></motion>' +
      "<h4>Estados en vivo</h4>" +
      '<div id="segEstadosLive" class="seg-estados-live"></motion>' +
      '<div class="seg-actions">' +
      '<button type="button" class="seg-btn seg-btn-primary" id="segGuardarPanel">Guardar seguimiento</button>' +
      "</div>" +
      "</div>";

    contenido.innerHTML = contenido.innerHTML
      .replace(/<motion/g, "<div")
      .replace(/<\/motion>/g, "</div>");

    document.getElementById("segAddPaso")?.addEventListener("click", () => {
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
    cargarEstadosLive(nodo);
    onFormChange();
  }

  function guardarDesdePanel() {
    if (!nodoActivo) return;
    syncPasoDesdeFormulario();

    configActiva.soloSiNoRespondio = !!document.getElementById("segSoloNoRespondio")?.checked;
    configActiva.detenerSiResponde = !!document.getElementById("segDetenerSiResponde")?.checked;

    configActiva.pasos = configActiva.pasos
      .map((p, i) => normalizarPaso(p, i))
      .filter(Boolean);

    guardarConfigEnNodo(nodoActivo, configActiva);
    alert("Seguimiento guardado en el nodo. Recuerda guardar el flujo completo.");
  }

  function esNodoSeguimiento(nodo) {
    return (
      nodo?.dataset?.tipo === "seguimiento" ||
      nodo?.classList?.contains("follow-node")
    );
  }

  function initNodoRecienCreado(nodo) {
    guardarConfigEnNodo(nodo, crearConfigVacia());
  }

  function refrescarNodoCargado(nodo) {
    const config = leerConfigDeNodo(nodo);
    guardarConfigEnNodo(nodo, config);
  }

  return {
    crearConfigVacia,
    leerConfigDeNodo,
    guardarConfigEnNodo,
    renderPreviewNodo,
    renderPanel,
    esNodoSeguimiento,
    initNodoRecienCreado,
    refrescarNodoCargado,
    abrirEditorSeguimiento: function (id) {
      const nodo = document.getElementById(id);
      if (nodo) renderPanel(nodo);
    },
  };
})();
