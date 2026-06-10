let nodoCount = 0;
let ultimoNodo = null;
let conexiones = [];
let nodoArrastrando = null;
let lineaTemporal = null;
let puertoOrigenConexion = null;
let puertoHandleOrigen = null;
let canvasPanningActive = false;

const MACBOT_BUILDER = window.MACBOT_BUILDER || {};
const SEGUIMIENTO_LEGACY_ENABLED = MACBOT_BUILDER.seguimientoLegacyEnabled !== false;
const SEGUIMIENTO_LEGACY_OBSOLETO_MSG = "Este nodo está obsoleto. Utiliza Seguimiento CRM V2.";

let flujoEditandoId = MACBOT_BUILDER.flujoEditandoId || "";
let flujoCargado = MACBOT_BUILDER.flujoCargado || null;

function leerConexionWhatsappIdBuilder() {
  const raw = new URLSearchParams(window.location.search).get("conexion_whatsapp_id");
  if (raw == null || String(raw).trim() === "") return null;
  return String(raw).trim();
}

window.leerConexionWhatsappIdBuilder = leerConexionWhatsappIdBuilder;

const activadoresData = MACBOT_BUILDER.activadoresData || [];
const etiquetasData = MACBOT_BUILDER.etiquetasData || [];
const CONEXION_TODAS = "__todas__";

function sameConexionId(a, b) {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function etiquetasParaBuilderLinea() {
  const connId = leerConexionWhatsappIdBuilder();
  if (!connId || connId === CONEXION_TODAS) return etiquetasData;
  return etiquetasData.filter((e) =>
    sameConexionId(e.conexion_whatsapp_id, connId)
  );
}

function opcionesHtmlSelectEtiquetas(selectedValue) {
  const selected =
    selectedValue != null ? String(selectedValue).trim() : "";
  const scoped = etiquetasParaBuilderLinea();
  let html = '<option value="">Selecciona una etiqueta</option>';
  scoped.forEach((e) => {
    const nombre = String(e.nombre || "").trim();
    if (!nombre) return;
    const sel = selected && selected === nombre ? " selected" : "";
    html += `<option value="${nombre.replace(/"/g, "&quot;")}"${sel}>${nombre.replace(/</g, "&lt;")}</option>`;
  });
  return html;
}

function refrescarSelectsEtiquetaNodos() {
  document.querySelectorAll(".node-etiqueta select.node-select").forEach((select) => {
    const selected = String(select.value || "").trim();
    select.innerHTML = opcionesHtmlSelectEtiquetas("");
    if (
      selected &&
      Array.from(select.options).some((opt) => opt.value === selected)
    ) {
      select.value = selected;
    } else {
      select.value = "";
    }
  });
}

const CONVERSION_MONEDAS = [
  { v: "USD", l: "Dólar estadounidense" },
  { v: "MXN", l: "Peso mexicano" },
  { v: "ARS", l: "Peso argentino" },
  { v: "BOB", l: "Boliviano" },
  { v: "CLP", l: "Peso chileno" },
  { v: "COP", l: "Peso colombiano" },
  { v: "CRC", l: "Colón costarricense" },
  { v: "CUP", l: "Peso cubano" },
  { v: "DOP", l: "Peso dominicano" },
  { v: "GTQ", l: "Quetzal" },
  { v: "HNL", l: "Lempira" },
  { v: "NIO", l: "Córdoba" },
  { v: "PAB", l: "Balboa" },
  { v: "PYG", l: "Guaraní" },
  { v: "PEN", l: "Sol peruano" },
  { v: "UYU", l: "Peso uruguayo" },
  { v: "VES", l: "Bolívar venezolano" },
  { v: "EUR", l: "Euro" },
  { v: "BRL", l: "Real brasileño" },
];

const CONVERSION_TIPOS = [
  { v: "venta", l: "Venta" },
  { v: "upsell", l: "Upsell" },
  { v: "downsell", l: "Downsell" },
  { v: "recuperacion", l: "Recuperación" },
];

function normalizarConversionTipo(val) {
  const v = String(val || "venta").toLowerCase().trim();
  return CONVERSION_TIPOS.some((t) => t.v === v) ? v : "venta";
}

function conversionTipoLabel(val) {
  const v = normalizarConversionTipo(val);
  const found = CONVERSION_TIPOS.find((t) => t.v === v);
  return found ? found.l : "Venta";
}

function opcionesSelectConversionTipo(tipoActual) {
  const actual = normalizarConversionTipo(tipoActual);
  return CONVERSION_TIPOS.map(({ v, l }) => {
    const selected = actual === v ? " selected" : "";
    return `<option value="${v}"${selected}>${l}</option>`;
  }).join("");
}

function normalizarMonedaISO(raw){
  if(raw == null || raw === "") return "";

  const s = String(raw).trim();
  const isoMatch = s.match(/^([A-Za-z]{3})\b/);
  if(isoMatch) return isoMatch[1].toUpperCase();

  const parte = s.split(/\s*-\s*/)[0].trim();
  if(/^[A-Za-z]{3}$/i.test(parte)) return parte.toUpperCase();

  return parte.slice(0, 3).toUpperCase();
}

function opcionesSelectConversionMoneda(monedaActual, monedaPorDefecto) {
  const actual =
    monedaActual != null && monedaActual !== ""
      ? normalizarMonedaISO(monedaActual)
      : "";
  const def = normalizarMonedaISO(monedaPorDefecto) || "USD";
  const known = new Set(CONVERSION_MONEDAS.map((m) => m.v));
  let html = "";
  if (actual && !known.has(actual)) {
    html += `<option value="${actual}" selected>${actual}</option>`;
  }
  CONVERSION_MONEDAS.forEach(({ v, l }) => {
    const selected = actual ? actual === v : v === def;
    html += `<option value="${v}"${selected ? " selected" : ""}>${v} - ${l}</option>`;
  });
  return html;
}

const CANVAS_ZOOM_MIN = 0.25;
const CANVAS_ZOOM_MAX = 2;
const CANVAS_ZOOM_STEP = 0.1;
const WORLD_GRID_SIZE = 28;
const WORLD_SURFACE_PADDING = 6000;
const WORLD_MIN_SURFACE = 24000;

const viewportState = {
  panX: 0,
  panY: 0,
  zoom: 1,
};

const BUILDER_HISTORY_MAX = 50;
const builderHistorial = {
  undoStack: [],
  redoStack: [],
  restaurando: false,
  debounceTimer: null,
};

/* =========================
   INICIO
========================= */

window.addEventListener("load", function(){
  if(!document.getElementById("builderArea")){
    return;
  }

  ensureInfiniteViewport();
  console.log("🎨 Flow lines premium loaded");
  cargarFlujoGuardado();
  crearNodoInicioAutomatico();
  resizeWorldSurface();
  initCanvasViewport();

  const btnGuardarFlujo = document.getElementById("btnGuardarFlujo");

  if(btnGuardarFlujo){
    btnGuardarFlujo.addEventListener("click", guardarFlujo);
  }

  initBuilderHistory();

  document.getElementById("modalActivador")?.classList.remove("activo");

  cerrarPanelNodo();
});

/* =========================
   MENÚS
========================= */

function toggleMenuFlujo(id){
  const menu = document.getElementById("menu_" + id);

  if(!menu){
    alert("No encontré el menú de este flujo");
    return;
  }

  document.querySelectorAll(".menu-flujo").forEach(m => {
    if(m !== menu){
      m.style.display = "none";
    }
  });

  menu.style.display = menu.style.display === "block" ? "none" : "block";
}

function editarNombreFlujo(id, nombreActual){
  const nuevoNombre = prompt("Nuevo nombre del flujo:", nombreActual);

  if(!nuevoNombre || nuevoNombre.trim() === ""){
    return;
  }

  fetch("/editar-nombre-flujo/" + id, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      nombre: nuevoNombre.trim()
    })
  })
  .then(res => res.text())
  .then(msg => {
    alert(msg);
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage({ type: "macbot:flujo_guardado", id }, "*");
      } catch (_) { /* noop */ }
    }
  });
}

function toggleMenuActivador(id){
  document.querySelectorAll(".menu-flujo").forEach(menu => {
    if(menu.id !== "menu_act_" + id){
      menu.style.display = "none";
    }
  });

  const menu = document.getElementById("menu_act_" + id);

  if(!menu){
    alert("No encontré el menú del activador");
    return;
  }

  menu.style.display = menu.style.display === "block" ? "none" : "block";
}

/* =========================
   NODO INICIO
========================= */

function crearNodoInicioAutomatico(){
  const canvas = document.getElementById("canvasFlujo");
  if(!canvas) return;

  const yaExiste = document.getElementById("nodo_inicio");
  if(yaExiste) return;

  const nodo = document.createElement("div");

  nodo.className = "node node-start";
  nodo.id = "nodo_inicio";
  nodo.dataset.tipo = "inicio";

  nodo.style.left = "120px";
  nodo.style.top = "280px";

  nodo.innerHTML = `
    <h3 class="node-title node-title-start">▶ Inicio del Flujo</h3>
    <p class="node-desc node-desc-start">Aquí comienza tu flujo de conversación.</p>
    <div class="port out" data-nodo="nodo_inicio" onmousedown="iniciarConexion(event, 'nodo_inicio', 'out')"></div>
  `;

  canvas.appendChild(nodo);
  hacerMovible(nodo);
}

/* =========================
   CARGAR FLUJO GUARDADO
========================= */

function cargarFlujoGuardado(){
  if(!flujoCargado) return;

  const canvas = document.getElementById("canvasFlujo");
  if(!canvas) return;

  canvas.innerHTML = "";

  conexiones = [];
  ultimoNodo = null;

  const mapaNodos = {};

  if(flujoCargado.nodos){
    flujoCargado.nodos.forEach(item => {
      const nodo = document.createElement("div");

      nodo.id = item.id;
      nodo.className = item.className || "node";
      nodo.innerHTML = item.html || "";
      nodo.style.left = item.left || "80px";
      nodo.style.top = item.top || "80px";

      if(item.id === "nodo_inicio"){
        nodo.classList.add("node-start");
        nodo.dataset.tipo = "inicio";
      } else if(item.tipo){
        nodo.dataset.tipo = item.tipo;
      }

      canvas.appendChild(nodo);
      hacerMovible(nodo);

      mapaNodos[item.id] = nodo;

      const numero = parseInt(String(item.id).replace("nodo_", ""));

      if(!isNaN(numero) && numero > nodoCount){
        nodoCount = numero;
      }

      ultimoNodo = nodo;
    });
  }

  document.querySelectorAll(".remarketing-global-node").forEach((nodo) => {
    try {
      if(window.MacBotRemarketingGlobal){
        window.MacBotRemarketingGlobal.refrescarNodoCargado(nodo);
      }
    } catch (e) {
      console.warn("RM24H: error al refrescar nodo cargado", e);
    }
  });

  document.querySelectorAll(".follow-node").forEach((nodo) => {
    try {
      if(window.MacBotSeguimiento){
        window.MacBotSeguimiento.refrescarNodoCargado(nodo);
      }
    } catch (e) {
      console.warn("Seguimiento: error al refrescar nodo cargado", e);
    }
  });

  document.querySelectorAll(".seguimiento-v2-node, .follow-node-v2").forEach((nodo) => {
    try {
      if(window.MacBotSeguimientoV2){
        window.MacBotSeguimientoV2.refrescarNodoCargado(nodo);
      }
    } catch (e) {
      console.warn("Seguimiento V2: error al refrescar nodo cargado", e);
    }
  });

  document.querySelectorAll(".node").forEach((nodo) => {
    try {
      if(window.MacBotContenido && window.MacBotContenido.esNodoContenido(nodo)){
        window.MacBotContenido.refrescarNodoCargado(nodo);
      }
    } catch (e) {
      console.warn("Contenido: error al refrescar nodo cargado", e);
    }
  });

  document.querySelectorAll(".openai-agent-node").forEach((nodo) => {
    try {
      if(window.MacBotOpenAIAgent){
        window.MacBotOpenAIAgent.refrescarNodoCargado(nodo);
      }
    } catch (e) {
      console.warn("OpenAI Agent: error al refrescar nodo cargado", e);
    }
  });

  document.querySelectorAll(".ia-pro-node").forEach((nodo) => {
    try {
      if(window.MacBotIAPro){
        window.MacBotIAPro.refrescarNodoCargado(nodo);
      }
    } catch (e) {
      console.warn("IA Pro: error al refrescar nodo cargado", e);
    }
  });

  document.querySelectorAll(".ia-node").forEach((nodo) => {
    try {
      if(window.MacBotIA){
        window.MacBotIA.refrescarNodoCargado(nodo);
      }
    } catch (e) {
      console.warn("IA: error al refrescar nodo cargado", e);
    }
  });

  if(flujoCargado.nodos && window.MacBotLectorPago){
    flujoCargado.nodos.forEach((item) => {
      if(item.tipo !== "lector_pago" && item.type !== "lector_pago") return;
      const nodo = mapaNodos[item.id];
      if(!nodo) return;
      if(item.data){
        window.MacBotLectorPago.applyDataToNodo(nodo, item.data);
      }
      window.MacBotLectorPago.refrescarNodoCargado(nodo);
    });
  }

  if(flujoCargado.nodos && window.MacBotSeguimientoV2){
    flujoCargado.nodos.forEach((item) => {
      if(item.tipo !== "seguimiento_crm_v2" && item.type !== "seguimiento_crm_v2") return;
      const nodo = mapaNodos[item.id];
      if(!nodo) return;
      if(item.data && item.data.pasos){
        window.MacBotSeguimientoV2.guardarConfigEnNodo(nodo, {
          version: 1,
          pasos: item.data.pasos,
          cancelarSiResponde: item.data.cancelarSiResponde !== false,
        });
      }
      window.MacBotSeguimientoV2.refrescarNodoCargado(nodo);
    });
  }

  document.querySelectorAll(".lector-pago-node").forEach((nodo) => {
    try {
      if(window.MacBotLectorPago){
        window.MacBotLectorPago.refrescarNodoCargado(nodo);
      }
    } catch (e) {
      console.warn("Lector Pago: error al refrescar nodo cargado", e);
    }
  });

  document.querySelectorAll(".conversion-node, .node-conversion, [data-tipo='conversion']").forEach((nodo) => {
    try {
      initConversionNodeUI(nodo);
    } catch (e) {
      console.warn("Conversión: error al refrescar nodo cargado", e);
    }
  });

  if(flujoCargado.conexiones){
    flujoCargado.conexiones.forEach(c => {
      const desdeId = c.desde || c.from || c.source || c.source_node_id;
      const hastaId = c.hasta || c.to || c.target || c.target_node_id;

      if(mapaNodos[desdeId] && mapaNodos[hastaId]){
        const handle = c.sourceHandle || c.desdeHandle || c.handle || null;
        conectarNodos(mapaNodos[desdeId], mapaNodos[hastaId], handle);
      }
    });
  }

  actualizarHandlersPuertosCanvas();
  actualizarLineas();
  resizeWorldSurface();
  refrescarSelectsEtiquetaNodos();
}

