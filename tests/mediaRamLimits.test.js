/**
 * Límites de RAM en subidas y descargas de media.
 * Ejecutar: node --expose-gc tests/mediaRamLimits.test.js
 */
const assert = require("assert");
const http = require("http");
const fs = require("fs");
const { execSync } = require("child_process");
const express = require("express");

const {
  LIMITE_IMAGEN_BYTES,
  LIMITE_AUDIO_BYTES,
  LIMITE_VIDEO_BYTES,
  LIMITE_DOCUMENTO_BYTES,
  LIMITE_DOCUMENTO_WEBHOOK_BYTES,
  LIMITE_INBOX_BYTES,
  LIMITE_AUDIO_SALIDA_BYTES,
} = require("../services/mediaRamLimits");
const {
  crearUploadMemoria,
  crearUploadPorTipo,
  limiteSubidaPanel,
  recibirArchivo,
} = require("../middlewares/uploadMemoriaLimitada");
const {
  descargarBinarioLimitado,
  esErrorLimiteTamano,
  tamanoDeclaradoExcede,
} = require("../services/descargaBinariaLimitada");
const {
  TEMP_DIR,
  MAX_CONVERSIONES_FFMPEG,
  MAX_ESPERA_FFMPEG,
  estadoColaAudio,
  convertirAudioInbox,
} = require("../services/audioInboxConvert");
const {
  resolverFuenteImagenComprobante,
} = require("../services/lectorPagoService");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("✅", name);
}

function gc() {
  if (typeof global.gc === "function") global.gc();
}

function memoria() {
  gc();
  const m = process.memoryUsage();
  return m.heapUsed + m.external;
}

function wavSilencio() {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * 0.25);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function cuerpoMultipart(filename, mime, buffer) {
  const boundary = "----MacBotBoundary";
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="archivo"; filename="${filename}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.alloc(head.length + buffer.length + tail.length);
  head.copy(body, 0);
  buffer.copy(body, head.length);
  tail.copy(body, head.length + buffer.length);
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body,
  };
}

function postMultipart(port, { filename, mime, buffer }) {
  const { contentType, body } = cuerpoMultipart(filename, mime, buffer);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/subir",
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "Content-Length": body.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (_) {
            json = null;
          }
          resolve({ status: res.statusCode, text, json });
        });
      }
    );
    req.on("error", reject);
    req.end(body);
  });
}

function escuchar(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function cerrar(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function procesosFfmpeg() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq ffmpeg.exe" /NH', {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return (out.match(/ffmpeg\.exe/gi) || []).length;
  } catch (_) {
    return 0;
  }
}

function temps() {
  return fs.readdirSync(TEMP_DIR).sort();
}

async function testConstantes() {
  assert.strictEqual(LIMITE_IMAGEN_BYTES, 2 * 1024 * 1024);
  assert.strictEqual(LIMITE_AUDIO_BYTES, 5 * 1024 * 1024);
  assert.strictEqual(LIMITE_VIDEO_BYTES, 15 * 1024 * 1024);
  assert.strictEqual(LIMITE_DOCUMENTO_BYTES, 5 * 1024 * 1024);
  assert.strictEqual(LIMITE_DOCUMENTO_WEBHOOK_BYTES, 8 * 1024 * 1024);
  assert.strictEqual(LIMITE_INBOX_BYTES, LIMITE_VIDEO_BYTES);
  assert.strictEqual(LIMITE_AUDIO_SALIDA_BYTES, 16 * 1024 * 1024);

  const video = crearUploadMemoria(LIMITE_VIDEO_BYTES);
  const imagen = crearUploadMemoria(LIMITE_IMAGEN_BYTES);
  const inbox = crearUploadMemoria(LIMITE_INBOX_BYTES);
  assert.strictEqual(video.limits.fileSize, LIMITE_VIDEO_BYTES + 1);
  assert.strictEqual(imagen.limits.fileSize, LIMITE_IMAGEN_BYTES + 1);
  assert.strictEqual(inbox.limits.fileSize, LIMITE_INBOX_BYTES + 1);
  ok("los topes de multer coinciden con los límites ya usados");
}

