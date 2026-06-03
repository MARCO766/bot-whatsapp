import { useCallback, useEffect, useState } from "react";
import { MetricasApiError, fetchMetaAdsInsights, refreshMetaAdsInsights } from "./metaAdsApi";
import { periodoToMetaAdsApi } from "./format";
import { apiConexionWhatsappParam } from "../utils/conexionesInbox";

function normalizeCampaignParam(campaignId) {
  const v = String(campaignId ?? "").trim();
  if (!v) return null;
  return v;
}

export function useMetaAdsInsights(
  periodoLabel,
  conexionWhatsappId,
  adsConectado,
  conexionesLoading,
  campaignId
) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const periodoApi = periodoToMetaAdsApi(periodoLabel);
  const campaignApi = normalizeCampaignParam(campaignId);

  const buildParams = useCallback(() => {
    const conn = apiConexionWhatsappParam(conexionWhatsappId);
    return {
      periodo: periodoApi,
      ...(conn ? { conexion_whatsapp_id: conn } : {}),
      ...(campaignApi ? { campaign_id: campaignApi } : {}),
    };
  }, [campaignApi, conexionWhatsappId, periodoApi]);

  const load = useCallback(async () => {
    if (conexionesLoading || conexionWhatsappId == null || !adsConectado) {
      setInsights(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchMetaAdsInsights(buildParams());
      setInsights(data);
    } catch (err) {
      const msg =
        err instanceof MetricasApiError ? err.message : "No se pudieron cargar insights Meta Ads";
      setError(msg);
      setInsights(null);
    } finally {
      setLoading(false);
    }
  }, [adsConectado, buildParams, conexionWhatsappId, conexionesLoading]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    if (!adsConectado) return null;
    setRefreshing(true);
    setError(null);
    try {
      const conn = apiConexionWhatsappParam(conexionWhatsappId);
      const data = await refreshMetaAdsInsights({
        periodo: periodoApi,
        ...(conn ? { conexion_whatsapp_id: conn } : {}),
        ...(campaignApi ? { campaign_id: campaignApi } : {}),
      });
      setInsights(data);
      return data;
    } catch (err) {
      const msg =
        err instanceof MetricasApiError ? err.message : "No se pudo sincronizar con Meta Ads";
      setError(msg);
      throw err;
    } finally {
      setRefreshing(false);
    }
  }, [adsConectado, campaignApi, conexionWhatsappId, periodoApi]);

  return { insights, loading, refreshing, error, reload: load, refresh };
}