/* =========================
   CREAR NODOS
========================= */

function agregarNodoSeguimientoV2(){
  agregarNodo("seguimiento_crm_v2");
}

function agregarNodo(tipo){
  const canvas = document.getElementById("canvasFlujo");

  if(!canvas){
    alert("No existe canvasFlujo");
    return;
  }

  if(tipo === "seguimiento" && !SEGUIMIENTO_LEGACY_ENABLED){
    showBuilderFlowToast(
      "El nodo Seguimiento CRM (Legacy) está deshabilitado. Utiliza Seguimiento CRM V2.",
      "warn"
    );
    return;
  }

  if(tipo === "remarketing_global" && window.MacBotRemarketingGlobal && window.MacBotRemarketingGlobal.crearNodoEnCanvas){
    registrarHistorialBuilder();
    window.MacBotRemarketingGlobal.crearNodoEnCanvas();
    return;
  }

  if(tipo === "openai_agent" && window.MacBotOpenAIAgent && window.MacBotOpenAIAgent.crearNodoEnCanvas){
    registrarHistorialBuilder();
    window.MacBotOpenAIAgent.crearNodoEnCanvas();
    return;
  }

  if(tipo === "ia_pro" && window.MacBotIAPro && window.MacBotIAPro.crearNodoEnCanvas){
    registrarHistorialBuilder();
    window.MacBotIAPro.crearNodoEnCanvas();
    return;
  }

  if(tipo === "ia" && window.MacBotIA && window.MacBotIA.crearNodoEnCanvas){
    registrarHistorialBuilder();
    window.MacBotIA.crearNodoEnCanvas();
    return;
  }

  if(tipo === "lector_pago" && window.MacBotLectorPago && window.MacBotLectorPago.crearNodoEnCanvas){
    registrarHistorialBuilder();
    window.MacBotLectorPago.crearNodoEnCanvas();
    return;
  }

  if(tipo === "seguimiento_crm_v2" && window.MacBotSeguimientoV2 && window.MacBotSeguimientoV2.crearNodoEnCanvas){
    registrarHistorialBuilder();
    window.MacBotSeguimientoV2.crearNodoEnCanvas();
    return;
  }

  registrarHistorialBuilder();

  nodoCount++;

  const nodo = document.createElement("div");

  nodo.className = "node";
  nodo.id = "nodo_" + nodoCount;
  nodo.dataset.tipo = tipo;

  nodo.style.left = (280 + nodoCount * 40) + "px";
  nodo.style.top = (260 + nodoCount * 30) + "px";

  let contenido = "";

  if(tipo === "seguimiento"){
    nodo.classList.add("follow-node", "node-seguimiento", "node-seguimiento--legacy");

    contenido = `
      <div class="follow-header">
        <span>⏱️ Seguimiento CRM (Legacy)</span>
      </div>

      <button class="edit-node" onclick="event.stopPropagation(); abrirEditorSeguimiento('${nodo.id}')">✎</button>
      <button class="delete-node" onclick="event.stopPropagation(); borrarNodo('${nodo.id}')">×</button>

      <div class="follow-body">
        <p class="follow-empty">Configura en el panel →</p>
      </div>

      <textarea class="seguimiento-data" style="display:none;">{"version":2,"soloSiNoRespondio":true,"detenerSiResponde":true,"pasos":[]}</textarea>
    `;
  }

  if(tipo === "espera"){
    nodo.classList.add("node-espera");

    contenido = `
      <div class="node-actions">
        <button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo('${nodo.id}')">✎</button>
        <button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo('${nodo.id}')">×</button>
      </div>
      <h3 class="node-title">⏳ Espera</h3>
      <input type="number" max="60" placeholder="Máximo 60 segundos">
    `;
  }

  if(tipo === "conversion"){
    nodo.classList.add("conversion-node", "node-conversion", "conversion-node--circular");

    contenido = `
      <div class="node-actions">
        <button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo('${nodo.id}')">✎</button>
        <button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo('${nodo.id}')">×</button>
      </div>
      <div class="conversion-node-shell">
        <div class="conversion-core-column">
          <div class="conversion-circle">
            <span class="conversion-badge-event">EVENTO</span>
            <div class="conversion-icon" aria-hidden="true">💰</div>
            <h3 class="conversion-title">Conversión</h3>
            <p class="conversion-venta conversion-hint">Registra venta real</p>
            <p class="conversion-footnote">Registra venta real</p>
          </div>
        </div>
      </div>
      <div class="conversion-node-fields conversion-node-fields--hidden">
        <input type="number" class="conversion-valor" min="0" step="0.01" value="0" placeholder="Valor" tabindex="-1" aria-hidden="true">
        <select class="conversion-moneda node-select" tabindex="-1" aria-hidden="true">
          ${opcionesSelectConversionMoneda(null, "USD")}
        </select>
        <select class="conversion-tipo node-select" tabindex="-1" aria-hidden="true">
          ${opcionesSelectConversionTipo("venta")}
        </select>
        <select class="conversion-origen node-select" tabindex="-1" aria-hidden="true">
          <option value="flujo" selected>Flujo (automático)</option>
          <option value="manual">Manual</option>
          <option value="hotmart">Hotmart</option>
          <option value="stripe">Stripe</option>
          <option value="mercadopago">MercadoPago</option>
          <option value="qr">QR</option>
          <option value="webhook">Webhook</option>
        </select>
      </div>
      <textarea class="conversion-data" style="display:none;">{"valor":0,"moneda":"USD","tipo":"venta","origen":"flujo"}</textarea>
    `;
  }

  if(tipo === "etiqueta"){
    nodo.classList.add("node-etiqueta");

    contenido = `
      <div class="node-actions">
        <button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo('${nodo.id}')">✎</button>
        <button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo('${nodo.id}')">×</button>
      </div>
      <h3 class="node-title">🏷️ Etiqueta</h3>
      <select class="node-select" style="width:100%;background:#0f1117;border:2px solid #333;padding:15px;border-radius:14px;color:white;margin:10px 0;font-size:16px;">
        ${opcionesHtmlSelectEtiquetas("")}
      </select>
    `;
  }

  if(tipo === "conectar"){
    contenido = `
      <button class="delete-node" onclick="borrarNodo('${nodo.id}')">×</button>
      <h3>🔗 Conectar flujo</h3>
      <input placeholder="Nombre del flujo">
    `;
  }

  if(tipo === "ia"){
    nodo.classList.add("ia-node", "node-ia");
    const cfgIa = JSON.stringify({
      nombreNodo: "🤖 IA",
      modo: "detectar_intencion",
      promptSistema: "",
      instruccionesNegocio: "",
      maxCaracteres: 400,
      temperatura: 0.3,
      modelo: "gpt-4o-mini",
      variableResultado: "",
      siFalla: "continuar",
      mensajeFallback: "Gracias por escribirnos. En breve un asesor te atiende.",
    });
    contenido = `
      <div class="node-actions">
        <button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo('${nodo.id}')">✎</button>
        <button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo('${nodo.id}')">×</button>
      </div>
      <div class="ia-header"><h3 class="ia-title">🤖 IA</h3></div>
      <div class="ia-body"><span class="ia-badge-modo">Detectar intención</span></div>
      <textarea class="ia-data" style="display:none;">${cfgIa}</textarea>
    `;
  }

  nodo.innerHTML = `
    <div class="port in" data-nodo="${nodo.id}" onmousedown="iniciarConexion(event, '${nodo.id}', 'in')"></div>
    ${contenido}
    ${tipo === "ia" ? "" : `<div class="port out" data-nodo="${nodo.id}" onmousedown="iniciarConexion(event, '${nodo.id}', 'out')"></div>`}
  `;

  canvas.appendChild(nodo);

  if(tipo === "seguimiento" && window.MacBotSeguimiento){
    window.MacBotSeguimiento.initNodoRecienCreado(nodo);
    showBuilderFlowToast(SEGUIMIENTO_LEGACY_OBSOLETO_MSG, "warn");
  }

  if(tipo === "ia" && window.MacBotIA){
    window.MacBotIA.initNodoRecienCreado(nodo);
  }

  if(tipo === "conversion"){
    initConversionNodeUI(nodo);
  }

  hacerMovible(nodo);
}

/* =========================
   MOVER NODOS
========================= */

function getNodeCanvasPosition(nodo){
  const left = parseFloat(nodo.style.left);
  const top = parseFloat(nodo.style.top);

  return {
    x: Number.isFinite(left) ? left : nodo.offsetLeft,
    y: Number.isFinite(top) ? top : nodo.offsetTop,
  };
}

function hacerMovible(nodo){
  let moviendo = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let historialDragRegistrado = false;

  nodo.addEventListener("mousedown", function(e){
    if(
      e.target.tagName === "TEXTAREA" ||
      e.target.tagName === "INPUT" ||
      e.target.tagName === "BUTTON" ||
      e.target.tagName === "SELECT" ||
      e.target.classList.contains("port")
    ){
      return;
    }

    if(!historialDragRegistrado){
      registrarHistorialBuilder();
      historialDragRegistrado = true;
    }

    const canvasPos = screenToCanvas(e);
    const nodePos = getNodeCanvasPosition(nodo);

    dragOffsetX = canvasPos.x - nodePos.x;
    dragOffsetY = canvasPos.y - nodePos.y;
    moviendo = true;
    e.stopPropagation();
    e.preventDefault();
    marcarNodoSeleccionado(nodo);
  });

  document.addEventListener("mousemove", function(e){
    if(!moviendo) return;

    const canvasPos = screenToCanvas(e);
    const nodeX = canvasPos.x - dragOffsetX;
    const nodeY = canvasPos.y - dragOffsetY;

    console.log("[DRAG DEBUG] clientX/clientY", e.clientX, e.clientY);
    console.log("[DRAG DEBUG] canvasX/canvasY", canvasPos.x, canvasPos.y);
    console.log("[DRAG DEBUG] panX/panY", viewportState.panX, viewportState.panY);
    console.log("[DRAG DEBUG] zoom", getCanvasZoom());
    console.log("[DRAG DEBUG] node x/y", nodeX, nodeY);

    nodo.style.left = nodeX + "px";
    nodo.style.top = nodeY + "px";

    actualizarLineas();
    actualizarPanelPosicion(nodo);
    resizeWorldSurface();
  });

  document.addEventListener("mouseup", function(){
    if(moviendo){
      historialDragRegistrado = false;
    }
    moviendo = false;
  });
}

/* =========================
   CONEXIONES
========================= */

function actualizarHandlersPuertosCanvas(){
  document.querySelectorAll("#canvasFlujo .port.in").forEach((puerto) => {
    const id = puerto.dataset.nodo;
    if(!id) return;
    puerto.setAttribute(
      "onmousedown",
      "iniciarConexion(event, '" + id + "', 'in')"
    );
  });

  document.querySelectorAll("#canvasFlujo .port.out").forEach((puerto) => {
    const id = puerto.dataset.nodo;
    if(!id) return;
    puerto.setAttribute(
      "onmousedown",
      "iniciarConexion(event, '" + id + "', 'out')"
    );
  });
}

function obtenerPuertoSalida(nodo, handle){
  if(!nodo) return null;
  if(handle){
    const especifico = nodo.querySelector('.port.out[data-handle="' + handle + '"]');
    if(especifico) return especifico;
  }
  return nodo.querySelector(".port.out") || nodo.querySelector(".port");
}

const FLOW_ROUTE_PAD = 40;
const FLOW_ROUTE_EXIT = 32;
const FLOW_ROUTE_ENTRY = 32;
const FLOW_ROUTE_CORNER = 20;
const FLOW_LANE_SPACING = 22;
const FLOW_ROUTE_SAFE_GAP = 80;
let conexionSeleccionadaLinea = null;

function getConnectionStableId(desdeId, hastaId, sourceHandle){
  return (
    String(desdeId || "") +
    "->" +
    String(hastaId || "") +
    "@" +
    String(sourceHandle || "")
  );
}

function ensureConnectionStableId(c){
  if(!c) return "";
  if(!c.stableId){
    c.stableId = getConnectionStableId(
      c.desde?.id,
      c.hasta?.id,
      c.sourceHandle
    );
  }
  return c.stableId;
}

function ensureFlowEdgesLayer(canvas){
  if(!canvas) return null;

  let layer = canvas.querySelector("#flowConnectionsLayer");
  if(!layer){
    layer = document.createElement("div");
    layer.id = "flowConnectionsLayer";
    layer.className = "flow-connections-layer";
    if(canvas.firstChild){
      canvas.insertBefore(layer, canvas.firstChild);
    } else {
      canvas.appendChild(layer);
    }
  }
  return layer;
}

function migrateEdgesToLayer(canvas){
  const layer = ensureFlowEdgesLayer(canvas);
  if(!layer) return;

  canvas.querySelectorAll(":scope > .flow-connection-svg.linea").forEach(function (svg) {
    if(svg.parentElement !== layer){
      layer.appendChild(svg);
    }
  });

  const temp = canvas.querySelector("#tempConnectionSvg");
  if(temp && temp.parentElement !== layer){
    layer.appendChild(temp);
  }
}

function getLaneOffsetForIndex(index, total){
  if(!total || total <= 1) return 0;
  const center = (total - 1) / 2;
  return (index - center) * FLOW_LANE_SPACING;
}

/** Carriles estables: orden por ID de conexión, no por posición Y (evita saltos al mover nodos). */
function assignConnectionLaneMeta(list){
  const bySource = new Map();

  list.forEach(function (c) {
    ensureConnectionStableId(c);
    const sourceKey = (c.desde?.id || "") + "|" + (c.sourceHandle || "");
    if(!bySource.has(sourceKey)) bySource.set(sourceKey, []);
    bySource.get(sourceKey).push(c);
  });

  bySource.forEach(function (group) {
    group.sort(function (a, b) {
      return String(a.stableId).localeCompare(String(b.stableId));
    });
    const total = group.length;
    group.forEach(function (c, index) {
      c._laneOffset = getLaneOffsetForIndex(index, total);
      c._laneIndex = index;
      c._laneTotal = total;
      c._laneMidOffset = getLaneOffsetForIndex(index, total) * 0.6;
      c._laneTargetOffset = 0;
    });
  });
}