async function testSubidaPermitidaYExcesiva() {
  const limite = 64 * 1024;
  let handlerLlamado = false;
  let tamanoRecibido = -1;
  const upload = crearUploadMemoria(limite);
  const app = express();
  app.post(
    "/subir",
    recibirArchivo(upload, (req, res) => {
      res.status(400).json({
        error: "limite",
        mime: req._mediaUploadMime || "",
      });
    }),
    (req, res) => {
      handlerLlamado = true;
      tamanoRecibido = req.file ? req.file.buffer.length : -1;
      res.json({ ok: true, size: tamanoRecibido });
    }
  );
  const server = http.createServer(app);
  const port = await escuchar(server);
  const originalConcat = Buffer.concat;

  try {
    const permitido = Buffer.alloc(8 * 1024, 1);
    const rOk = await postMultipart(port, {
      filename: "nota.mp3",
      mime: "audio/mpeg",
      buffer: permitido,
    });
    assert.strictEqual(rOk.status, 200);
    assert.strictEqual(rOk.json.size, permitido.length);
    assert.strictEqual(handlerLlamado, true);
    ok("un archivo bajo el límite llega completo al handler");

    handlerLlamado = false;
    const antes = temps();
    let maxConcat = 0;
    Buffer.concat = function medir(...args) {
      const out = originalConcat.apply(Buffer, args);
      if (out.length > maxConcat) maxConcat = out.length;
      return out;
    };

    const enorme = 2 * 1024 * 1024;
    const rNo = await postMultipart(port, {
      filename: "grande.mp4",
      mime: "video/mp4",
      buffer: Buffer.alloc(enorme, 9),
    });
    Buffer.concat = originalConcat;

    assert.strictEqual(rNo.status, 400);
    assert.strictEqual(rNo.json.error, "limite");
    assert.strictEqual(rNo.json.mime, "video/mp4");
    assert.strictEqual(handlerLlamado, false);
    assert.ok(
      maxConcat > 0 && maxConcat <= limite + 1,
      `se concatenó ${maxConcat} bytes; el tope es ${limite} y el archivo mide ${enorme}`
    );
    assert.deepStrictEqual(temps(), antes);
    ok("un archivo sobre el límite se rechaza sin el buffer completo ni temporales");

    handlerLlamado = false;
    const justo = Buffer.alloc(limite, 2);
    const rJusto = await postMultipart(port, {
      filename: "justo.mp3",
      mime: "audio/mpeg",
      buffer: justo,
    });
    assert.strictEqual(rJusto.status, 200);
    assert.strictEqual(rJusto.json.size, limite);
    assert.strictEqual(handlerLlamado, true);

    handlerLlamado = false;
    const rUnByte = await postMultipart(port, {
      filename: "un-byte.mp3",
      mime: "audio/mpeg",
      buffer: Buffer.alloc(limite + 1, 3),
    });
    assert.strictEqual(rUnByte.status, 400);
    assert.strictEqual(rUnByte.json.error, "limite");
    assert.strictEqual(handlerLlamado, false);
    ok("un archivo que mide exactamente el tope llega y un byte más no");
  } finally {
    Buffer.concat = originalConcat;
    await cerrar(server);
  }
}

async function testLimitesExactosPorTipo() {
  let handlerLlamado = false;
  let tamanoRecibido = -1;
  const upload = crearUploadPorTipo(limiteSubidaPanel, LIMITE_VIDEO_BYTES);
  const app = express();
  app.post(
    "/subir",
    recibirArchivo(upload, (_req, res) => {
      res.status(400).json({ error: "limite" });
    }),
    (req, res) => {
      handlerLlamado = true;
      tamanoRecibido = req.file ? req.file.size : -1;
      if (req.file) req.file.buffer = null;
      res.json({ ok: true, size: tamanoRecibido });
    }
  );
  const server = http.createServer(app);
  const port = await escuchar(server);
  const casos = [
    ["imagen", "foto.jpg", "image/jpeg", LIMITE_IMAGEN_BYTES],
    ["audio", "nota.mp3", "audio/mpeg", LIMITE_AUDIO_BYTES],
    ["documento", "nota.pdf", "application/pdf", LIMITE_DOCUMENTO_BYTES],
    ["video", "clip.mp4", "video/mp4", LIMITE_VIDEO_BYTES],
  ];

  try {
    for (const [tipo, filename, mime, max] of casos) {
      handlerLlamado = false;
      let exacto = Buffer.alloc(max, 5);
      const rOk = await postMultipart(port, { filename, mime, buffer: exacto });
      exacto = null;
      assert.strictEqual(rOk.status, 200);
      assert.strictEqual(rOk.json.size, max);
      assert.strictEqual(handlerLlamado, true);

      handlerLlamado = false;
      const originalConcat = Buffer.concat;
      let maxConcat = 0;
      Buffer.concat = function medir(...args) {
        const out = originalConcat.apply(Buffer, args);
        if (out.length > maxConcat) maxConcat = out.length;
        return out;
      };
      let sobrante = Buffer.alloc(max + 1, 6);
      let rNo;
      try {
        rNo = await postMultipart(port, { filename, mime, buffer: sobrante });
      } finally {
        Buffer.concat = originalConcat;
        sobrante = null;
      }
      assert.strictEqual(rNo.status, 400);
      assert.strictEqual(rNo.json.error, "limite");
      assert.strictEqual(handlerLlamado, false);
      assert.ok(
        maxConcat <= max,
        `${tipo}: se concatenaron ${maxConcat} bytes de un archivo de ${max + 1}`
      );
      gc();
      const articulo = tipo === "imagen" ? "una" : "un";
      ok(`${articulo} ${tipo} de exactamente su máximo llega y un byte más no alcanza el handler`);
    }
  } finally {
    await cerrar(server);
  }
}

