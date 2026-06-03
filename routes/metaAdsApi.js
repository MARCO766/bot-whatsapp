/**
 * API Meta Ads — estado, configuración, campañas (lectura) e insights (cache + refresh manual).
 */
const express = require("express");
const router = express.Router();
const {
  getMetaAdsStatus,
  saveMetaAdsConfig,
} = require("../services/metaAds/metaAdsConfigService");
const {
  getCachedInsights,
  refreshInsights,
} = require("../services/metaAds/metaAdsInsightsService");
const { getMetaAdsCampaigns } = require("../services/metaAds/metaAdsCampaignsService");

function protegerApi(req, res, next) {
  if (req.session?.usuario?.id) return next();
  return res.status(401).json({ ok: false, error: "No autenticado" });
}

function uid(req) {
  return req.session.usuario.id;
}

function handleError(res, error, label) {
  const status = error.status || error.response?.status || 500;
  console.log(`[META_ADS] ${label} (${status}):`, error.message);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    ok: false,
    error: error.message || "Error en Meta Ads API",
  });
}

router.get("/api/meta-ads/status", protegerApi, async (req, res) => {
  try {
    const data = await getMetaAdsStatus({
      usuarioId: uid(req),
      conexionWhatsappId: req.query.conexion_whatsapp_id || null,
    });
    res.json(data);
  } catch (error) {
    handleError(res, error, "status");
  }
});

router.post("/api/meta-ads/config", protegerApi, async (req, res) => {
  try {
    const body = req.body || {};
    const data = await saveMetaAdsConfig({
      usuarioId: uid(req),
      conexionWhatsappId: body.conexion_whatsapp_id ?? body.conexionWhatsappId ?? null,
      adAccountId: body.ad_account_id ?? body.adAccountId,
      businessId: body.business_id ?? body.businessId,
      adsAccessToken: body.ads_access_token ?? body.adsAccessToken,
    });
    res.json(data);
  } catch (error) {
    handleError(res, error, "config");
  }
});

router.get("/api/meta-ads/campaigns", protegerApi, async (req, res) => {
  try {
    const data = await getMetaAdsCampaigns({
      usuarioId: uid(req),
      conexionWhatsappId: req.query.conexion_whatsapp_id || null,
    });
    res.json(data);
  } catch (error) {
    handleError(res, error, "campaigns");
  }
});

router.get("/api/meta-ads/insights", protegerApi, async (req, res) => {
  try {
    const data = await getCachedInsights({
      usuarioId: uid(req),
      conexionWhatsappId: req.query.conexion_whatsapp_id || null,
      periodo: req.query.periodo || "7d",
    });
    res.json(data);
  } catch (error) {
    handleError(res, error, "insights");
  }
});

router.post("/api/meta-ads/refresh", protegerApi, async (req, res) => {
  try {
    const body = req.body || {};
    const data = await refreshInsights({
      usuarioId: uid(req),
      conexionWhatsappId: body.conexion_whatsapp_id ?? body.conexionWhatsappId ?? null,
      periodo: body.periodo || "7d",
    });
    res.json(data);
  } catch (error) {
    handleError(res, error, "refresh");
  }
});

module.exports = router;
