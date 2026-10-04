import React, { useEffect, useRef, useState } from 'react';
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
import type { RealtimeChannel } from '@supabase/supabase-js';
import ScoreModal from '@/components/ScoreModal';
import { useAuth } from '@/contexts/AuthContext';
import { useOffline } from '@/contexts/OfflineContext';
import { useVisit } from '@/contexts/VisitContext';
import { useColors } from '@/hooks/useColors';
import { enqueue } from '@/lib/offlineQueue';
import { calcPerfectStoreScore } from '@/lib/perfectStoreScore';
import type { PerfectStoreResult } from '@/lib/perfectStoreScore';
import { supabase } from '@/lib/supabase';
import type { Product, ShelfAuditItem } from '@/lib/types';

type AiStatus = 'idle' | 'uploading' | 'analyzing' | 'success' | 'timeout' | 'error';

// Expo only inlines EXPO_PUBLIC_* variables into the client bundle. The
// workflow still owns the VITE_* secret, so build.js/dev export it under the
// Expo-safe name without changing the configured secret key.
const n8nWebhookUrl =
  process.env.EXPO_PUBLIC_N8N_SHELF_AUDIT_WEBHOOK ??
  process.env.VITE_N8N_SHELF_AUDIT_WEBHOOK;

export default function ShelfAuditScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { supervisor } = useAuth();
  const { activeVisit } = useVisit();
  const { isOnline, refreshCount } = useOffline();
  const [products, setProducts] = useState<Product[]>([]);
  const [auditItems, setAuditItems] = useState<ShelfAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const [aiMessage, setAiMessage] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [scoreResult, setScoreResult] = useState<PerfectStoreResult | null>(null);
  const [scoreOffline, setScoreOffline] = useState(false);
  const aiChannelRef = useRef<RealtimeChannel | null>(null);
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supervisorId = supervisor?.id;
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

  const stopAiListener = () => {
    if (aiTimeoutRef.current) {
      clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }
    if (aiChannelRef.current) {
      void supabase.removeChannel(aiChannelRef.current);
      aiChannelRef.current = null;
    }
  };

  useEffect(() => () => stopAiListener(), []);

  const startAiListener = (visitId: string) => {
    stopAiListener();
    const channel = supabase
      .channel(`shelf-audit-result-${visitId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shelf_audit',
          filter: `visit_id=eq.${visitId}`,
        },
        (payload) => {
          const summary = (payload.new as { audit_summary_ar?: string | null }).audit_summary_ar;
          if (!summary) return;
          setAiSummary(summary);
          setAiMessage('');
          setAiStatus('success');
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          stopAiListener();
        },
      )
      .subscribe();

    aiChannelRef.current = channel;
    aiTimeoutRef.current = setTimeout(() => {
      stopAiListener();
      setAiStatus('timeout');
      setAiMessage('⏳ التحليل يستغرق وقتاً، سيظهر النتيجة قريباً');
    }, 60_000);
  };

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

  const persistPhotoAuditRow = async (
    item: ShelfAuditItem,
    photoUrl: string,
  ): Promise<void> => {
    if (!activeVisit || activeVisit.isPending) return;
    const payload = {
      visit_id: activeVisit.visitId,
      product_id: item.product_id,
      is_present: item.is_present,
      quantity: item.quantity,
      photo_url: photoUrl,
      ai_analysis: item.ai_analysis ?? null,
      display_order: item.ai_analysis?.display_order ?? null,
    };

    const { data: existing, error: findError } = await supabase
      .from('shelf_audit')
      .select('id')
      .eq('visit_id', activeVisit.visitId)
      .eq('product_id', item.product_id)
      .maybeSingle();
    if (findError) throw findError;

    if (existing?.id) {
      const { error } = await supabase
        .from('shelf_audit')
        .update(payload)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('shelf_audit').insert(payload);
      if (error) throw error;
    }
  };

  const dispatchShelfAuditWebhook = (timestamp: string, imageUrl: string) => {
    if (!activeVisit || !supervisorId || !n8nWebhookUrl || n8nWebhookUrl.includes('yourdomain.com')) {
      setAiStatus('error');
      setAiMessage('تعذر بدء التحليل — يرجى إعداد رابط التحليل أولاً');
      return;
    }

    // Intentionally fire-and-forget: the result arrives through Supabase Realtime.
    void fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visit_id: activeVisit.visitId,
        customer_id: activeVisit.customerId,
        supervisor_id: supervisorId,
        image_url: imageUrl,
        timestamp,
      }),
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`n8n webhook returned ${response.status}`);
      }
    }).catch(() => {
      setAiStatus('error');
      setAiMessage('تعذر إرسال الصورة للتحليل — حاول مرة أخرى');
      stopAiListener();
    });
  };

  const processPhoto = async (
    id: string,
    asset: ImagePicker.ImagePickerAsset,
  ) => {
    setAuditItems((prev) =>
      prev.map((i) =>
        i.product_id === id
          ? { ...i, photo_uri: asset.uri, photo_base64: undefined }
          : i,
      ),
    );

    if (!activeVisit || !isOnline || activeVisit.isPending) {
      setAiStatus('error');
      setAiMessage('الصورة محفوظة محلياً — سيبدأ التحليل بعد مزامنة الزيارة');
      return;
    }

    const timestamp = new Date().toISOString();
    setAiLoading((prev) => ({ ...prev, [id]: true }));
    setAiStatus('uploading');
    setAiMessage('جارٍ رفع الصورة...');

    try {
      const imageResponse = await fetch(asset.uri);
      const imageBlob = await imageResponse.blob();
      const storagePath = `${supervisorId}/${activeVisit.visitId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('shelf-photos')
        .upload(storagePath, imageBlob, {
          contentType: 'image/jpeg',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('shelf-photos')
        .getPublicUrl(storagePath);
      const publicUrl = publicUrlData.publicUrl;
      if (!publicUrl) throw new Error('لم يتم إنشاء رابط الصورة');

      const selectedItem = auditItems.find((item) => item.product_id === id);
      if (!selectedItem) throw new Error('لم يتم العثور على المنتج');
      await persistPhotoAuditRow(selectedItem, publicUrl);

      setAuditItems((prev) =>
        prev.map((i) =>
          i.product_id === id ? { ...i, photo_url: publicUrl } : i,
        ),
      );
      setAiStatus('analyzing');
      setAiMessage('🔍 جارٍ تحليل الرف بالذكاء الاصطناعي...');
      startAiListener(activeVisit.visitId);
      dispatchShelfAuditWebhook(timestamp, publicUrl);
    } catch {
      setAiStatus('error');
      setAiMessage('تعذر رفع الصورة — تحقق من الاتصال وحاول مرة أخرى');
      Alert.alert('خطأ', 'تعذر رفع الصورة إلى التخزين');
    } finally {
      setAiLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const openCamera = async (id: string) => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled) return;
    await processPhoto(id, result.assets[0]);
  };

  const openLibrary = async (id: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled) return;
    await processPhoto(id, result.assets[0]);
  };

  const choosePhoto = (id: string) => {
    Alert.alert('إضافة صورة الرف', 'اختر مصدر الصورة', [
      { text: 'الكاميرا', onPress: () => void openCamera(id) },
      { text: 'معرض الصور', onPress: () => void openLibrary(id) },
      { text: 'إلغاء', style: 'cancel' },
    ]);
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
          photo_url: item.photo_url ?? null,
          ai_analysis: item.ai_analysis ?? null,
          display_order: item.ai_analysis?.display_order ?? null,
      }));

      // ── Calculate Perfect Store Score ───────────────────────────────────────
      const pss = calcPerfectStoreScore(auditItems);

      if (mustQueue) {
        for (const row of rows) {
          await enqueue('shelf_audit', row, activeVisit.visitId);
        }
        // Also queue the score update on the visit row
        await enqueue('visits_score', { perfect_store_score: pss.score }, activeVisit.visitId);
        await refreshCount();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setScoreOffline(true);
        setScoreResult(pss);
      } else {
        for (const row of rows) {
          const { data: existing, error: findError } = await supabase
            .from('shelf_audit')
            .select('id')
            .eq('visit_id', activeVisit.visitId)
            .eq('product_id', row.product_id)
            .maybeSingle();
          if (findError) throw findError;

          if (existing?.id) {
            const { error } = await supabase
              .from('shelf_audit')
              .update(row)
              .eq('id', existing.id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('shelf_audit')
              .insert({ ...row, visit_id: activeVisit.visitId });
            if (error) throw error;
          }
        }
        // Persist score on the parent visit row
        await supabase
          .from('visits')
          .update({ perfect_store_score: pss.score })
          .eq('id', activeVisit.visitId);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setScoreOffline(false);
        setScoreResult(pss);
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
      <ScoreModal
        visible={!!scoreResult}
        result={scoreResult}
        isOffline={scoreOffline}
        onClose={() => { setScoreResult(null); router.back(); }}
      />
      {(!isOnline || activeVisit?.isPending) && (
        <View style={s.offlineBanner}>
          <Ionicons name="cloud-offline" size={16} color="#92400E" />
          <Text style={s.offlineText}>
            {!isOnline ? 'لا يوجد اتصال — سيُحفظ الكشف محلياً' : 'الزيارة معلقة — سيُرسل مع الزيارة'}
          </Text>
        </View>
      )}

      {/* AI analysis status: the result is delivered asynchronously by Realtime. */}
      {aiStatus !== 'idle' && (
        <View
          style={[
            s.aiStatusCard,
            aiStatus === 'success' ? s.aiSuccessCard : undefined,
            aiStatus === 'timeout' || aiStatus === 'error' ? s.aiWarningCard : undefined,
          ]}
        >
          <View style={s.aiStatusIcon}>
            {aiStatus === 'uploading' || aiStatus === 'analyzing' ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Ionicons
                name={aiStatus === 'success' ? 'checkmark-circle' : 'warning'}
                size={24}
                color={aiStatus === 'success' ? colors.success : colors.warning}
              />
            )}
          </View>
          <View style={s.aiStatusBody}>
            <Text style={s.aiStatusTitle}>
              {aiStatus === 'uploading'
                ? 'جارٍ رفع الصورة...'
                : aiStatus === 'analyzing'
                ? '🔍 جارٍ تحليل الرف...'
                : aiStatus === 'success'
                ? 'تم تحليل الرف بنجاح'
                : 'تنبيه'}
            </Text>
            {aiMessage ? <Text style={s.aiStatusMessage}>{aiMessage}</Text> : null}
            {aiStatus === 'success' && aiSummary ? (
              <Text style={s.aiSummary}>{aiSummary}</Text>
            ) : null}
          </View>
        </View>
      )}

      {/* OOS Detection Banner */}
      {auditItems.length > 0 && (() => {
        const oosCount = auditItems.filter(i => !i.is_present).length;
        if (oosCount === 0) return null;
        return (
          <View style={s.oosBanner}>
            <Ionicons name="alert-circle" size={18} color="#991B1B" />
            <Text style={s.oosText}>
              {oosCount === auditItems.length
                ? 'لا توجد منتجات على الرف !'
                : `${oosCount} منتج${oosCount > 1 ? 'ات' : ''} غير متوفرة على الرف`}
            </Text>
          </View>
        );
      })()}

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
                <TouchableOpacity style={s.photoBtn} onPress={() => choosePhoto(item.product_id)} activeOpacity={0.8}>
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
    oosBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: '#FEE2E2', paddingHorizontal: 16, paddingVertical: 10,
    },
    oosText: { fontSize: 12, color: '#991B1B', fontFamily: 'Cairo_700Bold', fontWeight: '700' as const, flex: 1, textAlign: 'right' },
    listContent: { padding: 16, paddingBottom: 40 },
    aiStatusCard: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      marginHorizontal: 16, marginTop: 12, marginBottom: 4,
      padding: 14, borderRadius: 14,
      backgroundColor: `${colors.primary}12`,
      borderWidth: 1, borderColor: `${colors.primary}35`,
    },
    aiSuccessCard: {
      backgroundColor: `${colors.success}16`,
      borderColor: `${colors.success}55`,
    },
    aiWarningCard: {
      backgroundColor: `${colors.warning}18`,
      borderColor: `${colors.warning}55`,
    },
    aiStatusIcon: { paddingTop: 1, width: 26, alignItems: 'center' },
    aiStatusBody: { flex: 1, alignItems: 'flex-end' },
    aiStatusTitle: {
      fontSize: 14, fontWeight: '700' as const, color: colors.foreground,
      fontFamily: 'Cairo_700Bold', textAlign: 'right',
    },
    aiStatusMessage: {
      fontSize: 12, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular',
      textAlign: 'right', marginTop: 3,
    },
    aiSummary: {
      fontSize: 13, color: colors.success, fontFamily: 'Cairo_600SemiBold',
      textAlign: 'right', lineHeight: 22, marginTop: 8,
    },
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
    submitBtn: {
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginTop: 8,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' as const, fontFamily: 'Cairo_700Bold' },
  });
