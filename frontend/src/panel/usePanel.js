import { useCallback, useEffect, useState } from "react";
import { fetchPanelDashboard, PanelApiError } from "./api";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { RT } from "../realtime/events";
import { apiConexionWhatsappParam } from "../utils/conexionesInbox";

export function usePanel(conexionWhatsappId = null, conexionesLoading = false) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (conexionesLoading || conexionWhatsappId == null) return;
    setLoading(true);
    setError(null);
    try {
      const conn = apiConexionWhatsappParam(conexionWhatsappId);
      const res = await fetchPanelDashboard(
        conn ? { conexion_whatsapp_id: conn } : {}
      );
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
  }, [conexionWhatsappId, conexionesLoading]);

  const reloadLive = useDebouncedCallback(reload, 500);

  useEffect(() => {
    reload();
  }, [reload]);

  useSocketEvent(RT.NUEVO_MENSAJE, reloadLive);
  useSocketEvent(RT.CLIENTE_ACTUALIZADO, reloadLive);
  useSocketEvent(RT.CONVERSION_REGISTRADA, reloadLive);
  useSocketEvent(RT.METRICA_ACTUALIZADA, reloadLive);
  useSocketEvent(RT.FLUJO_GUARDADO, reloadLive);

  return { data, loading, error, reload };
}
