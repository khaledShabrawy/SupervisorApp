import { memo, useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';

/** Calls onVisible when the sentinel enters the viewport (infinite scroll). */
export function useSentinel(enabled: boolean, onVisible: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible); cb.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) cb.current(); }, { rootMargin: '240px' });
    io.observe(el); return () => io.disconnect();
  }, [enabled]);
  return ref;
}
/** Pull down from the top of the page to refresh. */
export function usePullRefresh(onRefresh: () => void) {
  const cb = useRef(onRefresh); cb.current = onRefresh;
  useEffect(() => {
    let y0: number | null = null;
    const start = (e: TouchEvent) => { y0 = window.scrollY <= 0 ? e.touches[0].clientY : null; };
    const end = (e: TouchEvent) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 90) cb.current(); y0 = null; };
    window.addEventListener('touchstart', start, { passive: true }); window.addEventListener('touchend', end, { passive: true });
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchend', end); };
  }, []);
}
export function useStable<T extends (...a: never[]) => unknown>(fn: T): T {
  const r = useRef(fn); r.current = fn;
  return useCallback(((...a: never[]) => r.current(...a)) as T, []);
}
export function distanceLabel(m: number | null) {
  if (m == null) return null;
  return m >= 1000 ? `${(m / 1000).toFixed(1)} كم` : `${Math.round(m)} م`;
}

/** onChange for input/select/textarea that writes the string value. */
export function useInput(set: (v: string) => void) {
  return useCallback((e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(e.target.value), [set]);
}
export function useCheck(set: (v: boolean) => void) {
  return useCallback((e: ChangeEvent<HTMLInputElement>) => set(e.target.checked), [set]);
}
export function useRefetch(refetch: () => unknown) {
  return useCallback(() => { void refetch(); }, [refetch]);
}
/** Current timestamp refreshed once per minute (relative time labels). */
export function useMinuteTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  return now;
}
export const Chip = memo(function Chip({ value, label, active, onSelect, role, testId }: { value: string; label: string; active: boolean; onSelect: (v: string) => void; role?: string; testId?: string }) {
  const click = useCallback(() => onSelect(value), [onSelect, value]);
  return <button type="button" role={role} aria-selected={role ? active : undefined} aria-pressed={role ? undefined : active} className={`chip ${active ? 'on' : ''}`} onClick={click} data-testid={testId}>{label}</button>;
});
export const Act = memo(function Act({ id, onAct, className, children, disabled, testId, label }: { id: string; onAct: (id: string) => void; className: string; children: ReactNode; disabled?: boolean; testId?: string; label?: string }) {
  const click = useCallback(() => onAct(id), [onAct, id]);
  return <button type="button" className={className} onClick={click} disabled={disabled} data-testid={testId} aria-label={label}>{children}</button>;
});
export const SelectOption = memo(function SelectOption({ value, label }: { value: string | number; label: string }) {
  return <option value={value}>{label}</option>;
});
