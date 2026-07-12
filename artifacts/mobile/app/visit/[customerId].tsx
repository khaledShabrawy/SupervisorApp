import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useOffline } from '@/contexts/OfflineContext';
import { useVisit } from '@/contexts/VisitContext';
import { useColors } from '@/hooks/useColors';
import { distanceKm } from '@/lib/haversine';
import { enqueue } from '@/lib/offlineQueue';
import { supabase } from '@/lib/supabase';
import type { Customer } from '@/lib/types';

type VisitStatus = 'متعامل' | 'غير متعامل' | 'غير موجود';

export default function CustomerVisitScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { customerId, lat, lng } = useLocalSearchParams<{ customerId: string; lat: string; lng: string }>();
  const { supervisor } = useAuth();
  const { setActiveVisit, activeVisit } = useVisit();
  const { isOnline, refreshCount } = useOffline();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visitSaved, setVisitSaved] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const s = styles(colors, insets);

  useEffect(() => {
    (async () => {
      if (isOnline) {
        const { data } = await supabase.from('customers').select('*').eq('id', customerId).single();
        if (data) {
          setCustomer(data as Customer);
          if (lat && lng) {
            const d = distanceKm(Number(lat), Number(lng), data.latitude, data.longitude) * 1000;
            setDistance(d);
          }
        }
      }
      setLoading(false);
    })();
  }, [customerId, isOnline]);

  const handleStatus = async (status: VisitStatus) => {
    if (!customer || !supervisor) return;
    setSaving(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const onBeat = distance !== null ? distance <= 500 : true;
      const visitPayload = {
        supervisor_id: supervisor.id,
        customer_id: customer.id,
        status,
        latitude: Number(lat) || 0,
        longitude: Number(lng) || 0,
        geo_distance: distance ?? 0,
        on_beat: onBeat,
        visit_date: new Date().toISOString(),
        notes: '',
      };

      if (isOnline) {
        // ── Online path ─────────────────────────────────────────────────────
        const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: existing } = await supabase
          .from('visits')
          .select('id')
          .eq('supervisor_id', supervisor.id)
          .eq('customer_id', customer.id)
          .gte('visit_date', thirtyMinsAgo)
          .maybeSingle();

        if (existing) {
          Alert.alert('تنبيه', 'لقد قمت بزيارة هذا العميل منذ أقل من 30 دقيقة');
          setSaving(false);
          return;
        }

        const { data: visit, error } = await supabase
          .from('visits')
          .insert(visitPayload)
          .select()
          .single();

        if (error) throw error;

        setActiveVisit({
          visitId: visit.id,
          customerId: customer.id,
          customerName: customer.name,
          customerType: customer.type,
          visitStatus: status,
          isPending: false,
        });
      } else {
        // ── Offline path ─────────────────────────────────────────────────────
        const localId = await enqueue('visits', visitPayload);
        await refreshCount();

        setActiveVisit({
          visitId: localId,
          customerId: customer.id,
          customerName: customer.name,
          customerType: customer.type,
          visitStatus: status,
          isPending: true,
        });
      }

      setVisitSaved(true);
    } catch (e) {
      Alert.alert('خطأ', 'تعذر حفظ الزيارة. تحقق من الاتصال.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={s.loadingContainer}>
        <Text style={s.errorText}>لم يتم العثور على بيانات العميل</Text>
      </View>
    );
  }

  const outOfRange = distance !== null && distance > 500;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Customer Card */}
      <View style={s.customerCard}>
        <View style={s.customerBadge}>
          <Text style={s.customerInitial}>{customer.name.charAt(0)}</Text>
        </View>
        <View style={s.customerInfo}>
          <Text style={s.customerName}>{customer.name}</Text>
          <Text style={s.customerType}>{customer.type}</Text>
          <Text style={s.customerAddress}>{customer.address}</Text>
        </View>
      </View>

      {/* Offline Banner */}
      {!isOnline && (
        <View style={s.offlineBanner}>
          <Ionicons name="cloud-offline" size={18} color="#92400E" />
          <Text style={s.offlineText}>وضع عدم الاتصال — ستُحفظ الزيارة وتُرسل عند عودة الإنترنت</Text>
        </View>
      )}

      {/* Geofence Warning */}
      {outOfRange && (
        <View style={s.warnBanner}>
          <Ionicons name="warning" size={20} color={colors.destructive} />
          <Text style={s.warnText}>
            ⛔ أنت خارج النطاق الجغرافي — المسافة: {Math.round(distance!)} م
          </Text>
        </View>
      )}

      {distance !== null && !outOfRange && (
        <View style={s.successBanner}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={s.successText}>أنت داخل النطاق — المسافة: {Math.round(distance)} م</Text>
        </View>
      )}

      {/* Visit Status Buttons */}
      {!visitSaved ? (
        <View style={s.section}>
          <Text style={s.sectionTitle}>حالة الزيارة</Text>
          {saving ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : (
            <View style={s.statusGrid}>
              <TouchableOpacity
                style={[s.statusBtn, { borderColor: colors.success, backgroundColor: `${colors.success}12` }]}
                onPress={() => handleStatus('متعامل')}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle" size={28} color={colors.success} />
                <Text style={[s.statusLabel, { color: colors.success }]}>متعامل</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.statusBtn, { borderColor: colors.destructive, backgroundColor: `${colors.destructive}12` }]}
                onPress={() => handleStatus('غير متعامل')}
                activeOpacity={0.8}
              >
                <Ionicons name="close-circle" size={28} color={colors.destructive} />
                <Text style={[s.statusLabel, { color: colors.destructive }]}>غير متعامل</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.statusBtn, { borderColor: colors.mutedForeground, backgroundColor: `${colors.mutedForeground}12` }]}
                onPress={() => handleStatus('غير موجود')}
                activeOpacity={0.8}
              >
                <Ionicons name="remove-circle" size={28} color={colors.mutedForeground} />
                <Text style={[s.statusLabel, { color: colors.mutedForeground }]}>غير موجود</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        /* Action Menu */
        <View style={s.section}>
          <View style={s.visitConfirm}>
            <Ionicons
              name={activeVisit?.isPending ? 'time' : 'checkmark-circle'}
              size={24}
              color={activeVisit?.isPending ? '#D97706' : colors.success}
            />
            <Text style={[s.visitConfirmText, activeVisit?.isPending && { color: '#92400E' }]}>
              {activeVisit?.isPending
                ? 'محفوظة محلياً — ستُرسل عند الاتصال'
                : `تم تسجيل الزيارة — ${activeVisit?.visitStatus}`}
            </Text>
          </View>

          <Text style={s.sectionTitle}>الإجراءات</Text>

          <TouchableOpacity style={s.actionBtn} onPress={() => router.push('/visit/shelf-audit')} activeOpacity={0.85}>
            <View style={[s.actionIcon, { backgroundColor: `${colors.primary}18` }]}>
              <Ionicons name="cube" size={22} color={colors.primary} />
            </View>
            <Text style={s.actionLabel}>كشف الرف</Text>
            <Ionicons name="chevron-back" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          <TouchableOpacity style={s.actionBtn} onPress={() => router.push('/visit/competitor')} activeOpacity={0.85}>
            <View style={[s.actionIcon, { backgroundColor: `${colors.warning}18` }]}>
              <Ionicons name="pricetag" size={22} color={colors.warning} />
            </View>
            <Text style={s.actionLabel}>منتجات المنافسين</Text>
            <Ionicons name="chevron-back" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          <TouchableOpacity style={s.actionBtn} onPress={() => router.push('/visit/order')} activeOpacity={0.85}>
            <View style={[s.actionIcon, { backgroundColor: `${colors.success}18` }]}>
              <Ionicons name="cart" size={22} color={colors.success} />
            </View>
            <Text style={s.actionLabel}>تسجيل أوردر</Text>
            <Ionicons name="chevron-back" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionBtn, { borderColor: colors.success }]}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <View style={[s.actionIcon, { backgroundColor: `${colors.success}18` }]}>
              <Ionicons name="checkmark-done" size={22} color={colors.success} />
            </View>
            <Text style={[s.actionLabel, { color: colors.success }]}>إنهاء الزيارة</Text>
            <Ionicons name="chevron-back" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = (colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorText: { fontSize: 15, color: colors.destructive, fontFamily: 'Cairo_400Regular' },
    customerCard: {
      backgroundColor: colors.card, borderRadius: 16, padding: 16,
      flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    },
    customerBadge: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
    },
    customerInitial: { fontSize: 22, fontWeight: '700' as const, color: '#fff', fontFamily: 'Cairo_700Bold' },
    customerInfo: { flex: 1, alignItems: 'flex-end' },
    customerName: { fontSize: 18, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Cairo_700Bold', textAlign: 'right' },
    customerType: { fontSize: 13, color: colors.primary, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const, textAlign: 'right' },
    customerAddress: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'right', marginTop: 2 },
    offlineBanner: {
      backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12,
      flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
    },
    offlineText: { fontSize: 12, color: '#92400E', fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const, flex: 1, textAlign: 'right' },
    warnBanner: {
      backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12,
      flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
    },
    warnText: { fontSize: 13, color: colors.destructive, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const, flex: 1, textAlign: 'right' },
    successBanner: {
      backgroundColor: '#D1FAE5', borderRadius: 10, padding: 12,
      flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
    },
    successText: { fontSize: 13, color: '#065F46', fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const, flex: 1, textAlign: 'right' },
    section: {
      backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    },
    sectionTitle: { fontSize: 16, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Cairo_700Bold', textAlign: 'right', marginBottom: 14 },
    statusGrid: { gap: 10 },
    statusBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 2, borderRadius: 14, padding: 14,
      justifyContent: 'flex-end',
    },
    statusLabel: { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Cairo_700Bold' },
    visitConfirm: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: '#D1FAE5', borderRadius: 10, padding: 10, marginBottom: 16,
      justifyContent: 'flex-end',
    },
    visitConfirmText: { fontSize: 14, color: '#065F46', fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
    actionBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    actionIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    actionLabel: { flex: 1, fontSize: 15, fontWeight: '600' as const, color: colors.foreground, fontFamily: 'Cairo_600SemiBold', textAlign: 'right' },
  });
