'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './home-cards.module.css';

export default function HomeTooltip({ id, text, children, className = '' }: { id: string; text: string; children: ReactNode; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  function dismiss() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPosition(null);
  }
  function schedule(left: number, top: number) {
    dismiss();
    timer.current = setTimeout(() => { timer.current = null; setPosition({ left, top }); }, 550);
  }
  useLayoutEffect(() => {
    if (!position || !tip.current) return;
    const rect = tip.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(position.left, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(position.top, window.innerHeight - rect.height - 8));
    if (left !== position.left || top !== position.top) setPosition({ left, top });
  }, [position]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', escape);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  return <div ref={host} className={className}
    onPointerEnter={event => { if (event.pointerType === 'mouse') schedule(event.clientX + 14, event.clientY + 18); }}
    onPointerMove={event => { if (event.pointerType === 'mouse') schedule(event.clientX + 14, event.clientY + 18); }}
    onPointerLeave={dismiss} onPointerDown={dismiss}
    onFocus={event => { if (event.target.matches(':focus-visible')) { const rect = host.current?.getBoundingClientRect(); if (rect) schedule(rect.left + 12, rect.bottom + 8); } }}
    onBlur={dismiss}>
    {children}
    <span id={id} className={styles.accessibleDescription}>{text}</span>
    {position && createPortal(<div ref={tip} role="tooltip" className={styles.tooltip} style={position}>{text}</div>, document.body)}
  </div>;
}
