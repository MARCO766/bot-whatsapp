/**
 * Diagnóstico Meta Ads — solo lectura; no altera cache ni sync de producción.
 */
const axios = require("axios");
const {
  fetchMetaAdsConfigRow,
  normalizeConexionId,
  normalizeAdAccountId,
} = require("./metaAdsConfigService");

const GRAPH_VERSION = "v19.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const ADS_PERMISSION_HINTS = [
  "ads_read",
  "read_insights",
  "ads_management",
  "business_management",
];

function logDebug(msg, extra) {
  if (extra !== undefined) console.log(`[META_ADS_DEBUG] ${msg}`, extra);
  else console.log(`[META_ADS_DEBUG] ${msg}`);
}

function calcularDateRange7d() {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return {
    date_start: start.toISOString().slice(0, 10),
    date_stop: end.toISOString().slice(0, 10),
  };
}

function extractMetaError(error) {
  const http_status = error?.response?.status ?? null;
  const metaErr = error?.response?.data?.error;

  if (!metaErr) {
    return {
      http_status,
      error: null,
      message: error?.message || "Error de red o timeout",
    };
  }

  const full = {
    code: metaErr.code ?? null,
    type: metaErr.type ?? null,
    message: metaErr.message ?? null,
    error_subcode: metaErr.error_subcode ?? null,
    fbtrace_id: metaErr.fbtrace_id ?? null,
    error_user_title: metaErr.error_user_title ?? null,
    error_user_msg: metaErr.error_user_msg ?? null,
  };

  logDebug("meta_error", full);

  return { http_status, error: full };
}

async function probeGraphCall({ label, method = "GET", url, params, accessToken }) {
  const requestUrl = url.startsWith("http") ? url : `${GRAPH_BASE}/${url.replace(/^\//, "")}`;
  const started = Date.now();

  try {
    const res = await axios({
      method,
      url: requestUrl,
      params: { ...params, access_token: accessToken },
      timeout: 30000,
      validateStatus: () => true,
    });

    const elapsed_ms = Date.now() - started;
    const metaErr = res.data?.error;

    if (metaErr || res.status >= 400) {
      const synthetic =
        metaErr ||
        (res.status >= 400
          ? { message: `HTTP ${res.status}`, type: "HttpException", code: res.status }
          : null);
      const payload = synthetic
        ? {
            http_status: res.status,
            error: {
              code: synthetic.code ?? null,
              type: synthetic.type ?? null,
              message: synthetic.message ?? null,
              error_subcode: synthetic.error_subcode ?? null,
              fbtrace_id: synthetic.fbtrace_id ?? null,
            },
          }
        : extractMetaError({ response: { status: res.status, data: res.data } });

      logDebug(`${label}_fail`, payload);

      return {
        ok: false,
        label,
        request: { method, path: requestUrl.replace(GRAPH_BASE, ""), params: { ...params } },
        http_status: res.status,
        elapsed_ms,
        data: null,
        ...payload,
      };
    }

    logDebug(`${label}_ok`, { http_status: res.status, elapsed_ms });

    return {
      ok: true,
      label,
      request: { method, path: requestUrl.replace(GRAPH_BASE, ""), params: { ...params } },
      http_status: res.status,
      elapsed_ms,
      data: res.data,
      error: null,
    };
  } catch (error) {
    const elapsed_ms = Date.now() - started;
    const payload = extractMetaError(error);
    logDebug(`${label}_fail`, payload);
    return {
      ok: false,
      label,
      request: { method, path: requestUrl.replace(GRAPH_BASE, ""), params: { ...params } },
      elapsed_ms,
      data: null,
      ...payload,
    };
  }
}

async function fetchTokenPermissions(accessToken) {
  return probeGraphCall({
    label: "permissions",
    url: `${GRAPH_BASE}/me/permissions`,
    params: { limit: 100 },
    accessToken,
  });
}

function summarizePermissions(permResult) {
  if (!permResult?.ok || !Array.isArray(permResult.data?.data)) {
    return {
      ok: false,
      granted: [],
      declined: [],
      ads_related: [],
      raw_count: 0,
      error: permResult?.error || null,
      http_status: permResult?.http_status ?? null,
    };
  }

  const rows = permResult.data.data;
  const granted = rows.filter((r) => r.status === "granted").map((r) => r.permission);
  const declined = rows.filter((r) => r.status !== "granted").map((r) => r.permission);
  const ads_related = granted.filter((p) => ADS_PERMISSION_HINTS.includes(p));

  return {
    ok: true,
    granted,
    declined,
    ads_related,
    missing_ads_hints: ADS_PERMISSION_HINTS.filter((p) => !granted.includes(p)),
    raw_count: rows.length,
    error: null,
    http_status: permResult.http_status,
  };
}

