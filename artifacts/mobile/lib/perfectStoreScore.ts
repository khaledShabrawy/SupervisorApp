/**
 * Perfect Store Score — مؤشر جودة الرف
 *
 * Composite 0-100 score calculated from shelf audit data.
 *
 * Weights:
 *   Availability  40 pts  — % of products present
 *   Quantity      30 pts  — % of present products with qty ≥ 3
 *   Display       30 pts  — % of AI-analysed products rated "مرتب"
 */

import type { ShelfAuditItem } from './types';

export interface PerfectStoreResult {
  score: number;           // 0-100
  label: 'ممتاز' | 'جيد' | 'متوسط' | 'ضعيف';
  color: string;
  availability: number;   // 0-1
  quantity: number;       // 0-1
  display: number;        // 0-1
  breakdown: {
    availabilityPts: number;  // max 40
    quantityPts: number;      // max 30
    displayPts: number;       // max 30
  };
}

export function calcPerfectStoreScore(items: ShelfAuditItem[]): PerfectStoreResult {
  if (items.length === 0) {
    return { score: 0, label: 'ضعيف', color: '#EF4444', availability: 0, quantity: 0, display: 0, breakdown: { availabilityPts: 0, quantityPts: 0, displayPts: 0 } };
  }

  // ── Availability (40 pts) ─────────────────────────────────────────────────
  const presentItems = items.filter((i) => i.is_present);
  const availability = presentItems.length / items.length;
  const availabilityPts = Math.round(availability * 40);

  // ── Quantity Adequacy (30 pts) ────────────────────────────────────────────
  // % of present products that have qty >= 3 (adequate stock on shelf)
  const adequateQty = presentItems.filter((i) => i.quantity >= 3).length;
  const quantity = presentItems.length > 0 ? adequateQty / presentItems.length : 0;
  const quantityPts = Math.round(quantity * 30);

  // ── Display / Planogram Order (30 pts) ───────────────────────────────────
  const aiItems = items.filter((i) => i.ai_analysis != null);
  const organised = aiItems.filter((i) => i.ai_analysis?.display_order === 'مرتب').length;
  const display = aiItems.length > 0 ? organised / aiItems.length : 0.5; // default 50% if no AI data
  const displayPts = Math.round(display * 30);

  const score = Math.min(100, availabilityPts + quantityPts + displayPts);

  let label: PerfectStoreResult['label'];
  let color: string;
  if (score >= 80) { label = 'ممتاز'; color = '#10B981'; }
  else if (score >= 60) { label = 'جيد';   color = '#F59E0B'; }
  else if (score >= 40) { label = 'متوسط'; color = '#F97316'; }
  else                  { label = 'ضعيف';  color = '#EF4444'; }

  return { score, label, color, availability, quantity, display, breakdown: { availabilityPts, quantityPts, displayPts } };
}
