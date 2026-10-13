import { useMemo, useState } from 'react';
import { useMemo, useState } from 'react';
import { Search, ScanSearch, MapPin, RefreshCw } from '@/components/Icons';
import { useQuery } from '@tanstack/react-query';
import { useScope } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { fmtDate, num } from '@/lib/format';
import { LOCALE, t } from '@/i18n';
import { ErrorState } from '@/components/States';
import EmptyState from '@/components/EmptyState';
import { PageTitle } from '@/components/Layout';

type Observation = {
  id: string; competitor_name: string; brand_name: string; product_name: string | null;
  pack_size: string | null; price: number | string | null; currency_code: string;
  promotion: string | null; availability: string; shelf_position: string;
  outlet_name: string | null; latitude: number | null; longitude: number | null;
  observed_at: string; notes: string | null;
};
const availabilityLabels: Record<string, string> = {
  in_stock: 'متوفر', low_stock: 'مخزون محدود', out_of_stock: 'غير متوفر', unknown: 'غير معروف',
};

export default function AdminCompetitorInsights() {
  const sc = useScope();
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: [...sc.base, 'competitor-field-insights'], staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const { data, error } = await supabase.from('competitor_field_observations')
        .select('id,competitor_name,brand_name,product_name,pack_size,price,currency_code,promotion,availability,shelf_position,outlet_name,latitude,longitude,observed_at,notes')
        .eq('company_id', sc.companyId).gte('observed_at', since.toISOString())
        .order('observed_at', { ascending: false }).limit(1000).abortSignal(signal);
      if (error) throw new Error(t('تعذر تحميل رصد المنافسين. تأكد من تطبيق ترحيل قاعدة البيانات.'));
      return (data ?? []) as Observation[];
    },
  });
  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    if (!q) return query.data ?? [];
    return (query.data ?? []).filter(row => [row.competitor_name, row.brand_name, row.product_name, row.outlet_name]
      .some(value => value?.toLocaleLowerCase().includes(q)));
  }, [query.data, search]);
  const rows = query.data ?? [];
  const prices = rows.map(row => Number(row.price)).filter(value => Number.isFinite(value) && value >= 0);
  const average = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null;
  const competitors = new Set(rows.map(row => row.competitor_name)).size;
  const promos = rows.filter(row => !!row.promotion?.trim()).length;
  const outOfStock = rows.filter(row => row.availability === 'out_of_stock').length;
  const money = (value: number | null) => value == null ? '—' : new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 }).format(value);
  const retry = () => { void query.refetch(); };

  return <div className="adm-page">
    <PageTitle action={<span className="muted">{t('آخر 30 يومًا')}</span>}>{t('رصد المنافسين')}</PageTitle>
    <div className="adm-kpis">
      <div className="adm-kpi"><span>{t('المسوح الميدانية')}</span><strong>{query.isPending ? '—' : num(rows.length)}</strong></div>
      <div className="adm-kpi"><span>{t('المنافسون')}</span><strong>{query.isPending ? '—' : num(competitors)}</strong></div>
      <div className="adm-kpi"><span>{t('متوسط السعر المرصود')}</span><strong>{query.isPending ? '—' : money(average)}</strong></div>
      <div className="adm-kpi"><span>{t('عروض مسجلة')}</span><strong>{query.isPending ? '—' : num(promos)}</strong></div>
      <div className="adm-kpi"><span>{t('حالات غير متوفر')}</span><strong>{query.isPending ? '—' : num(outOfStock)}</strong></div>
    </div>
    <div className="adm-card">
      <label className="adm-search"><Search size={18} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('ابحث باسم المنافس أو العلامة أو المنتج')} /></label>
      {query.isPending ? <div className="adm-loading">{t('جاري التحميل...')}</div>
        : query.isError ? <ErrorState error={query.error} onRetry={retry} />
          : visible.length === 0 ? <EmptyState icon={<ScanSearch />} title={t('لا توجد بيانات منافسين بعد')} text={t('سجّل مسوحًا ميدانية لتظهر مؤشرات التسويق هنا.')} />
            : <div className="adm-table-wrap"><table className="adm-table"><thead><tr>
              <th>{t('المنافس')}</th><th>{t('العلامة التجارية')}</th><th>{t('المنتج')}</th><th>{t('السعر')}</th><th>{t('التوفر')}</th><th>{t('العرض')}</th><th>{t('المنفذ')}</th><th>{t('تاريخ الرصد')}</th>
            </tr></thead><tbody>{visible.map(row => <tr key={row.id}>
              <td>{row.competitor_name}</td><td>{row.brand_name}</td><td>{[row.product_name, row.pack_size].filter(Boolean).join(' · ') || '—'}</td>
              <td>{row.price == null ? '—' : money(Number(row.price))}</td>
              <td>{t(availabilityLabels[row.availability] ?? 'غير معروف')}</td><td>{row.promotion || '—'}</td>
              <td>{row.latitude != null && row.longitude != null
                ? <a href={'https://maps.google.com/?q=' + row.latitude + ',' + row.longitude} target="_blank" rel="noreferrer" title={row.outlet_name ?? t('الموقع')}><MapPin size={14} /> {row.outlet_name ?? t('عرض الموقع')}</a>
                : row.outlet_name ?? '—'}</td>
              <td>{fmtDate(row.observed_at)}</td>
            </tr>)}</tbody></table></div>}
      {query.data && query.data.length >= 1000 && <p className="muted">{t('تعرض أحدث 1000 ملاحظة خلال 30 يومًا.')}</p>}
      <button className="btn sm ghost" type="button" onClick={retry} disabled={query.isFetching}><RefreshCw size={16} className={query.isFetching ? 's-spin' : ''} />{t('تحديث البيانات')}</button>
    </div>
  </div>;
}
