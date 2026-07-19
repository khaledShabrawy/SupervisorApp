import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { distanceKm, formatDistance } from '@/lib/haversine';
import { supabase } from '@/lib/supabase';
import type { Customer, CustomerWithDistance } from '@/lib/types';

export default function VisitTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
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
      .map((c) => ({
        ...c,
        distance: distanceKm(location.lat, location.lng, c.latitude, c.longitude) * 1000,
      }))
      .sort((a, b) => a.distance - b.distance);
  }, [location, customers]);

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
        <Text style={s.headerTitle}>زيارة جديدة</Text>
        <Ionicons name="location" size={22} color="#fff" />
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
    headerTitle: { fontSize: 20, fontWeight: '700' as const, color: '#fff', fontFamily: 'Cairo_700Bold' },
    locSection: { padding: 16, backgroundColor: colors.card, marginBottom: 8 },
    locBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.primary, borderRadius: 12,
      paddingVertical: 14, paddingHorizontal: 20, justifyContent: 'center',
    },
    locBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
    locStatus: { fontSize: 12, color: colors.success, fontFamily: 'Cairo_400Regular', textAlign: 'center', marginTop: 8 },
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
