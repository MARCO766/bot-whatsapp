/**
 * Copia de conversación de Seguimientos V2. Sin red, sin Storage real y sin Meta.
 * Ejecutar: node tests/seguimientoV2MediaCopia.test.js
 */
const assert = require("assert");
const {
  asegurarCopiaConversacionSeguimientoV2,
  buildRutaCopiaConversacion,
  parseUrlStoragePublica,
  resetVuelosCopiaSeguimientoV2,
  BUCKET_SEGUIMIENTO_V2_MEDIA,
  BUCKET_COPIA_CONVERSACION,
} = require("../services/seguimientoV2/seguimientoV2MediaStorage");
const { enviarSeguimientoV2 } = require("../services/seguimientoV2/seguimientoV2Sender");
const {
  textoRegistradoMedia,
  enlaceImagenSeguimientoV2Listo,
} = require("../services/whatsappService");

const SUPABASE = "https://proj.supabase.co";
const KEY = "service-key";
const USUARIO_A = "user-aaaa-1111";
const USUARIO_B = "user-bbbb-2222";
const CONN_A = "conn-aaaa-1111";
const CONN_B = "conn-bbbb-2222";
const LEAD_A = "5491111111111";
const LEAD_B = "5492222222222";

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("✅", name);
}

function urlOriginal(nombre, bucket = "seguimiento-v2-media") {
  return `${SUPABASE}/storage/v1/object/public/${bucket}/origen/${nombre}`;
}

function paramsBase(overrides = {}) {
  return {
    mediaUrl: urlOriginal("foto.jpg"),
    usuarioId: USUARIO_A,
    conexionWhatsappId: CONN_A,
    clienteNumero: LEAD_A,
    tipo: "image",
    ...overrides,
  };
}

function crearHttp(estado) {
  return {
    async get(url) {
      estado.gets.push(url);
      if (typeof estado.fallarGet === "function" && estado.fallarGet(url)) {
        throw new Error("storage caido");
      }
      if (url.includes("/object/info/") && !url.includes("/segv2/")) {
        return {
          status: 200,
          data: { size: estado.sizeOrigen, contentType: estado.mimeOrigen },
        };
      }
      if (url.includes("/object/info/") && url.includes("/segv2/")) {
        estado.lecturasDestino += 1;
        if (estado.destDespuesDe && estado.lecturasDestino <= estado.destDespuesDe) {
          return { status: 404, data: {} };
        }
        if (!estado.dest) return { status: 404, data: {} };
        return {
          status: 200,
          data: { size: estado.dest.size, contentType: estado.dest.mime },
        };
      }
      if (
        url.includes("/storage/v1/object/") &&
        !url.includes("/object/info/") &&
        !url.includes("/segv2/")
      ) {
        return { status: 200, data: Buffer.from("origen-bytes") };
      }
      throw new Error("GET inesperado");
    },
    async post(url, body, config) {
      const headers = config?.headers || {};
      estado.posts.push({ url, body, headers });
      if (headers["x-upsert"] === "true") {
        throw new Error("x-upsert true prohibido");
      }
      if (String(url).includes("/object/list/")) {
        return { status: 200, data: [] };
      }
      if (String(url).endsWith("/object/copy")) {
        if (estado.fallarCopy) throw new Error("copy caido");
        estado.copias += 1;
        if (estado.delay) await new Promise((resolve) => setTimeout(resolve, estado.delay));
        if (estado.copyStatus) {
          if (estado.destAlConflictar) estado.dest = estado.destAlConflictar;
          return { status: estado.copyStatus, data: estado.copyData || {} };
        }
        estado.dest = { size: estado.sizeOrigen, mime: estado.mimeOrigen };
        return { status: 200, data: { Key: body.destinationKey } };
      }
      if (String(url).includes("/storage/v1/object/archivos/")) {
        estado.uploads += 1;
        if (headers["Content-Type"] !== "image/jpeg") {
          throw new Error("upload sin jpeg");
        }
        if (estado.uploadStatus) {
          if (estado.destAlConflictar) estado.dest = estado.destAlConflictar;
          return { status: estado.uploadStatus, data: estado.uploadData || {} };
        }
        estado.dest = { size: 40, mime: "image/jpeg" };
        return { status: 200, data: {} };
      }
      throw new Error("POST inesperado");
    },
  };
}

