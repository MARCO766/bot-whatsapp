/**
 * MacBot — Biblioteca Multimedia IA (nodo OpenAI).
 * Fase B: prompt + parseo ACCION_BIBLIOTECA.
 * Fase C: selección de fotos y captions para envío WhatsApp.
 */

const MAX_FOTOS_SEGURO = 5;

const PRIORITY_MODES_VALIDOS = [
  "routes_library_gpt",
  "library_routes_gpt",
  "gpt_only",
];

const SEND_MODES_VALIDOS = ["random", "all", "first"];
const CAPTION_MODES_VALIDOS = ["caption_item", "same_caption", "none"];

function crearMediaLibraryPorDefecto() {
  return {
    enabled: false,
    priorityMode: "routes_library_gpt",
    maxFotosPorEnvio: MAX_FOTOS_SEGURO,
    lists: [],
  };
}

function normalizarItemBiblioteca(item) {
  return {
    id: String(item?.id || "").trim(),
    url: String(item?.url || "").trim(),
    caption: String(item?.caption || "").trim(),
  };
}

function normalizarListaBiblioteca(lista) {
  const id = String(lista?.id || "").trim();
  const name = String(lista?.name || "").trim();
  const description = String(lista?.description || "").trim();
  const sendMode = SEND_MODES_VALIDOS.includes(lista?.sendMode)
    ? lista.sendMode
    : "random";
  const captionMode = CAPTION_MODES_VALIDOS.includes(lista?.captionMode)
    ? lista.captionMode
    : "caption_item";
  const sendCount = Math.min(20, Math.max(1, parseInt(lista?.sendCount, 10) || 3));
  const items = Array.isArray(lista?.items)
    ? lista.items.map(normalizarItemBiblioteca).filter((it) => !!it.url)
    : [];

  return {
    id,
    name,
    description,
    sendMode,
    sendCount,
    introText: String(lista?.introText || "").trim(),
    captionMode,
    items,
  };
}

/**
 * Listas válidas para prompt: id + (name o description).
 * Items con URL se exigen solo al activar ACCION_BIBLIOTECA.
 */
function normalizarMediaLibrary(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const priorityMode = PRIORITY_MODES_VALIDOS.includes(src.priorityMode)
    ? src.priorityMode
    : "routes_library_gpt";
  const lists = Array.isArray(src.lists)
    ? src.lists
        .map(normalizarListaBiblioteca)
        .filter((lista) => lista.id && (lista.name || lista.description))
    : [];

  const maxFotosRaw = parseInt(src.maxFotosPorEnvio, 10);
  const maxFotosPorEnvio = Math.min(
    MAX_FOTOS_SEGURO,
    Math.max(1, Number.isFinite(maxFotosRaw) ? maxFotosRaw : MAX_FOTOS_SEGURO)
  );

  return {
    enabled: src.enabled === true,
    priorityMode,
    maxFotosPorEnvio,
    lists,
  };
}

function limiteFotosAEnviar(lista, mediaLibrary) {
  const ml = mediaLibrary && typeof mediaLibrary === "object" ? mediaLibrary : {};
  const maxGlobal = Math.min(
    MAX_FOTOS_SEGURO,
    Math.max(1, parseInt(ml.maxFotosPorEnvio, 10) || MAX_FOTOS_SEGURO)
  );
  const sendCount = Math.max(1, parseInt(lista?.sendCount, 10) || 3);
  return Math.min(maxGlobal, sendCount);
}

function seleccionarItemsBiblioteca(lista, mediaLibrary) {
  const items = (lista?.items || []).filter((it) => it && it.url);
  if (!items.length) return [];

  const mode = SEND_MODES_VALIDOS.includes(lista?.sendMode) ? lista.sendMode : "random";
  const limite = limiteFotosAEnviar(lista, mediaLibrary);

  if (mode === "first") {
    return items.slice(0, 1);
  }

  if (mode === "all") {
    return items.slice(0, Math.min(items.length, limite));
  }

  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copia[i];
    copia[i] = copia[j];
    copia[j] = tmp;
  }
  return copia.slice(0, Math.min(limite, copia.length));
}

function resolverCaptionBiblioteca(lista, item, textoAccion) {
  const mode = CAPTION_MODES_VALIDOS.includes(lista?.captionMode)
    ? lista.captionMode
    : "caption_item";

  if (mode === "none") return "";
  if (mode === "same_caption") {
    return String(lista?.introText || textoAccion || "").trim();
  }
  return String(item?.caption || "").trim();
}

function listasParaPrompt(mediaLibrary) {
  const ml = normalizarMediaLibrary(mediaLibrary);
  if (!ml.enabled || !ml.lists.length) return [];
  return ml.lists;
}

const INTENCIONES_BIBLIOTECA_POR_ID = {
  muestras: "fotos, muestras, ejemplos, cómo se ve, resultados",
  catalogo: "catálogo, modelos, diseños disponibles",
  testimonios: "opiniones, reseñas, referencias, testimonios",
  comprobantes: "comprobantes, pagos, pruebas de pago",
};

