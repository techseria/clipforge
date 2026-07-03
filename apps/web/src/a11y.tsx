/**
 * Accessibility utilities — PRD §15 (WCAG 2.1 AA target)
 * - SkipLink: lets keyboard users bypass nav
 * - useAnnounce: live-region helper for non-blocking status updates
 * - useFocusTrap: traps focus inside modals/dialogs
 */

import { useEffect, useRef, useState } from 'react';

/** Renders a hidden skip link that becomes visible on focus. */
export function SkipLink({ to = '#main' }: { to?: string }) {
  return (
    <a
      href={to}
      className="
        sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50
        focus:rounded-md focus:bg-brand-700 focus:text-white focus:px-4 focus:py-2
        focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-500
      "
    >
      Skip to main content
    </a>
  );
}

/** Hook that returns a function to push announcements to a live region. */
export function useAnnounce() {
  const [msg, setMsg] = useState('');
  const announce = (text: string) => setMsg(text);
  // Clear after 5s so the SR doesn't re-read on every navigation
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 5000);
    return () => clearTimeout(t);
  }, [msg]);
  return { announce, region: <div role="status" aria-live="polite" className="sr-only">{msg}</div> };
}

/** Traps focus inside the returned ref'd container while active. */
export function useFocusTrap(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;

    const sel = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(sel));
    const first = focusables()[0];
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
  }, [active]);

  return ref;
}