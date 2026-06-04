import { useCallback, useEffect, useState } from "react";
import { fetchOnboardingEstado } from "./api";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { RT } from "../realtime/events";

export function useOnboardingEstado() {
  const [onboarding, setOnboarding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOnboardingEstado();
      setOnboarding(data.onboarding || null);
    } catch (err) {
      setError(err.message || "Error cargando onboarding");
      setOnboarding(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const reloadLive = useDebouncedCallback(reload, 300);
  useSocketEvent(RT.CONEXION_ACTUALIZADA, reloadLive);

  const needsOnboarding =
    onboarding != null && onboarding.tiene_conexion_whatsapp === false;

  return {
    onboarding,
    loading,
    error,
    needsOnboarding,
    reload,
  };
}
