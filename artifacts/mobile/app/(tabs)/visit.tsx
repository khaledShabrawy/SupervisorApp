import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/hooks/useColors';
import { distanceKm, formatDistance } from '@/lib/haversine';
import { supabase } from '@/lib/supabase';
import type { Customer, CustomerWithDistance } from '@/lib/types';

export default function VisitTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const s = styles(colors, insets);

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('*');
      return (data ?? []) as Customer[];
    },
  });

  const [typeFilter, setTypeFilter] = useState<string>('الكل');

  const allWithDistance = useMemo<CustomerWithDistance[]>(() => {
    if (!location || customers.length === 0) return [];
    return customers
      .filter((c) => c.latitude && c.longitude)
      .filter((c) => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return true;
        return [c.name, c.address, c.type].some((value) =>
          value?.toLowerCase().includes(query),
        );
      })
      .map((c) => ({
        ...c,
        distance: distanceKm(location.lat, location.lng, c.latitude, c.longitude) * 1000,
      }))
      .sort((a, b) => a.distance - b.distance);
  }, [location, customers, searchTerm]);

  const customerTypes = useMemo(() => {
    const types = [...new Set(customers.map(c => c.type))];
    return ['الكل', ...types];
  }, [customers]);

  const nearest = useMemo<CustomerWithDistance[]>(() => {
    const filtered = typeFilter === 'الكل' ? allWithDistance : allWithDistance.filter(c => c.type === typeFilter);
    return filtered.slice(0, 8);
  }, [allWithDistance, typeFilter]);

  const getLocation = async () => {
    if (Platform.OS === 'web') {
      setLocLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocLoading(false);
        },
        () => {
          Alert.alert('خطأ', 'تعذر الحصول على الموقع');
          setLocLoading(false);
        }
      );
      return;
    }
    setLocLoading(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('تنبيه', 'يرجى السماح بالوصول إلى الموقع الجغرافي');
      setLocLoading(false);
      return;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    setLocLoading(false);
  };

  const typeColor = (type: string) => {
    if (type === 'صيدلية') return '#8B5CF6';
    if (type === 'جملة') return colors.warning;
    return colors.primary;
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerEyebrow}>MYDAN ROUTE COMMAND CENTER</Text>
          <Text style={s.headerTitle}>مركز المسار</Text>
        </View>
        <View style={s.headerIcon}>
          <Ionicons name="location" size={22} color="#fff" />
        </View>
      </View>

      <View style={s.commandCard}>
        <View style={s.commandCardTop}>
          <View style={s.commandBadge}>
            <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
            <Text style={s.commandBadgeText}>خطة اليوم</Text>
          </View>
          <View style={s.commandCopy}>
            <Text style={s.commandTitle}>رتّب زياراتك بوضوح</Text>
            <Text style={s.commandSubtitle}>
              {location ? `${allWithDistance.length} عميل قريب من موقعك` : 'حدد موقعك لعرض أقرب العملاء'}
            </Text>
          </View>
        </View>
        <View style={s.commandStats}>
          <View style={s.commandStat}>
            <Text style={s.commandStatValue}>{customers.length}</Text>
            <Text style={s.commandStatLabel}>كل العملاء</Text>
          </View>
          <View style={s.commandStatDivider} />
          <View style={s.commandStat}>
            <Text style={[s.commandStatValue, { color: colors.success }]}>{location ? allWithDistance.length : '—'}</Text>
            <Text style={s.commandStatLabel}>جاهز للزيارة</Text>
          </View>
          <View style={s.commandStatDivider} />
          <View style={s.commandStat}>
            <Text style={[s.commandStatValue, { color: colors.accent }]}>8</Text>
            <Text style={s.commandStatLabel}>أقصى قائمة</Text>
          </View>
        </View>
      </View>

      <View style={s.searchBox}>
        <Ionicons name="search" size={19} color={colors.mutedForeground} />
        <TextInput
          style={s.searchInput}
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="ابحث عن عميل أو نوع أو منطقة"
          placeholderTextColor={colors.mutedForeground}
          textAlign="right"
          returnKeyType="search"
        />
        {searchTerm ? (
          <TouchableOpacity onPress={() => setSearchTerm('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Send Location Button */}
      <View style={s.locSection}>
        <TouchableOpacity style={s.locBtn} onPress={getLocation} disabled={locLoading} activeOpacity={0.85}>
          {locLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="navigate" size={20} color="#fff" />
              <Text style={s.locBtnText}>أرسل موقعك الحالي</Text>
            </>
          )}
        </TouchableOpacity>
        {location && (
          <Text style={s.locStatus}>
            ✓ تم تحديد الموقع — {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={s.addCustomerBtn}
        onPress={() => router.push('/visit/add-customer')}
        activeOpacity={0.85}
      >
        <Ionicons name="person-add" size={19} color="#fff" />
        <Text style={s.addCustomerBtnText}>+ عميل جديد غير مخدوم</Text>
      </TouchableOpacity>

      {/* Type Filter Pills */}
      {location && customers.length > 0 && (
        <View style={s.filterRow}>
          {customerTypes.map(type => (
            <TouchableOpacity
              key={type}
              style={[s.filterPill, typeFilter === type && s.filterPillActive]}
              onPress={() => setTypeFilter(type)}
              activeOpacity={0.8}
            >
              <Text style={[s.filterPillText, typeFilter === type && s.filterPillTextActive]}>{type}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Customers List */}
      {!location ? (
        <View style={s.placeholder}>
          <Ionicons name="location-outline" size={48} color={colors.mutedForeground} />
          <Text style={s.placeholderText}>اضغط على الزر أعلاه لتحديد موقعك</Text>
          <Text style={s.placeholderSub}>سيتم عرض أقرب 5 عملاء</Text>
        </View>
      ) : customersLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : nearest.length === 0 ? (
        <View style={s.placeholder}>
          <Ionicons name="people-outline" size={48} color={colors.mutedForeground} />
          <Text style={s.placeholderText}>لا يوجد عملاء مسجلون</Text>
        </View>
      ) : (
        <>
          <Text style={s.sectionTitle}>{typeFilter === 'الكل' ? 'أقرب العملاء' : typeFilter}</Text>
          <FlatList
            data={nearest}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={s.customerCard}
                onPress={() => router.push(`/visit/${item.id}?lat=${location.lat}&lng=${location.lng}`)}
                activeOpacity={0.85}
              >
                <View style={s.cardRight}>
                  <View style={s.rankBadge}>
                    <Text style={s.rankText}>{index + 1}</Text>
                  </View>
                  <View>
                    <Text style={s.customerName}>{item.name}</Text>
                    <Text style={s.customerAddress}>{item.address}</Text>
                  </View>
                </View>
                <View style={s.cardLeft}>
                  <View style={[s.typeBadge, { backgroundColor: `${typeColor(item.type)}18` }]}>
                    <Text style={[s.typeText, { color: typeColor(item.type) }]}>{item.type}</Text>
                  </View>
                  <Text style={s.distanceText}>{formatDistance(item.distance / 1000)}</Text>
                  <Ionicons name="chevron-back" size={16} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
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
    headerTitle: { fontSize: 21, fontWeight: '700' as const, color: '#fff', fontFamily: 'Cairo_700Bold', textAlign: 'right' },
    headerEyebrow: { fontSize: 9, color: 'rgba(255,255,255,0.72)', fontFamily: 'Cairo_700Bold', letterSpacing: 0.8, textAlign: 'right', marginBottom: 3 },
    headerIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
    commandCard: {
      backgroundColor: colors.card, marginHorizontal: 16, marginTop: 14, marginBottom: 10,
      borderRadius: 16, padding: 15, borderWidth: 1, borderColor: colors.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05, shadowRadius: 7, elevation: 2,
    },
    commandCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    commandCopy: { flex: 1, alignItems: 'flex-end' },
    commandTitle: { color: colors.foreground, fontSize: 15, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const, textAlign: 'right' },
    commandSubtitle: { color: colors.mutedForeground, fontSize: 11, fontFamily: 'Cairo_400Regular', textAlign: 'right', marginTop: 2 },
    commandBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${colors.accent}16`, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9 },
    commandBadgeText: { color: colors.accent, fontSize: 10, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const },
    commandStats: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
    commandStat: { flex: 1, alignItems: 'center', gap: 1 },
    commandStatValue: { color: colors.primary, fontSize: 18, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const },
    commandStatLabel: { color: colors.mutedForeground, fontSize: 10, fontFamily: 'Cairo_400Regular', textAlign: 'center' },
    commandStatDivider: { height: 28, width: 1, backgroundColor: colors.border },
    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10,
      minHeight: 46, paddingHorizontal: 12, borderRadius: 13,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    },
    searchInput: { flex: 1, color: colors.foreground, fontSize: 13, fontFamily: 'Cairo_400Regular', paddingVertical: 9 },
    locSection: { padding: 16, backgroundColor: colors.card, marginBottom: 8 },
    locBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.primary, borderRadius: 12,
      paddingVertical: 14, paddingHorizontal: 20, justifyContent: 'center',
    },
    locBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
    locStatus: { fontSize: 12, color: colors.success, fontFamily: 'Cairo_400Regular', textAlign: 'center', marginTop: 8 },
    addCustomerBtn: {
      marginHorizontal: 16,
      marginBottom: 8,
      backgroundColor: colors.customerSuccess,
      borderRadius: 11,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    addCustomerBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const },
    placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingBottom: 80 },
    placeholderText: { fontSize: 16, color: colors.mutedForeground, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const, textAlign: 'center' },
    placeholderSub: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'center' },
    sectionTitle: {
      fontSize: 15, fontWeight: '700' as const, color: colors.foreground,
      fontFamily: 'Cairo_700Bold', textAlign: 'right',
      paddingHorizontal: 20, paddingVertical: 12,
    },
    customerCard: {
      backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    cardRight: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rankBadge: {
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center',
    },
    rankText: { fontSize: 12, fontWeight: '700' as const, color: colors.primary, fontFamily: 'Cairo_700Bold' },
    customerName: { fontSize: 15, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Cairo_700Bold', textAlign: 'right' },
    customerAddress: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'right', marginTop: 2 },
    typeBadge: { borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 },
    typeText: { fontSize: 11, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
    distanceText: { fontSize: 13, color: colors.primary, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const },
    filterRow: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 8,
      paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.card,
    },
    filterPill: {
      paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
      backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    },
    filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterPillText: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
    filterPillTextActive: { color: '#fff' },
  });
