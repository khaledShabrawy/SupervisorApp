import { forwardRef, type ComponentProps, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

export type ToastProps = HTMLAttributes<HTMLDivElement> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: 'default' | 'destructive';
  duration?: number;
};
export const Toast = forwardRef<HTMLDivElement, ToastProps>(
  function Toast({ open = true, onOpenChange: _change, variant = 'default', duration: _duration, className, ...props }, ref) {
    if (!open) return null;
    return <div ref={ref} role="status" className={cn('toast', variant === 'destructive' && 'error', className)} {...props} />;
  },
);
export const ToastAction = forwardRef<HTMLButtonElement, ComponentProps<'button'> & { altText: string }>(
  function ToastAction({ altText, ...props }, ref) {
    return <button ref={ref} aria-label={altText} {...props} />;
  },
);
export type ToastActionElement = ReactElement<ComponentProps<typeof ToastAction>>;
export function ToastProvider({ children }: { children: ReactNode }) { return <>{children}</>; }
export const ToastViewport = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ToastViewport(props, ref) { return <div ref={ref} aria-live="polite" {...props} />; },
);
export function ToastTitle(props: HTMLAttributes<HTMLHeadingElement>) { return <h3 {...props} />; }
export function ToastDescription(props: HTMLAttributes<HTMLParagraphElement>) { return <p {...props} />; }
export function ToastClose(props: ComponentProps<'button'>) { return <button aria-label={t('إغلاق')} {...props}>×</button>; }