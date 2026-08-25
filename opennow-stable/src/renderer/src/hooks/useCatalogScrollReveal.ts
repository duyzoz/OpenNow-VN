import { useEffect, type RefObject } from "react";

/**
 * Reveal catalog cards once as they enter the viewport.
 * The observer only toggles a data attribute; visual work is limited to a
 * short opacity/translate transition in CSS. No per-frame scroll handler,
 * blur, filter, or 3D transform is used.
 */
export function useCatalogScrollReveal(
  gridRef: RefObject<HTMLElement | null>,
  refreshKey: unknown,
): void {
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof IntersectionObserver === "undefined") return;

    const cards = Array.from(
      grid.querySelectorAll<HTMLElement>(".scroll-anim-wrapper"),
    );
    if (cards.length === 0) return;

    const reveal = (card: HTMLElement): void => {
      card.dataset.scrollReveal = "visible";
      observer.unobserve(card);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) reveal(entry.target as HTMLElement);
        }
      },
      { root: null, rootMargin: "0px 0px 72px", threshold: 0.01 },
    );

    for (const card of cards) {
      card.dataset.scrollReveal = "pending";
      observer.observe(card);
    }

    return () => observer.disconnect();
  }, [gridRef, refreshKey]);
}