function construirPromptBibliotecas(mediaLibrary) {
  const listas = listasParaPrompt(mediaLibrary);
  if (!listas.length) return "";

  const idsDisponibles = listas.map(function (lista) {
    return lista.id;
  });

  const lineas = listas.map(function (lista) {
    const desc = lista.description || lista.name;
    return `- ${lista.id}: ${desc}`;
  });

  const lineasIntencion = idsDisponibles
    .filter(function (id) {
      return !!INTENCIONES_BIBLIOTECA_POR_ID[id];
    })
    .map(function (id) {
      return (
        "   - Si pide " +
        INTENCIONES_BIBLIOTECA_POR_ID[id] +
        ": usar " +
        id +
        " SOLO si existe en la lista anterior."
      );
    });

  const bloque =
    "Bibliotecas multimedia disponibles:\n" +
    lineas.join("\n") +
    "\n\nREGLAS OBLIGATORIAS (Biblioteca Multimedia):\n" +
    "1. Solo puedes usar bibliotecas que aparezcan en \"Bibliotecas multimedia disponibles\".\n" +
    "2. Si el lead pide una biblioteca que NO existe en esa lista, NO uses otra biblioteca parecida ni ACCION_BIBLIOTECA. Responde solo con texto normal explicando que no tienes esa biblioteca disponible.\n" +
    '   Ejemplo: si solo existe "muestras" y piden testimonios, NO respondas ACCION_BIBLIOTECA:muestras con texto sobre testimonios. Responde algo como: "Por ahora no tengo testimonios cargados, pero sí puedo mostrarte algunas muestras del producto si deseas."\n' +
    "3. Nunca describas una biblioteca con el nombre de otra. Si usas ACCION_BIBLIOTECA:<id>, el TEXTO debe hablar de esa misma biblioteca (muestras → muestras/ejemplos/fotos del producto; testimonios → testimonios/referencias; etc.).\n" +
    "4. Reglas de intención (aplican SOLO si esa biblioteca existe en la lista):\n" +
    (lineasIntencion.length ? lineasIntencion.join("\n") + "\n" : "") +
    "5. Si la biblioteca correcta para la intención del lead no existe, responde texto normal sin ACCION_BIBLIOTECA.\n\n" +
    "Si y solo si corresponde usar una biblioteca disponible, responde exactamente:\n" +
    "ACCION_BIBLIOTECA:<id_lista>\n" +
    "TEXTO:<mensaje corto opcional>";

  console.log("[OPENAI_MEDIA_LIBRARY_STRICT_PROMPT]", {
    listasDisponibles: idsDisponibles,
    bloque: bloque,
  });

  return bloque;
}

function parsearAccionBiblioteca(textoRespuesta) {
  const raw = String(textoRespuesta || "").trim();
  if (!raw) return null;

  const matchAccion = raw.match(/ACCION_BIBLIOTECA\s*:\s*([^\s\n\r]+)/i);
  if (!matchAccion) return null;

  const listId = String(matchAccion[1] || "").trim();
  if (!listId) return null;

  let texto = "";
  const matchTexto = raw.match(/TEXTO\s*:\s*(.+)/is);
  if (matchTexto) {
    texto = String(matchTexto[1] || "")
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  return { listId, texto };
}

function textoFallbackSinAccionBiblioteca(textoRespuesta) {
  let s = String(textoRespuesta || "").trim();
  if (!s) return "";

  const matchTexto = s.match(/TEXTO\s*:\s*(.+)/is);
  if (matchTexto) {
    return String(matchTexto[1] || "")
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  s = s.replace(/ACCION_BIBLIOTECA\s*:[^\n\r]*/gi, "").trim();
  s = s.replace(/TEXTO\s*:[^\n\r]*/gi, "").trim();
  return s;
}

function buscarListaBiblioteca(mediaLibrary, listId) {
  const ml = normalizarMediaLibrary(mediaLibrary);
  const id = String(listId || "").trim();
  if (!id) return null;
  return ml.lists.find((lista) => lista.id === id) || null;
}

function listaBibliotecaTieneFotos(lista) {
  return !!(lista && Array.isArray(lista.items) && lista.items.some((it) => it.url));
}

/**
 * @returns {{ action: 'media_library', listId: string, texto: string, lista: object } | null}
 */
function resolverAccionBibliotecaDesdeRespuesta(textoRespuesta, mediaLibrary) {
  const ml = normalizarMediaLibrary(mediaLibrary);
  if (!ml.enabled) return null;

  const parsed = parsearAccionBiblioteca(textoRespuesta);
  if (!parsed) return null;

  const lista = buscarListaBiblioteca(ml, parsed.listId);
  if (!lista || !listaBibliotecaTieneFotos(lista)) {
    console.log("[OPENAI_MEDIA_LIBRARY_INVALID]", {
      listId: parsed.listId,
      razon: !lista ? "lista_no_existe" : "lista_sin_fotos",
    });
    return null;
  }

  console.log("[OPENAI_MEDIA_LIBRARY_ACTION]", {
    listId: parsed.listId,
    texto: parsed.texto || "",
    fotos: lista.items.length,
  });

  return {
    action: "media_library",
    listId: parsed.listId,
    texto: parsed.texto || "",
    lista,
  };
}

module.exports = {
  MAX_FOTOS_SEGURO,
  crearMediaLibraryPorDefecto,
  normalizarMediaLibrary,
  construirPromptBibliotecas,
  parsearAccionBiblioteca,
  textoFallbackSinAccionBiblioteca,
  resolverAccionBibliotecaDesdeRespuesta,
  buscarListaBiblioteca,
  listaBibliotecaTieneFotos,
  listasParaPrompt,
  limiteFotosAEnviar,
  seleccionarItemsBiblioteca,
  resolverCaptionBiblioteca,
};
