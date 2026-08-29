import { useCallback, useEffect, useRef, useState } from "react";
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
  const requestSeqRef = useRef(0);

  const loadFlujosLista = useCallback(async () => {
    if (conexionesLoading || conexionWhatsappId == null) return;
    try {
      const lista = await fetchFlujosLista();
      setFlujosLista(lista.flujos || []);
    } catch {
      /* conservar lista previa si falla el selector */
    }
  }, [conexionWhatsappId, conexionesLoading]);

  const loadMetrics = useCallback(async () => {
    if (conexionesLoading || conexionWhatsappId == null) return;
    const conn = apiConexionWhatsappParam(conexionWhatsappId);
    const params = buildMetricasParams(
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
      const [r, f, s, fl, d, h] = await Promise.all([
        fetchMetricasResumen(params),
        uiOcultar.embudoReal ? Promise.resolve(null) : fetchMetricasFunnel(params),
        fetchMetricasSeries(params),
        uiOcultar.metricasPorFlujo ? Promise.resolve(null) : fetchMetricasFlujos(params),
        fetchMetricasDiagnostico(params),
        uiOcultar.heatmapHorario ? Promise.resolve(null) : fetchMetricasHeatmap(params),
      ]);
      if (requestSeq !== requestSeqRef.current) return;
      setResumen(r);
      setFunnel(f);
      setSeries(s);
      setFlujos(fl);
      setDiagnostico(d);
      setHeatmap(h);
    } catch (err) {
      if (requestSeq !== requestSeqRef.current) return;
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
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [periodo, flujoId, conexionWhatsappId, conexionesLoading, uiOcultar, customRange]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadMetrics(), loadFlujosLista()]);
  }, [loadMetrics, loadFlujosLista]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    loadFlujosLista();
  }, [loadFlujosLista]);

  const reloadLiveMetrics = useDebouncedCallback(loadMetrics, 600);
  useSocketEvent(RT.METRICA_ACTUALIZADA, reloadLiveMetrics);
  useSocketEvent(RT.CONVERSION_REGISTRADA, reloadLiveMetrics);
  useSocketEvent(RT.NUEVO_MENSAJE, reloadLiveMetrics);
  useSocketEvent(RT.CLIENTE_ACTUALIZADO, reloadLiveMetrics);

  const reloadFlujosListaLive = useDebouncedCallback(loadFlujosLista, 600);
  useSocketEvent(RT.FLUJO_GUARDADO, reloadFlujosListaLive);

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
    reload: loadAll,
  };
}
