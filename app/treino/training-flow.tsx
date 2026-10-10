'use client';
import { useEffect, useRef } from 'react';

/** Presentation-only navigation between rounds, answers and the selector. */
export default function TrainingFlow({ step, revealed = false }: { step: string | number; revealed?: boolean }) {
  const marker = useRef<HTMLSpanElement>(null);
  const previous = useRef<string | number | null>(null);
  useEffect(() => {
    const firstSelection = previous.current === null && step === 'selection';
    previous.current = step;
    if (firstSelection) return;
    const frame = requestAnimationFrame(() => {
      const main = marker.current?.closest('main');
      const target = main?.querySelector<HTMLElement>(revealed ? '[data-training-answer]' : 'h1');
      if (!target) return;
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
      const top = target.getBoundingClientRect().top;
      // Short answer headings may be below the fold; never align a tall answer's bottom.
      if (!revealed || top < 16 || top > window.innerHeight * .55) {
        window.scrollTo({ top: Math.max(0, window.scrollY + top - 24), behavior: 'instant' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [step, revealed]);
  return <span ref={marker} hidden />;
}