function esNodoIaOrigen(node){
  if(!node) return false;
  return (
    node.classList.contains("ia-node") ||
    node.classList.contains("ia-pro-node") ||
    node.classList.contains("openai-agent-node") ||
    node.classList.contains("node-ia") ||
    node.dataset.tipo === "ia" ||
    node.dataset.tipo === "ia_pro" ||
    node.dataset.tipo === "openai_agent"
  );
}

function esNodoConversionDestino(node){
  if(!node) return false;
  return (
    node.classList.contains("conversion-node") ||
    node.classList.contains("node-conversion") ||
    node.dataset.tipo === "conversion"
  );
}

function getRouteTypeFromConnection(connection){
  if(!connection?.sourceHandle || !connection?.desde) return null;
  const ports = connection.desde.querySelectorAll(".port.out[data-handle]");
  let port = null;
  ports.forEach(function(p){
    if(String(p.dataset.handle || "") === String(connection.sourceHandle || "")){
      port = p;
    }
  });
  return port?.dataset?.routeType || null;
}

function getConnectionVisualType(sourceNode, targetNode, connection){
  if(connection?.isError || connection?.linea?.classList?.contains("linea-error")){
    return "error";
  }
  if(esNodoConversionDestino(targetNode)) return "conversion";
  if(getRouteTypeFromConnection(connection) === "payment_reader") return "payment-reader";
  if(esNodoIaOrigen(sourceNode)) return "ia";
  return "default";
}

function aplicarEstiloConexion(svg, visualType){
  if(!svg) return;

  svg.classList.remove(
    "flow-conn--default",
    "flow-conn--ia",
    "flow-conn--payment-reader",
    "flow-conn--conversion",
    "flow-conn--error",
    "flow-edge--default",
    "flow-edge--ia",
    "flow-edge--payment-reader",
    "flow-edge--conversion",
    "flow-edge--error"
  );

  const tipo = visualType || "default";
  svg.classList.add("flow-conn--" + tipo, "flow-edge--" + tipo);
}

function limpiarSeleccionConexion(){
  if(conexionSeleccionadaLinea){
    conexionSeleccionadaLinea.classList.remove(
      "flow-connection--selected",
      "flow-edge-selected",
      "flow-edge--selected"
    );
    conexionSeleccionadaLinea = null;
  }
  document
    .querySelectorAll("#builderArea .borrar-linea--visible, #builderArea .flow-edge-delete-visible")
    .forEach(function (btn) {
      btn.classList.remove("borrar-linea--visible", "flow-edge-delete-visible");
    });
}

function wireConnectionHover(c){
  const svg = c.linea;
  const borrar = c.borrar;
  const hitbox = svg?._connHitbox;

  if(!svg || !borrar || !hitbox || svg._connWired) return;

  svg._connWired = true;

  function mostrar(){
    borrar.classList.add("borrar-linea--visible", "flow-edge-delete-visible");
    svg.classList.add("flow-connection--hover", "flow-edge--hover");
  }

  function ocultar(){
    if(
      svg.classList.contains("flow-connection--selected") ||
      svg.classList.contains("flow-edge-selected")
    ){
      return;
    }
    if(borrar.matches(":hover")) return;
    borrar.classList.remove("borrar-linea--visible", "flow-edge-delete-visible");
    svg.classList.remove("flow-connection--hover", "flow-edge--hover");
  }

  hitbox.addEventListener("mouseenter", mostrar);
  hitbox.addEventListener("mouseleave", function () {
    setTimeout(ocultar, 100);
  });
  borrar.addEventListener("mouseenter", mostrar);
  borrar.addEventListener("mouseleave", ocultar);

  hitbox.addEventListener("click", function (e) {
    e.stopPropagation();

    if(conexionSeleccionadaLinea && conexionSeleccionadaLinea !== svg){
      conexionSeleccionadaLinea.classList.remove(
        "flow-connection--selected",
        "flow-edge-selected",
        "flow-edge--selected"
      );
      const prev = conexiones.find(function (x) {
        return x.linea === conexionSeleccionadaLinea;
      });
      prev?.borrar?.classList.remove("borrar-linea--visible");
    }

    conexionSeleccionadaLinea = svg;
    svg.classList.add("flow-connection--selected", "flow-edge-selected", "flow-edge--selected");
    borrar.classList.add("borrar-linea--visible", "flow-edge-delete-visible");
  });
}

function getFlowNodeObstacles(canvas, excludeIds){
  const skip = excludeIds || new Set();
  const boxes = [];

  if(!canvas) return boxes;

  canvas.querySelectorAll(".node").forEach(function (node) {
    if(skip.has(node.id)) return;

    const left = parseFloat(node.style.left) || 0;
    const top = parseFloat(node.style.top) || 0;

    boxes.push({
      id: node.id,
      x: left - FLOW_ROUTE_PAD,
      y: top - FLOW_ROUTE_PAD,
      width: node.offsetWidth + FLOW_ROUTE_PAD * 2,
      height: node.offsetHeight + FLOW_ROUTE_PAD * 2,
    });
  });

  return boxes;
}

function pointInRouteBox(px, py, box){
  return (
    px >= box.x &&
    px <= box.x + box.width &&
    py >= box.y &&
    py <= box.y + box.height
  );
}

function segmentIntersectsBox(x1, y1, x2, y2, box){
  const left = box.x;
  const right = box.x + box.width;
  const top = box.y;
  const bottom = box.y + box.height;

  if(pointInRouteBox(x1, y1, box) || pointInRouteBox(x2, y2, box)){
    return true;
  }

  if(Math.abs(y1 - y2) < 0.5){
    const y = y1;
    if(y < top || y > bottom) return false;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    return maxX >= left && minX <= right;
  }

  if(Math.abs(x1 - x2) < 0.5){
    const x = x1;
    if(x < left || x > right) return false;
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return maxY >= top && minY <= bottom;
  }

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  return maxX >= left && minX <= right && maxY >= top && minY <= bottom;
}

function segmentHitsObstacles(x1, y1, x2, y2, obstacles){
  for(let i = 0; i < obstacles.length; i++){
    if(segmentIntersectsBox(x1, y1, x2, y2, obstacles[i])){
      return true;
    }
  }
  return false;
}

function pathHitsObstacles(points, obstacles){
  return countPathCollisions(points, obstacles) > 0;
}

function countPathCollisions(points, obstacles){
  let hits = 0;
  for(let i = 0; i < points.length - 1; i++){
    const a = points[i];
    const b = points[i + 1];
    for(let j = 0; j < obstacles.length; j++){
      if(segmentIntersectsBox(a.x, a.y, b.x, b.y, obstacles[j])){
        hits++;
      }
    }
  }
  return hits;
}

function getFlowNodeObstaclesFromNodes(nodes, connection){
  const exclude = new Set(
    [connection?.desde?.id, connection?.hasta?.id].filter(function (id) {
      return !!id;
    })
  );
  const boxes = [];

  (nodes || []).forEach(function (node) {
    if(!node || exclude.has(node.id)) return;

    const left = parseFloat(node.style?.left) || node.offsetLeft || 0;
    const top = parseFloat(node.style?.top) || node.offsetTop || 0;

    boxes.push({
      id: node.id,
      x: left - FLOW_ROUTE_PAD,
      y: top - FLOW_ROUTE_PAD,
      width: node.offsetWidth + FLOW_ROUTE_PAD * 2,
      height: node.offsetHeight + FLOW_ROUTE_PAD * 2,
    });
  });

  return boxes;
}

/** Path ortogonal con esquinas suaves (cúbicas) — estilo Make/n8n */
function buildProfessionalSmoothPath(points, cornerR){
  if(!points || points.length < 2){
    return "";
  }

  if(points.length === 2){
    const p0 = points[0];
    const p1 = points[1];
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    return (
      "M " +
      p0.x +
      " " +
      p0.y +
      " C " +
      mx +
      " " +
      p0.y +
      ", " +
      mx +
      " " +
      p1.y +
      ", " +
      p1.x +
      " " +
      p1.y
    );
  }

  let d = "M " + points[0].x + " " + points[0].y;

  for(let i = 1; i < points.length - 1; i++){
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];

    const v1x = p1.x - p0.x;
    const v1y = p1.y - p0.y;
    const v2x = p2.x - p1.x;
    const v2y = p2.y - p1.y;
    const len1 = Math.hypot(v1x, v1y) || 1;
    const len2 = Math.hypot(v2x, v2y) || 1;
    const r = Math.min(cornerR, len1 * 0.48, len2 * 0.48);

    const t1x = p1.x - (v1x / len1) * r;
    const t1y = p1.y - (v1y / len1) * r;
    const t2x = p1.x + (v2x / len2) * r;
    const t2y = p1.y + (v2y / len2) * r;

    d += " L " + t1x + " " + t1y;
    d +=
      " C " +
      (p1.x + (v1x / len1) * r * 0.15) +
      " " +
      (p1.y + (v1y / len1) * r * 0.15) +
      ", " +
      (p1.x + (v2x / len2) * r * 0.15) +
      " " +
      (p1.y + (v2y / len2) * r * 0.15) +
      ", " +
      t2x +
      " " +
      t2y;
  }

  const last = points[points.length - 1];
  d += " L " + last.x + " " + last.y;

  return d;
}

function buildRoutePointsFromPorts(x1, y1, x2, y2, midX, exitY, entryY, laneY, kind){
  const exitStub = x1 + (x2 >= x1 ? FLOW_ROUTE_EXIT : -FLOW_ROUTE_EXIT);

  if(kind === "detour" || kind === "bus"){
    const detourX = midX;
    return [
      { x: x1, y: y1 },
      { x: exitStub, y: y1 },
      { x: detourX, y: exitY },
      { x: detourX, y: laneY },
      { x: x2 - (x2 >= detourX ? FLOW_ROUTE_ENTRY : -FLOW_ROUTE_ENTRY), y: laneY },
      { x: x2, y: y2 },
    ];
  }

  return [
    { x: x1, y: y1 },
    { x: exitStub, y: y1 },
    { x: midX, y: exitY },
    { x: midX, y: entryY },
    { x: x2, y: y2 },
  ];
}

function pathFromRouteChoice(x1, y1, x2, y2, chosen, exitY, entryY){
  const pts =
    chosen.kind === "detour"
      ? buildRoutePointsFromPorts(x1, y1, x2, y2, chosen.detourX, exitY, entryY, chosen.laneY, "detour")
      : chosen.kind === "bus"
        ? buildRoutePointsFromPorts(x1, y1, x2, y2, chosen.midX, exitY, entryY, chosen.laneY, "bus")
        : buildRoutePointsFromPorts(x1, y1, x2, y2, chosen.midX, exitY, entryY, null, "hvh");

  return {
    d: buildProfessionalSmoothPath(pts, FLOW_ROUTE_CORNER),
    labelPoint: chosen.labelPoint,
    points: pts,
  };
}

function buildSmoothBezierPath(x1, y1, x2, y2){
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const curve = Math.min(140, Math.max(48, dist * 0.38));

  let c1x;
  let c1y;
  let c2x;
  let c2y;

  if(Math.abs(dx) >= Math.abs(dy)){
    c1x = x1 + (dx >= 0 ? curve : -curve);
    c1y = y1;
    c2x = x2 - (dx >= 0 ? curve : -curve);
    c2y = y2;
  } else {
    c1x = x1;
    c1y = y1 + (dy >= 0 ? curve : -curve);
    c2x = x2;
    c2y = y2 - (dy >= 0 ? curve : -curve);
  }

  return (
    "M " +
    x1 +
    " " +
    y1 +
    " C " +
    c1x +
    " " +
    c1y +
    ", " +
    c2x +
    " " +
    c2y +
    ", " +
    x2 +
    " " +
    y2
  );
}

function buildHVHRoundedPath(x1, y1, midX, y2, x2, cornerR){
  const yA = y1;
  const yB = y2;
  const r = Math.min(
    cornerR,
    Math.abs(midX - x1) / 2,
    Math.abs(midX - x2) / 2,
    Math.abs(yB - yA) / 2 || cornerR
  );

  if(Math.abs(yB - yA) < 2){
    return "M " + x1 + " " + yA + " L " + x2 + " " + yB;
  }

  const hDir1 = midX >= x1 ? 1 : -1;
  const hDir2 = x2 >= midX ? 1 : -1;
  const vDir = yB >= yA ? 1 : -1;

  let d = "M " + x1 + " " + yA;

  if(Math.abs(midX - x1) > 0.5){
    d += " L " + (midX - hDir1 * r) + " " + yA;
    d += " Q " + midX + " " + yA + ", " + midX + " " + (yA + vDir * r);
  } else {
    d += " L " + midX + " " + yA;
  }

  d += " L " + midX + " " + (yB - vDir * r);

  if(Math.abs(x2 - midX) > 0.5){
    d += " Q " + midX + " " + yB + ", " + (midX + hDir2 * r) + " " + yB;
    d += " L " + x2 + " " + yB;
  } else {
    d += " L " + midX + " " + yB;
  }

  return d;
}

function buildPolylineRoundedCorners(points, cornerR){
  if(!points || points.length < 2){
    return "";
  }

  if(points.length === 2){
    return (
      "M " +
      points[0].x +
      " " +
      points[0].y +
      " L " +
      points[1].x +
      " " +
      points[1].y
    );
  }

  let d = "M " + points[0].x + " " + points[0].y;

  for(let i = 1; i < points.length - 1; i++){
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];

    const v1x = p1.x - p0.x;
    const v1y = p1.y - p0.y;
    const v2x = p2.x - p1.x;
    const v2y = p2.y - p1.y;
    const len1 = Math.hypot(v1x, v1y) || 1;
    const len2 = Math.hypot(v2x, v2y) || 1;
    const r = Math.min(cornerR, len1 / 2, len2 / 2);

    const ax = p1.x - (v1x / len1) * r;
    const ay = p1.y - (v1y / len1) * r;
    const bx = p1.x + (v2x / len2) * r;
    const by = p1.y + (v2y / len2) * r;

    d += " L " + ax + " " + ay;
    d += " Q " + p1.x + " " + p1.y + ", " + bx + " " + by;
  }

  const last = points[points.length - 1];
  d += " L " + last.x + " " + last.y;

  return d;
}

