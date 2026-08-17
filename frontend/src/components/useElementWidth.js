import { useCallback, useState } from "react";

// Часть А-2 (nav-zone): callback-ref + ResizeObserver → ширина элемента.
// Callback-ref (а не effect с []): полоса может монтироваться после загрузки
// данных, effect бы не сработал (урок P4).
export default function useElementWidth() {
  const [width, setWidth] = useState(0);
  const [observer] = useState(() => (typeof ResizeObserver !== "undefined"
    ? new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) setWidth(entry.contentRect.width);
      })
    : null));
  const ref = useCallback(
    (el) => {
      if (!observer) return;
      observer.disconnect();
      if (el) {
        setWidth(el.getBoundingClientRect().width);
        observer.observe(el);
      }
    },
    [observer],
  );
  return [ref, width];
}
