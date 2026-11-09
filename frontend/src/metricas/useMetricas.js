import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useSocket } from "../context/SocketProvider";
import { RT } from "../realtime/events";
import { apiConexionWhatsappParam } from "../utils/conexionesInbox";
import { metricasSectionView } from "./metricasSectionView";
import {
  METRICAS_SECTION_OPEN_DELAY_MS,
  buildMetricasCacheKey,
  dropMetricasCacheExceptUser,
  invalidateMetricasSections,
  isMetricasCacheFresh,
  loadMetricasCached,
  metricasCacheEpoch,
  metricasResultIsCurrent,
  readMetricasCache,
  retireMetricasCache,
} from "./metricasQueryCache";

export { metricasSectionView };

const LAZY_FETCHERS = {
  series: fetchMetricasSeries,
  diagnostico: fetchMetricasDiagnostico,
};

function initialPending() {
  return {
    resumen: true,
    funnel: false,
    series: false,
    flujos: false,
    diagnostico: false,
    heatmap: false,
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
  customRange = null,
  sectionOpen = {}
) {
  const usuarioId = useSocket()?.usuarioId ?? null;
  const seriesOpen = Boolean(sectionOpen.series);
  const diagnosticoOpen = Boolean(sectionOpen.diagnostico);
  const hideFunnel = Boolean(uiOcultar.embudoReal);
  const hideHeatmap = Boolean(uiOcultar.heatmapHorario);
  const hideFlujos = Boolean(uiOcultar.metricasPorFlujo);

  const [resumen, setResumen] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [series, setSeries] = useState(null);
  const [seriesKey, setSeriesKey] = useState(null);
  const [flujos, setFlujos] = useState(null);
  const [diagnostico, setDiagnostico] = useState(null);
  const [diagnosticoKey, setDiagnosticoKey] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [flujosLista, setFlujosLista] = useState([]);
  const [pending, setPending] = useState(initialPending);
  const [sectionError, setSectionError] = useState(initialSectionError);
  const [authError, setAuthError] = useState(null);
  const requestSeqRef = useRef(0);
  const lazyGenRef = useRef({ series: 0, diagnostico: 0 });
  const seriesOpenRef = useRef(seriesOpen);
  const diagnosticoOpenRef = useRef(diagnosticoOpen);
  const usuarioIdRef = useRef(usuarioId);
  const dataRef = useRef({ series: null, diagnostico: null });
  const appliedRef = useRef({ series: null, diagnostico: null });
  const keyNowRef = useRef({ series: null, diagnostico: null });
  seriesOpenRef.current = seriesOpen;
  diagnosticoOpenRef.current = diagnosticoOpen;
  usuarioIdRef.current = usuarioId;

  const params = useMemo(() => {
    const conn = apiConexionWhatsappParam(conexionWhatsappId);
    return buildMetricasParams(periodo, flujoId || undefined, conn || undefined, customRange);
  }, [periodo, flujoId, conexionWhatsappId, customRange]);

  const filtersReady =
    !conexionesLoading &&
    conexionWhatsappId != null &&
    !(params.periodo === "custom" && (!params.desde || !params.hasta));

  const cacheKeyFor = useCallback(
    (section) =>
      buildMetricasCacheKey({
        usuarioId,
        periodo: params.periodo,
        desde: params.desde || null,
        hasta: params.hasta || null,
        flujoId: params.flujo_id || null,
        conexionWhatsappId: params.conexion_whatsapp_id || null,
        section,
      }),
    [usuarioId, params]
  );

  const seriesKeyNow = useMemo(() => cacheKeyFor("series"), [cacheKeyFor]);
  const diagnosticoKeyNow = useMemo(
    () => cacheKeyFor("diagnostico"),
    [cacheKeyFor]
  );
  keyNowRef.current.series = seriesKeyNow;
  keyNowRef.current.diagnostico = diagnosticoKeyNow;

  useEffect(() => {
    if (usuarioId) dropMetricasCacheExceptUser(usuarioId);
  }, [usuarioId]);

  useEffect(() => () => {
    retireMetricasCache(usuarioIdRef.current);
  }, []);

  const loadFlujosLista = useCallback(async () => {
    if (conexionesLoading || conexionWhatsappId == null) return;
    try {
      const lista = await fetchFlujosLista();
      setFlujosLista(lista.flujos || []);
    } catch {
      /* conservar lista previa si falla el selector */
    }
  }, [conexionWhatsappId, conexionesLoading]);

  const loadCore = useCallback(async () => {
    if (!filtersReady) {
      if (!conexionesLoading && conexionWhatsappId != null) {
        requestSeqRef.current += 1;
        setPending((current) => ({
          ...current,
          resumen: false,
          funnel: false,
          heatmap: false,
          flujos: false,
        }));
      }
      return;
    }
    const requestSeq = ++requestSeqRef.current;
    const stillCurrent = () => requestSeq === requestSeqRef.current;
    const jobs = [
      ["resumen", fetchMetricasResumen, setResumen],
    ];
    if (!hideFunnel) jobs.push(["funnel", fetchMetricasFunnel, setFunnel]);
    if (!hideHeatmap) jobs.push(["heatmap", fetchMetricasHeatmap, setHeatmap]);
    if (!hideFlujos) jobs.push(["flujos", fetchMetricasFlujos, setFlujos]);

    setAuthError(null);
    setPending((current) => {
      const next = { ...current };
      jobs.forEach(([key]) => {
        next[key] = true;
      });
      return next;
    });
    setSectionError((current) => {
      const next = { ...current };
      jobs.forEach(([key]) => {
        next[key] = null;
      });
      return next;
    });

    await Promise.all(
      jobs.map(async ([key, fetcher, applyData]) => {
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
          if (stillCurrent()) {
            setPending((current) => ({ ...current, [key]: false }));
          }
        }
      })
    );
  }, [filtersReady, conexionesLoading, conexionWhatsappId, hideFunnel, hideHeatmap, hideFlujos, params]);

  const loadLazy = useCallback(
    async (section, { force = false } = {}) => {
      if (!filtersReady || !usuarioId) return;
      if (section !== "series" && section !== "diagnostico") return;
      const key = cacheKeyFor(section);
      const capturedEpoch = metricasCacheEpoch(usuarioId, section);
      const gen = ++lazyGenRef.current[section];
      const had =
        appliedRef.current[section] === key && dataRef.current[section] != null;

      setPending((current) => ({ ...current, [section]: true }));
      if (!had) {
        setSectionError((current) => ({ ...current, [section]: null }));
      }

      const apply = (data) => {
        dataRef.current[section] = data;
        appliedRef.current[section] = key;
        if (section === "series") {
          setSeries(data);
          setSeriesKey(key);
        } else {
          setDiagnostico(data);
          setDiagnosticoKey(key);
        }
        setSectionError((current) => ({ ...current, [section]: null }));
      };

      try {
        const data = await loadMetricasCached(key, () => LAZY_FETCHERS[section](params), {
          force,
        });
        if (lazyGenRef.current[section] !== gen) return;
        if (keyNowRef.current[section] !== key) return;
        if (!metricasResultIsCurrent(key, data, capturedEpoch)) return;
        apply(data);
      } catch (err) {
        if (lazyGenRef.current[section] !== gen) return;
        if (keyNowRef.current[section] !== key) return;
        if (metricasCacheEpoch(usuarioId, section) !== capturedEpoch) return;
        if (err instanceof MetricasApiError && (err.code === "NO_AUTH" || err.status === 401)) {
          setAuthError(err.message);
          setPending(idlePending());
          return;
        }
        const msg =
          err instanceof MetricasApiError ? err.message : "Error al cargar métricas";
        setSectionError((current) => ({ ...current, [section]: msg }));
        if (!had) {
          dataRef.current[section] = null;
          appliedRef.current[section] = key;
          if (section === "series") {
            setSeries(null);
            setSeriesKey(key);
          } else {
            setDiagnostico(null);
            setDiagnosticoKey(key);
          }
        }
      } finally {
        if (lazyGenRef.current[section] === gen) {
          setPending((current) => ({ ...current, [section]: false }));
        }
      }
    },
    [filtersReady, usuarioId, cacheKeyFor, params]
  );

  const loadLazyRef = useRef(loadLazy);
  loadLazyRef.current = loadLazy;

  const publishFresh = useCallback((section, key) => {
    if (!isMetricasCacheFresh(key)) return false;
    const cached = readMetricasCache(key);
    if (!cached || cached.data == null) return false;
    dataRef.current[section] = cached.data;
    appliedRef.current[section] = key;
    if (section === "series") {
      setSeries(cached.data);
      setSeriesKey(key);
    } else {
      setDiagnostico(cached.data);
      setDiagnosticoKey(key);
    }
    setSectionError((current) => ({ ...current, [section]: null }));
    setPending((current) => ({ ...current, [section]: false }));
    return true;
  }, []);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    loadFlujosLista();
  }, [loadFlujosLista]);

  useEffect(() => {
    if (seriesOpen) return undefined;
    lazyGenRef.current.series += 1;
    setPending((current) => (current.series ? { ...current, series: false } : current));
    return undefined;
  }, [seriesOpen]);

  useEffect(() => {
    if (diagnosticoOpen) return undefined;
    lazyGenRef.current.diagnostico += 1;
    setPending((current) =>
      current.diagnostico ? { ...current, diagnostico: false } : current
    );
    return undefined;
  }, [diagnosticoOpen]);

  useEffect(() => {
    if (!seriesOpen || !filtersReady || !usuarioId) return undefined;
    if (publishFresh("series", seriesKeyNow)) return undefined;
    setPending((current) => ({ ...current, series: true }));
    const timer = setTimeout(() => {
      if (seriesOpenRef.current) loadLazyRef.current("series", { force: false });
    }, METRICAS_SECTION_OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [seriesOpen, filtersReady, usuarioId, seriesKeyNow, publishFresh]);

  useEffect(() => {
    if (!diagnosticoOpen || !filtersReady || !usuarioId) return undefined;
    if (publishFresh("diagnostico", diagnosticoKeyNow)) return undefined;
    setPending((current) => ({ ...current, diagnostico: true }));
    const timer = setTimeout(() => {
      if (diagnosticoOpenRef.current) loadLazyRef.current("diagnostico", { force: false });
    }, METRICAS_SECTION_OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [diagnosticoOpen, filtersReady, usuarioId, diagnosticoKeyNow, publishFresh]);

  const reloadResumenLive = useDebouncedCallback(loadCore, 600);
  const refreshOpenLazy = useDebouncedCallback(() => {
    if (seriesOpenRef.current) loadLazyRef.current("series", { force: false });
    if (diagnosticoOpenRef.current) loadLazyRef.current("diagnostico", { force: false });
  }, 600);

  const onActividad = useCallback(() => {
    invalidateMetricasSections(["series", "diagnostico"], usuarioIdRef.current);
    reloadResumenLive();
    refreshOpenLazy();
  }, [reloadResumenLive, refreshOpenLazy]);

  const onConversion = useCallback(() => {
    invalidateMetricasSections(["series", "diagnostico"], usuarioIdRef.current);
    reloadResumenLive();
    refreshOpenLazy();
  }, [reloadResumenLive, refreshOpenLazy]);

  useSocketEvent(RT.NUEVO_MENSAJE, onActividad);
  useSocketEvent(RT.CLIENTE_ACTUALIZADO, onActividad);
  useSocketEvent(RT.CONVERSION_REGISTRADA, onConversion);
  useSocketEvent(RT.METRICA_ACTUALIZADA, onConversion);

  const reloadFlujosListaLive = useDebouncedCallback(loadFlujosLista, 600);
  useSocketEvent(RT.FLUJO_GUARDADO, reloadFlujosListaLive);

  const reload = useCallback(() => {
    loadCore();
    loadFlujosLista();
    if (seriesOpenRef.current) loadLazyRef.current("series", { force: true });
    if (diagnosticoOpenRef.current) loadLazyRef.current("diagnostico", { force: true });
  }, [loadCore, loadFlujosLista]);

  const cachedSeries = isMetricasCacheFresh(seriesKeyNow)
    ? readMetricasCache(seriesKeyNow)?.data ?? null
    : null;
  const cachedDiagnostico = isMetricasCacheFresh(diagnosticoKeyNow)
    ? readMetricasCache(diagnosticoKeyNow)?.data ?? null
    : null;
  const seriesVisible = seriesKey === seriesKeyNow && series != null ? series : cachedSeries;
  const diagnosticoVisible =
    diagnosticoKey === diagnosticoKeyNow && diagnostico != null
      ? diagnostico
      : cachedDiagnostico;
  const seriesMismatch = seriesOpen && seriesKey !== seriesKeyNow && seriesVisible == null;
  const diagnosticoMismatch =
    diagnosticoOpen && diagnosticoKey !== diagnosticoKeyNow && diagnosticoVisible == null;

  const updating =
    (pending.resumen && resumen != null) ||
    (seriesOpen && pending.series && seriesVisible != null) ||
    (diagnosticoOpen && pending.diagnostico && diagnosticoVisible != null) ||
    (pending.funnel && funnel != null) ||
    (pending.flujos && flujos != null) ||
    (pending.heatmap && heatmap != null);

  return {
    resumen,
    funnel,
    series: seriesVisible,
    flujos,
    diagnostico: diagnosticoVisible,
    heatmap,
    flujosLista,
    pending: {
      ...pending,
      series: seriesOpen && (pending.series || seriesMismatch),
      diagnostico: diagnosticoOpen && (pending.diagnostico || diagnosticoMismatch),
    },
    sectionError: {
      ...sectionError,
      series: seriesKey === seriesKeyNow ? sectionError.series : null,
      diagnostico: diagnosticoKey === diagnosticoKeyNow ? sectionError.diagnostico : null,
    },
    authError,
    updating,
    reload,
  };
}
