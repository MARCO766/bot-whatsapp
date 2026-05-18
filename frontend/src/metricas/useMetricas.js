import { useCallback, useEffect, useState } from "react";
import {
  MetricasApiError,
  fetchMetricasDiagnostico,
  fetchMetricasFlujos,
  fetchMetricasFunnel,
  fetchMetricasHeatmap,
  fetchMetricasResumen,
  fetchMetricasSeries,
  fetchFlujosLista,
} from "./api";
import { periodoToApi } from "./format";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { RT } from "../realtime/events";

export function useMetricas(periodoLabel = "7 días", flujoId = "") {
  const [resumen, setResumen] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [series, setSeries] = useState(null);
  const [flujos, setFlujos] = useState(null);
  const [diagnostico, setDiagnostico] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [flujosLista, setFlujosLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const params = {
    periodo: periodoToApi(periodoLabel),
    flujo_id: flujoId || undefined,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, f, s, fl, d, h, lista] = await Promise.all([
        fetchMetricasResumen(params),
        fetchMetricasFunnel(params),
        fetchMetricasSeries(params),
        fetchMetricasFlujos(params),
        fetchMetricasDiagnostico(params),
        fetchMetricasHeatmap(params),
        fetchFlujosLista(),
      ]);
      setResumen(r);
      setFunnel(f);
      setSeries(s);
      setFlujos(fl);
      setDiagnostico(d);
      setHeatmap(h);
      setFlujosLista(lista.flujos || []);
    } catch (err) {
      const msg =
        err instanceof MetricasApiError ? err.message : "Error al cargar métricas";
      setError(msg);
      setResumen(null);
      setFunnel(null);
      setSeries(null);
      setFlujos(null);
      setDiagnostico(null);
      setHeatmap(null);
    } finally {
      setLoading(false);
    }
  }, [periodoLabel, flujoId]);

  useEffect(() => {
    load();
  }, [load]);

  const reloadLive = useDebouncedCallback(load, 600);
  useSocketEvent(RT.METRICA_ACTUALIZADA, reloadLive);
  useSocketEvent(RT.CONVERSION_REGISTRADA, reloadLive);
  useSocketEvent(RT.NUEVO_MENSAJE, reloadLive);
  useSocketEvent(RT.CLIENTE_ACTUALIZADO, reloadLive);

  return {
    resumen,
    funnel,
    series,
    flujos,
    diagnostico,
    heatmap,
    flujosLista,
    loading,
    error,
    reload: load,
  };
}
