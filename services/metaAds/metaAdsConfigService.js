/**
 * Meta Ads — estado de integración y config (sin Graph API / insights todavía).
 */
const axios = require("axios");
const { getConexionActiva } = require("../conexionesWhatsappService");
const { isSchemaMissingError, logSchemaFallback } = require("../supabaseSafe");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

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

function maskToken(token) {
  if (!token || typeof token !== "string") return null;
  const t = token.trim();
  if (t.length <= 8) return "********";
  return `${t.slice(0, 4)}${"*".repeat(8)}${t.slice(-4)}`;
}

function maskPixelId(pixelId) {
  return maskToken(pixelId);
}

function maskAdAccount(adAccountId) {
  if (!adAccountId || typeof adAccountId !== "string") return null;
  const raw = adAccountId.trim();
  if (!raw) return null;
  if (raw.length <= 10) return `${raw.slice(0, 3)}****`;
  return `${raw.slice(0, 6)}****${raw.slice(-4)}`;
}

function normalizeConexionId(conexionWhatsappId) {
  const raw = conexionWhatsappId == null ? "" : String(conexionWhatsappId).trim();
  if (!raw || raw === "__todas__") return null;
  return raw;
}

function normalizeAdAccountId(raw) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (/^act_/i.test(v)) return v;
  const digits = v.replace(/\D/g, "");
  return digits ? `act_${digits}` : v;
}

async function fetchConexionWhatsapp(usuarioId, conexionWhatsappId) {
  const connId = normalizeConexionId(conexionWhatsappId);

  if (connId) {
    try {
      const res = await axios.get(
        `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(connId)}&usuario_id=eq.${encodeURIComponent(usuarioId)}&select=id,pixel_id,capi_token,numero,nombre&limit=1`,
        { headers: headers() }
      );
      return res.data?.[0] || null;
    } catch (error) {
      logSafe("fetchConexionWhatsapp error", error.response?.status || error.message);
      return null;
    }
  }

  return getConexionActiva(usuarioId);
}

async function fetchMetaAdsConfigExact(usuarioId, conexionWhatsappId) {
  const connId = normalizeConexionId(conexionWhatsappId);

  let url = `${SUPABASE_URL}/rest/v1/meta_ads_config?usuario_id=eq.${encodeURIComponent(usuarioId)}&select=*&limit=1`;
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
      logSchemaFallback("meta_ads_config", error);
      return null;
    }
    logSafe("fetchMetaAdsConfigExact error", error.response?.status || error.message);
    return null;
  }
}

async function fetchMetaAdsConfigRow(usuarioId, conexionWhatsappId) {
  const connId = normalizeConexionId(conexionWhatsappId);

  try {
    if (connId) {
      const exact = await fetchMetaAdsConfigExact(usuarioId, connId);
      if (exact) return exact;
    }
    return await fetchMetaAdsConfigExact(usuarioId, null);
  } catch (error) {
    if (isSchemaMissingError(error)) {
      logSchemaFallback("meta_ads_config", error);
      return null;
    }
    logSafe("fetchMetaAdsConfigRow error", error.response?.status || error.message);
    return null;
  }
}

function buildAdsStatus(configRow) {
  const hasAccount = Boolean(configRow?.ad_account_id?.trim());
  const hasToken = Boolean(configRow?.ads_access_token?.trim());
  const conectado = hasAccount && hasToken;

  let mensaje = "Ads API todavía no configurado";
  if (conectado) {
    mensaje = "Métricas reales pendientes de sincronización";
  } else if (hasAccount && !hasToken) {
    mensaje = "Falta Ads Access Token para completar la conexión";
  }

  return {
    conectado,
    ad_account_id: null,
    ad_account_id_masked: hasAccount ? maskAdAccount(configRow.ad_account_id) : null,
    token_masked: hasToken ? maskToken(configRow.ads_access_token) : null,
    ultimo_sync: configRow?.ultimo_sync_ok || null,
    mensaje,
  };
}

