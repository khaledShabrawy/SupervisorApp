import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useOffline } from '@/contexts/OfflineContext';
import { useVisit } from '@/contexts/VisitContext';
import { useColors } from '@/hooks/useColors';
import { enqueue } from '@/lib/offlineQueue';
import { supabase } from '@/lib/supabase';
import type { OrderItem, Product } from '@/lib/types';

export default function OrderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { activeVisit } = useVisit();
  const { supervisor } = useAuth();
  const { isOnline, refreshCount } = useOffline();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [suggestedIds, setSuggestedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const s = styles(colors, insets);

  // ── Suggested order from last visit ────────────────────────────────────
  const { data: lastOrderItems } = useQuery<Array<{ product_id: string; quantity: number }>>({
    queryKey: ['last-order', activeVisit?.customerId],
    queryFn: async () => {
      if (!activeVisit?.customerId) return [];
      const { data: lastVisit } = await supabase
        .from('visits')
        .select('id')
        .eq('customer_id', activeVisit.customerId)
        .neq('id', activeVisit.visitId)
        .order('visit_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastVisit) return [];
      const { data: orders } = await supabase
        .from('orders')
        .select('product_id, quantity')
        .eq('visit_id', lastVisit.id);
      return orders ?? [];
    },
    enabled: !!activeVisit?.customerId && isOnline,
  });

  // Pre-fill cart with suggested quantities (only when cart is empty)
  useEffect(() => {
    if (lastOrderItems && lastOrderItems.length > 0 && Object.keys(cart).length === 0) {
      const suggested: Record<string, number> = {};
      lastOrderItems.forEach((o) => { suggested[o.product_id] = o.quantity; });
      setCart(suggested);
      setSuggestedIds(new Set(lastOrderItems.map((o) => o.product_id)));
    }
  }, [lastOrderItems]);

  useEffect(() => {
    (async () => {
      if (isOnline) {
        const { data } = await supabase.from('products').select('*').eq('is_active', true);
        setProducts((data ?? []) as Product[]);
      }
      setLoading(false);
    })();
  }, [isOnline]);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    return products.filter(
      (p) => p.name.includes(search) || p.category.includes(search)
    );
  }, [products, search]);

  const setQty = (id: string, qty: number) => {
    if (qty <= 0) {
      const next = { ...cart };
      delete next[id];
      setCart(next);
    } else {
      setCart((prev) => ({ ...prev, [id]: qty }));
    }
    Haptics.selectionAsync();
  };

  const cartItems: OrderItem[] = products
    .filter((p) => (cart[p.id] ?? 0) > 0)
    .map((p) => ({ product_id: p.id, product_name: p.name, category: p.category, quantity: cart[p.id] }));

  const totalUnits = cartItems.reduce((sum, i) => sum + i.quantity, 0);

  const handleSubmit = async () => {
    if (!activeVisit || !supervisor) { Alert.alert('خطأ', 'لا توجد زيارة نشطة'); return; }
    if (cartItems.length === 0) { Alert.alert('تنبيه', 'يرجى إضافة منتج واحد على الأقل'); return; }
    setSubmitting(true);
    try {
      const mustQueue = !isOnline || activeVisit.isPending;

      if (mustQueue) {
        // ── Offline / pending-visit path ─────────────────────────────────────
        for (const i of cartItems) {
          await enqueue(
            'orders',
            {
              supervisor_id: supervisor.id,
              customer_id: activeVisit.customerId,
              product_id: i.product_id,
              quantity: i.quantity,
              status: 'pending',
              // visit_id will be resolved at sync time via pendingVisitLocalId
            },
            activeVisit.visitId  // the LOCAL_ id
          );
        }
        await refreshCount();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          '💾 محفوظ محلياً',
          `${cartItems.length} أصناف · ${totalUnits} وحدة — سيُرسل عند عودة الاتصال`,
          [{ text: 'حسناً', onPress: () => router.back() }]
        );
      } else {
        // ── Online path ──────────────────────────────────────────────────────
        const rows = cartItems.map((i) => ({
          visit_id: activeVisit.visitId,
          supervisor_id: supervisor.id,
          customer_id: activeVisit.customerId,
          product_id: i.product_id,
          quantity: i.quantity,
          status: 'pending',
        }));
        const { error } = await supabase.from('orders').insert(rows);
        if (error) throw error;
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('✅ تم تسجيل الأوردر بنجاح', `${cartItems.length} أصناف · ${totalUnits} وحدة`, [
          { text: 'حسناً', onPress: () => router.back() },
        ]);
      }
    } catch {
      Alert.alert('خطأ', 'تعذر إرسال الأوردر');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Offline indicator */}
      {(!isOnline || activeVisit?.isPending) && (
        <View style={s.offlineBanner}>
          <Ionicons name="cloud-offline" size={16} color={colors.warning} />
          <Text style={s.offlineText}>
            {!isOnline ? 'لا يوجد اتصال — سيُحفظ الأوردر محلياً' : 'الزيارة معلقة — سيُرسل الأوردر مع الزيارة'}
          </Text>
        </View>
      )}

      {/* Search */}
      <View style={s.searchBar}>
        <Ionicons name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="ابحث عن منتج..."
          placeholderTextColor={colors.mutedForeground}
          textAlign="right"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        renderItem={({ item }) => {
          const qty = cart[item.id] ?? 0;
          return (
            <View style={[s.productRow, qty > 0 && s.productRowSelected]}>
              <View style={s.qtyControl}>
                <TouchableOpacity style={s.qtyBtn} onPress={() => setQty(item.id, qty + 1)} activeOpacity={0.8}>
                  <Ionicons name="add" size={18} color={colors.primaryForeground} />
                </TouchableOpacity>
                <Text style={s.qtyNum}>{qty}</Text>
                <TouchableOpacity style={[s.qtyBtn, { backgroundColor: qty > 0 ? colors.destructive : colors.border }]}
                  onPress={() => setQty(item.id, qty - 1)} activeOpacity={0.8} disabled={qty === 0}>
                  <Ionicons name="remove" size={18} color={colors.primaryForeground} />
                </TouchableOpacity>
              </View>
              <View style={s.productInfo}>
                <View style={s.productNameRow}>
                  <Text style={s.productName}>{item.name}</Text>
                  {suggestedIds.has(item.id) && qty > 0 && (
                    <View style={s.suggestedBadge}>
                      <Text style={s.suggestedText}>مقترح</Text>
                    </View>
                  )}
                </View>
                <Text style={s.productCategory}>{item.category}</Text>
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          cartItems.length > 0 ? (
            <View style={s.cartSummary}>
              <Text style={s.cartTitle}>ملخص الأوردر</Text>
              {cartItems.map((i) => (
                <View key={i.product_id} style={s.cartRow}>
                  <Text style={s.cartQty}>× {i.quantity}</Text>
                  <Text style={s.cartProduct}>{i.product_name}</Text>
                </View>
              ))}
              <View style={s.cartTotal}>
                <Text style={s.cartTotalLabel}>المجموع</Text>
                <Text style={s.cartTotalValue}>{totalUnits} وحدة</Text>
              </View>
              <TouchableOpacity
                style={[s.submitBtn, submitting && s.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <>
                    <Ionicons name={!isOnline || activeVisit?.isPending ? 'cloud-upload' : 'checkmark-circle'} size={20} color={colors.primaryForeground} />
                    <Text style={s.submitBtnText}>
                      {!isOnline || activeVisit?.isPending ? 'حفظ محلياً' : 'إرسال الأوردر'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>, _insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    offlineBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.warningBackground, paddingHorizontal: 16, paddingVertical: 10,
    },
    offlineText: { fontSize: 12, color: colors.warning, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const, flex: 1, textAlign: 'right' },
    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      margin: 16, backgroundColor: colors.card, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 10,
      borderWidth: 1, borderColor: colors.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: colors.foreground, fontFamily: 'Cairo_400Regular' },
    listContent: { paddingHorizontal: 16, paddingBottom: 40 },
    productRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8,
    },
    productRowSelected: { borderWidth: 1.5, borderColor: colors.primary },
    productInfo: { flex: 1, alignItems: 'flex-end', marginLeft: 10 },
    productNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
    productName: { fontSize: 14, fontWeight: '600' as const, color: colors.foreground, fontFamily: 'Cairo_600SemiBold', textAlign: 'right' },
    productCategory: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'right' },
    suggestedBadge: { backgroundColor: colors.infoBackground, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
    suggestedText: { fontSize: 10, color: colors.info, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
    qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    qtyBtn: {
      width: 28, height: 28, borderRadius: 7,
      backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
    },
    qtyNum: { fontSize: 15, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Cairo_700Bold', minWidth: 24, textAlign: 'center' },
    cartSummary: {
      backgroundColor: colors.card, borderRadius: 16, padding: 16, marginTop: 16,
      borderWidth: 1, borderColor: colors.border,
    },
    cartTitle: { fontSize: 16, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Cairo_700Bold', textAlign: 'right', marginBottom: 12 },
    cartRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
    cartProduct: { fontSize: 14, color: colors.foreground, fontFamily: 'Cairo_400Regular', textAlign: 'right', flex: 1 },
    cartQty: { fontSize: 14, fontWeight: '600' as const, color: colors.primary, fontFamily: 'Cairo_700Bold' },
    cartTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 4 },
    cartTotalLabel: { fontSize: 15, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Cairo_700Bold' },
    cartTotalValue: { fontSize: 15, fontWeight: '700' as const, color: colors.primary, fontFamily: 'Cairo_700Bold' },
    submitBtn: {
      backgroundColor: colors.success, borderRadius: 14, paddingVertical: 15,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' as const, fontFamily: 'Cairo_700Bold' },
  });
