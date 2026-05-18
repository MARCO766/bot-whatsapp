import { useCallback, useEffect, useState } from "react";
import { fetchPanelDashboard, PanelApiError } from "./api";

export function usePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPanelDashboard();
      setData(res);
    } catch (e) {
      setError(
        e instanceof PanelApiError
          ? e.message
          : "No se pudo cargar el panel operativo."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 60000);
    return () => clearInterval(id);
  }, [reload]);

  return { data, loading, error, reload };
}