function estadoHttp(overrides = {}) {
  return {
    gets: [],
    posts: [],
    copias: 0,
    uploads: 0,
    lecturasDestino: 0,
    sizeOrigen: 100,
    mimeOrigen: "image/jpeg",
    dest: null,
    ...overrides,
  };
}

function depsHttp(estado, extra = {}) {
  return {
    http: crearHttp(estado),
    supabaseUrl: SUPABASE,
    supabaseKey: KEY,
    ...extra,
  };
}

function copiasDe(estado) {
  return estado.posts.filter((item) => String(item.url).endsWith("/object/copy"));
}

function escriturasOriginal(estado) {
  return estado.posts.filter((item) => String(item.url).includes("/object/seguimiento-v2-media/"));
}

async function copiar(overrides, estadoOverrides, depsExtra) {
  resetVuelosCopiaSeguimientoV2();
  const estado = estadoHttp(estadoOverrides);
  const resultado = await asegurarCopiaConversacionSeguimientoV2(
    paramsBase(overrides),
    depsHttp(estado, depsExtra)
  );
  return { resultado, estado };
}

function itemMedia(overrides = {}) {
  return {
    id: "seg-v2-media-1",
    usuario_id: USUARIO_A,
    cliente_numero: LEAD_A,
    conexion_whatsapp_id: CONN_A,
    campana_id: "camp-1",
    paso_index: 1,
    tipo: "imagen",
    contenido: "Oferta de hoy",
    media_url: urlOriginal("foto.jpg"),
    media_filename: "foto.jpg",
    ...overrides,
  };
}

function depsSender(extra = {}) {
  return {
    existeMensajePorSeguimientoV2Id: async () => null,
    resolverConexionV2: async () => ({ id: CONN_A, phone_id: "phone-1", token: "tok" }),
    evaluarVentana24hSeguimientoV2: async () => ({ permitir: true, motivo: null, detalle: {} }),
    ...extra,
  };
}

function esCandidatoLimpieza(bucket, key) {
  return bucket === "archivos" && (key.startsWith("whatsapp/") || key.startsWith("whatsapp-meta/"));
}

function motivoLimpieza({ hilos, usuarios, protegida, ultimoEntranteMs, limiteMs, tieneEntrante }) {
  if (!hilos || hilos.length === 0) return "no_verificable";
  if (usuarios > 1) return "multi_usuario";
  if (protegida) return "referenciada";
  if (hilos.length > 1) return "compartida";
  if (!tieneEntrante) return "sin_entrante";
  if (ultimoEntranteMs > limiteMs) return "hilo_activo";
  return "candidato";
}

function ultimoEntrante(filas) {
  let max = null;
  for (const fila of filas) {
    if (fila.direccion !== "entrante") continue;
    if (max == null || fila.ms > max) max = fila.ms;
  }
  return max;
}

async function testRutasSeparadas() {
  const base = {
    bucket: "seguimiento-v2-media",
    sourceKey: "origen/foto.jpg",
  };
  const a = buildRutaCopiaConversacion({
    ...base,
    usuarioId: USUARIO_A,
    conexionWhatsappId: CONN_A,
    clienteNumero: LEAD_A,
  });
  const otroLead = buildRutaCopiaConversacion({
    ...base,
    usuarioId: USUARIO_A,
    conexionWhatsappId: CONN_A,
    clienteNumero: LEAD_B,
  });
  const otraConn = buildRutaCopiaConversacion({
    ...base,
    usuarioId: USUARIO_A,
    conexionWhatsappId: CONN_B,
    clienteNumero: LEAD_A,
  });
  const otroUsuario = buildRutaCopiaConversacion({
    ...base,
    usuarioId: USUARIO_B,
    conexionWhatsappId: CONN_A,
    clienteNumero: LEAD_A,
  });
  const misma = buildRutaCopiaConversacion({
    ...base,
    usuarioId: USUARIO_A,
    conexionWhatsappId: CONN_A,
    clienteNumero: "+54 91111111111",
  });
  assert.notStrictEqual(a.key, otroLead.key);
  assert.notStrictEqual(a.key, otraConn.key);
  assert.notStrictEqual(a.key, otroUsuario.key);
  assert.strictEqual(a.key, misma.key);
  assert.ok(a.key.startsWith(`whatsapp/${USUARIO_A}/segv2/${CONN_A}/${LEAD_A}/`));
  assert.ok(a.key.includes("foto.jpg"));
  assert.strictEqual(a.bucketDestino, "archivos");
  ok("1. Rutas separadas por lead, conexión y usuario, y reutilizables en el mismo hilo");
}

