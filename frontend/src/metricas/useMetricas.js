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
import { buildMetricasParams } from "./format";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { RT } from "../realtime/events";
import { apiConexionWhatsappParam } from "../utils/conexionesInbox";

export function useMetricas(
  periodo = "7d",
  flujoId = "",
  conexionWhatsappId = null,
  conexionesLoading = false,
  uiOcultar = {},
  customRange = null
) {
  const [resumen, setResumen] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [series, setSeries] = useState(null);
  const [flujos, setFlujos] = useState(null);
  const [diagnostico, setDiagnostico] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [flujosLista, setFlujosLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (conexionesLoading || conexionWhatsappId == null) return;
    const conn = apiConexionWhatsappParam(conexionWhatsappId);
    const params = buildMetricasParams(
      periodo,
      flujoId || undefined,
      conn || undefined,
      customRange
    );
    if (params.periodo === "custom" && (!params.desde || !params.hasta)) return;
    setLoading(true);
    setError(null);
    try {
      const [r, f, s, fl, d, h, lista] = await Promise.all([
        fetchMetricasResumen(params),
        uiOcultar.embudoReal ? Promise.resolve(null) : fetchMetricasFunnel(params),
        fetchMetricasSeries(params),
        uiOcultar.metricasPorFlujo ? Promise.resolve(null) : fetchMetricasFlujos(params),
        fetchMetricasDiagnostico(params),
        uiOcultar.heatmapHorario ? Promise.resolve(null) : fetchMetricasHeatmap(params),
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
  }, [periodo, flujoId, conexionWhatsappId, conexionesLoading, uiOcultar, customRange]);

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
