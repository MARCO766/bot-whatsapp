import { useCallback, useEffect, useState } from "react";
import { MetricasApiError, fetchMetaAdsStatus } from "./metaAdsApi";
import { apiConexionWhatsappParam } from "../utils/conexionesInbox";

export function useMetaAdsStatus(conexionWhatsappId, conexionesLoading = false) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (conexionesLoading || conexionWhatsappId == null) return;
    const conn = apiConexionWhatsappParam(conexionWhatsappId);
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMetaAdsStatus(conn ? { conexion_whatsapp_id: conn } : {});
      setStatus(data);
    } catch (err) {
      const msg =
        err instanceof MetricasApiError ? err.message : "No se pudo cargar el estado Meta Ads";
      setError(msg);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [conexionWhatsappId, conexionesLoading]);

  useEffect(() => {
    load();
  }, [load]);

  return { status, loading, error, reload: load };
}
