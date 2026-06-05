import { useCallback, useEffect, useState } from "react";
import { fetchOnboardingEstado, marcarBienvenidaMostrada } from "./api";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { RT } from "../realtime/events";

export function useOnboardingEstado({ manageWelcomeModal = true } = {}) {
  const [onboarding, setOnboarding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOnboardingEstado();
      const next = data.onboarding || null;
      setOnboarding(next);
      if (manageWelcomeModal && next?.mostrar_modal_bienvenida) {
        setWelcomeOpen(true);
      }
    } catch (err) {
      setError(err.message || "Error cargando onboarding");
      setOnboarding(null);
    } finally {
      setLoading(false);
    }
  }, [manageWelcomeModal]);

  useEffect(() => {
    reload();
  }, [reload]);

  const reloadLive = useDebouncedCallback(reload, 300);
  useSocketEvent(RT.CONEXION_ACTUALIZADA, reloadLive);
  useSocketEvent(RT.CLIENTE_ACTUALIZADO, reloadLive);
  useSocketEvent(RT.FLUJO_GUARDADO, reloadLive);

  const needsOnboarding =
    onboarding != null && onboarding.tiene_conexion_whatsapp === false;

  const dismissWelcome = useCallback(async () => {
    setWelcomeOpen(false);
    setOnboarding((prev) =>
      prev
        ? {
            ...prev,
            bienvenida_mostrada: true,
            mostrar_modal_bienvenida: false,
          }
        : prev
    );
    try {
      await marcarBienvenidaMostrada();
    } catch {
      /* el modal ya se cerró; reintento en próximo reload */
    }
  }, []);

  return {
    onboarding,
    loading,
    error,
    needsOnboarding,
    welcomeOpen,
    dismissWelcome,
    setWelcomeOpen,
    reload,
  };
}
