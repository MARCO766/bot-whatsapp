import { useCallback, useEffect, useState } from "react";
import { MetricasApiError, fetchMetaAdsCampaigns } from "./metaAdsApi";
import { apiConexionWhatsappParam } from "../utils/conexionesInbox";

export function useMetaAdsCampaigns(conexionWhatsappId, adsConectado, conexionesLoading) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const load = useCallback(async () => {
    if (conexionesLoading || conexionWhatsappId == null || !adsConectado) {
      setCampaigns([]);
      setError(null);
      setMensaje(null);
      setLoading(false);
      return;
    }

    const conn = apiConexionWhatsappParam(conexionWhatsappId);
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMetaAdsCampaigns(conn ? { conexion_whatsapp_id: conn } : {});
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
      setMensaje(data.mensaje || null);
    } catch (err) {
      const msg =
        err instanceof MetricasApiError ? err.message : "No se pudieron cargar campañas Meta Ads";
      setError(msg);
      setCampaigns([]);
      setMensaje(null);
    } finally {
      setLoading(false);
    }
  }, [adsConectado, conexionWhatsappId, conexionesLoading]);

  useEffect(() => {
    load();
  }, [load]);

  return { campaigns, loading, error, mensaje, reload: load };
}
