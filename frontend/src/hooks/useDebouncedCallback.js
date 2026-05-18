import { useCallback, useRef } from "react";

/** Evita refetch en ráfaga cuando llegan varios eventos socket seguidos */
export function useDebouncedCallback(fn, delay = 450) {
  const timerRef = useRef(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return useCallback(
    (...args) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        fnRef.current?.(...args);
      }, delay);
    },
    [delay]
  );
}
