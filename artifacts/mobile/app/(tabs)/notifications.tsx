import React from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/hooks/useColors';
import { supabase } from '@/lib/supabase';

interface SmartNotification {
  id: string;
  type: 'overdue' | 'target' | 'nearby' | 'product';
  title: string;
  body: string;
  time: string;
  color: string;
  icon: string;
}

export default function NotificationsTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { supervisor } = useAuth();
  const s = styles(colors, insets);

  const { data: notifications = [], isLoading } = useQuery<SmartNotification[]>({
    queryKey: ['smart-notifications', supervisor?.id],
    queryFn: async () => {
      if (!supervisor) return [];
      const result: SmartNotification[] = [];

      // Check today's target progress
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();

      const { data: target } = await supabase
        .from('targets')
        .select('*')
        .eq('supervisor_id', supervisor.id)
        .eq('target_date', today)
        .maybeSingle();

      const { data: todayVisits } = await supabase
        .from('visits')
        .select('id')
        .eq('supervisor_id', supervisor.id)
        .gte('visit_date', `${today}T00:00:00`);

      const visitsDone = todayVisits?.length ?? 0;
      const visitsTarget = target?.visits_target ?? 10;

      if (now.getHours() >= 14 && visitsDone < visitsTarget) {
        result.push({
          id: 'target',
          type: 'target',
          title: 'هدف اليوم لم يكتمل',
          body: `تبقى ${visitsTarget - visitsDone} زيارة لإتمام هدف اليوم`,
          time: 'الآن',
          color: colors.warning,
          icon: 'flag',
        });
      }

      // Check overdue customers (not visited in 7+ days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: customers } = await supabase.from('customers').select('id, name').limit(20);
      if (customers) {
        for (const c of customers.slice(0, 3)) {
          const { data: lastVisit } = await supabase
            .from('visits')
            .select('visit_date')
            .eq('supervisor_id', supervisor.id)
            .eq('customer_id', c.id)
            .order('visit_date', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!lastVisit || new Date(lastVisit.visit_date) < sevenDaysAgo) {
            result.push({
              id: `overdue-${c.id}`,
              type: 'overdue',
              title: 'عميل لم يُزر منذ فترة',
              body: `العميل ${c.name} لم يُزر منذ أكثر من 7 أيام`,
              time: 'منذ 7+ أيام',
              color: colors.destructive,
              icon: 'time',
            });
            if (result.filter((r) => r.type === 'overdue').length >= 2) break;
          }
        }
      }

      if (result.length === 0) {
        result.push({
          id: 'all-good',
          type: 'target',
          title: 'كل شيء على ما يرام',
          body: 'لا توجد تنبيهات حالياً. استمر في العمل الجيد!',
          time: 'الآن',
          color: colors.success,
          icon: 'checkmark-circle',
        });
      }

      return result;
    },
    enabled: !!supervisor,
    staleTime: 60 * 1000,
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>الإشعارات</Text>
        <Ionicons name="notifications" size={22} color="#fff" />
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        refreshing={isLoading}
        ListEmptyComponent={
          !isLoading ? (
            <View style={s.empty}>
              <Ionicons name="notifications-off-outline" size={48} color={colors.mutedForeground} />
              <Text style={s.emptyText}>لا توجد إشعارات</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[s.notifCard, { borderRightColor: item.color }]}>
            <View style={[s.notifIcon, { backgroundColor: `${item.color}18` }]}>
              <Ionicons name={item.icon as 'flag'} size={20} color={item.color} />
            </View>
            <View style={s.notifBody}>
              <Text style={s.notifTitle}>{item.title}</Text>
              <Text style={s.notifText}>{item.body}</Text>
              <Text style={s.notifTime}>{item.time}</Text>
            </View>
          </View>
        )}
      />
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
    listContent: { padding: 16, paddingBottom: 100 },
    notifCard: {
      backgroundColor: colors.card, borderRadius: 14, padding: 14,
      marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start',
      gap: 12, borderRightWidth: 4,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    notifIcon: {
      width: 40, height: 40, borderRadius: 10,
      justifyContent: 'center', alignItems: 'center', flexShrink: 0,
    },
    notifBody: { flex: 1, alignItems: 'flex-end' },
    notifTitle: { fontSize: 14, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Cairo_700Bold', textAlign: 'right' },
    notifText: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'right', marginTop: 2 },
    notifTime: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'right', marginTop: 4 },
    empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
    emptyText: { fontSize: 15, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' },
  });