async function getMetaAdsStatus({ usuarioId, conexionWhatsappId = null }) {
  if (!usuarioId) {
    const err = new Error("usuarioId requerido");
    err.status = 400;
    throw err;
  }

  const [conexion, configRow] = await Promise.all([
    fetchConexionWhatsapp(usuarioId, conexionWhatsappId),
    fetchMetaAdsConfigRow(usuarioId, conexionWhatsappId),
  ]);

  const pixelId = conexion?.pixel_id?.trim() || "";
  const capiOk = Boolean(conexion?.capi_token?.trim());

  const status = {
    ok: true,
    conexion_whatsapp_id: conexion?.id || normalizeConexionId(conexionWhatsappId) || null,
    pixel: {
      conectado: Boolean(pixelId),
      pixel_id_masked: pixelId ? maskPixelId(pixelId) : null,
    },
    capi: {
      conectado: capiOk,
    },
    ads: buildAdsStatus(configRow),
  };

  logSafe("status", {
    usuarioId,
    conexion: status.conexion_whatsapp_id || "(activa/default)",
    pixel: status.pixel.conectado,
    capi: status.capi.conectado,
    ads: status.ads.conectado,
  });

  return status;
}

async function saveMetaAdsConfig({
  usuarioId,
  conexionWhatsappId = null,
  adAccountId,
  businessId,
  adsAccessToken,
}) {
  if (!usuarioId) {
    const err = new Error("usuarioId requerido");
    err.status = 400;
    throw err;
  }

  const connId = normalizeConexionId(conexionWhatsappId);
  const normalizedAccount = normalizeAdAccountId(adAccountId);
  const tokenIn = adsAccessToken != null ? String(adsAccessToken).trim() : "";

  if (!normalizedAccount) {
    const err = new Error("ad_account_id es obligatorio");
    err.status = 400;
    throw err;
  }

  const existing = await fetchMetaAdsConfigExact(usuarioId, connId);

  if (!existing && !tokenIn) {
    const err = new Error("ads_access_token es obligatorio al crear la configuración");
    err.status = 400;
    throw err;
  }

  const now = new Date().toISOString();
  const payload = {
    usuario_id: usuarioId,
    conexion_whatsapp_id: connId,
    ad_account_id: normalizedAccount,
    business_id: businessId != null && String(businessId).trim() ? String(businessId).trim() : null,
    updated_at: now,
  };

  if (tokenIn) {
    payload.ads_access_token = tokenIn;
  }

  try {
    if (existing?.id) {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/meta_ads_config?id=eq.${encodeURIComponent(existing.id)}`,
        payload,
        {
          headers: headers({
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          }),
        }
      );
    } else {
      payload.created_at = now;
      await axios.post(`${SUPABASE_URL}/rest/v1/meta_ads_config`, payload, {
        headers: headers({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
      });
    }
  } catch (error) {
    if (isSchemaMissingError(error)) {
      const err = new Error(
        "Tabla meta_ads_config no existe. Ejecuta supabase/meta_ads_config.sql en Supabase."
      );
      err.status = 503;
      throw err;
    }
    const msg = error.response?.data?.message || error.message;
    const err = new Error(msg || "No se pudo guardar la configuración Meta Ads");
    err.status = error.response?.status || 500;
    throw err;
  }

  logSafe("config_saved", {
    usuarioId,
    conexion: connId || "(global)",
    ad_account_id_masked: maskAdAccount(normalizedAccount),
  });

  const status = await getMetaAdsStatus({ usuarioId, conexionWhatsappId: connId });

  return {
    ok: true,
    mensaje: "Configuración Meta Ads guardada",
    token_masked: status.ads.token_masked,
    ad_account_id_masked: status.ads.ad_account_id_masked,
    ads: status.ads,
    pixel: status.pixel,
    capi: status.capi,
  };
}

module.exports = {
  getMetaAdsStatus,
  saveMetaAdsConfig,
  maskToken,
  maskAdAccount,
  maskPixelId,
};
