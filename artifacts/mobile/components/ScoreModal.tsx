/**
 * ScoreModal — Perfect Store Score result card
 * Shown after shelf audit submission.
 */

import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PerfectStoreResult } from '@/lib/perfectStoreScore';

interface Props {
  visible: boolean;
  result: PerfectStoreResult | null;
  isOffline?: boolean;
  onClose: () => void;
}

export default function ScoreModal({ visible, result, isOffline, onClose }: Props) {
  if (!result) return null;

  const rows = [
    { label: 'توافر المنتجات',  pts: result.breakdown.availabilityPts, max: 40, pct: result.availability },
    { label: 'كفاية الكميات',   pts: result.breakdown.quantityPts,    max: 30, pct: result.quantity },
    { label: 'ترتيب العرض',     pts: result.breakdown.displayPts,     max: 30, pct: result.display },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>

          {/* Score circle */}
          <View style={[s.scoreBubble, { borderColor: result.color }]}>
            <Text style={[s.scoreNum, { color: result.color }]}>{result.score}</Text>
            <Text style={s.scoreOf}>/ 100</Text>
          </View>

          <Text style={[s.label, { color: result.color }]}>{result.label}</Text>
          <Text style={s.title}>Perfect Store Score</Text>

          {isOffline && (
            <View style={s.offlinePill}>
              <Ionicons name="cloud-upload-outline" size={13} color="#92400E" />
              <Text style={s.offlineText}>محفوظ محلياً — سيُرسل عند الاتصال</Text>
            </View>
          )}

          {/* Breakdown rows */}
          <View style={s.breakdown}>
            {rows.map((r) => (
              <View key={r.label} style={s.bRow}>
                <View style={s.bMeta}>
                  <Text style={s.bLabel}>{r.label}</Text>
                  <Text style={s.bPts}>{r.pts} / {r.max}</Text>
                </View>
                <View style={s.bTrack}>
                  <View style={[s.bBar, { width: `${Math.round(r.pct * 100)}%` as `${number}%`, backgroundColor: result.color }]} />
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity style={[s.btn, { backgroundColor: result.color }]} onPress={onClose}>
            <Text style={s.btnText}>حسناً</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '100%', alignItems: 'center', gap: 8 },
  scoreBubble: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 5, justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  scoreNum: { fontSize: 38, fontWeight: '800', lineHeight: 42 },
  scoreOf: { fontSize: 13, color: '#6B7280', lineHeight: 16 },
  label: { fontSize: 22, fontWeight: '700', fontFamily: 'Cairo_700Bold' },
  title: { fontSize: 13, color: '#6B7280', letterSpacing: 0.5, marginBottom: 4 },
  offlinePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  offlineText: { fontSize: 11, color: '#92400E', fontFamily: 'Cairo_400Regular' },
  breakdown: { width: '100%', gap: 10, marginTop: 8 },
  bRow: { gap: 4 },
  bMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  bLabel: { fontSize: 13, color: '#374151', fontFamily: 'Cairo_400Regular', textAlign: 'right' },
  bPts: { fontSize: 13, color: '#6B7280', fontFamily: 'Cairo_700Bold', fontWeight: '700' },
  bTrack: { height: 7, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  bBar: { height: 7, borderRadius: 4 },
  btn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 40, marginTop: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'Cairo_700Bold' },
});
