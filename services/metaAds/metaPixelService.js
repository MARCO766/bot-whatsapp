/**
 * Meta Pixel — validación de lectura vía Graph API (sin envío de eventos).
 */
const axios = require("axios");

const GRAPH_VERSION = "v19.0";

function log(msg, extra) {
  if (extra !== undefined) console.log(`[metaPixel] ${msg}`, extra);
  else console.log(`[metaPixel] ${msg}`);
}

function formatCreationTime(creationTime) {
  if (creationTime == null || creationTime === "") return null;
  const ts = Number(creationTime);
  if (!Number.isFinite(ts)) return null;
  const ms = ts > 1e12 ? ts : ts * 1000;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

/**
 * @param {string} pixelId
 * @param {string} accessToken
 */
async function validarPixelMeta(pixelId, accessToken) {
  const pid = String(pixelId || "").trim();
  const token = String(accessToken || "").trim();

  if (!pid || !token) {
    return {
      ok: false,
      existe: false,
      mensaje: "Pixel no encontrado o sin permisos",
    };
  }

  try {
    const res = await axios.get(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pid)}`,
      {
        params: { fields: "id,name,creation_time" },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 12000,
      }
    );
    const d = res.data || {};
    return {
      ok: true,
      pixel_id: d.id || pid,
      nombre: d.name || "",
      creado_en: formatCreationTime(d.creation_time),
      existe: true,
    };
  } catch (error) {
    log("validarPixelMeta error:", error.response?.status || error.message);
    return {
      ok: false,
      existe: false,
      mensaje: "Pixel no encontrado o sin permisos",
    };
  }
}

module.exports = {
  validarPixelMeta,
};
