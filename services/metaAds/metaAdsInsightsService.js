/**
 * Meta Ads Insights — cache Supabase + refresh manual vía Graph API.
 */
const axios = require("axios");
const { isSchemaMissingError, logSchemaFallback } = require("../supabaseSafe");
const {
  fetchMetaAdsConfigRow,
  normalizeConexionId,
  normalizeAdAccountId,
  maskAdAccount,
} = require("./metaAdsConfigService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const GRAPH_VERSION = "v19.0";

const STALE_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_MS = 2 * 60 * 1000;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function logSafe(msg, extra) {
  if (extra !== undefined) console.log(`[META_ADS] ${msg}`, extra);
  else console.log(`[META_ADS] ${msg}`);
}

function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function normalizePeriodo(periodo) {
  const p = String(periodo || "7d").toLowerCase().trim();
  if (p === "30" || p === "30d" || p === "30 días" || p === "30 dias") return "30d";
  if (p === "90" || p === "90d") return "90d";
  if (p === "hoy" || p === "today") return "7d";
  return "7d";
}

function calcularDateRange(periodo) {
  const p = normalizePeriodo(periodo);
  const days = p === "90d" ? 90 : p === "30d" ? 30 : 7;

  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));

  const date_start = start.toISOString().slice(0, 10);
  const date_stop = end.toISOString().slice(0, 10);

  const desdeIso = new Date(`${date_start}T00:00:00.000Z`).toISOString();
  const hastaIso = new Date(`${date_stop}T23:59:59.999Z`).toISOString();

  return { periodo: p, date_start, date_stop, desdeIso, hastaIso, days };
}

function mapMetaInsightsToCache(metaRow, ctx) {
  const spend = round2(toNum(metaRow?.spend));
  const impressions = toInt(metaRow?.impressions);
  const reach = toInt(metaRow?.reach);
  const clicks = toInt(metaRow?.clicks);

  return {
    usuario_id: ctx.usuarioId,
    conexion_whatsapp_id: ctx.connId,
    ad_account_id: ctx.adAccountId,
    level: "account",
    campaign_id: null,
    periodo: ctx.periodo,
    date_start: ctx.date_start,
    date_stop: ctx.date_stop,
    spend,
    impressions,
    reach,
    clicks,
    ctr: round2(toNum(metaRow?.ctr)),
    cpc: round2(toNum(metaRow?.cpc)),
    cpm: round2(toNum(metaRow?.cpm)),
    frequency: round2(toNum(metaRow?.frequency)),
    raw_payload: metaRow || null,
    synced_at: new Date().toISOString(),
    source: ctx.source || "manual",
    updated_at: new Date().toISOString(),
  };
}

function calcularRoasHibrido({ ingresosCrm, spend }) {
  const ingresos = round2(ingresosCrm);
  const gasto = round2(spend);
  if (gasto <= 0) {
    return {
      roas_hibrido: null,
      mensaje: "Sin gasto publicitario en el periodo",
    };
  }
  return {
    roas_hibrido: round2(ingresos / gasto),
    mensaje: null,
  };
}

