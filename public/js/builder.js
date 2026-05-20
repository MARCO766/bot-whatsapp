let nodoCount = 0;
let ultimoNodo = null;
let conexiones = [];
let nodoArrastrando = null;
let lineaTemporal = null;
let puertoOrigenConexion = null;
let puertoHandleOrigen = null;
let canvasPanningActive = false;

const MACBOT_BUILDER = window.MACBOT_BUILDER || {};

let flujoEditandoId = MACBOT_BUILDER.flujoEditandoId || "";
let flujoCargado = MACBOT_BUILDER.flujoCargado || null;

const activadoresData = MACBOT_BUILDER.activadoresData || [];
const etiquetasData = MACBOT_BUILDER.etiquetasData || [];

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

  document.querySelectorAll(".follow-node").forEach((nodo) => {
    try {
      if(window.MacBotSeguimiento){
        window.MacBotSeguimiento.refrescarNodoCargado(nodo);
      }
    } catch (e) {
      console.warn("Seguimiento: error al refrescar nodo cargado", e);
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

  document.querySelectorAll(".ia-node").forEach((nodo) => {
    try {
      if(window.MacBotIA){
        window.MacBotIA.refrescarNodoCargado(nodo);
      }
    } catch (e) {
      console.warn("IA: error al refrescar nodo cargado", e);
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
}

/* =========================
   CREAR NODOS
========================= */

function agregarNodo(tipo){
  const canvas = document.getElementById("canvasFlujo");

  if(!canvas){
    alert("No existe canvasFlujo");
    return;
  }

  if(tipo === "ia" && window.MacBotIA && window.MacBotIA.crearNodoEnCanvas){
    registrarHistorialBuilder();
    window.MacBotIA.crearNodoEnCanvas();
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
    nodo.classList.add("follow-node");

    contenido = `
      <div class="follow-header">
        <span>⏱️ Seguimiento CRM</span>
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
    nodo.classList.add("orange");

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
    nodo.classList.add("conversion-node");

    contenido = `
      <div class="node-actions">
        <button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo('${nodo.id}')">✎</button>
        <button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo('${nodo.id}')">×</button>
      </div>
      <h3 class="node-title">💰 Conversión</h3>
      <p class="node-desc conversion-hint">Registra venta real · no usa etiquetas</p>
      <input type="number" class="conversion-valor" min="0" step="0.01" value="0" placeholder="Valor">
      <select class="conversion-moneda node-select">
        <option value="USD" selected>USD</option>
        <option value="MXN">MXN</option>
        <option value="ARS">ARS</option>
        <option value="COP">COP</option>
        <option value="EUR">EUR</option>
        <option value="BRL">BRL</option>
      </select>
      <select class="conversion-origen node-select">
        <option value="flujo" selected>Flujo (automático)</option>
        <option value="manual">Manual</option>
        <option value="hotmart">Hotmart</option>
        <option value="stripe">Stripe</option>
        <option value="mercadopago">MercadoPago</option>
        <option value="qr">QR</option>
        <option value="webhook">Webhook</option>
      </select>
      <textarea class="conversion-data" style="display:none;">{"valor":0,"moneda":"USD","origen":"flujo"}</textarea>
    `;
  }

  if(tipo === "etiqueta"){
    const opcionesEtiquetas = etiquetasData.map(e => {
      return `<option value="${e.nombre}">${e.nombre}</option>`;
    }).join("");

    contenido = `
      <div class="node-actions">
        <button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo('${nodo.id}')">✎</button>
        <button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo('${nodo.id}')">×</button>
      </div>
      <h3 class="node-title">🏷️ Etiqueta</h3>
      <select class="node-select" style="width:100%;background:#0f1117;border:2px solid #333;padding:15px;border-radius:14px;color:white;margin:10px 0;font-size:16px;">
        <option value="">Selecciona una etiqueta</option>
        ${opcionesEtiquetas}
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
    nodo.classList.add("ia-node");
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
  }

  if(tipo === "ia" && window.MacBotIA){
    window.MacBotIA.initNodoRecienCreado(nodo);
  }

  hacerMovible(nodo);
}

/* =========================
   MOVER NODOS
========================= */

function hacerMovible(nodo){
  let moviendo = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;
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

    moviendo = true;
    startX = e.clientX;
    startY = e.clientY;
    origLeft = nodo.offsetLeft;
    origTop = nodo.offsetTop;
    marcarNodoSeleccionado(nodo);
  });

  document.addEventListener("mousemove", function(e){
    if(!moviendo) return;

    const zoom = getCanvasZoom();

    nodo.style.left = origLeft + (e.clientX - startX) / zoom + "px";
    nodo.style.top = origTop + (e.clientY - startY) / zoom + "px";

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

function iniciarConexion(e, id, portSide){
  e.stopPropagation();

  nodoArrastrando = document.getElementById(id);
  puertoOrigenConexion = portSide === "in" ? "in" : "out";
  const portEl = e.target?.closest?.(".port");
  puertoHandleOrigen = portEl?.dataset?.handle || null;

  const canvas = document.getElementById("canvasFlujo");
  if(!canvas || !nodoArrastrando) return;

  lineaTemporal = document.createElement("div");
  lineaTemporal.className = "linea linea-dashed";

  canvas.appendChild(lineaTemporal);

  document.addEventListener("mousemove", moverConexionTemporal);
  document.addEventListener("mouseup", soltarConexion);
}

function moverConexionTemporal(e){
  if(!nodoArrastrando || !lineaTemporal) return;

  const puerto =
    puertoOrigenConexion === "in"
      ? nodoArrastrando.querySelector(".port.in")
      : obtenerPuertoSalida(nodoArrastrando, puertoHandleOrigen);
  if(!puerto) return;

  const inicio = getPortCanvasPoint(puerto);
  const fin = screenPointToCanvas(e.clientX, e.clientY);

  posicionarLinea(lineaTemporal, inicio.x, inicio.y, fin.x, fin.y);
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

  if(lineaTemporal){
    lineaTemporal.remove();
  }

  nodoArrastrando = null;
  lineaTemporal = null;
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

  const linea = document.createElement("div");
  linea.className = "linea linea-dashed";

  const borrar = document.createElement("button");
  borrar.innerText = "×";
  borrar.className = "borrar-linea";

  borrar.onclick = function(e){
    e.stopPropagation();

    registrarHistorialBuilder();

    conexiones = conexiones.filter(c => c.linea !== linea);

    linea.remove();
    borrar.remove();
  };

  canvas.appendChild(linea);
  canvas.appendChild(borrar);

  const item = {
    desde: nodo1,
    hasta: nodo2,
    linea,
    borrar,
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

  conexiones.forEach(c => {
    const puertoDesde = obtenerPuertoSalida(c.desde, c.sourceHandle);
    const puertoHasta = c.hasta.querySelector(".port.in") || c.hasta.querySelector(".port");

    if(!puertoDesde || !puertoHasta) return;

    const inicio = getPortCanvasPoint(puertoDesde);
    const fin = getPortCanvasPoint(puertoHasta);

    posicionarLinea(c.linea, inicio.x, inicio.y, fin.x, fin.y);

    if(c.borrar){
      c.borrar.style.left = (inicio.x + fin.x) / 2 - 12 + "px";
      c.borrar.style.top = (inicio.y + fin.y) / 2 - 12 + "px";
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

  const eraSeleccionado =
    (nodoSeleccionadoPanel && nodoSeleccionadoPanel.id === id) ||
    (nodoActivoSeg && nodoActivoSeg.id === id) ||
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
    cerrarPanelNodo();
  }
}

/* =========================
   GUARDAR FLUJO
========================= */

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
  if(lineaTemporal){
    lineaTemporal.remove();
    lineaTemporal = null;
  }
  nodoArrastrando = null;
  puertoOrigenConexion = null;
  puertoHandleOrigen = null;
}

window.macbotUnlockCanvasInteraction = macbotUnlockCanvasInteraction;

async function guardarFlujo(){
  console.log("💾 CLICK GUARDAR FLUJO");
  const titulo = document.getElementById("tituloFlujo");

  if(!titulo){
    alert("No existe tituloFlujo");
    return;
  }

  macbotUnlockCanvasInteraction();

  try {
    sincronizarPanelAntesDeSnapshot();
  } catch (err) {
    console.error("[BUILDER] Error sincronizando panel antes de guardar:", err.message);
    alert("Error al preparar el guardado: " + err.message);
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

    nodos.push({
      id: nodo.id,
      html: nodo.innerHTML,
      left: nodo.style.left,
      top: nodo.style.top,
      className: nodo.className,
      tipo: nodo.dataset.tipo || ""
    });
  });

  if(nodos.length === 0){
    alert("Primero agrega al menos un nodo");
    return;
  }

  const conexionesGuardadas = obtenerConexionesParaGuardar();
  const avisos = validarFlujoAntesDeGuardar(nodos, conexionesGuardadas);

  if(avisos.length){
    const continuar = confirm(
      "Avisos del flujo:\n\n" +
      avisos.slice(0, 8).join("\n") +
      (avisos.length > 8 ? "\n… y " + (avisos.length - 8) + " más" : "") +
      "\n\n¿Guardar igualmente?"
    );
    if(!continuar) return;
  }

  const data = {
    nodos,
    conexiones: conexionesGuardadas
  };

  console.log("[BUILDER] Guardando flujo:", conexionesGuardadas.length, "conexión(es)", conexionesGuardadas);

  let res;
  try {
    res = await fetch("/guardar-flujo-builder", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: flujoEditandoId,
      nombre,
      data
    })
    });
  } catch (err) {
    console.error("[BUILDER] Error guardando flujo:", err.message);
    macbotUnlockCanvasInteraction();
    alert("Error al guardar el flujo: " + err.message);
    return;
  }

  const respuesta = await res.text();

  if(respuesta.includes("<!DOCTYPE html>") || respuesta.includes("<html")){
    alert("Tu sesión expiró. Inicia sesión otra vez y vuelve a guardar.");
    window.location.href = "/login";
    return;
  }

  console.log("✅ FLUJO GUARDADO");
  alert(respuesta);
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
  }

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

function getPortCanvasPoint(puerto){
  const rect = puerto.getBoundingClientRect();

  return screenPointToCanvas(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2
  );
}

function posicionarLinea(linea, x1, y1, x2, y2){
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

  if(wrap){
    wrap.style.backgroundSize =
      "auto, auto, " + gridStep + "px " + gridStep + "px, " + gridStep + "px " + gridStep + "px";
    wrap.style.backgroundPosition =
      "0 0, 0 0, " +
      viewportState.panX +
      "px " +
      viewportState.panY +
      "px, " +
      viewportState.panX +
      "px " +
      viewportState.panY +
      "px";
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
      e.target.closest(".flow-zoom-controls")
    ){
      return;
    }

    if(e.button !== 0){
      return;
    }

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
    e.target.classList.contains("edit-node")
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

    if(window.MacBotIA && window.MacBotIA.clearPanelActivo){
      window.MacBotIA.clearPanelActivo();
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

  if(window.MacBotSeguimiento && window.MacBotSeguimiento.esNodoSeguimiento(nodo)){
    window.MacBotSeguimiento.renderPanel(nodo);
    return;
  }

  if(window.MacBotContenido && window.MacBotContenido.esNodoContenido(nodo)){
    window.MacBotContenido.renderPanel(nodo);
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

function syncConversionDataToNodo(nodo){
  if(!nodo) return;

  const valor = parseFloat(nodo.querySelector(".conversion-valor")?.value) || 0;
  const moneda = nodo.querySelector(".conversion-moneda")?.value || "USD";
  const origen = nodo.querySelector(".conversion-origen")?.value || "flujo";
  const data = { valor, moneda, origen };

  const ta = nodo.querySelector(".conversion-data");
  if(ta) ta.value = JSON.stringify(data);

  const hint = nodo.querySelector(".conversion-hint");
  if(hint){
    hint.textContent = valor > 0
      ? `Venta: ${valor} ${moneda} · ${origen}`
      : "Registra venta real · no usa etiquetas";
  }
}

function renderPanelConversion(nodo){
  nodoSeleccionadoPanel = nodo;

  const panel = document.getElementById("panelNodo");
  const contenido = document.getElementById("panelNodoContenido");
  if(!panel || !contenido) return;

  panel.classList.add("activo");
  marcarNodoSeleccionado(nodo);

  let data = { valor: 0, moneda: "USD", origen: "flujo" };
  try {
    const raw = nodo.querySelector(".conversion-data")?.value;
    if(raw) data = { ...data, ...JSON.parse(raw) };
  } catch(e){ /* ignore */ }

  contenido.innerHTML = `
    <div class="panel-campo">
      <label>Valor de la venta</label>
      <input id="panelConversionValor" type="number" min="0" step="0.01" value="${data.valor}">
    </div>
    <div class="panel-campo">
      <label>Moneda</label>
      <select id="panelConversionMoneda">
        <option value="USD" ${data.moneda === "USD" ? "selected" : ""}>USD</option>
        <option value="MXN" ${data.moneda === "MXN" ? "selected" : ""}>MXN</option>
        <option value="ARS" ${data.moneda === "ARS" ? "selected" : ""}>ARS</option>
        <option value="COP" ${data.moneda === "COP" ? "selected" : ""}>COP</option>
        <option value="EUR" ${data.moneda === "EUR" ? "selected" : ""}>EUR</option>
        <option value="BRL" ${data.moneda === "BRL" ? "selected" : ""}>BRL</option>
      </select>
    </div>
    <div class="panel-campo">
      <label>Origen (integraciones futuras)</label>
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
}

function guardarPanelConversion(){
  if(!nodoSeleccionadoPanel) return;

  registrarHistorialBuilder();

  const valor = parseFloat(document.getElementById("panelConversionValor")?.value) || 0;
  const moneda = document.getElementById("panelConversionMoneda")?.value || "USD";
  const origen = document.getElementById("panelConversionOrigen")?.value || "flujo";

  const inputValor = nodoSeleccionadoPanel.querySelector(".conversion-valor");
  const selMoneda = nodoSeleccionadoPanel.querySelector(".conversion-moneda");
  const selOrigen = nodoSeleccionadoPanel.querySelector(".conversion-origen");

  if(inputValor) inputValor.value = valor;
  if(selMoneda) selMoneda.value = moneda;
  if(selOrigen) selOrigen.value = origen;

  syncConversionDataToNodo(nodoSeleccionadoPanel);
}

function guardarPanelNodo(){
  if(!nodoSeleccionadoPanel || !document.body.contains(nodoSeleccionadoPanel)) return;

  registrarHistorialBuilder();

  if(nodoSeleccionadoPanel.dataset.tipo === "conversion"){
    guardarPanelConversion();
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

  if(window.MacBotIA && window.MacBotIA.clearPanelActivo){
    window.MacBotIA.clearPanelActivo();
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

  if(window.MacBotIA && window.MacBotIA.flushPanelToNode){
    window.MacBotIA.flushPanelToNode();
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

    if(item.className && item.className.includes("follow-node")){
      try{
        if(window.MacBotSeguimiento){
          window.MacBotSeguimiento.refrescarNodoCargado(nodo);
        }
      } catch (err) {
        console.warn("Seguimiento: error al restaurar nodo", err.message);
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
      (item.className && item.className.includes("ia-node")) ||
      item.tipo === "ia" ||
      (item.html && item.html.includes("ia-data"))
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