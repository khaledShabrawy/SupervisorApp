import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
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
import { useColors } from '@/hooks/useColors';
import { supabase } from '@/lib/supabase';
import type { Visit } from '@/lib/types';

const today = () => new Date().toISOString().split('T')[0];
const weekAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
};

export default function ReportsTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { supervisor } = useAuth();
  const [activeTab, setActiveTab] = useState<'today' | 'week'>('today');
  const s = styles(colors, insets);

  const { data: visits = [], isLoading } = useQuery<Visit[]>({
    queryKey: ['visits-report', supervisor?.id, activeTab],
    queryFn: async () => {
      if (!supervisor) return [];
      const from = activeTab === 'today' ? `${today()}T00:00:00` : `${weekAgo()}T00:00:00`;
      const { data } = await supabase
        .from('visits')
        .select('*, customers(name, type, address)')
        .eq('supervisor_id', supervisor.id)
        .gte('visit_date', from)
        .order('visit_date', { ascending: false });
      return (data ?? []) as Visit[];
    },
    enabled: !!supervisor,
  });

  const statusColor = (s: string) => {
    if (s === 'متعامل') return colors.success;
    if (s === 'غير متعامل') return colors.destructive;
    return colors.mutedForeground;
  };

  const statusIcon = (s: string) => {
    if (s === 'متعامل') return 'checkmark-circle';
    if (s === 'غير متعامل') return 'close-circle';
    return 'remove-circle';
  };

  const dealing = visits.filter((v) => v.status === 'متعامل').length;
  const notDealing = visits.filter((v) => v.status === 'غير متعامل').length;
  const absent = visits.filter((v) => v.status === 'غير موجود').length;
  const compliance = visits.length > 0 ? Math.round((dealing / visits.length) * 100) : 0;
  const pssVisits = visits.filter((v) => v.perfect_store_score != null);
  const avgPss = pssVisits.length > 0
    ? Math.round(pssVisits.reduce((s, v) => s + (v.perfect_store_score ?? 0), 0) / pssVisits.length)
    : null;
  const pssColor = avgPss == null ? '#6B7280' : avgPss >= 80 ? '#10B981' : avgPss >= 60 ? '#F59E0B' : avgPss >= 40 ? '#F97316' : '#EF4444';

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.priceIndexBtn}
          onPress={() => router.push('/price-index')}
          activeOpacity={0.85}
        >
          <Ionicons name="trending-up" size={16} color="#fff" />
          <Text style={s.priceIndexBtnText}>Price Index</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>تقاريري</Text>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tabBtn, activeTab === 'today' && s.tabBtnActive]}
          onPress={() => setActiveTab('today')}
        >
          <Text style={[s.tabBtnText, activeTab === 'today' && s.tabBtnTextActive]}>اليوم</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, activeTab === 'week' && s.tabBtnActive]}
          onPress={() => setActiveTab('week')}
        >
          <Text style={[s.tabBtnText, activeTab === 'week' && s.tabBtnTextActive]}>الأسبوع</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* Stats Row */}
          <View style={s.statsRow}>
            <View style={[s.statCard, { borderTopColor: colors.success }]}>
              <Text style={[s.statNum, { color: colors.success }]}>{dealing}</Text>
              <Text style={s.statLabel}>متعامل</Text>
            </View>
            <View style={[s.statCard, { borderTopColor: colors.destructive }]}>
              <Text style={[s.statNum, { color: colors.destructive }]}>{notDealing}</Text>
              <Text style={s.statLabel}>غير متعامل</Text>
            </View>
            <View style={[s.statCard, { borderTopColor: colors.mutedForeground }]}>
              <Text style={[s.statNum, { color: colors.mutedForeground }]}>{absent}</Text>
              <Text style={s.statLabel}>غير موجود</Text>
            </View>
            <View style={[s.statCard, { borderTopColor: colors.primary }]}>
              <Text style={[s.statNum, { color: colors.primary }]}>{compliance}%</Text>
              <Text style={s.statLabel}>التزام</Text>
            </View>
            <View style={[s.statCard, { borderTopColor: pssColor }]}>
              <Text style={[s.statNum, { color: pssColor }]}>{avgPss ?? '—'}</Text>
              <Text style={s.statLabel}>PSS</Text>
            </View>
          </View>

          {/* Weekly Bar Chart */}
          {activeTab === 'week' && (() => {
            const days: Record<string, number> = {};
            for (let i = 6; i >= 0; i--) {
              const d = new Date(); d.setDate(d.getDate() - i);
              days[d.toISOString().split('T')[0]] = 0;
            }
            visits.forEach(v => {
              const d = new Date(v.visit_date).toISOString().split('T')[0];
              if (d in days) days[d]++;
            });
            const maxVal = Math.max(...Object.values(days), 1);
            const dayNames = ['أحد','إثن','ثلث','أرب','خمس','جمع','سبت'];
            return (
              <View style={s.chartCard}>
                <Text style={s.chartTitle}>زيارات الأسبوع</Text>
                <View style={s.chartBars}>
                  {Object.entries(days).map(([date, count]) => {
                    const dayName = dayNames[new Date(date).getDay()];
                    const isToday = date === today();
                    const barH = Math.max((count / maxVal) * 72, count > 0 ? 8 : 3);
                    return (
                      <View key={date} style={s.chartCol}>
                        <Text style={s.chartCount}>{count > 0 ? count : ''}</Text>
                        <View style={[s.chartBar, {
                          height: barH,
                          backgroundColor: isToday ? colors.accent : count > 0 ? colors.primary : colors.border,
                        }]} />
                        <Text style={[s.chartDay, isToday && { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>{dayName}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })()}

          {/* Visits List */}
          <FlatList
            data={visits}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.listContent}
            ListEmptyComponent={
              <View style={s.empty}>
                <Ionicons name="document-outline" size={40} color={colors.mutedForeground} />
                <Text style={s.emptyText}>لا توجد زيارات</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={s.visitRow}>
                <Ionicons name={statusIcon(item.status) as 'checkmark-circle'} size={22} color={statusColor(item.status)} />
                <View style={s.visitInfo}>
                  <Text style={s.visitName}>{item.customers?.name ?? '—'}</Text>
                  <Text style={s.visitMeta}>
                    {item.customers?.type} · {new Date(item.visit_date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={s.visitRight}>
                  {item.perfect_store_score != null && (
                    <Text style={[s.pssChip, {
                      color: item.perfect_store_score >= 80 ? '#065F46' : item.perfect_store_score >= 60 ? '#92400E' : '#991B1B',
                      backgroundColor: item.perfect_store_score >= 80 ? '#D1FAE5' : item.perfect_store_score >= 60 ? '#FEF3C7' : '#FEE2E2',
                    }]}>{item.perfect_store_score}</Text>
                  )}
                  <Text style={[s.visitStatus, { color: statusColor(item.status) }]}>{item.status}</Text>
                </View>
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: colors.primary,
      paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 8),
      paddingBottom: 16, paddingHorizontal: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: '700' as const, color: '#fff', fontFamily: 'Cairo_700Bold' },
    priceIndexBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    priceIndexBtnText: { fontSize: 12, color: '#fff', fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
    tabRow: {
      flexDirection: 'row', backgroundColor: colors.card,
      paddingHorizontal: 16, paddingVertical: 10, gap: 10,
    },
    tabBtn: {
      flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.muted,
      alignItems: 'center',
    },
    tabBtnActive: { backgroundColor: colors.primary },
    tabBtnText: { fontSize: 14, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const, color: colors.mutedForeground },
    tabBtnTextActive: { color: '#fff' },
    statsRow: {
      flexDirection: 'row', paddingHorizontal: 12, gap: 8, paddingVertical: 12,
    },
    statCard: {
      flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 10,
      borderTopWidth: 3, alignItems: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    statNum: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Cairo_700Bold' },
    statLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'center', marginTop: 2 },
    listContent: { paddingHorizontal: 16, paddingBottom: 100 },
    empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyText: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' },
    visitRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.card, borderRadius: 12,
      padding: 12, marginBottom: 8, gap: 10,
    },
    visitInfo: { flex: 1, alignItems: 'flex-end' },
    visitName: { fontSize: 14, fontWeight: '600' as const, color: colors.foreground, fontFamily: 'Cairo_600SemiBold', textAlign: 'right' },
    visitMeta: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'right' },
    visitRight: { alignItems: 'flex-end', gap: 3 },
    visitStatus: { fontSize: 12, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
    pssChip: { fontSize: 11, fontWeight: '700' as const, fontFamily: 'Cairo_700Bold', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    chartCard: {
      backgroundColor: colors.card, borderRadius: 16, padding: 16,
      marginHorizontal: 0, marginBottom: 12,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    chartTitle: { fontSize: 14, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Cairo_700Bold', textAlign: 'right', marginBottom: 12 },
    chartBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 100 },
    chartCol: { flex: 1, alignItems: 'center', gap: 4 },
    chartBar: { width: '60%', borderRadius: 4 },
    chartCount: { fontSize: 10, color: colors.primary, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const },
    chartDay: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' },
  });
