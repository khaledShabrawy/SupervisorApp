import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from '@/components/Icons';

interface Props { children: ReactNode }
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="settings-error" role="alert" style={{ alignItems: 'center', textAlign: 'center' }}>
      <AlertTriangle size={56} color="var(--color-danger)" />
      <h1 style={{ margin: 0 }}>حدث خطأ غير متوقع</h1>
      <p className="muted">لم نتمكن من عرض هذه الشاشة. حاول مرة أخرى.</p>
      <button style={{ width: '100%' }} onClick={() => this.setState({ failed: false })}>إعادة المحاولة</button>
      <button style={{ width: '100%' }} onClick={() => window.location.reload()}>إعادة تحميل التطبيق</button>
    </div>;
  }
}
export default ErrorBoundary;
