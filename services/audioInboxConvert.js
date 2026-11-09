const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  LIMITE_INBOX_BYTES,
  LIMITE_AUDIO_SALIDA_BYTES,
} = require("./mediaRamLimits");

const TEMP_DIR = path.join(os.tmpdir(), "macbot-temp");
fs.mkdirSync(TEMP_DIR, { recursive: true });

const TIMEOUT_FFMPEG_MS = 120000;

function resolveFfmpegExecutable() {
  const candidates = [
    process.env.FFMPEG_PATH,
    "/usr/bin/ffmpeg",
    require("ffmpeg-static"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {
      // ruta inválida
    }
  }
  return "ffmpeg";
}

ffmpeg.setFfmpegPath(resolveFfmpegExecutable());

/**
 * Una conversión activa y dos en espera.
 * /inbox/responder y /api/inbox/responder comparten este estado.
 */
const MAX_CONVERSIONES_FFMPEG = 1;
const MAX_ESPERA_FFMPEG = 2;
let conversionesActivas = 0;
const colaConversiones = [];

function estadoColaAudio() {
  return {
    activas: conversionesActivas,
    esperando: colaConversiones.length,
  };
}

function adquirirConversion() {
  if (conversionesActivas < MAX_CONVERSIONES_FFMPEG) {
    conversionesActivas += 1;
    return Promise.resolve();
  }
  if (colaConversiones.length >= MAX_ESPERA_FFMPEG) {
    const err = new Error(
      "Hay demasiadas conversiones de audio en curso. Inténtalo de nuevo en unos segundos."
    );
    err.code = "AUDIO_COLA_LLENA";
    return Promise.reject(err);
  }
  return new Promise((resolve) => {
    colaConversiones.push(resolve);
  });
}

function liberarConversion() {
  const siguiente = colaConversiones.shift();
  if (siguiente) {
    siguiente();
    return;
  }
  conversionesActivas -= 1;
  if (conversionesActivas < 0) conversionesActivas = 0;
}

function borrarSiExiste(archivo) {
  if (!archivo) return;
  try {
    if (fs.existsSync(archivo)) fs.unlinkSync(archivo);
  } catch (_) {
    // el siguiente intento de limpieza vuelve a intentarlo
  }
}

async function borrarTemporal(archivo) {
  if (!archivo) return;
  for (let intento = 0; intento < 8; intento += 1) {
    try {
      if (!fs.existsSync(archivo)) return;
      fs.unlinkSync(archivo);
      return;
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
}

function esperarSalida(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode != null || proc.signalCode != null) {
      resolve();
      return;
    }
    let listo = false;
    const fin = () => {
      if (listo) return;
      listo = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(fin, 3000);
    proc.once("exit", fin);
    proc.once("close", fin);
  });
}

/**
 * Misma conversión de la bandeja (mp3 44.1 kHz, 96 kbps).
 * El buffer de entrada se suelta al escribir el temporal, al rechazar la cola
 * y al fallar o terminar. La cuarta solicitud no entra a la cola.
 * La salida no se lee si supera el tope.
 * Los temporales se borran después de que ffmpeg terminó, también si hay timeout.
 */
async function convertirAudioInbox(file, opciones = {}) {
  let buffer = file?.buffer;
  const soltarEntrada = () => {
    buffer = null;
    if (file) file.buffer = null;
  };

  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Audio vacío");
  }

  const maxEntrada = opciones.maxInputBytes || LIMITE_INBOX_BYTES;
  if (buffer.length > maxEntrada) {
    soltarEntrada();
    const err = new Error("El audio debe ser menor a 15MB");
    err.code = "AUDIO_DEMASIADO_GRANDE";
    throw err;
  }

  let adquirido = false;
  let tempInput = null;
  let tempOutput = null;
  let comando = null;
  let timer = null;
  let terminadoOk = false;
  let abortado = false;
  let errorCorte = null;

  const matar = () => {
    const proc = comando && comando.ffmpegProc;
    if (!proc) return null;
    try {
      comando.kill("SIGKILL");
    } catch (_) {
      // ya terminó
    }
    return proc;
  };

  try {
    await adquirirConversion();
    adquirido = true;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    tempInput = path.join(TEMP_DIR, `${id}-input.webm`);
    tempOutput = path.join(TEMP_DIR, `${id}-output.mp3`);

    fs.writeFileSync(tempInput, buffer);
    soltarEntrada();

    await new Promise((resolve, reject) => {
      let settled = false;
      let avisoSinProceso = null;
      const settle = (err) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        timer = null;
        if (avisoSinProceso) clearTimeout(avisoSinProceso);
        avisoSinProceso = null;
        if (err) reject(err);
        else resolve();
      };

      const cortarCuandoExista = () => {
        const proc = comando && comando.ffmpegProc;
        if (!proc || proc.exitCode != null || proc.signalCode != null) return false;
        proc.once("exit", () => settle(errorCorte));
        proc.once("close", () => settle(errorCorte));
        try {
          comando.kill("SIGKILL");
        } catch (_) {
          settle(errorCorte);
        }
        return true;
      };

      timer = setTimeout(() => {
        abortado = true;
        errorCorte = new Error("Tiempo de conversión de audio agotado");
        errorCorte.code = "AUDIO_TIMEOUT";
        if (cortarCuandoExista()) return;
        if (comando && comando.ffmpegProc) {
          settle(errorCorte);
          return;
        }
        avisoSinProceso = setTimeout(() => settle(errorCorte), 3000);
      }, opciones.timeoutMs || TIMEOUT_FFMPEG_MS);

      comando = ffmpeg(tempInput)
        .outputOptions(["-vn", "-ar 44100", "-ac 2", "-b:a 96k"])
        .on("start", () => {
          if (abortado) cortarCuandoExista();
        })
        .save(tempOutput)
        .on("end", () => {
          if (abortado) {
            settle(errorCorte);
            return;
          }
          terminadoOk = true;
          settle(null);
        })
        .on("error", (err) => {
          settle(errorCorte || err);
        });
    });

    const stat = fs.statSync(tempOutput);
    const maxSalida = opciones.maxOutputBytes || LIMITE_AUDIO_SALIDA_BYTES;
    if (stat.size > maxSalida) {
      const err = new Error("El audio debe ser menor a 15MB");
      err.code = "AUDIO_DEMASIADO_GRANDE";
      throw err;
    }

    const audioConvertido = fs.readFileSync(tempOutput);
    return {
      buffer: audioConvertido,
      mimetype: "audio/mpeg",
      originalname: "audio.mp3",
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (adquirido && !terminadoOk) {
      const proc = matar();
      if (proc) await esperarSalida(proc);
    }
    await borrarTemporal(tempInput);
    await borrarTemporal(tempOutput);
    soltarEntrada();
    if (adquirido) liberarConversion();
  }
}

module.exports = {
  TEMP_DIR,
  TIMEOUT_FFMPEG_MS,
  MAX_CONVERSIONES_FFMPEG,
  MAX_ESPERA_FFMPEG,
  estadoColaAudio,
  convertirAudioInbox,
  borrarSiExiste,
};