async function testTiposCopianSinTocarOriginal() {
  for (const caso of [
    { tipo: "image", nombre: "foto.jpg", mime: "image/jpeg" },
    { tipo: "video", nombre: "clip.mp4", mime: "video/mp4" },
    { tipo: "audio", nombre: "nota.ogg", mime: "audio/ogg" },
    { tipo: "document", nombre: "contrato.pdf", mime: "application/pdf" },
  ]) {
    const { resultado, estado } = await copiar(
      { tipo: caso.tipo, mediaUrl: urlOriginal(caso.nombre) },
      { mimeOrigen: caso.mime, sizeOrigen: 80 }
    );
    assert.strictEqual(resultado.lista, true, caso.tipo);
    assert.strictEqual(resultado.usoOriginal, false);
    assert.ok(resultado.publicUrl.includes("/object/public/archivos/whatsapp/"));
    assert.ok(resultado.publicUrl.includes("/segv2/"));
    assert.ok(resultado.publicUrl.endsWith(encodeURIComponent(caso.nombre)) || resultado.publicUrl.includes(caso.nombre));
    const copias = copiasDe(estado);
    assert.strictEqual(copias.length, 1, caso.tipo);
    assert.strictEqual(copias[0].body.bucketId, "seguimiento-v2-media");
    assert.strictEqual(copias[0].body.destinationBucket, "archivos");
    assert.notStrictEqual(copias[0].body.sourceKey, copias[0].body.destinationKey);
    assert.ok(copias[0].body.destinationKey.includes("/segv2/"));
    assert.strictEqual(copias[0].headers["x-upsert"], "false");
    assert.strictEqual(escriturasOriginal(estado).length, 0);
    assert.ok(!String(copias[0].body.destinationKey).startsWith("origen/"));
  }
  ok("2. Imagen, video, audio y PDF copian a archivos y no escriben el original");
}

async function testCopiaExistenteVerificada() {
  const { resultado, estado } = await copiar(
    {},
    { dest: { size: 100, mime: "image/jpeg" }, sizeOrigen: 100, mimeOrigen: "image/jpeg" }
  );
  assert.strictEqual(resultado.reutilizada, true);
  assert.strictEqual(resultado.lista, true);
  assert.strictEqual(resultado.enlaceListo, true);
  assert.strictEqual(copiasDe(estado).length, 0);
  ok("3. Si la copia existe y coincide en tamaño y tipo, se reutiliza");
}

async function testCopiaExistenteDistintaNoSeReutiliza() {
  const { resultado, estado } = await copiar(
    {},
    { dest: { size: 5, mime: "image/jpeg" }, sizeOrigen: 100, mimeOrigen: "image/jpeg" }
  );
  assert.strictEqual(resultado.usoOriginal, true);
  assert.strictEqual(resultado.motivo, "fallback_no_verificada");
  assert.strictEqual(copiasDe(estado).length, 0);
  assert.strictEqual(estado.uploads, 0);
  ok("4. Una copia existente que no coincide no se reutiliza ni se sobrescribe");
}