function summarizeAccountCall(call) {
  if (!call?.ok) return null;
  const d = call.data || {};
  return { id: d.id ?? null, name: d.name ?? null, account_status: d.account_status ?? null };
}

function summarizeCampaignsCall(call) {
  if (!call?.ok) return null;
  const rows = Array.isArray(call.data?.data) ? call.data.data : [];
  return {
    count: rows.length,
    sample: rows.slice(0, 3).map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
    })),
  };
}

function summarizeInsightsCall(call) {
  if (!call?.ok) return null;
  const rows = Array.isArray(call.data?.data) ? call.data.data : [];
  return {
    row_count: rows.length,
    sample: rows.slice(0, 2),
  };
}

async function runMetaAdsDebug({ usuarioId, conexionWhatsappId = null }) {
  if (!usuarioId) {
    const err = new Error("usuarioId requerido");
    err.status = 400;
    throw err;
  }

  const connId = normalizeConexionId(conexionWhatsappId);
  const configRow = await fetchMetaAdsConfigRow(usuarioId, conexionWhatsappId);
  const adAccountId = normalizeAdAccountId(configRow?.ad_account_id);
  const token = configRow?.ads_access_token?.trim() || "";
  const token_presente = Boolean(token);

  const base = {
    ok: true,
    debug: true,
    usuario_id: usuarioId,
    conexion_whatsapp_id: connId,
    config_id: configRow?.id ?? null,
    ad_account_id: adAccountId,
    token_presente,
    ultimo_sync_ok: configRow?.ultimo_sync_ok ?? null,
    ultimo_error: configRow?.ultimo_error ?? null,
  };

  if (!adAccountId || !token) {
    return {
      ...base,
      ok: false,
      mensaje: !adAccountId
        ? "Falta ad_account_id en meta_ads_config"
        : "Falta ads_access_token en meta_ads_config",
      permisos: null,
      calls: null,
    };
  }

  const range = calcularDateRange7d();
  const timeRange = JSON.stringify({ since: range.date_start, until: range.date_stop });

  const [permRaw, accountCall, campaignsCall, insightsCall] = await Promise.all([
    fetchTokenPermissions(token),
    probeGraphCall({
      label: "account",
      url: `${GRAPH_BASE}/${encodeURIComponent(adAccountId)}`,
      params: { fields: "id,name" },
      accessToken: token,
    }),
    probeGraphCall({
      label: "campaigns",
      url: `${GRAPH_BASE}/${encodeURIComponent(adAccountId)}/campaigns`,
      params: { fields: "id,name,status,objective", limit: 5 },
      accessToken: token,
    }),
    probeGraphCall({
      label: "insights",
      url: `${GRAPH_BASE}/${encodeURIComponent(adAccountId)}/insights`,
      params: {
        fields: "spend,impressions,reach,clicks,account_currency",
        time_range: timeRange,
        level: "account",
      },
      accessToken: token,
    }),
  ]);

  const permisos = summarizePermissions(permRaw);
  const allOk =
    permisos.ok && accountCall.ok && campaignsCall.ok && insightsCall.ok;

  return {
    ...base,
    ok: allOk,
    mensaje: allOk
      ? "Todas las pruebas Graph API respondieron OK"
      : "Una o más pruebas fallaron — revisa calls y permisos",
    permisos,
    insights_periodo: range,
    calls: {
      account: {
        ...accountCall,
        summary: summarizeAccountCall(accountCall),
      },
      campaigns: {
        ...campaignsCall,
        summary: summarizeCampaignsCall(campaignsCall),
      },
      insights: {
        ...insightsCall,
        summary: summarizeInsightsCall(insightsCall),
      },
      permissions_raw: {
        ok: permRaw.ok,
        http_status: permRaw.http_status,
        error: permRaw.error,
        elapsed_ms: permRaw.elapsed_ms,
      },
    },
  };
}

module.exports = {
  runMetaAdsDebug,
  extractMetaError,
};
