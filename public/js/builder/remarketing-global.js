/**
 * MacBot — Nodo cerebro: Remarketing Global 24h (Fase 1)
 * No avanza el flujo; configuración global del flujo.
 */
window.MacBotRemarketingGlobal = (function () {
  function crearConfigVacia() {
    return {
      version: 1,
      activo: false,
      tiempoInactividad: { valor: 23, unidad: "horas" },
      horasInactividad: 23,
      detenerSiResponde: false,
      reiniciarAlResponder: true,
      detenerEnConversion: true,
      mensajeRemarketing: "",
      rm24h_contenidos: [],
      modoContextual: false,
      rm_context_policy: {
        mode: "until_conversion",
        duration: { value: 24, unit: "hours" },
      },
    };
  }

  function crearAgenteRapidoVacio() {
    const mensajeFallback =
      "Te ayudo 😊 ¿quieres que te pase el precio o los métodos de pago?";
    return {
      type: "agente_rapido",
      id: crearUidAgenteRapidoRoot(),
      activo: false,
      modo: "caminos",
      mensajeBase: "",
      caminos: [],
      default: {
        respuesta: mensajeFallback,
        next: [],
      },
      comportamiento: {
        responderSiNoCoincide: true,
        mensajeFallback: mensajeFallback,
        activarOtrosFlujos: false,
        responderConAudio: false,
      },
      caminoDefault: {
        respuestaDefault: mensajeFallback,
        accionSiguienteDefault: "responder_y_seguir",
      },
    };
  }

  /** Normaliza un mini nodo RM almacenado en caminos[].next (mismo catálogo que el flujo principal). */
  function normalizarNodoRamaAgenteRapido(item) {
    if (!item || typeof item !== "object") return null;
    const tipo = String(item.type || item.tipo || "").toLowerCase();
    if (!tipo) return null;
    const cat = getCatalogoNodoRm24(tipo);
    if (!cat) return null;
    let config =
      item.config && typeof item.config === "object" ? Object.assign({}, item.config) : {};
    if (tipo === "lector_pagos") {
      config = normalizarLectorPagosNodo({ type: "lector_pagos", config: config }).config;
    }
    if (tipo === "contenido") {
      config = normalizarConfigContenidoNodo(config);
    }
    if (tipo === "etiqueta") {
      config = normalizarEtiquetaConfig(config);
    }
    if (tipo === "conversion") {
      config = normalizarConversionConfig(config);
    }
    return {
      type: tipo,
      id: String(
        item.id ||
          (tipo === "conversion" ? crearUidNodoConversion() : crearUidNodoRamaAgenteRapido())
      ),
      config: config,
    };
  }

  function crearUidAgenteRapidoRoot() {
    return "rm_agent_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  }

  function crearUidNodoRamaAgenteRapido() {
    return "rm_rn_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  }

  function crearUidNodoConversion() {
    return "rm_conv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  }

  function palabrasClaveToArray(raw) {
    if (Array.isArray(raw)) {
      return raw.map(function (s) {
        return String(s || "").trim();
      }).filter(Boolean);
    }
    return String(raw || "")
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function palabrasClaveToString(raw) {
    return palabrasClaveToArray(raw).join(", ");
  }

  const RM24H_ACCIONES_SIGUIENTE = [
    { value: "responder_y_seguir", label: "Responder y seguir" },
    { value: "ir_a_lector_pago", label: "Ir a lector de pagos" },
    { value: "aplicar_etiqueta", label: "Aplicar etiqueta" },
    { value: "registrar_conversion", label: "Registrar conversión" },
    { value: "finalizar_rm", label: "Finalizar RM" },
  ];

  const RM24H_ETIQUETA_COLORES = [
    { value: "red", label: "Rojo", hex: "#ef4444" },
    { value: "orange", label: "Naranja", hex: "#f97316" },
    { value: "yellow", label: "Amarillo", hex: "#eab308" },
    { value: "lime", label: "Lima", hex: "#84cc16" },
    { value: "green", label: "Verde", hex: "#22c55e" },
    { value: "turquoise", label: "Turquesa", hex: "#14b8a6" },
    { value: "cyan", label: "Cyan", hex: "#06b6d4" },
    { value: "blue", label: "Azul", hex: "#3b82f6" },
    { value: "indigo", label: "Índigo", hex: "#6366f1" },
    { value: "purple", label: "Morado", hex: "#a855f7" },
    { value: "pink", label: "Rosa", hex: "#ec4899" },
    { value: "brown", label: "Marrón", hex: "#92400e" },
    { value: "gray", label: "Gris", hex: "#6b7280" },
    { value: "black", label: "Negro", hex: "#1f2937" },
  ];

  const RM24H_ETIQUETA_ACCIONES = [
    { value: "add", label: "Añadir etiqueta" },
    { value: "remove", label: "Quitar etiqueta" },
  ];

  const RM24H_CONVERSION_MONEDAS = ["Bs", "USD", "MXN", "CLP", "COP", "PEN", "ARS"];

  const RM24H_CONVERSION_TIPOS = [
    { value: "venta", label: "Venta" },
    { value: "upsell", label: "Upsell" },
    { value: "downsell", label: "Downsell" },
    { value: "recuperacion", label: "Recuperación" },
  ];

  const RM24H_CONVERSION_DESPUES = [
    { value: "finalizar_rm", label: "Finalizar RM" },
    { value: "continuar", label: "Continuar al siguiente nodo" },
  ];

  function crearEtiquetaConfigVacia() {
    return { nombre: "", color: "orange", accion: "add" };
  }

  function normalizarEtiquetaColor(val) {
    const v = String(val || "orange")
      .toLowerCase()
      .trim();
    return RM24H_ETIQUETA_COLORES.some(function (c) {
      return c.value === v;
    })
      ? v
      : "orange";
  }

  function normalizarEtiquetaAccion(val) {
    const v = String(val || "add")
      .toLowerCase()
      .trim();
    return RM24H_ETIQUETA_ACCIONES.some(function (a) {
      return a.value === v;
    })
      ? v
      : "add";
  }

  function normalizarEtiquetaConfig(raw) {
    const cfg = raw && typeof raw === "object" ? raw : {};
    return {
      nombre: String(cfg.nombre ?? "").trim(),
      color: normalizarEtiquetaColor(cfg.color),
      accion: normalizarEtiquetaAccion(cfg.accion),
    };
  }

  function getEtiquetaColorHex(colorKey) {
    const v = normalizarEtiquetaColor(colorKey);
    const found = RM24H_ETIQUETA_COLORES.find(function (c) {
      return c.value === v;
    });
    return found ? found.hex : "#f97316";
  }

  function etiquetaRmAccionLabel(val) {
    const v = normalizarEtiquetaAccion(val);
    const found = RM24H_ETIQUETA_ACCIONES.find(function (a) {
      return a.value === v;
    });
    return found ? found.label : v;
  }

  function crearConversionConfigVacia() {
    return {
      nombre: "",
      producto: "",
      valor: 0,
      moneda: "Bs",
      tipo: "venta",
      despues: "finalizar_rm",
    };
  }

  function normalizarConversionMoneda(val) {
    const v = String(val || "Bs").trim();
    return RM24H_CONVERSION_MONEDAS.indexOf(v) >= 0 ? v : "Bs";
  }

  function normalizarConversionTipo(val) {
    const v = String(val || "venta")
      .toLowerCase()
      .trim();
    return RM24H_CONVERSION_TIPOS.some(function (t) {
      return t.value === v;
    })
      ? v
      : "venta";
  }

  function normalizarConversionDespues(val) {
    const v = String(val || "finalizar_rm")
      .toLowerCase()
      .trim();
    return RM24H_CONVERSION_DESPUES.some(function (d) {
      return d.value === v;
    })
      ? v
      : "finalizar_rm";
  }

  function normalizarConversionConfig(raw) {
    const cfg = raw && typeof raw === "object" ? raw : {};
    const valorRaw = parseFloat(cfg.valor);
    return {
      nombre: String(cfg.nombre ?? "").trim(),
      producto: String(cfg.producto ?? "").trim(),
      valor: Number.isFinite(valorRaw) && valorRaw >= 0 ? valorRaw : 0,
      moneda: normalizarConversionMoneda(cfg.moneda),
      tipo: normalizarConversionTipo(cfg.tipo),
      despues: normalizarConversionDespues(cfg.despues),
    };
  }

  function conversionRmTipoLabel(val) {
    const v = normalizarConversionTipo(val);
    const found = RM24H_CONVERSION_TIPOS.find(function (t) {
      return t.value === v;
    });
    return found ? found.label : v;
  }

  function conversionRmDespuesLabel(val) {
    const v = normalizarConversionDespues(val);
    const found = RM24H_CONVERSION_DESPUES.find(function (d) {
      return d.value === v;
    });
    return found ? found.label : v;
  }

  function conversionRmEstaConfigurada(cfg) {
    const norm = normalizarConversionConfig(cfg);
    return norm.nombre.length > 0;
  }

  function conversionRmResumenValor(cfg) {
    const norm = normalizarConversionConfig(cfg);
    if (!norm.valor && norm.valor !== 0) return "";
    return String(norm.valor) + " " + norm.moneda;
  }

  function crearUidCaminoAgenteRapido() {
    return "rm_ar_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  }

  function crearCaminoAgenteRapidoVacio() {
    return {
      id: crearUidCaminoAgenteRapido(),
      nombre: "",
      nombreCamino: "",
      palabrasClave: [],
      descripcionIntencion: "",
      respuesta: "",
      accionSiguiente: "responder_y_seguir",
      activo: true,
      enabled: true,
      next: [],
    };
  }

  function normalizarAccionSiguiente(val) {
    const v = String(val || "responder_y_seguir").trim();
    return RM24H_ACCIONES_SIGUIENTE.some(function (a) {
      return a.value === v;
    })
      ? v
      : "responder_y_seguir";
  }

  function etiquetaAccionSiguiente(val) {
    const v = normalizarAccionSiguiente(val);
    const found = RM24H_ACCIONES_SIGUIENTE.find(function (a) {
      return a.value === v;
    });
    return found ? found.label : v;
  }

  function mapearCaminoAgenteRapidoUi(item) {
    if (!item || typeof item !== "object") return null;
    const nombre = String(item.nombre ?? item.texto ?? item.nombreCamino ?? "");
    const palabrasArr = palabrasClaveToArray(
      item.palabrasClave ?? item.sinonimos ?? item.synonyms ?? item.keywords
    );
    const next = [];
    if (Array.isArray(item.next)) {
      item.next.forEach(function (n) {
        const norm = normalizarNodoRamaAgenteRapido(n);
        if (norm) next.push(norm);
      });
    }
    return {
      id: String(item.id || crearUidCaminoAgenteRapido()),
      nombre: nombre,
      texto: nombre,
      nombreCamino: nombre,
      palabrasClave: palabrasArr,
      sinonimos: palabrasArr.join(", "),
      descripcionIntencion: String(item.descripcionIntencion ?? item.descripcion ?? ""),
      respuesta: String(item.respuesta ?? ""),
      accionSiguiente: normalizarAccionSiguiente(item.accionSiguiente),
      activo: item.activo !== false && item.enabled !== false,
      enabled: item.activo !== false && item.enabled !== false,
      next: next,
    };
  }

  function normalizarComportamientoAgenteRapido(raw, defRaw) {
    const base = crearAgenteRapidoVacio().comportamiento;
    const comp = raw?.comportamiento && typeof raw.comportamiento === "object" ? raw.comportamiento : {};
    const fallback =
      comp.mensajeFallback ||
      defRaw?.respuestaDefault ||
      raw?.caminoDefault?.respuestaDefault ||
      base.mensajeFallback;
    return {
      responderSiNoCoincide: comp.responderSiNoCoincide !== false,
      mensajeFallback: String(fallback),
      activarOtrosFlujos: !!comp.activarOtrosFlujos,
      responderConAudio: !!comp.responderConAudio,
    };
  }

  function sincronizarCaminoDefaultDesdeComportamiento(ar) {
    const comp = ar.comportamiento || crearAgenteRapidoVacio().comportamiento;
    const respuesta = String(comp.mensajeFallback || "");
    if (!ar.default || typeof ar.default !== "object") {
      ar.default = { respuesta: respuesta, next: [] };
    } else {
      ar.default.respuesta = respuesta;
      if (!Array.isArray(ar.default.next)) ar.default.next = [];
    }
    ar.caminoDefault = {
      respuestaDefault: respuesta,
      accionSiguienteDefault: normalizarAccionSiguiente(
        ar.caminoDefault?.accionSiguienteDefault || "responder_y_seguir"
      ),
    };
    return ar;
  }

  function normalizarDefaultAgenteRapido(raw, comportamiento) {
    const base = crearAgenteRapidoVacio().default;
    const src =
      raw?.default && typeof raw.default === "object"
        ? raw.default
        : raw?.caminoDefault && typeof raw.caminoDefault === "object"
          ? { respuesta: raw.caminoDefault.respuestaDefault, next: raw.default?.next }
          : {};
    const next = [];
    if (Array.isArray(src.next)) {
      src.next.forEach(function (n) {
        const norm = normalizarNodoRamaAgenteRapido(n);
        if (norm) next.push(norm);
      });
    }
    return {
      respuesta: String(
        src.respuesta ?? comportamiento?.mensajeFallback ?? base.respuesta
      ),
      next: next,
    };
  }

  function normalizarAgenteRapidoConfig(raw) {
    const base = crearAgenteRapidoVacio();
    if (!raw || typeof raw !== "object") return base;

    const caminos = [];
    if (Array.isArray(raw.caminos)) {
      raw.caminos.forEach(function (item) {
        const m = mapearCaminoAgenteRapidoUi(item);
        if (m) caminos.push(m);
      });
    }

    const defRaw = raw.caminoDefault && typeof raw.caminoDefault === "object" ? raw.caminoDefault : {};
    const comportamiento = normalizarComportamientoAgenteRapido(raw, defRaw);
    const defaultRama = normalizarDefaultAgenteRapido(raw, comportamiento);
    const result = {
      type: "agente_rapido",
      id: String(raw.id || crearUidAgenteRapidoRoot()),
      activo: raw.activo === true,
      modo: "caminos",
      mensajeBase: String(raw.mensajeBase ?? raw.instrucciones ?? ""),
      caminos: caminos,
      default: defaultRama,
      comportamiento: comportamiento,
      caminoDefault: {
        respuestaDefault: defaultRama.respuesta,
        accionSiguienteDefault: normalizarAccionSiguiente(
          defRaw.accionSiguienteDefault ?? "responder_y_seguir"
        ),
      },
    };
    return sincronizarCaminoDefaultDesdeComportamiento(result);
  }

  function resumenCaminosAgenteRapidoEmbudo(arRaw) {
    const ar = normalizarAgenteRapidoConfig(arRaw);
    const caminos = (ar.caminos || []).filter(function (c) {
      return String(c.nombre || c.nombreCamino || c.texto || "").trim();
    });
    const activos = caminos.filter(function (c) {
      return c.activo !== false && c.enabled !== false;
    });
    const total = caminos.length;
    if (!total) return "0 caminos";
    if (activos.length === total) {
      return activos.length + " camino" + (activos.length === 1 ? "" : "s") + " activos";
    }
    return (
      activos.length +
      " activo" +
      (activos.length === 1 ? "" : "s") +
      " · " +
      total +
      " total"
    );
  }

  function agenteRapidoFallbackActivo(arRaw) {
    const ar = normalizarAgenteRapidoConfig(arRaw);
    return ar.comportamiento?.responderSiNoCoincide !== false;
  }

  function resumenAgenteRapidoEmbudo(arRaw) {
    return resumenCaminosAgenteRapidoEmbudo(arRaw);
  }

  const RM24H_LECTOR_MONEDAS = ["Bs", "USD", "MXN", "CLP", "COP", "PEN", "ARS"];

  function crearUidLectorPagos() {
    return "rm_pay_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  }

  function crearLectorPagosConfigVacia() {
    return {
      activo: false,
      producto: "",
      nombreEsperado: "",
      montoEsperado: 0,
      moneda: "Bs",
      linkEntrega: "",
      verificarNombre: true,
      verificarMonto: true,
      verificarFecha: false,
      revisionManualSiFalla: true,
      mensajePagoNoValido:
        "No pude validar el comprobante 😅 ¿puedes enviarlo más claro?",
      tiempoMaximoEspera: { valor: 24, unidad: "horas" },
    };
  }

  function normalizarUnidadTiempoEsperaLector(unidad) {
    const s = String(unidad || "")
      .toLowerCase()
      .trim();
    if (s === "minuto" || s === "minutos" || s === "min") return "minutos";
    if (s === "hora" || s === "horas" || s === "h") return "horas";
    if (s === "dia" || s === "días" || s === "dias" || s === "day" || s === "days") {
      return "dias";
    }
    return null;
  }

  function normalizarTiempoMaximoEsperaLector(raw) {
    const fallback = { valor: 24, unidad: "horas" };
    if (!raw || typeof raw !== "object") return { ...fallback };
    const unidad = normalizarUnidadTiempoEsperaLector(raw.unidad) || fallback.unidad;
    const valor = parseInt(raw.valor, 10);
    if (!Number.isFinite(valor) || valor < 1) return { valor: fallback.valor, unidad: unidad };
    return { valor: valor, unidad: unidad };
  }

  function normalizarMonedaLectorPagos(val) {
    const v = String(val || "Bs").trim();
    return RM24H_LECTOR_MONEDAS.indexOf(v) >= 0 ? v : "Bs";
  }

  function normalizarLectorPagosConfig(raw) {
    const base = crearLectorPagosConfigVacia();
    if (!raw || typeof raw !== "object") return base;
    const monto = parseFloat(raw.montoEsperado ?? raw.monto_esperado);
    return {
      activo: raw.activo === true,
      producto: String(raw.producto ?? "").trim(),
      nombreEsperado: String(raw.nombreEsperado ?? raw.nombre_esperado ?? "").trim(),
      montoEsperado: Number.isFinite(monto) && monto >= 0 ? monto : base.montoEsperado,
      moneda: normalizarMonedaLectorPagos(raw.moneda ?? raw.monedaEsperada),
      linkEntrega: String(raw.linkEntrega ?? raw.link_entrega ?? raw.productoUrl ?? "").trim(),
      verificarNombre: raw.verificarNombre !== false,
      verificarMonto: raw.verificarMonto !== false,
      verificarFecha: raw.verificarFecha === true,
      revisionManualSiFalla: raw.revisionManualSiFalla !== false,
      mensajePagoNoValido: String(
        raw.mensajePagoNoValido ?? base.mensajePagoNoValido
      ).trim(),
      tiempoMaximoEspera: normalizarTiempoMaximoEsperaLector(
        raw.tiempoMaximoEspera || raw.tiempo_maximo_espera
      ),
    };
  }

  function normalizarLectorPagosNodo(raw) {
    if (!raw || typeof raw !== "object") {
      return {
        type: "lector_pagos",
        id: crearUidLectorPagos(),
        config: crearLectorPagosConfigVacia(),
      };
    }
    return {
      type: "lector_pagos",
      id: String(raw.id || crearUidLectorPagos()),
      config: normalizarLectorPagosConfig(raw.config),
    };
  }

  function lectorPagosTieneConfig(cfg) {
    return !!(cfg && cfg.rm24h_lector_pagos && typeof cfg.rm24h_lector_pagos === "object");
  }

  function lectorPagosEstaConfigurado(lpRaw) {
    const lp = normalizarLectorPagosNodo(lpRaw);
    const c = lp.config;
    return (
      c.activo ||
      String(c.producto || "").trim().length > 0 ||
      String(c.nombreEsperado || "").trim().length > 0 ||
      (Number.isFinite(c.montoEsperado) && c.montoEsperado > 0)
    );
  }

  function resumenLectorPagosEmbudo(lpRaw) {
    const lp = normalizarLectorPagosNodo(lpRaw);
    const c = lp.config;
    if (!lectorPagosEstaConfigurado(lp)) {
      return "Configurar validación de pago";
    }
    const partes = [];
    if (String(c.producto || "").trim()) {
      partes.push("Producto: " + String(c.producto).trim());
    }
    if (String(c.nombreEsperado || "").trim()) {
      partes.push("Nombre: " + String(c.nombreEsperado).trim());
    }
    if (Number.isFinite(c.montoEsperado) && c.montoEsperado > 0) {
      partes.push("Monto: " + c.montoEsperado + " " + c.moneda);
    }
    if (c.activo) {
      partes.push("OCR activo");
    }
    return partes.length ? partes.join(" · ") : "Configurar validación de pago";
  }

  function previewTextoCorto(texto, max) {
    const t = String(texto || "").trim();
    if (!t) return "";
    const n = max || 48;
    return t.length > n ? t.slice(0, n) + "…" : t;
  }

  /** Tipos con editor real en el panel (sin placeholder). */
  function nodoRmTieneEditor(tipo) {
    const t = String(tipo || "").toLowerCase();
    return (
      t === "contenido" ||
      t === "agente_rapido" ||
      t === "lector_pagos" ||
      t === "etiqueta" ||
      t === "conversion"
    );
  }

  function crearMiniNodoContextMain(uid, nodeIndex, total) {
    return { scope: "main", uid: uid, nodeIndex: nodeIndex, total: total };
  }

  function crearMiniNodoContextBranch(ramaKey, nodeId, nodeIndex, total) {
    return {
      scope: "branch",
      ramaKey: ramaKey,
      nodeId: nodeId,
      nodeIndex: nodeIndex,
      total: total,
    };
  }

  function miniNodoSelectId(context) {
    if (context.scope === "branch") {
      return idSeleccionNodoRama(context.ramaKey, context.nodeId);
    }
    return context.uid;
  }

  function resumenNodoMiniRm(node, context, contenidosRaw) {
    const tipo = String(node?.type || node?.tipo || "").toLowerCase();
    if (tipo === "contenido") {
      if (context?.scope === "branch") {
        const cfg = normalizarConfigContenidoNodo(node.config);
        const resumen = resumenContenidoEmbudo(cfg.contenidos);
        return resumen.vacio ? "Sin contenido configurado" : resumen.linea;
      }
      const resumen = resumenContenidoEmbudo(contenidosRaw || []);
      return resumen.vacio ? "Sin contenido configurado" : resumen.linea;
    }
    if (tipo === "agente_rapido") {
      return resumenAgenteRapidoEmbudo(configActiva.rm24h_agente_rapido);
    }
    if (tipo === "lector_pagos") {
      const lp =
        context?.scope === "branch"
          ? normalizarLectorPagosNodo({
              type: "lector_pagos",
              id: node.id,
              config: node.config,
            })
          : configActiva.rm24h_lector_pagos;
      return resumenLectorPagosEmbudo(lp);
    }
    if (tipo === "etiqueta") {
      const cfg = getEtiquetaConfigDesdeNodo(node, context);
      if (!cfg.nombre) return "Sin nombre";
      return cfg.nombre + " · " + etiquetaRmAccionLabel(cfg.accion);
    }
    if (tipo === "conversion") {
      const cfg = getConversionConfigDesdeNodo(node, context);
      if (!conversionRmEstaConfigurada(cfg)) return "Configurar conversión";
      return cfg.nombre + " · " + conversionRmResumenValor(cfg);
    }
    if (!nodoRmTieneEditor(tipo)) {
      return "Sin configurar";
    }
    return "Listo";
  }

  function resumenMiniNodoRmMuted(resumen) {
    return (
      resumen === "Sin contenido configurado" ||
      resumen === "0 caminos" ||
      resumen === "Configurar validación de pago" ||
      resumen === "Sin configurar" ||
      resumen === "Sin nombre" ||
      resumen === "Configurar conversión"
    );
  }

  function getEtiquetaConfigDesdeNodo(node, context) {
    if (context?.scope === "branch") {
      return normalizarEtiquetaConfig(node?.config);
    }
    const uid = context?.uid || node?.uid;
    if (uid) {
      const n = getMiniFlujoNodo(uid);
      if (n && n.tipo === "etiqueta") {
        return normalizarEtiquetaConfig(n.config);
      }
    }
    return normalizarEtiquetaConfig(node?.config);
  }

  function getConversionConfigDesdeNodo(node, context) {
    if (context?.scope === "branch") {
      return normalizarConversionConfig(node?.config);
    }
    const uid = context?.uid || node?.uid;
    if (uid) {
      const n = getMiniFlujoNodo(uid);
      if (n && n.tipo === "conversion") {
        return normalizarConversionConfig(n.config);
      }
    }
    return normalizarConversionConfig(node?.config);
  }

  function htmlRmConversionValorBadge(valor, moneda, opts) {
    const o = opts || {};
    const norm = normalizarConversionConfig({ valor: valor, moneda: moneda });
    const texto = conversionRmResumenValor(norm);
    const cls =
      "rm24-conversion-valor-badge" +
      (o.compact ? " rm24-conversion-valor-badge--compact" : "") +
      (!texto ? " rm24-conversion-valor-badge--empty" : "");
    return (
      '<span class="' +
      cls +
      '">' +
      esc(texto || "—") +
      "</span>"
    );
  }

  function htmlRmEtiquetaBadge(nombre, colorKey, opts) {
    const o = opts || {};
    const cfg = normalizarEtiquetaConfig({ nombre: nombre, color: colorKey });
    const hex = getEtiquetaColorHex(cfg.color);
    const label = cfg.nombre || "Sin nombre";
    const cls =
      "rm24-etiqueta-badge" +
      (o.compact ? " rm24-etiqueta-badge--compact" : "") +
      (!cfg.nombre ? " rm24-etiqueta-badge--empty" : "");
    return (
      '<span class="' +
      cls +
      '" style="--rm24-etiqueta-color:' +
      esc(hex) +
      '">' +
      esc(label) +
      "</span>"
    );
  }

  function htmlRmEtiquetaColorSwatches(selectedColor) {
    const sel = normalizarEtiquetaColor(selectedColor);
    return (
      '<div class="rm24-etiqueta-swatches" role="radiogroup" aria-label="Color de etiqueta">' +
      RM24H_ETIQUETA_COLORES.map(function (c) {
        const active = c.value === sel ? " rm24-etiqueta-swatch--active" : "";
        return (
          '<button type="button" class="rm24-etiqueta-swatch' +
          active +
          '" role="radio"' +
          (c.value === sel ? ' aria-checked="true"' : ' aria-checked="false"') +
          ' data-rm24-etiqueta-color="' +
          esc(c.value) +
          '" title="' +
          esc(c.label) +
          '" style="--rm24-swatch-color:' +
          esc(c.hex) +
          '">' +
          '<span class="rm24-etiqueta-swatch-check" aria-hidden="true">✓</span></button>'
        );
      }).join("") +
      "</div>"
    );
  }

  function htmlRmEtiquetaAccionToggle(selectedAccion) {
    const sel = normalizarEtiquetaAccion(selectedAccion);
    return (
      '<div class="rm24-etiqueta-acciones" role="radiogroup" aria-label="Acción de etiqueta">' +
      RM24H_ETIQUETA_ACCIONES.map(function (a) {
        const active = a.value === sel ? " rm24-etiqueta-accion-btn--active" : "";
        return (
          '<button type="button" class="rm24-etiqueta-accion-btn' +
          active +
          '" role="radio"' +
          (a.value === sel ? ' aria-checked="true"' : ' aria-checked="false"') +
          ' data-rm24-etiqueta-accion="' +
          esc(a.value) +
          '">' +
          esc(a.label) +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }

  function encodeCaminoInsertKey(ramaKey, insertIndex) {
    return "camino:" + ramaKey + ":" + insertIndex;
  }

  function parseWfInsertKey(raw) {
    const s = String(raw ?? "");
    if (s.indexOf("camino:") === 0) {
      const rest = s.slice("camino:".length);
      const sep = rest.lastIndexOf(":");
      if (sep < 0) return { scope: "camino", ramaKey: rest, index: 0 };
      return {
        scope: "camino",
        ramaKey: rest.slice(0, sep),
        index: parseInt(rest.slice(sep + 1), 10) || 0,
      };
    }
    return { scope: "main", index: parseInt(s, 10) || 0 };
  }

  function idSeleccionRamaCamino(caminoId) {
    return "ar_camino:" + caminoId;
  }

  function idSeleccionRamaDefault() {
    return "ar_default";
  }

  function idSeleccionNodoRama(ramaKey, nodeId) {
    return "ar_node:" + ramaKey + ":" + nodeId;
  }

  function parseSeleccionAgenteRapido(sel) {
    const s = String(sel || "");
    if (s.indexOf("ar_camino:") === 0) {
      return { kind: "camino", caminoId: s.slice("ar_camino:".length) };
    }
    if (s === "ar_default") return { kind: "default" };
    if (s.indexOf("ar_node:") === 0) {
      const rest = s.slice("ar_node:".length);
      const idx = rest.indexOf(":");
      if (idx < 0) return null;
      return { kind: "node", ramaKey: rest.slice(0, idx), nodeId: rest.slice(idx + 1) };
    }
    return null;
  }

  function esSeleccionAgenteRapido(sel) {
    return !!parseSeleccionAgenteRapido(sel);
  }

  function htmlWfCard(opts) {
    const o = opts || {};
    const tag = o.tag || "button";
    const typeAttr = tag === "button" ? ' type="button"' : "";
    const draggable = o.draggable ? ' draggable="true"' : "";
    let cls =
      "rm24-wf-card" +
      (o.kind ? " rm24-wf-card--" + o.kind : "") +
      (o.mod ? " rm24-wf-card--" + o.mod : "") +
      (o.selected ? " rm24-wf-card--selected" : "") +
      (o.dragging ? " rm24-wf-card--dragging" : "") +
      (o.small ? " rm24-wf-card--sm" : "");
    const attrs = o.attrs || "";
    return (
      "<" +
      tag +
      typeAttr +
      ' class="' +
      cls +
      '"' +
      draggable +
      (o.selected ? ' aria-current="step"' : "") +
      " " +
      attrs +
      ">" +
      (o.selected && o.showEditingPill
        ? '<span class="rm24-wf-editing-pill">Editando</span>'
        : "") +
      (o.futureBadge ? '<span class="rm24-wf-ui-badge">solo UI</span>' : "") +
      '<span class="rm24-wf-card-icon" aria-hidden="true">' +
      (o.icon || "📎") +
      "</span>" +
      '<span class="rm24-wf-card-body">' +
      '<span class="rm24-wf-card-title">' +
      esc(o.title || "") +
      "</span>" +
      (o.subtitle
        ? '<span class="rm24-wf-card-sub' +
          (o.subtitleMuted ? " rm24-wf-card-sub--muted" : "") +
          '">' +
          esc(o.subtitle) +
          "</span>"
        : "") +
      (o.hint ? '<span class="rm24-wf-card-hint">' + esc(o.hint) + "</span>" : "") +
      (o.extraHtml ? o.extraHtml : "") +
      (o.innerBadge
        ? '<span class="rm24-wf-fallback-badge">' + esc(o.innerBadge) + "</span>"
        : "") +
      "</span></" +
      tag +
      ">"
    );
  }

  function htmlWfStepActions(actionsHtml) {
    if (!actionsHtml) return "";
    return (
      '<div class="rm24-wf-step-actions" aria-label="Acciones del nodo">' +
      actionsHtml +
      "</div>"
    );
  }

  function htmlWfMiniFlujoAddMenuItems(insertKey) {
    const key = String(insertKey);
    return RM24H_NODO_TIPOS.map(function (c) {
      return (
        '<button type="button" class="rm24-wf-add-item" role="menuitem" data-add-nodo-tipo="' +
        esc(c.tipo) +
        '" data-rm24-wf-insert="' +
        esc(key) +
        '">' +
        '<span class="rm24-wf-add-icon" aria-hidden="true">' +
        c.icon +
        "</span>" +
        '<span class="rm24-wf-add-label">' +
        esc(c.label) +
        "</span></button>"
      );
    }).join("");
  }

  function htmlWfJunction(insertIndex, opts) {
    const o = opts || {};
    const key = o.caminoRamaKey
      ? encodeCaminoInsertKey(o.caminoRamaKey, insertIndex)
      : String(insertIndex);
    const branchClass = o.caminoRamaKey ? " rm24-wf-junction--branch" : "";
    return (
      '<div class="rm24-wf-junction' +
      branchClass +
      '" data-rm24-wf-junction="' +
      esc(key) +
      '">' +
      '<div class="rm24-wf-junction-line" aria-hidden="true"></div>' +
      '<div class="rm24-wf-junction-add-wrap">' +
      '<button type="button" class="rm24-wf-junction-add" data-rm24-wf-add-toggle="' +
      esc(key) +
      '" aria-expanded="false" aria-label="Añadir nodo">＋</button>' +
      '<div class="rm24-wf-junction-popover" data-rm24-wf-add-menu="' +
      esc(key) +
      '" hidden>' +
      '<div class="rm24-wf-junction-backdrop" data-rm24-wf-add-close="' +
      esc(key) +
      '" aria-hidden="true"></div>' +
      '<div class="rm24-wf-add-menu" role="menu">' +
      htmlWfMiniFlujoAddMenuItems(key) +
      "</div></div></div>" +
      '<div class="rm24-wf-junction-line" aria-hidden="true"></div>' +
      "</div>"
    );
  }

  function toggleWfAddMenu(insertKey, open) {
    const key = String(insertKey);
    document.querySelectorAll(".rm24-wf-junction-popover").forEach(function (el) {
      const menuKey = el.getAttribute("data-rm24-wf-add-menu");
      let show = false;
      if (menuKey === key) {
        show = typeof open === "boolean" ? open : !!el.hidden;
      }
      el.hidden = !show;
      el.parentElement?.classList.toggle("rm24-wf-junction-add-wrap--open", show);
    });
    if (typeof open === "boolean" && open) {
      document.querySelectorAll(".rm24-wf-junction-popover").forEach(function (el) {
        if (el.getAttribute("data-rm24-wf-add-menu") !== key) {
          el.hidden = true;
          el.parentElement?.classList.remove("rm24-wf-junction-add-wrap--open");
        }
      });
      toggleRm24AddPasoMenu(false);
    }
  }

  function toggleAllWfAddMenus(open) {
    document.querySelectorAll(".rm24-wf-junction-popover").forEach(function (el) {
      const show = typeof open === "boolean" ? open : false;
      el.hidden = !show;
      el.parentElement?.classList.toggle("rm24-wf-junction-add-wrap--open", show);
    });
  }

  function htmlWfCaminoNodeActions(ramaKey, nodeId, nodeIndex, total) {
    const selId = idSeleccionNodoRama(ramaKey, nodeId);
    return (
      '<button type="button" class="rm24-wf-action" data-rm24-ar-select="' +
      esc(selId) +
      '" title="Editar">✏</button>' +
      '<button type="button" class="rm24-wf-action" data-rm24-camino-move-up="' +
      esc(ramaKey) +
      '" data-rm24-ar-node-id="' +
      esc(nodeId) +
      '" title="Subir"' +
      (nodeIndex === 0 ? " disabled" : "") +
      ">↑</button>" +
      '<button type="button" class="rm24-wf-action" data-rm24-camino-move-down="' +
      esc(ramaKey) +
      '" data-rm24-ar-node-id="' +
      esc(nodeId) +
      '" title="Bajar"' +
      (nodeIndex >= total - 1 ? " disabled" : "") +
      ">↓</button>" +
      '<button type="button" class="rm24-wf-action rm24-wf-action--danger" data-rm24-ar-node-remove="' +
      esc(ramaKey) +
      '" data-rm24-ar-node-id="' +
      esc(nodeId) +
      '" title="Eliminar">×</button>'
    );
  }

  function htmlWfMiniNodoActions(context) {
    if (context.scope === "branch") {
      return htmlWfCaminoNodeActions(
        context.ramaKey,
        context.nodeId,
        context.nodeIndex,
        context.total
      );
    }
    return htmlWfNodeActions(context.uid, context.nodeIndex, context.total);
  }

  /** Render visual unificado de mini nodos RM (main y ramas). */
  function renderMiniNodoRm(node, context, opts) {
    const o = opts || {};
    const tipo = String(node?.type || node?.tipo || "").toLowerCase();
    if (context.scope === "main" && tipo === "agente_rapido") {
      return htmlMiniFlujoNodoAgenteRapido(
        { uid: context.uid, tipo: tipo },
        o.stepNum,
        o.resumen,
        o.selected,
        context.nodeIndex,
        context.total
      );
    }
    if (tipo === "etiqueta") {
      const cat = getCatalogoNodoRm24("etiqueta") || {
        icon: "🏷",
        label: "Etiqueta",
        kind: "action",
      };
      const selId = miniNodoSelectId(context);
      const selected =
        o.selected === selId || o.selected === true || rm24hBloqueSeleccionado === selId;
      const cfg = getEtiquetaConfigDesdeNodo(node, context);
      const dragging =
        context.scope === "main" && rm24hDragNodoIndex === context.nodeIndex;
      const attrs =
        context.scope === "branch"
          ? 'data-rm24-ar-select="' + esc(selId) + '"'
          : 'data-rm24-nodo-uid="' + esc(context.uid) + '"';
      return (
        '<div class="rm24-wf-step" role="listitem">' +
        '<div class="rm24-wf-step-inner">' +
        htmlWfCard({
          kind: cat.kind,
          icon: cat.icon,
          title: cat.label,
          subtitle: etiquetaRmAccionLabel(cfg.accion),
          subtitleMuted: !cfg.nombre,
          extraHtml: htmlRmEtiquetaBadge(cfg.nombre, cfg.color, { compact: true }),
          selected: selected,
          showEditingPill: true,
          dragging: dragging,
          draggable: context.scope === "main",
          attrs: attrs,
        }) +
        htmlWfStepActions(htmlWfMiniNodoActions(context)) +
        "</div></div>"
      );
    }
    if (tipo === "conversion") {
      const cat = getCatalogoNodoRm24("conversion") || {
        icon: "🎯",
        label: "Conversión",
        kind: "action",
      };
      const selId = miniNodoSelectId(context);
      const selected =
        o.selected === selId || o.selected === true || rm24hBloqueSeleccionado === selId;
      const cfg = getConversionConfigDesdeNodo(node, context);
      const configurada = conversionRmEstaConfigurada(cfg);
      const dragging =
        context.scope === "main" && rm24hDragNodoIndex === context.nodeIndex;
      const attrs =
        context.scope === "branch"
          ? 'data-rm24-ar-select="' + esc(selId) + '"'
          : 'data-rm24-nodo-uid="' + esc(context.uid) + '"';
      return (
        '<div class="rm24-wf-step" role="listitem">' +
        '<div class="rm24-wf-step-inner">' +
        htmlWfCard({
          kind: cat.kind,
          icon: cat.icon,
          title: cat.label,
          subtitle: configurada ? cfg.nombre : "Configurar conversión",
          subtitleMuted: !configurada,
          extraHtml: configurada
            ? htmlRmConversionValorBadge(cfg.valor, cfg.moneda, { compact: true })
            : "",
          selected: selected,
          showEditingPill: true,
          dragging: dragging,
          draggable: context.scope === "main",
          attrs: attrs,
        }) +
        htmlWfStepActions(htmlWfMiniNodoActions(context)) +
        "</div></div>"
      );
    }
    const cat = getCatalogoNodoRm24(tipo) || {
      icon: "📎",
      label: tipo,
      kind: "action",
    };
    const selId = miniNodoSelectId(context);
    const selected =
      o.selected === selId || o.selected === true || rm24hBloqueSeleccionado === selId;
    const resumen =
      o.resumen != null ? o.resumen : resumenNodoMiniRm(node, context, o.contenidosRaw);
    const muted = resumenMiniNodoRmMuted(resumen);
    const dragging =
      context.scope === "main" && rm24hDragNodoIndex === context.nodeIndex;
    const attrs =
      context.scope === "branch"
        ? 'data-rm24-ar-select="' + esc(selId) + '"'
        : 'data-rm24-nodo-uid="' + esc(context.uid) + '"';
    return (
      '<div class="rm24-wf-step" role="listitem">' +
      '<div class="rm24-wf-step-inner">' +
      htmlWfCard({
        kind: cat.kind,
        icon: cat.icon,
        title: cat.label,
        subtitle: resumen,
        subtitleMuted: muted,
        selected: selected,
        showEditingPill: true,
        futureBadge: !nodoRmTieneEditor(tipo),
        dragging: dragging,
        draggable: context.scope === "main",
        attrs: attrs,
      }) +
      htmlWfStepActions(htmlWfMiniNodoActions(context)) +
      "</div></div>"
    );
  }

  function htmlCaminoChainNode(nodo, ramaKey, nodeIndex, total, seleccionado) {
    return renderMiniNodoRm(
      nodo,
      crearMiniNodoContextBranch(ramaKey, nodo.id, nodeIndex, total),
      { selected: seleccionado }
    );
  }

  function htmlAgenteRapidoRamaCamino(camino, index, total, seleccionado) {
    const c = mapearCaminoAgenteRapidoUi(camino) || crearCaminoAgenteRapidoVacio();
    const ramaKey = c.id;
    const selCamino = seleccionado === idSeleccionRamaCamino(ramaKey);
    const nombre = String(c.nombre || c.nombreCamino || "Camino sin nombre").trim() || "Camino sin nombre";
    const palabras = palabrasClaveToString(c.palabrasClave);
    const respPreview = previewTextoCorto(c.respuesta, 42);
    const nextNodes = c.next || [];
    let html =
      '<div class="rm24-wf-fork-col" data-rm24-ar-rama-id="' +
      esc(ramaKey) +
      '">' +
      htmlWfCard({
        mod: "camino",
        kind: "action",
        icon: "🔀",
        title: "Camino: " + nombre,
        subtitle: palabras || "Sin palabras clave",
        subtitleMuted: !palabras,
        hint: respPreview || "",
        selected: selCamino,
        showEditingPill: false,
        attrs: 'data-rm24-ar-select="' + esc(idSeleccionRamaCamino(ramaKey)) + '"',
      }) +
      '<div class="rm24-wf-col-chain">';
    html += htmlWfJunction(0, { caminoRamaKey: ramaKey });
    nextNodes.forEach(function (n, i) {
      html += htmlCaminoChainNode(n, ramaKey, i, nextNodes.length, seleccionado);
      html += htmlWfJunction(i + 1, { caminoRamaKey: ramaKey });
    });
    html += "</div></div>";
    return html;
  }

  function htmlAgenteRapidoRamasTree(arRaw, seleccionado) {
    const ar = normalizarAgenteRapidoConfig(arRaw);
    const caminos = ar.caminos || [];
    if (!caminos.length) return "";
    const colCount = Math.max(caminos.length, 1);
    let html =
      '<div class="rm24-wf-fork" aria-label="Caminos del Agente rápido" style="--rm24-fork-cols:' +
      colCount +
      '">' +
      '<div class="rm24-wf-fork-rail" aria-hidden="true">' +
      '<div class="rm24-wf-fork-stem"></div>' +
      '<div class="rm24-wf-fork-bar"></div></div>' +
      '<div class="rm24-wf-fork-columns">';
    caminos.forEach(function (camino, index) {
      html += htmlAgenteRapidoRamaCamino(camino, index, caminos.length, seleccionado);
    });
    html += "</div></div>";
    return html;
  }

  function contarNodosRamaAgenteRapido(arRaw) {
    const ar = normalizarAgenteRapidoConfig(arRaw);
    let n = 0;
    (ar.caminos || []).forEach(function (c) {
      n += (c.next || []).length;
    });
    return n;
  }

  function getCaminoAgenteRapidoPorRamaKey(ramaKey) {
    const ar = getAgenteRapidoActivo();
    if (ramaKey === "default") return null;
    return (ar.caminos || []).find(function (c) {
      return c.id === ramaKey;
    });
  }

  function getNextArrayPorRamaKey(ramaKey) {
    const ar = getAgenteRapidoActivo();
    if (ramaKey === "default") {
      if (!ar.default) ar.default = { respuesta: "", next: [] };
      if (!Array.isArray(ar.default.next)) ar.default.next = [];
      return ar.default.next;
    }
    const camino = getCaminoAgenteRapidoPorRamaKey(ramaKey);
    if (!camino) return null;
    if (!Array.isArray(camino.next)) camino.next = [];
    return camino.next;
  }

  function addNodoEnCaminoAt(ramaKey, insertIndex, tipo) {
    const insertKey = encodeCaminoInsertKey(ramaKey, insertIndex);
    toggleWfAddMenu(insertKey, false);
    syncAgenteRapidoDesdePanel();
    const cat = getCatalogoNodoRm24(String(tipo || "").toLowerCase());
    if (!cat) return;
    const lista = getNextArrayPorRamaKey(ramaKey);
    if (!lista) return;
    const norm = normalizarNodoRamaAgenteRapido({
      type: cat.tipo,
      id:
        cat.tipo === "conversion"
          ? crearUidNodoConversion()
          : crearUidNodoRamaAgenteRapido(),
      config:
        cat.tipo === "contenido"
          ? normalizarConfigContenidoNodo({})
          : cat.tipo === "lector_pagos"
            ? normalizarLectorPagosNodo(null).config
            : cat.tipo === "etiqueta"
              ? normalizarEtiquetaConfig({})
              : cat.tipo === "conversion"
                ? normalizarConversionConfig({})
                : {},
    });
    if (!norm) return;
    const idx = Math.max(0, Math.min(Number(insertIndex) || 0, lista.length));
    lista.splice(idx, 0, norm);
    configActiva.rm24h_agente_rapido = getAgenteRapidoActivo();
    rm24hBloqueSeleccionado = idSeleccionNodoRama(ramaKey, norm.id);
    persistirConfigPanelEnNodo();
    renderRm24BloqueEditor();
    actualizarEmbudoRmPanel();
  }

  function removeNodoEnRamaAgenteRapido(ramaKey, nodeId) {
    syncAgenteRapidoDesdePanel();
    const lista = getNextArrayPorRamaKey(ramaKey);
    if (!lista) return;
    const idx = lista.findIndex(function (n) {
      return n.id === nodeId;
    });
    if (idx < 0) return;
    lista.splice(idx, 1);
    if (rm24hBloqueSeleccionado === idSeleccionNodoRama(ramaKey, nodeId)) {
      rm24hBloqueSeleccionado = ramaKey === "default"
        ? idSeleccionRamaDefault()
        : idSeleccionRamaCamino(ramaKey);
    }
    persistirConfigPanelEnNodo();
    renderRm24BloqueEditor();
    actualizarEmbudoRmPanel();
  }

  function moveNodoEnCamino(ramaKey, nodeId, delta) {
    syncAgenteRapidoDesdePanel();
    const lista = getNextArrayPorRamaKey(ramaKey);
    if (!lista) return;
    const idx = lista.findIndex(function (n) {
      return n.id === nodeId;
    });
    const next = idx + delta;
    if (idx < 0 || next < 0 || next >= lista.length) return;
    const tmp = lista[idx];
    lista[idx] = lista[next];
    lista[next] = tmp;
    persistirConfigPanelEnNodo();
    actualizarEmbudoRmPanel();
  }

  function selectAgenteRapidoElemento(selId) {
    rm24hBloqueSeleccionado = selId;
    renderRm24BloqueEditor();
    actualizarEmbudoRmPanel();
  }

  function htmlSelectAccionSiguiente(value, className) {
    const cls = className || "rm24-input";
    const v = normalizarAccionSiguiente(value);
    return (
      '<select class="' +
      esc(cls) +
      ' rm24-ar-accion">' +
      RM24H_ACCIONES_SIGUIENTE.map(function (a) {
        return (
          '<option value="' +
          esc(a.value) +
          '"' +
          (a.value === v ? " selected" : "") +
          ">" +
          esc(a.label) +
          "</option>"
        );
      }).join("") +
      "</select>"
    );
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

  const RM24_TIPOS_PASO = [
    { tipo: "texto", icon: "💬", label: "Texto" },
    { tipo: "imagen", icon: "🖼", label: "Imagen" },
    { tipo: "video", icon: "🎥", label: "Video" },
    { tipo: "audio", icon: "🎧", label: "Audio" },
    { tipo: "documento", icon: "📄", label: "Archivo" },
  ];

  function htmlRm24AddPasoControl() {
    return (
      '<div class="rm24-add-paso-wrap rm24-add-paso-wrap--premium" id="rm24hAddPasoWrap">' +
      '<button type="button" class="rm24-add-paso-btn rm24-add-paso-btn--premium" id="rm24hAddPasoBtn" aria-expanded="false" aria-haspopup="dialog">' +
      '<span class="rm24-add-paso-btn-icon" aria-hidden="true">＋</span>' +
      "<span>Agregar contenido</span></button>" +
      '<div class="rm24-add-paso-popover" id="rm24hAddPasoPopover" hidden>' +
      '<div class="rm24-add-paso-popover-backdrop" data-rm24-close-add-paso aria-hidden="true"></div>' +
      '<div class="rm24-add-paso-menu rm24-add-paso-menu--premium" id="rm24hAddPasoMenu" role="menu">' +
      '<p class="rm24-add-paso-menu-title">Elegir tipo de contenido</p>' +
      RM24_TIPOS_PASO.map(function (c) {
        return (
          '<button type="button" class="rm24-add-paso-menu-item" role="menuitem" data-add-tipo="' +
          esc(c.tipo) +
          '">' +
          '<span class="rm24-add-paso-menu-icon" aria-hidden="true">' +
          c.icon +
          "</span>" +
          '<span class="rm24-add-paso-menu-label">' +
          esc(c.label) +
          "</span></button>"
        );
      }).join("") +
      "</div></div></div>"
    );
  }

  function toggleRm24AddPasoMenu(open) {
    const btn = document.getElementById("rm24hAddPasoBtn");
    const menu = document.getElementById("rm24hAddPasoMenu");
    const popover = document.getElementById("rm24hAddPasoPopover");
    const wrap = document.getElementById("rm24hAddPasoWrap");
    if (!btn || !menu || !popover) return;
    const show = typeof open === "boolean" ? open : popover.hidden;
    popover.hidden = !show;
    menu.hidden = !show;
    btn.setAttribute("aria-expanded", show ? "true" : "false");
    btn.classList.toggle("rm24-add-paso-btn--open", show);
    wrap?.classList.toggle("rm24-add-paso-wrap--open", show);
    if (show) toggleRm24AddNodoMenu(false);
  }

  function resumenPasoFunnel(item) {
    if (!item) return "Vacío";
    if (item.tipo === "texto") {
      const t = String(item.texto || "").trim();
      if (!t) return "Sin texto";
      return t.length > 36 ? t.slice(0, 36) + "…" : t;
    }
    if (item.tipo === "retraso") {
      const n = parseInt(item.cantidad, 10) || 1;
      const u = String(item.unidad || "minutos");
      return n + " " + u + " (solo visual)";
    }
    const url = String(item.url || "").trim();
    if (url) {
      if (item.tipo === "documento") {
        return String(item.filename || "archivo").trim() || url.split("/").pop();
      }
      return url.split("/").pop() || "URL configurada";
    }
    return "Sin archivo";
  }

  function etiquetaRetrasoVisualBadge() {
    return '<span class="rm24-future-badge">visual / futuro</span>';
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

  /** Estado del editor: conserva bloques vacíos mientras se edita. */
  function mapearListaContenidosEditor(lista) {
    return (lista || []).map(mapearItemContenidoUi).filter(Boolean);
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
      retraso: "Retraso visual",
    };
    return map[tipo] || tipo;
  }

  function iconoTipoContenido(tipo) {
    const map = {
      texto: "💬",
      imagen: "🖼",
      audio: "🎧",
      video: "🎥",
      documento: "📄",
      retraso: "⏱",
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

  function normalizarConfigContenidoNodo(raw) {
    const cfg = raw && typeof raw === "object" ? raw : {};
    const contenidos = (Array.isArray(cfg.contenidos) ? cfg.contenidos : [])
      .map(normalizarItemContenidoUi)
      .filter(Boolean);
    let mensajeRemarketing = String(cfg.mensajeRemarketing ?? "");
    if (!mensajeRemarketing && contenidos.length) {
      const tmp = { rm24h_contenidos: contenidos, mensajeRemarketing: "" };
      sincronizarMensajeRemarketingDesdeContenidos(tmp);
      mensajeRemarketing = String(tmp.mensajeRemarketing || "");
    }
    return { contenidos: contenidos, mensajeRemarketing: mensajeRemarketing };
  }

  /** Estructura mínima en rama: no descarta borradores vacíos del editor. */
  function asegurarConfigContenidoNodoEditor(raw) {
    const cfg = raw && typeof raw === "object" ? Object.assign({}, raw) : {};
    cfg.contenidos = mapearListaContenidosEditor(cfg.contenidos);
    cfg.mensajeRemarketing = String(cfg.mensajeRemarketing ?? "");
    return cfg;
  }

  let nodoActivo = null;
  let configActiva = crearConfigVacia();
  let rm24hSubidaEnCurso = false;
  let rm24hPasoSeleccionado = 0;
  let rm24hBloqueSeleccionado = "espera";
  let rm24hContenidoContext = { scope: "main" };
  let rm24hLectorPagosContext = { scope: "main" };
  let rm24hEtiquetaContext = { scope: "main" };
  let rm24hConversionContext = { scope: "main" };
  let rm24hMiniFlujoNodos = [];
  let rm24hMiniFlujoUidSeq = 0;
  let rm24hDragNodoIndex = null;
  let rm24hDragContentIndex = null;

  function getAgenteRapidoActivo() {
    if (!configActiva.rm24h_agente_rapido) {
      configActiva.rm24h_agente_rapido = crearAgenteRapidoVacio();
    }
    return configActiva.rm24h_agente_rapido;
  }

  function getLectorPagosActivo() {
    if (!configActiva.rm24h_lector_pagos) {
      configActiva.rm24h_lector_pagos = normalizarLectorPagosNodo(null);
    }
    return configActiva.rm24h_lector_pagos;
  }

  function crearLectorPagosContextMain() {
    return { scope: "main" };
  }

  function crearLectorPagosContextBranch(ramaKey, nodeId) {
    return { scope: "branch", ramaKey: ramaKey, nodeId: nodeId };
  }

  function getLectorPagosPorContexto(ctx) {
    const c = ctx || rm24hLectorPagosContext || crearLectorPagosContextMain();
    if (c.scope === "branch") {
      const nodo = findNodoEnCaminoAgenteRapido(c.ramaKey, c.nodeId);
      if (!nodo) return normalizarLectorPagosNodo(null);
      return normalizarLectorPagosNodo({
        type: "lector_pagos",
        id: nodo.id,
        config: nodo.config,
      });
    }
    return getLectorPagosActivo();
  }

  function setLectorPagosPorContexto(ctx, lp) {
    const c = ctx || rm24hLectorPagosContext || crearLectorPagosContextMain();
    const norm = normalizarLectorPagosNodo(lp);
    if (c.scope === "branch") {
      const nodo = findNodoEnCaminoAgenteRapido(c.ramaKey, c.nodeId);
      if (!nodo) return;
      nodo.config = norm.config;
      nodo.type = "lector_pagos";
      configActiva.rm24h_agente_rapido = getAgenteRapidoActivo();
      return;
    }
    configActiva.rm24h_lector_pagos = norm;
  }

  function crearEtiquetaContextMain(uid) {
    return { scope: "main", uid: uid };
  }

  function crearEtiquetaContextBranch(ramaKey, nodeId) {
    return { scope: "branch", ramaKey: ramaKey, nodeId: nodeId };
  }

  function getEtiquetaPorContexto(ctx) {
    const c = ctx || rm24hEtiquetaContext || crearEtiquetaContextMain();
    if (c.scope === "branch") {
      const nodo = findNodoEnCaminoAgenteRapido(c.ramaKey, c.nodeId);
      if (!nodo) return normalizarEtiquetaConfig({});
      return normalizarEtiquetaConfig(nodo.config);
    }
    const n = getMiniFlujoNodo(c.uid);
    return normalizarEtiquetaConfig(n?.config);
  }

  function setEtiquetaPorContexto(ctx, cfg) {
    const c = ctx || rm24hEtiquetaContext || crearEtiquetaContextMain();
    const norm = normalizarEtiquetaConfig(cfg);
    if (c.scope === "branch") {
      const nodo = findNodoEnCaminoAgenteRapido(c.ramaKey, c.nodeId);
      if (!nodo) return;
      nodo.config = norm;
      nodo.type = "etiqueta";
      configActiva.rm24h_agente_rapido = getAgenteRapidoActivo();
      return;
    }
    const n = getMiniFlujoNodo(c.uid);
    if (n && n.tipo === "etiqueta") {
      n.config = norm;
    }
  }

  function crearConversionContextMain(uid) {
    return { scope: "main", uid: uid };
  }

  function crearConversionContextBranch(ramaKey, nodeId) {
    return { scope: "branch", ramaKey: ramaKey, nodeId: nodeId };
  }

  function getConversionPorContexto(ctx) {
    const c = ctx || rm24hConversionContext || crearConversionContextMain();
    if (c.scope === "branch") {
      const nodo = findNodoEnCaminoAgenteRapido(c.ramaKey, c.nodeId);
      if (!nodo) return normalizarConversionConfig({});
      return normalizarConversionConfig(nodo.config);
    }
    const n = getMiniFlujoNodo(c.uid);
    return normalizarConversionConfig(n?.config);
  }

  function setConversionPorContexto(ctx, cfg) {
    const c = ctx || rm24hConversionContext || crearConversionContextMain();
    const norm = normalizarConversionConfig(cfg);
    if (c.scope === "branch") {
      const nodo = findNodoEnCaminoAgenteRapido(c.ramaKey, c.nodeId);
      if (!nodo) return;
      nodo.config = norm;
      nodo.type = "conversion";
      configActiva.rm24h_agente_rapido = getAgenteRapidoActivo();
      return;
    }
    const n = getMiniFlujoNodo(c.uid);
    if (n && n.tipo === "conversion") {
      n.config = norm;
    }
  }

  function serializarMiniFlujoParaConfig() {
    return rm24hMiniFlujoNodos.map(function (n) {
      const item = { uid: n.uid, type: n.tipo };
      if (n.tipo === "etiqueta") {
        item.config = normalizarEtiquetaConfig(n.config);
      }
      if (n.tipo === "conversion") {
        item.config = normalizarConversionConfig(n.config);
      }
      return item;
    });
  }

  function crearContenidoContextMain() {
    return { scope: "main" };
  }

  function crearContenidoContextBranch(ramaKey, nodeId) {
    return { scope: "branch", ramaKey: ramaKey, nodeId: nodeId };
  }

  function getContenidoContext() {
    return rm24hContenidoContext || crearContenidoContextMain();
  }

  function setContenidoContext(ctx) {
    rm24hContenidoContext = ctx || crearContenidoContextMain();
  }

  function findNodoEnCaminoAgenteRapido(ramaKey, nodeId) {
    const ar = getAgenteRapidoActivo();
    const lista =
      ramaKey === "default"
        ? ar.default?.next || []
        : (ar.caminos || []).find(function (c) {
            return c.id === ramaKey;
          })?.next || [];
    return (
      lista.find(function (n) {
        return n.id === nodeId;
      }) || null
    );
  }

  function getContenidosStorePorContexto(ctx) {
    const c = ctx || getContenidoContext();
    if (c.scope === "branch") {
      const nodo = findNodoEnCaminoAgenteRapido(c.ramaKey, c.nodeId);
      if (!nodo) {
        return { contenidos: [], mensajeRemarketing: "", nodo: null };
      }
      nodo.config = asegurarConfigContenidoNodoEditor(nodo.config);
      return {
        contenidos: nodo.config.contenidos,
        mensajeRemarketing: nodo.config.mensajeRemarketing || "",
        nodo: nodo,
      };
    }
    if (!Array.isArray(configActiva.rm24h_contenidos)) {
      configActiva.rm24h_contenidos = [];
    }
    return {
      contenidos: configActiva.rm24h_contenidos,
      mensajeRemarketing: configActiva.mensajeRemarketing || "",
      nodo: null,
    };
  }

  function setContenidosStorePorContexto(ctx, lista, mensajeOpt) {
    const c = ctx || getContenidoContext();
    const editorLista = mapearListaContenidosEditor(lista);
    if (c.scope === "branch") {
      const nodo = findNodoEnCaminoAgenteRapido(c.ramaKey, c.nodeId);
      if (!nodo) return;
      const cfg = asegurarConfigContenidoNodoEditor(
        Object.assign({}, nodo.config, { contenidos: editorLista })
      );
      if (mensajeOpt !== undefined) {
        cfg.mensajeRemarketing = String(mensajeOpt);
      } else {
        const tmp = {
          rm24h_contenidos: cfg.contenidos,
          mensajeRemarketing: cfg.mensajeRemarketing,
        };
        sincronizarMensajeRemarketingDesdeContenidos(tmp);
        cfg.mensajeRemarketing = String(tmp.mensajeRemarketing || "");
      }
      nodo.config = cfg;
      nodo.type = "contenido";
      configActiva.rm24h_agente_rapido = getAgenteRapidoActivo();
      return;
    }
    configActiva.rm24h_contenidos = editorLista;
    sincronizarMensajeRemarketingDesdeContenidos(configActiva);
  }

  function syncMiniNodoContextDesdeSeleccion() {
    const arSel = parseSeleccionAgenteRapido(rm24hBloqueSeleccionado);
    if (arSel && arSel.kind === "node") {
      const nodo = findNodoEnCaminoAgenteRapido(arSel.ramaKey, arSel.nodeId);
      const tipo = String(nodo?.type || nodo?.tipo || "").toLowerCase();
      if (tipo === "contenido") {
        setContenidoContext(crearContenidoContextBranch(arSel.ramaKey, arSel.nodeId));
        rm24hLectorPagosContext = crearLectorPagosContextMain();
        rm24hEtiquetaContext = crearEtiquetaContextMain();
        rm24hConversionContext = crearConversionContextMain();
        return;
      }
      if (tipo === "lector_pagos") {
        rm24hLectorPagosContext = crearLectorPagosContextBranch(
          arSel.ramaKey,
          arSel.nodeId
        );
        setContenidoContext(crearContenidoContextMain());
        rm24hEtiquetaContext = crearEtiquetaContextMain();
        rm24hConversionContext = crearConversionContextMain();
        return;
      }
      if (tipo === "etiqueta") {
        rm24hEtiquetaContext = crearEtiquetaContextBranch(arSel.ramaKey, arSel.nodeId);
        setContenidoContext(crearContenidoContextMain());
        rm24hLectorPagosContext = crearLectorPagosContextMain();
        rm24hConversionContext = crearConversionContextMain();
        return;
      }
      if (tipo === "conversion") {
        rm24hConversionContext = crearConversionContextBranch(arSel.ramaKey, arSel.nodeId);
        setContenidoContext(crearContenidoContextMain());
        rm24hLectorPagosContext = crearLectorPagosContextMain();
        rm24hEtiquetaContext = crearEtiquetaContextMain();
        return;
      }
    }
    const n = getMiniFlujoNodo(rm24hBloqueSeleccionado);
    if (n && n.tipo === "contenido") {
      setContenidoContext(crearContenidoContextMain());
    }
    if (n && n.tipo === "lector_pagos") {
      rm24hLectorPagosContext = crearLectorPagosContextMain();
    }
    if (n && n.tipo === "etiqueta") {
      rm24hEtiquetaContext = crearEtiquetaContextMain(n.uid);
    }
    if (n && n.tipo === "conversion") {
      rm24hConversionContext = crearConversionContextMain(n.uid);
    }
  }

  function syncContenidoContextDesdeSeleccion() {
    syncMiniNodoContextDesdeSeleccion();
  }

  /** Catálogo de nodos agregables al mini flujo (solo UI, sin persistencia JSON). */
  const RM24H_NODO_TIPOS = [
    { tipo: "contenido", icon: "💬", label: "Contenido", kind: "send", runtime: true },
    { tipo: "agente_rapido", icon: "⚡", label: "Agente rápido", kind: "action", runtime: false },
    { tipo: "lector_pagos", icon: "💳", label: "Lector de pagos", kind: "action", runtime: false },
    { tipo: "etiqueta", icon: "🏷", label: "Etiqueta", kind: "action", runtime: false },
    { tipo: "conversion", icon: "🎯", label: "Conversión", kind: "action", runtime: false },
    { tipo: "fin_rm", icon: "✅", label: "Fin RM", kind: "end", runtime: false },
  ];

  const RM24H_BLOQUES_FIJOS = {
    espera: { id: "espera", icon: "⏱", label: "Esperar inactividad", kind: "wait" },
    fin: { id: "fin", icon: "✅", label: "Fin", kind: "end" },
  };

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
      maxBytes: 5 * 1024 * 1024,
      accept:
        ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      label: "PDF, DOC o DOCX · máx 5 MB",
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
      hint: "MÁX 5MB (PDF/DOC/DOCX)",
    },
  };

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const PRESETS_TIEMPO_INACTIVIDAD = {
    minutos: [1, 5, 10, 15, 30],
    horas: [1, 2, 4, 8, 12, 23],
    dias: [1, 2, 3, 7],
  };

  function normalizarUnidadTiempoInactividad(unidad) {
    const s = String(unidad || "")
      .toLowerCase()
      .trim();
    if (s === "minuto" || s === "minutos" || s === "min") return "minutos";
    if (s === "hora" || s === "horas" || s === "h") return "horas";
    if (s === "dia" || s === "días" || s === "dias" || s === "day" || s === "days") {
      return "dias";
    }
    return null;
  }

  function normalizarTiempoInactividad(raw) {
    const fallback = { valor: 23, unidad: "horas" };
    if (!raw || typeof raw !== "object") return { ...fallback };

    const anidado = raw.tiempoInactividad;
    if (anidado && typeof anidado === "object") {
      const unidad = normalizarUnidadTiempoInactividad(anidado.unidad);
      const valor = parseInt(anidado.valor, 10);
      if (unidad && Number.isFinite(valor) && valor > 0) {
        return { valor: valor, unidad: unidad };
      }
    }

    if (raw.horasInactividad != null) {
      const valor = parseInt(raw.horasInactividad, 10);
      if (Number.isFinite(valor) && valor > 0) {
        return { valor: clampHorasInactividad(valor), unidad: "horas" };
      }
    }

    return { ...fallback };
  }

  const RM_CONTEXT_POLICY_MODES = [
    "until_conversion",
    "time_window",
    "allow_normal_triggers",
  ];

  function normalizarUnidadRmContextPolicy(unidad) {
    const s = String(unidad || "")
      .toLowerCase()
      .trim();
    if (
      s === "minuto" ||
      s === "minutos" ||
      s === "min" ||
      s === "minute" ||
      s === "minutes"
    ) {
      return "minutes";
    }
    if (s === "hora" || s === "horas" || s === "h" || s === "hour" || s === "hours") {
      return "hours";
    }
    if (
      s === "dia" ||
      s === "días" ||
      s === "dias" ||
      s === "day" ||
      s === "days"
    ) {
      return "days";
    }
    return null;
  }

  function unidadRmContextPolicyAUi(unit) {
    if (unit === "minutes") return "minutos";
    if (unit === "hours") return "horas";
    if (unit === "days") return "dias";
    return "horas";
  }

  function unidadUiARmContextPolicy(unidad) {
    const u = normalizarUnidadTiempoInactividad(unidad);
    if (u === "minutos") return "minutes";
    if (u === "horas") return "hours";
    if (u === "dias") return "days";
    return "hours";
  }

  function normalizarRmContextPolicy(raw) {
    const fallback = {
      mode: "until_conversion",
      duration: { value: 24, unit: "hours" },
    };
    if (!raw || typeof raw !== "object") return Object.assign({}, fallback);

    let mode = String(raw.mode || "").trim();
    if (!RM_CONTEXT_POLICY_MODES.includes(mode)) mode = fallback.mode;

    const dur = raw.duration && typeof raw.duration === "object" ? raw.duration : {};
    const unit = normalizarUnidadRmContextPolicy(dur.unit) || fallback.duration.unit;
    let value = parseInt(dur.value, 10);
    if (!Number.isFinite(value) || value < 1) value = fallback.duration.value;

    return { mode: mode, duration: { value: value, unit: unit } };
  }

  function etiquetaTiempoInactividadResumen(tiempo) {
    const t = normalizarTiempoInactividad({ tiempoInactividad: tiempo });
    const v = t.valor;
    if (t.unidad === "minutos") return v + "min de inactividad";
    if (t.unidad === "horas") return v + "h de inactividad";
    if (t.unidad === "dias") {
      return v + (v === 1 ? " día" : " días") + " de inactividad";
    }
    return "23h de inactividad";
  }

  /** Etiqueta compacta para el embudo visual (ej. 5 min, 1 h, 2 días). */
  function etiquetaTiempoEmbudoCompacto(tiempo) {
    const t = normalizarTiempoInactividad({ tiempoInactividad: tiempo });
    const v = t.valor;
    if (t.unidad === "minutos") return v + " min";
    if (t.unidad === "horas") return v + " h";
    if (t.unidad === "dias") {
      return v + (v === 1 ? " día" : " días");
    }
    return "23 h";
  }

  function convertirTiempoAMinutos(valor, unidad) {
    const v = parseInt(valor, 10);
    if (!Number.isFinite(v) || v < 1) return 0;
    const u = String(unidad || "").toLowerCase();
    if (u === "segundos") return v / 60;
    if (u === "minutos") return v;
    if (u === "horas") return v * 60;
    if (u === "dias" || u === "días") return v * 24 * 60;
    return v;
  }

  function formatearTiempoTotalMinutos(totalMin) {
    if (!Number.isFinite(totalMin) || totalMin <= 0) return "0 min";
    if (totalMin < 1) return "menos de 1 min";
    if (totalMin < 60) return Math.round(totalMin) + " min";
    if (totalMin < 24 * 60) {
      const h = Math.floor(totalMin / 60);
      const m = Math.round(totalMin % 60);
      return m ? h + " h " + m + " min" : h + " h";
    }
    const d = Math.floor(totalMin / (24 * 60));
    const rest = totalMin - d * 24 * 60;
    const h = Math.floor(rest / 60);
    if (h) return d + " d " + h + " h";
    return d + (d === 1 ? " día" : " días");
  }

  function calcularTiempoEsperaEmbudo(tiempo) {
    const t = normalizarTiempoInactividad({ tiempoInactividad: tiempo });
    return etiquetaTiempoEmbudoCompacto(t);
  }

  function contarContenidosEmbudo(contenidosRaw) {
    const n = (contenidosRaw || [])
      .map(function (item) {
        return mapearItemContenidoUi(item);
      })
      .filter(function (m) {
        return m && m.tipo !== "retraso";
      }).length;
    return n + " contenido" + (n === 1 ? "" : "s");
  }

  function esContenidoEditableRm24(item) {
    const m = mapearItemContenidoUi(item);
    return !!(m && m.tipo !== "retraso");
  }

  function indicePrimerContenidoEditable(items) {
    for (let i = 0; i < (items || []).length; i++) {
      if (esContenidoEditableRm24(items[i])) return i;
    }
    return 0;
  }

  function obtenerContenidosParaEmbudo() {
    if (panelRemarketingAbierto()) {
      return leerContenidosDesdePanel();
    }
    return Array.isArray(configActiva.rm24h_contenidos) ? configActiva.rm24h_contenidos : [];
  }

  function resumenContenidoEmbudo(listaRaw) {
    const validos = (listaRaw || [])
      .map(normalizarItemContenidoUi)
      .filter(Boolean)
      .filter(function (c) {
        return c.tipo !== "retraso";
      });
    if (!validos.length) {
      return {
        vacio: true,
        linea: "Sin contenido configurado",
        preview: "",
        chips: [],
      };
    }

    const primeroTexto = validos.find(function (c) {
      return c.tipo === "texto";
    });
    const preview = primeroTexto
      ? primeroTexto.texto.slice(0, 72) + (primeroTexto.texto.length > 72 ? "…" : "")
      : "";

    const conteo = {};
    validos.forEach(function (c) {
      const lbl = etiquetaTipoContenido(c.tipo);
      conteo[lbl] = (conteo[lbl] || 0) + 1;
    });
    const chips = Object.keys(conteo).map(function (lbl) {
      const n = conteo[lbl];
      return n + " " + lbl.toLowerCase() + (n > 1 ? "s" : "");
    });

    const linea =
      validos.length +
      " contenido" +
      (validos.length > 1 ? "s" : "") +
      (chips.length ? " · " + chips.join(", ") : "");

    return { vacio: false, linea: linea, preview: preview, chips: chips };
  }

  function htmlMiniFlujoRmSection() {
    return (
      '<section class="rm24-section rm24-section--embudo rm24-section--embudo-premium rm24-section--mini-flujo" id="rm24hEmbudoSection" aria-label="Mini flujo RM">' +
      '<div class="rm24-embudo-head">' +
      '<div class="rm24-embudo-head-title">' +
      '<span class="rm24-embudo-head-icon" aria-hidden="true">🔥</span>' +
      "<span>Mini flujo RM</span></div>" +
      '<div class="rm24-embudo-head-stats">' +
      '<span class="rm24-embudo-stat" id="rm24hEmbudoPasoCount">0 nodos</span>' +
      '<span class="rm24-embudo-stat rm24-embudo-stat--time" id="rm24hEmbudoTiempoTotal">Espera: —</span>' +
      "</div></div>" +
      '<p class="rm24-embudo-intro">Flujo vertical · Espera y Fin fijos · ＋ entre nodos</p>' +
      '<div class="rm24-embudo-canvas rm24-wf-canvas-wrap">' +
      '<div class="rm24-embudo rm24-embudo--premium rm24-mini-flujo rm24-wf-root" id="rm24hEmbudoRm" role="list"></div>' +
      "</div></section>"
    );
  }

  function resetMiniFlujoRmPanel() {
    rm24hMiniFlujoNodos = [];
    rm24hMiniFlujoUidSeq = 0;
    rm24hDragNodoIndex = null;
    rm24hDragContentIndex = null;
    rm24hBloqueSeleccionado = "espera";
    setContenidoContext(crearContenidoContextMain());
  }

  function miniFlujoTieneNodoContenido() {
    return rm24hMiniFlujoNodos.some(function (n) {
      return n.tipo === "contenido";
    });
  }

  function findNodoContenidoMiniFlujo() {
    return rm24hMiniFlujoNodos.find(function (n) {
      return n.tipo === "contenido";
    });
  }

  function miniFlujoTieneNodoAgenteRapido() {
    return rm24hMiniFlujoNodos.some(function (n) {
      return n.tipo === "agente_rapido";
    });
  }

  function findNodoAgenteRapidoMiniFlujo() {
    return rm24hMiniFlujoNodos.find(function (n) {
      return n.tipo === "agente_rapido";
    });
  }

  function miniFlujoTieneNodoLectorPagos() {
    return rm24hMiniFlujoNodos.some(function (n) {
      return n.tipo === "lector_pagos";
    });
  }

  function findNodoLectorPagosMiniFlujo() {
    return rm24hMiniFlujoNodos.find(function (n) {
      return n.tipo === "lector_pagos";
    });
  }

  function esNodoAgenteRapidoSeleccionado() {
    const n = getMiniFlujoNodo(rm24hBloqueSeleccionado);
    return !!(n && n.tipo === "agente_rapido");
  }

  function esNodoLectorPagosSeleccionado() {
    const arSel = parseSeleccionAgenteRapido(rm24hBloqueSeleccionado);
    if (arSel && arSel.kind === "node") {
      const nodo = findNodoEnCaminoAgenteRapido(arSel.ramaKey, arSel.nodeId);
      return String(nodo?.type || nodo?.tipo || "").toLowerCase() === "lector_pagos";
    }
    const n = getMiniFlujoNodo(rm24hBloqueSeleccionado);
    return !!(n && n.tipo === "lector_pagos");
  }

  function esNodoEtiquetaSeleccionado() {
    const arSel = parseSeleccionAgenteRapido(rm24hBloqueSeleccionado);
    if (arSel && arSel.kind === "node") {
      const nodo = findNodoEnCaminoAgenteRapido(arSel.ramaKey, arSel.nodeId);
      return String(nodo?.type || nodo?.tipo || "").toLowerCase() === "etiqueta";
    }
    const n = getMiniFlujoNodo(rm24hBloqueSeleccionado);
    return !!(n && n.tipo === "etiqueta");
  }

  function esNodoConversionSeleccionado() {
    const arSel = parseSeleccionAgenteRapido(rm24hBloqueSeleccionado);
    if (arSel && arSel.kind === "node") {
      const nodo = findNodoEnCaminoAgenteRapido(arSel.ramaKey, arSel.nodeId);
      return String(nodo?.type || nodo?.tipo || "").toLowerCase() === "conversion";
    }
    const n = getMiniFlujoNodo(rm24hBloqueSeleccionado);
    return !!(n && n.tipo === "conversion");
  }

  function agenteRapidoTieneConfig(cfg) {
    const ar = normalizarAgenteRapidoConfig(cfg?.rm24h_agente_rapido);
    return (
      (Array.isArray(ar.caminos) && ar.caminos.length > 0) ||
      String(ar.mensajeBase || "").trim().length > 0 ||
      String(ar.comportamiento?.mensajeFallback || "").trim().length > 0
    );
  }

  /** Restaura nodos del mini flujo desde config guardada (sin schema nuevo). */
  function hydrateMiniFlujoDesdeConfig(config) {
    const cfg = config || configActiva;

    if (Array.isArray(cfg.rm24h_mini_flujo) && cfg.rm24h_mini_flujo.length > 0) {
      rm24hMiniFlujoNodos = cfg.rm24h_mini_flujo.map(function (item) {
        const tipo = String(item.type || item.tipo || "").toLowerCase();
        const node = {
          uid: String(item.uid || crearUidMiniFlujoNodo()),
          tipo: tipo,
        };
        if (tipo === "etiqueta") {
          node.config = normalizarEtiquetaConfig(item.config);
        }
        if (tipo === "conversion") {
          node.config = normalizarConversionConfig(item.config);
        }
        return node;
      });
    } else {
      if (!miniFlujoTieneNodoContenido()) {
        rm24hMiniFlujoNodos.push({
          uid: crearUidMiniFlujoNodo(),
          tipo: "contenido",
        });
      }

      if (agenteRapidoTieneConfig(cfg) && !miniFlujoTieneNodoAgenteRapido()) {
        rm24hMiniFlujoNodos.push({
          uid: crearUidMiniFlujoNodo(),
          tipo: "agente_rapido",
        });
      }

      if (lectorPagosTieneConfig(cfg) && !miniFlujoTieneNodoLectorPagos()) {
        rm24hMiniFlujoNodos.push({
          uid: crearUidMiniFlujoNodo(),
          tipo: "lector_pagos",
        });
      }
    }

    const tieneContenido =
      (Array.isArray(cfg.rm24h_contenidos) && cfg.rm24h_contenidos.length > 0) ||
      String(cfg.mensajeRemarketing || "").trim().length > 0;

    if (tieneContenido && !miniFlujoTieneNodoContenido()) {
      rm24hMiniFlujoNodos.unshift({
        uid: crearUidMiniFlujoNodo(),
        tipo: "contenido",
      });
    }
    if (agenteRapidoTieneConfig(cfg) && !miniFlujoTieneNodoAgenteRapido()) {
      rm24hMiniFlujoNodos.push({
        uid: crearUidMiniFlujoNodo(),
        tipo: "agente_rapido",
      });
    }
    if (lectorPagosTieneConfig(cfg) && !miniFlujoTieneNodoLectorPagos()) {
      rm24hMiniFlujoNodos.push({
        uid: crearUidMiniFlujoNodo(),
        tipo: "lector_pagos",
      });
    }

    if (tieneContenido) {
      const nodoContenido = findNodoContenidoMiniFlujo();
      if (nodoContenido) {
        rm24hBloqueSeleccionado = nodoContenido.uid;
      }
    } else if (agenteRapidoTieneConfig(cfg)) {
      const nodoAr = findNodoAgenteRapidoMiniFlujo();
      if (nodoAr) rm24hBloqueSeleccionado = nodoAr.uid;
    } else if (lectorPagosTieneConfig(cfg)) {
      const nodoLp = findNodoLectorPagosMiniFlujo();
      if (nodoLp) rm24hBloqueSeleccionado = nodoLp.uid;
    }
  }

  function prepararConfigParaGuardar(config) {
    const cfg = Object.assign({}, config || configActiva);
    cfg.version = 1;
    cfg.tiempoInactividad = normalizarTiempoInactividad(cfg);
    sincronizarHorasLegacyDesdeTiempo(cfg);
    cfg.rm24h_contenidos = (cfg.rm24h_contenidos || [])
      .map(normalizarItemContenidoUi)
      .filter(Boolean);
    sincronizarMensajeRemarketingDesdeContenidos(cfg);
    if (miniFlujoTieneNodoAgenteRapido()) {
      cfg.rm24h_agente_rapido = normalizarAgenteRapidoConfig(cfg.rm24h_agente_rapido);
    } else {
      delete cfg.rm24h_agente_rapido;
    }
    if (miniFlujoTieneNodoLectorPagos()) {
      cfg.rm24h_lector_pagos = normalizarLectorPagosNodo(cfg.rm24h_lector_pagos);
    } else {
      delete cfg.rm24h_lector_pagos;
    }
    if (rm24hMiniFlujoNodos.length) {
      cfg.rm24h_mini_flujo = serializarMiniFlujoParaConfig();
    } else {
      delete cfg.rm24h_mini_flujo;
    }
    cfg.detenerSiResponde = false;
    cfg.reiniciarAlResponder = true;
    cfg.detenerEnConversion = true;
    cfg.rm_context_policy = normalizarRmContextPolicy(cfg.rm_context_policy);
    return cfg;
  }

  function crearUidMiniFlujoNodo() {
    rm24hMiniFlujoUidSeq += 1;
    return "rmn_" + Date.now().toString(36) + "_" + rm24hMiniFlujoUidSeq;
  }

  function getCatalogoNodoRm24(tipo) {
    return RM24H_NODO_TIPOS.find(function (n) {
      return n.tipo === tipo;
    });
  }

  function getMiniFlujoNodo(uid) {
    return rm24hMiniFlujoNodos.find(function (n) {
      return n.uid === uid;
    });
  }

  function esNodoContenidoSeleccionado() {
    const arSel = parseSeleccionAgenteRapido(rm24hBloqueSeleccionado);
    if (arSel && arSel.kind === "node") {
      const nodo = findNodoEnCaminoAgenteRapido(arSel.ramaKey, arSel.nodeId);
      return String(nodo?.type || nodo?.tipo || "").toLowerCase() === "contenido";
    }
    const n = getMiniFlujoNodo(rm24hBloqueSeleccionado);
    return !!(n && n.tipo === "contenido");
  }

  function htmlRm24AddNodoControl() {
    return (
      '<div class="rm24-add-paso-wrap rm24-add-paso-wrap--premium rm24-mini-flujo-add-wrap" id="rm24hAddNodoWrap">' +
      '<button type="button" class="rm24-add-paso-btn rm24-add-paso-btn--premium rm24-mini-flujo-add-btn" id="rm24hAddNodoBtn" aria-expanded="false" aria-haspopup="dialog">' +
      '<span class="rm24-add-paso-btn-icon" aria-hidden="true">＋</span>' +
      "<span>Agregar nodo RM</span></button>" +
      '<div class="rm24-add-paso-popover" id="rm24hAddNodoPopover" hidden>' +
      '<div class="rm24-add-paso-popover-backdrop" data-rm24-close-add-nodo aria-hidden="true"></div>' +
      '<div class="rm24-add-paso-menu rm24-add-paso-menu--premium" id="rm24hAddNodoMenu" role="menu">' +
      '<p class="rm24-add-paso-menu-title">Elegir tipo de nodo</p>' +
      RM24H_NODO_TIPOS.map(function (c) {
        return (
          '<button type="button" class="rm24-add-paso-menu-item" role="menuitem" data-add-nodo-tipo="' +
          esc(c.tipo) +
          '">' +
          '<span class="rm24-add-paso-menu-icon" aria-hidden="true">' +
          c.icon +
          "</span>" +
          '<span class="rm24-add-paso-menu-label">' +
          esc(c.label) +
          "</span>" +
          (nodoRmTieneEditor(c.tipo) ? "" : '<span class="rm24-future-badge">solo UI</span>') +
          "</button>"
        );
      }).join("") +
      "</div></div></div>"
    );
  }

  function toggleRm24AddNodoMenu(open) {
    const btn = document.getElementById("rm24hAddNodoBtn");
    const menu = document.getElementById("rm24hAddNodoMenu");
    const popover = document.getElementById("rm24hAddNodoPopover");
    const wrap = document.getElementById("rm24hAddNodoWrap");
    if (!btn || !menu || !popover) return;
    const show = typeof open === "boolean" ? open : popover.hidden;
    popover.hidden = !show;
    menu.hidden = !show;
    btn.setAttribute("aria-expanded", show ? "true" : "false");
    btn.classList.toggle("rm24-add-paso-btn--open", show);
    wrap?.classList.toggle("rm24-add-paso-wrap--open", show);
    if (show) toggleRm24AddPasoMenu(false);
  }

  function addMiniFlujoNodoAt(insertIndex, tipo) {
    const cat = getCatalogoNodoRm24(String(tipo || "").toLowerCase());
    if (!cat) return;
    toggleAllWfAddMenus(false);
    if (cat.tipo === "contenido") {
      const existente = findNodoContenidoMiniFlujo();
      if (existente) {
        selectRm24Bloque(existente.uid);
        return;
      }
    }
    if (cat.tipo === "agente_rapido") {
      const existente = findNodoAgenteRapidoMiniFlujo();
      if (existente) {
        selectRm24Bloque(existente.uid);
        return;
      }
      if (!configActiva.rm24h_agente_rapido) {
        configActiva.rm24h_agente_rapido = crearAgenteRapidoVacio();
      }
    }
    if (cat.tipo === "lector_pagos") {
      const existente = findNodoLectorPagosMiniFlujo();
      if (existente) {
        selectRm24Bloque(existente.uid);
        return;
      }
      if (!configActiva.rm24h_lector_pagos) {
        configActiva.rm24h_lector_pagos = normalizarLectorPagosNodo(null);
      }
    }
    const idx = Math.max(0, Math.min(Number(insertIndex) || 0, rm24hMiniFlujoNodos.length));
    const uid = crearUidMiniFlujoNodo();
    const nodeEntry = { uid: uid, tipo: cat.tipo };
    if (cat.tipo === "etiqueta") {
      nodeEntry.config = crearEtiquetaConfigVacia();
    }
    if (cat.tipo === "conversion") {
      nodeEntry.config = crearConversionConfigVacia();
    }
    rm24hMiniFlujoNodos.splice(idx, 0, nodeEntry);
    if (
      (cat.tipo === "lector_pagos" || cat.tipo === "etiqueta" || cat.tipo === "conversion") &&
      nodoActivo
    ) {
      persistirConfigPanelEnNodo();
    }
    selectRm24Bloque(uid);
  }

  function addMiniFlujoNodo(tipo) {
    addMiniFlujoNodoAt(rm24hMiniFlujoNodos.length, tipo);
  }

  function removeMiniFlujoNodo(uid) {
    const idx = rm24hMiniFlujoNodos.findIndex(function (n) {
      return n.uid === uid;
    });
    if (idx < 0) return;
    const removido = rm24hMiniFlujoNodos[idx];
    if (removido && removido.tipo === "contenido") {
      configActiva.rm24h_contenidos = [];
      configActiva.mensajeRemarketing = "";
      persistirConfigPanelEnNodo();
    }
    if (removido && removido.tipo === "agente_rapido") {
      delete configActiva.rm24h_agente_rapido;
      persistirConfigPanelEnNodo();
    }
    if (removido && removido.tipo === "lector_pagos") {
      delete configActiva.rm24h_lector_pagos;
      persistirConfigPanelEnNodo();
    }
    rm24hMiniFlujoNodos.splice(idx, 1);
    if (rm24hBloqueSeleccionado === uid) {
      rm24hBloqueSeleccionado = rm24hMiniFlujoNodos.length
        ? rm24hMiniFlujoNodos[Math.min(idx, rm24hMiniFlujoNodos.length - 1)].uid
        : "espera";
    }
    renderRm24BloqueEditor();
    actualizarEmbudoRmPanel();
  }

  function moveMiniFlujoNodo(uid, delta) {
    const idx = rm24hMiniFlujoNodos.findIndex(function (n) {
      return n.uid === uid;
    });
    const next = idx + delta;
    if (idx < 0 || next < 0 || next >= rm24hMiniFlujoNodos.length) return;
    const tmp = rm24hMiniFlujoNodos[idx];
    rm24hMiniFlujoNodos[idx] = rm24hMiniFlujoNodos[next];
    rm24hMiniFlujoNodos[next] = tmp;
    renderRm24BloqueEditor();
    actualizarEmbudoRmPanel();
  }

  function reorderMiniFlujoNodo(fromIndex, toIndex) {
    if (
      fromIndex < 0 ||
      fromIndex >= rm24hMiniFlujoNodos.length ||
      toIndex < 0 ||
      toIndex >= rm24hMiniFlujoNodos.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const item = rm24hMiniFlujoNodos.splice(fromIndex, 1)[0];
    rm24hMiniFlujoNodos.splice(toIndex, 0, item);
    renderRm24BloqueEditor();
    actualizarEmbudoRmPanel();
  }

  function resumenMiniFlujoNodo(nodo, contenidosRaw) {
    return resumenNodoMiniRm(
      { type: nodo.tipo, tipo: nodo.tipo },
      crearMiniNodoContextMain(nodo.uid, 0, 1),
      contenidosRaw
    );
  }

  function resumenMiniFlujoBloqueFijo(bloqueId, contenidosRaw, tiempo) {
    if (bloqueId === "espera") return etiquetaTiempoEmbudoCompacto(tiempo);
    if (bloqueId === "fin") return "Lead queda en remarketing · no vuelve al flujo";
    return "";
  }

  function htmlWfNodeActions(uid, nodeIndex, total) {
    return (
      '<button type="button" class="rm24-wf-action" data-rm24-nodo-uid="' +
      esc(uid) +
      '" title="Editar">✏</button>' +
      '<button type="button" class="rm24-wf-action" data-rm24-nodo-move-up="' +
      esc(uid) +
      '" title="Subir"' +
      (nodeIndex === 0 ? " disabled" : "") +
      ">↑</button>" +
      '<button type="button" class="rm24-wf-action" data-rm24-nodo-move-down="' +
      esc(uid) +
      '" title="Bajar"' +
      (nodeIndex >= total - 1 ? " disabled" : "") +
      ">↓</button>" +
      '<button type="button" class="rm24-wf-action rm24-wf-action--danger" data-rm24-nodo-remove="' +
      esc(uid) +
      '" title="Eliminar">×</button>'
    );
  }

  function htmlMiniFlujoBloqueFijo(bloqueId, stepNum, resumen, selected) {
    const bloque = RM24H_BLOQUES_FIJOS[bloqueId];
    if (!bloque) return "";
    return (
      '<div class="rm24-wf-step" role="listitem">' +
      '<div class="rm24-wf-step-inner">' +
      htmlWfCard({
        kind: bloque.kind,
        mod: "fixed",
        icon: bloque.icon,
        title: bloque.label,
        subtitle: resumen,
        selected: selected,
        showEditingPill: true,
        attrs: 'data-rm24-bloque-id="' + esc(bloque.id) + '"',
      }) +
      "</div></div>"
    );
  }

  function htmlMiniFlujoNodo(nodo, stepNum, resumen, selected, nodeIndex, total) {
    return renderMiniNodoRm(
      {
        type: nodo.tipo,
        tipo: nodo.tipo,
        uid: nodo.uid,
        config: nodo.config,
      },
      crearMiniNodoContextMain(nodo.uid, nodeIndex, total),
      {
        stepNum: stepNum,
        resumen: resumen,
        selected: selected,
      }
    );
  }

  function htmlMiniFlujoNodoAgenteRapido(nodo, stepNum, resumen, selected, nodeIndex, total) {
    const cat = getCatalogoNodoRm24("agente_rapido");
    const ar = normalizarAgenteRapidoConfig(configActiva.rm24h_agente_rapido);
    const resumenCaminos = resumenCaminosAgenteRapidoEmbudo(ar);
    const muted = resumenCaminos === "0 caminos";
    const fallbackOn = agenteRapidoFallbackActivo(ar);
    const dragging = rm24hDragNodoIndex === nodeIndex;
    const arSel = parseSeleccionAgenteRapido(rm24hBloqueSeleccionado);
    const headSelected =
      selected ||
      (arSel &&
        arSel.kind !== "node" &&
        rm24hBloqueSeleccionado !== "espera" &&
        rm24hBloqueSeleccionado !== "fin");
    const hasBranches = (ar.caminos || []).length > 0;
    return (
      '<div class="rm24-wf-step rm24-wf-step--branch-parent" role="listitem">' +
      '<div class="rm24-wf-step-inner">' +
      htmlWfCard({
        kind: "action",
        mod: "agente",
        icon: cat.icon,
        title: cat.label,
        subtitle: resumenCaminos,
        subtitleMuted: muted,
        innerBadge: fallbackOn ? "Fallback ✓" : "",
        selected: headSelected,
        showEditingPill: selected,
        futureBadge: false,
        dragging: dragging,
        draggable: true,
        attrs: 'data-rm24-nodo-uid="' + esc(nodo.uid) + '"',
      }) +
      htmlWfStepActions(htmlWfNodeActions(nodo.uid, nodeIndex, total)) +
      "</div>" +
      (hasBranches
        ? htmlAgenteRapidoRamasTree(configActiva.rm24h_agente_rapido, rm24hBloqueSeleccionado)
        : "") +
      "</div>"
    );
  }

  function renderMiniFlujoRmHtml(contenidosRaw, tiempo, seleccionado) {
    let html = '<div class="rm24-wf">';
    html += htmlMiniFlujoBloqueFijo(
      "espera",
      1,
      resumenMiniFlujoBloqueFijo("espera", contenidosRaw, tiempo),
      seleccionado === "espera"
    );
    html += htmlWfJunction(0);
    rm24hMiniFlujoNodos.forEach(function (nodo, index) {
      html += htmlMiniFlujoNodo(
        nodo,
        index + 2,
        resumenMiniFlujoNodo(nodo, contenidosRaw),
        seleccionado === nodo.uid,
        index,
        rm24hMiniFlujoNodos.length
      );
      html += htmlWfJunction(index + 1);
    });
    html += htmlMiniFlujoBloqueFijo(
      "fin",
      rm24hMiniFlujoNodos.length + 2,
      resumenMiniFlujoBloqueFijo("fin", contenidosRaw, tiempo),
      seleccionado === "fin"
    );
    html += "</div>";
    return html;
  }

  function selectRm24Bloque(bloqueId) {
    flushEditorBloqueActualAlConfig();
    if (bloqueId === "espera" || bloqueId === "fin") {
      rm24hBloqueSeleccionado = bloqueId;
    } else if (esSeleccionAgenteRapido(bloqueId)) {
      rm24hBloqueSeleccionado = bloqueId;
    } else if (getMiniFlujoNodo(bloqueId)) {
      rm24hBloqueSeleccionado = bloqueId;
    } else {
      return;
    }
    toggleAllWfAddMenus(false);
    renderRm24BloqueEditor();
    actualizarEmbudoRmPanel();
    requestAnimationFrame(function () {
      document
        .getElementById("rm24hBloqueEditor")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function htmlEditorBloqueEspera(tiempo) {
    const introTiempo = etiquetaTiempoInactividadResumen(tiempo);
    return (
      '<section class="rm24-section rm24-section--bloque-editor">' +
      '<h5 class="rm24-section-title">Esperar inactividad</h5>' +
      '<p class="rm24h-hint">Tiempo sin respuesta del lead antes del remarketing.</p>' +
      '<div class="rm24-tiempo-grid">' +
      '<div class="rm24h-field rm24-field">' +
      "<label for=\"rm24hTiempoUnidad\">Unidad</label>" +
      '<select id="rm24hTiempoUnidad" class="rm24-input rm24-tiempo-unidad">' +
      '<option value="minutos"' +
      (tiempo.unidad === "minutos" ? " selected" : "") +
      ">Minutos (pruebas)</option>" +
      '<option value="horas"' +
      (tiempo.unidad === "horas" ? " selected" : "") +
      ">Horas</option>" +
      '<option value="dias"' +
      (tiempo.unidad === "dias" ? " selected" : "") +
      ">Días</option></select></div>" +
      '<div class="rm24h-field rm24-field">' +
      "<label for=\"rm24hTiempoValor\">Valor</label>" +
      '<input type="number" id="rm24hTiempoValor" class="rm24-input" min="1" step="1" inputmode="numeric" value="' +
      esc(String(tiempo.valor)) +
      '"></div></div>' +
      htmlPresetsTiempoInactividad(tiempo.unidad, tiempo.valor) +
      '<p class="rm24h-hint" id="rm24hTiempoHint">Se envía tras ' +
      esc(introTiempo.replace(" de inactividad", "")) +
      " sin respuesta del lead.</p></section>"
    );
  }

  function htmlEditorBloqueReglas() {
    return (
      '<section class="rm24-section rm24-section--rules rm24-section--bloque-editor">' +
      '<h5 class="rm24-section-title">Reglas automáticas (Fase 1)</h5>' +
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
      '<p class="rm24h-hint rm24-rule-hint">SÍ (fijo en Fase 1)</p></div></section>'
    );
  }

  function htmlEditorBloqueComportamientoRm(policy) {
    const p = normalizarRmContextPolicy(policy);
    const uiUnidad = unidadRmContextPolicyAUi(p.duration.unit);
    const isUntilConversion = p.mode === "until_conversion";
    const isTimeWindow = p.mode === "time_window";
    const isAllowTriggers = p.mode === "allow_normal_triggers";

    return (
      '<section class="rm24-section rm24-section--rules rm24-section--bloque-editor rm24-section--rm-context">' +
      '<h5 class="rm24-section-title">COMPORTAMIENTO EN REMARKETING</h5>' +
      '<div class="rm24-rule">' +
      '<label class="rm24-switch rm24h-toggle">' +
      '<input type="checkbox" id="rm24hRmContextUntilConversion" data-rm-context-mode="until_conversion"' +
      (isUntilConversion ? " checked" : "") +
      '><span class="rm24-switch-track" aria-hidden="true"></span>' +
      '<span class="rm24-switch-label">Permanecer hasta compra o Fin RM</span></label>' +
      '<p class="rm24h-hint rm24-rule-hint">El lead queda dentro del remarketing hasta comprar o terminar el mini flujo.</p></div>' +
      '<div class="rm24-rule">' +
      '<label class="rm24-switch rm24h-toggle">' +
      '<input type="checkbox" id="rm24hRmContextTimeWindow" data-rm-context-mode="time_window"' +
      (isTimeWindow ? " checked" : "") +
      '><span class="rm24-switch-track" aria-hidden="true"></span>' +
      '<span class="rm24-switch-label">Permanecer solo un tiempo</span></label>' +
      '<p class="rm24h-hint rm24-rule-hint">El lead sale del remarketing después de un tiempo.</p>' +
      '<div id="rm24hRmContextDurationWrap" class="rm24-rm-context-duration"' +
      (isTimeWindow ? "" : " hidden") +
      '><div class="rm24-tiempo-grid">' +
      '<div class="rm24h-field rm24-field">' +
      "<label for=\"rm24hRmContextDurationValor\">Tiempo</label>" +
      '<input type="number" id="rm24hRmContextDurationValor" class="rm24-input" min="1" step="1" inputmode="numeric" value="' +
      esc(String(p.duration.value)) +
      '"></div>' +
      '<div class="rm24h-field rm24-field">' +
      "<label for=\"rm24hRmContextDurationUnidad\">Unidad</label>" +
      '<select id="rm24hRmContextDurationUnidad" class="rm24-input rm24-tiempo-unidad">' +
      '<option value="minutos"' +
      (uiUnidad === "minutos" ? " selected" : "") +
      ">Minutos</option>" +
      '<option value="horas"' +
      (uiUnidad === "horas" ? " selected" : "") +
      ">Horas</option>" +
      '<option value="dias"' +
      (uiUnidad === "dias" ? " selected" : "") +
      ">Días</option></select></div></div></div></div>" +
      '<div class="rm24-rule">' +
      '<label class="rm24-switch rm24h-toggle">' +
      '<input type="checkbox" id="rm24hRmContextAllowTriggers" data-rm-context-mode="allow_normal_triggers"' +
      (isAllowTriggers ? " checked" : "") +
      '><span class="rm24-switch-track" aria-hidden="true"></span>' +
      '<span class="rm24-switch-label">Permitir volver al flujo normal</span></label>' +
      '<p class="rm24h-hint rm24-rule-hint">Si el lead escribe una palabra activadora de otro flujo, sale del RM.</p></div></section>'
    );
  }

  function htmlEditorContenidoShell(context) {
    const ctx = context || getContenidoContext();
    const isBranch = ctx.scope === "branch";
    let title = "Nodo Contenido";
    if (isBranch) {
      const camino = getCaminoAgenteRapidoPorRamaKey(ctx.ramaKey);
      const nombre =
        String(camino?.nombre || camino?.nombreCamino || ctx.ramaKey).trim() ||
        ctx.ramaKey;
      title = "Contenido · Camino: " + nombre;
    }
    const hint = isBranch
      ? "Bloques de este nodo en el camino. Se guardan en <code>caminos[].next[].config</code> (no modifica <code>rm24h_contenidos</code> global)."
      : "Bloques que se envían juntos tras la espera. Se guardan en <code>rm24h_contenidos</code> (compatible con RM24H actual).";
    return (
      '<section class="rm24-section rm24-section--contenidos rm24-section--bloque-editor">' +
      '<h5 class="rm24-section-title">' +
      esc(title) +
      "</h5>" +
      '<p class="rm24h-hint rm24-contenidos-intro">' +
      hint +
      "</p>" +
      '<div id="rm24hContenidosError" class="rm24-contenidos-error" hidden></div>' +
      htmlRm24AddPasoControl() +
      '<div id="rm24hContentPickerWrap" class="rm24-content-picker-wrap"></div>' +
      '<div id="rm24hStepEditor" class="rm24-step-editor rm24-step-editor--premium"></div>' +
      "</section>"
    );
  }

  function renderEditorContenido(context) {
    setContenidoContext(context || crearContenidoContextMain());
    const store = getContenidosStorePorContexto();
    rm24hPasoSeleccionado = store.contenidos.length
      ? indicePrimerContenidoEditable(store.contenidos)
      : 0;
    return htmlEditorContenidoShell(getContenidoContext());
  }

  function mountEditorContenido(context) {
    const mount = document.getElementById("rm24hBloqueEditor");
    if (!mount) return;
    mount.innerHTML = renderEditorContenido(context);
    renderRm24ContentPicker();
    renderRm24StepEditor();
  }

  function htmlEditorBloqueContenido() {
    return renderEditorContenido(crearContenidoContextMain());
  }

  /** Editor unificado por tipo de mini nodo RM (main o rama). */
  function renderEditorMiniNodoRm(node, context) {
    const tipo = String(node?.type || node?.tipo || "").toLowerCase();
    if (tipo === "contenido") {
      const ctx =
        context?.scope === "branch"
          ? crearContenidoContextBranch(context.ramaKey, context.nodeId)
          : crearContenidoContextMain();
      return renderEditorContenido(ctx);
    }
    if (tipo === "lector_pagos") {
      return htmlEditorBloqueLectorPagos(context);
    }
    if (tipo === "agente_rapido") {
      if (!configActiva.rm24h_agente_rapido) {
        configActiva.rm24h_agente_rapido = crearAgenteRapidoVacio();
      }
      return htmlEditorBloqueAgenteRapido();
    }
    if (tipo === "etiqueta") {
      return htmlEditorBloqueEtiqueta(context);
    }
    if (tipo === "conversion") {
      return htmlEditorBloqueConversion(context);
    }
    return htmlEditorBloqueNodoFuturo(tipo);
  }

  function mountEditorMiniNodoRm(node, context) {
    const mount = document.getElementById("rm24hBloqueEditor");
    if (!mount) return;
    const tipo = String(node?.type || node?.tipo || "").toLowerCase();
    if (tipo === "contenido") {
      const ctx =
        context?.scope === "branch"
          ? crearContenidoContextBranch(context.ramaKey, context.nodeId)
          : crearContenidoContextMain();
      mountEditorContenido(ctx);
      return;
    }
    if (tipo === "lector_pagos") {
      rm24hLectorPagosContext =
        context?.scope === "branch"
          ? crearLectorPagosContextBranch(context.ramaKey, context.nodeId)
          : crearLectorPagosContextMain();
      mount.innerHTML = htmlEditorBloqueLectorPagos(rm24hLectorPagosContext);
      return;
    }
    if (tipo === "agente_rapido") {
      if (!configActiva.rm24h_agente_rapido) {
        configActiva.rm24h_agente_rapido = crearAgenteRapidoVacio();
      }
      mount.innerHTML = htmlEditorBloqueAgenteRapido();
      renderAgenteRapidoCaminos();
      return;
    }
    if (tipo === "etiqueta") {
      rm24hEtiquetaContext =
        context?.scope === "branch"
          ? crearEtiquetaContextBranch(context.ramaKey, context.nodeId)
          : crearEtiquetaContextMain(context?.uid || rm24hBloqueSeleccionado);
      mount.innerHTML = htmlEditorBloqueEtiqueta(rm24hEtiquetaContext);
      return;
    }
    if (tipo === "conversion") {
      rm24hConversionContext =
        context?.scope === "branch"
          ? crearConversionContextBranch(context.ramaKey, context.nodeId)
          : crearConversionContextMain(context?.uid || rm24hBloqueSeleccionado);
      mount.innerHTML = htmlEditorBloqueConversion(rm24hConversionContext);
      return;
    }
    mount.innerHTML = htmlEditorBloqueNodoFuturo(tipo);
  }

  function htmlEditorBloqueAgenteRapido() {
    const ar = getAgenteRapidoActivo();
    const comp = ar.comportamiento || crearAgenteRapidoVacio().comportamiento;
    return (
      '<section class="rm24-section rm24-section--agente-rapido rm24-section--bloque-editor">' +
      '<header class="rm24-ar-hero">' +
      '<div class="rm24-ar-hero__top">' +
      '<h5 class="rm24-ar-hero__title">⚡ Agente rápido</h5></div>' +
      '<p class="rm24h-hint rm24-ar-hero__desc">Detecta intención del lead y ejecuta un camino.</p></header>' +
      '<input type="hidden" id="rm24hAgenteRapidoModo" value="caminos">' +
      '<section class="rm24-ar-card rm24-ar-card--routes">' +
      '<h6 class="rm24-ar-card__title">CAMINOS DE RUTEO</h6>' +
      '<p class="rm24-ar-card__hint">Cada salida detecta intención por texto y sinónimos.</p>' +
      '<div id="rm24hAgenteRapidoCaminos" class="rm24-ar-caminos-lista"></div>' +
      '<button type="button" class="panel-btn rm24-ar-btn-add" id="rm24hAgenteRapidoAddCamino">+ Agregar camino</button></section>' +
      '<section class="rm24-ar-card rm24-ar-card--behavior">' +
      '<h6 class="rm24-ar-card__title">COMPORTAMIENTO</h6>' +
      '<label class="rm24-ar-toggle">' +
      '<input type="checkbox" id="rm24hAgenteRapidoResponderFallback"' +
      (comp.responderSiNoCoincide !== false ? " checked" : "") +
      '><span class="rm24-ar-toggle__track" aria-hidden="true"></span>' +
      '<span class="rm24-ar-toggle__label">Responder si no coincide</span></label>' +
      '<div class="rm24h-field rm24-field">' +
      "<label for=\"rm24hAgenteRapidoMensajeFallback\">Mensaje fallback</label>" +
      '<textarea id="rm24hAgenteRapidoMensajeFallback" class="rm24-input rm24-textarea rm24-ar-textarea" rows="3" placeholder="Te ayudo 😊 ¿quieres que te pase el precio o los métodos de pago?">' +
      esc(comp.mensajeFallback) +
      "</textarea></div>" +
      '<label class="rm24-ar-toggle">' +
      '<input type="checkbox" id="rm24hAgenteRapidoActivarFlujos"' +
      (comp.activarOtrosFlujos ? " checked" : "") +
      '><span class="rm24-ar-toggle__track" aria-hidden="true"></span>' +
      '<span class="rm24-ar-toggle__label">Activar otros flujos (antes del fallback)</span></label>' +
      '<label class="rm24-ar-toggle">' +
      '<input type="checkbox" id="rm24hAgenteRapidoResponderAudio"' +
      (comp.responderConAudio ? " checked" : "") +
      '><span class="rm24-ar-toggle__track" aria-hidden="true"></span>' +
      '<span class="rm24-ar-toggle__label">Responder con audio (usa transcripción si existe)</span></label></section></section>'
    );
  }

  function htmlCaminoAgenteRapidoCard(camino, index) {
    const c = mapearCaminoAgenteRapidoUi(camino) || crearCaminoAgenteRapidoVacio();
    return (
      '<article class="rm24-ar-ruta-row" data-camino-id="' +
      esc(c.id) +
      '" data-camino-index="' +
      index +
      '">' +
      '<div class="rm24-ar-ruta-head">' +
      '<span class="rm24-ar-ruta-num">Ruta ' +
      (index + 1) +
      "</span>" +
      '<label class="rm24-ar-ruta-enabled-wrap">' +
      '<input type="checkbox" class="rm24-ar-ruta-enabled"' +
      (c.enabled !== false ? " checked" : "") +
      "> Activo</label>" +
      '<button type="button" class="rm24-ar-ruta-del" data-rm24-ar-remove="' +
      esc(c.id) +
      '">Eliminar</button></div>' +
      '<div class="rm24h-field rm24-field">' +
      "<label>Texto del camino</label>" +
      '<input type="text" class="rm24-input rm24-ar-texto" placeholder="Ej: qr" value="' +
      esc(c.nombre || c.texto) +
      '"></div>' +
      '<div class="rm24h-field rm24-field">' +
      "<label>Sinónimos (coma)</label>" +
      '<textarea class="rm24-input rm24-textarea rm24-ar-sinonimos" rows="2" placeholder="pago, transferencia, depósito, tigo money">' +
      esc(palabrasClaveToString(c.palabrasClave)) +
      "</textarea></div>" +
      '<div class="rm24h-field rm24-field">' +
      "<label>Respuesta</label>" +
      '<textarea class="rm24-input rm24-textarea rm24-ar-respuesta" rows="3" placeholder="Perfecto 😊 te paso los datos de pago">' +
      esc(c.respuesta) +
      "</textarea></div>" +
      '<div class="rm24h-field rm24-field">' +
      "<label>Acción siguiente</label>" +
      htmlSelectAccionSiguiente(c.accionSiguiente, "rm24-input rm24-ar-accion") +
      "</div></article>"
    );
  }

  function renderAgenteRapidoCaminos() {
    const wrap = document.getElementById("rm24hAgenteRapidoCaminos");
    const addBtn = document.getElementById("rm24hAgenteRapidoAddCamino");
    if (!wrap) return;
    const ar = getAgenteRapidoActivo();
    const caminos = Array.isArray(ar.caminos) ? ar.caminos : [];
    if (!caminos.length) {
      wrap.innerHTML =
        '<div class="rm24-ar-caminos-vacio-wrap">' +
        '<p class="rm24-ar-caminos-vacio">No hay caminos todavía</p>' +
        '<span class="rm24-ar-caminos-vacio-hint">Agrega un camino para enrutar por intención</span>' +
        '<button type="button" class="panel-btn rm24-ar-btn-add rm24-ar-btn-add--inline" id="rm24hAgenteRapidoAddCaminoEmpty">+ Agregar camino</button></div>';
      if (addBtn) addBtn.hidden = true;
      return;
    }
    if (addBtn) addBtn.hidden = false;
    wrap.innerHTML = caminos
      .map(function (c, i) {
        return htmlCaminoAgenteRapidoCard(c, i);
      })
      .join("");
  }

  function syncAgenteRapidoDesdePanel() {
    const ar = getAgenteRapidoActivo();
    ar.modo = "caminos";

    const cards = document.querySelectorAll("#rm24hAgenteRapidoCaminos .rm24-ar-ruta-row");
    if (cards.length) {
      const caminos = [];
      cards.forEach(function (card) {
        const prev = (ar.caminos || []).find(function (c) {
          return c.id === card.getAttribute("data-camino-id");
        });
        const nombre = String(card.querySelector(".rm24-ar-texto")?.value ?? "");
        const palabrasArr = palabrasClaveToArray(
          card.querySelector(".rm24-ar-sinonimos")?.value ?? ""
        );
        caminos.push({
          id: card.getAttribute("data-camino-id") || crearUidCaminoAgenteRapido(),
          nombre: nombre,
          texto: nombre,
          nombreCamino: nombre,
          palabrasClave: palabrasArr,
          sinonimos: palabrasArr.join(", "),
          descripcionIntencion: prev ? String(prev.descripcionIntencion || "") : "",
          respuesta: String(card.querySelector(".rm24-ar-respuesta")?.value ?? ""),
          accionSiguiente: normalizarAccionSiguiente(
            card.querySelector(".rm24-ar-accion")?.value
          ),
          activo: !!card.querySelector(".rm24-ar-ruta-enabled")?.checked,
          enabled: !!card.querySelector(".rm24-ar-ruta-enabled")?.checked,
          next: Array.isArray(prev?.next)
            ? prev.next.map(normalizarNodoRamaAgenteRapido).filter(Boolean)
            : [],
        });
      });
      ar.caminos = caminos;
    }

    const prevDefault = ar.default || { respuesta: "", next: [] };
    ar.comportamiento = {
      responderSiNoCoincide:
        !!document.getElementById("rm24hAgenteRapidoResponderFallback")?.checked,
      mensajeFallback: String(
        document.getElementById("rm24hAgenteRapidoMensajeFallback")?.value ??
          crearAgenteRapidoVacio().comportamiento.mensajeFallback
      ),
      activarOtrosFlujos: !!document.getElementById("rm24hAgenteRapidoActivarFlujos")?.checked,
      responderConAudio: !!document.getElementById("rm24hAgenteRapidoResponderAudio")?.checked,
    };
    ar.default = {
      respuesta: String(
        document.getElementById("rm24hAgenteRapidoMensajeFallback")?.value ??
          prevDefault.respuesta ??
          crearAgenteRapidoVacio().default.respuesta
      ),
      next: Array.isArray(prevDefault.next)
        ? prevDefault.next.map(normalizarNodoRamaAgenteRapido).filter(Boolean)
        : [],
    };
    sincronizarCaminoDefaultDesdeComportamiento(ar);
    configActiva.rm24h_agente_rapido = ar;
  }

  function addAgenteRapidoCamino() {
    syncAgenteRapidoDesdePanel();
    const ar = getAgenteRapidoActivo();
    ar.caminos.push(crearCaminoAgenteRapidoVacio());
    configActiva.rm24h_agente_rapido = ar;
    renderAgenteRapidoCaminos();
    actualizarEmbudoRmPanel();
    persistirConfigPanelEnNodo();
  }

  function removeAgenteRapidoCamino(caminoId) {
    syncAgenteRapidoDesdePanel();
    const ar = getAgenteRapidoActivo();
    ar.caminos = (ar.caminos || []).filter(function (c) {
      return c.id !== caminoId;
    });
    if (String(rm24hBloqueSeleccionado || "").indexOf("ar_camino:" + caminoId) === 0) {
      const nodoAr = findNodoAgenteRapidoMiniFlujo();
      rm24hBloqueSeleccionado = nodoAr ? nodoAr.uid : "espera";
    }
    configActiva.rm24h_agente_rapido = ar;
    renderAgenteRapidoCaminos();
    actualizarEmbudoRmPanel();
    persistirConfigPanelEnNodo();
  }

  function htmlEditorBloqueLectorPagos(context) {
    const ctx = context || rm24hLectorPagosContext || crearLectorPagosContextMain();
    const lp = getLectorPagosPorContexto(ctx);
    const c = normalizarLectorPagosConfig(lp.config);
    const tiempo = c.tiempoMaximoEspera;
    const storageHint =
      ctx.scope === "branch"
        ? "Se guarda en <code>caminos[].next[].config</code>"
        : "Se guarda en <code>rm24h_lector_pagos</code>";
    return (
      '<section class="rm24-section rm24-section--lector-pagos rm24-section--bloque-editor">' +
      '<header class="rm24-ar-hero">' +
      '<div class="rm24-ar-hero__top">' +
      '<h5 class="rm24-ar-hero__title">💳 Lector de pagos</h5></div>' +
      '<p class="rm24h-hint rm24-ar-hero__desc">Pago válido: envía link de entrega y continúa al siguiente nodo. Pago inválido: mensaje al lead y sigue esperando comprobante.</p></header>' +
      '<div class="rm24h-field rm24-field">' +
      '<label class="rm24-switch rm24h-toggle">' +
      '<input type="checkbox" id="rm24hLectorPagosActivo"' +
      (c.activo ? " checked" : "") +
      '><span class="rm24-switch-track" aria-hidden="true"></span>' +
      '<span class="rm24-switch-label">1. Activar lector</span></label></div>' +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hLectorPagosProducto">2. Nombre / Producto</label>' +
      '<input type="text" id="rm24hLectorPagosProducto" class="rm24-input" placeholder="Ej: Papercraft" value="' +
      esc(c.producto) +
      '"></div>' +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hLectorPagosNombreEsperado">3. Nombre esperado en comprobante</label>' +
      '<input type="text" id="rm24hLectorPagosNombreEsperado" class="rm24-input" placeholder="Ej: Marco Antonio Arias Perez" value="' +
      esc(c.nombreEsperado) +
      '"></div>' +
      '<div class="rm24-tiempo-grid">' +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hLectorPagosMonto">4. Precio / Monto esperado</label>' +
      '<input type="number" id="rm24hLectorPagosMonto" class="rm24-input" min="0" step="0.01" inputmode="decimal" placeholder="Ej: 29" value="' +
      esc(String(c.montoEsperado)) +
      '"></div>' +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hLectorPagosMoneda">5. Moneda</label>' +
      '<select id="rm24hLectorPagosMoneda" class="rm24-input">' +
      RM24H_LECTOR_MONEDAS.map(function (m) {
        return (
          '<option value="' +
          esc(m) +
          '"' +
          (m === c.moneda ? " selected" : "") +
          ">" +
          esc(m) +
          "</option>"
        );
      }).join("") +
      "</select></div></div>" +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hLectorPagosLinkEntrega">6. Link de entrega del producto</label>' +
      '<input type="url" id="rm24hLectorPagosLinkEntrega" class="rm24-input" placeholder="https://..." value="' +
      esc(c.linkEntrega) +
      '"></div>' +
      '<fieldset class="rm24h-field rm24-field rm24-lector-validacion">' +
      "<legend>7. Validación</legend>" +
      '<label class="rm24-ar-ruta-enabled-wrap">' +
      '<input type="checkbox" id="rm24hLectorPagosVerificarNombre"' +
      (c.verificarNombre ? " checked" : "") +
      "> Verificar nombre en comprobante</label>" +
      '<label class="rm24-ar-ruta-enabled-wrap">' +
      '<input type="checkbox" id="rm24hLectorPagosVerificarMonto"' +
      (c.verificarMonto ? " checked" : "") +
      "> Verificar monto</label>" +
      '<label class="rm24-ar-ruta-enabled-wrap">' +
      '<input type="checkbox" id="rm24hLectorPagosVerificarFecha"' +
      (c.verificarFecha ? " checked" : "") +
      "> Verificar fecha del comprobante</label>" +
      '<label class="rm24-ar-ruta-enabled-wrap">' +
      '<input type="checkbox" id="rm24hLectorPagosRevisionManual"' +
      (c.revisionManualSiFalla ? " checked" : "") +
      "> Permitir revisión manual si falla</label></fieldset>" +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hLectorPagosMensajeInvalido">8. Mensaje si pago inválido</label>' +
      '<textarea id="rm24hLectorPagosMensajeInvalido" class="rm24-input rm24-textarea" rows="3" placeholder="No pude validar el comprobante 😅 ¿puedes enviarlo más claro?">' +
      esc(c.mensajePagoNoValido) +
      "</textarea></div>" +
      '<div class="rm24h-field rm24-field">' +
      "<label>9. Tiempo máximo de espera</label>" +
      '<div class="rm24-tiempo-grid">' +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hLectorPagosEsperaValor">Valor</label>' +
      '<input type="number" id="rm24hLectorPagosEsperaValor" class="rm24-input" min="1" step="1" inputmode="numeric" value="' +
      esc(String(tiempo.valor)) +
      '"></div>' +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hLectorPagosEsperaUnidad">Unidad</label>' +
      '<select id="rm24hLectorPagosEsperaUnidad" class="rm24-input rm24-tiempo-unidad">' +
      '<option value="minutos"' +
      (tiempo.unidad === "minutos" ? " selected" : "") +
      ">Minutos</option>" +
      '<option value="horas"' +
      (tiempo.unidad === "horas" ? " selected" : "") +
      ">Horas</option>" +
      '<option value="dias"' +
      (tiempo.unidad === "dias" ? " selected" : "") +
      ">Días</option></select></div></div></div>" +
      '<p class="rm24h-hint">ID nodo: <code>' +
      esc(lp.id) +
      "</code> · " +
      storageHint +
      "</p></section>"
    );
  }

  function syncLectorPagosDesdePanel() {
    const ctx = rm24hLectorPagosContext || crearLectorPagosContextMain();
    const prev = getLectorPagosPorContexto(ctx);
    const monto = parseFloat(document.getElementById("rm24hLectorPagosMonto")?.value);
    setLectorPagosPorContexto(ctx, {
      type: "lector_pagos",
      id: prev.id,
      config: {
        activo: !!document.getElementById("rm24hLectorPagosActivo")?.checked,
        producto: String(document.getElementById("rm24hLectorPagosProducto")?.value ?? ""),
        nombreEsperado: String(
          document.getElementById("rm24hLectorPagosNombreEsperado")?.value ?? ""
        ).trim(),
        montoEsperado: Number.isFinite(monto) && monto >= 0 ? monto : 0,
        moneda: document.getElementById("rm24hLectorPagosMoneda")?.value,
        linkEntrega: String(document.getElementById("rm24hLectorPagosLinkEntrega")?.value ?? "").trim(),
        verificarNombre: !!document.getElementById("rm24hLectorPagosVerificarNombre")?.checked,
        verificarMonto: !!document.getElementById("rm24hLectorPagosVerificarMonto")?.checked,
        verificarFecha: !!document.getElementById("rm24hLectorPagosVerificarFecha")?.checked,
        revisionManualSiFalla:
          !!document.getElementById("rm24hLectorPagosRevisionManual")?.checked,
        mensajePagoNoValido: String(
          document.getElementById("rm24hLectorPagosMensajeInvalido")?.value ?? ""
        ),
        tiempoMaximoEspera: {
          valor: document.getElementById("rm24hLectorPagosEsperaValor")?.value,
          unidad: document.getElementById("rm24hLectorPagosEsperaUnidad")?.value,
        },
      },
    });
  }

  function htmlEditorBloqueEtiqueta(context) {
    const ctx = context || rm24hEtiquetaContext || crearEtiquetaContextMain();
    const cfg = getEtiquetaPorContexto(ctx);
    const storageHint =
      ctx.scope === "branch"
        ? "Se guarda en <code>caminos[].next[]</code> como <code>{ type: &quot;etiqueta&quot;, config }</code>"
        : "Se guarda en <code>rm24h_mini_flujo</code>";
    return (
      '<section class="rm24-section rm24-section--etiqueta rm24-section--bloque-editor">' +
      '<header class="rm24-ar-hero">' +
      '<div class="rm24-ar-hero__top">' +
      '<h5 class="rm24-ar-hero__title">🏷 Etiqueta RM</h5></div>' +
      '<p class="rm24h-hint rm24-ar-hero__desc">Aplica o quita una etiqueta CRM al lead durante el remarketing.</p></header>' +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hEtiquetaNombre">1. Nombre etiqueta</label>' +
      '<input type="text" id="rm24hEtiquetaNombre" class="rm24-input" placeholder="Ej: Cliente caliente RM" value="' +
      esc(cfg.nombre) +
      '"></div>' +
      '<div class="rm24h-field rm24-field">' +
      "<label>2. Color</label>" +
      htmlRmEtiquetaColorSwatches(cfg.color) +
      '<input type="hidden" id="rm24hEtiquetaColor" value="' +
      esc(cfg.color) +
      '"></div>' +
      '<div class="rm24h-field rm24-field rm24-etiqueta-preview-wrap">' +
      "<label>Vista previa</label>" +
      '<div id="rm24hEtiquetaPreview">' +
      htmlRmEtiquetaBadge(cfg.nombre || "Cliente caliente RM", cfg.color) +
      "</div></div>" +
      '<div class="rm24h-field rm24-field">' +
      "<label>3. Acción</label>" +
      htmlRmEtiquetaAccionToggle(cfg.accion) +
      '<input type="hidden" id="rm24hEtiquetaAccion" value="' +
      esc(cfg.accion) +
      '"></div>' +
      '<p class="rm24h-hint rm24-etiqueta-storage-hint">' +
      storageHint +
      "</p></section>"
    );
  }

  function actualizarPreviewEtiquetaPanel() {
    const preview = document.getElementById("rm24hEtiquetaPreview");
    if (!preview) return;
    const nombre = String(document.getElementById("rm24hEtiquetaNombre")?.value ?? "").trim();
    const color = document.getElementById("rm24hEtiquetaColor")?.value || "orange";
    preview.innerHTML = htmlRmEtiquetaBadge(nombre || "Sin nombre", color);
  }

  function syncEtiquetaDesdePanel() {
    const ctx = rm24hEtiquetaContext || crearEtiquetaContextMain();
    setEtiquetaPorContexto(ctx, {
      nombre: String(document.getElementById("rm24hEtiquetaNombre")?.value ?? ""),
      color: document.getElementById("rm24hEtiquetaColor")?.value,
      accion: document.getElementById("rm24hEtiquetaAccion")?.value,
    });
  }

  function htmlEditorBloqueConversion(context) {
    const ctx = context || rm24hConversionContext || crearConversionContextMain();
    const cfg = getConversionPorContexto(ctx);
    const storageHint =
      ctx.scope === "branch"
        ? "Se guarda en <code>caminos[].next[]</code> como <code>{ type: &quot;conversion&quot;, id, config }</code>"
        : "Se guarda en <code>rm24h_mini_flujo</code>";
    return (
      '<section class="rm24-section rm24-section--conversion rm24-section--bloque-editor">' +
      '<header class="rm24-ar-hero">' +
      '<div class="rm24-ar-hero__top">' +
      '<h5 class="rm24-ar-hero__title">🎯 Conversión RM</h5></div>' +
      '<p class="rm24h-hint rm24-ar-hero__desc">Define la conversión que se registrará cuando el lead pase por este nodo (solo configuración; runtime pendiente).</p></header>' +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hConversionNombre">1. Nombre de conversión</label>' +
      '<input type="text" id="rm24hConversionNombre" class="rm24-input" placeholder="Ej: Venta Papercraft RM" value="' +
      esc(cfg.nombre) +
      '"></div>' +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hConversionProducto">2. Producto</label>' +
      '<input type="text" id="rm24hConversionProducto" class="rm24-input" placeholder="Ej: Papercraft 4000 plantillas" value="' +
      esc(cfg.producto) +
      '"></div>' +
      '<div class="rm24-tiempo-grid">' +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hConversionValor">3. Valor</label>' +
      '<input type="number" id="rm24hConversionValor" class="rm24-input" min="0" step="0.01" inputmode="decimal" placeholder="39" value="' +
      esc(String(cfg.valor)) +
      '"></div>' +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hConversionMoneda">4. Moneda</label>' +
      '<select id="rm24hConversionMoneda" class="rm24-input">' +
      RM24H_CONVERSION_MONEDAS.map(function (m) {
        return (
          '<option value="' +
          esc(m) +
          '"' +
          (m === cfg.moneda ? " selected" : "") +
          ">" +
          esc(m) +
          "</option>"
        );
      }).join("") +
      "</select></div></div>" +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hConversionTipo">5. Tipo</label>' +
      '<select id="rm24hConversionTipo" class="rm24-input">' +
      RM24H_CONVERSION_TIPOS.map(function (t) {
        return (
          '<option value="' +
          esc(t.value) +
          '"' +
          (t.value === cfg.tipo ? " selected" : "") +
          ">" +
          esc(t.label) +
          "</option>"
        );
      }).join("") +
      "</select></div>" +
      '<div class="rm24h-field rm24-field">' +
      '<label for="rm24hConversionDespues">6. Después de convertir</label>' +
      '<select id="rm24hConversionDespues" class="rm24-input">' +
      RM24H_CONVERSION_DESPUES.map(function (d) {
        return (
          '<option value="' +
          esc(d.value) +
          '"' +
          (d.value === cfg.despues ? " selected" : "") +
          ">" +
          esc(d.label) +
          "</option>"
        );
      }).join("") +
      "</select></div>" +
      '<p class="rm24h-hint rm24-conversion-storage-hint">' +
      storageHint +
      "</p></section>"
    );
  }

  function syncConversionDesdePanel() {
    const ctx = rm24hConversionContext || crearConversionContextMain();
    const valorRaw = parseFloat(document.getElementById("rm24hConversionValor")?.value);
    setConversionPorContexto(ctx, {
      nombre: String(document.getElementById("rm24hConversionNombre")?.value ?? ""),
      producto: String(document.getElementById("rm24hConversionProducto")?.value ?? ""),
      valor: Number.isFinite(valorRaw) ? valorRaw : 0,
      moneda: document.getElementById("rm24hConversionMoneda")?.value,
      tipo: document.getElementById("rm24hConversionTipo")?.value,
      despues: document.getElementById("rm24hConversionDespues")?.value,
    });
  }

  function htmlEditorBloqueNodoFuturo(tipo) {
    const cat = getCatalogoNodoRm24(tipo);
    const label = cat?.label || "Nodo RM";
    return (
      '<section class="rm24-section rm24-section--bloque-editor rm24-section--bloque-futuro">' +
      '<h5 class="rm24-section-title">' +
      esc(label) +
      "</h5>" +
      '<p class="rm24h-hint">Configura este nodo cuando el editor esté disponible.</p>' +
      '<div class="rm24-bloque-futuro-card">' +
      '<span class="rm24-future-badge">Próximamente</span>' +
      "<p>Este tipo de nodo aún no tiene editor en el mini flujo RM.</p></div></section>"
    );
  }

  function htmlEditorBloqueFin() {
    return (
      '<section class="rm24-section rm24-section--bloque-editor rm24-section--bloque-fin">' +
      '<h5 class="rm24-section-title">Fin del mini flujo</h5>' +
      '<p class="rm24h-hint">Comportamiento actual del remarketing global (sin cambios).</p>' +
      '<ul class="rm24-mini-flujo-fin-list">' +
      "<li>Tras enviar remarketing, el lead queda en estado remarketing.</li>" +
      "<li>No regresa al flujo normal del canvas.</li>" +
      "<li>El flujo se cierra como <code>cerrado_sin_respuesta</code>.</li>" +
      "</ul></section>"
    );
  }

  function renderRm24BloqueEditor() {
    const mount = document.getElementById("rm24hBloqueEditor");
    if (!mount) return;
    if (document.getElementById("rm24hStepEditor")) {
      syncEditorPasoToContenidos();
    }
    syncMiniNodoContextDesdeSeleccion();
    const tiempo = obtenerTiempoInactividadActual();

    if (rm24hBloqueSeleccionado === "espera") {
      mount.innerHTML =
        htmlEditorBloqueEspera(tiempo) +
        htmlEditorBloqueReglas() +
        htmlEditorBloqueComportamientoRm(configActiva.rm_context_policy);
      bindTiempoPanelEvents();
      bindComportamientoRmPanelEvents();
      actualizarHintTiempoPanel(configActiva.tiempoInactividad || tiempo);
      return;
    }
    if (rm24hBloqueSeleccionado === "fin") {
      mount.innerHTML = htmlEditorBloqueFin();
      return;
    }
    const nodo = getMiniFlujoNodo(rm24hBloqueSeleccionado);
    const arSel = parseSeleccionAgenteRapido(rm24hBloqueSeleccionado);
    if (arSel) {
      if (arSel.kind === "node") {
        const found = findNodoEnCaminoAgenteRapido(arSel.ramaKey, arSel.nodeId);
        if (found) {
          mountEditorMiniNodoRm(
            found,
            crearMiniNodoContextBranch(
              arSel.ramaKey,
              arSel.nodeId,
              0,
              getNextArrayPorRamaKey(arSel.ramaKey)?.length || 0
            )
          );
          return;
        }
      }
      if (!configActiva.rm24h_agente_rapido) {
        configActiva.rm24h_agente_rapido = crearAgenteRapidoVacio();
      }
      mount.innerHTML = htmlEditorBloqueAgenteRapido();
      renderAgenteRapidoCaminos();
      return;
    }
    if (!nodo) {
      rm24hBloqueSeleccionado = "espera";
      renderRm24BloqueEditor();
      return;
    }
    if (nodo.tipo === "contenido") {
      mountEditorMiniNodoRm(
        { type: "contenido", tipo: "contenido" },
        crearMiniNodoContextMain(nodo.uid, 0, rm24hMiniFlujoNodos.length)
      );
      return;
    }
    if (nodo.tipo === "agente_rapido") {
      mountEditorMiniNodoRm(
        { type: "agente_rapido", tipo: "agente_rapido" },
        crearMiniNodoContextMain(nodo.uid, 0, rm24hMiniFlujoNodos.length)
      );
      return;
    }
    if (nodo.tipo === "lector_pagos") {
      mountEditorMiniNodoRm(
        { type: "lector_pagos", tipo: "lector_pagos" },
        crearMiniNodoContextMain(nodo.uid, 0, rm24hMiniFlujoNodos.length)
      );
      return;
    }
    if (nodo.tipo === "etiqueta") {
      mountEditorMiniNodoRm(
        { type: "etiqueta", tipo: "etiqueta", config: nodo.config, uid: nodo.uid },
        crearMiniNodoContextMain(nodo.uid, 0, rm24hMiniFlujoNodos.length)
      );
      return;
    }
    if (nodo.tipo === "conversion") {
      mountEditorMiniNodoRm(
        { type: "conversion", tipo: "conversion", config: nodo.config, uid: nodo.uid },
        crearMiniNodoContextMain(nodo.uid, 0, rm24hMiniFlujoNodos.length)
      );
      return;
    }
    mount.innerHTML = htmlEditorBloqueNodoFuturo(nodo.tipo);
  }

  function htmlEmbudoConnector() {
    return (
      '<div class="rm24-embudo-connector rm24-embudo-connector--premium" aria-hidden="true">' +
      '<span class="rm24-embudo-connector-line"></span>' +
      '<span class="rm24-embudo-connector-arrow">▼</span></div>'
    );
  }

  function actualizarEmbudoRmPanel() {
    const embudo = document.getElementById("rm24hEmbudoRm");
    if (!embudo) return;

    const activo = !!document.getElementById("rm24hActivo")?.checked;
    const section = document.getElementById("rm24hEmbudoSection");
    if (section) {
      section.classList.toggle("rm24-section--embudo-inactivo", !activo);
    }
    embudo.classList.toggle("rm24-embudo--inactivo", !activo);

    const tiempo = obtenerTiempoInactividadActual();

    const contenidos = obtenerContenidosParaEmbudo();
    const pasoCountEl = document.getElementById("rm24hEmbudoPasoCount");
    const tiempoTotalEl = document.getElementById("rm24hEmbudoTiempoTotal");
    const nNodos =
      rm24hMiniFlujoNodos.length + contarNodosRamaAgenteRapido(configActiva.rm24h_agente_rapido);
    if (pasoCountEl) {
      pasoCountEl.textContent = nNodos + " nodo" + (nNodos === 1 ? "" : "s");
    }
    if (tiempoTotalEl) {
      tiempoTotalEl.textContent = "Espera: " + calcularTiempoEsperaEmbudo(tiempo);
    }

    if (esNodoContenidoSeleccionado()) {
      const editableCount = (contenidos || []).filter(esContenidoEditableRm24).length;
      clampPasoSeleccionado(editableCount);
      if (
        editableCount &&
        !esContenidoEditableRm24(getRm24ContenidosActivos()[rm24hPasoSeleccionado])
      ) {
        rm24hPasoSeleccionado = indicePrimerContenidoEditable(getRm24ContenidosActivos());
      }
    }

    embudo.innerHTML = renderMiniFlujoRmHtml(
      contenidos,
      tiempo,
      rm24hBloqueSeleccionado
    );
  }

  function htmlPresetsTiempoInactividad(unidad, valorActivo) {
    const presets = PRESETS_TIEMPO_INACTIVIDAD[unidad] || PRESETS_TIEMPO_INACTIVIDAD.horas;
    return (
      '<div class="rm24-tiempo-presets" id="rm24hTiempoPresets" role="group" aria-label="Valores recomendados">' +
      presets
        .map(function (n) {
          const active = Number(valorActivo) === n ? " rm24-tiempo-preset-btn--active" : "";
          return (
            '<button type="button" class="rm24-tiempo-preset-btn' +
            active +
            '" data-rm24-preset-valor="' +
            n +
            '">' +
            esc(String(n)) +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function sincronizarHorasLegacyDesdeTiempo(config) {
    const tiempo = normalizarTiempoInactividad(config);
    config.tiempoInactividad = tiempo;
    if (tiempo.unidad === "horas") {
      config.horasInactividad = clampHorasInactividad(tiempo.valor);
    } else if (!Number.isFinite(parseInt(config.horasInactividad, 10))) {
      config.horasInactividad = 23;
    }
    return config;
  }

  function tiempoInactividadInputsEnPanel() {
    return !!(
      document.getElementById("rm24hTiempoUnidad") &&
      document.getElementById("rm24hTiempoValor")
    );
  }

  function syncTiempoInactividadDesdePanel() {
    if (!panelRemarketingAbierto() || !tiempoInactividadInputsEnPanel()) return;
    configActiva.tiempoInactividad = leerTiempoDesdePanel();
    sincronizarHorasLegacyDesdeTiempo(configActiva);
  }

  function obtenerTiempoInactividadActual() {
    if (panelRemarketingAbierto() && tiempoInactividadInputsEnPanel()) {
      return leerTiempoDesdePanel();
    }
    return normalizarTiempoInactividad({
      tiempoInactividad: configActiva.tiempoInactividad || { valor: 23, unidad: "horas" },
    });
  }

  function flushEditorBloqueActualAlConfig() {
    if (!panelRemarketingAbierto()) return;
    if (document.getElementById("rm24hStepEditor")) {
      syncEditorPasoToContenidos();
    }
    syncMiniNodoContextDesdeSeleccion();
    syncTiempoInactividadDesdePanel();
    if (document.getElementById("rm24hRmContextUntilConversion")) {
      configActiva.rm_context_policy = leerRmContextPolicyDesdePanel();
    }
    if (esNodoContenidoSeleccionado()) {
      leerContenidosDesdePanel();
    }
    if (esNodoAgenteRapidoSeleccionado()) {
      syncAgenteRapidoDesdePanel();
    }
    if (esNodoLectorPagosSeleccionado()) {
      syncLectorPagosDesdePanel();
    }
  }

  function clampHorasInactividad(val) {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n)) return 23;
    if (n < 1) return 1;
    if (n > 23) return 23;
    return n;
  }

  function normalizarInputTiempoValor(inputEl, unidad) {
    if (!inputEl) return 23;
    const raw = String(inputEl.value || "").replace(/\D/g, "");
    let valor = raw === "" ? NaN : parseInt(raw, 10);
    if (!Number.isFinite(valor) || valor < 1) {
      const presets = PRESETS_TIEMPO_INACTIVIDAD[unidad] || PRESETS_TIEMPO_INACTIVIDAD.horas;
      valor = presets[0] || 23;
    }
    inputEl.value = String(valor);
    return valor;
  }

  function leerTiempoDesdePanel() {
    const unidadEl = document.getElementById("rm24hTiempoUnidad");
    const valorEl = document.getElementById("rm24hTiempoValor");
    if (!unidadEl || !valorEl) {
      return normalizarTiempoInactividad({
        tiempoInactividad: configActiva.tiempoInactividad || { valor: 23, unidad: "horas" },
      });
    }
    const unidad =
      normalizarUnidadTiempoInactividad(unidadEl.value) || "horas";
    const valor = normalizarInputTiempoValor(valorEl, unidad);
    return normalizarTiempoInactividad({
      tiempoInactividad: { valor: valor, unidad: unidad },
    });
  }

  function leerRmContextPolicyDesdePanel() {
    const untilEl = document.getElementById("rm24hRmContextUntilConversion");
    const timeEl = document.getElementById("rm24hRmContextTimeWindow");
    const triggersEl = document.getElementById("rm24hRmContextAllowTriggers");

    let mode = "until_conversion";
    if (timeEl?.checked) mode = "time_window";
    else if (triggersEl?.checked) mode = "allow_normal_triggers";
    else if (untilEl?.checked) mode = "until_conversion";

    const uiUnidad =
      normalizarUnidadTiempoInactividad(
        document.getElementById("rm24hRmContextDurationUnidad")?.value
      ) || "horas";
    const valorEl = document.getElementById("rm24hRmContextDurationValor");
    let value = parseInt(valorEl?.value, 10);
    if (!Number.isFinite(value) || value < 1) value = 24;

    return normalizarRmContextPolicy({
      mode: mode,
      duration: {
        value: value,
        unit: unidadUiARmContextPolicy(uiUnidad),
      },
    });
  }

  function setRmContextModeEnPanel(mode) {
    const modes = {
      until_conversion: document.getElementById("rm24hRmContextUntilConversion"),
      time_window: document.getElementById("rm24hRmContextTimeWindow"),
      allow_normal_triggers: document.getElementById("rm24hRmContextAllowTriggers"),
    };
    Object.keys(modes).forEach(function (key) {
      if (modes[key]) modes[key].checked = key === mode;
    });
    const durationWrap = document.getElementById("rm24hRmContextDurationWrap");
    if (durationWrap) durationWrap.hidden = mode !== "time_window";
  }

  function renderPresetsTiempoPanel(tiempo) {
    const t = normalizarTiempoInactividad({ tiempoInactividad: tiempo });
    const mount = document.getElementById("rm24hTiempoPresets");
    if (!mount) return;
    mount.outerHTML = htmlPresetsTiempoInactividad(t.unidad, t.valor);
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
      detenerSiResponde: false,
      reiniciarAlResponder: parsed.reiniciarAlResponder !== false,
      detenerEnConversion: parsed.detenerEnConversion !== false,
      rm24h_contenidos: normalizarContenidosLista(
        parsed.rm24h_contenidos,
        parsed.mensajeRemarketing || parsed.mensaje_remarketing
      ),
    });
    if (parsed.rm24h_agente_rapido) {
      config.rm24h_agente_rapido = normalizarAgenteRapidoConfig(parsed.rm24h_agente_rapido);
    }
    if (parsed.rm24h_lector_pagos) {
      config.rm24h_lector_pagos = normalizarLectorPagosNodo(parsed.rm24h_lector_pagos);
    }
    if (Array.isArray(parsed.rm24h_mini_flujo)) {
      config.rm24h_mini_flujo = parsed.rm24h_mini_flujo
        .map(function (item) {
          const tipo = String(item.type || item.tipo || "").toLowerCase();
          const out = {
            uid: String(item.uid || ""),
            type: tipo,
          };
          if (tipo === "etiqueta") {
            out.config = normalizarEtiquetaConfig(item.config);
          }
          if (tipo === "conversion") {
            out.config = normalizarConversionConfig(item.config);
          }
          return out;
        })
        .filter(function (item) {
          return item.uid && item.type;
        });
    }
    config.rm_context_policy = normalizarRmContextPolicy(parsed.rm_context_policy);
    sincronizarHorasLegacyDesdeTiempo(config);

    sincronizarMensajeRemarketingDesdeContenidos(config);
    nodo.__rm24hConfig = config;
    return config;
  }

  function guardarConfigEnNodo(nodo, config) {
    if (!nodo || !config) return;
    const payload = Object.assign({}, config, { version: 1 });
    sincronizarHorasLegacyDesdeTiempo(payload);
    sincronizarMensajeRemarketingDesdeContenidos(payload);
    const json = JSON.stringify(payload);
    const ta = nodo.querySelector(".remarketing-global-data");
    if (ta) {
      ta.value = json;
      ta.textContent = json;
    }
    nodo.__rm24hConfig = payload;
    renderPreviewNodo(nodo, payload);
  }

  function renderPreviewNodo(nodo, config) {
    const body = nodo.querySelector(".rm24h-body");
    if (!body) return;

    nodo.classList.add("rm24-global-node");
    nodo.classList.toggle("rm24-global-node-active", !!config.activo);

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
      retraso: "Retraso visual",
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
        '<div class="rm24-preview-chips rm24-global-content-chips">' +
        chips
          .map(function (lbl) {
            return (
              '<span class="rm24-preview-chip rm24-global-content-chip">' +
              esc(lbl) +
              "</span>"
            );
          })
          .join("") +
        "</div>";
    }
    if (!previewHtml) {
      previewHtml =
        '<p class="rm24h-preview rm24-node-msg-preview">Sin contenido configurado</p>';
    }

    body.innerHTML =
      '<div class="rm24-status rm24-global-status rm24h-badge-on">ACTIVO</div>' +
      '<ul class="rm24-summary rm24-summary--compact" aria-label="Resumen del remarketing">' +
      '<li><span class="rm24-summary-dot"></span>' +
      esc(etiquetaTiempoInactividadResumen(config.tiempoInactividad)) +
      "</li>" +
      '<li><span class="rm24-summary-dot"></span>Reinicia si responde</li>' +
      '<li><span class="rm24-summary-dot"></span>1 solo envío</li>' +
      '<li><span class="rm24-summary-dot"></span>Termina flujo</li>' +
      "</ul>" +
      previewHtml;
  }

  function ensureDecoracionGlobalNodo(nodo) {
    if (!nodo.querySelector(".rm24-global-halo")) {
      const halo = document.createElement("div");
      halo.className = "rm24-global-halo";
      halo.setAttribute("aria-hidden", "true");
      nodo.insertBefore(halo, nodo.firstChild);
    }
    if (!nodo.querySelector(".rm24-global-orbit")) {
      const orbit = document.createElement("div");
      orbit.className = "rm24-global-orbit";
      orbit.setAttribute("aria-hidden", "true");
      const halo = nodo.querySelector(".rm24-global-halo");
      if (halo && halo.nextSibling) {
        nodo.insertBefore(orbit, halo.nextSibling);
      } else {
        nodo.insertBefore(orbit, nodo.firstChild);
      }
    }
    if (!nodo.querySelector(".rm24-global-badges")) {
      const badges = document.createElement("div");
      badges.className = "rm24-global-badges";
      badges.setAttribute("aria-label", "Tipo de nodo global");
      badges.innerHTML =
        '<span class="rm24-global-badge">GLOBAL</span>' +
        '<span class="rm24-global-badge rm24-global-badge--watchdog">WATCHDOG</span>' +
        '<span class="rm24-global-badge rm24-global-badge--type rm24h-chip">RM24H</span>';
      const header = nodo.querySelector(".rm24h-header, .rm24-node-header");
      if (header) {
        nodo.insertBefore(badges, header);
      } else {
        const body = nodo.querySelector(".rm24h-body, .rm24-node-body");
        if (body) nodo.insertBefore(badges, body);
        else nodo.appendChild(badges);
      }
    }
    if (!nodo.querySelector(".rm24-global-taglines")) {
      const taglines = document.createElement("div");
      taglines.className = "rm24-global-taglines";
      taglines.innerHTML =
        '<p class="rm24-global-tagline">Cerebro global del flujo</p>' +
        '<p class="rm24-global-tagline rm24-global-tagline--sub">No mueve leads entre nodos</p>';
      const header = nodo.querySelector(".rm24h-header, .rm24-node-header");
      if (header) {
        header.insertAdjacentElement("afterend", taglines);
      } else {
        const badges = nodo.querySelector(".rm24-global-badges");
        if (badges) badges.insertAdjacentElement("afterend", taglines);
        else nodo.appendChild(taglines);
      }
    }
  }

  function aplicarShellVisualNodo(nodo) {
    if (!esNodoRemarketingGlobal(nodo)) return;
    nodo.classList.add("rm24-node", "rm24-global-node");
    ensureDecoracionGlobalNodo(nodo);

    const chip =
      nodo.querySelector(".rm24-global-badges .rm24h-chip") ||
      nodo.querySelector(".rm24h-chip");
    if (chip) {
      chip.textContent = "RM24H";
      chip.classList.add(
        "rm24-badge",
        "rm24-badge--type",
        "rm24-badge--pill",
        "rm24-global-badge",
        "rm24-global-badge--type"
      );
    }
    const chipDuplicadoTitulo = nodo.querySelector(
      ".rm24-node-title-row .rm24h-chip, .rm24-node-title-row .rm24-badge"
    );
    if (chipDuplicadoTitulo && nodo.querySelector(".rm24-global-badges")) {
      chipDuplicadoTitulo.remove();
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

  function syncEditorPasoToContenidos() {
    const editor = document.getElementById("rm24hStepEditor");
    if (!editor) return;
    const card = editor.querySelector(".rm24-contenido-item");
    if (!card) return;
    const index = parseInt(card.dataset.index, 10);
    if (!Number.isFinite(index) || index < 0) return;
    const ctx = getContenidoContext();
    const store = getContenidosStorePorContexto(ctx);
    const lista = store.contenidos.slice();
    if (index >= lista.length) return;

    const tipo = card.dataset.tipo;
    const item = Object.assign({}, lista[index] || crearBloqueVacio(tipo));
    if (tipo === "texto") {
      item.tipo = "texto";
      item.texto = String(card.querySelector(".rm24-contenido-texto")?.value ?? "");
    } else if (tipo === "retraso") {
      const cantidad = parseInt(card.querySelector(".rm24-contenido-cantidad")?.value, 10);
      item.tipo = "retraso";
      item.cantidad = Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1;
      item.unidad = String(card.querySelector(".rm24-contenido-unidad")?.value || "minutos");
    } else {
      item.tipo = tipo;
      item.url = String(card.querySelector(".rm24-contenido-url")?.value ?? "");
      item.caption = String(card.querySelector(".rm24-contenido-caption")?.value ?? "");
      if (tipo === "documento") {
        item.filename = String(card.querySelector(".rm24-contenido-filename")?.value ?? "archivo.pdf");
      }
    }
    lista[index] = item;
    setContenidosStorePorContexto(ctx, lista);
  }

  function leerContenidosDesdePanel() {
    syncEditorPasoToContenidos();
    return getRm24ContenidosActivos().slice();
  }

  function clampPasoSeleccionado(total) {
    if (!total || total < 1) {
      rm24hPasoSeleccionado = 0;
      return;
    }
    if (rm24hPasoSeleccionado < 0) rm24hPasoSeleccionado = 0;
    if (rm24hPasoSeleccionado >= total) rm24hPasoSeleccionado = total - 1;
  }

  function selectRm24Paso(index) {
    syncEditorPasoToContenidos();
    const total = getRm24ContenidosActivos().length;
    if (!total) {
      rm24hPasoSeleccionado = 0;
      renderRm24ContentBlocks();
      return;
    }
    rm24hPasoSeleccionado = Math.max(0, Math.min(index, total - 1));
    renderRm24ContentBlocks();
    requestAnimationFrame(function () {
      document
        .getElementById("rm24hStepEditor")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function getRm24ContenidosActivos() {
    return getContenidosStorePorContexto().contenidos;
  }

  function addRm24ContentBlock(tipo) {
    const t = String(tipo || "texto").toLowerCase();
    const tipoNorm = t === "archivo" ? "documento" : t;
    toggleRm24AddPasoMenu(false);
    const ctx = getContenidoContext();
    const lista = leerContenidosDesdePanel();
    lista.push(crearBloqueVacio(tipoNorm));
    setContenidosStorePorContexto(ctx, lista);
    rm24hPasoSeleccionado = lista.length - 1;
    renderRm24ContentBlocks();
    mostrarErrorContenidos("");
    persistirContenidosEnNodo();
    if (RM24H_MEDIA_CLIENT[tipoNorm]) {
      requestAnimationFrame(function () {
        const input = document
          .getElementById("rm24hStepEditor")
          ?.querySelector(".rm24-contenido-file");
        input?.click();
      });
    }
  }

  function removeRm24ContentBlock(index) {
    const ctx = getContenidoContext();
    const lista = leerContenidosDesdePanel();
    if (index < 0 || index >= lista.length) return;
    lista.splice(index, 1);
    setContenidosStorePorContexto(ctx, lista);
    clampPasoSeleccionado(lista.length);
    renderRm24ContentBlocks();
    persistirContenidosEnNodo();
  }

  function moveRm24ContentBlock(index, delta) {
    const ctx = getContenidoContext();
    const lista = leerContenidosDesdePanel();
    const next = index + delta;
    if (index < 0 || index >= lista.length || next < 0 || next >= lista.length) return;
    const tmp = lista[index];
    lista[index] = lista[next];
    lista[next] = tmp;
    setContenidosStorePorContexto(ctx, lista);
    if (rm24hPasoSeleccionado === index) {
      rm24hPasoSeleccionado = next;
    } else if (rm24hPasoSeleccionado === next) {
      rm24hPasoSeleccionado = index;
    }
    renderRm24ContentBlocks();
    persistirContenidosEnNodo();
  }

  function reorderRm24ContentBlock(fromIndex, toIndex) {
    const ctx = getContenidoContext();
    const lista = leerContenidosDesdePanel();
    if (
      fromIndex < 0 ||
      fromIndex >= lista.length ||
      toIndex < 0 ||
      toIndex >= lista.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const selectedId = rm24hPasoSeleccionado;
    const item = lista.splice(fromIndex, 1)[0];
    lista.splice(toIndex, 0, item);
    setContenidosStorePorContexto(ctx, lista);
    if (selectedId === fromIndex) {
      rm24hPasoSeleccionado = toIndex;
    } else if (fromIndex < selectedId && toIndex >= selectedId) {
      rm24hPasoSeleccionado = selectedId - 1;
    } else if (fromIndex > selectedId && toIndex <= selectedId) {
      rm24hPasoSeleccionado = selectedId + 1;
    }
    renderRm24ContentBlocks();
    persistirContenidosEnNodo();
  }

  function updateRm24ContentBlock(index, field, value) {
    const ctx = getContenidoContext();
    const lista = leerContenidosDesdePanel();
    if (index < 0 || index >= lista.length) return;
    lista[index][field] = value;
    setContenidosStorePorContexto(ctx, lista);
    persistirContenidosEnNodo();
  }

  function syncMiniFlujoEditorToConfig() {
    if (esNodoContenidoSeleccionado()) {
      syncEditorPasoToContenidos();
    }
    if (esNodoAgenteRapidoSeleccionado()) {
      syncAgenteRapidoDesdePanel();
    }
    if (esNodoLectorPagosSeleccionado()) {
      syncLectorPagosDesdePanel();
    }
    if (esNodoEtiquetaSeleccionado()) {
      syncEtiquetaDesdePanel();
    }
    if (esNodoConversionSeleccionado()) {
      syncConversionDesdePanel();
    }
  }

  function persistirConfigPanelEnNodo() {
    if (!nodoActivo) return;
    syncMiniFlujoEditorToConfig();
    if (!esNodoContenidoSeleccionado() || getContenidoContext().scope === "main") {
      sincronizarMensajeRemarketingDesdeContenidos(configActiva);
    }
    if (configActiva.rm24h_agente_rapido && !miniFlujoTieneNodoAgenteRapido()) {
      delete configActiva.rm24h_agente_rapido;
    }
    if (configActiva.rm24h_lector_pagos) {
      if (miniFlujoTieneNodoLectorPagos()) {
        configActiva.rm24h_lector_pagos = normalizarLectorPagosNodo(
          configActiva.rm24h_lector_pagos
        );
      } else {
        delete configActiva.rm24h_lector_pagos;
      }
    }
    if (rm24hMiniFlujoNodos.length) {
      configActiva.rm24h_mini_flujo = serializarMiniFlujoParaConfig();
    } else {
      delete configActiva.rm24h_mini_flujo;
    }
    guardarConfigEnNodo(nodoActivo, configActiva);
    if (typeof window.macbotRecordHistoryDebounced === "function") {
      window.macbotRecordHistoryDebounced();
    }
    actualizarEmbudoRmPanel();
  }

  function persistirContenidosEnNodo() {
    persistirConfigPanelEnNodo();
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

      leerContenidosDesdePanel();
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

  function htmlEditorPreviewBlock(item) {
    const resumen = resumenPasoFunnel(item);
    const vacio =
      !resumen ||
      resumen === "Vacío" ||
      resumen === "Sin texto" ||
      resumen === "Sin archivo";
    return (
      '<div class="rm24-step-editor-preview">' +
      '<span class="rm24-step-editor-preview-label">Vista previa del paso</span>' +
      '<p class="rm24-step-editor-preview-text' +
      (vacio ? " rm24-step-editor-preview-text--muted" : "") +
      '">' +
      esc(vacio ? "Sin contenido configurado todavía" : resumen) +
      "</p></div>"
    );
  }

  function htmlStepEditorBody(item, index) {
    const tipo = item.tipo || "texto";
    let campos = "";
    if (tipo === "retraso") {
      const cantidad = item.cantidad ?? 1;
      const unidad = String(item.unidad || "minutos").toLowerCase();
      campos =
        '<div class="rm24-block-body-inner">' +
        '<p class="rm24-block-body-label rm24-field-label">Retraso visual ' +
        etiquetaRetrasoVisualBadge() +
        "</p>" +
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
        '<p class="rm24-upload-hint">Solo visual en Fase 1 · el envío actual no espera este retraso</p></div>';
    } else if (tipo === "texto") {
      campos =
        '<div class="rm24-block-body-inner">' +
        '<p class="rm24-block-body-label rm24-field-label">Contenido del mensaje</p>' +
        '<textarea class="rm24-input rm24-textarea rm24-textarea-premium rm24-contenido-texto" rows="6" placeholder="Escribe el mensaje de remarketing…">' +
        esc(item.texto) +
        "</textarea></div>";
    } else if (RM24H_MEDIA_CLIENT[tipo]) {
      campos =
        '<div class="rm24-block-body-inner">' + htmlCamposMedia(item, index, tipo) + "</div>";
    }

    return (
      '<div class="rm24-contenido-item rm24-step-editor-card" data-tipo="' +
      esc(tipo) +
      '" data-index="' +
      index +
      '">' +
      campos +
      "</div>"
    );
  }

  function htmlStepEditorShell(item, index, total) {
    const tipo = item.tipo || "texto";
    return (
      '<div class="rm24-step-editor-shell">' +
      '<div class="rm24-step-editor-head">' +
      '<div class="rm24-step-editor-head-main">' +
      '<p class="rm24-step-editor-kicker">✏️ Editando contenido #' +
      (index + 1) +
      "</p>" +
      '<p class="rm24-step-editor-type">' +
      iconoTipoContenido(tipo) +
      " Tipo: " +
      esc(etiquetaTipoContenido(tipo)) +
      (tipo === "retraso" ? " " + etiquetaRetrasoVisualBadge() : "") +
      "</p>" +
      htmlEditorPreviewBlock(item) +
      "</div>" +
      '<div class="rm24-step-editor-actions">' +
      '<button type="button" class="rm24-action-icon" data-rm24-move-up="' +
      index +
      '" title="Subir"' +
      (index === 0 ? " disabled" : "") +
      '>↑</button>' +
      '<button type="button" class="rm24-action-icon" data-rm24-move-down="' +
      index +
      '" title="Bajar"' +
      (index >= total - 1 ? " disabled" : "") +
      '>↓</button>' +
      '<button type="button" class="rm24-action-icon rm24-action-icon--danger" data-rm24-remove="' +
      index +
      '" title="Eliminar paso">×</button></div></div>' +
      '<div class="rm24-step-editor-fields">' +
      htmlStepEditorBody(item, index) +
      "</div></div>"
    );
  }

  function htmlRm24ContentPicker(items, selectedIndex) {
    const rows = [];
    (items || []).forEach(function (item, index) {
      if (!esContenidoEditableRm24(item)) return;
      const mapped = mapearItemContenidoUi(item) || item;
      const selected = index === selectedIndex ? " rm24-content-pick--selected" : "";
      rows.push(
        '<button type="button" class="rm24-content-pick' +
        selected +
        '" data-rm24-content-index="' +
        index +
        '" draggable="true" role="tab" aria-selected="' +
        (index === selectedIndex ? "true" : "false") +
        '">' +
        '<span class="rm24-content-pick-icon" aria-hidden="true">' +
        iconoTipoContenido(mapped.tipo) +
        "</span>" +
        '<span class="rm24-content-pick-body">' +
        '<span class="rm24-content-pick-label">' +
        esc(etiquetaTipoContenido(mapped.tipo)) +
        "</span>" +
        '<span class="rm24-content-pick-resumen">' +
        esc(resumenPasoFunnel(mapped)) +
        "</span></span></button>"
      );
    });
    if (!rows.length) return "";
    return (
      '<div class="rm24-content-picker" id="rm24hContentPicker" role="tablist" aria-label="Contenidos del remarketing">' +
      rows.join("") +
      "</div>"
    );
  }

  function renderRm24ContentPicker() {
    const wrap = document.getElementById("rm24hContentPickerWrap");
    if (!wrap) return;
    const items = getRm24ContenidosActivos();
    wrap.innerHTML = htmlRm24ContentPicker(items, rm24hPasoSeleccionado);
  }

  function renderRm24StepEditor() {
    const mount = document.getElementById("rm24hStepEditor");
    if (!mount) return;
    const items = getRm24ContenidosActivos();
    const editableCount = items.filter(esContenidoEditableRm24).length;
    clampPasoSeleccionado(editableCount);
    if (!editableCount) {
      mount.innerHTML =
        '<div class="rm24-step-editor-empty rm24-step-editor-empty--premium">' +
        "<p><strong>Sin contenido aún</strong></p>" +
        "<p>Usa <strong>＋ Agregar contenido</strong> para armar el mensaje de remarketing.</p></div>";
      return;
    }
    if (!esContenidoEditableRm24(items[rm24hPasoSeleccionado])) {
      rm24hPasoSeleccionado = indicePrimerContenidoEditable(items);
    }
    const item =
      mapearItemContenidoUi(items[rm24hPasoSeleccionado]) || items[rm24hPasoSeleccionado];
    mount.innerHTML = htmlStepEditorShell(item, rm24hPasoSeleccionado, items.length);
  }

  function actualizarPreviewEditorPaso() {
    const el = document.querySelector(
      "#rm24hStepEditor .rm24-step-editor-preview-text"
    );
    if (!el) return;
    syncEditorPasoToContenidos();
    const items = getRm24ContenidosActivos();
    if (!items.length || rm24hPasoSeleccionado >= items.length) return;
    const item =
      mapearItemContenidoUi(items[rm24hPasoSeleccionado]) ||
      items[rm24hPasoSeleccionado];
    const resumen = resumenPasoFunnel(item);
    const vacio =
      !resumen ||
      resumen === "Vacío" ||
      resumen === "Sin texto" ||
      resumen === "Sin archivo";
    el.textContent = vacio ? "Sin contenido configurado todavía" : resumen;
    el.classList.toggle("rm24-step-editor-preview-text--muted", vacio);
  }

  function renderRm24ContentBlocks() {
    if (esNodoContenidoSeleccionado()) {
      renderRm24ContentPicker();
      renderRm24StepEditor();
    }
    actualizarEmbudoRmPanel();
  }

  function bindContenidosPanelEvents() {
    const mount = document.getElementById("panelNodoContenido");
    if (!mount) return;

    if (mount._rm24hOnClick) {
      mount.removeEventListener("click", mount._rm24hOnClick);
    }
    if (mount._rm24hOnChange) {
      mount.removeEventListener("change", mount._rm24hOnChange);
    }
    if (mount._rm24hOnInput) {
      mount.removeEventListener("input", mount._rm24hOnInput);
    }
    if (mount._rm24hOnDragStart) {
      mount.removeEventListener("dragstart", mount._rm24hOnDragStart);
    }
    if (mount._rm24hOnDragOver) {
      mount.removeEventListener("dragover", mount._rm24hOnDragOver);
    }
    if (mount._rm24hOnDrop) {
      mount.removeEventListener("drop", mount._rm24hOnDrop);
    }
    if (mount._rm24hOnDragEnd) {
      mount.removeEventListener("dragend", mount._rm24hOnDragEnd);
    }
    if (mount._rm24hOnContentDragStart) {
      mount.removeEventListener("dragstart", mount._rm24hOnContentDragStart);
    }
    if (mount._rm24hOnContentDragOver) {
      mount.removeEventListener("dragover", mount._rm24hOnContentDragOver);
    }
    if (mount._rm24hOnContentDrop) {
      mount.removeEventListener("drop", mount._rm24hOnContentDrop);
    }
    if (mount._rm24hOnContentDragEnd) {
      mount.removeEventListener("dragend", mount._rm24hOnContentDragEnd);
    }

    mount._rm24hOnClick = function (ev) {
      const colorSwatch = ev.target.closest("[data-rm24-etiqueta-color]");
      if (colorSwatch) {
        ev.preventDefault();
        const val = colorSwatch.getAttribute("data-rm24-etiqueta-color");
        const hidden = document.getElementById("rm24hEtiquetaColor");
        if (hidden) hidden.value = val;
        document.querySelectorAll(".rm24-etiqueta-swatch").forEach(function (btn) {
          const active = btn === colorSwatch;
          btn.classList.toggle("rm24-etiqueta-swatch--active", active);
          btn.setAttribute("aria-checked", active ? "true" : "false");
        });
        syncEtiquetaDesdePanel();
        actualizarPreviewEtiquetaPanel();
        persistirConfigPanelEnNodo();
        return;
      }

      const accionBtn = ev.target.closest("[data-rm24-etiqueta-accion]");
      if (accionBtn) {
        ev.preventDefault();
        const val = accionBtn.getAttribute("data-rm24-etiqueta-accion");
        const hidden = document.getElementById("rm24hEtiquetaAccion");
        if (hidden) hidden.value = val;
        document.querySelectorAll(".rm24-etiqueta-accion-btn").forEach(function (btn) {
          const active = btn === accionBtn;
          btn.classList.toggle("rm24-etiqueta-accion-btn--active", active);
          btn.setAttribute("aria-checked", active ? "true" : "false");
        });
        syncEtiquetaDesdePanel();
        persistirConfigPanelEnNodo();
        return;
      }

      const wfAddToggle = ev.target.closest("[data-rm24-wf-add-toggle]");
      if (wfAddToggle) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleWfAddMenu(wfAddToggle.getAttribute("data-rm24-wf-add-toggle"));
        return;
      }

      const addNodoTipoBtn = ev.target.closest("[data-add-nodo-tipo]");
      if (addNodoTipoBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        const insertRaw = addNodoTipoBtn.getAttribute("data-rm24-wf-insert");
        const parsed = parseWfInsertKey(
          insertRaw != null && insertRaw !== "" ? insertRaw : String(rm24hMiniFlujoNodos.length)
        );
        const tipo = addNodoTipoBtn.getAttribute("data-add-nodo-tipo");
        if (parsed.scope === "camino") {
          addNodoEnCaminoAt(parsed.ramaKey, parsed.index, tipo);
        } else {
          addMiniFlujoNodoAt(parsed.index, tipo);
        }
        return;
      }

      if (ev.target.closest("[data-rm24-wf-add-close]")) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleAllWfAddMenus(false);
        return;
      }

      const addNodoBtn = ev.target.closest("#rm24hAddNodoBtn");
      if (addNodoBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleRm24AddNodoMenu();
        return;
      }

      if (ev.target.closest("[data-rm24-close-add-nodo]")) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleRm24AddNodoMenu(false);
        return;
      }

      const addBtn = ev.target.closest("#rm24hAddPasoBtn");
      if (addBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleRm24AddPasoMenu();
        return;
      }

      const addTipoBtn = ev.target.closest("[data-add-tipo]");
      if (addTipoBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        addRm24ContentBlock(addTipoBtn.getAttribute("data-add-tipo"));
        return;
      }

      if (ev.target.closest("[data-rm24-close-add-paso]")) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleRm24AddPasoMenu(false);
        return;
      }

      const nodoRemoveBtn = ev.target.closest("[data-rm24-nodo-remove]");
      if (nodoRemoveBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        removeMiniFlujoNodo(nodoRemoveBtn.getAttribute("data-rm24-nodo-remove"));
        return;
      }

      const nodoMoveUpBtn = ev.target.closest("[data-rm24-nodo-move-up]");
      if (nodoMoveUpBtn && !nodoMoveUpBtn.disabled) {
        ev.preventDefault();
        ev.stopPropagation();
        moveMiniFlujoNodo(nodoMoveUpBtn.getAttribute("data-rm24-nodo-move-up"), -1);
        return;
      }

      const nodoMoveDownBtn = ev.target.closest("[data-rm24-nodo-move-down]");
      if (nodoMoveDownBtn && !nodoMoveDownBtn.disabled) {
        ev.preventDefault();
        ev.stopPropagation();
        moveMiniFlujoNodo(nodoMoveDownBtn.getAttribute("data-rm24-nodo-move-down"), 1);
        return;
      }

      const bloqueBtn = ev.target.closest("[data-rm24-bloque-id]");
      if (bloqueBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        selectRm24Bloque(bloqueBtn.getAttribute("data-rm24-bloque-id"));
        return;
      }

      const nodoBtn = ev.target.closest("[data-rm24-nodo-uid]");
      if (nodoBtn && !ev.target.closest(".rm24-wf-step-actions")) {
        ev.preventDefault();
        ev.stopPropagation();
        selectRm24Bloque(nodoBtn.getAttribute("data-rm24-nodo-uid"));
        return;
      }

      const selectBtn = ev.target.closest("[data-rm24-content-index]");
      if (selectBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        selectRm24Paso(parseInt(selectBtn.getAttribute("data-rm24-content-index"), 10));
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
        ev.stopPropagation();
        moveRm24ContentBlock(parseInt(moveUpBtn.getAttribute("data-rm24-move-up"), 10), -1);
        return;
      }

      const moveDownBtn = ev.target.closest("[data-rm24-move-down]");
      if (moveDownBtn && !moveDownBtn.disabled) {
        ev.preventDefault();
        ev.stopPropagation();
        moveRm24ContentBlock(parseInt(moveDownBtn.getAttribute("data-rm24-move-down"), 10), 1);
        return;
      }

      const pickBtn = ev.target.closest("[data-rm24-pick-file]");
      if (pickBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        const card = pickBtn.closest(".rm24-contenido-item");
        card?.querySelector(".rm24-contenido-file")?.click();
        return;
      }

      const toggleManual = ev.target.closest("[data-rm24-toggle-manual]");
      if (toggleManual) {
        ev.preventDefault();
        ev.stopPropagation();
        const card = toggleManual.closest(".rm24-contenido-item");
        card?.querySelector(".rm24-manual-url")?.classList.toggle("rm24-manual-url--open");
        return;
      }

      const addArCaminoBtn = ev.target.closest(
        "#rm24hAgenteRapidoAddCamino, #rm24hAgenteRapidoAddCaminoEmpty"
      );
      if (addArCaminoBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        addAgenteRapidoCamino();
        return;
      }

      const arRemoveBtn = ev.target.closest("[data-rm24-ar-remove]");
      if (arRemoveBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        removeAgenteRapidoCamino(arRemoveBtn.getAttribute("data-rm24-ar-remove"));
        return;
      }

      const arSelectBtn = ev.target.closest("[data-rm24-ar-select]");
      if (arSelectBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        selectAgenteRapidoElemento(arSelectBtn.getAttribute("data-rm24-ar-select"));
        return;
      }

      const caminoMoveUp = ev.target.closest("[data-rm24-camino-move-up]");
      if (caminoMoveUp && !caminoMoveUp.disabled) {
        ev.preventDefault();
        ev.stopPropagation();
        moveNodoEnCamino(
          caminoMoveUp.getAttribute("data-rm24-camino-move-up"),
          caminoMoveUp.getAttribute("data-rm24-ar-node-id"),
          -1
        );
        return;
      }

      const caminoMoveDown = ev.target.closest("[data-rm24-camino-move-down]");
      if (caminoMoveDown && !caminoMoveDown.disabled) {
        ev.preventDefault();
        ev.stopPropagation();
        moveNodoEnCamino(
          caminoMoveDown.getAttribute("data-rm24-camino-move-down"),
          caminoMoveDown.getAttribute("data-rm24-ar-node-id"),
          1
        );
        return;
      }

      const arNodeRemove = ev.target.closest("[data-rm24-ar-node-remove]");
      if (arNodeRemove) {
        ev.preventDefault();
        ev.stopPropagation();
        removeNodoEnRamaAgenteRapido(
          arNodeRemove.getAttribute("data-rm24-ar-node-remove"),
          arNodeRemove.getAttribute("data-rm24-ar-node-id")
        );
        return;
      }
    };

    mount._rm24hOnChange = function (ev) {
      if (
        ev.target.id === "rm24hAgenteRapidoResponderFallback" ||
        ev.target.id === "rm24hAgenteRapidoActivarFlujos" ||
        ev.target.id === "rm24hAgenteRapidoResponderAudio" ||
        ev.target.closest(".rm24-ar-accion") ||
        ev.target.closest(".rm24-ar-ruta-enabled")
      ) {
        syncAgenteRapidoDesdePanel();
        persistirConfigPanelEnNodo();
        actualizarEmbudoRmPanel();
        return;
      }
      if (ev.target.closest(".rm24-section--lector-pagos")) {
        syncLectorPagosDesdePanel();
        persistirConfigPanelEnNodo();
        actualizarEmbudoRmPanel();
        return;
      }
      if (ev.target.closest(".rm24-section--etiqueta")) {
        syncEtiquetaDesdePanel();
        actualizarPreviewEtiquetaPanel();
        persistirConfigPanelEnNodo();
        actualizarEmbudoRmPanel();
        return;
      }
      if (ev.target.closest(".rm24-section--conversion")) {
        syncConversionDesdePanel();
        persistirConfigPanelEnNodo();
        actualizarEmbudoRmPanel();
        return;
      }
      const fileInput = ev.target.closest(".rm24-contenido-file");
      if (fileInput?.files?.[0]) {
        const card = fileInput.closest(".rm24-contenido-item");
        subirArchivoRm24hEnBloque(card, fileInput.files[0]);
        fileInput.value = "";
        return;
      }
      if (
        !ev.target.closest(".rm24-contenido-url") &&
        !ev.target.closest(".rm24-contenido-unidad") &&
        !ev.target.closest(".rm24-contenido-cantidad")
      ) {
        return;
      }
      syncEditorPasoToContenidos();
      if (ev.target.closest(".rm24-contenido-url")) {
        renderRm24ContentBlocks();
      }
      persistirContenidosEnNodo();
    };

    mount._rm24hOnInput = function (ev) {
      if (ev.target.closest(".rm24-section--agente-rapido")) {
        syncAgenteRapidoDesdePanel();
        persistirConfigPanelEnNodo();
        actualizarEmbudoRmPanel();
        return;
      }
      if (ev.target.closest(".rm24-section--lector-pagos")) {
        syncLectorPagosDesdePanel();
        persistirConfigPanelEnNodo();
        actualizarEmbudoRmPanel();
        return;
      }
      if (ev.target.closest(".rm24-section--etiqueta")) {
        syncEtiquetaDesdePanel();
        actualizarPreviewEtiquetaPanel();
        persistirConfigPanelEnNodo();
        actualizarEmbudoRmPanel();
        return;
      }
      if (ev.target.closest(".rm24-section--conversion")) {
        syncConversionDesdePanel();
        persistirConfigPanelEnNodo();
        actualizarEmbudoRmPanel();
        return;
      }
      if (!ev.target.closest("#rm24hStepEditor")) return;
      mostrarErrorContenidos("");
      syncEditorPasoToContenidos();
      sincronizarMensajeRemarketingDesdeContenidos(configActiva);
      actualizarPreviewEditorPaso();
      actualizarEmbudoRmPanel();
      persistirContenidosEnNodo();
    };

    mount._rm24hOnDragStart = function (ev) {
      const step = ev.target.closest(
        ".rm24-wf-card[draggable='true'][data-rm24-nodo-uid]"
      );
      if (!step) return;
      const uid = step.getAttribute("data-rm24-nodo-uid");
      rm24hDragNodoIndex = rm24hMiniFlujoNodos.findIndex(function (n) {
        return n.uid === uid;
      });
      step.classList.add("rm24-wf-card--dragging");
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", String(rm24hDragNodoIndex));
      }
    };

    mount._rm24hOnDragOver = function (ev) {
      const step = ev.target.closest(".rm24-wf-card[data-rm24-nodo-uid][draggable='true']");
      if (!step) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      document.querySelectorAll(".rm24-wf-card--drop-target").forEach(function (el) {
        el.classList.remove("rm24-wf-card--drop-target");
      });
      step.classList.add("rm24-wf-card--drop-target");
    };

    mount._rm24hOnDrop = function (ev) {
      const step = ev.target.closest(".rm24-wf-card[data-rm24-nodo-uid][draggable='true']");
      if (!step) return;
      ev.preventDefault();
      const from =
        rm24hDragNodoIndex != null
          ? rm24hDragNodoIndex
          : parseInt(ev.dataTransfer?.getData("text/plain"), 10);
      const uid = step.getAttribute("data-rm24-nodo-uid");
      const to = rm24hMiniFlujoNodos.findIndex(function (n) {
        return n.uid === uid;
      });
      document.querySelectorAll(".rm24-wf-card--drop-target").forEach(function (el) {
        el.classList.remove("rm24-wf-card--drop-target");
      });
      if (Number.isFinite(from) && Number.isFinite(to)) {
        reorderMiniFlujoNodo(from, to);
      }
    };

    mount._rm24hOnDragEnd = function () {
      rm24hDragNodoIndex = null;
      document.querySelectorAll(".rm24-wf-card--dragging").forEach(function (el) {
        el.classList.remove("rm24-wf-card--dragging");
      });
      document.querySelectorAll(".rm24-wf-card--drop-target").forEach(function (el) {
        el.classList.remove("rm24-wf-card--drop-target");
      });
    };

    mount._rm24hOnContentDragStart = function (ev) {
      const pick = ev.target.closest(".rm24-content-pick[draggable='true']");
      if (!pick) return;
      ev.stopPropagation();
      rm24hDragContentIndex = parseInt(pick.getAttribute("data-rm24-content-index"), 10);
      pick.classList.add("rm24-content-pick--dragging");
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", String(rm24hDragContentIndex));
      }
    };

    mount._rm24hOnContentDragOver = function (ev) {
      const pick = ev.target.closest(".rm24-content-pick[draggable='true']");
      if (!pick) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      document.querySelectorAll(".rm24-content-pick--drop-target").forEach(function (el) {
        el.classList.remove("rm24-content-pick--drop-target");
      });
      pick.classList.add("rm24-content-pick--drop-target");
    };

    mount._rm24hOnContentDrop = function (ev) {
      const pick = ev.target.closest(".rm24-content-pick[draggable='true']");
      if (!pick) return;
      ev.preventDefault();
      ev.stopPropagation();
      const from =
        rm24hDragContentIndex != null
          ? rm24hDragContentIndex
          : parseInt(ev.dataTransfer?.getData("text/plain"), 10);
      const to = parseInt(pick.getAttribute("data-rm24-content-index"), 10);
      document.querySelectorAll(".rm24-content-pick--drop-target").forEach(function (el) {
        el.classList.remove("rm24-content-pick--drop-target");
      });
      if (Number.isFinite(from) && Number.isFinite(to)) {
        reorderRm24ContentBlock(from, to);
      }
    };

    mount._rm24hOnContentDragEnd = function () {
      rm24hDragContentIndex = null;
      document.querySelectorAll(".rm24-content-pick--dragging").forEach(function (el) {
        el.classList.remove("rm24-content-pick--dragging");
      });
      document.querySelectorAll(".rm24-content-pick--drop-target").forEach(function (el) {
        el.classList.remove("rm24-content-pick--drop-target");
      });
    };

    mount.addEventListener("click", mount._rm24hOnClick);
    mount.addEventListener("change", mount._rm24hOnChange);
    mount.addEventListener("input", mount._rm24hOnInput);
    mount.addEventListener("dragstart", mount._rm24hOnDragStart);
    mount.addEventListener("dragover", mount._rm24hOnDragOver);
    mount.addEventListener("drop", mount._rm24hOnDrop);
    mount.addEventListener("dragend", mount._rm24hOnDragEnd);
    mount.addEventListener("dragstart", mount._rm24hOnContentDragStart);
    mount.addEventListener("dragover", mount._rm24hOnContentDragOver);
    mount.addEventListener("drop", mount._rm24hOnContentDrop);
    mount.addEventListener("dragend", mount._rm24hOnContentDragEnd);

    if (!mount._rm24hDocClick) {
      mount._rm24hDocClick = function (ev) {
        if (!panelRemarketingAbierto()) return;
        if (ev.target.closest("#rm24hAddPasoWrap")) return;
        if (ev.target.closest("#rm24hAddNodoWrap")) return;
        if (ev.target.closest(".rm24-wf-junction-add-wrap")) return;
        toggleRm24AddPasoMenu(false);
        toggleRm24AddNodoMenu(false);
        toggleAllWfAddMenus(false);
      };
      document.addEventListener("click", mount._rm24hDocClick);
    }
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
    const cfg = sincronizarHorasLegacyDesdeTiempo(
      Object.assign({}, config || configActiva)
    );
    const activoEl = document.getElementById("rm24hActivo");
    const unidadEl = document.getElementById("rm24hTiempoUnidad");
    const valorEl = document.getElementById("rm24hTiempoValor");
    const reiniciarEl = document.getElementById("rm24hReiniciar");
    const detenerConvEl = document.getElementById("rm24hDetenerConversion");

    if (activoEl) activoEl.checked = !!cfg.activo;
    if (unidadEl) unidadEl.value = cfg.tiempoInactividad.unidad;
    if (valorEl) valorEl.value = String(cfg.tiempoInactividad.valor);
    renderPresetsTiempoPanel(cfg.tiempoInactividad);
    if (reiniciarEl) reiniciarEl.checked = cfg.reiniciarAlResponder !== false;
    if (detenerConvEl) detenerConvEl.checked = cfg.detenerEnConversion !== false;
    renderRm24BloqueEditor();
    mostrarErrorContenidos("");
    if (rm24hBloqueSeleccionado === "espera") {
      actualizarHintTiempoPanel(cfg.tiempoInactividad);
    } else {
      actualizarEmbudoRmPanel();
    }
  }

  function actualizarHintTiempoPanel(tiempo) {
    const hint = document.getElementById("rm24hTiempoHint");
    if (!hint) return;
    const t = normalizarTiempoInactividad({ tiempoInactividad: tiempo });
    hint.textContent =
      "Se envía tras " +
      etiquetaTiempoInactividadResumen(t).replace(" de inactividad", "") +
      " sin respuesta del lead.";
    actualizarEmbudoRmPanel();
  }

  function renderPanel(nodo) {
    if (!nodo) return;

    nodoActivo = nodo;
    rm24hPasoSeleccionado = 0;
    resetMiniFlujoRmPanel();
    hydrateRm24ContentBlocksFromNode(nodo);
    hydrateMiniFlujoDesdeConfig(configActiva);
    sincronizarHorasLegacyDesdeTiempo(configActiva);

    const contenido = document.getElementById("panelNodoContenido");
    const panelShell = document.getElementById("panelNodo");
    if (!contenido) return;

    if (panelShell) {
      panelShell.classList.add(
        "panel-nodo--rm24h",
        "panel-nodo--rm24h-wide",
        "rm-panel-wide"
      );
    }

    contenido.innerHTML =
      '<div class="rm24h-panel rm24-config-panel rm-panel-wide">' +
      '<div class="rm24-card rm24-card--hero">' +
      '<span class="rm24h-panel-icon" aria-hidden="true">🔥</span>' +
      "<div>" +
      "<h4>Remarketing Global 24h</h4>" +
      "<p>Mini flujo vertical · cerebro global del flujo</p>" +
      "</div></div>" +
      '<div class="rm24-config-scroll">' +
      '<section class="rm24-section rm24-section--estado">' +
      '<h5 class="rm24-section-title">Estado</h5>' +
      '<label class="rm24-switch rm24h-toggle">' +
      '<input type="checkbox" id="rm24hActivo" ' +
      (configActiva.activo ? "checked" : "") +
      ">" +
      '<span class="rm24-switch-track" aria-hidden="true"></span>' +
      "<span class=\"rm24-switch-label\">Activar remarketing global</span></label>" +
      "</section>" +
      '<div class="rm24-config-workspace">' +
      '<aside class="rm24-config-col rm24-config-col--funnel" aria-label="Mini flujo RM">' +
      htmlMiniFlujoRmSection() +
      "</aside>" +
      '<div class="rm24-config-col rm24-config-col--editor">' +
      '<div id="rm24hBloqueEditor" class="rm24-bloque-editor"></div>' +
      '<div class="rm24-config-footer">' +
      '<button type="button" class="panel-btn rm24-btn-save" id="rm24hGuardarPanel">Guardar nodo</button>' +
      "</div></div></div></div></div>";

    bindContenidosPanelEvents();
    aplicarConfigAlPanel(configActiva);

    document.getElementById("rm24hActivo")?.addEventListener("change", onPanelChange);
    document
      .getElementById("rm24hGuardarPanel")
      ?.addEventListener("click", guardarDesdePanel);

    actualizarEmbudoRmPanel();
  }

  function bindTiempoPanelEvents() {
    const unidadEl = document.getElementById("rm24hTiempoUnidad");
    const valorEl = document.getElementById("rm24hTiempoValor");
    const mount = document.getElementById("panelNodoContenido");
    if (!mount) return;

    if (mount._rm24hTiempoClick) {
      mount.removeEventListener("click", mount._rm24hTiempoClick);
    }
    if (mount._rm24hTiempoChange) {
      mount.removeEventListener("change", mount._rm24hTiempoChange);
    }
    if (mount._rm24hTiempoInput) {
      mount.removeEventListener("input", mount._rm24hTiempoInput);
    }

    mount._rm24hTiempoClick = function (ev) {
      const presetBtn = ev.target.closest("[data-rm24-preset-valor]");
      if (!presetBtn) return;
      ev.preventDefault();
      ev.stopPropagation();
      const valor = parseInt(presetBtn.getAttribute("data-rm24-preset-valor"), 10);
      if (!Number.isFinite(valor) || valor < 1) return;
      if (valorEl) valorEl.value = String(valor);
      onTiempoPanelChange();
    };

    mount._rm24hTiempoChange = function (ev) {
      if (
        ev.target.id === "rm24hTiempoUnidad" ||
        ev.target.id === "rm24hTiempoValor"
      ) {
        if (ev.target.id === "rm24hTiempoUnidad") {
          const unidad =
            normalizarUnidadTiempoInactividad(unidadEl?.value) || "horas";
          const presets =
            PRESETS_TIEMPO_INACTIVIDAD[unidad] || PRESETS_TIEMPO_INACTIVIDAD.horas;
          if (valorEl) valorEl.value = String(presets[0] || 23);
          renderPresetsTiempoPanel({ valor: presets[0] || 23, unidad: unidad });
        }
        onTiempoPanelChange();
      }
    };

    mount._rm24hTiempoInput = function (ev) {
      if (ev.target.id !== "rm24hTiempoValor") return;
      const cleaned = String(ev.target.value || "").replace(/\D/g, "");
      if (cleaned !== ev.target.value) ev.target.value = cleaned;
      onTiempoPanelChange();
    };

    mount.addEventListener("click", mount._rm24hTiempoClick);
    mount.addEventListener("change", mount._rm24hTiempoChange);
    mount.addEventListener("input", mount._rm24hTiempoInput);

    valorEl?.addEventListener("blur", onTiempoPanelCommit);
    valorEl?.addEventListener("keydown", function (e) {
      if (["e", "E", "+", "-", ".", ","].includes(e.key)) {
        e.preventDefault();
      }
    });
  }

  function bindComportamientoRmPanelEvents() {
    const mount = document.getElementById("panelNodoContenido");
    if (!mount) return;

    if (mount._rm24hRmContextChange) {
      mount.removeEventListener("change", mount._rm24hRmContextChange);
    }
    if (mount._rm24hRmContextInput) {
      mount.removeEventListener("input", mount._rm24hRmContextInput);
    }
    if (mount._rm24hRmContextBlur) {
      mount.removeEventListener("blur", mount._rm24hRmContextBlur, true);
    }

    mount._rm24hRmContextChange = function (ev) {
      const input = ev.target;
      if (input.matches("[data-rm-context-mode]")) {
        const mode = input.getAttribute("data-rm-context-mode");
        if (!input.checked) {
          setRmContextModeEnPanel(
            configActiva.rm_context_policy?.mode || "until_conversion"
          );
          return;
        }
        setRmContextModeEnPanel(mode);
        onComportamientoRmPanelChange();
        return;
      }
      if (input.id === "rm24hRmContextDurationUnidad") {
        onComportamientoRmPanelChange();
      }
    };

    mount._rm24hRmContextInput = function (ev) {
      if (ev.target.id !== "rm24hRmContextDurationValor") return;
      const cleaned = String(ev.target.value || "").replace(/\D/g, "");
      if (cleaned !== ev.target.value) ev.target.value = cleaned;
      onComportamientoRmPanelChange();
    };

    mount._rm24hRmContextBlur = function (ev) {
      if (ev.target.id !== "rm24hRmContextDurationValor") return;
      const uiUnidad =
        normalizarUnidadTiempoInactividad(
          document.getElementById("rm24hRmContextDurationUnidad")?.value
        ) || "horas";
      normalizarInputTiempoValor(ev.target, uiUnidad);
      onComportamientoRmPanelChange();
    };

    mount.addEventListener("change", mount._rm24hRmContextChange);
    mount.addEventListener("input", mount._rm24hRmContextInput);
    mount.addEventListener("blur", mount._rm24hRmContextBlur, true);
  }

  function onComportamientoRmPanelChange() {
    syncDesdePanel();
    persistirContenidosEnNodo();
  }

  function onTiempoPanelCommit() {
    const unidad =
      normalizarUnidadTiempoInactividad(
        document.getElementById("rm24hTiempoUnidad")?.value
      ) || "horas";
    normalizarInputTiempoValor(document.getElementById("rm24hTiempoValor"), unidad);
    onTiempoPanelChange();
  }

  function onTiempoPanelChange() {
    syncTiempoInactividadDesdePanel();
    renderPresetsTiempoPanel(configActiva.tiempoInactividad);
    actualizarHintTiempoPanel(configActiva.tiempoInactividad);
    persistirContenidosEnNodo();
  }

  function syncDesdePanel() {
    if (!panelRemarketingAbierto()) return;

    const activoEl = document.getElementById("rm24hActivo");

    if (activoEl) configActiva.activo = !!activoEl.checked;
    syncTiempoInactividadDesdePanel();
    configActiva.detenerSiResponde = false;
    configActiva.reiniciarAlResponder = true;
    configActiva.detenerEnConversion = true;
    configActiva.modoContextual = false;
    if (document.getElementById("rm24hRmContextUntilConversion")) {
      configActiva.rm_context_policy = leerRmContextPolicyDesdePanel();
    }
    if (esNodoContenidoSeleccionado()) {
      leerContenidosDesdePanel();
    }
    if (esNodoAgenteRapidoSeleccionado()) {
      syncAgenteRapidoDesdePanel();
    }
    if (esNodoLectorPagosSeleccionado()) {
      syncLectorPagosDesdePanel();
    }
  }

  function onPanelChange() {
    syncDesdePanel();
    persistirContenidosEnNodo();
  }

  function guardarDesdePanel() {
    if (!nodoActivo) return;
    flushEditorBloqueActualAlConfig();
    syncDesdePanel();
    if (configActiva.activo && !miniFlujoTieneNodoContenido()) {
      mostrarErrorContenidos(
        "Con remarketing activo necesitas el nodo Contenido en el mini flujo."
      );
      return;
    }
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
    configActiva = prepararConfigParaGuardar(configActiva);
    guardarConfigEnNodo(nodoActivo, configActiva);
    if (esNodoContenidoSeleccionado()) {
      renderRm24ContentBlocks();
    }
    if (esNodoAgenteRapidoSeleccionado()) {
      renderAgenteRapidoCaminos();
    }
    if (esNodoLectorPagosSeleccionado()) {
      syncLectorPagosDesdePanel();
    }
    actualizarEmbudoRmPanel();
    alert("Remarketing Global guardado. Recuerda guardar el flujo completo.");
  }

  function flushPanelToNode() {
    if (!nodoActivo) return;
    flushEditorBloqueActualAlConfig();
    syncDesdePanel();
    guardarConfigEnNodo(nodoActivo, configActiva);
  }

  function clearPanelActivo() {
    const restaurando =
      typeof builderHistorial !== "undefined" && builderHistorial.restaurando;
    if (!restaurando && nodoActivo) {
      flushEditorBloqueActualAlConfig();
      syncDesdePanel();
      guardarConfigEnNodo(nodoActivo, configActiva);
    }
    nodoActivo = null;
    configActiva = crearConfigVacia();
    rm24hPasoSeleccionado = 0;
    resetMiniFlujoRmPanel();
    const panelShell = document.getElementById("panelNodo");
    panelShell?.classList.remove(
      "panel-nodo--rm24h",
      "panel-nodo--rm24h-wide",
      "rm-panel-wide"
    );
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
    nodo.className =
      "node remarketing-global-node node-remarketing-global rm24-node rm24-global-node";
    nodo.id = id;
    nodo.dataset.tipo = "remarketing_global";
    nodo.style.left = 80 + nodoCount * 40 + "px";
    nodo.style.top = 120 + nodoCount * 30 + "px";

    nodo.innerHTML =
      '<div class="rm24-global-halo" aria-hidden="true"></div>' +
      '<div class="rm24-global-orbit" aria-hidden="true"></div>' +
      '<div class="port in" data-nodo="' +
      id +
      '" onmousedown="iniciarConexion(event, \'' +
      id +
      '\', \'in\')"></div>' +
      '<div class="rm24-node-actions node-actions">' +
      '<button type="button" class="edit-node" onclick="event.stopPropagation(); abrirEditorRemarketingGlobal(\'' +
      id +
      '\')" aria-label="Editar">✎</button>' +
      '<button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo(\'' +
      id +
      '\')" aria-label="Eliminar">×</button></div>' +
      '<div class="rm24-global-badges" aria-label="Tipo de nodo global">' +
      '<span class="rm24-global-badge">GLOBAL</span>' +
      '<span class="rm24-global-badge rm24-global-badge--watchdog">WATCHDOG</span>' +
      '<span class="rm24-global-badge rm24-global-badge--type rm24h-chip">RM24H</span>' +
      "</div>" +
      '<header class="rm24-node-header rm24h-header">' +
      '<span class="rm24-node-icon" aria-hidden="true">🔥</span>' +
      '<div class="rm24-node-title-group">' +
      '<div class="rm24-node-title-row">' +
      '<span class="rm24-node-title">Remarketing Global 24h</span>' +
      "</div></div></header>" +
      '<div class="rm24-global-taglines">' +
      '<p class="rm24-global-tagline">Cerebro global del flujo</p>' +
      '<p class="rm24-global-tagline rm24-global-tagline--sub">No mueve leads entre nodos</p>' +
      "</div>" +
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
