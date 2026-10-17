import { memo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { type CompanyRow, useCompanies, useInviteSupervisor, useSaveCompany } from '@/lib/admin-data';
import { SCREENS, type ScreenKey } from '@/lib/permissions';
import { t } from '@/i18n';

/* ─── helpers ─── */
const trialExpiry = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
};

const EMPTY: Omit<CompanyRow, 'id'> = {
  name: '', name_en: null, license_type: 'trial',
  max_supervisors: 10, is_active: true, expires_at: trialExpiry(),
  country: null, city: null,
};

const LICENSE_TYPES = ['trial', 'basic', 'pro', 'enterprise'] as const;
const LICENSE_LABELS: Record<string, string> = {
  trial: 'تجربة مجانية (14 يوم)',
  basic: 'أساسي',
  pro: 'احترافي',
  enterprise: 'مؤسسي',
};

/* ─── Modal ─── */
function CompanyModal({ initial, onClose }: { initial: (CompanyRow & { id?: string }) | null; onClose: () => void }) {
  const [form, setForm] = useState<Omit<CompanyRow, 'id'> & { id?: string }>(
    initial ?? { ...EMPTY },
  );
  const save = useSaveCompany();

  const set = (k: keyof typeof form, v: string | number | boolean | null) =>
    setForm((p) => ({ ...p, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(form, { onSuccess: onClose });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2 className="modal-title">{form.id ? t('تعديل شركة') : t('إضافة شركة')}</h2>
        <form onSubmit={submit} className="form-grid">
          <label>{t('اسم الشركة (عربي)')} *
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </label>
          <label>{t('اسم الشركة (إنجليزي)')}
            <input value={form.name_en ?? ''} onChange={(e) => set('name_en', e.target.value || null)} />
          </label>
          <label>{t('نوع الترخيص')}
            <select value={form.license_type ?? 'trial'}
              onChange={(e) => {
                const lt = e.target.value;
                setForm((p) => ({
                  ...p, license_type: lt,
                  // Auto-fill expiry when switching to trial on a new company
                  expires_at: lt === 'trial' && !p.id ? trialExpiry() : p.expires_at,
                }));
              }}>
              {LICENSE_TYPES.map((l) => <option key={l} value={l}>{LICENSE_LABELS[l] ?? l}</option>)}
            </select>
          </label>
          <label>{t('عدد المشرفين الأقصى')}
            <input type="number" min={1} value={form.max_supervisors ?? 10}
              onChange={(e) => set('max_supervisors', Number(e.target.value))} />
          </label>
          <label>{t('تاريخ انتهاء الترخيص')}
            <input type="date" value={form.expires_at?.slice(0, 10) ?? ''}
              onChange={(e) => set('expires_at', e.target.value || null)} />
          </label>
          <label>{t('الدولة')}
            <input value={form.country ?? ''} onChange={(e) => set('country', e.target.value || null)} />
          </label>
          <label>{t('المدينة')}
            <input value={form.city ?? ''} onChange={(e) => set('city', e.target.value || null)} />
          </label>
          <label className="row gap-2 items-center">
            <input type="checkbox" checked={form.is_active}
              onChange={(e) => set('is_active', e.target.checked)} />
            {t('نشط')}
          </label>
          <div className="row gap-2 justify-end" style={{ gridColumn: '1/-1' }}>
            <button type="button" className="btn ghost" onClick={onClose}>{t('إلغاء')}</button>
            <button type="submit" className="btn primary" disabled={save.isPending}>
              {save.isPending ? t('جاري الحفظ...') : t('حفظ')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Invite Admin Modal ─── */
function InviteCompanyAdminModal({ company, onClose }: { company: CompanyRow; onClose: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const invite = useInviteSupervisor();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const defaultPerms = Object.fromEntries(SCREENS.map((s) => [s.key, true])) as Record<ScreenKey, boolean>;
    invite.mutate(
      {
        full_name: fullName,
        email,
        phone,
        role: 'admin',
        company_id: company.id,
        permissions: defaultPerms,
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h2 className="modal-title">{t('دعوة مدير للشركة: {name}', { name: company.name })}</h2>
        <p className="text-muted text-sm mb-3">
          {t('سيتم إنشاء حساب بصلاحية (مدير) مع منحه كافة الصلاحيات لإدارة الشركة.')}
        </p>
        <form onSubmit={submit} className="form-grid">
          <label>
            {t('الاسم الكامل')} *
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="مثال: أحمد محمد"
              required
            />
          </label>
          <label>
            {t('البريد الإلكتروني')} *
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@company.com"
              required
            />
          </label>
          <label>
            {t('رقم الهاتف')}
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01xxxxxxxxx"
            />
          </label>
          <div className="row gap-2 justify-end mt-2" style={{ gridColumn: '1/-1' }}>
            <button type="button" className="btn ghost" onClick={onClose} disabled={invite.isPending}>
              {t('إلغاء')}
            </button>
            <button type="submit" className="btn primary" disabled={invite.isPending}>
              {invite.isPending ? t('جاري الإرسال...') : t('إرسال الدعوة')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Row ─── */
const Row = memo(function Row({
  c,
  onEdit,
  onInviteAdmin,
}: {
  c: CompanyRow;
  onEdit: (c: CompanyRow) => void;
  onInviteAdmin: (c: CompanyRow) => void;
}) {
  return (
    <tr>
      <td>{c.name}{c.name_en ? <small style={{ display: 'block', color: '#6b7280' }}>{c.name_en}</small> : null}</td>
      <td>{LICENSE_LABELS[c.license_type ?? ''] ?? c.license_type ?? '—'}</td>
      <td>{c.max_supervisors ?? '—'}</td>
      <td>{c.expires_at ? new Date(c.expires_at).toLocaleDateString('ar-EG') : '—'}</td>
      <td>{c.country ?? '—'}{c.city ? `, ${c.city}` : ''}</td>
      <td>
        <span className={`badge ${c.is_active ? 'badge-success' : 'badge-danger'}`}>
          {c.is_active ? t('نشط') : t('معطل')}
        </span>
      </td>
      <td>
        <div className="row gap-1 items-center">
          <button
            type="button"
            className="btn sm primary"
            onClick={() => onInviteAdmin(c)}
            title={t('دعوة مدير لهذه الشركة')}
          >
            {t('+ دعوة مدير')}
          </button>
          <button type="button" className="btn sm ghost" onClick={() => onEdit(c)}>
            {t('تعديل')}
          </button>
        </div>
      </td>
    </tr>
  );
});

/* ─── Screen ─── */
export default function AdminCompanies() {
  const { supervisor } = useAuth();
  const { data, isLoading, error } = useCompanies();
  const [editing, setEditing] = useState<(CompanyRow & { id?: string }) | null | false>(false);
  const [invitingAdmin, setInvitingAdmin] = useState<CompanyRow | null>(null);

  if (supervisor?.role !== 'super_admin') {
    return <div className="adm-empty">{t('هذه الصفحة للمدير الأعلى فقط.')}</div>;
  }

  return (
    <section className="adm-section">
      <div className="adm-section-header">
        <h1>{t('الشركات')}</h1>
        <button className="btn primary" onClick={() => setEditing(null)}>{t('+ شركة جديدة')}</button>
      </div>

      {isLoading && <div className="adm-empty">{t('جاري التحميل...')}</div>}
      {error && <div className="adm-empty text-danger">{t('تعذر تحميل الشركات.')}</div>}

      {data && (
        <div className="table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('الشركة')}</th>
                <th>{t('الترخيص')}</th>
                <th>{t('الحد الأقصى')}</th>
                <th>{t('الانتهاء')}</th>
                <th>{t('الموقع')}</th>
                <th>{t('الحالة')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <Row key={c.id} c={c} onEdit={setEditing} onInviteAdmin={setInvitingAdmin} />
              ))}
              {!data.length && (
                <tr><td colSpan={7} className="adm-empty">{t('لا توجد شركات بعد.')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing !== false && (
        <CompanyModal initial={editing} onClose={() => setEditing(false)} />
      )}

      {invitingAdmin && (
        <InviteCompanyAdminModal company={invitingAdmin} onClose={() => setInvitingAdmin(null)} />
      )}
    </section>
  );
}