function isStale(syncedAt) {
  if (!syncedAt) return true;
  const t = new Date(syncedAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > STALE_MS;
}

function isRecentlySynced(syncedAt) {
  if (!syncedAt) return false;
  const t = new Date(syncedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < RATE_LIMIT_MS;
}

function buildConexionFilter(conexionWhatsappId) {
  const connId = normalizeConexionId(conexionWhatsappId);
  if (!connId) return "";
  return `&conexion_whatsapp_id=eq.${encodeURIComponent(connId)}`;
}

async function sumIngresosCrm(usuarioId, desdeIso, hastaIso, conexionWhatsappId) {
  const uid = encodeURIComponent(usuarioId);
  const desde = encodeURIComponent(desdeIso);
  const hasta = encodeURIComponent(hastaIso);
  let url =
    `${SUPABASE_URL}/rest/v1/crm_conversiones?usuario_id=eq.${uid}${buildConexionFilter(conexionWhatsappId)}` +
    `&creado_en=gte.${desde}&creado_en=lte.${hasta}&select=valor`;

  try {
    const res = await axios.get(url, { headers: headers() });
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.reduce((acc, row) => {
      const v = parseFloat(row.valor);
      return acc + (Number.isFinite(v) && v >= 0 ? v : 0);
    }, 0);
  } catch (error) {
    if (isSchemaMissingError(error)) {
      logSchemaFallback("crm_conversiones", error);
      return 0;
    }
    logSafe("sumIngresosCrm error", error.response?.status || error.message);
    return 0;
  }
}

async function fetchCacheRow(usuarioId, connId, adAccountId, periodo, date_start, date_stop) {
  let url =
    `${SUPABASE_URL}/rest/v1/meta_ads_insights_cache?usuario_id=eq.${encodeURIComponent(usuarioId)}` +
    `&ad_account_id=eq.${encodeURIComponent(adAccountId)}` +
    `&periodo=eq.${encodeURIComponent(periodo)}` +
    `&level=eq.account` +
    `&campaign_id=is.null` +
    `&date_start=eq.${date_start}` +
    `&date_stop=eq.${date_stop}` +
    `&select=*&limit=1`;

  if (connId) {
    url += `&conexion_whatsapp_id=eq.${encodeURIComponent(connId)}`;
  } else {
    url += "&conexion_whatsapp_id=is.null";
  }

  try {
    const res = await axios.get(url, { headers: headers() });
    return res.data?.[0] || null;
  } catch (error) {
    if (isSchemaMissingError(error)) {
      logSchemaFallback("meta_ads_insights_cache", error);
      return null;
    }
    throw error;
  }
}

async function upsertCacheRow(payload) {
  const existing = await fetchCacheRow(
    payload.usuario_id,
    payload.conexion_whatsapp_id,
    payload.ad_account_id,
    payload.periodo,
    payload.date_start,
    payload.date_stop
  );

  try {
    if (existing?.id) {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/meta_ads_insights_cache?id=eq.${encodeURIComponent(existing.id)}`,
        payload,
        {
          headers: headers({
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          }),
        }
      );
      return { ...existing, ...payload };
    }

    payload.created_at = payload.created_at || new Date().toISOString();
    const res = await axios.post(`${SUPABASE_URL}/rest/v1/meta_ads_insights_cache`, payload, {
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
    });
    return res.data?.[0] || payload;
  } catch (error) {
    if (isSchemaMissingError(error)) {
      const err = new Error(
        "Tabla meta_ads_insights_cache no existe. Ejecuta supabase/meta_ads_insights_cache.sql."
      );
      err.status = 503;
      throw err;
    }
    throw error;
  }
}

async function updateConfigSyncOk(configId, { accountCurrency, ultimoError } = {}) {
  if (!configId) return;
  const patch = {
    updated_at: new Date().toISOString(),
    ultimo_sync_ok: ultimoError ? null : new Date().toISOString(),
    ultimo_error: ultimoError || null,
  };
  if (accountCurrency) patch.account_currency = accountCurrency;
  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/meta_ads_config?id=eq.${encodeURIComponent(configId)}`,
      patch,
      { headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }) }
    );
  } catch (error) {
    logSafe("updateConfigSyncOk error", error.response?.status || error.message);
  }
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
    return metaErr.message || "Error al consultar Meta Ads";
  }
  return error.message || "Error al consultar Meta Ads";
}

