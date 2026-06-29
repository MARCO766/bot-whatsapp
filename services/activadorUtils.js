/**
 * Lógica compartida de activadores (API + webhook).
 * Compatibilidad: filas sin tipo_activador → palabra clave única vía `frase`.
 */

const TIPOS = {
  PALABRA_UNICA: "palabra_unica",
  MULTIPLES: "multiples_palabras",
  CUALQUIER: "cualquier_mensaje",
  PRIMER_MENSAJE: "primer_mensaje",
};

function resolveTipo(activador) {
  const t = activador?.tipo_activador;
  if (t === TIPOS.CUALQUIER) return TIPOS.CUALQUIER;
  if (t === TIPOS.PRIMER_MENSAJE) return TIPOS.PRIMER_MENSAJE;
  if (t === TIPOS.MULTIPLES) return TIPOS.MULTIPLES;
  return TIPOS.PALABRA_UNICA;
}

function parsePalabrasFromBody(body) {
  if (Array.isArray(body.palabras_clave_array)) {
    return body.palabras_clave_array.map((p) => String(p).trim()).filter(Boolean);
  }
  const raw = body.palabras_clave_text ?? body.palabras_clave ?? "";
  return String(raw)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

function getPalabrasArray(activador) {
  if (Array.isArray(activador.palabras_clave_array) && activador.palabras_clave_array.length) {
    return activador.palabras_clave_array
      .map((p) => String(p).toLowerCase().trim())
      .filter(Boolean);
  }
  const frase = (activador.frase || "").trim();
  if (resolveTipo(activador) === TIPOS.MULTIPLES && frase.includes(",")) {
    return frase.split(",").map((p) => p.toLowerCase().trim()).filter(Boolean);
  }
  if (frase && frase !== "*") {
    return [frase.toLowerCase()];
  }
  return [];
}

function coincidePalabra(textoNorm, palabra, modo) {
  if (!palabra) return false;
  if (modo === "exacta") return textoNorm === palabra;
  return textoNorm.includes(palabra);
}

function matchActivador(textoNorm, activador, matchOpts = {}) {
  if (!textoNorm) return { matched: false };

  const tipo = resolveTipo(activador);

  if (tipo === TIPOS.PRIMER_MENSAJE) {
    const esPrimer = matchOpts.esPrimerMensaje;
    if (esPrimer === true) {
      console.log("[FIRST_MESSAGE_MATCH]", {
        tipo: "primer_mensaje",
        resultado: true,
        motivo: "primer_mensaje",
      });
      return { matched: true, tipo, detalle: "primer_mensaje" };
    }
    const motivo =
      esPrimer === false ? "no_es_primer_mensaje" : "contexto_no_disponible";
    console.log("[FIRST_MESSAGE_MATCH]", {
      tipo: "primer_mensaje",
      resultado: false,
      motivo,
    });
    return { matched: false };
  }

  if (tipo === TIPOS.CUALQUIER) {
    return { matched: true, tipo, detalle: "cualquier_mensaje" };
  }

  const modo = activador.coincidencia === "exacta" ? "exacta" : "contiene";

  if (tipo === TIPOS.MULTIPLES) {
    const palabras = getPalabrasArray(activador);
    const hit = palabras.find((p) => coincidePalabra(textoNorm, p, modo));
    if (hit) return { matched: true, tipo, detalle: hit, palabras };
    return { matched: false };
  }

  const frase = (activador.frase || "").toLowerCase().trim();
  if (frase && frase !== "*" && coincidePalabra(textoNorm, frase, modo)) {
    return { matched: true, tipo: TIPOS.PALABRA_UNICA, detalle: frase };
  }

  return { matched: false };
}

function sortActivadores(activadores) {
  const specificity = (a) => {
    const t = resolveTipo(a);
    if (t === TIPOS.PALABRA_UNICA) return 3;
    if (t === TIPOS.MULTIPLES) return 2;
    return 1;
  };

  return [...activadores].sort((a, b) => {
    const pa = Number(a.prioridad) || 0;
    const pb = Number(b.prioridad) || 0;
    if (pb !== pa) return pb - pa;
    const sa = specificity(a);
    const sb = specificity(b);
    if (sb !== sa) return sb - sa;
    return (b.frase || "").length - (a.frase || "").length;
  });
}

function validateActivadorBody(body) {
  if (!body.flujo_id) {
    return { ok: false, error: "Debes asignar un flujo" };
  }

  const tipo = body.tipo_activador || TIPOS.PALABRA_UNICA;

  if (tipo === TIPOS.CUALQUIER || tipo === TIPOS.PRIMER_MENSAJE) {
    return { ok: true };
  }

  if (tipo === TIPOS.MULTIPLES) {
    const palabras = parsePalabrasFromBody(body);
    if (!palabras.length) {
      return { ok: false, error: "Ingresa al menos una palabra clave (separadas por coma)" };
    }
    return { ok: true };
  }

  const palabra = String(body.palabra_clave ?? body.frase ?? "").trim();
  if (!palabra) {
    return { ok: false, error: "La palabra clave es obligatoria" };
  }

  return { ok: true };
}

function sameConexionId(a, b) {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function bodyToActivadorFields(body, usuarioId, conexionWhatsappId = null) {
  const tipo = body.tipo_activador || TIPOS.PALABRA_UNICA;
  let frase = "";
  let palabras_clave_array = null;

  if (tipo === TIPOS.CUALQUIER || tipo === TIPOS.PRIMER_MENSAJE) {
    frase = "*";
  } else if (tipo === TIPOS.MULTIPLES) {
    palabras_clave_array = parsePalabrasFromBody(body);
    frase = palabras_clave_array.join(",");
  } else {
    frase = String(body.palabra_clave ?? body.frase ?? "").trim();
  }

  const nombreBase =
    tipo === TIPOS.CUALQUIER
      ? "Cualquier mensaje"
      : tipo === TIPOS.PRIMER_MENSAJE
        ? "Primer mensaje"
        : tipo === TIPOS.MULTIPLES
          ? palabras_clave_array.slice(0, 3).join(", ")
          : frase;

  const nombre =
    String(body.nombre ?? "").trim() ||
    (nombreBase ? `Activador: ${nombreBase}` : "Activador");

  const activo =
    body.estado === "activo"
      ? true
      : body.estado === "pausado"
        ? false
        : body.activo !== false && body.activo !== "false";

  const connId =
    conexionWhatsappId ||
    body.conexion_whatsapp_id ||
    body.conexionWhatsappId ||
    null;

  const payload = {
    nombre,
    frase,
    flujo_id: body.flujo_id,
    conexion: body.conexion || "WhatsApp",
    activo,
    repetible: body.repetible !== false && body.repetible !== "false",
    usuario_id: usuarioId,
    tipo_activador: tipo,
  };

  if (connId) {
    payload.conexion_whatsapp_id = String(connId).trim();
  }

  if (palabras_clave_array && palabras_clave_array.length) {
    payload.palabras_clave_array = palabras_clave_array;
  }

  if (body.coincidencia === "exacta" || body.coincidencia === "contiene") {
    payload.coincidencia = body.coincidencia;
  }
  if (body.prioridad !== undefined && body.prioridad !== null && body.prioridad !== "") {
    payload.prioridad = Number(body.prioridad) || 0;
  }

  return payload;
}

function mapActivadorRow(row, flujosById = {}) {
  const flujo = flujosById[row.flujo_id];
  const tipo = row.tipo_activador || TIPOS.PALABRA_UNICA;
  const palabrasArray = Array.isArray(row.palabras_clave_array)
    ? row.palabras_clave_array
    : tipo === TIPOS.MULTIPLES && row.frase
      ? row.frase.split(",").map((p) => p.trim()).filter(Boolean)
      : [];

  let palabraDisplay = row.frase || "";
  if (tipo === TIPOS.CUALQUIER) {
    palabraDisplay = "Cualquier mensaje";
  } else if (tipo === TIPOS.PRIMER_MENSAJE) {
    palabraDisplay = "Primer mensaje";
  } else if (tipo === TIPOS.MULTIPLES) {
    palabraDisplay = palabrasArray.join(", ") || row.frase || "";
  }

  return {
    id: row.id,
    usuario_id: row.usuario_id,
    nombre: row.nombre || "",
    tipo_activador: tipo,
    palabra_clave:
      tipo === TIPOS.CUALQUIER || tipo === TIPOS.PRIMER_MENSAJE ? "" : palabraDisplay,
    palabras_clave_array: palabrasArray,
    palabras_clave_text: palabrasArray.join(", "),
    frase: row.frase || "",
    flujo_id: row.flujo_id,
    flujo_nombre: flujo?.nombre || null,
    conexion: row.conexion || "",
    conexion_whatsapp_id: row.conexion_whatsapp_id || null,
    estado: row.activo ? "activo" : "pausado",
    activo: Boolean(row.activo),
    repetible: row.repetible !== false,
    coincidencia: row.coincidencia === "exacta" ? "exacta" : "contiene",
    prioridad: Number(row.prioridad) || 0,
    veces_usado: Number(row.veces_usado) || 0,
    ultima_ejecucion: row.ultima_ejecucion || null,
    creado_en: row.creado_en || null,
  };
}

function tipoLabel(tipo) {
  if (tipo === TIPOS.CUALQUIER) return "Cualquier mensaje";
  if (tipo === TIPOS.PRIMER_MENSAJE) return "Primer mensaje";
  if (tipo === TIPOS.MULTIPLES) return "Varias palabras";
  return "Palabra única";
}

module.exports = {
  TIPOS,
  resolveTipo,
  parsePalabrasFromBody,
  getPalabrasArray,
  matchActivador,
  sortActivadores,
  validateActivadorBody,
  bodyToActivadorFields,
  mapActivadorRow,
  tipoLabel,
  sameConexionId,
};
