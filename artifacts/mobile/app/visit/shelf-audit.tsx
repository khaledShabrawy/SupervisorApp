import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOffline } from '@/contexts/OfflineContext';
import { useVisit } from '@/contexts/VisitContext';
import { useColors } from '@/hooks/useColors';
import { enqueue } from '@/lib/offlineQueue';
import { supabase } from '@/lib/supabase';
import type { AIAnalysis, Product, ShelfAuditItem } from '@/lib/types';

/**
 * Calls the server-side proxy at /api/analyze-shelf.
 * The Anthropic key stays on the server — never bundled into the app.
 */
async function analyzeShelfPhoto(base64: string): Promise<AIAnalysis | null> {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return null;
  try {
    const res = await fetch(`https://${domain}/api/analyze-shelf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 }),
    });
    if (!res.ok) return null;
    return (await res.json()) as AIAnalysis;
  } catch {
    return null;
  }
}

export default function ShelfAuditScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { activeVisit } = useVisit();
  const { isOnline, refreshCount } = useOffline();
  const [products, setProducts] = useState<Product[]>([]);
  const [auditItems, setAuditItems] = useState<ShelfAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const s = styles(colors, insets);

  useEffect(() => {
    (async () => {
      if (isOnline) {
        const { data } = await supabase.from('products').select('*').eq('is_active', true);
        const prods = (data ?? []) as Product[];
        setProducts(prods);
        setAuditItems(prods.map((p) => ({
          product_id: p.id,
          product_name: p.name,
          category: p.category,
          is_present: false,
          quantity: 0,
        })));
      }
      setLoading(false);
    })();
  }, [isOnline]);

  const toggle = (id: string) => {
    setAuditItems((prev) =>
      prev.map((i) => (i.product_id === id ? { ...i, is_present: !i.is_present, quantity: !i.is_present ? 1 : 0 } : i))
    );
    Haptics.selectionAsync();
  };

  const setQty = (id: string, qty: string) => {
    setAuditItems((prev) =>
      prev.map((i) => (i.product_id === id ? { ...i, quantity: parseInt(qty) || 0 } : i))
    );
  };

  const takePhoto = async (id: string) => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];

    setAuditItems((prev) =>
      prev.map((i) => (i.product_id === id ? { ...i, photo_uri: asset.uri, photo_base64: asset.base64 ?? undefined } : i))
    );

    if (asset.base64) {
      setAiLoading((prev) => ({ ...prev, [id]: true }));
      const analysis = await analyzeShelfPhoto(asset.base64);
      setAuditItems((prev) =>
        prev.map((i) => {
          if (i.product_id !== id) return i;
          return {
            ...i,
            ai_analysis: analysis,
            is_present: analysis?.is_present ?? i.is_present,
            quantity: analysis?.estimated_quantity ?? i.quantity,
          };
        })
      );
      setAiLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleSubmit = async () => {
    if (!activeVisit) { Alert.alert('خطأ', 'لا توجد زيارة نشطة'); return; }
    setSubmitting(true);
    try {
      const mustQueue = !isOnline || activeVisit.isPending;

      const rows = auditItems.map((item) => ({
        product_id: item.product_id,
        is_present: item.is_present,
        quantity: item.quantity,
        photo_url: null,
        ai_analysis: item.ai_analysis ?? null,
        display_order: item.ai_analysis?.display_order ?? null,
      }));

      if (mustQueue) {
        for (const row of rows) {
          await enqueue('shelf_audit', row, activeVisit.visitId);
        }
        await refreshCount();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('💾 محفوظ محلياً', 'كشف الرف سيُرسل عند عودة الاتصال', [
          { text: 'حسناً', onPress: () => router.back() },
        ]);
      } else {
        const onlineRows = rows.map((r) => ({ ...r, visit_id: activeVisit.visitId }));
        const { error } = await supabase.from('shelf_audit').insert(onlineRows);
        if (error) throw error;
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('✅ تم', 'تم حفظ كشف الرف بنجاح', [{ text: 'حسناً', onPress: () => router.back() }]);
      }
    } catch {
      Alert.alert('خطأ', 'تعذر حفظ كشف الرف');
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
      {(!isOnline || activeVisit?.isPending) && (
        <View style={s.offlineBanner}>
          <Ionicons name="cloud-offline" size={16} color="#92400E" />
          <Text style={s.offlineText}>
            {!isOnline ? 'لا يوجد اتصال — سيُحفظ الكشف محلياً' : 'الزيارة معلقة — سيُرسل مع الزيارة'}
          </Text>
        </View>
      )}

      <FlatList
        data={auditItems}
        keyExtractor={(item) => item.product_id}
        contentContainerStyle={s.listContent}
        renderItem={({ item }) => (
          <View style={s.productCard}>
            <View style={s.productHeader}>
              <TouchableOpacity
                style={[s.toggle, item.is_present ? s.toggleOn : s.toggleOff]}
                onPress={() => toggle(item.product_id)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={item.is_present ? 'checkmark-circle' : 'close-circle'}
                  size={22}
                  color={item.is_present ? colors.success : colors.destructive}
                />
                <Text style={[s.toggleText, { color: item.is_present ? colors.success : colors.destructive }]}>
                  {item.is_present ? 'موجود' : 'غير موجود'}
                </Text>
              </TouchableOpacity>
              <View style={s.productMeta}>
                <Text style={s.productName}>{item.product_name}</Text>
                <Text style={s.productCategory}>{item.category}</Text>
              </View>
            </View>

            {item.is_present && (
              <View style={s.productActions}>
                <TextInput
                  style={s.qtyInput}
                  value={item.quantity.toString()}
                  onChangeText={(v) => setQty(item.product_id, v)}
                  keyboardType="number-pad"
                  textAlign="center"
                  placeholder="الكمية"
                  placeholderTextColor={colors.mutedForeground}
                />
                <TouchableOpacity style={s.photoBtn} onPress={() => takePhoto(item.product_id)} activeOpacity={0.8}>
                  {aiLoading[item.product_id] ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                  ) : (
                    <Ionicons name="camera" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
                {item.photo_uri && (
                  <Image source={{ uri: item.photo_uri }} style={s.thumbnail} />
                )}
              </View>
            )}

            {item.ai_analysis && (
              <View style={s.aiBadge}>
                <Ionicons name="sparkles" size={14} color="#8B5CF6" />
                <Text style={s.aiText}>
                  كمية: {item.ai_analysis.estimated_quantity} · {item.ai_analysis.display_order} · ثقة: {Math.round(item.ai_analysis.confidence * 100)}%
                </Text>
              </View>
            )}
          </View>
        )}
        ListFooterComponent={
          <TouchableOpacity
            style={[s.submitBtn, submitting && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name={!isOnline || activeVisit?.isPending ? 'cloud-upload' : 'checkmark-circle'} size={20} color="#fff" />
                <Text style={s.submitBtnText}>
                  {!isOnline || activeVisit?.isPending ? 'حفظ محلياً' : 'إرسال الكشف'}
                </Text>
              </>
            )}
          </TouchableOpacity>
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
      backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 10,
    },
    offlineText: { fontSize: 12, color: '#92400E', fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const, flex: 1, textAlign: 'right' },
    listContent: { padding: 16, paddingBottom: 40 },
    productCard: {
      backgroundColor: colors.card, borderRadius: 14, padding: 14,
      marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    productHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    productMeta: { alignItems: 'flex-end', flex: 1, marginRight: 12 },
    productName: { fontSize: 15, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Cairo_700Bold', textAlign: 'right' },
    productCategory: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'right' },
    toggle: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
    },
    toggleOn: { backgroundColor: '#D1FAE5' },
    toggleOff: { backgroundColor: '#FEE2E2' },
    toggleText: { fontSize: 12, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
    productActions: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
    qtyInput: {
      width: 70, borderWidth: 1.5, borderColor: colors.border,
      borderRadius: 8, paddingVertical: 6, fontSize: 14,
      color: colors.foreground, fontFamily: 'Cairo_400Regular',
      backgroundColor: colors.muted,
    },
    photoBtn: {
      width: 40, height: 40, borderRadius: 8,
      backgroundColor: `${colors.primary}12`,
      justifyContent: 'center', alignItems: 'center',
    },
    thumbnail: { width: 50, height: 50, borderRadius: 8 },
    aiBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: '#F5F3FF', borderRadius: 8, padding: 8, marginTop: 8,
      justifyContent: 'flex-end',
    },
    aiText: { fontSize: 12, color: '#5B21B6', fontFamily: 'Cairo_400Regular', textAlign: 'right' },
    submitBtn: {
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginTop: 8,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' as const, fontFamily: 'Cairo_700Bold' },
  });
