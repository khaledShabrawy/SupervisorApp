import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, MapPin, RefreshCw, Trash2 } from '@/components/Icons';
import { useQueryClient } from '@tanstack/react-query';
import { useScope } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/toast';
import { LOCALE, t } from '@/i18n';
import {
  listOfflineObservations, removeOfflineObservations, saveOfflineObservation,
  type OfflineCompetitorObservation,
} from '@/lib/offline-field-data';

const AVAILABILITY: OfflineCompetitorObservation['availability'][] = ['in_stock', 'low_stock', 'out_of_stock', 'unknown'];
const POSITIONS: OfflineCompetitorObservation['shelf_position'][] = ['eye_level', 'top', 'bottom', 'checkout', 'end_cap', 'unknown'];
const availabilityLabel: Record<OfflineCompetitorObservation['availability'], string> = {
  in_stock: 'متوفر', low_stock: 'مخزون محدود', out_of_stock: 'غير متوفر', unknown: 'غير معروف',
};
const positionLabel: Record<OfflineCompetitorObservation['shelf_position'], string> = {
  eye_level: 'مستوى النظر', top: 'أعلى الرف', bottom: 'أسفل الرف', checkout: 'بجوار الكاشير', end_cap: 'نهاية الممر', unknown: 'غير محدد',
};
function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
function currentGps(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => resolve(null), { timeout: 5000, maximumAge: 30000 },
    );
  });
}

