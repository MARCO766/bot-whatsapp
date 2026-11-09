const axios = require("axios");
const { TIMEOUT_DESCARGA_MEDIA_MS } = require("./mediaRamLimits");

function esErrorLimiteTamano(error) {
  if (!error) return false;
  if (error.code === "LIMITE_TAMANO") return true;
  const msg = String(error.message || "");
  return (
    error.code === "ERR_BAD_RESPONSE" &&
    /maxContentLength|maxBodyLength/i.test(msg)
  );
}

function tamanoDeclaradoExcede(fileSize, maxBytes) {
  const n = Number(fileSize);
  return Number.isFinite(n) && n > maxBytes;
}

/**
 * Baja un binario y aborta en cuanto supera maxBytes.
 * No resuelve con el archivo completo: axios destruye el stream y rechaza.
 */
async function descargarBinarioLimitado(url, opciones = {}) {
  const maxBytes = opciones.maxBytes;
  if (!url) throw new Error("URL de descarga vacía");
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error("maxBytes inválido");
  }

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: opciones.timeout || TIMEOUT_DESCARGA_MEDIA_MS,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    headers: opciones.headers || {},
  });

  const data = response.data;
  const byteLength = data?.byteLength ?? data?.length ?? 0;
  if (byteLength > maxBytes) {
    const err = new Error("archivo demasiado grande");
    err.code = "LIMITE_TAMANO";
    throw err;
  }
  return data;
}

module.exports = {
  esErrorLimiteTamano,
  tamanoDeclaradoExcede,
  descargarBinarioLimitado,
};