async function testConflictoConcurrenteVerificado() {
  const { resultado, estado } = await copiar(
    {},
    {
      copyStatus: 409,
      copyData: { message: "The resource already exists", statusCode: "409" },
      destDespuesDe: 1,
      destAlConflictar: { size: 100, mime: "image/jpeg" },
    }
  );
  assert.strictEqual(resultado.reutilizada, true);
  assert.strictEqual(resultado.lista, true);
  assert.strictEqual(estado.copias, 1);
  assert.ok(copiasDe(estado).every((item) => item.headers["x-upsert"] === "false"));
  ok("5. Un conflicto de copia reutiliza el objeto solo después de verificarlo");
}

async function testEnviosSimultaneosUnaCopia() {
  resetVuelosCopiaSeguimientoV2();
  const estado = estadoHttp({ delay: 40 });
  const deps = depsHttp(estado);
  const [a, b] = await Promise.all([
    asegurarCopiaConversacionSeguimientoV2(paramsBase(), deps),
    asegurarCopiaConversacionSeguimientoV2(paramsBase(), deps),
  ]);
  assert.strictEqual(a.publicUrl, b.publicUrl);
  assert.strictEqual(estado.copias, 1);
  ok("6. Dos envíos simultáneos del mismo hilo hacen una sola copia");
}

