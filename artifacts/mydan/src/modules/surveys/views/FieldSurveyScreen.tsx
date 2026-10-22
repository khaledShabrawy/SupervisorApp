import { memo, useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, CheckCircle2, MapPin, RefreshCw, Save, ScanSearch, Store, Trash2 } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/hooks/useRealtime';
import { useScreenAllowed } from '@/lib/permissions';
import { PageTitle } from '@/components/Layout';
import { notify } from '@/lib/toast';
import { t } from '@/i18n';
import {
  useUploadSurveyPhoto, useRequestSurveyAnalysis, useSurveyResult, useSaveProspects,
  type DiscoveredStore, type FieldSurvey,
} from '@/lib/screen-survey';

// Reuse the same compressImage from shelf audit
async function compressImage(file: File, maxPx = 1200, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        },
        'image/jpeg', quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function getGps(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 30000 },
    );
  });
}

const SIZE_LABEL: Record<string, string> = {
  small: t('صغير'), medium: t('متوسط'), large: t('كبير'),
};

function SurveyRealtime({ id, onChange }: { id: string; onChange: () => void }) {
  useRealtime('field_surveys', `id=eq.${id}`, onChange);
  return null;
}

const StoreCard = memo(function StoreCard({
  store, index, onUpdate, onRemove,
}: {
  store: DiscoveredStore & { name: string; type: string };
  index: number;
  onUpdate: (i: number, field: 'name' | 'type', value: string) => void;
  onRemove: (i: number) => void;
}) {
  const TYPES = ['بقالة', 'سوبرماركت', 'هايبرماركت', 'كيوسك', 'محل جملة', 'ضيافة', 'أخرى'];
  return (
    <div className="card col" style={{ gap: 8, padding: '12px 16px' }}>
      <div className="row between" style={{ gap: 8 }}>
        <span className="badge b-blue" style={{ minWidth: 28, textAlign: 'center' }}>{index + 1}</span>
        <Store size={16} style={{ flexShrink: 0 }} />
        <span className="muted" style={{ fontSize: 12, flex: 1 }}>{store.position_note}</span>
        <span className="badge b-gray">{SIZE_LABEL[store.estimated_size] ?? store.estimated_size}</span>
        <button
          className="icon-btn" style={{ color: 'var(--color-danger)' }}
          aria-label={t('حذف')} onClick={() => onRemove(index)}
        ><Trash2 size={16} /></button>
      </div>
      <input
        className="input" dir="auto" value={store.name}
        placeholder={t('اسم المحل')}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onUpdate(index, 'name', e.target.value)}
      />
      <select className="input" value={store.type}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onUpdate(index, 'type', e.target.value)}>
        {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );
});

