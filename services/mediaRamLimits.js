/**
 * Topes de media ya usados por cada flujo.
 * En las subidas, el tope del tipo se aplica antes de conservar el archivo en RAM.
 * El webhook mantiene su documento en 8 MB.
 * La bandeja mantiene audio, documento y video en 15 MB, y la imagen en 2 MB.
 */
const MB = 1024 * 1024;

const LIMITE_IMAGEN_BYTES = 2 * MB;
const LIMITE_AUDIO_BYTES = 5 * MB;
const LIMITE_VIDEO_BYTES = 15 * MB;
const LIMITE_DOCUMENTO_BYTES = 5 * MB;
const LIMITE_DOCUMENTO_WEBHOOK_BYTES = 8 * MB;
/** Techo de POST /inbox/responder: el video de ese handler ya rechaza por encima de 15 MB. */
const LIMITE_INBOX_BYTES = LIMITE_VIDEO_BYTES;
/** Tope de lectura del mp3 ya convertido. WhatsApp acepta audio hasta 16 MB. */
const LIMITE_AUDIO_SALIDA_BYTES = 16 * MB;
const TIMEOUT_DESCARGA_MEDIA_MS = 60000;

module.exports = {
  MB,
  LIMITE_IMAGEN_BYTES,
  LIMITE_AUDIO_BYTES,
  LIMITE_VIDEO_BYTES,
  LIMITE_DOCUMENTO_BYTES,
  LIMITE_DOCUMENTO_WEBHOOK_BYTES,
  LIMITE_INBOX_BYTES,
  LIMITE_AUDIO_SALIDA_BYTES,
  TIMEOUT_DESCARGA_MEDIA_MS,
};