async function testFalloStorage() {
  const caido = await copiar({}, { fallarCopy: true });
  assert.strictEqual(caido.resultado.usoOriginal, true);
  assert.strictEqual(caido.resultado.lista, false);
  assert.strictEqual(caido.resultado.motivo, "fallback_copia");
  assert.strictEqual(caido.resultado.publicUrl, urlOriginal("foto.jpg"));

  const previoUrl = process.env.SUPABASE_URL;
  const previoKey = process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  resetVuelosCopiaSeguimientoV2();
  try {
    const sinConfig = await asegurarCopiaConversacionSeguimientoV2(paramsBase(), {
      http: {
        get() {
          throw new Error("no debio leer");
        },
        post() {
          throw new Error("no debio escribir");
        },
      },
    });
    assert.strictEqual(sinConfig.motivo, "fallback_config");
    assert.strictEqual(sinConfig.usoOriginal, true);
  } finally {
    if (previoUrl == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previoUrl;
    if (previoKey == null) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previoKey;
  }
  ok("7. Si Storage falla, el envío sigue con el original");
}

async function testWebpNoPisaOriginal() {
  let preparadas = 0;
  const { resultado, estado } = await copiar(
    { mediaUrl: urlOriginal("promo.webp"), tipo: "image" },
    { mimeOrigen: "image/webp", sizeOrigen: 70 },
    {
      prepararImagenParaWhatsApp: async () => {
        preparadas += 1;
        return { buffer: Buffer.from("jpeg"), mimetype: "image/jpeg", extension: "jpg" };
      },
    }
  );
  assert.strictEqual(preparadas, 1);
  assert.strictEqual(estado.copias, 0);
  assert.strictEqual(estado.uploads, 1);
  assert.strictEqual(escriturasOriginal(estado).length, 0);
  assert.ok(resultado.publicUrl.endsWith(".jpg"));
  assert.strictEqual(resultado.enlaceListo, true);
  assert.ok(estado.posts.every((item) => item.headers["x-upsert"] !== "true"));
  ok("8. Un WEBP se convierte a JPEG en la copia y el original queda intacto");
}

async function testOriginalDeFlujoNoSeSobrescribe() {
  const flujo = `${SUPABASE}/storage/v1/object/public/archivos/whatsapp/${USUARIO_A}/171000-nodo.jpg`;
  const { resultado, estado } = await copiar(
    { mediaUrl: flujo, tipo: "image" },
    { mimeOrigen: "image/jpeg", sizeOrigen: 90 }
  );
  const copia = copiasDe(estado)[0];
  assert.ok(copia);
  assert.strictEqual(copia.body.bucketId, "archivos");
  assert.strictEqual(copia.body.sourceKey, `whatsapp/${USUARIO_A}/171000-nodo.jpg`);
  assert.notStrictEqual(copia.body.destinationKey, copia.body.sourceKey);
  assert.ok(copia.body.destinationKey.includes("/segv2/"));
  assert.ok(!copia.body.destinationKey.endsWith("171000-nodo.jpg") || copia.body.destinationKey.includes("/segv2/"));
  assert.strictEqual(resultado.lista, true);
  assert.ok(!resultado.publicUrl.endsWith(`/whatsapp/${USUARIO_A}/171000-nodo.jpg`));
  ok("9. Un archivo de flujo se lee como origen y se escribe solo en segv2");
}

async function testSenderUsaCopiaYSeparaContenido() {
  const item = itemMedia();
  const original = item.media_url;
  let recibido = null;
  const res = await enviarSeguimientoV2(item, {
    deps: depsSender({
      asegurarCopiaConversacionSeguimientoV2: async () => ({
        lista: true,
        enlaceListo: true,
        publicUrl: `${SUPABASE}/storage/v1/object/public/archivos/whatsapp/${USUARIO_A}/segv2/${CONN_A}/${LEAD_A}/abc-foto.jpg`,
      }),
      enviarMediaWhatsApp: async (numero, tipo, url, caption, opciones) => {
        recibido = { numero, tipo, url, caption, opciones };
        return { whatsapp_message_id: "wamid.1" };
      },
    }),
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(item.media_url, original);
  assert.strictEqual(recibido.caption, "Oferta de hoy");
  assert.ok(recibido.url.includes("/segv2/"));
  assert.notStrictEqual(recibido.url, original);
  assert.strictEqual(recibido.opciones.contenidoInbox, "Oferta de hoy");
  assert.strictEqual(recibido.opciones.segv2EnlaceListo, true);
  assert.strictEqual(recibido.opciones.filename, "foto.jpg");
  assert.ok(!("publicUrl" in res));
  assert.strictEqual(
    textoRegistradoMedia(recibido.caption, recibido.url, recibido.opciones),
    "Oferta de hoy"
  );
  ok("10. El envío usa la copia, guarda el pie en contenido y no toca la plantilla");
}

async function testCaptionVacioNoGuardaUrl() {
  const item = itemMedia({ contenido: "   ", tipo: "video", media_filename: "" });
  let recibido = null;
  await enviarSeguimientoV2(item, {
    deps: depsSender({
      asegurarCopiaConversacionSeguimientoV2: async () => ({
        lista: true,
        enlaceListo: false,
        publicUrl: `${SUPABASE}/storage/v1/object/public/archivos/whatsapp/${USUARIO_A}/segv2/${CONN_A}/${LEAD_A}/abc-clip.mp4`,
      }),
      enviarMediaWhatsApp: async (numero, tipo, url, caption, opciones) => {
        recibido = { tipo, url, caption, opciones };
        return { whatsapp_message_id: "wamid.2" };
      },
    }),
  });
  assert.strictEqual(recibido.caption, "");
  assert.strictEqual(recibido.opciones.contenidoInbox, "");
  assert.strictEqual(recibido.opciones.segv2EnlaceListo, undefined);
  assert.strictEqual(textoRegistradoMedia("", recibido.url, recibido.opciones), "");
  assert.ok(!textoRegistradoMedia("", recibido.url, recibido.opciones).includes("http"));
  ok("11. Sin pie de foto, contenido queda vacío y la URL solo va a imagen_url");
}

async function testFalloCopiaMantieneEnvioActual() {
  const item = itemMedia({ contenido: "" });
  const original = item.media_url;
  let recibido = null;
  const res = await enviarSeguimientoV2(item, {
    deps: depsSender({
      asegurarCopiaConversacionSeguimientoV2: async () => ({
        lista: false,
        usoOriginal: true,
        motivo: "fallback_copia",
        publicUrl: original,
      }),
      enviarMediaWhatsApp: async (numero, tipo, url, caption, opciones) => {
        recibido = { url, caption, opciones };
        return { whatsapp_message_id: "wamid.3" };
      },
    }),
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(recibido.url, original);
  assert.strictEqual(recibido.opciones.contenidoInbox, undefined);
  assert.strictEqual(textoRegistradoMedia("", original, recibido.opciones), original);
  assert.strictEqual(item.media_url, original);
  ok("12. Si la copia falla, Meta recibe el original y el registro no cambia de regla");
}

async function testMetaFallaDespuesDeCopiar() {
  const item = itemMedia();
  const original = item.media_url;
  const copiaUrl = `${SUPABASE}/storage/v1/object/public/archivos/whatsapp/${USUARIO_A}/segv2/${CONN_A}/${LEAD_A}/abc-foto.jpg`;
  let copio = false;
  const res = await enviarSeguimientoV2(item, {
    deps: depsSender({
      asegurarCopiaConversacionSeguimientoV2: async () => {
        copio = true;
        return { lista: true, enlaceListo: true, publicUrl: copiaUrl };
      },
      enviarMediaWhatsApp: async () => {
        throw new Error(`Meta rechazo ${copiaUrl}`);
      },
    }),
  });
  assert.strictEqual(copio, true);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(item.media_url, original);
  assert.ok(!res.motivo.includes(copiaUrl));
  assert.ok(!res.motivo.includes("/storage/v1/"));
  assert.ok(!("imagen_url" in res));
  ok("13. Si Meta falla después de copiar, no se reescribe la plantilla ni se devuelve la URL");
}

async function testTextoNoCopiaYOtrosOrigenesNoCambian() {
  let copias = 0;
  let textos = 0;
  const res = await enviarSeguimientoV2(itemMedia({ tipo: "texto", contenido: "Hola", media_url: null }), {
    deps: depsSender({
      asegurarCopiaConversacionSeguimientoV2: async () => {
        copias += 1;
        return { lista: true, publicUrl: "no" };
      },
      enviarTextoWhatsApp: async () => {
        textos += 1;
        return { whatsapp_message_id: "wamid.txt" };
      },
    }),
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(copias, 0);
  assert.strictEqual(textos, 1);

  const url = urlOriginal("foto.jpg");
  assert.strictEqual(
    textoRegistradoMedia("Pie", url, { origen: "seguimiento", contenidoInbox: "" }),
    "Pie"
  );
  assert.strictEqual(
    textoRegistradoMedia("", url, { origen: "seguimiento", contenidoInbox: "" }),
    url
  );
  assert.strictEqual(textoRegistradoMedia("", url, { contenidoInbox: "" }), url);
  assert.strictEqual(
    enlaceImagenSeguimientoV2Listo(
      { origen: "seguimiento", segv2EnlaceListo: true },
      `${SUPABASE}/storage/v1/object/public/archivos/whatsapp/u/segv2/c/n/a.jpg`
    ),
    false
  );
  assert.strictEqual(
    enlaceImagenSeguimientoV2Listo(
      { origen: "seguimiento_v2", segv2EnlaceListo: true },
      url
    ),
    false
  );
  ok("14. El texto no copia, y flujos o Seguimientos V1 conservan su registro");
}

async function testReutilizaConHeadSiNoHayFicha() {
  resetVuelosCopiaSeguimientoV2();
  const estado = estadoHttp();
  const http = {
    async get() {
      return { status: 404, data: {} };
    },
    async post(url) {
      estado.posts.push({ url, body: {}, headers: {} });
      return { status: 200, data: [] };
    },
    async head(url) {
      if (url.includes("/segv2/")) {
        return { status: 200, headers: { "content-length": "100", "content-type": "image/jpeg" } };
      }
      return { status: 200, headers: { "content-length": "100", "content-type": "image/jpeg" } };
    },
  };
  const resultado = await asegurarCopiaConversacionSeguimientoV2(paramsBase(), {
    http,
    supabaseUrl: SUPABASE,
    supabaseKey: KEY,
  });
  assert.strictEqual(resultado.reutilizada, true);
  assert.strictEqual(resultado.lista, true);
  assert.strictEqual(copiasDe(estado).length, 0);
  ok("15. Si la ficha no responde, el HEAD confirma tamaño y tipo antes de reutilizar");
}

async function testLimpieza30Dias() {
  const copia = parseUrlStoragePublica(
    `${SUPABASE}/storage/v1/object/public/archivos/whatsapp/${USUARIO_A}/segv2/${CONN_A}/${LEAD_A}/abc-foto.jpg`
  );
  const plantilla = parseUrlStoragePublica(urlOriginal("foto.jpg"));
  const flujo = parseUrlStoragePublica(
    `${SUPABASE}/storage/v1/object/public/archivos/whatsapp/${USUARIO_A}/171000-nodo.jpg`
  );
  assert.strictEqual(esCandidatoLimpieza(copia.bucket, copia.key), true);
  assert.strictEqual(esCandidatoLimpieza(plantilla.bucket, plantilla.key), false);
  assert.strictEqual(BUCKET_SEGUIMIENTO_V2_MEDIA, "seguimiento-v2-media");
  assert.strictEqual(BUCKET_COPIA_CONVERSACION, "archivos");

  const limite = 1000;
  const inactivo = motivoLimpieza({
    hilos: ["a"],
    usuarios: 1,
    protegida: false,
    ultimoEntranteMs: 100,
    limiteMs: limite,
    tieneEntrante: true,
  });
  assert.strictEqual(inactivo, "candidato");

  const contenidoProtege = motivoLimpieza({
    hilos: ["a"],
    usuarios: 1,
    protegida: true,
    ultimoEntranteMs: 100,
    limiteMs: limite,
    tieneEntrante: true,
  });
  assert.strictEqual(contenidoProtege, "referenciada");

  const compartida = motivoLimpieza({
    hilos: ["a", "b"],
    usuarios: 1,
    protegida: false,
    ultimoEntranteMs: 100,
    limiteMs: limite,
    tieneEntrante: true,
  });
  assert.strictEqual(compartida, "compartida");

  const activo = motivoLimpieza({
    hilos: ["a"],
    usuarios: 1,
    protegida: false,
    ultimoEntranteMs: 5000,
    limiteMs: limite,
    tieneEntrante: true,
  });
  assert.strictEqual(activo, "hilo_activo");

  const flujoProtegido = motivoLimpieza({
    hilos: ["a"],
    usuarios: 1,
    protegida: true,
    ultimoEntranteMs: 100,
    limiteMs: limite,
    tieneEntrante: true,
  });
  assert.strictEqual(flujoProtegido, "referenciada");
  assert.strictEqual(esCandidatoLimpieza(flujo.bucket, flujo.key), true);

  const marcas = ultimoEntrante([
    { direccion: "entrante", ms: 10 },
    { direccion: "saliente", ms: 99999 },
    { direccion: "entrante", ms: 40 },
  ]);
  assert.strictEqual(marcas, 40);

  const contenido = textoRegistradoMedia(
    "Oferta de hoy",
    `${SUPABASE}/storage/v1/object/public/archivos/whatsapp/${USUARIO_A}/segv2/${CONN_A}/${LEAD_A}/abc-foto.jpg`,
    {
      origen: "seguimiento_v2",
      contenidoInbox: "Oferta de hoy",
    }
  );
  assert.strictEqual(contenido, "Oferta de hoy");
  assert.ok(!contenido.includes("/storage/v1/"));
  ok("16. La copia entra en la regla de 30 días y la plantilla, el flujo y el pie no");
}

async function main() {
  await testRutasSeparadas();
  await testTiposCopianSinTocarOriginal();
  await testCopiaExistenteVerificada();
  await testCopiaExistenteDistintaNoSeReutiliza();
  await testConflictoConcurrenteVerificado();
  await testEnviosSimultaneosUnaCopia();
  await testFalloStorage();
  await testWebpNoPisaOriginal();
  await testOriginalDeFlujoNoSeSobrescribe();
  await testSenderUsaCopiaYSeparaContenido();
  await testCaptionVacioNoGuardaUrl();
  await testFalloCopiaMantieneEnvioActual();
  await testMetaFallaDespuesDeCopiar();
  await testTextoNoCopiaYOtrosOrigenesNoCambian();
  await testReutilizaConHeadSiNoHayFicha();
  await testLimpieza30Dias();
  console.log(`\n${passed} pruebas ok`);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