function buildDetourRoundedPath(x1, y1, detourX, laneY, x2, y2, cornerR){
  return buildPolylineRoundedCorners(
    [
      { x: x1, y: y1 },
      { x: detourX, y: y1 },
      { x: detourX, y: laneY },
      { x: x2, y: laneY },
      { x: x2, y: y2 },
    ],
    cornerR
  );
}

function getStableConnectionPath(x1, y1, x2, y2, opts){
  opts = opts || {};
  const laneOffset = opts.laneOffset || 0;
  const laneMidOffset = opts.laneMidOffset || 0;
  const dx = x2 - x1;
  const dist = Math.hypot(dx, y2 - y1) || 1;

  if(dist < 96){
    const midX = (x1 + x2) / 2 + laneMidOffset * 0.25;
    const busY = (y1 + y2) / 2 + laneOffset;
    return {
      d: buildProfessionalSmoothPath(
        [
          { x: x1, y: y1 },
          { x: midX, y: busY },
          { x: x2, y: y2 },
        ],
        FLOW_ROUTE_CORNER
      ),
      labelPoint: { x: midX, y: busY },
    };
  }

  const direction = x2 >= x1 ? 1 : -1;
  let midX;

  if(direction === 1){
    midX =
      x1 + Math.max(FLOW_ROUTE_SAFE_GAP, Math.abs(x2 - x1) * 0.5) + laneMidOffset;
  } else {
    midX = Math.max(x1, x2) + FLOW_ROUTE_SAFE_GAP + laneMidOffset;
  }

  const busY = (y1 + y2) / 2 + laneOffset;

  const pts = [
    { x: x1, y: y1 },
    { x: midX, y: y1 },
    { x: midX, y: busY },
    { x: x2, y: busY },
    { x: x2, y: y2 },
  ];

  return {
    d: buildProfessionalSmoothPath(pts, FLOW_ROUTE_CORNER),
    labelPoint: { x: midX, y: busY },
  };
}

function getSmartConnectionPath(x1, y1, x2, y2, opts){
  return getStableConnectionPath(x1, y1, x2, y2, opts);
}

/** Ruta profesional: puertos correctos, carriles, obstáculos, curvas suaves */
function getProfessionalConnectionPath(connection){
  if(!connection?.desde || !connection?.hasta){
    return { d: "", labelPoint: { x: 0, y: 0 } };
  }

  const puertoDesde = obtenerPuertoSalida(connection.desde, connection.sourceHandle);
  const puertoHasta =
    connection.hasta.querySelector(".port.in") ||
    connection.hasta.querySelector(".port");

  if(!puertoDesde || !puertoHasta){
    return { d: "", labelPoint: { x: 0, y: 0 } };
  }

  const inicio = getPortCanvasPoint(puertoDesde);
  const fin = getPortCanvasPoint(puertoHasta);

  return getStableConnectionPath(inicio.x, inicio.y, fin.x, fin.y, {
    sourceId: connection.desde.id,
    targetId: connection.hasta.id,
    laneOffset: connection._laneOffset || 0,
    laneMidOffset: connection._laneMidOffset || 0,
  });
}

function getSmartConnectionPathFromNodes(sourceNode, targetNode, connectionIndex, totalConnections, x1, y1, x2, y2, opts){
  opts = opts || {};
  const mockConnection = {
    desde: sourceNode,
    hasta: targetNode,
    _laneOffset:
      opts.laneOffset !== undefined
        ? opts.laneOffset
        : getLaneOffsetForIndex(connectionIndex || 0, totalConnections || 1),
    _laneTargetOffset: opts.laneTargetOffset || 0,
    _laneMidOffset:
      opts.laneMidOffset !== undefined
        ? opts.laneMidOffset
        : getLaneOffsetForIndex(connectionIndex || 0, totalConnections || 1) * 1.15,
  };

  const route = getProfessionalConnectionPath(mockConnection, null);
  if(route.d) return route;

  return getSmartConnectionPath(x1, y1, x2, y2, {
    obstacles: opts.obstacles,
    sourceId: sourceNode?.id || opts.sourceId,
    targetId: targetNode?.id || opts.targetId,
    laneOffset: mockConnection._laneOffset,
    laneTargetOffset: mockConnection._laneTargetOffset,
    laneMidOffset: mockConnection._laneMidOffset,
  });
}

function syncEdgePathLayers(svg, d){
  if(!svg || !d) return;

  const layers = [
    svg._connBase,
    svg._connMicro,
    svg._connDash,
    svg._connPath,
    svg._connGlow,
    svg._connHitbox,
  ];

  layers.forEach(function (el) {
    if(el) el.setAttribute("d", d);
  });

  if(svg._connMotion){
    svg._connMotion.setAttribute("path", d);
  }
  if(svg._connMotionGlow){
    svg._connMotionGlow.setAttribute("path", d);
  }
}

function aplicarPathConexion(svg, route){
  if(!svg || !route) return;

  const d = route.d || route;
  syncEdgePathLayers(svg, d);
  svg._routeLabelPoint = route.labelPoint || null;
}

function appendEdgePulse(svg, NS, options){
  options = options || {};
  const pulseGlow = document.createElementNS(NS, "circle");
  pulseGlow.setAttribute("class", "flow-edge-pulse-glow");
  pulseGlow.setAttribute("r", options.glowR || "5");

  const pulse = document.createElementNS(NS, "circle");
  pulse.setAttribute("class", "flow-edge-pulse flow-connection-packet");
  pulse.setAttribute("r", options.coreR || "2.5");

  const motion = document.createElementNS(NS, "animateMotion");
  motion.setAttribute("dur", options.dur || "2.2s");
  motion.setAttribute("repeatCount", "indefinite");
  motion.setAttribute("path", "");
  motion.setAttribute("rotate", "auto");
  pulse.appendChild(motion);

  const motionGlow = document.createElementNS(NS, "animateMotion");
  motionGlow.setAttribute("dur", options.dur || "2.2s");
  motionGlow.setAttribute("repeatCount", "indefinite");
  motionGlow.setAttribute("path", "");
  motionGlow.setAttribute("rotate", "auto");
  pulseGlow.appendChild(motionGlow);

  svg.appendChild(pulseGlow);
  svg.appendChild(pulse);

  return { pulseGlow: pulseGlow, pulse: pulse, motion: motion, motionGlow: motionGlow };
}

function crearLineaTemporalSvg(canvas){
  const NS = "http://www.w3.org/2000/svg";
  const layer = ensureFlowEdgesLayer(canvas) || canvas;
  const svg = document.createElementNS(NS, "svg");
  svg.id = "tempConnectionSvg";
  svg.setAttribute("class", "temp-connection-svg flow-temp-edge");
  svg.setAttribute("aria-hidden", "true");

  const glow = document.createElementNS(NS, "path");
  glow.setAttribute("class", "flow-temp-edge-glow");
  glow.setAttribute("fill", "none");

  const path = document.createElementNS(NS, "path");
  path.id = "tempConnectionPath";
  path.setAttribute("class", "flow-temp-edge-path");
  path.setAttribute("fill", "none");

  svg.appendChild(glow);
  svg.appendChild(path);
  layer.appendChild(svg);

  return { svg: svg, glow: glow, path: path, motion: null };
}

function crearConexionSvg(canvas){
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute(
    "class",
    "flow-connection-svg flow-edge linea"
  );
  svg.setAttribute("aria-hidden", "true");

  const base = document.createElementNS(NS, "path");
  base.setAttribute("class", "flow-edge-base");
  base.setAttribute("fill", "none");

  const micro = document.createElementNS(NS, "path");
  micro.setAttribute("class", "flow-edge-halo flow-connection-glow flow-edge-glow");
  micro.setAttribute("fill", "none");

  const dash = document.createElementNS(NS, "path");
  dash.setAttribute("class", "flow-edge-dash flow-connection-path flow-edge");
  dash.setAttribute("fill", "none");

  const hitbox = document.createElementNS(NS, "path");
  hitbox.setAttribute("class", "flow-connection-hitbox flow-edge-hitbox");
  hitbox.setAttribute("fill", "none");

  svg.appendChild(base);
  svg.appendChild(micro);
  svg.appendChild(dash);
  const pulseParts = appendEdgePulse(svg, NS, { dur: "2.2s" });
  svg.appendChild(hitbox);

  svg._connBase = base;
  svg._connMicro = micro;
  svg._connDash = dash;
  svg._connPath = dash;
  svg._connGlow = micro;
  svg._connHitbox = hitbox;
  svg._connPulse = pulseParts.pulse;
  svg._connPulseGlow = pulseParts.pulseGlow;
  svg._connMotion = pulseParts.motion;
  svg._connMotionGlow = pulseParts.motionGlow;

  const layer = ensureFlowEdgesLayer(canvas) || canvas;
  layer.appendChild(svg);

  return svg;
}

function actualizarLineaTemporalCurva(pathEl, glowEl, motionEl, x1, y1, x2, y2){
  const d = buildSmoothBezierPath(x1, y1, x2, y2);
  if(pathEl) pathEl.setAttribute("d", d);
  if(glowEl) glowEl.setAttribute("d", d);
  if(motionEl) motionEl.setAttribute("path", d);
}

function removerLineaTemporal(){
  if(lineaTemporal){
    lineaTemporal.remove();
    lineaTemporal = null;
  }
}

function iniciarConexion(e, id, portSide){
  e.stopPropagation();

  nodoArrastrando = document.getElementById(id);
  puertoOrigenConexion = portSide === "in" ? "in" : "out";
  const portEl = e.target?.closest?.(".port");
  puertoHandleOrigen = portEl?.dataset?.handle || null;

  const canvas = document.getElementById("canvasFlujo");
  if(!canvas || !nodoArrastrando) return;

  removerLineaTemporal();
  const tempSvg = crearLineaTemporalSvg(canvas);
  lineaTemporal = tempSvg.svg;
  lineaTemporal._tempPath = tempSvg.path;
  lineaTemporal._tempGlow = tempSvg.glow;
  lineaTemporal._tempMotion = tempSvg.motion;

  document.addEventListener("mousemove", moverConexionTemporal);
  document.addEventListener("mouseup", soltarConexion);
}

function moverConexionTemporal(e){
  if(!nodoArrastrando || !lineaTemporal?._tempPath) return;

  const puerto =
    puertoOrigenConexion === "in"
      ? nodoArrastrando.querySelector(".port.in")
      : obtenerPuertoSalida(nodoArrastrando, puertoHandleOrigen);
  if(!puerto) return;

  const inicio = getPortCanvasPoint(puerto);
  const fin = screenToCanvas(e);

  actualizarLineaTemporalCurva(
    lineaTemporal._tempPath,
    lineaTemporal._tempGlow,
    lineaTemporal._tempMotion,
    inicio.x,
    inicio.y,
    fin.x,
    fin.y
  );
}

function soltarConexion(e){
  document.removeEventListener("mousemove", moverConexionTemporal);
  document.removeEventListener("mouseup", soltarConexion);

  const destino = e.target.closest(".port");

  if(destino && nodoArrastrando){
    const nodoDestino = document.getElementById(destino.dataset.nodo);
    const portDestino = destino.classList.contains("in") ? "in" : "out";

    if(nodoDestino && nodoDestino.id !== nodoArrastrando.id){
      let nodoDesde = null;
      let nodoHasta = null;

      if(puertoOrigenConexion === "out" && portDestino === "in"){
        nodoDesde = nodoArrastrando;
        nodoHasta = nodoDestino;
      } else if(puertoOrigenConexion === "in" && portDestino === "out"){
        nodoDesde = nodoDestino;
        nodoHasta = nodoArrastrando;
      }

      if(nodoDesde && nodoHasta){
        registrarHistorialBuilder();
        const handleOrigen =
          nodoDesde === nodoArrastrando
            ? puertoHandleOrigen
            : destino.dataset.handle || null;
        conectarNodos(nodoDesde, nodoHasta, handleOrigen);
      }
    }
  }

  removerLineaTemporal();

  nodoArrastrando = null;
  puertoOrigenConexion = null;
  puertoHandleOrigen = null;
}

function conectarNodos(nodo1, nodo2, sourceHandle){
  const canvas = document.getElementById("canvasFlujo");
  if(!canvas || !nodo1 || !nodo2 || !nodo1.id || !nodo2.id) return;
  if(nodo1.id === nodo2.id) return;

  const yaExiste = conexiones.some(function (c) {
    return (
      c.desde?.id === nodo1.id &&
      c.hasta?.id === nodo2.id &&
      (c.sourceHandle || null) === (sourceHandle || null)
    );
  });
  if(yaExiste) return;

  const linea = crearConexionSvg(canvas);

  const borrar = document.createElement("button");
  borrar.innerText = "×";
  borrar.className = "borrar-linea flow-edge-delete";
  borrar.setAttribute("type", "button");
  borrar.setAttribute("aria-label", "Eliminar conexión");

  borrar.onclick = function(e){
    e.stopPropagation();

    registrarHistorialBuilder();

    conexiones = conexiones.filter(c => c.linea !== linea);

    if(conexionSeleccionadaLinea === linea){
      conexionSeleccionadaLinea = null;
    }

    linea.remove();
    borrar.remove();
  };

  canvas.appendChild(borrar);

  const item = {
    desde: nodo1,
    hasta: nodo2,
    linea,
    borrar,
    stableId: getConnectionStableId(nodo1.id, nodo2.id, sourceHandle),
  };
  if(sourceHandle) item.sourceHandle = sourceHandle;
  conexiones.push(item);

  actualizarLineas();
}