export default function FieldSurveyScreen() {
  const { supervisor } = useAuth();
  const allowed = useScreenAllowed('field_survey');
  if (!allowed) return (
    <div className="page" aria-label={t('مسح ميداني')}>
      <PageTitle>{t('مسح ميداني')}</PageTitle>
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <span style={{ color: 'var(--color-danger,#EF4444)', fontSize: 15 }}>
          ⛔ {t('ليس لديك صلاحية الوصول لهذه الشاشة. تواصل مع المدير.')}
        </span>
      </div>
    </div>
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);
  const [stores, setStores] = useState<(DiscoveredStore & { name: string; type: string })[]>([]);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useUploadSurveyPhoto();
  const request = useRequestSurveyAnalysis();
  const result = useSurveyResult(surveyId);
  const save = useSaveProspects();

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // Populate stores when result arrives
  useEffect(() => {
    if (result.data?.status === 'completed' && result.data.ai_raw_result?.stores) {
      setStores(result.data.ai_raw_result.stores.map(s => ({ ...s })));
    }
  }, [result.data]);

  const refetch = useCallback(() => void result.refetch(), [result]);

  const pickPhoto = useCallback(() => inputRef.current?.click(), []);
  const onFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0];
    if (!raw) return;
    const compressed = await compressImage(raw);
    setFile(compressed);
    // Grab GPS in parallel
    setGpsLoading(true);
    getGps().then(pos => { setGps(pos); setGpsLoading(false); });
  }, []);

  const analyze = useCallback(async () => {
    if (!file) return;
    setSaved(false); setRequestFailed(false);
    try {
      const survey = await upload.mutateAsync({ file, latitude: gps?.lat ?? null, longitude: gps?.lng ?? null });
      setSurveyId(survey.id);
      setFile(null);
      await request.mutateAsync(survey);
    } catch { setRequestFailed(true); }
  }, [file, gps, upload, request]);

  const retry = useCallback(() => {
    if (!result.data) return;
    setRequestFailed(false);
    request.mutate(result.data, { onError: () => setRequestFailed(true) });
  }, [result.data, request]);

  const reset = useCallback(() => {
    setSurveyId(null); setFile(null); setPreview(null);
    setGps(null); setStores([]); setSaved(false); setRequestFailed(false);
  }, []);

  const updateStore = useCallback((i: number, field: 'name' | 'type', value: string) => {
    setStores(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }, []);
  const removeStore = useCallback((i: number) => {
    setStores(prev => prev.filter((_, idx) => idx !== i));
  }, []);

  const confirmSave = useCallback(async () => {
    if (!result.data || !stores.length) return;
    try {
      await save.mutateAsync({ survey: result.data, stores });
      setSaved(true);
    } catch { /* surfaced by hook */ }
  }, [result.data, stores, save]);

  const survey = result.data;
  const status = survey?.status;
  const busy = upload.isPending || request.isPending;
  const inFlight = !!surveyId && (status === 'pending' || status === 'processing') && !requestFailed;
  const step = saved ? 4 : status === 'completed' ? 3 : surveyId || file ? 2 : 1;

  const StepBar = () => (
    <div className="s-steps" aria-label={t('الخطوات')}>
      {[t('الصورة'), t('التحليل'), t('المراجعة'), t('الحفظ')].map((label, i) => (
        <div key={label} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>
          {i + 1}. {label}
        </div>
      ))}
    </div>
  );

  return (
    <div className="page" aria-label={t('المسح الميداني')}>
      {surveyId && <SurveyRealtime id={surveyId} onChange={refetch} />}
      <PageTitle>{t('مسح ميداني')}</PageTitle>
      <StepBar />

      {/* Step 1 — Camera */}
      {!surveyId && (
        <div className="card col">
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            {t('صوّر صفاً من المحلات والكيوسكات ليكتشف الذكاء الاصطناعي العملاء المحتملين تلقائياً.')}
          </p>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
          {preview && (
            <img src={preview} alt={t('معاينة الصورة')} loading="lazy"
              style={{ width: '100%', borderRadius: 12, maxHeight: 280, objectFit: 'cover' }} />
          )}
          {gpsLoading && <div className="muted" style={{ fontSize: 12 }}><MapPin size={12} /> {t('جاري تحديد الموقع...')}</div>}
          {gps && !gpsLoading && (
            <div className="muted" style={{ fontSize: 12, color: 'var(--color-success)' }}>
              <MapPin size={12} /> {t('الموقع محدد')} ({gps.lat.toFixed(5)}, {gps.lng.toFixed(5)})
            </div>
          )}
          {!gps && !gpsLoading && file && (
            <div className="muted" style={{ fontSize: 12, color: 'var(--color-warning, #F59E0B)' }}>
              <MapPin size={12} /> {t('الموقع غير متوفر — سيُحفظ العملاء بدون إحداثيات')}
            </div>
          )}
          <button className="btn ghost" onClick={pickPhoto} data-testid="button-camera">
            <Camera /> {file ? t('إعادة الالتقاط') : t('التقط صورة الصف')}
          </button>
          {file && (
            <button className="btn" disabled={busy} onClick={analyze} data-testid="button-analyze">
              <ScanSearch /> {busy ? t('جاري المعالجة...') : t('اكتشف العملاء بالذكاء الاصطناعي')}
            </button>
          )}
        </div>
      )}

      {/* Step 2 — Processing */}
      {surveyId && step === 2 && (
        <div className="card col">
          {result.isError && (
            <div className="alert err">{t('تعذر تحميل نتيجة المسح.')}</div>
          )}
          {status === 'failed' || requestFailed ? (
            <>
              <div className="alert err">{t('فشل تحليل الصورة.')}</div>
              <button className="btn" disabled={request.isPending} onClick={retry}>
                <RefreshCw /> {t('إعادة المحاولة')}
              </button>
            </>
          ) : (
            <div className="s-wait" role="status">
              <span className="s-pulse" />
              {t('جاري اكتشاف المحلات...')}
            </div>
          )}
          {inFlight && survey?.photo_url && (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              {t('يتم تحليل الصورة عبر الذكاء الاصطناعي. هذا قد يستغرق 15-30 ثانية.')}
            </p>
          )}
          <button className="btn ghost" onClick={reset}>{t('بدء مسح جديد')}</button>
        </div>
      )}

      {/* Step 3 — Review & Edit */}
      {step === 3 && survey && !saved && (
        <div className="col" style={{ gap: 12 }}>
          <div className="card col" style={{ gap: 6 }}>
            <div className="row between">
              <span className="title">{t('المحلات المكتشفة')}</span>
              <span className="badge b-blue">{stores.length}</span>
            </div>
            {survey.ai_raw_result?.summary_ar && (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>{survey.ai_raw_result.summary_ar}</p>
            )}
            {stores.length === 0 && (
              <div className="alert warn">{t('لم يُكتشف أي محل في الصورة. جرّب صورة أوضح.')}</div>
            )}
          </div>
          {stores.map((s, i) => (
            <StoreCard key={i} store={s} index={i} onUpdate={updateStore} onRemove={removeStore} />
          ))}
          {stores.length > 0 && (
            <button className="btn success" disabled={save.isPending} onClick={confirmSave} data-testid="button-save-prospects">
              <Save /> {save.isPending ? t('جاري الحفظ...') : t('احفظ {count} عميل محتمل', { count: stores.length })}
            </button>
          )}
          <button className="btn ghost" onClick={reset}>{t('بدء مسح جديد')}</button>
        </div>
      )}

      {/* Step 4 — Done */}
      {saved && (
        <div className="card col" style={{ alignItems: 'center', gap: 16 }}>
          <CheckCircle2 size={56} color="var(--color-success)" />
          <h3 style={{ margin: 0 }}>{t('تم الحفظ بنجاح!')}</h3>
          <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
            {t('العملاء المحتملون محفوظون. يمكن للمدير مراجعتهم وتحويلهم لعملاء نشطين.')}
          </p>
          <button className="btn" onClick={reset}><Camera /> {t('مسح ميداني جديد')}</button>
        </div>
      )}
    </div>
  );
}
