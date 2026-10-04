type Kind = 'success' | 'error' | 'info';
export interface ToastItem { id: number; msg: string; kind: Kind }
let items: ToastItem[] = []; let seq = 0;
const subs = new Set<() => void>();
export const subscribeToasts = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getToasts = () => items;
export function notify(msg: string, kind: Kind = 'info') {
  const id = ++seq; items = [...items, { id, msg, kind }]; subs.forEach((f) => f());
  setTimeout(() => { items = items.filter((t) => t.id !== id); subs.forEach((f) => f()); }, 3000);
}