async function testDescargas() {
  assert.strictEqual(tamanoDeclaradoExcede(LIMITE_AUDIO_BYTES + 1, LIMITE_AUDIO_BYTES), true);
  assert.strictEqual(tamanoDeclaradoExcede(LIMITE_AUDIO_BYTES, LIMITE_AUDIO_BYTES), false);
  assert.strictEqual(tamanoDeclaradoExcede(undefined, LIMITE_AUDIO_BYTES), false);

  const sockets = new Set();
  const server = http.createServer((req, res) => {
    if (req.url === "/pequeno") {
      const body = Buffer.from("ok-media");
      res.setHeader("Content-Length", String(body.length));
      res.end(body);
      return;
    }
    if (req.url === "/grande") {
      const total = 3 * 1024 * 1024;
      const chunk = Buffer.alloc(32 * 1024, 4);
      let enviado = 0;
      res.setHeader("Content-Length", String(total));
      const escribir = () => {
        try {
          while (enviado < total && !res.destroyed) {
            const okWrite = res.write(chunk);
            enviado += chunk.length;
            if (!okWrite) {
              res.once("drain", escribir);
              return;
            }
          }
          if (!res.destroyed) res.end();
        } catch (_) {
          // el cliente abortó al superar maxContentLength
        }
      };
      res.on("error", () => {});
      escribir();
      return;
    }
    if (req.url === "/cuelga") {
      res.setHeader("Content-Length", "1000");
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  const port = await escuchar(server);
  const base = `http://127.0.0.1:${port}`;

  try {
    const pequeno = await descargarBinarioLimitado(`${base}/pequeno`, {
      maxBytes: 1024,
      timeout: 2000,
    });
    assert.strictEqual(Buffer.from(pequeno).toString(), "ok-media");
    ok("una descarga dentro del límite devuelve el archivo");

    const antesHeap = memoria();
    let errorGrande = null;
    try {
      await descargarBinarioLimitado(`${base}/grande`, {
        maxBytes: 128 * 1024,
        timeout: 5000,
      });
    } catch (error) {
      errorGrande = error;
    }
    const despuesHeap = memoria();
    assert.ok(errorGrande, "la descarga grande debía rechazarse");
    assert.strictEqual(esErrorLimiteTamano(errorGrande), true);
    assert.ok(
      !errorGrande.response ||
        !errorGrande.response.data ||
        (errorGrande.response.data.byteLength || 0) <= 128 * 1024
    );
    const retenido = despuesHeap - antesHeap;
    assert.ok(
      retenido < 1024 * 1024,
      `la descarga rechazada dejó ${retenido} bytes en el heap`
    );
    ok("una descarga sobre el límite se aborta sin conservar el archivo");

    let errorCuelga = null;
    try {
      await descargarBinarioLimitado(`${base}/cuelga`, {
        maxBytes: 1024,
        timeout: 300,
      });
    } catch (error) {
      errorCuelga = error;
    }
    assert.ok(errorCuelga);
    assert.strictEqual(errorCuelga.code, "ECONNABORTED");
    await new Promise((r) => setTimeout(r, 200));
    for (const socket of sockets) socket.destroy();
    ok("una descarga colgada corta por timeout");
  } finally {
    for (const socket of sockets) socket.destroy();
    await cerrar(server);
  }
}

async function testComprobanteNoRedescarga() {
  let llamadas = 0;
  const conUrl = await resolverFuenteImagenComprobante({
    imagePublicUrl: "https://cdn.ejemplo.test/comprobante.jpg",
    imageMetaId: "media-1",
    metaToken: "token",
    descargar: async () => {
      llamadas += 1;
      return { dataUrl: "data:image/jpeg;base64,AAAA" };
    },
  });
  assert.strictEqual(llamadas, 0);
  assert.strictEqual(conUrl.imageDataUrl, null);
  assert.strictEqual(conUrl.imagePublicUrl, "https://cdn.ejemplo.test/comprobante.jpg");
  assert.ok(!String(conUrl.imageDataUrl || "").includes("base64"));

  const sinUrl = await resolverFuenteImagenComprobante({
    imagePublicUrl: "",
    imageMetaId: "media-2",
    metaToken: "token",
    descargar: async () => {
      llamadas += 1;
      return { dataUrl: "data:image/jpeg;base64,BBBB" };
    },
  });
  assert.strictEqual(llamadas, 1);
  assert.strictEqual(sinUrl.imageDataUrl, "data:image/jpeg;base64,BBBB");
  ok("con URL pública no se vuelve a bajar el comprobante ni se arma base64");
}

async function testAudio() {
  const antes = temps();
  const ffAntes = procesosFfmpeg();

  let rechazo = null;
  try {
    await convertirAudioInbox(
      { buffer: Buffer.alloc(32, 1) },
      { maxInputBytes: 8 }
    );
  } catch (error) {
    rechazo = error;
  }
  assert.strictEqual(rechazo && rechazo.code, "AUDIO_DEMASIADO_GRANDE");
  assert.deepStrictEqual(temps(), antes);
  assert.strictEqual(procesosFfmpeg(), ffAntes);
  ok("un audio sobre el tope no arranca ffmpeg ni deja temporales");

  let fallo = null;
  try {
    await convertirAudioInbox({ buffer: Buffer.from("esto-no-es-audio") });
  } catch (error) {
    fallo = error;
  }
  assert.ok(fallo);
  assert.notStrictEqual(fallo.code, "AUDIO_DEMASIADO_GRANDE");
  await new Promise((r) => setTimeout(r, 300));
  assert.deepStrictEqual(temps(), antes);
  assert.strictEqual(procesosFfmpeg(), ffAntes);
  ok("un error de ffmpeg no deja proceso ni archivos temporales");

  const convertido = await convertirAudioInbox({ buffer: wavSilencio() });
  assert.strictEqual(convertido.mimetype, "audio/mpeg");
  assert.strictEqual(convertido.originalname, "audio.mp3");
  assert.ok(convertido.buffer.length > 0);
  assert.deepStrictEqual(temps(), antes);
  assert.strictEqual(procesosFfmpeg(), ffAntes);
  ok("un audio permitido se convierte a mp3 y limpia los temporales");

  let salidaGrande = null;
  try {
    await convertirAudioInbox(
      { buffer: wavSilencio() },
      { maxOutputBytes: 1 }
    );
  } catch (error) {
    salidaGrande = error;
  }
  assert.strictEqual(salidaGrande && salidaGrande.code, "AUDIO_DEMASIADO_GRANDE");
  assert.deepStrictEqual(temps(), antes);
  assert.strictEqual(procesosFfmpeg(), ffAntes);
  ok("una salida de audio sobre el tope no se carga entera y se borra");

  let timeout = null;
  try {
    await convertirAudioInbox({ buffer: wavSilencio() }, { timeoutMs: 1 });
  } catch (error) {
    timeout = error;
  }
  assert.ok(timeout);
  await new Promise((r) => setTimeout(r, 600));
  assert.deepStrictEqual(temps(), antes);
  assert.strictEqual(procesosFfmpeg(), ffAntes);
  ok("el corte de ffmpeg no deja el proceso ni los temporales");
}

function colaVacia() {
  assert.deepStrictEqual(estadoColaAudio(), { activas: 0, esperando: 0 });
}

async function testColaFfmpeg() {
  const antes = temps();
  const ffAntes = procesosFfmpeg();
  assert.strictEqual(MAX_CONVERSIONES_FFMPEG, 1);
  assert.strictEqual(MAX_ESPERA_FFMPEG, 2);
  colaVacia();

  const uno = { buffer: wavSilencio() };
  const convertidoUno = await convertirAudioInbox(uno);
  assert.strictEqual(convertidoUno.mimetype, "audio/mpeg");
  assert.strictEqual(convertidoUno.originalname, "audio.mp3");
  assert.ok(convertidoUno.buffer.length > 0);
  assert.strictEqual(uno.buffer, null);
  colaVacia();
  assert.deepStrictEqual(temps(), antes);
  assert.strictEqual(procesosFfmpeg(), ffAntes);
  ok("1 solicitud usa el turno y lo libera al terminar");

  const dos = [{ buffer: wavSilencio() }, { buffer: wavSilencio() }];
  const convertidosDos = await Promise.all(dos.map((file) => convertirAudioInbox(file)));
  assert.strictEqual(convertidosDos.length, 2);
  assert.ok(convertidosDos.every((audio) => audio.mimetype === "audio/mpeg" && audio.buffer.length > 0));
  assert.ok(dos.every((file) => file.buffer === null));
  colaVacia();
  assert.deepStrictEqual(temps(), antes);
  assert.strictEqual(procesosFfmpeg(), ffAntes);
  ok("2 solicitudes simultáneas terminan y liberan el turno");

  const tres = [{ buffer: wavSilencio() }, { buffer: wavSilencio() }, { buffer: wavSilencio() }];
  const convertidosTres = await Promise.all(tres.map((file) => convertirAudioInbox(file)));
  assert.strictEqual(convertidosTres.length, 3);
  assert.ok(convertidosTres.every((audio) => audio.mimetype === "audio/mpeg" && audio.buffer.length > 0));
  assert.ok(tres.every((file) => file.buffer === null));
  colaVacia();
  assert.deepStrictEqual(temps(), antes);
  assert.strictEqual(procesosFfmpeg(), ffAntes);
  ok("3 solicitudes simultáneas terminan: 1 activa y 2 en espera");

  const cuatro = [0, 1, 2, 3].map(() => ({ buffer: wavSilencio() }));
  const inicio = Date.now();
  const pendientes = cuatro.map((file) =>
    convertirAudioInbox(file).then(
      (valor) => ({ ok: true, valor, file }),
      (error) => ({ ok: false, error, file })
    )
  );
  const ocupada = estadoColaAudio();
  assert.strictEqual(ocupada.activas, 1);
  assert.strictEqual(ocupada.esperando, 2);
  const rechazada = await pendientes[3];
  const tardanza = Date.now() - inicio;
  assert.strictEqual(rechazada.ok, false);
  assert.strictEqual(rechazada.error.code, "AUDIO_COLA_LLENA");
  assert.ok(tardanza < 1000);
  assert.strictEqual(cuatro[3].buffer, null);
  const admitidas = await Promise.all(pendientes.slice(0, 3));
  assert.ok(admitidas.every((resultado) => resultado.ok && resultado.valor.buffer.length > 0));
  assert.ok(cuatro.slice(0, 3).every((file) => file.buffer === null));
  colaVacia();
  assert.deepStrictEqual(temps(), antes);
  assert.strictEqual(procesosFfmpeg(), ffAntes);
  ok("la cuarta solicitud se rechaza sin quedar esperando");

  const malo = { buffer: Buffer.from("esto-no-es-audio") };
  let fallo = null;
  try {
    await convertirAudioInbox(malo);
  } catch (error) {
    fallo = error;
  }
  assert.ok(fallo);
  assert.notStrictEqual(fallo.code, "AUDIO_COLA_LLENA");
  assert.strictEqual(malo.buffer, null);
  colaVacia();
  const trasError = await convertirAudioInbox({ buffer: wavSilencio() });
  assert.ok(trasError.buffer.length > 0);
  colaVacia();
  assert.deepStrictEqual(temps(), antes);
  assert.strictEqual(procesosFfmpeg(), ffAntes);
  ok("un error libera el turno y el buffer");

  const lento = { buffer: wavSilencio() };
  let timeout = null;
  try {
    await convertirAudioInbox(lento, { timeoutMs: 1 });
  } catch (error) {
    timeout = error;
  }
  assert.strictEqual(timeout && timeout.code, "AUDIO_TIMEOUT");
  assert.strictEqual(lento.buffer, null);
  await new Promise((r) => setTimeout(r, 600));
  colaVacia();
  const trasTimeout = await convertirAudioInbox({ buffer: wavSilencio() });
  assert.strictEqual(trasTimeout.mimetype, "audio/mpeg");
  assert.ok(trasTimeout.buffer.length > 0);
  colaVacia();
  assert.deepStrictEqual(temps(), antes);
  assert.strictEqual(procesosFfmpeg(), ffAntes);
  ok("un timeout libera el turno y no deja proceso ni temporales");
}

async function main() {
  if (typeof global.gc !== "function") {
    console.error("Falta --expose-gc. Ejecutar: node --expose-gc tests/mediaRamLimits.test.js");
    process.exit(1);
  }
  await testConstantes();
  await testSubidaPermitidaYExcesiva();
  await testLimitesExactosPorTipo();
  await testDescargas();
  await testComprobanteNoRedescarga();
  await testAudio();
  await testColaFfmpeg();
  console.log(`\n${passed} pruebas ok`);
}

main().catch((error) => {
  console.error("❌", error);
  process.exit(1);
});