function actualizarLineas(){
  const canvas = document.getElementById("canvasFlujo");
  if(!canvas) return;

  conexiones = conexiones.filter(c => {
    if(!c.desde || !c.hasta || !c.linea){
      c.linea?.remove();
      c.borrar?.remove();
      return false;
    }

    if(!document.body.contains(c.desde) || !document.body.contains(c.hasta)){
      c.linea?.remove();
      c.borrar?.remove();
      return false;
    }

    return true;
  });

  ensureFlowEdgesLayer(canvas);
  migrateEdgesToLayer(canvas);
  assignConnectionLaneMeta(conexiones);

  conexiones.forEach(c => {
    const puertoDesde = obtenerPuertoSalida(c.desde, c.sourceHandle);
    const puertoHasta = c.hasta.querySelector(".port.in") || c.hasta.querySelector(".port");

    if(!puertoDesde || !puertoHasta) return;

    const inicio = getPortCanvasPoint(puertoDesde);
    const fin = getPortCanvasPoint(puertoHasta);

    const route = getProfessionalConnectionPath(c);

    posicionarLinea(c.linea, inicio.x, inicio.y, fin.x, fin.y, route);

    aplicarEstiloConexion(
      c.linea,
      getConnectionVisualType(c.desde, c.hasta, c)
    );
    wireConnectionHover(c);

    if(c.borrar){
      const label = route.labelPoint || {
        x: (inicio.x + fin.x) / 2,
        y: (inicio.y + fin.y) / 2,
      };
      c.borrar.style.left = label.x - 12 + "px";
      c.borrar.style.top = label.y - 12 + "px";

      if(conexionSeleccionadaLinea !== c.linea){
        c.borrar.classList.remove("borrar-linea--visible");
      }
    }
  });
}

function eliminarConexionesPorHandle(nodoId, sourceHandle) {
  if(!nodoId || !sourceHandle) return;

  conexiones = conexiones.filter(function (c) {
    const quitar =
      c.desde?.id === nodoId && (c.sourceHandle || null) === sourceHandle;
    if(quitar){
      c.linea?.remove();
      c.borrar?.remove();
    }
    return !quitar;
  });

  actualizarLineas();
}

window.eliminarConexionesPorHandle = eliminarConexionesPorHandle;

/* =========================
   CONTENIDO (MacBotContenido — solo panel lateral)
========================= */

function agregarNodoContenido() {
  if (window.MacBotContenido && window.MacBotContenido.crearNodoEnCanvas) {
    window.MacBotContenido.crearNodoEnCanvas();
    return;
  }
  alert("Editor de contenido no disponible");
}

/* =========================
   SEGUIMIENTO (MacBotSeguimiento)
========================= */

function abrirEditorSeguimiento(id){
  const nodo = document.getElementById(id);
  if(!nodo) return;

  abrirPanelNodo(nodo);
}

function agregarSegmentoSeguimiento(){
  document.getElementById("segAddPaso")?.click();
}

function guardarSeguimiento(){
  document.getElementById("segGuardarPanel")?.click();
}

function cerrarSeguimiento(){
  cerrarPanelNodo();
}

/* =========================
   EDITAR / BORRAR
========================= */

function editarNodo(id){
  const nodo = document.getElementById(id);
  if(!nodo) return;

  console.log("⚙️ ABRIENDO PANEL CONFIG:", id);
  abrirPanelNodo(nodo);
}

function duplicarNodo(id){
  const nodo = document.getElementById(id);
  if(!nodo) return;

  if(
    window.MacBotSeguimientoV2 &&
    window.MacBotSeguimientoV2.esNodoSeguimientoV2(nodo) &&
    window.MacBotSeguimientoV2.duplicarNodo
  ){
    window.MacBotSeguimientoV2.duplicarNodo(nodo);
  }
}

function borrarNodo(id){
  if(id === "nodo_inicio") return;

  const nodo = document.getElementById(id);
  if(!nodo) return;

  const nodoActivoSeg =
    window.MacBotSeguimiento && window.MacBotSeguimiento.getNodoActivo
      ? window.MacBotSeguimiento.getNodoActivo()
      : null;

  const nodoActivoCnt =
    window.MacBotContenido && window.MacBotContenido.getNodoActivo
      ? window.MacBotContenido.getNodoActivo()
      : null;

  const nodoActivoIa =
    window.MacBotIA && window.MacBotIA.getNodoActivo
      ? window.MacBotIA.getNodoActivo()
      : null;

  const nodoActivoSegV2 =
    window.MacBotSeguimientoV2 && window.MacBotSeguimientoV2.getNodoActivo
      ? window.MacBotSeguimientoV2.getNodoActivo()
      : null;

  const eraSeleccionado =
    (nodoSeleccionadoPanel && nodoSeleccionadoPanel.id === id) ||
    (nodoActivoSeg && nodoActivoSeg.id === id) ||
    (nodoActivoSegV2 && nodoActivoSegV2.id === id) ||
    (nodoActivoCnt && nodoActivoCnt.id === id) ||
    (nodoActivoIa && nodoActivoIa.id === id);

  registrarHistorialBuilder();

  conexiones = conexiones.filter(c => {
    if(c.desde.id === id || c.hasta.id === id){
      c.linea?.remove();
      c.borrar?.remove();
      return false;
    }

    return true;
  });

  if(ultimoNodo && ultimoNodo.id === id){
    ultimoNodo = null;
  }

  nodo.remove();

  if(eraSeleccionado){
    if(window.MacBotSeguimiento && window.MacBotSeguimiento.clearPanelActivo){
      window.MacBotSeguimiento.clearPanelActivo();
    }

    if(window.MacBotSeguimientoV2 && window.MacBotSeguimientoV2.clearPanelActivo){
      window.MacBotSeguimientoV2.clearPanelActivo();
    }
    cerrarPanelNodo();
  }
}

/* =========================
   GUARDAR FLUJO
========================= */

const FLOW_SAVE_BTN_LABEL = "💾 Guardar flujo";
const FLOW_SAVE_VISUAL_MIN_MS = 600;
let guardandoFlujo = false;

function showBuilderFlowToast(texto, tipo = "success"){
  let toast = document.getElementById("builderFlowToast");
  if(!toast){
    toast = document.createElement("div");
    toast.id = "builderFlowToast";
    toast.className = "builder-flow-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.className = "builder-flow-toast builder-flow-toast--" + tipo;
  toast.textContent = texto;
  toast.classList.add("builder-flow-toast--show");
  clearTimeout(toast._hideTimer);
  const duracion = tipo === "warn" ? 3800 : 3000;
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("builder-flow-toast--show");
  }, duracion);
}

function setFlowSaveLoading(activo){
  const btn = document.getElementById("btnGuardarFlujo");
  if(!btn) return;

  if(activo){
    btn.disabled = true;
    btn.classList.add("flow-save--saving");
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML =
      '<span class="flow-save-label">Guardando…</span>' +
      '<span class="flow-save-bar" aria-hidden="true"></span>';
    return;
  }

  btn.disabled = false;
  btn.classList.remove("flow-save--saving");
  btn.removeAttribute("aria-busy");
  btn.innerHTML = FLOW_SAVE_BTN_LABEL;
}

async function esperarMinimoVisualGuardado(inicioMs){
  const transcurrido = Date.now() - inicioMs;
  if(transcurrido < FLOW_SAVE_VISUAL_MIN_MS){
    await new Promise(resolve => setTimeout(resolve, FLOW_SAVE_VISUAL_MIN_MS - transcurrido));
  }
}

function normalizarConexionGuardada(c){
  const desde = c.desde || c.from || c.source || c.source_node_id;
  const hasta = c.hasta || c.to || c.target || c.target_node_id;
  if(!desde || !hasta || desde === hasta) return null;
  const sourceHandle = c.sourceHandle || c.desdeHandle || c.handle || null;
  const item = { desde, hasta };
  if(sourceHandle) item.sourceHandle = sourceHandle;
  return item;
}

function obtenerConexionesParaGuardar(){
  actualizarLineas();

  const lista = [];
  const vistos = new Set();

  conexiones.forEach(c => {
    if(!c.desde?.id || !c.hasta?.id) return;

    const key = c.desde.id + "->" + c.hasta.id + "@" + (c.sourceHandle || "");
    if(vistos.has(key)) return;
    vistos.add(key);

    const item = { desde: c.desde.id, hasta: c.hasta.id };
    if(c.sourceHandle) item.sourceHandle = c.sourceHandle;
    lista.push(item);
  });

  return lista;
}

function validarFlujoAntesDeGuardar(nodos, conexionesGuardadas){
  const ids = new Set(nodos.map(n => n.id));
  const avisos = [];

  conexionesGuardadas.forEach((c, i) => {
    if(!c.desde || !c.hasta){
      avisos.push("Conexión " + (i + 1) + " sin origen o destino.");
      return;
    }
    if(!ids.has(c.desde)){
      avisos.push("Conexión huérfana: origen " + c.desde + " no existe en el canvas.");
    }
    if(!ids.has(c.hasta)){
      avisos.push("Conexión huérfana: destino " + c.hasta + " no existe en el canvas.");
    }
  });

  const conectados = new Set();
  conexionesGuardadas.forEach(c => {
    conectados.add(c.desde);
    conectados.add(c.hasta);
  });

  nodos.forEach(n => {
    if(n.id === "nodo_inicio") return;
    if(!conectados.has(n.id)){
      avisos.push("Nodo suelto (sin conexiones): " + n.id);
    }
  });

  return avisos;
}

function macbotUnlockCanvasInteraction(){
  canvasPanningActive = false;
  const wrap = getCanvasViewport();
  if(wrap){
    wrap.classList.remove("panning");
  }
  removerLineaTemporal();
  nodoArrastrando = null;
  puertoOrigenConexion = null;
  puertoHandleOrigen = null;
}

window.macbotUnlockCanvasInteraction = macbotUnlockCanvasInteraction;

async function guardarFlujo(){
  if(guardandoFlujo) return;

  console.log("💾 CLICK GUARDAR FLUJO");
  const titulo = document.getElementById("tituloFlujo");

  if(!titulo){
    showBuilderFlowToast("❌ Error al guardar flujo", "error");
    return;
  }

  macbotUnlockCanvasInteraction();

  try {
    sincronizarPanelAntesDeSnapshot();
  } catch (err) {
    console.error("[BUILDER] Error sincronizando panel antes de guardar:", err.message);
    showBuilderFlowToast("❌ Error al guardar flujo", "error");
    return;
  }

  const nombre = titulo.innerText.replace("🔀", "").trim();

  const nodos = [];

  document.querySelectorAll("#canvasFlujo .node").forEach(nodo => {
    nodo.querySelectorAll("input, textarea, select").forEach(campo => {
      if(campo.classList.contains("ia-data")){
        campo.setAttribute("value", campo.value);
        return;
      }

      campo.setAttribute("value", campo.value);

      if(campo.tagName === "TEXTAREA"){
        campo.innerHTML = campo.value;
      }

      if(campo.tagName === "SELECT"){
        campo.querySelectorAll("option").forEach(op => {
          if(op.value === campo.value){
            op.setAttribute("selected", "selected");
          } else {
            op.removeAttribute("selected");
          }
        });
      }
    });

    const tipoNodo = nodo.dataset.tipo || "";
    const payload = {
      id: nodo.id,
      html: nodo.innerHTML,
      left: nodo.style.left,
      top: nodo.style.top,
      className: nodo.className,
      tipo: tipoNodo,
    };

    if(
      tipoNodo === "lector_pago" &&
      window.MacBotLectorPago &&
      window.MacBotLectorPago.getPersistPayload
    ){
      const extra = window.MacBotLectorPago.getPersistPayload(nodo);
      payload.type = extra.type;
      payload.data = extra.data;
    }

    if(
      tipoNodo === "seguimiento_crm_v2" &&
      window.MacBotSeguimientoV2 &&
      window.MacBotSeguimientoV2.getPersistPayload
    ){
      const extra = window.MacBotSeguimientoV2.getPersistPayload(nodo);
      payload.type = extra.type;
      payload.data = extra.data;
    }

    nodos.push(payload);
  });

  if(nodos.length === 0){
    showBuilderFlowToast("Primero agrega al menos un nodo", "warn");
    return;
  }

  const conexionesGuardadas = obtenerConexionesParaGuardar();
  const avisos = validarFlujoAntesDeGuardar(nodos, conexionesGuardadas);
  const teniaAvisos = avisos.length > 0;

  if(teniaAvisos){
    console.warn(
      "[BUILDER] Avisos del flujo (se guarda automáticamente):",
      avisos
    );
  }

  const data = {
    nodos,
    conexiones: conexionesGuardadas
  };

  console.log("[BUILDER] Guardando flujo:", conexionesGuardadas.length, "conexión(es)", conexionesGuardadas);

  guardandoFlujo = true;
  setFlowSaveLoading(true);
  const inicioVisual = Date.now();

  const conexionWhatsappIdGuardar = leerConexionWhatsappIdBuilder();
  const payloadGuardar = {
    id: flujoEditandoId,
    nombre,
    data,
  };
  if (conexionWhatsappIdGuardar) {
    payloadGuardar.conexion_whatsapp_id = conexionWhatsappIdGuardar;
  }

  let res;
  try {
    res = await fetch("/guardar-flujo-builder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payloadGuardar)
    });
  } catch (err) {
    console.error("[BUILDER] Error guardando flujo:", err.message);
    macbotUnlockCanvasInteraction();
    await esperarMinimoVisualGuardado(inicioVisual);
    setFlowSaveLoading(false);
    guardandoFlujo = false;
    showBuilderFlowToast("❌ Error al guardar flujo", "error");
    return;
  }

  const respuesta = await res.text();
  await esperarMinimoVisualGuardado(inicioVisual);
  setFlowSaveLoading(false);
  guardandoFlujo = false;

  if(respuesta.includes("<!DOCTYPE html>") || respuesta.includes("<html")){
    showBuilderFlowToast("Tu sesión expiró. Inicia sesión otra vez.", "error");
    setTimeout(() => {
      window.location.href = "/login";
    }, 1400);
    return;
  }

  if(!res.ok){
    console.error("[BUILDER] Error HTTP guardando flujo:", res.status, respuesta);
    showBuilderFlowToast("❌ Error al guardar flujo", "error");
    return;
  }

  console.log("✅ FLUJO GUARDADO", respuesta);

  if(teniaAvisos){
    showBuilderFlowToast("Flujo guardado con avisos", "warn");
    return;
  }

  showBuilderFlowToast("✅ Flujo guardado", "success");
}

/* =========================
   ACTIVADORES / CONEXIÓN
========================= */

