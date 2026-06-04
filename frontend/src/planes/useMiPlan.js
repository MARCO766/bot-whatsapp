import { useCallback, useEffect, useState } from "react";
import { fetchMiPlan } from "./api";

export function useMiPlan(enabled = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMiPlan();
      setData(res);
    } catch (err) {
      setData(null);
      setError(err.message || "No se pudo cargar el plan");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, plan: data?.plan ?? null, loading, error, reload };
}
