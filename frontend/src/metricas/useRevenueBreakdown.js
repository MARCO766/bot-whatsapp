import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MetricasApiError, fetchMetricasRevenueBreakdown } from "./api";
import { buildRevenueBreakdownParams } from "./format";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { useSocket } from "../context/SocketProvider";
import { RT } from "../realtime/events";
import { apiConexionWhatsappParam } from "../utils/conexionesInbox";
import {
  METRICAS_SECTION_OPEN_DELAY_MS,
  buildMetricasCacheKey,
  invalidateMetricasSections,
  isMetricasCacheFresh,
  loadMetricasCached,
  metricasCacheEpoch,
  metricasResultIsCurrent,
  readMetricasCache,
} from "./metricasQueryCache";

export function useRevenueBreakdown(
  periodo = "7d",
  flujoId = "",
  conexionWhatsappId = null,
  conexionesLoading = false,
  customRange = null,
  enabled = false
) {
  const usuarioId = useSocket()?.usuarioId ?? null;
  const [data, setData] = useState(null);
  const [dataKey, setDataKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const requestGenRef = useRef(0);
  const enabledRef = useRef(enabled);
  const usuarioIdRef = useRef(usuarioId);
  const dataRef = useRef(null);
  const dataKeyRef = useRef(null);
  const keyNowRef = useRef(null);
  enabledRef.current = enabled;
  usuarioIdRef.current = usuarioId;

  const params = useMemo(() => {
    const conn = apiConexionWhatsappParam(conexionWhatsappId);
    return buildRevenueBreakdownParams(
      periodo,
      flujoId || undefined,
      conn || undefined,
      customRange
    );
  }, [periodo, flujoId, conexionWhatsappId, customRange]);

  const filtersReady =
    !conexionesLoading &&
    conexionWhatsappId != null &&
    !(params.periodo === "custom" && (!params.desde || !params.hasta));

  const cacheKey = useMemo(
    () =>
      buildMetricasCacheKey({
        usuarioId,
        periodo: params.periodo,
        desde: params.desde || null,
        hasta: params.hasta || null,
        flujoId: params.flujo_id || null,
        conexionWhatsappId: params.conexion_whatsapp_id || null,
        section: "revenue",
      }),
    [usuarioId, params]
  );
  keyNowRef.current = cacheKey;

  const load = useCallback(
    async ({ force = false } = {}) => {
      if (!filtersReady || !usuarioId || !enabledRef.current) return;
      const key = cacheKey;
      const capturedEpoch = metricasCacheEpoch(usuarioId, "revenue");
      const gen = ++requestGenRef.current;
      const had = dataKeyRef.current === key && dataRef.current != null;
      if (had) setUpdating(true);
      else setLoading(true);
      if (!had) setError(null);

      try {
        const res = await loadMetricasCached(
          key,
          () => fetchMetricasRevenueBreakdown(params),
          { force }
        );
        if (requestGenRef.current !== gen) return;
        if (keyNowRef.current !== key) return;
        if (!metricasResultIsCurrent(key, res, capturedEpoch)) return;
        dataRef.current = res;
        dataKeyRef.current = key;
        setData(res);
        setDataKey(key);
        setError(null);
      } catch (err) {
        if (requestGenRef.current !== gen) return;
        if (keyNowRef.current !== key) return;
        if (metricasCacheEpoch(usuarioId, "revenue") !== capturedEpoch) return;
        const msg =
          err instanceof MetricasApiError
            ? err.message
            : "Error al cargar ingresos premium";
        setError(msg);
        if (!had) {
          dataRef.current = null;
          dataKeyRef.current = key;
          setData(null);
          setDataKey(key);
        }
      } finally {
        if (requestGenRef.current === gen) {
          setLoading(false);
          setUpdating(false);
        }
      }
    },
    [filtersReady, usuarioId, cacheKey, params]
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled || !filtersReady || !usuarioId) {
      if (!enabled) requestGenRef.current += 1;
      setLoading(false);
      setUpdating(false);
      return undefined;
    }
    if (isMetricasCacheFresh(cacheKey)) {
      const cached = readMetricasCache(cacheKey);
      if (cached?.data != null) {
        dataRef.current = cached.data;
        dataKeyRef.current = cacheKey;
        setData(cached.data);
        setDataKey(cacheKey);
        setError(null);
        setLoading(false);
        setUpdating(false);
        return undefined;
      }
    }
    const hasVisible = dataKeyRef.current === cacheKey && dataRef.current != null;
    if (hasVisible) setUpdating(true);
    else setLoading(true);
    const timer = setTimeout(() => {
      if (enabledRef.current) loadRef.current({ force: false });
    }, METRICAS_SECTION_OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, filtersReady, usuarioId, cacheKey]);

  const reloadLive = useDebouncedCallback(() => {
    if (!enabledRef.current) return;
    loadRef.current({ force: false });
  }, 600);

  const onConversion = useCallback(() => {
    invalidateMetricasSections(["revenue"], usuarioIdRef.current);
    reloadLive();
  }, [reloadLive]);

  useSocketEvent(RT.METRICA_ACTUALIZADA, onConversion);
  useSocketEvent(RT.CONVERSION_REGISTRADA, onConversion);

  const reload = useCallback(() => {
    if (!enabledRef.current) return undefined;
    return loadRef.current({ force: true });
  }, []);

  const cached = isMetricasCacheFresh(cacheKey) ? readMetricasCache(cacheKey)?.data ?? null : null;
  const visibleData = dataKey === cacheKey && data != null ? data : cached;
  const visibleError = dataKey === cacheKey ? error : null;

  return {
    data: enabled ? visibleData : null,
    loading: Boolean(enabled && loading && visibleData == null),
    updating: Boolean(enabled && (updating || (loading && visibleData != null))),
    error: enabled ? visibleError : null,
    reload,
  };
}
