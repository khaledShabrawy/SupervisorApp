import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/hooks/useColors';
import { supabase } from '@/lib/supabase';

type Section = 'overview' | 'supervisors' | 'customers';

interface SupervisorRow {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  branch?: string | null;
  region?: string | null;
  role?: string;
  is_active?: boolean;
  created_at: string;
}

interface CustomerRow {
  id: string;
  name: string;
  type: string;
  address?: string | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  is_active?: boolean;
  created_at: string;
}

interface AdminOverview {
  metrics: {
    supervisors: number;
    activeSupervisors: number;
    customers: number;
    visitsToday: number;
  };
  supervisors: SupervisorRow[];
  customers: CustomerRow[];
}

interface NewSupervisor {
  full_name: string;
  email: string;
  password: string;
  phone: string;
  branch: string;
  region: string;
}

const emptySupervisor: NewSupervisor = {
  full_name: '',
  email: '',
  password: '',
  phone: '',
  branch: '',
  region: '',
};

function apiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/api`;
  return '/api';
}

async function adminRequest<T>(path: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error ?? 'تعذر تنفيذ الطلب');
  return payload;
}

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { supervisor, loading: authLoading } = useAuth();
  const s = styles(colors, insets);
  const [section, setSection] = useState<Section>('overview');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newSupervisor, setNewSupervisor] = useState(emptySupervisor);
  const [savingSupervisor, setSavingSupervisor] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const result = await adminRequest<AdminOverview>('/admin/overview');
      setData(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذر تحميل لوحة الإدارة');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (supervisor?.role === 'admin') void loadOverview();
  }, [loadOverview, supervisor?.role]);

  const updateSupervisor = async (id: string, patch: Partial<SupervisorRow>) => {
    setNotice('');
    try {
      await adminRequest(`/admin/supervisors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setNotice('تم تحديث بيانات المشرف');
      await loadOverview(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذر تحديث المشرف');
    }
  };

  const createSupervisor = async () => {
    if (!newSupervisor.full_name.trim() || !newSupervisor.email.trim() || newSupervisor.password.length < 8) {
      setError('أدخل الاسم والبريد وكلمة مرور من 8 أحرف على الأقل');
      return;
    }
    setSavingSupervisor(true);
    setError('');
    setNotice('');
    try {
      await adminRequest('/admin/supervisors', {
        method: 'POST',
        body: JSON.stringify(newSupervisor),
      });
      setNewSupervisor(emptySupervisor);
      setShowCreate(false);
      setNotice('تم إنشاء حساب المشرف وتفعيله بنجاح');
      setSection('supervisors');
      await loadOverview(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذر إنشاء المشرف');
    } finally {
      setSavingSupervisor(false);
    }
  };

  const updateCustomer = async (id: string, isActive: boolean) => {
    setNotice('');
    try {
      await adminRequest(`/admin/customers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: isActive }),
      });
      setNotice(isActive ? 'تم تفعيل العميل' : 'تم إيقاف العميل');
      await loadOverview(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذر تحديث العميل');
    }
  };

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return data?.customers ?? [];
    return (data?.customers ?? []).filter((customer) =>
      [customer.name, customer.type, customer.address, customer.owner_name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  }, [customerSearch, data?.customers]);

  if (authLoading || (loading && !data && supervisor?.role === 'admin')) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={s.centerText}>جارٍ تحميل لوحة الإدارة...</Text>
      </View>
    );
  }

  if (!supervisor || supervisor.role !== 'admin') {
    return (
      <View style={s.center}>
        <View style={s.deniedIcon}>
          <Ionicons name="lock-closed-outline" size={34} color={colors.destructive} />
        </View>
        <Text style={s.deniedTitle}>الوصول للمديرين فقط</Text>
        <Text style={s.centerText}>هذا القسم غير متاح لحساب المشرف العادي.</Text>
        <TouchableOpacity style={s.primaryButton} onPress={() => router.back()} activeOpacity={0.85}>
          <Text style={s.primaryButtonText}>العودة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.header}>
        <TouchableOpacity style={s.headerBack} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-forward" size={21} color={colors.primaryForeground} />
        </TouchableOpacity>
        <View style={s.headerCopy}>
          <Text style={s.headerEyebrow}>MYDAN CONTROL CENTER</Text>
          <Text style={s.headerTitle}>لوحة الإدارة</Text>
        </View>
        <View style={s.headerIcon}>
          <Ionicons name="shield-checkmark-outline" size={23} color={colors.primaryForeground} />
        </View>
      </View>

      {error ? (
        <View style={s.messageError}>
          <Ionicons name="alert-circle-outline" size={19} color={colors.destructive} />
          <Text style={s.messageText}>{error}</Text>
          <TouchableOpacity onPress={() => setError('')} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      ) : null}
      {notice ? (
        <View style={s.messageSuccess}>
          <Ionicons name="checkmark-circle-outline" size={19} color={colors.success} />
          <Text style={[s.messageText, { color: colors.success }]}>{notice}</Text>
        </View>
      ) : null}

      <View style={s.metricsGrid}>
        <MetricCard icon="people-outline" label="المشرفون" value={data?.metrics.supervisors ?? 0} color={colors.primary} styles={s} />
        <MetricCard icon="checkmark-circle-outline" label="مشرفون نشطون" value={data?.metrics.activeSupervisors ?? 0} color={colors.success} styles={s} />
        <MetricCard icon="storefront-outline" label="العملاء" value={data?.metrics.customers ?? 0} color={colors.accent} styles={s} />
        <MetricCard icon="location-outline" label="زيارات اليوم" value={data?.metrics.visitsToday ?? 0} color={colors.info} styles={s} />
      </View>

      <View style={s.sectionTabs}>
        <SectionTab label="نظرة عامة" icon="grid-outline" active={section === 'overview'} onPress={() => setSection('overview')} styles={s} />
        <SectionTab label="المشرفون" icon="people-outline" active={section === 'supervisors'} onPress={() => setSection('supervisors')} styles={s} />
        <SectionTab label="العملاء" icon="storefront-outline" active={section === 'customers'} onPress={() => setSection('customers')} styles={s} />
      </View>

      {section === 'overview' && (
        <View>
          <View style={s.panel}>
            <View style={s.panelHeading}>
              <TouchableOpacity onPress={() => setSection('supervisors')}>
                <Text style={s.linkText}>إدارة الكل</Text>
              </TouchableOpacity>
              <Text style={s.panelTitle}>آخر المشرفين</Text>
            </View>
            {(data?.supervisors ?? []).slice(0, 4).map((item) => (
              <SupervisorRowView key={item.id} item={item} currentId={supervisor.id} onToggle={updateSupervisor} styles={s} colors={colors} />
            ))}
            {data?.supervisors.length === 0 ? <EmptyState text="لا يوجد مشرفون بعد" styles={s} /> : null}
          </View>
          <View style={s.actionPanel}>
            <View style={s.actionPanelIcon}>
              <Ionicons name="person-add-outline" size={22} color={colors.primary} />
            </View>
            <View style={s.actionPanelCopy}>
              <Text style={s.actionPanelTitle}>أضف مشرفاً جديداً</Text>
              <Text style={s.actionPanelText}>أنشئ حساب دخول واربطه ببيانات المشرف تلقائياً.</Text>
            </View>
            <TouchableOpacity style={s.roundAction} onPress={() => { setSection('supervisors'); setShowCreate(true); }} hitSlop={8}>
              <Ionicons name="add" size={22} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {section === 'supervisors' && (
        <View>
          <TouchableOpacity style={s.primaryButtonWide} onPress={() => setShowCreate((visible) => !visible)} activeOpacity={0.85}>
            <Ionicons name={showCreate ? 'close' : 'person-add-outline'} size={19} color={colors.primaryForeground} />
            <Text style={s.primaryButtonText}>{showCreate ? 'إلغاء الإضافة' : 'إضافة مشرف جديد'}</Text>
          </TouchableOpacity>
          {showCreate ? (
            <View style={s.formPanel}>
              <Text style={s.panelTitle}>بيانات الحساب الجديد</Text>
              <AdminInput label="الاسم الكامل *" value={newSupervisor.full_name} onChangeText={(value) => setNewSupervisor({ ...newSupervisor, full_name: value })} placeholder="اسم المشرف" styles={s} />
              <AdminInput label="البريد الإلكتروني *" value={newSupervisor.email} onChangeText={(value) => setNewSupervisor({ ...newSupervisor, email: value })} placeholder="supervisor@company.com" keyboardType="email-address" styles={s} />
              <AdminInput label="كلمة المرور *" value={newSupervisor.password} onChangeText={(value) => setNewSupervisor({ ...newSupervisor, password: value })} placeholder="8 أحرف على الأقل" secureTextEntry styles={s} />
              <View style={s.formRow}>
                <View style={s.formHalf}><AdminInput label="المنطقة" value={newSupervisor.region} onChangeText={(value) => setNewSupervisor({ ...newSupervisor, region: value })} placeholder="المنطقة" styles={s} /></View>
                <View style={s.formHalf}><AdminInput label="الفرع" value={newSupervisor.branch} onChangeText={(value) => setNewSupervisor({ ...newSupervisor, branch: value })} placeholder="الفرع" styles={s} /></View>
              </View>
              <AdminInput label="رقم الهاتف" value={newSupervisor.phone} onChangeText={(value) => setNewSupervisor({ ...newSupervisor, phone: value })} placeholder="01XXXXXXXXX" keyboardType="phone-pad" styles={s} />
              <TouchableOpacity style={[s.primaryButtonWide, savingSupervisor && s.disabled]} onPress={() => void createSupervisor()} disabled={savingSupervisor} activeOpacity={0.85}>
                {savingSupervisor ? <ActivityIndicator color={colors.primaryForeground} /> : <><Ionicons name="checkmark" size={19} color={colors.primaryForeground} /><Text style={s.primaryButtonText}>إنشاء وتفعيل الحساب</Text></>}
              </TouchableOpacity>
            </View>
          ) : null}
          <View style={s.panel}>
            <View style={s.panelHeading}>
              <Text style={s.countText}>{data?.supervisors.length ?? 0}</Text>
              <Text style={s.panelTitle}>كل المشرفين</Text>
            </View>
            {(data?.supervisors ?? []).map((item) => (
              <SupervisorRowView key={item.id} item={item} currentId={supervisor.id} onToggle={updateSupervisor} styles={s} colors={colors} />
            ))}
          </View>
        </View>
      )}

      {section === 'customers' && (
        <View>
          <View style={s.searchBox}>
            <Ionicons name="search" size={19} color={colors.mutedForeground} />
            <TextInput value={customerSearch} onChangeText={setCustomerSearch} placeholder="ابحث عن عميل أو منطقة" placeholderTextColor={colors.mutedForeground} style={s.searchInput} textAlign="right" />
          </View>
          <View style={s.panel}>
            <View style={s.panelHeading}>
              <Text style={s.countText}>{filteredCustomers.length}</Text>
              <Text style={s.panelTitle}>دليل العملاء</Text>
            </View>
            {filteredCustomers.map((customer) => (
              <View key={customer.id} style={s.customerRow}>
                <TouchableOpacity
                  style={[s.statusToggle, customer.is_active !== false ? s.statusActive : s.statusInactive]}
                  onPress={() => void updateCustomer(customer.id, customer.is_active === false)}
                >
                  <Text style={[s.statusToggleText, { color: customer.is_active !== false ? colors.success : colors.mutedForeground }]}>
                    {customer.is_active !== false ? 'نشط' : 'متوقف'}
                  </Text>
                </TouchableOpacity>
                <View style={s.customerCopy}>
                  <Text style={s.customerName}>{customer.name}</Text>
                  <Text style={s.customerMeta}>{customer.type} · {customer.owner_name || 'بدون اسم صاحب'}</Text>
                  <Text style={s.customerAddress}>{customer.address || 'بدون عنوان'}</Text>
                </View>
                <View style={s.customerIcon}>
                  <Ionicons name="storefront-outline" size={20} color={colors.primary} />
                </View>
              </View>
            ))}
            {filteredCustomers.length === 0 ? <EmptyState text="لا توجد نتائج" styles={s} /> : null}
          </View>
        </View>
      )}

      <TouchableOpacity style={s.refreshButton} onPress={() => void loadOverview(true)} disabled={refreshing} activeOpacity={0.8}>
        {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh-outline" size={17} color={colors.primary} />}
        <Text style={s.refreshText}>تحديث البيانات</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function MetricCard({ icon, label, value, color, styles: s }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; color: string; styles: ReturnType<typeof styles> }) {
  return (
    <View style={[s.metricCard, { borderTopColor: color }]}>
      <View style={[s.metricIcon, { backgroundColor: `${color}18` }]}><Ionicons name={icon} size={20} color={color} /></View>
      <Text style={[s.metricValue, { color }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function SectionTab({ label, icon, active, onPress, styles: s }: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; onPress: () => void; styles: ReturnType<typeof styles> }) {
  return (
    <TouchableOpacity style={[s.sectionTab, active && s.sectionTabActive]} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={icon} size={17} color={active ? s.sectionTabTextActive.color : s.sectionTabIcon.color} />
      <Text style={[s.sectionTabText, active && s.sectionTabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SupervisorRowView({ item, currentId, onToggle, styles: s, colors }: { item: SupervisorRow; currentId: string; onToggle: (id: string, patch: Partial<SupervisorRow>) => Promise<void>; styles: ReturnType<typeof styles>; colors: ReturnType<typeof useColors> }) {
  const active = item.is_active !== false;
  const isAdmin = item.role === 'admin';
  return (
    <View style={s.supervisorRow}>
      <View style={s.rowActions}>
        <TouchableOpacity
          style={[s.statusToggle, active ? s.statusActive : s.statusInactive]}
          onPress={() => void onToggle(item.id, { is_active: !active })}
          disabled={item.id === currentId}
        >
          <Text style={[s.statusToggleText, { color: active ? colors.success : colors.mutedForeground }]}>{active ? 'نشط' : 'متوقف'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.roleToggle, isAdmin ? s.roleAdmin : s.roleSupervisor]}
          onPress={() => void onToggle(item.id, { role: isAdmin ? 'supervisor' : 'admin' })}
          disabled={item.id === currentId}
        >
          <Text style={[s.roleToggleText, { color: isAdmin ? colors.accent : colors.primary }]}>{isAdmin ? 'مدير' : 'ترقية'}</Text>
        </TouchableOpacity>
      </View>
      <View style={s.supervisorCopy}>
        <View style={s.nameLine}>
          <Text style={s.supervisorName}>{item.full_name}</Text>
          {item.role === 'admin' ? <View style={s.adminBadge}><Text style={s.adminBadgeText}>مدير</Text></View> : null}
        </View>
        <Text style={s.supervisorMeta}>{item.email} · {item.branch || 'بدون فرع'}</Text>
      </View>
      <View style={s.avatarSmall}><Text style={s.avatarSmallText}>{item.full_name.charAt(0)}</Text></View>
    </View>
  );
}

function AdminInput({ label, value, onChangeText, placeholder, styles: s, secureTextEntry, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; styles: ReturnType<typeof styles>; secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address' | 'phone-pad' }) {
  return (
    <View style={s.inputGroup}>
      <Text style={s.inputLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={s.inputPlaceholder.color} style={s.formInput} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize="none" textAlign="right" />
    </View>
  );
}

function EmptyState({ text, styles: s }: { text: string; styles: ReturnType<typeof styles> }) {
  return <View style={s.empty}><Ionicons name="file-tray-outline" size={30} color={s.emptyIcon.color} /><Text style={s.emptyText}>{text}</Text></View>;
}

const styles = (colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: insets.bottom + 30 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerText: { color: colors.mutedForeground, fontSize: 13, fontFamily: 'Cairo_400Regular', textAlign: 'center', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.primary, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 10), paddingBottom: 18, paddingHorizontal: 18 },
  headerBack: { width: 36, height: 36, borderRadius: 18, backgroundColor: `${colors.primaryForeground}2E`, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'flex-end' },
  headerEyebrow: { color: `${colors.primaryForeground}B8`, fontSize: 9, letterSpacing: 0.8, fontFamily: 'Cairo_700Bold', textAlign: 'right' },
  headerTitle: { color: colors.primaryForeground, fontSize: 21, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const, textAlign: 'right', marginTop: 2 },
  headerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: `${colors.primaryForeground}2E`, alignItems: 'center', justifyContent: 'center' },
  messageError: { flexDirection: 'row', alignItems: 'center', gap: 7, margin: 14, padding: 11, borderRadius: 10, backgroundColor: `${colors.destructive}14` },
  messageSuccess: { flexDirection: 'row', alignItems: 'center', gap: 7, margin: 14, marginBottom: 0, padding: 10, borderRadius: 10, backgroundColor: `${colors.success}14` },
  messageText: { flex: 1, color: colors.destructive, fontSize: 12, fontFamily: 'Cairo_400Regular', textAlign: 'right' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, padding: 14 },
  metricCard: { width: '48%', minHeight: 108, backgroundColor: colors.card, borderRadius: 14, padding: 11, borderTopWidth: 3, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  metricIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  metricValue: { fontSize: 24, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const, textAlign: 'right', marginTop: 4 },
  metricLabel: { color: colors.mutedForeground, fontSize: 10, fontFamily: 'Cairo_400Regular', textAlign: 'right' },
  sectionTabs: { flexDirection: 'row', gap: 7, paddingHorizontal: 14, marginBottom: 12 },
  sectionTab: { flex: 1, minHeight: 42, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  sectionTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sectionTabIcon: { color: colors.mutedForeground },
  sectionTabText: { color: colors.mutedForeground, fontSize: 11, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
  sectionTabTextActive: { color: colors.primaryForeground },
  panel: { backgroundColor: colors.card, borderRadius: 16, marginHorizontal: 14, marginBottom: 12, padding: 14, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 5, elevation: 1 },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  panelTitle: { color: colors.foreground, fontSize: 15, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const, textAlign: 'right' },
  linkText: { color: colors.primary, fontSize: 11, fontFamily: 'Cairo_600SemiBold' },
  countText: { color: colors.primary, fontSize: 13, fontFamily: 'Cairo_700Bold' },
  supervisorRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowActions: { alignItems: 'flex-start', gap: 5 },
  supervisorCopy: { flex: 1, alignItems: 'flex-end' },
  supervisorName: { color: colors.foreground, fontSize: 13, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const, textAlign: 'right' },
  supervisorMeta: { color: colors.mutedForeground, fontSize: 10, fontFamily: 'Cairo_400Regular', textAlign: 'right', marginTop: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  adminBadge: { backgroundColor: `${colors.accent}20`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  adminBadgeText: { color: colors.accent, fontSize: 9, fontFamily: 'Cairo_700Bold' },
  avatarSmall: { width: 34, height: 34, borderRadius: 17, backgroundColor: `${colors.primary}18`, alignItems: 'center', justifyContent: 'center' },
  avatarSmallText: { color: colors.primary, fontSize: 15, fontFamily: 'Cairo_700Bold' },
  statusToggle: { minWidth: 48, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7, alignItems: 'center' },
  statusActive: { backgroundColor: `${colors.success}16` },
  statusInactive: { backgroundColor: colors.muted },
  statusToggleText: { fontSize: 10, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
  roleToggle: { minWidth: 48, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, alignItems: 'center' },
  roleAdmin: { backgroundColor: `${colors.accent}18` },
  roleSupervisor: { backgroundColor: `${colors.primary}12` },
  roleToggleText: { fontSize: 9, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
  actionPanel: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: `${colors.primary}10`, borderWidth: 1, borderColor: `${colors.primary}25` },
  actionPanelIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  actionPanelCopy: { flex: 1, alignItems: 'flex-end' },
  actionPanelTitle: { color: colors.foreground, fontSize: 13, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const, textAlign: 'right' },
  actionPanelText: { color: colors.mutedForeground, fontSize: 10, fontFamily: 'Cairo_400Regular', textAlign: 'right', marginTop: 2 },
  roundAction: { width: 35, height: 35, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { marginTop: 20, backgroundColor: colors.primary, borderRadius: 11, paddingHorizontal: 28, paddingVertical: 12 },
  primaryButtonWide: { marginHorizontal: 14, marginBottom: 12, minHeight: 46, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  primaryButtonText: { color: colors.primaryForeground, fontSize: 13, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const },
  formPanel: { marginHorizontal: 14, marginBottom: 12, padding: 14, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  formRow: { flexDirection: 'row', gap: 8 },
  formHalf: { flex: 1 },
  inputGroup: { marginTop: 10 },
  inputLabel: { color: colors.foreground, fontSize: 11, fontFamily: 'Cairo_600SemiBold', textAlign: 'right', marginBottom: 5 },
  inputPlaceholder: { color: colors.mutedForeground },
  formInput: { minHeight: 43, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.muted, color: colors.foreground, fontSize: 12, fontFamily: 'Cairo_400Regular', paddingHorizontal: 10, paddingVertical: 8 },
  disabled: { opacity: 0.6 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 45, marginHorizontal: 14, marginBottom: 12, paddingHorizontal: 11, borderRadius: 11, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 12, fontFamily: 'Cairo_400Regular', paddingVertical: 8 },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  customerCopy: { flex: 1, alignItems: 'flex-end' },
  customerName: { color: colors.foreground, fontSize: 13, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const, textAlign: 'right' },
  customerMeta: { color: colors.mutedForeground, fontSize: 10, fontFamily: 'Cairo_400Regular', textAlign: 'right', marginTop: 2 },
  customerAddress: { color: colors.mutedForeground, fontSize: 9, fontFamily: 'Cairo_400Regular', textAlign: 'right', marginTop: 1 },
  customerIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: `${colors.primary}14`, alignItems: 'center', justifyContent: 'center' },
  refreshButton: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 },
  refreshText: { color: colors.primary, fontSize: 12, fontFamily: 'Cairo_600SemiBold' },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 7 },
  emptyIcon: { color: colors.mutedForeground },
  emptyText: { color: colors.mutedForeground, fontSize: 12, fontFamily: 'Cairo_400Regular' },
  deniedIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: `${colors.destructive}14`, alignItems: 'center', justifyContent: 'center' },
  deniedTitle: { color: colors.foreground, fontSize: 18, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const, marginTop: 14 },
});