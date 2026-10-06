import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from '@/components/Icons';
import { t } from '@/i18n';

interface Props { children: ReactNode }
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="settings-error" role="alert" style={{ alignItems: 'center', textAlign: 'center' }}>
      <AlertTriangle size={56} color="var(--color-danger)" />
      <h1 style={{ margin: 0 }}>{t('حدث خطأ غير متوقع')}</h1>
      <p className="muted">{t('لم نتمكن من عرض هذه الشاشة. حاول مرة أخرى.')}</p>
      <button style={{ width: '100%' }} onClick={() => this.setState({ failed: false })}>{t('إعادة المحاولة')}</button>
      <button style={{ width: '100%' }} onClick={() => window.location.reload()}>{t('إعادة تحميل التطبيق')}</button>
    </div>;
  }
}
export default ErrorBoundary;
