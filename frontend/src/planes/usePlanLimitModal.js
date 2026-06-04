import { useCallback, useState } from "react";
import { buildPlanLimitMessage, isPlanLimitError } from "./planLimitErrors";

export function usePlanLimitModal() {
  const [limitModal, setLimitModal] = useState(null);

  const tryHandlePlanLimitError = useCallback((error) => {
    if (!isPlanLimitError(error)) return false;
    setLimitModal(buildPlanLimitMessage(error));
    return true;
  }, []);

  const closeLimitModal = useCallback(() => setLimitModal(null), []);

  return {
    limitModal,
    tryHandlePlanLimitError,
    closeLimitModal,
  };
}
