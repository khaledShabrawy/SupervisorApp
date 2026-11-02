interface ConfirmState {
  open: boolean;
  message: string;
  resolve: ((v: boolean) => void) | null;
}

let state: ConfirmState = { open: false, message: '', resolve: null };
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export const subscribeConfirm = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getConfirmState = () => state;

export function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    state = { open: true, message, resolve };
    notify();
  });
}

export function resolveConfirm(value: boolean) {
  const { resolve } = state;
  state = { open: false, message: '', resolve: null };
  notify();
  resolve?.(value);
}
