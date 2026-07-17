import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useOffline } from '@/contexts/OfflineContext';
import { useColors } from '@/hooks/useColors';
import { supabase } from '@/lib/supabase';
import type { Target, Visit } from '@/lib/types';

const today = () => new Date().toISOString().split('T')[0];

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { supervisor } = useAuth();
  const { isOnline, pendingCount, isSyncing, syncNow } = useOffline();

  const { data: target, isLoading: targetLoading } = useQuery<Target | null>({
    queryKey: ['target', supervisor?.id, today()],
    queryFn: async () => {
      if (!supervisor) return null;
      const { data } = await supabase
        .from('targets')
        .select('*')
        .eq('supervisor_id', supervisor.id)
        .eq('target_date', today())
        .maybeSingle();
      return data as Target | null;
    },
    enabled: !!supervisor,
  });

  const { data: todayVisits = [], isLoading: visitsLoading } = useQuery<Visit[]>({
    queryKey: ['visits-today', supervisor?.id, today()],
    queryFn: async () => {
      if (!supervisor) return [];
      const { data } = await supabase
        .from('visits')
        .select('*, customers(name, type, address)')
        .eq('supervisor_id', supervisor.id)
        .gte('visit_date', `${today()}T00:00:00`)
        .order('visit_date', { ascending: false });
      return (data ?? []) as Visit[];
    },
    enabled: !!supervisor,
  });

  const visitsCount = todayVisits.length;
  const visitsTarget = target?.visits_target ?? 10;
  const progress = Math.min(visitsCount / visitsTarget, 1);

  const s = styles(colors, insets);

  const quickActions = [
    { icon: 'location', label: 'زيارة جديدة', color: colors.primary, route: '/(tabs)/visit' as const },
    { icon: 'list', label: 'زياراتي اليوم', color: '#8B5CF6', route: '/(tabs)/reports' as const },
    { icon: 'bar-chart', label: 'إحصائياتي', color: colors.success, route: '/(tabs)/reports' as const },
    { icon: 'notifications', label: 'الإشعارات', color: colors.warning, route: '/(tabs)/notifications' as const },
  ] as const;

  const statusColor = (status: string) => {
    if (status === 'متعامل') return colors.success;
    if (status === 'غير متعامل') return colors.destructive;
    return colors.mutedForeground;
  };

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Offline / Sync Banner */}
      {(!isOnline || pendingCount > 0) && (
        <TouchableOpacity
          style={[s.syncBanner, !isOnline ? s.syncBannerOffline : s.syncBannerPending]}
          onPress={isOnline ? syncNow : undefined}
          activeOpacity={isOnline ? 0.8 : 1}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#92400E" />
          ) : (
            <Ionicons name={isOnline ? 'cloud-upload' : 'cloud-offline'} size={16} color="#92400E" />
          )}
          <Text style={s.syncBannerText}>
            {!isOnline
              ? 'لا يوجد اتصال — البيانات تُحفظ محلياً'
              : isSyncing
              ? 'جارٍ مزامنة البيانات...'
              : `${pendingCount} عنصر في انتظار الإرسال — اضغط للمزامنة`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerGreeting}>مرحباً 👋</Text>
          <Text style={s.headerName}>{supervisor?.full_name ?? '...'}</Text>
          <Text style={s.headerBranch}>{supervisor?.branch}</Text>
        </View>
        <View style={s.avatarCircle}>
          <Text style={s.avatarText}>
            {(supervisor?.full_name ?? 'M').charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Target Progress Card */}
      <View style={s.targetCard}>
        <View style={s.targetHeader}>
          <Text style={s.targetLabel}>هدف اليوم</Text>
          <Text style={s.targetCount}>
            {targetLoading || visitsLoading ? '...' : `${visitsCount} / ${visitsTarget}`}
          </Text>
        </View>
        <View style={s.progressTrack}>
          <View style={[s.progressBar, { width: `${progress * 100}%` as `${number}%` }]} />
        </View>
        <Text style={s.progressPct}>{Math.round(progress * 100)}% مكتمل</Text>
      </View>

      {/* Quick Actions */}
      <Text style={s.sectionTitle}>الإجراءات السريعة</Text>
      <View style={s.quickGrid}>
        {quickActions.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={[s.quickCard, { borderTopColor: action.color }]}
            onPress={() => router.push(action.route)}
            activeOpacity={0.8}
          >
            <View style={[s.quickIcon, { backgroundColor: `${action.color}18` }]}>
              <Ionicons name={action.icon as 'location'} size={22} color={action.color} />
            </View>
            <Text style={s.quickLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Today's Visits */}
      <Text style={s.sectionTitle}>زياراتي اليوم</Text>
      {visitsLoading ? (
        <ActivityIndicator color={colors.primary} style={{ margin: 20 }} />
      ) : todayVisits.length === 0 ? (
        <View style={s.emptyBox}>
          <Ionicons name="calendar-outline" size={32} color={colors.mutedForeground} />
          <Text style={s.emptyText}>لا توجد زيارات اليوم</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/visit')} style={s.emptyBtn}>
            <Text style={s.emptyBtnText}>ابدأ زيارة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={todayVisits.slice(0, 5)}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={s.visitRow}>
              <View style={[s.statusDot, { backgroundColor: statusColor(item.status) }]} />
              <View style={s.visitInfo}>
                <Text style={s.visitCustomer}>{item.customers?.name ?? '—'}</Text>
                <Text style={s.visitMeta}>
                  {item.customers?.type} · {new Date(item.visit_date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={s.visitRight}>
                {item.perfect_store_score != null && (
                  <View style={[s.scorePill, {
                    backgroundColor: item.perfect_store_score >= 80 ? '#D1FAE5'
                      : item.perfect_store_score >= 60 ? '#FEF3C7'
                      : item.perfect_store_score >= 40 ? '#FFEDD5'
                      : '#FEE2E2',
                  }]}>
                    <Text style={[s.scorePillText, {
                      color: item.perfect_store_score >= 80 ? '#065F46'
                        : item.perfect_store_score >= 60 ? '#92400E'
                        : item.perfect_store_score >= 40 ? '#9A3412'
                        : '#991B1B',
                    }]}>
                      {item.perfect_store_score}
                    </Text>
                  </View>
                )}
                <Text style={[s.visitStatus, { color: statusColor(item.status) }]}>
                  {item.status}
                </Text>
              </View>
            </View>
          )}
        />
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = (colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 8),
      paddingBottom: 20,
    },
    syncBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingVertical: 10, marginHorizontal: 16,
      marginBottom: 8, borderRadius: 10,
    },
    syncBannerOffline: { backgroundColor: '#FEE2E2' },
    syncBannerPending: { backgroundColor: '#FEF3C7' },
    syncBannerText: {
      flex: 1, fontSize: 12, color: '#92400E',
      fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const, textAlign: 'right',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: colors.primary,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      marginBottom: 20,
    },
    headerGreeting: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontFamily: 'Cairo_400Regular', textAlign: 'right' },
    headerName: { fontSize: 22, fontWeight: '700' as const, color: '#fff', fontFamily: 'Cairo_700Bold', textAlign: 'right' },
    headerBranch: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontFamily: 'Cairo_400Regular', textAlign: 'right' },
    avatarCircle: {
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { fontSize: 20, fontWeight: '700' as const, color: '#fff', fontFamily: 'Cairo_700Bold' },
    targetCard: {
      backgroundColor: colors.card,
      marginHorizontal: 16,
      borderRadius: 16,
      padding: 16,
      marginBottom: 24,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },
    targetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    targetLabel: { fontSize: 15, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Cairo_700Bold' },
    targetCount: { fontSize: 15, color: colors.primary, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const },
    progressTrack: { height: 8, backgroundColor: colors.muted, borderRadius: 4, overflow: 'hidden' },
    progressBar: { height: 8, backgroundColor: colors.primary, borderRadius: 4 },
    progressPct: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'right', marginTop: 6 },
    sectionTitle: {
      fontSize: 16, fontWeight: '700' as const, color: colors.foreground,
      fontFamily: 'Cairo_700Bold', textAlign: 'right',
      paddingHorizontal: 20, marginBottom: 12,
    },
    quickGrid: {
      flexDirection: 'row', flexWrap: 'wrap',
      paddingHorizontal: 12, gap: 10, marginBottom: 24,
    },
    quickCard: {
      width: '46%', backgroundColor: colors.card, borderRadius: 14,
      padding: 14, borderTopWidth: 3,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    quickIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8, alignSelf: 'flex-end' },
    quickLabel: { fontSize: 13, fontWeight: '600' as const, color: colors.foreground, fontFamily: 'Cairo_600SemiBold', textAlign: 'right' },
    emptyBox: {
      marginHorizontal: 16, padding: 24, backgroundColor: colors.card,
      borderRadius: 16, alignItems: 'center', gap: 8,
    },
    emptyText: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'center' },
    emptyBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 20, marginTop: 4 },
    emptyBtnText: { color: '#fff', fontFamily: 'Cairo_600SemiBold', fontSize: 14, fontWeight: '600' as const },
    visitRow: {
      flexDirection: 'row', alignItems: 'center',
      marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.card,
      borderRadius: 12, padding: 12,
    },
    statusDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 10 },
    visitInfo: { flex: 1, alignItems: 'flex-end' },
    visitCustomer: { fontSize: 14, fontWeight: '600' as const, color: colors.foreground, fontFamily: 'Cairo_600SemiBold', textAlign: 'right' },
    visitMeta: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'right' },
    visitRight: { alignItems: 'flex-end', gap: 4, marginRight: 8 },
    visitStatus: { fontSize: 12, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
    scorePill: {
      paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
    },
    scorePillText: { fontSize: 12, fontWeight: '700' as const, fontFamily: 'Cairo_700Bold' },
  });
