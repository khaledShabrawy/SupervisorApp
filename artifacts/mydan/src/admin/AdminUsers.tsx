import { memo, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Key, Plus, RefreshCw, ShieldCheck, X } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSupervisors, useUpdateSupervisor } from '@/lib/data';
import {
  useBranches, useEditSupervisorProfile, useInviteSupervisor,
  useResendInvite, useSavePermissions, useSetUserPassword,
  useSupervisorPermissions, type InviteRole
} from '@/lib/admin-data';
import { SCREENS, isScreenAllowed, type ScreenKey } from '@/lib/permissions';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import EmptyState from '@/components/EmptyState';
import { ROLE } from '@/screens/AdminPanel';
import { useInput, useRefetch } from '@/screens/shared';
import type { Supervisor } from '@/types/database';
import { useResetDeviceBinding } from '@/lib/device-binding';
import { t } from '@/i18n';

type SortKey = 'full_name' | 'role' | 'is_active';
const INVITE_ROLES: InviteRole[] = ['supervisor', 'senior_supervisor', 'branch_manager', 'admin'];
const defaults = () => Object.fromEntries(SCREENS.map((s) => [s.key, s.byDefault])) as Record<ScreenKey, boolean>;

function Toggles({ values, onChange }: { values: Record<ScreenKey, boolean>; onChange: (k: ScreenKey, v: boolean) => void }) {
  return <div>{SCREENS.map((s) => <label key={s.key} className="adm-toggle">
    <span>{t(s.label)}</span>
    <input type="checkbox" checked={values[s.key]} onChange={(e) => onChange(s.key, e.target.checked)} data-testid={`perm-${s.key}`} />
  </label>)}</div>;
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const m = useInviteSupervisor(); const branches = useBranches();
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [role, setRole] = useState<InviteRole>('supervisor'); const [branch, setBranch] = useState('');
  const [perms, setPerms] = useState(defaults);
  const onEmail = useInput(setEmail); const onName = useInput(setName); const onPhone = useInput(setPhone); const onBranch = useInput(setBranch);
  const toggle = useCallback((k: ScreenKey, v: boolean) => setPerms((p) => ({ ...p, [k]: v })), []);
  const submit = useCallback((e: FormEvent) => {
    e.preventDefault();
    m.mutate({ email, full_name: name, phone, role, branch_id: branch, permissions: perms }, { onSuccess: onClose });
  }, [m, email, name, phone, role, branch, perms, onClose]);
  return <div className="adm-modal-bg" onClick={onClose}>
    <form className="adm-modal col" role="dialog" aria-modal="true" aria-label={t('دعوة مستخدم جديد')} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
      <div className="row between"><h2 style={{ margin: 0, fontSize: 18 }}>{t('دعوة مستخدم جديد')}</h2>
        <button type="button" className="icon-btn" aria-label={t('إغلاق')} onClick={onClose}><X /></button></div>
      <label className="f">{t('البريد الإلكتروني *')}<input className="input" type="email" dir="ltr" required value={email} onChange={onEmail} data-testid="input-invite-email" /></label>
      <label className="f">{t('الاسم بالكامل *')}<input className="input" required value={name} onChange={onName} /></label>
      <label className="f">{t('الهاتف')}<input className="input" dir="ltr" inputMode="tel" value={phone} onChange={onPhone} /></label>
      <div className="row">
        <label className="f grow">{t('الدور')}<select className="input" value={role} onChange={(e) => setRole(e.target.value as InviteRole)}>
          {INVITE_ROLES.map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</select></label>
        <label className="f grow">{t('الفرع')}<select className="input" value={branch} onChange={onBranch}>
          <option value="">{t('بدون فرع')}</option>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      </div>
      <div className="title" style={{ marginTop: 8 }}>{t('صلاحيات الشاشات')}</div>
      <Toggles values={perms} onChange={toggle} />
      <div className="muted" style={{ fontSize: 13 }}>{t('سيصل للمستخدم بريد دعوة لتعيين كلمة المرور.')}</div>
      <button className="btn" disabled={m.isPending} data-testid="button-send-invite">{m.isPending ? t('جاري الإرسال...') : t('إرسال الدعوة')}</button>
    </form>
  </div>;
}

function SetPasswordModal({ s, onClose }: { s: Supervisor; onClose: () => void }) {
  const m = useSetUserPassword();
  const [pw, setPw] = useState('');
  const [force, setForce] = useState(true);
  const submit = useCallback((e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return;
    m.mutate({ supervisorId: s.id, newPassword: pw, forceChange: force }, { onSuccess: onClose });
  }, [m, s.id, pw, force, onClose]);
  return <div className="adm-modal-bg" onClick={onClose}>
    <form className="adm-modal col" role="dialog" aria-modal="true" aria-label={t('تعيين كلمة المرور')} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
      <div className="row between">
        <h2 style={{ margin: 0, fontSize: 18 }}>{t('تعيين كلمة المرور: {name}', { name: s.full_name })}</h2>
        <button type="button" className="icon-btn" aria-label={t('إغلاق')} onClick={onClose}><X /></button>
      </div>
      <label className="f">{t('كلمة المرور الجديدة *')}
        <input className="input" type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t('8 أحرف على الأقل')} />
      </label>
      <label className="row" style={{ minHeight: 40, gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} style={{ width: 20, height: 20 }} />
        <span style={{ fontSize: 13 }}>{t('إجبار المستخدم على تغيير كلمة المرور عند أول تسجيل دخول')}</span>
      </label>
      <button className="btn" disabled={pw.length < 8 || m.isPending}>
        {m.isPending ? t('جاري الحفظ...') : t('حفظ كلمة المرور')}
      </button>
    </form>
  </div>;
}

function EditSupervisorModal({ s, onClose }: { s: Supervisor; onClose: () => void }) {
  const m = useEditSupervisorProfile(); const branches = useBranches();
  const [name, setName] = useState(s.full_name); const [phone, setPhone] = useState(s.phone ?? '');
  const [role, setRole] = useState<InviteRole>((['supervisor', 'senior_supervisor', 'branch_manager', 'admin'].includes(s.role) ? s.role : 'supervisor') as InviteRole);
  const [branch, setBranch] = useState(s.branch_id ?? '');
  const submit = useCallback((e: FormEvent) => {
    e.preventDefault();
    m.mutate({ id: s.id, full_name: name, phone, role, branch_id: branch }, { onSuccess: onClose });
  }, [m, s.id, name, phone, role, branch, onClose]);
  return <div className="adm-modal-bg" onClick={onClose}>
    <form className="adm-modal col" role="dialog" aria-modal="true" aria-label={t('تعديل بيانات المستخدم')} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
      <div className="row between"><h2 style={{ margin: 0, fontSize: 18 }}>{t('تعديل بيانات المستخدم')}</h2>
        <button type="button" className="icon-btn" aria-label={t('إغلاق')} onClick={onClose}><X /></button></div>
      <label className="f">{t('الاسم بالكامل *')}<input className="input" required value={name} onChange={useInput(setName)} /></label>
      <label className="f">{t('الهاتف')}<input className="input" dir="ltr" inputMode="tel" value={phone} onChange={useInput(setPhone)} /></label>
      <div className="row">
        <label className="f grow">{t('الدور')}<select className="input" value={role} onChange={(e) => setRole(e.target.value as InviteRole)}>
          {INVITE_ROLES.map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</select></label>
        <label className="f grow">{t('الفرع')}<select className="input" value={branch} onChange={useInput(setBranch)}>
          <option value="">{t('بدون فرع')}</option>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      </div>
      <button className="btn" disabled={m.isPending}>{m.isPending ? t('جاري الحفظ...') : t('حفظ')}</button>
    </form>
  </div>;
}

function PermissionsDrawer({ s, onClose }: { s: Supervisor; onClose: () => void }) {
  const q = useSupervisorPermissions(s.id); const m = useSavePermissions(); const retry = useRefetch(q.refetch);
  const [overrides, setOverrides] = useState<Partial<Record<ScreenKey, boolean>>>({});
  const initialValues = useMemo(() => {
    if (!q.data) return null;
    return Object.fromEntries(SCREENS.map((x) => [x.key, isScreenAllowed(q.data, x.key)])) as Record<ScreenKey, boolean>;
  }, [q.data]);
  const values = useMemo(() => (initialValues ? { ...initialValues, ...overrides } : null), [initialValues, overrides]);
  const toggle = useCallback((k: ScreenKey, v: boolean) => setOverrides((p) => ({ ...p, [k]: v })), []);
  const save = useCallback(() => { if (values) m.mutate({ supervisorId: s.id, values }, { onSuccess: onClose }); }, [m, s.id, values, onClose]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <>
    <div className="adm-modal-bg" onClick={onClose} />
    <aside className="adm-drawer col" role="dialog" aria-modal="true" aria-label={t('صلاحيات {name}', { name: s.full_name })}>
      <div className="row between"><h2 style={{ margin: 0, fontSize: 18 }}>{t('صلاحيات {name}', { name: s.full_name })}</h2>
        <button className="icon-btn" aria-label={t('إغلاق')} onClick={onClose}><X /></button></div>
      {q.isPending || !values ? q.isError ? <ErrorState error={q.error} onRetry={retry} /> : <SkeletonList n={3} />
        : <><Toggles values={values} onChange={toggle} />
          <button className="btn" disabled={m.isPending} onClick={save} data-testid="button-save-permissions">{m.isPending ? t('جاري الحفظ...') : t('حفظ الصلاحيات')}</button></>}
    </aside>
  </>;
}

const Row = memo(function Row({
  s, self, branch, onPatch, onPerms, onEdit, onSetPw, onResend, resending,
  onResetDevice, resettingDevice
}: {
  s: Supervisor; self: boolean; branch: string;
  onPatch: (s: Supervisor, p: { is_active?: boolean; role?: 'admin' | 'supervisor' }) => void;
  onPerms: (s: Supervisor) => void; onEdit: (s: Supervisor) => void;
  onSetPw: (s: Supervisor) => void; onResend: (s: Supervisor) => void; resending: boolean;
  onResetDevice: (s: Supervisor) => void; resettingDevice: boolean;
}) {
  const locked = self || s.role === 'super_admin';
  const toggle = useCallback(() => {
    if (!s.is_active || window.confirm(t('تعطيل حساب {name}؟', { name: s.full_name }))) onPatch(s, { is_active: !s.is_active });
  }, [s, onPatch]);

  return <tr data-testid={`row-supervisor-${s.id}`}>
    <td>
      <div className="title">{s.full_name}{self && t(' (أنت)')}</div>
      <div className="muted" dir="ltr" style={{ textAlign: 'start', fontSize: 12 }}>{s.phone ?? '—'}</div>
    </td>
    <td>{branch}</td>
    <td><span className="badge b-gray"><ShieldCheck size={14} /> {ROLE[s.role] ?? s.role}</span></td>
    <td>
      {s.device_id ? (
        <div className="row gap-1 items-center" style={{ flexWrap: 'wrap' }}>
          <span className="badge b-blue" title={s.device_id} style={{ fontSize: 11 }}>
            📱 {t('مقترن')}
          </span>
          {!locked && (
            <button
              type="button"
              className="btn sm ghost danger"
              style={{ fontSize: 11, padding: '2px 6px' }}
              onClick={() => onResetDevice(s)}
              disabled={resettingDevice}
              title={t('إلغاء اقتران هذا الجهاز ليتمكن المشرف من ربط هاتف جديد')}
            >
              {t('إلغاء الربط')}
            </button>
          )}
        </div>
      ) : (
        <span className="muted" style={{ fontSize: 12 }}>{t('غير مقترن')}</span>
      )}
    </td>
    <td><span className={`badge ${s.is_active ? 'b-green' : 'b-red'}`}>{s.is_active ? t('نشط') : t('معطل')}</span></td>
    <td>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <button className="btn sm ghost" onClick={() => onSetPw(s)} title={t('تعيين كلمة المرور يدوياً')}>
          <Key size={14} /> {t('الباسورد')}
        </button>
        <button className="btn sm ghost" onClick={() => onResend(s)} disabled={resending} title={t('إعادة إرسال رابط التفعيل والدعوة')}>
          <RefreshCw size={14} /> {t('إعادة الرابط')}
        </button>
        {!locked && <button className="btn sm ghost" onClick={() => onEdit(s)}>{t('تعديل')}</button>}
        {!locked && <button className={`btn sm ${s.is_active ? 'danger-ghost' : 'success'}`} onClick={toggle}>{s.is_active ? t('تعطيل') : t('تفعيل')}</button>}
        {!['admin', 'super_admin'].includes(s.role) && <button className="btn sm ghost" onClick={() => onPerms(s)} data-testid={`button-perms-${s.id}`}>{t('الصلاحيات')}</button>}
      </div>
    </td>
  </tr>;
});

export default function AdminUsers() {
  const { supervisor } = useAuth();
  const q = useSupervisors();
  const branches = useBranches();
  const m = useUpdateSupervisor();
  const resend = useResendInvite();
  const retry = useRefetch(q.refetch);

  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'full_name', asc: true });
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [invite, setInvite] = useState(false);
  const [perms, setPerms] = useState<Supervisor | null>(null);
  const [editing, setEditing] = useState<Supervisor | null>(null);
  const [pwTarget, setPwTarget] = useState<Supervisor | null>(null);

  const mutate = m.mutate;
  const onPatch = useCallback((target: Supervisor, patch: { is_active?: boolean; role?: 'admin' | 'supervisor' }) => mutate({ target, patch }), [mutate]);
  const branchName = useMemo(() => new Map(branches.data?.map((b) => [b.id, b.name]) ?? []), [branches.data]);

  const onResend = useCallback((target: Supervisor) => {
    if (window.confirm(t('إعادة إرسال رابط الدعوة إلى بريد {name}؟', { name: target.full_name }))) {
      resend.mutate(target.id);
    }
  }, [resend]);

  // Scoping: branch_managers only see their branch
  const effectiveBranchFilter = supervisor?.role === 'branch_manager' && supervisor.branch_id
    ? supervisor.branch_id
    : branchFilter;

  const rows = useMemo(() => {
    let list = [...q.items];
    if (effectiveBranchFilter !== 'all') {
      list = list.filter((s) => s.branch_id === effectiveBranchFilter);
    }
    if (statusFilter === 'active') {
      list = list.filter((s) => s.is_active);
    } else if (statusFilter === 'inactive') {
      list = list.filter((s) => !s.is_active);
    }
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter((s) => s.full_name.toLowerCase().includes(term) || (s.phone && s.phone.includes(term)));
    }
    return list.sort((a, b) => {
      const x = String(a[sort.key]), y = String(b[sort.key]);
      return (sort.asc ? 1 : -1) * x.localeCompare(y, 'ar');
    });
  }, [q.items, sort, effectiveBranchFilter, statusFilter, search]);

  const th = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.asc ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}>
        {label}{sort.key === key ? (sort.asc ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );

  const closeInvite = useCallback(() => setInvite(false), []);
  const closePerms = useCallback(() => setPerms(null), []);
  const closeEdit = useCallback(() => setEditing(null), []);
  const closePw = useCallback(() => setPwTarget(null), []);

  const resetDevice = useResetDeviceBinding();
  const onResetDevice = useCallback((target: Supervisor) => {
    if (window.confirm(t('إلغاء ارتباط جهاز المشرف {name}؟ سيتمكن من ربط جهاز جديد عند تسجيل الدخول القادم.', { name: target.full_name }))) {
      resetDevice.mutate(target.id);
    }
  }, [resetDevice]);

  return <>
    <div className="row between">
      <div>
        <h2 style={{ margin: 0 }}>{t('المستخدمين')}</h2>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          {t('إدارة حسابات المشرفين والمدراء، الفروع، الصلاحيات، وتعيين كلمات المرور.')}
        </p>
      </div>
      <button className="btn" onClick={() => setInvite(true)} data-testid="button-invite">
        <Plus size={18} /> {t('دعوة مستخدم جديد')}
      </button>
    </div>

    {/* Filters Toolbar */}
    <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
      {supervisor?.role !== 'branch_manager' && (
        <select
          className="input"
          style={{ width: 180 }}
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
        >
          <option value="all">{t('كل الفروع')}</option>
          {branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}

      <select
        className="input"
        style={{ width: 160 }}
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
      >
        <option value="all">{t('كل الحالات')}</option>
        <option value="active">{t('النشط فقط')}</option>
        <option value="inactive">{t('المعطل فقط')}</option>
      </select>

      <input
        className="input grow"
        placeholder={t('بحث بالاسم أو الهاتف...')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {(branchFilter !== 'all' || statusFilter !== 'all' || search) && (
        <button className="btn sm ghost" onClick={() => { setBranchFilter('all'); setStatusFilter('all'); setSearch(''); }}>
          {t('إعادة ضبط')}
        </button>
      )}
    </div>

    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : rows.length === 0 ? <EmptyState icon={<ShieldCheck />} title={t('لا يوجد مستخدمون')} />
      : <div className="adm-table-wrap" style={{ marginTop: 12 }}>
          <table className="adm-table">
            <thead>
              <tr>
                {th('full_name', t('الاسم'))}
                <th>{t('الفرع')}</th>
                {th('role', t('الدور'))}
                <th>{t('جهاز العمل')}</th>
                {th('is_active', t('الحالة'))}
                <th>{t('إجراءات')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <Row
                  key={s.id}
                  s={s}
                  self={s.id === supervisor?.id}
                  branch={(s.branch_id && branchName.get(s.branch_id)) || '—'}
                  onPatch={onPatch}
                  onPerms={setPerms}
                  onEdit={setEditing}
                  onSetPw={setPwTarget}
                  onResend={onResend}
                  resending={resend.isPending}
                  onResetDevice={onResetDevice}
                  resettingDevice={resetDevice.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>}

    <LoadMore q={q} />
    {invite && <InviteModal onClose={closeInvite} />}
    {editing && <EditSupervisorModal s={editing} onClose={closeEdit} />}
    {perms && <PermissionsDrawer s={perms} onClose={closePerms} />}
    {pwTarget && <SetPasswordModal s={pwTarget} onClose={closePw} />}
  </>;
}
