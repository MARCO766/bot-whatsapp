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
import { metricasSectionView } from "./metricasSectionView";

export { metricasSectionView };

const SECTION_KEYS = ["resumen", "funnel", "series", "flujos", "diagnostico", "heatmap"];

function initialPending() {
  return {
    resumen: true,
    funnel: true,
    series: true,
    flujos: true,
    diagnostico: true,
    heatmap: true,
  };
}

function idlePending() {
  return {
    resumen: false,
    funnel: false,
    series: false,
    flujos: false,
    diagnostico: false,
    heatmap: false,
  };
}

function initialSectionError() {
  return {
    resumen: null,
    funnel: null,
    series: null,
    flujos: null,
    diagnostico: null,
    heatmap: null,
  };
}

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
  const [pending, setPending] = useState(initialPending);
  const [sectionError, setSectionError] = useState(initialSectionError);
  const [authError, setAuthError] = useState(null);
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
    const skip = {
      resumen: false,
      funnel: Boolean(uiOcultar.embudoReal),
      series: false,
      flujos: Boolean(uiOcultar.metricasPorFlujo),
      diagnostico: false,
      heatmap: Boolean(uiOcultar.heatmapHorario),
    };

    setAuthError(null);
    setPending((current) => {
      const next = { ...current };
      SECTION_KEYS.forEach((key) => {
        next[key] = !skip[key];
      });
      return next;
    });
    setSectionError((current) => {
      const next = { ...current };
      SECTION_KEYS.forEach((key) => {
        if (!skip[key]) next[key] = null;
      });
      return next;
    });

    const stillCurrent = () => requestSeq === requestSeqRef.current;

    const finishSection = (key) => {
      if (!stillCurrent()) return;
      setPending((current) => ({ ...current, [key]: false }));
    };

    const runSection = async (key, fetcher, applyData) => {
      if (skip[key]) {
        finishSection(key);
        return;
      }
      try {
        const data = await fetcher(params);
        if (!stillCurrent()) return;
        applyData(data);
        setSectionError((current) => ({ ...current, [key]: null }));
      } catch (err) {
        if (!stillCurrent()) return;
        if (err instanceof MetricasApiError && (err.code === "NO_AUTH" || err.status === 401)) {
          setAuthError(err.message);
          setPending(idlePending());
          return;
        }
        const msg =
          err instanceof MetricasApiError ? err.message : "Error al cargar métricas";
        setSectionError((current) => ({ ...current, [key]: msg }));
      } finally {
        finishSection(key);
      }
    };

    await Promise.all([
      runSection("resumen", fetchMetricasResumen, setResumen),
      runSection("funnel", fetchMetricasFunnel, setFunnel),
      runSection("series", fetchMetricasSeries, setSeries),
      runSection("flujos", fetchMetricasFlujos, setFlujos),
      runSection("diagnostico", fetchMetricasDiagnostico, setDiagnostico),
      runSection("heatmap", fetchMetricasHeatmap, setHeatmap),
    ]);
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

  const updating =
    (pending.resumen && resumen != null) ||
    (pending.funnel && funnel != null) ||
    (pending.series && series != null) ||
    (pending.flujos && flujos != null) ||
    (pending.diagnostico && diagnostico != null) ||
    (pending.heatmap && heatmap != null);

  return {
    resumen,
    funnel,
    series,
    flujos,
    diagnostico,
    heatmap,
    flujosLista,
    pending,
    sectionError,
    authError,
    updating,
    reload: loadAll,
  };
}
