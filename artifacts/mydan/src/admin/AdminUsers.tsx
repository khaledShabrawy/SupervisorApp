import { memo, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, ShieldCheck, X } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSupervisors, useUpdateSupervisor } from '@/lib/data';
import { useBranches, useInviteSupervisor, useSavePermissions, useSupervisorPermissions, type InviteRole } from '@/lib/admin-data';
import { SCREENS, isScreenAllowed, type ScreenKey } from '@/lib/permissions';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import EmptyState from '@/components/EmptyState';
import { ROLE } from '@/screens/AdminPanel';
import { useInput, useRefetch } from '@/screens/shared';
import type { Supervisor } from '@/types/database';
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
    <form className="adm-modal col" role="dialog" aria-modal="true" aria-label={t('دعوة مشرف جديد')} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
      <div className="row between"><h2 style={{ margin: 0, fontSize: 18 }}>{t('دعوة مشرف جديد')}</h2>
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
      <div className="muted" style={{ fontSize: 13 }}>{t('سيصل للمشرف بريد دعوة لتعيين كلمة المرور. لا يتم إنشاء كلمة مرور من لوحة الإدارة.')}</div>
      <button className="btn" disabled={m.isPending} data-testid="button-send-invite">{m.isPending ? t('جاري الإرسال...') : t('إرسال الدعوة')}</button>
    </form>
  </div>;
}

function PermissionsDrawer({ s, onClose }: { s: Supervisor; onClose: () => void }) {
  const q = useSupervisorPermissions(s.id); const m = useSavePermissions(); const retry = useRefetch(q.refetch);
  const [values, setValues] = useState<Record<ScreenKey, boolean> | null>(null);
  // Without a row the screen is allowed (see isScreenAllowed), so show that as "on".
  useEffect(() => { if (q.data) setValues(Object.fromEntries(SCREENS.map((x) => [x.key, isScreenAllowed(q.data, x.key)])) as Record<ScreenKey, boolean>); }, [q.data]);
  const toggle = useCallback((k: ScreenKey, v: boolean) => setValues((p) => p && ({ ...p, [k]: v })), []);
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

const Row = memo(function Row({ s, self, branch, onPatch, onPerms }: { s: Supervisor; self: boolean; branch: string;
  onPatch: (s: Supervisor, p: { is_active?: boolean; role?: 'admin' | 'supervisor' }) => void; onPerms: (s: Supervisor) => void }) {
  const locked = self || s.role === 'super_admin';
  const toggle = useCallback(() => { if (!s.is_active || window.confirm(t('تعطيل حساب {name}؟', { name: s.full_name }))) onPatch(s, { is_active: !s.is_active }); }, [s, onPatch]);
  return <tr data-testid={`row-supervisor-${s.id}`}>
    <td><div className="title">{s.full_name}{self && t(' (أنت)')}</div><div className="muted" dir="ltr" style={{ textAlign: 'start' }}>{s.phone ?? '—'}</div></td>
    <td>{branch}</td>
    <td><span className="badge b-gray"><ShieldCheck size={14} /> {ROLE[s.role] ?? s.role}</span></td>
    <td><span className={`badge ${s.is_active ? 'b-green' : 'b-red'}`}>{s.is_active ? t('نشط') : t('معطل')}</span></td>
    <td><div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
      {!locked && <button className={`btn sm ${s.is_active ? 'danger-ghost' : 'success'}`} onClick={toggle}>{s.is_active ? t('تعطيل') : t('تفعيل')}</button>}
      {!['admin', 'super_admin'].includes(s.role) && <button className="btn sm ghost" onClick={() => onPerms(s)} data-testid={`button-perms-${s.id}`}>{t('الصلاحيات')}</button>}
    </div></td>
  </tr>;
});

export default function AdminUsers() {
  const { supervisor } = useAuth(); const q = useSupervisors(); const branches = useBranches(); const m = useUpdateSupervisor();
  const retry = useRefetch(q.refetch);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'full_name', asc: true });
  const [invite, setInvite] = useState(false); const [perms, setPerms] = useState<Supervisor | null>(null);
  const mutate = m.mutate;
  const onPatch = useCallback((target: Supervisor, patch: { is_active?: boolean; role?: 'admin' | 'supervisor' }) => mutate({ target, patch }), [mutate]);
  const branchName = useMemo(() => new Map(branches.data?.map((b) => [b.id, b.name]) ?? []), [branches.data]);
  const rows = useMemo(() => [...q.items].sort((a, b) => {
    const x = String(a[sort.key]), y = String(b[sort.key]);
    return (sort.asc ? 1 : -1) * x.localeCompare(y, 'ar');
  }), [q.items, sort]);
  const th = (key: SortKey, label: string) => <th aria-sort={sort.key === key ? (sort.asc ? 'ascending' : 'descending') : 'none'}>
    <button onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}>{label}{sort.key === key ? (sort.asc ? ' ▲' : ' ▼') : ''}</button></th>;
  const closeInvite = useCallback(() => setInvite(false), []); const closePerms = useCallback(() => setPerms(null), []);

  return <>
    <div className="row between"><h2>{t('المشرفون')}</h2>
      <button className="btn" onClick={() => setInvite(true)} data-testid="button-invite"><Plus size={18} /> {t('دعوة مشرف جديد')}</button></div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : q.items.length === 0 ? <EmptyState icon={<ShieldCheck />} title={t('لا يوجد مشرفون')} />
      : <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr>{th('full_name', t('الاسم'))}<th>{t('الفرع')}</th>{th('role', t('الدور'))}{th('is_active', t('الحالة'))}<th>{t('إجراءات')}</th></tr></thead>
          <tbody>{rows.map((s) => <Row key={s.id} s={s} self={s.id === supervisor?.id} branch={(s.branch_id && branchName.get(s.branch_id)) || '—'}
            onPatch={onPatch} onPerms={setPerms} />)}</tbody>
        </table></div>}
    <LoadMore q={q} />
    {invite && <InviteModal onClose={closeInvite} />}
    {perms && <PermissionsDrawer s={perms} onClose={closePerms} />}
  </>;
}
