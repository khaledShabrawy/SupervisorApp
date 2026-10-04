import React, { useMemo, useState } from 'react';
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
import { useColors } from '@/hooks/useColors';
import { supabase } from '@/lib/supabase';
import type { CompetitorPriceRecord, Product } from '@/lib/types';

export default function PriceIndexScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { supervisor } = useAuth();
  const [activeBrand, setActiveBrand] = useState<string>('الكل');
  const s = styles(colors, insets);

  // Fetch competitor prices (last 30 days)
  const { data: compRecords = [], isLoading: compLoading } = useQuery<CompetitorPriceRecord[]>({
    queryKey: ['competitor-prices', supervisor?.id],
    queryFn: async () => {
      if (!supervisor) return [];
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from('competitor_products')
        .select('*, visits!inner(visit_date, customer_id, supervisor_id, customers(name, type))')
        .eq('visits.supervisor_id', supervisor.id)
        .not('price', 'is', null)
        .gte('visits.visit_date', since.toISOString())
        .order('created_at', { ascending: false });
      return (data ?? []) as CompetitorPriceRecord[];
    },
    enabled: !!supervisor,
  });

  // Fetch our products with prices
  const { data: ourProducts = [], isLoading: prodLoading } = useQuery<Product[]>({
    queryKey: ['products-prices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true);
      return (data ?? []) as Product[];
    },
  });

  const isLoading = compLoading || prodLoading;

  // Group competitor records by brand
  const brands = useMemo(() => {
    const b = [...new Set(compRecords.map(r => r.brand_name))];
    return ['الكل', ...b];
  }, [compRecords]);

  const filtered = useMemo(() =>
    activeBrand === 'الكل' ? compRecords : compRecords.filter(r => r.brand_name === activeBrand),
    [compRecords, activeBrand]);

  // Group by brand → avg price per product
  const brandSummary = useMemo(() => {
    const map: Record<string, { brand: string; products: { name: string; avgPrice: number; count: number }[] }> = {};
    compRecords.forEach(r => {
      if (r.price == null) return;
      if (!map[r.brand_name]) map[r.brand_name] = { brand: r.brand_name, products: [] };
      const existing = map[r.brand_name].products.find(p => p.name === r.product_name);
      if (existing) {
        existing.avgPrice = (existing.avgPrice * existing.count + r.price) / (existing.count + 1);
        existing.count++;
      } else {
        map[r.brand_name].products.push({ name: r.product_name, avgPrice: r.price, count: 1 });
      }
    });
    return Object.values(map);
  }, [compRecords]);

  // Price index: compare our avg product price vs competitor avg
  const ourAvgPrice = useMemo(() => {
    const priced = (ourProducts as any[]).filter(p => p.price != null);
    if (!priced.length) return 0;
    return priced.reduce((s: number, p: any) => s + p.price, 0) / priced.length;
  }, [ourProducts]);

  const compAvgPrice = useMemo(() => {
    const priced = compRecords.filter(r => r.price != null);
    if (!priced.length) return 0;
    return priced.reduce((s, r) => s + (r.price ?? 0), 0) / priced.length;
  }, [compRecords]);

  const priceIndex = compAvgPrice > 0 ? Math.round((ourAvgPrice / compAvgPrice) * 100) : null;
  const indexColor = priceIndex == null ? colors.mutedForeground
    : priceIndex <= 95 ? colors.success
    : priceIndex <= 105 ? colors.warning
    : colors.destructive;
  const indexLabel = priceIndex == null ? '—'
    : priceIndex <= 95 ? 'أسعارنا تنافسية ✅'
    : priceIndex <= 105 ? 'أسعار متقاربة ⚖️'
    : 'أسعارنا أعلى ⚠️';

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-forward" size={24} color={colors.primaryForeground} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Price Index</Text>
        <Ionicons name="trending-up" size={22} color={colors.primaryForeground} />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : compRecords.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="pricetag-outline" size={56} color={colors.mutedForeground} />
          <Text style={s.emptyTitle}>لا توجد بيانات أسعار</Text>
          <Text style={s.emptyBody}>
            أضف سعر المنافس عند تسجيل منتجات المنافسين في شاشة الزيارة
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* Summary Cards */}
          <View style={s.summaryRow}>
            <View style={[s.summaryCard, { borderTopColor: indexColor }]}>
              <Text style={[s.summaryBig, { color: indexColor }]}>
                {priceIndex != null ? `${priceIndex}` : '—'}
              </Text>
              <Text style={s.summaryLabel}>Price Index</Text>
              <Text style={[s.summaryBadge, { color: indexColor }]}>{indexLabel}</Text>
            </View>
            <View style={[s.summaryCard, { borderTopColor: colors.primary }]}>
              <Text style={[s.summaryBig, { color: colors.primary }]}>
                {ourAvgPrice > 0 ? ourAvgPrice.toFixed(1) : '—'}
              </Text>
              <Text style={s.summaryLabel}>متوسط سعرنا</Text>
              <Text style={s.summaryUnit}>ج.م</Text>
            </View>
            <View style={[s.summaryCard, { borderTopColor: colors.warning }]}>
              <Text style={[s.summaryBig, { color: colors.warning }]}>
                {compAvgPrice > 0 ? compAvgPrice.toFixed(1) : '—'}
              </Text>
              <Text style={s.summaryLabel}>متوسط المنافس</Text>
              <Text style={s.summaryUnit}>ج.م</Text>
            </View>
          </View>

          {/* Price Index Explanation */}
          <View style={s.explainCard}>
            <Text style={s.explainText}>
              💡 الـ Price Index = (سعرنا ÷ سعر المنافس) × 100{'\n'}
              أقل من 100 = سعرنا أرخص ✅ · أكبر من 100 = سعرنا أغلى ⚠️
            </Text>
          </View>

          {/* Brand Filter Pills */}
          <View style={s.filterRow}>
            {brands.map(b => (
              <TouchableOpacity
                key={b}
                style={[s.pill, activeBrand === b && s.pillActive]}
                onPress={() => setActiveBrand(b)}
                activeOpacity={0.8}
              >
                <Text style={[s.pillText, activeBrand === b && s.pillTextActive]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Brand Summary Cards */}
          {brandSummary.filter(b => activeBrand === 'الكل' || b.brand === activeBrand).map(brand => (
            <View key={brand.brand} style={s.brandCard}>
              <View style={s.brandHeader}>
                <View style={[s.brandBadge, { backgroundColor: `${colors.warning}18` }]}>
                  <Text style={[s.brandBadgeText, { color: colors.warning }]}>{brand.brand}</Text>
                </View>
                <Text style={s.brandCount}>{brand.products.length} منتج</Text>
              </View>
              {brand.products.map(p => {
                // Find matching our product by name similarity
                const ourMatch = (ourProducts as any[]).find((op: any) =>
                  op.name.includes(p.name.split(' ')[0]) || p.name.includes(op.name.split(' ')[0])
                );
                const ourPrice = ourMatch?.price ?? null;
                const idx = ourPrice && p.avgPrice > 0 ? Math.round((ourPrice / p.avgPrice) * 100) : null;
                const idxColor = idx == null ? colors.mutedForeground
                  : idx <= 95 ? colors.success
                  : idx <= 105 ? colors.warning
                  : colors.destructive;
                return (
                  <View key={p.name} style={s.productRow}>
                    <View style={s.productLeft}>
                      {idx != null && (
                        <View style={[s.indexBadge, { backgroundColor: `${idxColor}18` }]}>
                          <Text style={[s.indexText, { color: idxColor }]}>{idx}</Text>
                        </View>
                      )}
                      {ourPrice != null && (
                        <View style={s.priceCol}>
                          <Text style={s.priceVal}>{ourPrice.toFixed(1)}</Text>
                          <Text style={s.priceLabel}>سعرنا</Text>
                        </View>
                      )}
                    </View>
                    <View style={s.productInfo}>
                      <Text style={s.productName}>{p.name}</Text>
                      <Text style={s.productMeta}>{p.count} سجل · آخر 30 يوم</Text>
                    </View>
                    <View style={s.priceCol}>
                      <Text style={[s.priceVal, { color: colors.warning }]}>{p.avgPrice.toFixed(1)}</Text>
                      <Text style={s.priceLabel}>المنافس</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}

          {/* Recent Entries */}
          <Text style={s.sectionTitle}>آخر السجلات</Text>
          {filtered.slice(0, 10).map(r => (
            <View key={r.id} style={s.recordRow}>
              <View style={s.recordLeft}>
                {r.price != null && (
                  <Text style={[s.recordPrice, { color: colors.warning }]}>{r.price.toFixed(1)} ج.م</Text>
                )}
                <Text style={s.recordDate}>
                  {new Date(r.visits?.visit_date ?? r.created_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <View style={s.recordInfo}>
                <Text style={s.recordProduct}>{r.brand_name} — {r.product_name}</Text>
                <Text style={s.recordCustomer}>{(r.visits as any)?.customers?.name ?? '—'}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
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
    headerTitle: { fontSize: 20, fontWeight: '700' as const, color: colors.primaryForeground, fontFamily: 'Cairo_700Bold' },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12, marginTop: 60 },
    emptyTitle: { fontSize: 18, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Cairo_700Bold', textAlign: 'center' },
    emptyBody: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'center', lineHeight: 22 },
    summaryRow: { flexDirection: 'row', padding: 16, gap: 10 },
    summaryCard: {
      flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 12,
      borderTopWidth: 3, alignItems: 'center', gap: 3,
      shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    summaryBig: { fontSize: 24, fontWeight: '700' as const, fontFamily: 'Cairo_700Bold' },
    summaryLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'center' },
    summaryBadge: { fontSize: 9, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const, textAlign: 'center' },
    summaryUnit: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' },
    explainCard: {
      backgroundColor: `${colors.accent}18`, borderRadius: 12, padding: 12,
      marginHorizontal: 16, marginBottom: 12,
    },
    explainText: { fontSize: 12, color: colors.foreground, fontFamily: 'Cairo_400Regular', textAlign: 'right', lineHeight: 20 },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
    pill: {
      paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
      backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    },
    pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    pillText: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
    pillTextActive: { color: colors.primaryForeground },
    brandCard: {
      backgroundColor: colors.card, borderRadius: 14, marginHorizontal: 16, marginBottom: 12, padding: 14,
      shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    brandHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    brandBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
    brandBadgeText: { fontSize: 13, fontWeight: '700' as const, fontFamily: 'Cairo_700Bold' },
    brandCount: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' },
    productRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 8,
    },
    productLeft: { alignItems: 'center', gap: 4 },
    indexBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    indexText: { fontSize: 13, fontWeight: '700' as const, fontFamily: 'Cairo_700Bold' },
    productInfo: { flex: 1, alignItems: 'flex-end' },
    productName: { fontSize: 13, fontWeight: '600' as const, color: colors.foreground, fontFamily: 'Cairo_600SemiBold', textAlign: 'right' },
    productMeta: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'right' },
    priceCol: { alignItems: 'center', minWidth: 48 },
    priceVal: { fontSize: 15, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Cairo_700Bold' },
    priceLabel: { fontSize: 9, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' },
    sectionTitle: {
      fontSize: 15, fontWeight: '700' as const, color: colors.foreground,
      fontFamily: 'Cairo_700Bold', textAlign: 'right',
      paddingHorizontal: 16, paddingBottom: 8,
    },
    recordRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.card, borderRadius: 12, marginHorizontal: 16, marginBottom: 8, padding: 12, gap: 10,
    },
    recordInfo: { flex: 1, alignItems: 'flex-end' },
    recordProduct: { fontSize: 13, fontWeight: '600' as const, color: colors.foreground, fontFamily: 'Cairo_600SemiBold', textAlign: 'right' },
    recordCustomer: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'right' },
    recordLeft: { alignItems: 'center', gap: 2 },
    recordPrice: { fontSize: 14, fontWeight: '700' as const, fontFamily: 'Cairo_700Bold' },
    recordDate: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' },
  });
