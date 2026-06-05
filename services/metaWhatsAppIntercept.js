/**
 * Interceptor global: log [WA_POST_META_ANY] antes de cualquier POST a Meta /messages.
 * Cargar una sola vez al arranque (server.js, primera línea tras dotenv).
 */
const axios = require("axios");

let instalado = false;

function esUrlMetaMessages(url) {
  const u = typeof url === "string" ? url : url?.href || "";
  return u.includes("graph.facebook.com") && u.includes("/messages");
}

function extraerPhoneId(url) {
  const u = String(url || "");
  const m = u.match(/graph\.facebook\.com\/v[\d.]+\/([^/]+)\/messages/);
  return m ? m[1] : null;
}

function inferirOrigen(stack) {
  const s = String(stack || "");
  if (s.includes("executeSeguimiento")) return "seguimiento_worker";
  if (s.includes("seguimientoGuards")) return "seguimiento_guards";
  if (s.includes("flowService")) return "flowService";
  if (s.includes("whatsappService")) return "whatsappService";
  if (s.includes("conexionesWhatsappService")) return "conexionesWhatsappService";
  if (s.includes("routes\\flows") || s.includes("routes/flows")) return "routes_flows_legacy";
  if (s.includes("rm24hContenidos") || s.includes("remarketing24h")) return "remarketing24h";
  if (s.includes("lectorPagoService")) return "lector_pago";
  if (s.includes("openaiAgentService")) return "openai_agent";
  if (s.includes("iaProService")) return "ia_pro";
  if (s.includes("aiService")) return "ia";
  return "desconocido";
}

function logWaPostMetaAny(url, data) {
  const stack = new Error().stack || "";
  const to =
    data?.to != null
      ? String(data.to)
      : data?.recipient != null
        ? String(data.recipient)
        : null;

  console.log("[WA_POST_META_ANY]", {
    origen: inferirOrigen(stack),
    phone_id: extraerPhoneId(url),
    url: String(url),
    to,
    messaging_product: data?.messaging_product ?? null,
    type: data?.type ?? (data?.text ? "text" : null),
    pid: process.pid,
    stack_trace: stack.split("\n").slice(1, 14).join("\n"),
  });
}

function instalarInterceptMetaWhatsApp() {
  if (instalado || global.__macbotMetaWaInterceptInstalado) return;
  instalado = true;
  global.__macbotMetaWaInterceptInstalado = true;

  const originalPost = axios.post.bind(axios);
  const originalRequest = axios.request.bind(axios);

  axios.post = async function metaInterceptPost(url, data, config) {
    if (esUrlMetaMessages(url)) {
      logWaPostMetaAny(url, data);
    }
    return originalPost(url, data, config);
  };

  axios.request = async function metaInterceptRequest(config) {
    const url = config?.url || "";
    const method = String(config?.method || "get").toLowerCase();
    if (method === "post" && esUrlMetaMessages(url)) {
      let body = config.data;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          body = null;
        }
      }
      logWaPostMetaAny(url, body);
    }
    return originalRequest(config);
  };

  console.log("[WA_POST_META_ANY] interceptor global instalado");
}

instalarInterceptMetaWhatsApp();

module.exports = { instalarInterceptMetaWhatsApp };