function abrirModalActivador(id = ""){
  const modal = document.getElementById("modalActivador");

  const activadorId = document.getElementById("activadorId");
  const activadorNombre = document.getElementById("activadorNombre");
  const activadorFrase = document.getElementById("activadorFrase");
  const activadorConexion = document.getElementById("activadorConexion");
  const activadorActivo = document.getElementById("activadorActivo");
  const activadorRepetible = document.getElementById("activadorRepetible");
  const activadorFlujo = document.getElementById("activadorFlujo");

  if(activadorId) activadorId.value = "";
  if(activadorNombre) activadorNombre.value = "";
  if(activadorFrase) activadorFrase.value = "";
  if(activadorConexion) activadorConexion.value = "API en la nube - MundoColor";
  if(activadorActivo) activadorActivo.checked = true;
  if(activadorRepetible) activadorRepetible.checked = true;

  if(id){
    const act = activadoresData.find(a => a.id === id);

    if(act){
      if(activadorId) activadorId.value = act.id;
      if(activadorNombre) activadorNombre.value = act.nombre || "";
      if(activadorFrase) activadorFrase.value = act.frase || "";
      if(activadorConexion) activadorConexion.value = act.conexion || "API en la nube - MundoColor";
      if(activadorFlujo) activadorFlujo.value = act.flujo_id || "";
      if(activadorActivo) activadorActivo.checked = !!act.activo;
      if(activadorRepetible) activadorRepetible.checked = !!act.repetible;
    }
  }

  if(modal){
    modal.style.display = "flex";
    modal.classList.add("activo");
  }
}

function cerrarModalActivador(){
  const modal = document.getElementById("modalActivador");

  if(modal){
    modal.style.display = "none";
    modal.classList.remove("activo");
  }
}

function abrirModalConexion(){
  const modal = document.getElementById("modalConexion");

  if(modal){
    modal.style.display = "flex";
    modal.classList.add("activo");
  }
}

function cerrarModalConexion(){
  const modal = document.getElementById("modalConexion");

  if(modal){
    modal.style.display = "none";
    modal.classList.remove("activo");
  }
}

/* =========================
   UTILIDADES
========================= */

function buildContenidoPreviewHtml(variantesValidas){
  if(window.MacBotContenido && window.MacBotContenido.buildContenidoPreviewHtml){
    return window.MacBotContenido.buildContenidoPreviewHtml(variantesValidas);
  }

  const jsonVariantes = JSON.stringify(variantesValidas)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return (
    '<textarea class="contenido-variantes-data" style="display:none;">' +
    jsonVariantes +
    "</textarea>"
  );
}

function getCanvasZoom(){
  return viewportState.zoom;
}

function getCanvasViewport(){
  return document.getElementById("canvasWrapper");
}

function ensureCanvasGridLayer(wrap){
  if(!wrap){
    return null;
  }

  let grid = document.getElementById("flowCanvasGrid");
  if(!grid){
    grid = document.createElement("div");
    grid.id = "flowCanvasGrid";
    grid.className = "flow-canvas-grid";
    grid.setAttribute("aria-hidden", "true");
    wrap.insertBefore(grid, wrap.firstChild);
  }else if(grid.parentElement !== wrap){
    wrap.insertBefore(grid, wrap.firstChild);
  }else if(wrap.firstChild !== grid){
    wrap.insertBefore(grid, wrap.firstChild);
  }

  return grid;
}

function ensureInfiniteViewport(){
  const wrap = getCanvasViewport();
  let canvasEl = document.getElementById("canvasFlujo");
  if(!wrap || !canvasEl){
    return;
  }

  let world = document.getElementById("flowWorld");
  const spacer = document.getElementById("canvasSpacer");

  if(!world){
    world = document.createElement("div");
    world.id = "flowWorld";
    world.className = "flow-world";

    if(spacer){
      canvasEl = spacer.querySelector("#canvasFlujo") || canvasEl;
      spacer.replaceWith(world);
      world.appendChild(canvasEl);
    }else if(canvasEl.parentElement === wrap){
      canvasEl.remove();
      world.appendChild(canvasEl);
      wrap.appendChild(world);
    }else{
      if(canvasEl.parentElement !== world){
        world.appendChild(canvasEl);
      }
      if(!wrap.contains(world)){
        wrap.appendChild(world);
      }
    }
  }else{
    if(spacer){
      const nested = spacer.querySelector("#canvasFlujo");
      if(nested){
        canvasEl = nested;
      }
      spacer.remove();
    }
    if(canvasEl.parentElement !== world){
      world.appendChild(canvasEl);
    }
    if(!wrap.contains(world)){
      wrap.appendChild(world);
    }
  }

  if(canvasEl){
    canvasEl.style.transform = "";
    canvasEl.style.transformOrigin = "";
    canvasEl.classList.add("flow-canvas");
    ensureFlowEdgesLayer(canvasEl);
    migrateEdgesToLayer(canvasEl);
  }

  ensureCanvasGridLayer(wrap);
  wrap.style.overflow = "hidden";
  wrap.scrollLeft = 0;
  wrap.scrollTop = 0;
  resizeWorldSurface();
  aplicarViewportTransform();
}

function resizeWorldSurface(){
  const wrap = getCanvasViewport();
  const canvas = document.getElementById("canvasFlujo");
  if(!wrap || !canvas){
    return;
  }

  const rect = wrap.getBoundingClientRect();
  let maxX = Math.max(rect.width * 2.5, WORLD_MIN_SURFACE);
  let maxY = Math.max(rect.height * 2.5, WORLD_MIN_SURFACE);

  canvas.querySelectorAll(".node").forEach((nodo) => {
    maxX = Math.max(maxX, nodo.offsetLeft + nodo.offsetWidth + WORLD_SURFACE_PADDING);
    maxY = Math.max(maxY, nodo.offsetTop + nodo.offsetHeight + WORLD_SURFACE_PADDING);
  });

  canvas.style.width = maxX + "px";
  canvas.style.height = maxY + "px";
}

document.addEventListener("macbot:nodo-layout", function () {
  resizeWorldSurface();
  actualizarLineas();
});

function screenPointToCanvas(clientX, clientY){
  const wrap = getCanvasViewport();
  if(!wrap){
    return { x: 0, y: 0 };
  }

  const rect = wrap.getBoundingClientRect();
  const zoom = getCanvasZoom();

  return {
    x: (clientX - rect.left - viewportState.panX) / zoom,
    y: (clientY - rect.top - viewportState.panY) / zoom,
  };
}

function screenToCanvas(event){
  if(!event || typeof event.clientX !== "number" || typeof event.clientY !== "number"){
    return { x: 0, y: 0 };
  }

  return screenPointToCanvas(event.clientX, event.clientY);
}

function getPortCanvasPoint(puerto){
  const rect = puerto.getBoundingClientRect();

  return screenPointToCanvas(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2
  );
}

function posicionarLinea(linea, x1, y1, x2, y2, routePrecalculada){
  if(!linea) return;

  if(linea.tagName === "svg" || linea.classList.contains("flow-connection-svg")){
    const route =
      routePrecalculada ||
      getSmartConnectionPath(x1, y1, x2, y2, {
        obstacles: getFlowNodeObstacles(document.getElementById("canvasFlujo")),
      });
    aplicarPathConexion(linea, route);
    return;
  }

  const largo = Math.hypot(x2 - x1, y2 - y1);
  const angulo = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;

  linea.style.left = x1 + "px";
  linea.style.top = y1 + "px";
  linea.style.width = largo + "px";
  linea.style.transform = "rotate(" + angulo + "deg)";
  linea.style.transformOrigin = "0 0";
}

function actualizarZoomLabel(){
  const label = document.getElementById("flowZoomLabel");
  if(label){
    label.textContent = Math.round(getCanvasZoom() * 100) + "%";
  }
}

function aplicarViewportTransform(){
  const world = document.getElementById("flowWorld");
  const wrap = getCanvasViewport();
  const zoom = getCanvasZoom();
  const gridStep = WORLD_GRID_SIZE * zoom;

  if(world){
    world.style.transform =
      "translate(" +
      viewportState.panX +
      "px, " +
      viewportState.panY +
      "px) scale(" +
      zoom +
      ")";
    world.style.transformOrigin = "0 0";
  }

  const grid = document.getElementById("flowCanvasGrid");
  if(grid){
    grid.style.backgroundSize = gridStep + "px " + gridStep + "px";
    grid.style.backgroundPosition =
      viewportState.panX + "px " + viewportState.panY + "px";
  }

  actualizarZoomLabel();
  actualizarLineas();
}

