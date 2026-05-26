/**
 * MacBot — Nodo 🧾 Lector Pago (solo builder UI + node.data)
 */
(function () {
  const DEFAULT_DATA = {
    monto_esperado: 29,
    moneda_esperada: "BS",
    nombre_esperado: "",
    tolerancia: 0.5,
    mensaje_pedir_foto: "",
    mensaje_pago_valido: "",
    mensaje_pago_invalido: "",
  };

  function decodeHtmlEntities(str) {
    return String(str || "")
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .trim();
  }

  function normalizarData(raw) {
    const base = { ...DEFAULT_DATA };
    if (!raw || typeof raw !== "object") return base;

    return {
      monto_esperado: parseFloat(raw.monto_esperado ?? raw.montoEsperado) || 0,
      moneda_esperada: String(
        raw.moneda_esperada ?? raw.monedaEsperada ?? base.moneda_esperada
      ).trim(),
      nombre_esperado: String(
        raw.nombre_esperado ?? raw.nombreEsperado ?? ""
      ).trim(),
      tolerancia:
        parseFloat(raw.tolerancia) >= 0
          ? parseFloat(raw.tolerancia)
          : base.tolerancia,
      mensaje_pedir_foto: String(
        raw.mensaje_pedir_foto ?? raw.mensajePedirFoto ?? ""
      ).trim(),
      mensaje_pago_valido: String(
        raw.mensaje_pago_valido ?? raw.mensajePagoValido ?? ""
      ).trim(),
      mensaje_pago_invalido: String(
        raw.mensaje_pago_invalido ?? raw.mensajePagoInvalido ?? ""
      ).trim(),
    };
  }

  function leerDataDesdeNodo(nodo) {
    if (!nodo) return { ...DEFAULT_DATA };

    try {
      const raw = nodo.querySelector(".lector-pago-data")?.value;
      if (raw) return normalizarData(JSON.parse(decodeHtmlEntities(raw)));
    } catch (e) {
      console.warn("[LECTOR_PAGO] JSON inválido en nodo:", e.message);
    }

    return normalizarData({
      monto_esperado: nodo.querySelector(".lector-pago-monto")?.value,
      moneda_esperada: nodo.querySelector(".lector-pago-moneda")?.value,
      nombre_esperado: nodo.querySelector(".lector-pago-nombre")?.value,
      tolerancia: nodo.querySelector(".lector-pago-tolerancia")?.value,
    });
  }

  function syncDataToNodo(nodo, dataOpt) {
    if (!nodo) return null;

    const data = normalizarData(dataOpt || leerDataDesdeNodo(nodo));
    const ta = nodo.querySelector(".lector-pago-data");
    if (ta) ta.value = JSON.stringify(data);

    const monto = nodo.querySelector(".lector-pago-monto");
    const moneda = nodo.querySelector(".lector-pago-moneda");
    const nombre = nodo.querySelector(".lector-pago-nombre");
    const tolerancia = nodo.querySelector(".lector-pago-tolerancia");

    if (monto) monto.value = data.monto_esperado;
    if (moneda) moneda.value = data.moneda_esperada;
    if (nombre) nombre.value = data.nombre_esperado;
    if (tolerancia) tolerancia.value = data.tolerancia;

    const hint = nodo.querySelector(".lector-pago-hint");
    if (hint) {
      const nombreTxt = data.nombre_esperado
        ? ` · ${data.nombre_esperado}`
        : "";
      hint.textContent = `Esperado: ${data.monto_esperado} ${data.moneda_esperada}${nombreTxt}`;
    }

    return data;
  }

  function applyDataToNodo(nodo, data) {
    return syncDataToNodo(nodo, data);
  }

  function esNodoLectorPago(nodo) {
    if (!nodo) return false;
    return (
      nodo.dataset.tipo === "lector_pago" ||
      nodo.classList.contains("lector-pago-node") ||
      nodo.classList.contains("node-lector-pago")
    );
  }

  function buildNodoHtml(nodoId, data) {
    const cfg = normalizarData(data);
    const json = JSON.stringify(cfg).replace(/</g, "\\u003c");

    return `
      <div class="node-actions">
        <button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo('${nodoId}')">✎</button>
        <button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo('${nodoId}')">×</button>
      </div>
      <h3 class="node-title">🧾 Lector Pago</h3>
      <p class="node-desc lector-pago-hint">Esperado: ${cfg.monto_esperado} ${cfg.moneda_esperada}</p>
      <input type="number" class="lector-pago-monto" min="0" step="0.01" value="${cfg.monto_esperado}" placeholder="Monto esperado">
      <input type="text" class="lector-pago-moneda" value="${cfg.moneda_esperada}" placeholder="Moneda (BS, USD…)">
      <input type="text" class="lector-pago-nombre" value="${cfg.nombre_esperado}" placeholder="Nombre esperado (opcional)">
      <input type="number" class="lector-pago-tolerancia" min="0" step="0.01" value="${cfg.tolerancia}" placeholder="Tolerancia">
      <textarea class="lector-pago-data" style="display:none;">${json}</textarea>
    `;
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
    nodo.className = "node lector-pago-node node-lector-pago";
    nodo.id = "nodo_" + nodoCount;
    nodo.dataset.tipo = "lector_pago";

    nodo.style.left = 280 + nodoCount * 40 + "px";
    nodo.style.top = 260 + nodoCount * 30 + "px";

    const body = buildNodoHtml(nodo.id, DEFAULT_DATA);
    nodo.innerHTML =
      `<div class="port in" data-nodo="${nodo.id}" onmousedown="iniciarConexion(event, '${nodo.id}', 'in')"></div>` +
      body +
      `<div class="port out" data-nodo="${nodo.id}" onmousedown="iniciarConexion(event, '${nodo.id}', 'out')"></div>`;

    canvas.appendChild(nodo);

    if (typeof hacerMovible === "function") {
      hacerMovible(nodo);
    }

    syncDataToNodo(nodo);
    return nodo;
  }

  function refrescarNodoCargado(nodo) {
    syncDataToNodo(nodo);
  }

  function getDataFromNodo(nodo) {
    return syncDataToNodo(nodo);
  }

  function getPersistPayload(nodo) {
    const data = getDataFromNodo(nodo);
    return {
      type: "lector_pago",
      tipo: "lector_pago",
      data,
    };
  }

  let panelNodoActivo = null;

  function clearPanelActivo() {
    panelNodoActivo = null;
  }

  function flushPanelToNode() {
    if (!panelNodoActivo) return;
    guardarPanelLectorPago(false);
  }

  function escaparHTML(texto) {
    return String(texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderPanel(nodo) {
    panelNodoActivo = nodo;

    const panel = document.getElementById("panelNodo");
    const contenido = document.getElementById("panelNodoContenido");
    if (!panel || !contenido) return;

    const data = leerDataDesdeNodo(nodo);

    panel.classList.add("activo");
    panel.setAttribute("aria-hidden", "false");

    if (typeof marcarNodoSeleccionado === "function") {
      marcarNodoSeleccionado(nodo);
    }

    contenido.innerHTML = `
      <div class="panel-campo">
        <label>Monto esperado</label>
        <input id="panelLectorMonto" type="number" min="0" step="0.01" value="${data.monto_esperado}">
      </div>
      <div class="panel-campo">
        <label>Moneda esperada</label>
        <input id="panelLectorMoneda" type="text" value="${escaparHTML(data.moneda_esperada)}" placeholder="BS, USD, MXN…">
      </div>
      <div class="panel-campo">
        <label>Nombre esperado</label>
        <input id="panelLectorNombre" type="text" value="${escaparHTML(data.nombre_esperado)}" placeholder="Opcional · contains flexible">
      </div>
      <div class="panel-campo">
        <label>Tolerancia</label>
        <input id="panelLectorTolerancia" type="number" min="0" step="0.01" value="${data.tolerancia}">
      </div>
      <div class="panel-campo">
        <label>Mensaje pedir foto</label>
        <textarea id="panelLectorMsgPedir" rows="3" placeholder="Ej: Envíame la captura de tu comprobante">${escaparHTML(data.mensaje_pedir_foto)}</textarea>
      </div>
      <div class="panel-campo">
        <label>Mensaje pago válido</label>
        <textarea id="panelLectorMsgValido" rows="3" placeholder="Ej: Pago valido. Gracias.">${escaparHTML(data.mensaje_pago_valido)}</textarea>
      </div>
      <div class="panel-campo">
        <label>Mensaje pago inválido</label>
        <textarea id="panelLectorMsgInvalido" rows="3" placeholder="Ej: Pago invalido. Revisa el comprobante.">${escaparHTML(data.mensaje_pago_invalido)}</textarea>
      </div>
      <p class="panel-hint">Valida comprobante por monto, moneda y nombre. No entrega producto en esta fase.</p>
      <button type="button" class="panel-btn" onclick="window.MacBotLectorPago.guardarPanelLectorPago()">Guardar Lector Pago</button>
    `;

    [
      "panelLectorMonto",
      "panelLectorMoneda",
      "panelLectorNombre",
      "panelLectorTolerancia",
      "panelLectorMsgPedir",
      "panelLectorMsgValido",
      "panelLectorMsgInvalido",
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", function () {
        if (typeof macbotRecordHistoryDebounced === "function") {
          macbotRecordHistoryDebounced();
        }
      });
    });
  }

  function guardarPanelLectorPago(registrarHistorial) {
    if (!panelNodoActivo) return;

    if (registrarHistorial !== false && typeof registrarHistorialBuilder === "function") {
      registrarHistorialBuilder();
    }

    const data = normalizarData({
      monto_esperado: document.getElementById("panelLectorMonto")?.value,
      moneda_esperada: document.getElementById("panelLectorMoneda")?.value,
      nombre_esperado: document.getElementById("panelLectorNombre")?.value,
      tolerancia: document.getElementById("panelLectorTolerancia")?.value,
      mensaje_pedir_foto: document.getElementById("panelLectorMsgPedir")?.value,
      mensaje_pago_valido: document.getElementById("panelLectorMsgValido")?.value,
      mensaje_pago_invalido: document.getElementById("panelLectorMsgInvalido")?.value,
    });

    syncDataToNodo(panelNodoActivo, data);
  }

  window.MacBotLectorPago = {
    DEFAULT_DATA,
    esNodoLectorPago,
    crearNodoEnCanvas,
    refrescarNodoCargado,
    applyDataToNodo,
    syncDataToNodo,
    getDataFromNodo,
    getPersistPayload,
    renderPanel,
    guardarPanelLectorPago,
    flushPanelToNode,
    clearPanelActivo,
    leerDataDesdeNodo,
  };
})();
