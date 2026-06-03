/**
 * Meta Pixel — validación lectura Graph API + prueba aceptación CAPI (solo diagnóstico).
 */
const axios = require("axios");
const crypto = require("crypto");

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
 * Consulta información del pixel vía Graph API GET (puede fallar por permisos aunque CAPI funcione).
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
      consultable: false,
      mensaje: "Sin token para consultar información del pixel",
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
      consultable: true,
    };
  } catch (error) {
    log("validarPixelMeta error:", error.response?.status || error.message);
    return {
      ok: false,
      existe: false,
      consultable: false,
      mensaje: "No se pudo consultar información del pixel",
    };
  }
}

/**
 * Envía un evento mínimo CAPI para verificar que Meta acepta eventos en el pixel.
 * @param {string} pixelId
 * @param {string} capiToken
 */
async function probarPixelCapi(pixelId, capiToken) {
  const pid = String(pixelId || "").trim();
  const token = String(capiToken || "").trim();

  if (!pid || !token) {
    return { ok: false, events_received: 0 };
  }

  const telefonoHash = crypto
    .createHash("sha256")
    .update("59170000000")
    .digest("hex");

  try {
    const res = await axios.post(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pid)}/events?access_token=${encodeURIComponent(token)}`,
      {
        data: [
          {
            event_name: "Lead",
            event_time: Math.floor(Date.now() / 1000),
            action_source: "system_generated",
            user_data: { ph: [telefonoHash] },
            custom_data: { currency: "BOB", value: 0 },
          },
        ],
      },
      { timeout: 12000 }
    );

    const events_received = Number(res.data?.events_received) || 0;
    return {
      ok: events_received > 0,
      events_received,
      fbtrace_id: res.data?.fbtrace_id || null,
    };
  } catch (error) {
    log("probarPixelCapi error:", error.response?.status || error.message);
    return { ok: false, events_received: 0 };
  }
}

module.exports = {
  validarPixelMeta,
  probarPixelCapi,
};
