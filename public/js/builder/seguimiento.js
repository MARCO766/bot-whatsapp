/**
 * MacBot — Editor de nodo Seguimiento CRM
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
  const ESTADO_PRIORIDAD = {
    pendiente: 1,
    enviado: 2,
    cancelado: 3,
    respondido: 4,
  };

  let liveInited = false;
  let pollTimer = null;
  let socketRef = null;
  const fetchEnCurso = new Set();

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

  function formatearDelayIncremental(delay) {
    if (!delay) return "—";
    const v = parseInt(delay.valor, 10) || 1;
    const u = normalizarUnidad(delay.unidad);
    if (u === "horas") return "+" + v + " h";
    if (u === "dias") return "+" + v + " d";
    return "+" + v + " min";
  }

  function formatearAcumuladoCorto(segundos) {
    if (!segundos) return "0m";
    const totalMins = Math.max(1, Math.round(segundos / 60));
    if (totalMins < 60) return totalMins + "m";
    const horas = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return mins ? horas + "h" + mins + "m" : horas + "h";
  }

  function textoAcumuladoTimeline(timeline, index) {
    const cur = formatearAcumuladoCorto(timeline[index].acumulado);
    if (index === 0) return cur + " total";
    const prev = formatearAcumuladoCorto(timeline[index - 1].acumulado);
    return prev + " → " + cur + " total";
  }

  function claseBadgeEstado(estado) {
    const e = String(estado || "pendiente").toLowerCase();
    return "follow-badge follow-badge--" + e;
  }

  function resolverEstadoParaPaso(items, pasoIndex) {
    const rows = (items || []).filter(function (item) {
      return item.paso_index === pasoIndex && item.estado;
    });
    if (!rows.length) return null;

    let mejor = rows[0];
    rows.forEach(function (row) {
      const pRow = ESTADO_PRIORIDAD[row.estado] || 0;
      const pMejor = ESTADO_PRIORIDAD[mejor.estado] || 0;
      if (pRow > pMejor) mejor = row;
    });
    return mejor.estado;
  }

  function sincronizarEstadosDesdeItems(nodo, items) {
    const cfg = leerConfigDeNodo(nodo);
    let cambio = false;

    cfg.pasos.forEach(function (paso, index) {
      const nuevo = resolverEstadoParaPaso(items, index);
      if (nuevo && paso.estado !== nuevo) {
        paso.estado = nuevo;
        cambio = true;
      }
    });

    if (nodo === nodoActivo) configActiva = cfg;

    if (cambio) {
      guardarConfigEnNodo(nodo, cfg);
    } else {
      renderPreviewNodo(nodo, cfg);
    }

    if (nodo === nodoActivo) renderListaPasos();
    return cfg;
  }

  function aplicarEstadoEnNodo(nodo, pasoIndex, estado) {
    const cfg = leerConfigDeNodo(nodo);
    const paso = cfg.pasos[pasoIndex];
    if (!paso || !estado) return;

    if (paso.estado === estado) {
      renderPreviewNodo(nodo, cfg);
      return;
    }

    paso.estado = estado;
    if (nodo === nodoActivo) configActiva = cfg;
    guardarConfigEnNodo(nodo, cfg);
    if (nodo === nodoActivo) renderListaPasos();
  }

  function renderEstadosLivePanel(items) {
    const box = document.getElementById("segEstadosLive");
    if (!box) return;

    if (!items.length) {
      box.innerHTML =
        '<p class="seg-panel-desc">Aún no hay seguimientos ejecutados para este nodo.</p>';
      return;
    }

    box.innerHTML = items
      .slice(0, 12)
      .map(function (item) {
        return (
          '<div class="seg-estado-item"><span>#' +
          (item.paso_index + 1) +
          " · " +
          esc(item.cliente_numero) +
          '</span><span class="seg-estado-pill ' +
          esc(item.estado) +
          '">' +
          esc(ESTADOS_LABEL[item.estado] || item.estado) +
          "</span></div>"
        );
      })
      .join("");
  }

  function refrescarEstadosNodo(nodo) {
    const flujoId =
      window.MACBOT_BUILDER && window.MACBOT_BUILDER.flujoEditandoId;
    if (!flujoId || !nodo || !nodo.id) return;

    const key = nodo.id;
    if (fetchEnCurso.has(key)) return;
    fetchEnCurso.add(key);

    fetch(
      "/api/seguimientos/nodo?flujo_id=" +
        encodeURIComponent(flujoId) +
        "&nodo_id=" +
        encodeURIComponent(nodo.id)
    )
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        const items = data.items || [];
        sincronizarEstadosDesdeItems(nodo, items);
        if (nodo === nodoActivo) renderEstadosLivePanel(items);
      })
      .catch(function () {
        /* silencioso en poll */
      })
      .finally(function () {
        fetchEnCurso.delete(key);
      });
  }

  function sincronizarTodosLosNodos() {
    const flujoId =
      window.MACBOT_BUILDER && window.MACBOT_BUILDER.flujoEditandoId;
    if (!flujoId) return;

    document.querySelectorAll(".follow-node").forEach(function (nodo) {
      refrescarEstadosNodo(nodo);
    });
  }

  function onSeguimientoEstadoSocket(data) {
    if (!data) return;

    const flujoId =
      window.MACBOT_BUILDER && window.MACBOT_BUILDER.flujoEditandoId;

    if (
      data.motivo === "respuesta_cliente" ||
      (data.estado === "respondido" && !data.nodo_id)
    ) {
      sincronizarTodosLosNodos();
      return;
    }

    if (flujoId && data.flujo_id && data.flujo_id !== flujoId) return;

    if (data.nodo_id && data.paso_index != null && data.estado) {
      const nodo = document.getElementById(data.nodo_id);
      if (nodo && esNodoSeguimiento(nodo)) {
        aplicarEstadoEnNodo(nodo, data.paso_index, data.estado);
        if (nodo === nodoActivo) cargarEstadosLive(nodo);
      }
      return;
    }

    if (data.nodo_id) {
      const nodo = document.getElementById(data.nodo_id);
      if (nodo) refrescarEstadosNodo(nodo);
    }
  }

  function initLiveSync() {
    if (liveInited) return;
    if (!document.getElementById("builderArea")) return;
    liveInited = true;

    sincronizarTodosLosNodos();

    if (!pollTimer) {
      pollTimer = setInterval(sincronizarTodosLosNodos, 6000);
    }

    if (typeof io !== "function" || socketRef) return;

    const usuarioId =
      window.MACBOT_BUILDER && window.MACBOT_BUILDER.usuarioId;
    socketRef = io();
    if (usuarioId) socketRef.emit("join-user", usuarioId);
    socketRef.on("seguimiento-estado", onSeguimientoEstadoSocket);
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
    if (!paso || typeof paso !== "object") return null;

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

  function leerTextareaJson(box) {
    const raw = (box.value || box.textContent || box.innerHTML || "[]").trim();
    if (!raw) return [];
    return JSON.parse(raw);
  }

  function leerConfigDeNodo(nodo) {
    const box = nodo && nodo.querySelector(".seguimiento-data");
    if (!box) return crearConfigVacia();

    try {
      return normalizarConfig(leerTextareaJson(box));
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
        "</span>" +
        '<span class="follow-step-delay">' +
        esc(formatearDelayIncremental(p.delay)) +
        "</span>" +
        '<span class="follow-step-acum">' +
        esc(textoAcumuladoTimeline(timeline, index)) +
        "</span>" +
        '<span class="follow-step-tipo">' +
        iconoTipo(p.mensaje.tipo) +
        " " +
        esc(p.mensaje.tipo) +
        "</span></div>" +
        '<span class="' +
        claseBadgeEstado(p.estado) +
        '">' +
        esc(ESTADOS_LABEL[p.estado] || "pendiente") +
        "</span></div>";
    });

    html +=
      '</div><div class="follow-timer-bar"><div class="follow-timer-fill" style="width:100%"></div></div>';

    body.innerHTML = html;
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

  function asegurarPaso(paso) {
    if (!paso.delay) paso.delay = { valor: 15, unidad: "minutos" };
    if (!paso.mensaje) paso.mensaje = { tipo: "texto", texto: "", url: "", caption: "" };
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
      document.querySelector(".seg-tipo-tab.active")?.dataset.tipo || "texto";
    paso.mensaje.texto = document.getElementById("segTexto")?.value.trim() || "";
    paso.mensaje.caption = document.getElementById("segCaption")?.value.trim() || "";

    const urlPreview = document.getElementById("segUrlPreview");
    if (urlPreview && urlPreview.dataset.url) {
      paso.mensaje.url = urlPreview.dataset.url;
    }
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

    const captionField =
      paso.mensaje.tipo === "imagen" || paso.mensaje.tipo === "pdf"
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
      captionField;

    document.getElementById("segArchivo")?.addEventListener("change", subirArchivo);
    document.getElementById("segCaption")?.addEventListener("input", onFormChange);
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

    const tabsTipo = TIPOS.map(function (t) {
      return (
        '<button type="button" class="seg-tipo-tab' +
        (paso.mensaje.tipo === t ? " active" : "") +
        '" data-tipo="' +
        t +
        '">' +
        iconoTipo(t) +
        " " +
        t +
        "</button>"
      );
    }).join("");

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
      '<div class="seg-field"><label>Tipo de mensaje</label><div class="seg-tipo-tabs">' +
      tabsTipo +
      '</div></div></div><div id="segCamposMensaje"></div>';

    renderCamposMensaje(paso);

    document.getElementById("segDelayValor")?.addEventListener("input", onFormChange);
    document.getElementById("segDelayUnidad")?.addEventListener("change", onFormChange);

    wrap.querySelectorAll(".seg-tipo-tab").forEach(function (btn) {
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

  function getAccept(tipo) {
    if (tipo === "imagen") return "image/*";
    if (tipo === "audio") return "audio/*";
    if (tipo === "pdf") return "application/pdf,.pdf";
    return "*/*";
  }

  function subirArchivo(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

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

  function onFormChange() {
    syncPasoDesdeFormulario();
    renderListaPasos();
    if (nodoActivo) renderPreviewNodo(nodoActivo, configActiva);

    const timerLabel = document.getElementById("segTimerLabel");
    if (timerLabel) {
      const timeline = calcularTimeline(configActiva.pasos);
      const item = timeline[pasoActivoIndex];
      timerLabel.textContent = item ? "~" + formatearDuracionTotal(item.acumulado) : "—";
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
          "</strong><small>" +
          esc(formatearDelayIncremental(paso.delay)) +
          " · " +
          esc(textoAcumuladoTimeline(timeline, index)) +
          '</small><span class="seg-estado-pill ' +
          esc(paso.estado || "pendiente") +
          '">' +
          esc(ESTADOS_LABEL[paso.estado] || "pendiente") +
          "</span></div>" +
          '<div class="seg-step-body"><span class="seg-panel-desc">' +
          iconoTipo(paso.mensaje.tipo) +
          " · " +
          esc(paso.mensaje.tipo) +
          '</span><button type="button" class="seg-btn seg-btn-danger" data-action="delete">Eliminar paso</button></div></div>'
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

  function cargarEstadosLive(nodo) {
    const box = document.getElementById("segEstadosLive");
    if (!box) return;

    const flujoId =
      window.MACBOT_BUILDER && window.MACBOT_BUILDER.flujoEditandoId;

    if (!flujoId) {
      box.innerHTML =
        '<p class="seg-panel-desc">Guarda el flujo para ver ejecuciones en vivo.</p>';
      return;
    }

    fetch(
      "/api/seguimientos/nodo?flujo_id=" +
        encodeURIComponent(flujoId) +
        "&nodo_id=" +
        encodeURIComponent(nodo.id)
    )
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        const items = data.items || [];
        sincronizarEstadosDesdeItems(nodo, items);
        renderEstadosLivePanel(items);
      })
      .catch(function () {
        box.innerHTML = '<p class="seg-panel-desc">No se pudieron cargar estados.</p>';
      });
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
      "<h4>⏱ Seguimiento CRM</h4>" +
      '<p class="seg-panel-desc">Automatiza recordatorios si el lead no responde.</p>' +
      '<div class="seg-toggle-row">' +
      '<label class="seg-toggle"><input type="checkbox" id="segSoloNoRespondio"' +
      (configActiva.soloSiNoRespondio ? " checked" : "") +
      "> Solo si el lead <strong>no respondió</strong></label>" +
      '<label class="seg-toggle"><input type="checkbox" id="segDetenerSiResponde"' +
      (configActiva.detenerSiResponde ? " checked" : "") +
      "> Detener si <strong>respondió</strong></label>" +
      "</div>" +
      '<div class="seg-visual-timer" id="segTimerBox"><strong>Temporizador del paso</strong> ' +
      '<span id="segTimerLabel">—</span></div>' +
      '<div id="segListaPasos" class="seg-steps-list"></div>' +
      '<div class="seg-actions"><button type="button" class="seg-btn seg-btn-ghost" id="segAddPaso">+ Agregar paso</button></div>' +
      '<div id="segFormPaso"></div>' +
      "<h4>Estados en vivo</h4>" +
      '<div id="segEstadosLive" class="seg-estados-live"></div>' +
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
    cargarEstadosLive(nodo);
    initLiveSync();
    onFormChange();
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
    return (
      nodo &&
      (nodo.dataset.tipo === "seguimiento" || nodo.classList.contains("follow-node"))
    );
  }

  function initNodoRecienCreado(nodo) {
    guardarConfigEnNodo(nodo, crearConfigVacia());
  }

  function refrescarNodoCargado(nodo) {
    try {
      guardarConfigEnNodo(nodo, leerConfigDeNodo(nodo));
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
    initLiveSync: initLiveSync,
    sincronizarTodosLosNodos: sincronizarTodosLosNodos,
    abrirEditorSeguimiento: function (id) {
      const n = document.getElementById(id);
      if (n) renderPanel(n);
    },
  };
})();

if (document.getElementById("builderArea")) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (window.MacBotSeguimiento) window.MacBotSeguimiento.initLiveSync();
    });
  } else if (window.MacBotSeguimiento) {
    window.MacBotSeguimiento.initLiveSync();
  }
}
