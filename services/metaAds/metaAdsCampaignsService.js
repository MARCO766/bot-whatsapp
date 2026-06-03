/**
 * Meta Ads — listado de campañas (solo lectura vía Graph API).
 */
const axios = require("axios");
const {
  fetchMetaAdsConfigRow,
  normalizeConexionId,
  normalizeAdAccountId,
  maskAdAccount,
} = require("./metaAdsConfigService");

const GRAPH_VERSION = "v19.0";

function logSafe(msg, extra) {
  if (extra !== undefined) console.log(`[META_ADS] ${msg}`, extra);
  else console.log(`[META_ADS] ${msg}`);
}

function parseMetaApiError(error) {
  const metaErr = error.response?.data?.error;
  if (metaErr) {
    const code = metaErr.code;
    const msg = String(metaErr.message || "").toLowerCase();
    if (
      code === 190 ||
      code === 102 ||
      metaErr.type === "OAuthException" ||
      msg.includes("invalid") ||
      msg.includes("expired") ||
      msg.includes("permission")
    ) {
      return "Token Ads inválido o sin permisos ads_read/read_insights";
    }
    return metaErr.message || "Error al consultar campañas Meta Ads";
  }
  return error.message || "Error al consultar campañas Meta Ads";
}

async function resolveAdsConfig(usuarioId, conexionWhatsappId) {
  const configRow = await fetchMetaAdsConfigRow(usuarioId, conexionWhatsappId);
  const connId = normalizeConexionId(conexionWhatsappId);
  const adAccountId = normalizeAdAccountId(configRow?.ad_account_id);
  const token = configRow?.ads_access_token?.trim();

  if (!configRow || !adAccountId || !token) {
    return { ok: false, connId, adAccountId: null, token: null };
  }

  return { ok: true, connId, adAccountId, token };
}

function normalizeCampaignRow(row) {
  return {
    id: String(row?.id || "").trim(),
    name: String(row?.name || "").trim() || "(Sin nombre)",
    status: String(row?.status || "").trim() || "UNKNOWN",
    objective: String(row?.objective || "").trim() || null,
  };
}

async function fetchCampaignsFromGraph({ adAccountId, accessToken }) {
  const baseUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(adAccountId)}/campaigns`;
  const campaigns = [];
  let nextUrl = null;
  let page = 0;

  while (page < 50) {
    const res = await axios.get(nextUrl || baseUrl, {
      params: nextUrl
        ? undefined
        : {
            fields: "id,name,status,objective",
            limit: 100,
            access_token: accessToken,
          },
      timeout: 30000,
    });

    const rows = Array.isArray(res.data?.data) ? res.data.data : [];
    for (const row of rows) {
      const c = normalizeCampaignRow(row);
      if (c.id) campaigns.push(c);
    }

    const next = res.data?.paging?.next;
    if (!next) break;
    nextUrl = next;
    page += 1;
  }

  campaigns.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return campaigns;
}

async function getMetaAdsCampaigns({ usuarioId, conexionWhatsappId = null }) {
  if (!usuarioId) {
    const err = new Error("usuarioId requerido");
    err.status = 400;
    throw err;
  }

  const ads = await resolveAdsConfig(usuarioId, conexionWhatsappId);
  if (!ads.ok) {
    return {
      ok: false,
      campaigns: [],
      meta: { ad_account_id_masked: null },
      mensaje: "Ads no configurado",
    };
  }

  logSafe("campaigns_fetch", {
    usuarioId,
    ad_account_id_masked: maskAdAccount(ads.adAccountId),
  });

  try {
    const campaigns = await fetchCampaignsFromGraph({
      adAccountId: ads.adAccountId,
      accessToken: ads.token,
    });

    logSafe("campaigns_success", { usuarioId, count: campaigns.length });

    return {
      ok: true,
      campaigns,
      meta: { ad_account_id_masked: maskAdAccount(ads.adAccountId) },
      mensaje: campaigns.length ? null : "No hay campañas en esta cuenta publicitaria",
    };
  } catch (error) {
    const msg = parseMetaApiError(error);
    logSafe("campaigns_error", { usuarioId, error: msg });
    const err = new Error(msg);
    err.status = error.response?.status === 401 || error.response?.status === 403 ? 403 : 502;
    throw err;
  }
}

module.exports = {
  getMetaAdsCampaigns,
  normalizeCampaignRow,
};
