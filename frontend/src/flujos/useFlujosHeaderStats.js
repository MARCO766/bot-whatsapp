import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchHeaderStats } from "./api";

const EMPTY = {
  leadsVivos: 0,
  conversaciones: 0,
  ventasTotal: 0,
  moneda: "BOB",
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
        ventasTotal: res.ventasTotal ?? 0,
        moneda: res.moneda || "BOB",
        tendenciaLeads: res.tendenciaLeads ?? null,
        tendenciaConversaciones: res.tendenciaConversaciones ?? null,
        tendenciaVentas: res.tendenciaVentas ?? null,
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

  return { data, loading, error, reload: load };
}