function centerViewportOnContent(){
  const wrap = getCanvasViewport();
  const canvas = document.getElementById("canvasFlujo");
  if(!wrap || !canvas){
    return;
  }

  const rect = wrap.getBoundingClientRect();
  const zoom = getCanvasZoom();
  const nodos = canvas.querySelectorAll(".node");

  if(!nodos.length){
    viewportState.panX = rect.width / 2 - 400 * zoom;
    viewportState.panY = rect.height / 2 - 300 * zoom;
    aplicarViewportTransform();
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodos.forEach((nodo) => {
    minX = Math.min(minX, nodo.offsetLeft);
    minY = Math.min(minY, nodo.offsetTop);
    maxX = Math.max(maxX, nodo.offsetLeft + nodo.offsetWidth);
    maxY = Math.max(maxY, nodo.offsetTop + nodo.offsetHeight);
  });

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  viewportState.panX = rect.width / 2 - cx * zoom;
  viewportState.panY = rect.height / 2 - cy * zoom;
  aplicarViewportTransform();
}

function setCanvasZoom(nextZoom, anchorClientX, anchorClientY){
  const wrap = getCanvasViewport();
  if(!wrap){
    return;
  }

  const oldZoom = getCanvasZoom();
  const zoom = Math.min(
    CANVAS_ZOOM_MAX,
    Math.max(CANVAS_ZOOM_MIN, nextZoom)
  );

  if(zoom === oldZoom){
    return;
  }

  const rect = wrap.getBoundingClientRect();

  if(anchorClientX != null && anchorClientY != null){
    const offsetX = anchorClientX - rect.left;
    const offsetY = anchorClientY - rect.top;
    const worldX = (offsetX - viewportState.panX) / oldZoom;
    const worldY = (offsetY - viewportState.panY) / oldZoom;

    viewportState.zoom = zoom;
    viewportState.panX = offsetX - worldX * zoom;
    viewportState.panY = offsetY - worldY * zoom;
  }else{
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const worldX = (cx - viewportState.panX) / oldZoom;
    const worldY = (cy - viewportState.panY) / oldZoom;

    viewportState.zoom = zoom;
    viewportState.panX = cx - worldX * zoom;
    viewportState.panY = cy - worldY * zoom;
  }

  aplicarViewportTransform();
}

function zoomIn(anchorClientX, anchorClientY){
  setCanvasZoom(getCanvasZoom() + CANVAS_ZOOM_STEP, anchorClientX, anchorClientY);
}

function zoomOut(anchorClientX, anchorClientY){
  setCanvasZoom(getCanvasZoom() - CANVAS_ZOOM_STEP, anchorClientX, anchorClientY);
}

function zoomReset(){
  viewportState.zoom = 1;
  centerViewportOnContent();
}

function initCanvasViewport(){
  const wrap = getCanvasViewport();
  if(!wrap){
    return;
  }

  if(wrap.dataset.viewportReady === "1"){
    centerViewportOnContent();
    return;
  }

  wrap.dataset.viewportReady = "1";

  viewportState.panX = 0;
  viewportState.panY = 0;
  viewportState.zoom = 1;
  centerViewportOnContent();

  const btnIn = document.getElementById("btnCanvasZoomIn");
  const btnOut = document.getElementById("btnCanvasZoomOut");
  const btnReset = document.getElementById("btnCanvasZoomReset");

  if(btnIn){
    btnIn.addEventListener("click", function(e){
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      zoomIn(rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
  }

  if(btnOut){
    btnOut.addEventListener("click", function(e){
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      zoomOut(rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
  }

  if(btnReset){
    btnReset.addEventListener("click", function(e){
      e.preventDefault();
      zoomReset();
    });
  }

  wrap.addEventListener(
    "wheel",
    function(e){
      if(!document.getElementById("builderArea")){
        return;
      }

      if(e.target.closest(".flow-zoom-controls")){
        return;
      }

      e.preventDefault();

      const delta = e.deltaY < 0 ? CANVAS_ZOOM_STEP : -CANVAS_ZOOM_STEP;
      setCanvasZoom(getCanvasZoom() + delta, e.clientX, e.clientY);
    },
    { passive: false }
  );

  let panStart = { x: 0, y: 0, panX: 0, panY: 0 };

  wrap.addEventListener("mousedown", function(e){
    if(
      e.target.closest(".node") ||
      e.target.closest(".port") ||
      e.target.closest(".borrar-linea") ||
      e.target.closest(".flow-connection-hitbox") ||
      e.target.closest(".flow-zoom-controls")
    ){
      return;
    }

    if(e.button !== 0){
      return;
    }

    limpiarSeleccionConexion();

    canvasPanningActive = true;
    wrap.classList.add("panning");
    panStart = {
      x: e.clientX,
      y: e.clientY,
      panX: viewportState.panX,
      panY: viewportState.panY,
    };
    e.preventDefault();
  });

  document.addEventListener("mousemove", function(e){
    if(!canvasPanningActive){
      return;
    }

    viewportState.panX = panStart.panX + (e.clientX - panStart.x);
    viewportState.panY = panStart.panY + (e.clientY - panStart.y);
    aplicarViewportTransform();
  });

  document.addEventListener("mouseup", function(){
    if(!canvasPanningActive){
      return;
    }

    canvasPanningActive = false;
    wrap.classList.remove("panning");
  });

  window.addEventListener("resize", function(){
    if(!document.getElementById("builderArea")){
      return;
    }

    resizeWorldSurface();
    aplicarViewportTransform();
  });
}

function marcarNodoSeleccionado(nodo){
  document.querySelectorAll(".node.selected").forEach((el) => {
    el.classList.remove("selected");
  });

  if(nodo){
    nodo.classList.add("selected");
  }
}

function actualizarPanelPosicion(nodo){
  if(!nodo || nodo !== nodoSeleccionadoPanel){
    return;
  }

  const posX = document.getElementById("panelPosX");
  const posY = document.getElementById("panelPosY");

  if(posX){
    posX.value = parseInt(nodo.style.left || 0, 10) + "px";
  }

  if(posY){
    posY.value = parseInt(nodo.style.top || 0, 10) + "px";
  }
}

function escaparHTML(texto){
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================
   PANEL DERECHO DE NODO
========================= */

let nodoSeleccionadoPanel = null;
let configPanelOpen = false;

document.addEventListener("click", function(e){
  const nodo = e.target.closest(".node");

  if(!nodo) return;

  if(
    e.target.classList.contains("port") ||
    e.target.classList.contains("delete-node") ||
    e.target.classList.contains("edit-node") ||
    e.target.classList.contains("duplicate-node")
  ){
    return;
  }

  marcarNodoSeleccionado(nodo);
});

function abrirPanelNodo(nodo){
  if(!nodo || !document.body.contains(nodo)){
    cerrarPanelNodo();
    return;
  }

  console.log("⚙️ ABRIENDO PANEL CONFIG:", nodo.id);

  if(nodoSeleccionadoPanel && nodoSeleccionadoPanel.id !== nodo.id){
    sincronizarPanelAntesDeSnapshot();

    if(window.MacBotSeguimiento && window.MacBotSeguimiento.clearPanelActivo){
      window.MacBotSeguimiento.clearPanelActivo();
    }

    if(window.MacBotContenido && window.MacBotContenido.clearPanelActivo){
      window.MacBotContenido.clearPanelActivo();
    }

    if(window.MacBotOpenAIAgent && window.MacBotOpenAIAgent.clearPanelActivo){
      window.MacBotOpenAIAgent.clearPanelActivo();
    }
    if(window.MacBotIAPro && window.MacBotIAPro.clearPanelActivo){
      window.MacBotIAPro.clearPanelActivo();
    }
    if(window.MacBotIA && window.MacBotIA.clearPanelActivo){
      window.MacBotIA.clearPanelActivo();
    }

    if(window.MacBotRemarketingGlobal && window.MacBotRemarketingGlobal.clearPanelActivo){
      window.MacBotRemarketingGlobal.clearPanelActivo();
    }

    if(window.MacBotLectorPago && window.MacBotLectorPago.clearPanelActivo){
      window.MacBotLectorPago.clearPanelActivo();
    }

    if(window.MacBotSeguimientoV2 && window.MacBotSeguimientoV2.clearPanelActivo){
      window.MacBotSeguimientoV2.clearPanelActivo();
    }
  }

  nodoSeleccionadoPanel = nodo;

  const panel = document.getElementById("panelNodo");
  const contenido = document.getElementById("panelNodoContenido");

  if(!panel || !contenido) return;

  configPanelOpen = true;
  panel.classList.add("activo");
  panel.setAttribute("aria-hidden", "false");
  marcarNodoSeleccionado(nodo);

  if(window.MacBotRemarketingGlobal && window.MacBotRemarketingGlobal.esNodoRemarketingGlobal(nodo)){
    window.MacBotRemarketingGlobal.renderPanel(nodo);
    return;
  }

  if(window.MacBotSeguimientoV2 && window.MacBotSeguimientoV2.esNodoSeguimientoV2(nodo)){
    window.MacBotSeguimientoV2.renderPanel(nodo);
    return;
  }

  if(window.MacBotSeguimiento && window.MacBotSeguimiento.esNodoSeguimiento(nodo)){
    window.MacBotSeguimiento.renderPanel(nodo);
    return;
  }

  if(window.MacBotContenido && window.MacBotContenido.esNodoContenido(nodo)){
    window.MacBotContenido.renderPanel(nodo);
    return;
  }

  if(window.MacBotOpenAIAgent && window.MacBotOpenAIAgent.esNodoOpenAIAgent(nodo)){
    window.MacBotOpenAIAgent.renderPanel(nodo);
    return;
  }

  if(window.MacBotIAPro && window.MacBotIAPro.esNodoIAPro(nodo)){
    window.MacBotIAPro.renderPanel(nodo);
    return;
  }

  if(window.MacBotIA && window.MacBotIA.esNodoIA(nodo)){
    window.MacBotIA.renderPanel(nodo);
    return;
  }

  if(nodo.dataset.tipo === "conversion" || nodo.classList.contains("conversion-node")){
    renderPanelConversion(nodo);
    return;
  }

  if(window.MacBotLectorPago && window.MacBotLectorPago.esNodoLectorPago(nodo)){
    window.MacBotLectorPago.renderPanel(nodo);
    return;
  }

  const titulo = nodo.querySelector("h3")?.innerText || "Nodo";
  const tipo = nodo.dataset.tipo || "nodo";

  contenido.innerHTML = `
    <div class="panel-campo">
      <label>Nombre del nodo</label>
      <input id="panelTituloNodo" value="${escaparHTML(titulo)}">
    </div>

    <div class="panel-campo">
      <label>Posición X</label>
      <input id="panelPosX" value="${parseInt(nodo.style.left || 0, 10)}px" disabled>
    </div>

    <div class="panel-campo">
      <label>Posición Y</label>
      <input id="panelPosY" value="${parseInt(nodo.style.top || 0, 10)}px" disabled>
    </div>

    <button class="panel-btn" onclick="guardarPanelNodo()">
      Guardar cambios
    </button>
  `;

  document.getElementById("panelTituloNodo")?.addEventListener("input", macbotRecordHistoryDebounced);
}

function esNodoConversion(nodo){
  if(!nodo) return false;
  return (
    nodo.dataset.tipo === "conversion" ||
    nodo.classList.contains("conversion-node") ||
    nodo.classList.contains("node-conversion")
  );
}

function actualizarConversionMonedaSelect(select, monedaRaw){
  if(!select) return normalizarMonedaISO(monedaRaw) || "USD";

  const iso = normalizarMonedaISO(monedaRaw) || normalizarMonedaISO(select.value) || "USD";
  select.innerHTML = opcionesSelectConversionMoneda(iso);
  select.value = iso;
  return iso;
}

function leerConversionDataDesdeNodo(nodo){
  let data = { valor: 0, moneda: "", tipo: "venta", origen: "flujo" };

  try {
    const raw = nodo.querySelector(".conversion-data")?.value;
    if(raw) data = { ...data, ...JSON.parse(raw) };
  } catch(e){ /* ignore */ }

  const inputValor = nodo.querySelector(".conversion-valor");
  const selMoneda = nodo.querySelector(".conversion-moneda");
  const selTipo = nodo.querySelector(".conversion-tipo");
  const selOrigen = nodo.querySelector(".conversion-origen");

  if(inputValor && inputValor.value !== ""){
    data.valor = parseFloat(inputValor.value) || 0;
  }

  const monedaGuardada = normalizarMonedaISO(data.moneda);
  const monedaSelect = selMoneda ? normalizarMonedaISO(selMoneda.value) : "";

  if(monedaGuardada && monedaSelect && monedaGuardada !== monedaSelect){
    data.moneda = monedaGuardada;
  } else {
    data.moneda = monedaSelect || monedaGuardada;
  }

  if(selTipo && selTipo.value){
    data.tipo = selTipo.value;
  }

  if(selOrigen && selOrigen.value){
    data.origen = selOrigen.value;
  }

  data.moneda = normalizarMonedaISO(data.moneda) || "USD";
  data.tipo = normalizarConversionTipo(data.tipo);
  return data;
}

function renderConversionVisual(nodo, data){
  if(!nodo || !data) return;

  const valor = parseFloat(data.valor) || 0;
  const moneda = normalizarMonedaISO(data.moneda) || "USD";
  const tipoLabel = conversionTipoLabel(data.tipo);
  const textoVenta = `${tipoLabel}: ${valor} ${moneda}`;

  nodo.querySelectorAll(".conversion-venta").forEach((ventaEl) => {
    ventaEl.textContent = textoVenta;
    ventaEl.classList.toggle("conversion-venta--empty", valor <= 0);
  });

  nodo.querySelectorAll(".conversion-hint").forEach((hintEl) => {
    if(hintEl.classList.contains("conversion-venta")) return;
    hintEl.textContent = textoVenta;
  });
}

function ensureConversionFieldsHidden(nodo){
  let wrap = nodo.querySelector(".conversion-node-fields");
  if(!wrap){
    wrap = document.createElement("div");
    wrap.className = "conversion-node-fields conversion-node-fields--hidden";
    const portOut = nodo.querySelector(".port.out");
    if(portOut) nodo.insertBefore(wrap, portOut);
    else nodo.appendChild(wrap);
  }

  ["conversion-valor", "conversion-moneda", "conversion-tipo", "conversion-origen"].forEach((cls) => {
    const el = nodo.querySelector("." + cls);
    if(el && el.parentElement !== wrap) wrap.appendChild(el);
  });

  if(!nodo.querySelector(".conversion-tipo")){
    const selTipo = document.createElement("select");
    selTipo.className = "conversion-tipo node-select";
    selTipo.setAttribute("tabindex", "-1");
    selTipo.setAttribute("aria-hidden", "true");
    selTipo.innerHTML = opcionesSelectConversionTipo("venta");
    wrap.appendChild(selTipo);
  }

  return wrap;
}

function initConversionNodeUI(nodo){
  if(!esNodoConversion(nodo)) return;

  nodo.classList.add("conversion-node", "node-conversion", "conversion-node--circular");

  const portIn = nodo.querySelector(".port.in");
  const portOut = nodo.querySelector(".port.out");
  const actions = nodo.querySelector(".node-actions");
  ensureConversionFieldsHidden(nodo);

  let shell = nodo.querySelector(".conversion-node-shell");
  if(!shell){
    shell = document.createElement("div");
    shell.className = "conversion-node-shell";

    const col = document.createElement("div");
    col.className = "conversion-core-column";

    const circle = document.createElement("div");
    circle.className = "conversion-circle";
    circle.innerHTML =
      '<span class="conversion-badge-event">EVENTO</span>' +
      '<div class="conversion-icon" aria-hidden="true">💰</div>' +
      '<h3 class="conversion-title">Conversión</h3>' +
      '<p class="conversion-venta conversion-hint">Registra venta real</p>' +
      '<p class="conversion-footnote">Registra venta real</p>';

    col.appendChild(circle);
    shell.appendChild(col);

    if(portOut) nodo.insertBefore(shell, portOut);
    else nodo.appendChild(shell);
  }

  const circle = nodo.querySelector(".conversion-circle");
  if(!circle) return;

  if(portIn && portIn.parentElement !== circle){
    circle.insertBefore(portIn, circle.firstChild);
  }

  if(actions && actions.parentElement !== circle){
    const badge = circle.querySelector(".conversion-badge-event");
    if(badge) circle.insertBefore(actions, badge.nextSibling);
    else circle.appendChild(actions);
  }

  nodo.querySelectorAll(".node-title").forEach((el) => {
    if(!circle.contains(el)) el.remove();
  });

  nodo.querySelectorAll(".node-desc").forEach((el) => {
    if(
      !circle.contains(el) &&
      !el.classList.contains("conversion-venta") &&
      !el.classList.contains("conversion-footnote")
    ){
      el.remove();
    }
  });

  const data = leerConversionDataDesdeNodo(nodo);
  actualizarConversionMonedaSelect(nodo.querySelector(".conversion-moneda"), data.moneda);
  const selTipo = nodo.querySelector(".conversion-tipo");
  if(selTipo){
    selTipo.innerHTML = opcionesSelectConversionTipo(data.tipo);
    selTipo.value = normalizarConversionTipo(data.tipo);
  }
  syncConversionDataToNodo(nodo, data);
}

function syncConversionDataToNodo(nodo, dataOverride){
  if(!nodo) return;

  const data = dataOverride
    ? {
        valor: parseFloat(dataOverride.valor) || 0,
        moneda: normalizarMonedaISO(dataOverride.moneda) || "USD",
        tipo: normalizarConversionTipo(dataOverride.tipo),
        origen: dataOverride.origen || "flujo",
      }
    : leerConversionDataDesdeNodo(nodo);

  const ta = nodo.querySelector(".conversion-data");
  if(ta) ta.value = JSON.stringify(data);

  renderConversionVisual(nodo, data);
}

function aplicarConversionDesdePanel(){
  const nodo = nodoSeleccionadoPanel;
  if(!nodo || !esNodoConversion(nodo)) return;

  const valor = parseFloat(document.getElementById("panelConversionValor")?.value) || 0;
  const moneda = normalizarMonedaISO(document.getElementById("panelConversionMoneda")?.value) || "USD";
  const tipo = normalizarConversionTipo(document.getElementById("panelConversionTipo")?.value);
  const origen = document.getElementById("panelConversionOrigen")?.value || "flujo";
  const data = { valor, moneda, tipo, origen };

  const inputValor = nodo.querySelector(".conversion-valor");
  const selMoneda = nodo.querySelector(".conversion-moneda");
  const selTipo = nodo.querySelector(".conversion-tipo");
  const selOrigen = nodo.querySelector(".conversion-origen");

  if(inputValor) inputValor.value = valor;
  actualizarConversionMonedaSelect(selMoneda, moneda);
  if(selTipo){
    selTipo.innerHTML = opcionesSelectConversionTipo(tipo);
    selTipo.value = tipo;
  }
  if(selOrigen) selOrigen.value = origen;

  syncConversionDataToNodo(nodo, data);
}

function bindPanelConversionLiveSync(){
  const valorEl = document.getElementById("panelConversionValor");
  const monedaEl = document.getElementById("panelConversionMoneda");
  const tipoEl = document.getElementById("panelConversionTipo");
  const origenEl = document.getElementById("panelConversionOrigen");

  valorEl?.addEventListener("input", aplicarConversionDesdePanel);
  monedaEl?.addEventListener("input", aplicarConversionDesdePanel);
  monedaEl?.addEventListener("change", aplicarConversionDesdePanel);
  tipoEl?.addEventListener("change", aplicarConversionDesdePanel);
  origenEl?.addEventListener("change", aplicarConversionDesdePanel);
}

function renderPanelConversion(nodo){
  nodoSeleccionadoPanel = nodo;

  const panel = document.getElementById("panelNodo");
  const contenido = document.getElementById("panelNodoContenido");
  if(!panel || !contenido) return;

  initConversionNodeUI(nodo);

  panel.classList.add("activo");
  marcarNodoSeleccionado(nodo);

  const data = leerConversionDataDesdeNodo(nodo);

  contenido.innerHTML = `
    <div class="panel-campo">
      <label>Valor de la venta</label>
      <input id="panelConversionValor" type="number" min="0" step="0.01" value="${data.valor}">
    </div>
    <div class="panel-campo">
      <label>Moneda</label>
      <select id="panelConversionMoneda">
        ${opcionesSelectConversionMoneda(data.moneda)}
      </select>
    </div>
    <div class="panel-campo">
      <label>Tipo de conversión</label>
      <select id="panelConversionTipo">
        ${opcionesSelectConversionTipo(data.tipo)}
      </select>
    </div>
    <div class="panel-campo">
      <label>Origen integración</label>
      <select id="panelConversionOrigen">
        <option value="flujo" ${data.origen === "flujo" ? "selected" : ""}>Flujo automático</option>
        <option value="manual" ${data.origen === "manual" ? "selected" : ""}>Manual</option>
        <option value="hotmart" ${data.origen === "hotmart" ? "selected" : ""}>Hotmart</option>
        <option value="stripe" ${data.origen === "stripe" ? "selected" : ""}>Stripe</option>
        <option value="mercadopago" ${data.origen === "mercadopago" ? "selected" : ""}>MercadoPago</option>
        <option value="qr" ${data.origen === "qr" ? "selected" : ""}>QR</option>
        <option value="webhook" ${data.origen === "webhook" ? "selected" : ""}>Webhook</option>
      </select>
    </div>
    <p class="panel-hint">Solo este nodo suma ventas en KPIs. Las etiquetas no cuentan como venta.</p>
    <button class="panel-btn" onclick="guardarPanelConversion()">Guardar conversión</button>
  `;

  bindPanelConversionLiveSync();
  aplicarConversionDesdePanel();
}

function guardarPanelConversion(){
  if(!nodoSeleccionadoPanel) return;

  registrarHistorialBuilder();
  aplicarConversionDesdePanel();
}

function guardarPanelNodo(){
  if(!nodoSeleccionadoPanel || !document.body.contains(nodoSeleccionadoPanel)) return;

  registrarHistorialBuilder();

  if(nodoSeleccionadoPanel.dataset.tipo === "conversion"){
    guardarPanelConversion();
    return;
  }

  if(window.MacBotLectorPago && window.MacBotLectorPago.esNodoLectorPago(nodoSeleccionadoPanel)){
    window.MacBotLectorPago.guardarPanelLectorPago();
    return;
  }

  const nuevoTitulo = document.getElementById("panelTituloNodo")?.value.trim();

  const h3 = nodoSeleccionadoPanel.querySelector("h3");

  if(h3 && nuevoTitulo){
    h3.innerText = nuevoTitulo;
  }

  const panelEtiqueta = document.getElementById("panelEtiqueta");
  const selectNodo = nodoSeleccionadoPanel.querySelector("select");

  if(panelEtiqueta && selectNodo){
    selectNodo.value = panelEtiqueta.value;
  }
}

function cerrarPanelNodo(){
  console.log("❌ CERRANDO PANEL CONFIG");
  macbotUnlockCanvasInteraction();

  const panel = document.getElementById("panelNodo");
  const contenido = document.getElementById("panelNodoContenido");

  if(window.MacBotSeguimiento && window.MacBotSeguimiento.clearPanelActivo){
    window.MacBotSeguimiento.clearPanelActivo();
  }

  if(window.MacBotContenido && window.MacBotContenido.clearPanelActivo){
    window.MacBotContenido.clearPanelActivo();
  }

  if(window.MacBotOpenAIAgent && window.MacBotOpenAIAgent.clearPanelActivo){
    window.MacBotOpenAIAgent.clearPanelActivo();
  }
  if(window.MacBotIAPro && window.MacBotIAPro.clearPanelActivo){
    window.MacBotIAPro.clearPanelActivo();
  }
  if(window.MacBotIA && window.MacBotIA.clearPanelActivo){
    window.MacBotIA.clearPanelActivo();
  }

  if(window.MacBotRemarketingGlobal && window.MacBotRemarketingGlobal.clearPanelActivo){
    window.MacBotRemarketingGlobal.clearPanelActivo();
  }

  if(window.MacBotLectorPago && window.MacBotLectorPago.clearPanelActivo){
    window.MacBotLectorPago.clearPanelActivo();
  }

  if(window.MacBotSeguimientoV2 && window.MacBotSeguimientoV2.clearPanelActivo){
    window.MacBotSeguimientoV2.clearPanelActivo();
  }

  configPanelOpen = false;
  nodoSeleccionadoPanel = null;

  if(panel){
    panel.classList.remove("activo");
    panel.setAttribute("aria-hidden", "true");
  }

  if(contenido){
    contenido.innerHTML = "";
  }

  marcarNodoSeleccionado(null);
  console.log("🔓 CANVAS LIBERADO");
}

/* =========================
   HISTORIAL DESHACER / REHACER
========================= */

function sincronizarPanelAntesDeSnapshot(){
  if(window.MacBotSeguimiento && window.MacBotSeguimiento.flushPanelToNode){
    window.MacBotSeguimiento.flushPanelToNode();
  }

  if(window.MacBotContenido && window.MacBotContenido.flushPanelToNode){
    window.MacBotContenido.flushPanelToNode();
  }

  if(window.MacBotOpenAIAgent && window.MacBotOpenAIAgent.flushPanelToNode){
    window.MacBotOpenAIAgent.flushPanelToNode();
  }
  if(window.MacBotIAPro && window.MacBotIAPro.flushPanelToNode){
    window.MacBotIAPro.flushPanelToNode();
  }
  if(window.MacBotIA && window.MacBotIA.flushPanelToNode){
    window.MacBotIA.flushPanelToNode();
  }
  if(window.MacBotRemarketingGlobal && window.MacBotRemarketingGlobal.flushPanelToNode){
    window.MacBotRemarketingGlobal.flushPanelToNode();
  }

  if(window.MacBotLectorPago && window.MacBotLectorPago.flushPanelToNode){
    window.MacBotLectorPago.flushPanelToNode();
  }

  if(window.MacBotSeguimientoV2 && window.MacBotSeguimientoV2.flushPanelToNode){
    window.MacBotSeguimientoV2.flushPanelToNode();
  }
}

function capturarSnapshotBuilder(){
  sincronizarPanelAntesDeSnapshot();

  const nodos = [];

  document.querySelectorAll("#canvasFlujo .node").forEach((nodo) => {
    nodos.push({
      id: nodo.id,
      className: nodo.className,
      html: nodo.innerHTML,
      left: nodo.style.left || "0px",
      top: nodo.style.top || "0px",
      tipo: nodo.dataset.tipo || "",
    });
  });

  const panel = document.getElementById("panelNodo");

  return {
    nodoCount,
    nodos,
    conexiones: conexiones.map((c) => ({
      desde: c.desde.id,
      hasta: c.hasta.id,
    })),
    panelAbierto: configPanelOpen,
    nodoSeleccionadoId: nodoSeleccionadoPanel?.id || null,
  };
}

function restaurarSnapshotBuilder(snapshot){
  if(!snapshot) return;

  const canvas = document.getElementById("canvasFlujo");
  if(!canvas) return;

  builderHistorial.restaurando = true;

  if(window.MacBotSeguimiento && window.MacBotSeguimiento.clearPanelActivo){
    window.MacBotSeguimiento.clearPanelActivo();
  }

  conexiones.forEach((c) => {
    c.linea?.remove();
    c.borrar?.remove();
  });
  conexiones = [];

  canvas.innerHTML = "";
  const mapaNodos = {};

  (snapshot.nodos || []).forEach((item) => {
    const nodo = document.createElement("div");

    nodo.id = item.id;
    nodo.className = item.className || "node";
    nodo.innerHTML = item.html || "";
    nodo.style.left = item.left || "80px";
    nodo.style.top = item.top || "80px";

    if(item.tipo){
      nodo.dataset.tipo = item.tipo;
    }

    if(item.id === "nodo_inicio"){
      nodo.classList.add("node-start");
      nodo.dataset.tipo = "inicio";
    }

    canvas.appendChild(nodo);
    hacerMovible(nodo);
    mapaNodos[item.id] = nodo;

    if(
      item.className &&
      item.className.includes("follow-node") &&
      !item.className.includes("follow-node-v2") &&
      !item.className.includes("seguimiento-v2-node")
    ){
      try{
        if(window.MacBotSeguimiento){
          window.MacBotSeguimiento.refrescarNodoCargado(nodo);
        }
      } catch (err) {
        console.warn("Seguimiento: error al restaurar nodo", err.message);
      }
    }

    if(
      item.tipo === "seguimiento_crm_v2" ||
      (item.className && (item.className.includes("seguimiento-v2-node") || item.className.includes("follow-node-v2")))
    ){
      try{
        if(window.MacBotSeguimientoV2){
          window.MacBotSeguimientoV2.refrescarNodoCargado(nodo);
        }
      } catch (err) {
        console.warn("Seguimiento V2: error al restaurar nodo", err.message);
      }
    }

    if(
      (item.className && item.className.includes("remarketing-global-node")) ||
      item.tipo === "remarketing_global" ||
      (item.html && item.html.includes("remarketing-global-data"))
    ){
      try{
        if(window.MacBotRemarketingGlobal){
          window.MacBotRemarketingGlobal.refrescarNodoCargado(nodo);
        }
      } catch (err) {
        console.warn("RM24H: error al restaurar nodo", err.message);
      }
    }

    if(
      (item.className && item.className.includes("content-node")) ||
      item.tipo === "contenido" ||
      (item.html && item.html.includes("contenido-variantes-data"))
    ){
      try{
        if(window.MacBotContenido){
          window.MacBotContenido.refrescarNodoCargado(nodo);
        }
      } catch (err) {
        console.warn("Contenido: error al restaurar nodo", err.message);
      }
    }

    if(
      (item.className && item.className.includes("openai-agent-node")) ||
      item.tipo === "openai_agent" ||
      (item.html && item.html.includes("openai-agent-data"))
    ){
      try{
        if(window.MacBotOpenAIAgent){
          window.MacBotOpenAIAgent.refrescarNodoCargado(nodo);
        }
      } catch (err) {
        console.warn("OpenAI Agent: error al restaurar nodo", err.message);
      }
    }

    if(
      (item.className && item.className.includes("ia-pro-node")) ||
      item.tipo === "ia_pro" ||
      (item.html && item.html.includes("ia-pro-data"))
    ){
      try{
        if(window.MacBotIAPro){
          window.MacBotIAPro.refrescarNodoCargado(nodo);
        }
      } catch (err) {
        console.warn("IA Pro: error al restaurar nodo", err.message);
      }
    }

    if(
      (item.className && item.className.includes("ia-node")) ||
      item.tipo === "ia" ||
      (item.html && item.html.includes("ia-data") && !item.html.includes("ia-pro-data"))
    ){
      try{
        if(window.MacBotIA){
          window.MacBotIA.refrescarNodoCargado(nodo);
        }
      } catch (err) {
        console.warn("IA: error al restaurar nodo", err.message);
      }
    }
  });

  nodoCount = snapshot.nodoCount || 0;
  ultimoNodo = null;

  (snapshot.conexiones || []).forEach((c) => {
    const par = normalizarConexionGuardada(c);
    if(par && mapaNodos[par.desde] && mapaNodos[par.hasta]){
      conectarNodos(mapaNodos[par.desde], mapaNodos[par.hasta], par.sourceHandle || null);
    }
  });

  actualizarHandlersPuertosCanvas();
  actualizarLineas();

  if(snapshot.panelAbierto && snapshot.nodoSeleccionadoId){
    const nodoSel = document.getElementById(snapshot.nodoSeleccionadoId);

    if(nodoSel){
      abrirPanelNodo(nodoSel);
    } else {
      cerrarPanelNodo();
    }
  } else {
    cerrarPanelNodo();
  }

  actualizarLineas();
  resizeWorldSurface();
  refrescarSelectsEtiquetaNodos();
  builderHistorial.restaurando = false;
  actualizarBotonesHistorialBuilder();
}

function registrarHistorialBuilder(){
  if(builderHistorial.restaurando || !document.getElementById("builderArea")){
    return;
  }

  builderHistorial.undoStack.push(capturarSnapshotBuilder());

  if(builderHistorial.undoStack.length > BUILDER_HISTORY_MAX){
    builderHistorial.undoStack.shift();
  }

  builderHistorial.redoStack = [];
  actualizarBotonesHistorialBuilder();
}

function macbotRecordHistoryDebounced(){
  if(builderHistorial.restaurando || !document.getElementById("builderArea")){
    return;
  }

  clearTimeout(builderHistorial.debounceTimer);
  builderHistorial.debounceTimer = setTimeout(registrarHistorialBuilder, 450);
}

function deshacerBuilder(){
  if(!builderHistorial.undoStack.length || builderHistorial.restaurando){
    return;
  }

  builderHistorial.redoStack.push(capturarSnapshotBuilder());

  if(builderHistorial.redoStack.length > BUILDER_HISTORY_MAX){
    builderHistorial.redoStack.shift();
  }

  const anterior = builderHistorial.undoStack.pop();
  restaurarSnapshotBuilder(anterior);
}

function rehacerBuilder(){
  if(!builderHistorial.redoStack.length || builderHistorial.restaurando){
    return;
  }

  builderHistorial.undoStack.push(capturarSnapshotBuilder());

  if(builderHistorial.undoStack.length > BUILDER_HISTORY_MAX){
    builderHistorial.undoStack.shift();
  }

  const siguiente = builderHistorial.redoStack.pop();
  restaurarSnapshotBuilder(siguiente);
}

function actualizarBotonesHistorialBuilder(){
  const btnUndo = document.getElementById("btnBuilderUndo");
  const btnRedo = document.getElementById("btnBuilderRedo");

  if(btnUndo){
    btnUndo.disabled = builderHistorial.undoStack.length === 0;
  }

  if(btnRedo){
    btnRedo.disabled = builderHistorial.redoStack.length === 0;
  }
}

function initBuilderHistory(){
  if(!document.getElementById("builderArea")){
    return;
  }

  window.registrarHistorialBuilder = registrarHistorialBuilder;
  window.macbotRecordHistoryDebounced = macbotRecordHistoryDebounced;

  document.getElementById("btnBuilderUndo")?.addEventListener("click", deshacerBuilder);
  document.getElementById("btnBuilderRedo")?.addEventListener("click", rehacerBuilder);

  document.getElementById("canvasFlujo")?.addEventListener("input", function(e){
    if(e.target.closest(".node input, .node textarea, .node select")){
      macbotRecordHistoryDebounced();
    }
  });

  document.addEventListener("keydown", function(e){
    if(!document.getElementById("builderArea")){
      return;
    }

    const tag = (e.target && e.target.tagName) || "";
    const editable = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

    if(!(e.ctrlKey || e.metaKey)){
      return;
    }

    const key = String(e.key || "").toLowerCase();

    if(key === "z" && !e.shiftKey){
      if(editable && e.target.closest("#panelNodoContenido")){
        return;
      }
      e.preventDefault();
      deshacerBuilder();
      return;
    }

    if(key === "y" || (key === "z" && e.shiftKey)){
      if(editable && e.target.closest("#panelNodoContenido")){
        return;
      }
      e.preventDefault();
      rehacerBuilder();
    }
  });

  actualizarBotonesHistorialBuilder();
}