/*
import React, { useEffect, useRef, useState } from 'react';
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
import type { RealtimeChannel } from '@supabase/supabase-js';
import ScoreModal from '@/components/ScoreModal';
import { useAuth } from '@/contexts/AuthContext';
import { useOffline } from '@/contexts/OfflineContext';
import { useVisit } from '@/contexts/VisitContext';
import { useColors } from '@/hooks/useColors';
import { enqueue } from '@/lib/offlineQueue';
import { calcPerfectStoreScore } from '@/lib/perfectStoreScore';
import type { PerfectStoreResult } from '@/lib/perfectStoreScore';
import { supabase } from '@/lib/supabase';
import type { Product, ShelfAuditItem } from '@/lib/types';

type AiStatus = 'idle' | 'uploading' | 'analyzing' | 'success' | 'timeout' | 'error';

// Expo only inlines EXPO_PUBLIC_* variables into the client bundle. The
// workflow still owns the VITE_* secret, so build.js/dev export it under the
// Expo-safe name without changing the configured secret key.
const n8nWebhookUrl =
  process.env.EXPO_PUBLIC_N8N_SHELF_AUDIT_WEBHOOK ??
  process.env.VITE_N8N_SHELF_AUDIT_WEBHOOK;

export default function ShelfAuditScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { supervisor } = useAuth();
  const { activeVisit } = useVisit();
  const { isOnline, refreshCount } = useOffline();
  const [products, setProducts] = useState<Product[]>([]);
  const [auditItems, setAuditItems] = useState<ShelfAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const [aiMessage, setAiMessage] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [scoreResult, setScoreResult] = useState<PerfectStoreResult | null>(null);
  const [scoreOffline, setScoreOffline] = useState(false);
  const aiChannelRef = useRef<RealtimeChannel | null>(null);
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supervisorId = supervisor?.id;
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

  const stopAiListener = () => {
    if (aiTimeoutRef.current) {
      clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }
    if (aiChannelRef.current) {
      void supabase.removeChannel(aiChannelRef.current);
      aiChannelRef.current = null;
    }
  };

  useEffect(() => () => stopAiListener(), []);

  const startAiListener = (visitId: string) => {
    stopAiListener();
    const channel = supabase
      .channel(`shelf-audit-result-${visitId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shelf_audit',
          filter: `visit_id=eq.${visitId}`,
        },
        (payload) => {
          const summary = (payload.new as { audit_summary_ar?: string | null }).audit_summary_ar;
          if (!summary) return;
          setAiSummary(summary);
          setAiMessage('');
          setAiStatus('success');
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          stopAiListener();
        },
      )
      .subscribe();

    aiChannelRef.current = channel;
    aiTimeoutRef.current = setTimeout(() => {
      stopAiListener();
      setAiStatus('timeout');
      setAiMessage('⏳ التحليل يستغرق وقتاً، سيظهر النتيجة قريباً');
    }, 60_000);
  };

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

  const persistPhotoAuditRow = async (
    item: ShelfAuditItem,
    photoUrl: string,
  ): Promise<void> => {
    if (!activeVisit || activeVisit.isPending) return;
    const payload = {
      visit_id: activeVisit.visitId,
      product_id: item.product_id,
      is_present: item.is_present,
      quantity: item.quantity,
      photo_url: photoUrl,
      ai_analysis: item.ai_analysis ?? null,
      display_order: item.ai_analysis?.display_order ?? null,
    };

    const { data: existing, error: findError } = await supabase
      .from('shelf_audit')
      .select('id')
      .eq('visit_id', activeVisit.visitId)
      .eq('product_id', item.product_id)
      .maybeSingle();
    if (findError) throw findError;

    if (existing?.id) {
      const { error } = await supabase
        .from('shelf_audit')
        .update(payload)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('shelf_audit').insert(payload);
      if (error) throw error;
    }
  };

  const dispatchShelfAuditWebhook = (timestamp: string, imageUrl: string) => {
    if (!activeVisit || !supervisorId || !n8nWebhookUrl || n8nWebhookUrl.includes('yourdomain.com')) {
      setAiStatus('error');
      setAiMessage('تعذر بدء التحليل — يرجى إعداد رابط التحليل أولاً');
      return;
    }

    // Intentionally fire-and-forget: the result arrives through Supabase Realtime.
    void fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visit_id: activeVisit.visitId,
        customer_id: activeVisit.customerId,
        supervisor_id: supervisorId,
        image_url: imageUrl,
        timestamp,
      }),
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`n8n webhook returned ${response.status}`);
      }
    }).catch(() => {
      setAiStatus('error');
      setAiMessage('تعذر إرسال الصورة للتحليل — حاول مرة أخرى');
      stopAiListener();
    });
  };

  const processPhoto = async (
    id: string,
    asset: ImagePicker.ImagePickerAsset,
  ) => {
    setAuditItems((prev) =>
      prev.map((i) =>
        i.product_id === id
          ? { ...i, photo_uri: asset.uri, photo_base64: undefined }
          : i,
      ),
    );

    if (!activeVisit || !isOnline || activeVisit.isPending) {
      setAiStatus('error');
      setAiMessage('الصورة محفوظة محلياً — سيبدأ التحليل بعد مزامنة الزيارة');
      return;
    }

    const timestamp = new Date().toISOString();
    setAiLoading((prev) => ({ ...prev, [id]: true }));
    setAiStatus('uploading');
    setAiMessage('جارٍ رفع الصورة...');

    try {
      const imageResponse = await fetch(asset.uri);
      const imageBlob = await imageResponse.blob();
      const storagePath = `${supervisorId}/${activeVisit.visitId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('shelf-photos')
        .upload(storagePath, imageBlob, {
          contentType: 'image/jpeg',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('shelf-photos')
        .getPublicUrl(storagePath);
      const publicUrl = publicUrlData.publicUrl;
      if (!publicUrl) throw new Error('لم يتم إنشاء رابط الصورة');

      const selectedItem = auditItems.find((item) => item.product_id === id);
      if (!selectedItem) throw new Error('لم يتم العثور على المنتج');
      await persistPhotoAuditRow(selectedItem, publicUrl);

      setAuditItems((prev) =>
        prev.map((i) =>
          i.product_id === id ? { ...i, photo_url: publicUrl } : i,
        ),
      );
      setAiStatus('analyzing');
      setAiMessage('🔍 جارٍ تحليل الرف بالذكاء الاصطناعي...');
      startAiListener(activeVisit.visitId);
      dispatchShelfAuditWebhook(timestamp, publicUrl);
    } catch {
      setAiStatus('error');
      setAiMessage('تعذر رفع الصورة — تحقق من الاتصال وحاول مرة أخرى');
      Alert.alert('خطأ', 'تعذر رفع الصورة إلى التخزين');
    } finally {
      setAiLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const openCamera = async (id: string) => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled) return;
    await processPhoto(id, result.assets[0]);
  };

  const openLibrary = async (id: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled) return;
    await processPhoto(id, result.assets[0]);
  };

  const choosePhoto = (id: string) => {
    Alert.alert('إضافة صورة الرف', 'اختر مصدر الصورة', [
      { text: 'الكاميرا', onPress: () => void openCamera(id) },
      { text: 'معرض الصور', onPress: () => void openLibrary(id) },
      { text: 'إلغاء', style: 'cancel' },
    ]);
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
          photo_url: item.photo_url ?? null,
          ai_analysis: item.ai_analysis ?? null,
          display_order: item.ai_analysis?.display_order ?? null,
      }));

      // ── Calculate Perfect Store Score ───────────────────────────────────────
      const pss = calcPerfectStoreScore(auditItems);

      if (mustQueue) {
        for (const row of rows) {
          await enqueue('shelf_audit', row, activeVisit.visitId);
        }
        // Also queue the score update on the visit row
        await enqueue('visits_score', { perfect_store_score: pss.score }, activeVisit.visitId);
        await refreshCount();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setScoreOffline(true);
        setScoreResult(pss);
      } else {
        for (const row of rows) {
          const { data: existing, error: findError } = await supabase
            .from('shelf_audit')
            .select('id')
            .eq('visit_id', activeVisit.visitId)
            .eq('product_id', row.product_id)
            .maybeSingle();
          if (findError) throw findError;

          if (existing?.id) {
            const { error } = await supabase
              .from('shelf_audit')
              .update(row)
              .eq('id', existing.id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('shelf_audit')
              .insert({ ...row, visit_id: activeVisit.visitId });
            if (error) throw error;
          }
        }
        // Persist score on the parent visit row
        await supabase
          .from('visits')
          .update({ perfect_store_score: pss.score })
          .eq('id', activeVisit.visitId);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setScoreOffline(false);
        setScoreResult(pss);
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
      <ScoreModal
        visible={!!scoreResult}
        result={scoreResult}
        isOffline={scoreOffline}
        onClose={() => { setScoreResult(null); router.back(); }}
      />
      {(!isOnline || activeVisit?.isPending) && (
        <View style={s.offlineBanner}>
          <Ionicons name="cloud-offline" size={16} color="#92400E" />
          <Text style={s.offlineText}>
            {!isOnline ? 'لا يوجد اتصال — سيُحفظ الكشف محلياً' : 'الزيارة معلقة — سيُرسل مع الزيارة'}
          </Text>
        </View>
      )}

      {/* AI analysis status: the result is delivered asynchronously by Realtime. */}
      {aiStatus !== 'idle' && (
        <View
          style={[
            s.aiStatusCard,
            aiStatus === 'success' ? s.aiSuccessCard : undefined,
            aiStatus === 'timeout' || aiStatus === 'error' ? s.aiWarningCard : undefined,
          ]}
        >
          <View style={s.aiStatusIcon}>
            {aiStatus === 'uploading' || aiStatus === 'analyzing' ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Ionicons
                name={aiStatus === 'success' ? 'checkmark-circle' : 'warning'}
                size={24}
                color={aiStatus === 'success' ? colors.success : colors.warning}
              />
            )}
          </View>
          <View style={s.aiStatusBody}>
            <Text style={s.aiStatusTitle}>
              {aiStatus === 'uploading'
                ? 'جارٍ رفع الصورة...'
                : aiStatus === 'analyzing'
                ? '🔍 جارٍ تحليل الرف...'
                : aiStatus === 'success'
                ? 'تم تحليل الرف بنجاح'
                : 'تنبيه'}
            </Text>
            {aiMessage ? <Text style={s.aiStatusMessage}>{aiMessage}</Text> : null}
            {aiStatus === 'success' && aiSummary ? (
              <Text style={s.aiSummary}>{aiSummary}</Text>
            ) : null}
          </View>
        </View>
      )}

      {/* OOS Detection Banner */}
      {auditItems.length > 0 && (() => {
        const oosCount = auditItems.filter(i => !i.is_present).length;
        if (oosCount === 0) return null;
        return (
          <View style={s.oosBanner}>
            <Ionicons name="alert-circle" size={18} color="#991B1B" />
            <Text style={s.oosText}>
              {oosCount === auditItems.length
                ? 'لا توجد منتجات على الرف !'
                : `${oosCount} منتج${oosCount > 1 ? 'ات' : ''} غير متوفرة على الرف`}
            </Text>
          </View>
        );
      })()}

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
                <TouchableOpacity style={s.photoBtn} onPress={() => choosePhoto(item.product_id)} activeOpacity={0.8}>
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
    oosBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: '#FEE2E2', paddingHorizontal: 16, paddingVertical: 10,
    },
    oosText: { fontSize: 12, color: '#991B1B', fontFamily: 'Cairo_700Bold', fontWeight: '700' as const, flex: 1, textAlign: 'right' },
    listContent: { padding: 16, paddingBottom: 40 },
    aiStatusCard: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      marginHorizontal: 16, marginTop: 12, marginBottom: 4,
      padding: 14, borderRadius: 14,
      backgroundColor: `${colors.primary}12`,
      borderWidth: 1, borderColor: `${colors.primary}35`,
    },
    aiSuccessCard: {
      backgroundColor: `${colors.success}16`,
      borderColor: `${colors.success}55`,
    },
    aiWarningCard: {
      backgroundColor: `${colors.warning}18`,
      borderColor: `${colors.warning}55`,
    },
    aiStatusIcon: { paddingTop: 1, width: 26, alignItems: 'center' },
    aiStatusBody: { flex: 1, alignItems: 'flex-end' },
    aiStatusTitle: {
      fontSize: 14, fontWeight: '700' as const, color: colors.foreground,
      fontFamily: 'Cairo_700Bold', textAlign: 'right',
    },
    aiStatusMessage: {
      fontSize: 12, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular',
      textAlign: 'right', marginTop: 3,
    },
    aiSummary: {
      fontSize: 13, color: colors.success, fontFamily: 'Cairo_600SemiBold',
      textAlign: 'right', lineHeight: 22, marginTop: 8,
    },
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
    submitBtn: {
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginTop: 8,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' as const, fontFamily: 'Cairo_700Bold' },
  });
*/
