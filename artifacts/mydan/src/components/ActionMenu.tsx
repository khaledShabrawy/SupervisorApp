import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from './Icons';

export interface ActionMenuItem {
  label: string;
  icon: ReactNode;
  onSelect(): void;
  disabled?: boolean;
  danger?: boolean;
}
/** Portalled so table overflow cannot clip actions; native buttons retain keyboard access. */
export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  useLayoutEffect(() => {
    if (!open || !trigger.current || !panel.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const height = panel.current.offsetHeight;
    const width = panel.current.offsetWidth;
    setPosition({
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      top: rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - height - 6),
    });
    panel.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismiss = () => setOpen(false);
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) close(); };
    const scroll = (event: Event) => {
      if (panel.current?.contains(event.target as Node) || !trigger.current || !panel.current) return;
      const rect = trigger.current.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) { dismiss(); return; }
      const { offsetHeight: height, offsetWidth: width } = panel.current;
      setPosition({ left: Math.max(8, Math.min(rect.right - width, innerWidth - width - 8)),
        top: rect.bottom + height + 8 <= innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - height - 6) });
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', dismiss);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', dismiss); };
  }, [open]);
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); close(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !buttons.length) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
      (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next]?.focus({ preventScroll: true });
  }
  return <>
    <button ref={trigger} type="button" className="btn sm ghost action-menu-trigger" aria-label={label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
      <MoreVertical size={18} />
    </button>
    {open && createPortal(<div ref={panel} id={id} role="menu" aria-label={label} className="action-menu-panel" style={position} onKeyDown={keyboard}>
      {items.map(item => <button type="button" role="menuitem" key={item.label} disabled={item.disabled}
        className={item.danger ? 'is-danger' : undefined} onClick={() => { close(); item.onSelect(); }}>
        {item.icon}<span>{item.label}</span>
      </button>)}
    </div>, document.body)}
  </>;
}
