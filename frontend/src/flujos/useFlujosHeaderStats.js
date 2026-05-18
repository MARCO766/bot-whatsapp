import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchHeaderStats } from "./api";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { RT } from "../realtime/events";

const EMPTY = {
  leadsVivos: 0,
  conversaciones: 0,
  ventasCantidad: 0,
  ventasMonto: 0,
  flujosActivos: 0,
  tendenciaLeads: null,
  tendenciaConversaciones: null,
  tendenciaVentas: null,
};

export function useFlujosHeaderStats(enabled = true) {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchHeaderStats();
      setData({
        leadsVivos: res.leadsVivos ?? 0,
        conversaciones: res.conversaciones ?? 0,
        ventasCantidad: res.ventasCantidad ?? 0,
        ventasMonto: res.ventasMonto ?? 0,
        tendenciaLeads: res.tendenciaLeads ?? null,
        tendenciaConversaciones: res.tendenciaConversaciones ?? null,
        tendenciaVentas: res.tendenciaVentas ?? null,
        flujosActivos: res.flujosActivos ?? 0,
      });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(err.message, "SERVER");
      setData(EMPTY);
      setError(apiErr.message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const reloadLive = useDebouncedCallback(load, 500);
  useSocketEvent(RT.METRICA_ACTUALIZADA, reloadLive, enabled);
  useSocketEvent(RT.CONVERSION_REGISTRADA, reloadLive, enabled);
  useSocketEvent(RT.NUEVO_MENSAJE, reloadLive, enabled);

  return { data, loading, error, reload: load };
}
