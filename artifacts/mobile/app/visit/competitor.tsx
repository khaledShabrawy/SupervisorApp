import React, { useState } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOffline } from '@/contexts/OfflineContext';
import { useVisit } from '@/contexts/VisitContext';
import { useColors } from '@/hooks/useColors';
import { enqueue } from '@/lib/offlineQueue';
import { supabase } from '@/lib/supabase';
import type { CompetitorProduct } from '@/lib/types';

export default function CompetitorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { activeVisit } = useVisit();
  const { isOnline, refreshCount } = useOffline();
  const [items, setItems] = useState<CompetitorProduct[]>([]);
  const [brand, setBrand] = useState('');
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const s = styles(colors, insets);

  const addItem = () => {
    if (!brand.trim() || !product.trim()) {
      Alert.alert('تنبيه', 'يرجى إدخال اسم الماركة والمنتج');
      return;
    }
    Haptics.selectionAsync();
    const newItem: CompetitorProduct = {
      id: `${Date.now()}`,
      brand_name: brand.trim(),
      product_name: product.trim(),
      quantity: parseInt(quantity) || 0,
    };
    setItems((prev) => [...prev, newItem]);
    setBrand('');
    setProduct('');
    setQuantity('');
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const handleSave = async () => {
    if (!activeVisit) { Alert.alert('خطأ', 'لا توجد زيارة نشطة'); return; }
    if (items.length === 0) { Alert.alert('تنبيه', 'يرجى إضافة منتج واحد على الأقل'); return; }
    setSaving(true);
    try {
      const mustQueue = !isOnline || activeVisit.isPending;

      const rows = items.map((i) => ({
        brand_name: i.brand_name,
        product_name: i.product_name,
        quantity: i.quantity,
        photo_url: null,
      }));

      if (mustQueue) {
        for (const row of rows) {
          await enqueue('competitor_products', row, activeVisit.visitId);
        }
        await refreshCount();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('💾 محفوظ محلياً', `${items.length} منتج — سيُرسل عند عودة الاتصال`, [
          { text: 'حسناً', onPress: () => router.back() },
        ]);
      } else {
        const onlineRows = rows.map((r) => ({ ...r, visit_id: activeVisit.visitId }));
        const { error } = await supabase.from('competitor_products').insert(onlineRows);
        if (error) throw error;
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('✅ تم', 'تم حفظ منتجات المنافسين', [{ text: 'حسناً', onPress: () => router.back() }]);
      }
    } catch {
      Alert.alert('خطأ', 'تعذر حفظ البيانات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.container}>
      {(!isOnline || activeVisit?.isPending) && (
        <View style={s.offlineBanner}>
          <Ionicons name="cloud-offline" size={16} color="#92400E" />
          <Text style={s.offlineText}>
            {!isOnline ? 'لا يوجد اتصال — سيُحفظ محلياً' : 'الزيارة معلقة — سيُرسل مع الزيارة'}
          </Text>
        </View>
      )}

      {/* Add Form */}
      <View style={s.formCard}>
        <Text style={s.formTitle}>إضافة منتج منافس</Text>
        <View style={s.inputRow}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={brand}
            onChangeText={setBrand}
            placeholder="اسم الماركة"
            placeholderTextColor={colors.mutedForeground}
            textAlign="right"
          />
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={product}
            onChangeText={setProduct}
            placeholder="اسم المنتج"
            placeholderTextColor={colors.mutedForeground}
            textAlign="right"
          />
        </View>
        <View style={s.inputRow}>
          <TextInput
            style={[s.input, { width: 100 }]}
            value={quantity}
            onChangeText={setQuantity}
            placeholder="الكمية"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            textAlign="center"
          />
          <TouchableOpacity style={s.addBtn} onPress={addItem} activeOpacity={0.85}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={s.addBtnText}>إضافة</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="pricetag-outline" size={40} color={colors.mutedForeground} />
            <Text style={s.emptyText}>لم تتم إضافة أي منتجات بعد</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.itemCard}>
            <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={18} color={colors.destructive} />
            </TouchableOpacity>
            <View style={s.itemInfo}>
              <Text style={s.itemBrand}>{item.brand_name}</Text>
              <Text style={s.itemProduct}>{item.product_name}</Text>
            </View>
            <View style={s.qtyBadge}>
              <Text style={s.qtyText}>{item.quantity}</Text>
            </View>
          </View>
        )}
        ListFooterComponent={
          items.length > 0 ? (
            <TouchableOpacity
              style={[s.saveBtn, saving && s.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Ionicons name={!isOnline || activeVisit?.isPending ? 'cloud-upload' : 'save'} size={20} color="#fff" />
              <Text style={s.saveBtnText}>
                {!isOnline || activeVisit?.isPending ? `حفظ محلياً (${items.length})` : `حفظ المنتجات (${items.length})`}
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>, _insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    offlineBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 10,
    },
    offlineText: { fontSize: 12, color: '#92400E', fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const, flex: 1, textAlign: 'right' },
    formCard: {
      backgroundColor: colors.card, margin: 16, borderRadius: 16, padding: 16,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },
    formTitle: { fontSize: 15, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Cairo_700Bold', textAlign: 'right', marginBottom: 12 },
    inputRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    input: {
      borderWidth: 1.5, borderColor: colors.border, borderRadius: 10,
      paddingVertical: 10, paddingHorizontal: 12, fontSize: 14,
      color: colors.foreground, fontFamily: 'Cairo_400Regular',
      backgroundColor: colors.muted,
    },
    addBtn: {
      backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16,
      flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
    },
    addBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
    listContent: { paddingHorizontal: 16, paddingBottom: 40 },
    empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyText: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' },
    itemCard: {
      backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8,
      flexDirection: 'row', alignItems: 'center', gap: 10,
    },
    itemInfo: { flex: 1, alignItems: 'flex-end' },
    itemBrand: { fontSize: 14, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Cairo_700Bold', textAlign: 'right' },
    itemProduct: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'right' },
    qtyBadge: {
      backgroundColor: `${colors.warning}18`, borderRadius: 8,
      paddingVertical: 4, paddingHorizontal: 10,
    },
    qtyText: { fontSize: 13, fontWeight: '700' as const, color: colors.warning, fontFamily: 'Cairo_700Bold' },
    saveBtn: {
      backgroundColor: colors.success, borderRadius: 14, paddingVertical: 15,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8,
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' as const, fontFamily: 'Cairo_700Bold' },
  });
