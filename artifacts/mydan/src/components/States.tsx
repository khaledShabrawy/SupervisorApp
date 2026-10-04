import { AlertCircle } from 'lucide-react';

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return <div className="card col" role="alert" style={{ borderColor: 'var(--color-danger)' }}>
    <div className="row" style={{ color: 'var(--color-danger)' }}><AlertCircle /><span className="title">تعذر التحميل</span></div>
    <div className="muted">{error instanceof Error ? error.message : 'حدث خطأ.'}</div>
    <button className="btn ghost" onClick={onRetry}>إعادة المحاولة</button>
  </div>;
}
export function SkeletonList({ n = 4 }: { n?: number }) {
  return <div className="col" aria-busy="true" aria-label="جاري التحميل">
    {Array.from({ length: n }, (_, i) => <div key={i} className="card col"><div className="skel" style={{ width: '55%', height: 20 }} /><div className="skel" style={{ width: '85%' }} /></div>)}
  </div>;
}
export function LoadMore({ q }: { q: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown; isFetchNextPageError?: boolean } }) {
  if (!q.hasNextPage) return null;
  return <button className="btn ghost block" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
    {q.isFetchingNextPage ? 'جاري التحميل...' : q.isFetchNextPageError ? 'فشل التحميل، حاول مجددا' : 'عرض المزيد'}
  </button>;
}
