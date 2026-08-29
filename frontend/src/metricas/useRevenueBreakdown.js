import { useCallback, useEffect, useRef, useState } from "react";
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
  periodo = "7d",
  flujoId = "",
  conexionWhatsappId = null,
  conexionesLoading = false,
  customRange = null
) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (conexionesLoading || conexionWhatsappId == null) return;

    const conn = apiConexionWhatsappParam(conexionWhatsappId);
    const params = buildRevenueBreakdownParams(
      periodo,
      flujoId || undefined,
      conn || undefined,
      customRange
    );

    if (params.periodo === "custom" && (!params.desde || !params.hasta)) return;

    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await fetchMetricasRevenueBreakdown(params);
      if (requestSeq !== requestSeqRef.current) return;
      setData(res);
    } catch (err) {
      if (requestSeq !== requestSeqRef.current) return;
      const msg =
        err instanceof MetricasApiError
          ? err.message
          : "Error al cargar ingresos premium";
      setError(msg);
      setData(null);
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [periodo, flujoId, conexionWhatsappId, conexionesLoading, customRange]);

  useEffect(() => {
    load();
  }, [load]);

  const reloadLive = useDebouncedCallback(load, 600);
  useSocketEvent(RT.METRICA_ACTUALIZADA, reloadLive);
  useSocketEvent(RT.CONVERSION_REGISTRADA, reloadLive);

  return { data, loading, error, reload: load };
}