export default function CompetitorFieldSurvey({ visitId, customerId, outletName }: {
  visitId: string | null; customerId: string | null; outletName: string;
}) {
  const sc = useScope();
  const qc = useQueryClient();
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [pending, setPending] = useState<OfflineCompetitorObservation[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [outlet, setOutlet] = useState(outletName);
  const [competitor, setCompetitor] = useState('');
  const [brand, setBrand] = useState('');
  const [product, setProduct] = useState('');
  const [packSize, setPackSize] = useState('');
  const [price, setPrice] = useState('');
  const [promotion, setPromotion] = useState('');
  const [availability, setAvailability] = useState<OfflineCompetitorObservation['availability']>('unknown');
  const [position, setPosition] = useState<OfflineCompetitorObservation['shelf_position']>('unknown');
  const [notes, setNotes] = useState('');

  const refreshQueue = useCallback(async () => {
    try { setPending(await listOfflineObservations(sc.companyId, sc.supervisorId)); }
    catch { notify(t('تعذر فتح مساحة البيانات المحفوظة على الجهاز.'), 'error'); }
    finally { setLoadingQueue(false); }
  }, [sc.companyId, sc.supervisorId]);
  useEffect(() => {
    void refreshQueue();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [refreshQueue]);

  const saveLocal = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!competitor.trim() || !brand.trim()) { notify(t('أدخل اسم المنافس والعلامة التجارية.'), 'error'); return; }
    const amount = price.trim() ? Number(price) : null;
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) { notify(t('أدخل سعرًا صحيحًا.'), 'error'); return; }
    setSaving(true);
    try {
      const gps = await currentGps();
      await saveOfflineObservation({
        id: makeId(), company_id: sc.companyId, supervisor_id: sc.supervisorId,
        visit_id: visitId, customer_id: customerId, outlet_name: outlet.trim() || null,
        competitor_name: competitor.trim(), brand_name: brand.trim(), product_name: product.trim() || null,
        pack_size: packSize.trim() || null, price: amount, currency_code: 'EGP',
        promotion: promotion.trim() || null, availability, shelf_position: position,
        notes: notes.trim() || null, latitude: gps?.latitude ?? null, longitude: gps?.longitude ?? null,
        observed_at: new Date().toISOString(),
      });
      setCompetitor(''); setBrand(''); setProduct(''); setPackSize(''); setPrice(''); setPromotion('');
      setAvailability('unknown'); setPosition('unknown'); setNotes('');
      notify(t('حُفظ المسح على هذا الجهاز.'), 'success');
      await refreshQueue();
    } catch { notify(t('تعذر الحفظ على الجهاز. اترك الشاشة مفتوحة وحاول مرة أخرى.'), 'error'); }
    finally { setSaving(false); }
  }, [competitor, brand, price, sc.companyId, sc.supervisorId, visitId, customerId, outlet, product, packSize, promotion, availability, position, notes, refreshQueue]);

  const uploadPending = useCallback(async () => {
    if (!navigator.onLine) { notify(t('اتصل بالإنترنت قبل رفع البيانات.'), 'error'); return; }
    setUploading(true);
    let uploaded = 0;
    try {
      const queued = await listOfflineObservations(sc.companyId, sc.supervisorId);
      for (let start = 0; start < queued.length; start += 100) {
        const batch = queued.slice(start, start + 100);
        const { error } = await supabase.from('competitor_field_observations')
          .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
        if (error) throw error;
        const ids = batch.map(row => row.id);
        const { data, error: verifyError } = await supabase.from('competitor_field_observations')
          .select('id').eq('company_id', sc.companyId).eq('supervisor_id', sc.supervisorId).in('id', ids);
        if (verifyError) throw verifyError;
        const confirmed = new Set((data ?? []).map(row => row.id));
        if (ids.some(id => !confirmed.has(id))) throw new Error(t('لم يتأكد حفظ كل السجلات على الخادم.'));
        await removeOfflineObservations(ids);
        uploaded += ids.length;
        await refreshQueue();
      }
      if (uploaded) {
        notify(t('تم رفع {count} ملاحظة إلى الشركة.', { count: uploaded }), 'success');
        void qc.invalidateQueries({ queryKey: [...sc.base, 'competitor-field-insights'] });
      }
    } catch (error) {
      await refreshQueue();
      notify(t('تعذر رفع بعض البيانات. بقيت محفوظة على الجهاز للمحاولة مرة أخرى.'), 'error');
    } finally { setUploading(false); }
  }, [sc.companyId, sc.supervisorId, sc.base, refreshQueue, qc]);

  const removeLocal = useCallback(async (id: string) => {
    try { await removeOfflineObservations([id]); await refreshQueue(); }
    catch { notify(t('تعذر حذف المسح المحفوظ.'), 'error'); }
  }, [refreshQueue]);

  return <section className="col" style={{ gap: 10 }} aria-label={t('مسح منافس ميداني')}>
    <div className="card col" style={{ gap: 10 }}>
      <div className="row between"><strong className="title">{t('مسح منافس ميداني')}</strong><MapPin size={18} /></div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t('سجّل أسعار وعروض وتوفر المنافسين. تحفظ الملاحظات على الجهاز دون اتصال.')}</p>
      <form className="col" style={{ gap: 10 }} onSubmit={saveLocal}>
        <label className="f">{t('المنفذ أو المحل')}<input className="input" value={outlet} onChange={e => setOutlet(e.target.value)} placeholder={t('اسم المنفذ')} /></label>
        <label className="f">{t('اسم المنافس *')}<input className="input" required value={competitor} onChange={e => setCompetitor(e.target.value)} placeholder={t('مثال: شركة منافسة')} /></label>
        <div className="row" style={{ gap: 8 }}>
          <label className="f grow">{t('العلامة التجارية *')}<input className="input" required value={brand} onChange={e => setBrand(e.target.value)} /></label>
          <label className="f grow">{t('المنتج')}<input className="input" value={product} onChange={e => setProduct(e.target.value)} /></label>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <label className="f grow">{t('الحجم أو العبوة')}<input className="input" value={packSize} onChange={e => setPackSize(e.target.value)} placeholder={t('مثال: 100 جم')} /></label>
          <label className="f grow">{t('السعر (ج.م)')}<input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></label>
        </div>
        <label className="f">{t('العرض أو الخصم')}<input className="input" value={promotion} onChange={e => setPromotion(e.target.value)} placeholder={t('مثال: خصم 10٪ أو اشترِ 2 واحصل على 1')} /></label>
        <div className="row" style={{ gap: 8 }}>
          <label className="f grow">{t('التوفر')}<select className="input" value={availability} onChange={e => setAvailability(e.target.value as OfflineCompetitorObservation['availability'])}>
            {AVAILABILITY.map(value => <option key={value} value={value}>{t(availabilityLabel[value])}</option>)}
          </select></label>
          <label className="f grow">{t('موضع العرض')}<select className="input" value={position} onChange={e => setPosition(e.target.value as OfflineCompetitorObservation['shelf_position'])}>
            {POSITIONS.map(value => <option key={value} value={value}>{t(positionLabel[value])}</option>)}
          </select></label>
        </div>
        <label className="f">{t('ملاحظات')}<textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        <button className="btn success block" type="submit" disabled={saving} data-testid="button-save-offline-competitor">
          <CheckCircle2 size={18} /> {saving ? t('جاري الحفظ...') : t('احفظ على الجهاز')}
        </button>
      </form>
    </div>

    {(pending.length > 0 || loadingQueue) && <div className="card col" style={{ gap: 8 }}>
      <div className="row between"><strong>{t('بيانات تنتظر الرفع')}</strong><span className="badge b-blue">{pending.length}</span></div>
      {!online && <div className="alert warn">{t('لا يوجد اتصال الآن؛ ستبقى البيانات على الجهاز.')}</div>}
      {pending.slice(0, 5).map(row => <div key={row.id} className="row between" style={{ gap: 8 }}>
        <span className="muted" style={{ fontSize: 13, flex: 1 }}>{row.competitor_name} · {row.brand_name} · {row.outlet_name || t('منفذ غير محدد')}</span>
        <button type="button" className="icon-btn" aria-label={t('حذف المسح غير المرفوع')} onClick={() => void removeLocal(row.id)}><Trash2 size={16} /></button>
      </div>)}
      {pending.length > 5 && <span className="muted">{t('و {count} ملاحظات أخرى', { count: pending.length - 5 })}</span>}
      <button className="btn block" type="button" onClick={() => void uploadPending()} disabled={!online || uploading || !pending.length} data-testid="button-upload-offline-data">
        <RefreshCw size={18} className={uploading ? 's-spin' : ''} /> {uploading ? t('جاري رفع البيانات...') : t('رفع البيانات') + ' (' + pending.length + ')'}
      </button>
    </div>}
  </section>;
}
