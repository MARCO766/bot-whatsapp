import { useCallback, useEffect, useState } from "react";
import {
  MetricasApiError,
  fetchMetricasRevenueBreakdown,
} from "./api";
import { buildRevenueBreakdownParams } from "./format";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { RT } from "../realtime/events";
import { apiConexionWhatsappParam } from "../utils/conexionesInbox";

export function useRevenueBreakdown(
  periodoApi = "7d",
  flujoId = "",
  conexionWhatsappId = null,
  conexionesLoading = false
) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (conexionesLoading || conexionWhatsappId == null) return;

    const conn = apiConexionWhatsappParam(conexionWhatsappId);
    const params = buildRevenueBreakdownParams(
      periodoApi,
      flujoId || undefined,
      conn || undefined
    );

    setLoading(true);
    setError(null);

    try {
      const res = await fetchMetricasRevenueBreakdown(params);
      setData(res);
    } catch (err) {
      const msg =
        err instanceof MetricasApiError
          ? err.message
          : "Error al cargar ingresos premium";
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [periodoApi, flujoId, conexionWhatsappId, conexionesLoading]);

  useEffect(() => {
    load();
  }, [load]);

  const reloadLive = useDebouncedCallback(load, 600);
  useSocketEvent(RT.METRICA_ACTUALIZADA, reloadLive);
  useSocketEvent(RT.CONVERSION_REGISTRADA, reloadLive);

  return { data, loading, error, reload: load };
}