async function fetchMetaInsightsFromGraph({ adAccountId, accessToken, date_start, date_stop }) {
  const timeRange = JSON.stringify({ since: date_start, until: date_stop });
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(adAccountId)}/insights`;

  const res = await axios.get(url, {
    params: {
      fields: "spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,account_currency",
      time_range: timeRange,
      level: "account",
      access_token: accessToken,
    },
    timeout: 30000,
  });

  const rows = Array.isArray(res.data?.data) ? res.data.data : [];
  if (!rows.length) {
    return { aggregated: null, account_currency: null };
  }

  const aggregated = rows.reduce(
    (acc, row) => ({
      spend: toNum(acc.spend) + toNum(row.spend),
      impressions: toInt(acc.impressions) + toInt(row.impressions),
      reach: toInt(acc.reach) + toInt(row.reach),
      clicks: toInt(acc.clicks) + toInt(row.clicks),
      ctr: 0,
      cpc: 0,
      cpm: 0,
      frequency: 0,
      account_currency: row.account_currency || acc.account_currency,
    }),
    { spend: 0, impressions: 0, reach: 0, clicks: 0, account_currency: null }
  );

  if (aggregated.impressions > 0) {
    aggregated.ctr = round2((aggregated.clicks / aggregated.impressions) * 100);
    aggregated.cpm = round2((aggregated.spend / aggregated.impressions) * 1000);
  }
  if (aggregated.clicks > 0) {
    aggregated.cpc = round2(aggregated.spend / aggregated.clicks);
  }
  if (aggregated.reach > 0 && aggregated.impressions > 0) {
    aggregated.frequency = round2(aggregated.impressions / aggregated.reach);
  } else if (rows[0]?.frequency != null) {
    aggregated.frequency = round2(toNum(rows[0].frequency));
  }

  aggregated.spend = round2(aggregated.spend);
  return { aggregated, account_currency: aggregated.account_currency };
}

function buildMetricsFromCache(cacheRow, ingresosCrm, accountCurrency) {
  const spend = round2(cacheRow?.spend);
  const roas = calcularRoasHibrido({ ingresosCrm, spend });

  let mensaje = null;
  if (spend <= 0) {
    mensaje = "No hay gasto publicitario en este periodo";
  } else if (roas.mensaje) {
    mensaje = roas.mensaje;
  }

  return {
    spend,
    impressions: toInt(cacheRow?.impressions),
    reach: toInt(cacheRow?.reach),
    clicks: toInt(cacheRow?.clicks),
    ctr: round2(cacheRow?.ctr),
    cpc: round2(cacheRow?.cpc),
    cpm: round2(cacheRow?.cpm),
    frequency: round2(cacheRow?.frequency),
    roas_hibrido: roas.roas_hibrido,
    ingresos_crm: round2(ingresosCrm),
    mensaje_roas: roas.mensaje,
    mensaje,
  };
}

async function buildInsightsResponse({
  usuarioId,
  conexionWhatsappId,
  periodo,
  cacheRow,
  configRow,
  cached,
  mensajeExtra,
}) {
  const connId = normalizeConexionId(conexionWhatsappId);
  const range = calcularDateRange(periodo);
  const adAccountId = normalizeAdAccountId(configRow?.ad_account_id);
  const accountCurrency = configRow?.account_currency || null;

  const ingresosCrm = await sumIngresosCrm(
    usuarioId,
    range.desdeIso,
    range.hastaIso,
    connId
  );

  const synced_at = cacheRow?.synced_at || null;
  const stale = isStale(synced_at);

  const metrics = cacheRow
    ? buildMetricsFromCache(cacheRow, ingresosCrm, accountCurrency)
    : {
        spend: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        frequency: 0,
        roas_hibrido: null,
        ingresos_crm: round2(ingresosCrm),
        mensaje_roas: "Sin gasto publicitario en el periodo",
        mensaje: "Conectado — pendiente de sincronización",
      };

  let mensaje = mensajeExtra || metrics.mensaje || null;
  if (cached && stale && !mensaje) {
    mensaje = "Datos antiguos — sincroniza de nuevo";
  }

  return {
    ok: true,
    periodo: range.periodo,
    date_start: range.date_start,
    date_stop: range.date_stop,
    cached: Boolean(cached && cacheRow),
    stale,
    synced_at,
    metrics,
    meta: {
      ad_account_id_masked: maskAdAccount(adAccountId),
      account_currency: accountCurrency,
    },
    mensaje,
  };
}

async function resolveAdsConfig(usuarioId, conexionWhatsappId) {
  const configRow = await fetchMetaAdsConfigRow(usuarioId, conexionWhatsappId);
  const connId = normalizeConexionId(conexionWhatsappId);
  const adAccountId = normalizeAdAccountId(configRow?.ad_account_id);
  const token = configRow?.ads_access_token?.trim();

  if (!configRow || !adAccountId || !token) {
    return { ok: false, configRow: null, connId, adAccountId: null, token: null };
  }

  return { ok: true, configRow, connId, adAccountId, token };
}

async function getCachedInsights({ usuarioId, conexionWhatsappId = null, periodo = "7d" }) {
  if (!usuarioId) {
    const err = new Error("usuarioId requerido");
    err.status = 400;
    throw err;
  }

  const ads = await resolveAdsConfig(usuarioId, conexionWhatsappId);
  if (!ads.ok) {
    return {
      ok: false,
      periodo: normalizePeriodo(periodo),
      cached: false,
      stale: true,
      synced_at: null,
      metrics: null,
      meta: { ad_account_id_masked: null, account_currency: null },
      mensaje: "Ads no configurado",
    };
  }

  const range = calcularDateRange(periodo);
  const cacheRow = await fetchCacheRow(
    usuarioId,
    ads.connId,
    ads.adAccountId,
    range.periodo,
    range.date_start,
    range.date_stop
  );

  return buildInsightsResponse({
    usuarioId,
    conexionWhatsappId: ads.connId,
    periodo: range.periodo,
    cacheRow,
    configRow: ads.configRow,
    cached: Boolean(cacheRow),
    mensajeExtra: cacheRow ? null : "Conectado — pendiente de sincronización",
  });
}

async function refreshInsights({ usuarioId, conexionWhatsappId = null, periodo = "7d" }) {
  if (!usuarioId) {
    const err = new Error("usuarioId requerido");
    err.status = 400;
    throw err;
  }

  const ads = await resolveAdsConfig(usuarioId, conexionWhatsappId);
  if (!ads.ok) {
    const err = new Error("Ads no configurado");
    err.status = 400;
    throw err;
  }

  const range = calcularDateRange(periodo);

  const existingCache = await fetchCacheRow(
    usuarioId,
    ads.connId,
    ads.adAccountId,
    range.periodo,
    range.date_start,
    range.date_stop
  );

  if (isRecentlySynced(existingCache?.synced_at)) {
    logSafe("refresh_skipped_recent", { usuarioId, periodo: range.periodo });
    const response = await buildInsightsResponse({
      usuarioId,
      conexionWhatsappId: ads.connId,
      periodo: range.periodo,
      cacheRow: existingCache,
      configRow: ads.configRow,
      cached: true,
      mensajeExtra: "Sincronizado recientemente",
    });
    return response;
  }

  logSafe("refresh_start", {
    usuarioId,
    periodo: range.periodo,
    ad_account_id_masked: maskAdAccount(ads.adAccountId),
  });

  try {
    const { aggregated, account_currency } = await fetchMetaInsightsFromGraph({
      adAccountId: ads.adAccountId,
      accessToken: ads.token,
      date_start: range.date_start,
      date_stop: range.date_stop,
    });

    const cachePayload = mapMetaInsightsToCache(aggregated || {}, {
      usuarioId,
      connId: ads.connId,
      adAccountId: ads.adAccountId,
      periodo: range.periodo,
      date_start: range.date_start,
      date_stop: range.date_stop,
      source: "manual",
    });

    const saved = await upsertCacheRow(cachePayload);
    await updateConfigSyncOk(ads.configRow.id, {
      accountCurrency: account_currency || ads.configRow.account_currency,
      ultimoError: null,
    });

    logSafe("refresh_success", {
      usuarioId,
      periodo: range.periodo,
      spend: saved.spend,
    });

    const response = await buildInsightsResponse({
      usuarioId,
      conexionWhatsappId: ads.connId,
      periodo: range.periodo,
      cacheRow: saved,
      configRow: {
        ...ads.configRow,
        account_currency: account_currency || ads.configRow.account_currency,
      },
      cached: true,
      mensajeExtra: null,
    });

    if (round2(saved.spend) <= 0) {
      response.mensaje = "No hay gasto publicitario en este periodo";
    }

    return response;
  } catch (error) {
    const msg = parseMetaApiError(error);
    await updateConfigSyncOk(ads.configRow.id, { ultimoError: msg });
    logSafe("refresh_error", { usuarioId, periodo: range.periodo, error: msg });

    const err = new Error(msg);
    err.status = error.response?.status === 401 || error.response?.status === 403 ? 403 : 502;
    throw err;
  }
}

module.exports = {
  normalizePeriodo,
  calcularDateRange,
  mapMetaInsightsToCache,
  calcularRoasHibrido,
  getCachedInsights,
  refreshInsights,
  isStale,
};
