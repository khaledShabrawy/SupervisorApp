import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useScope } from '@/lib/data';

/**
 * Lightweight hook to identify priority customer IDs based on operational data:
 * 1. Outlets whose last shelf_audit score was < 70%.
 * 2. Outlets with recorded competitor activity in competitor_products.
 *
 * Technical Constraints:
 * - Does not use select('*'); queries only specific required columns (id, audit_score, visit_id, visits(customer_id)).
 * - Company-scoped to respect multi-tenancy.
 * - In-memory Set<string> for O(1) client-side filtering.
 */
export function usePriorityCustomerIds(): Set<string> {
  const sc = useScope();

  const q = useQuery({
    queryKey: [...sc.base, 'priority-customer-ids'],
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const priorityIds = new Set<string>();

      try {
        const [auditsRes, competitorsRes] = await Promise.all([
          supabase
            .from('shelf_audit')
            .select('id, audit_score, visit_id, created_at, visits(customer_id)')
            .eq('company_id', sc.companyId)
            .order('created_at', { ascending: false })
            .limit(200)
            .abortSignal(signal),
          supabase
            .from('competitor_products')
            .select('id, visit_id, visits(customer_id)')
            .eq('company_id', sc.companyId)
            .limit(200)
            .abortSignal(signal),
        ]);

        // 1. Check last shelf_audit score for each customer
        if (auditsRes.data) {
          const latestAuditScoreByCustomer = new Map<string, number>();

          for (const row of auditsRes.data as any[]) {
            const customerId: string | undefined = Array.isArray(row.visits)
              ? row.visits[0]?.customer_id
              : row.visits?.customer_id;

            if (customerId && !latestAuditScoreByCustomer.has(customerId)) {
              if (typeof row.audit_score === 'number') {
                latestAuditScoreByCustomer.set(customerId, row.audit_score);
              }
            }
          }

          for (const [cId, score] of latestAuditScoreByCustomer.entries()) {
            if (score < 70) {
              priorityIds.add(cId);
            }
          }
        }

        // 2. Customers with recorded competitor activity
        if (competitorsRes.data) {
          for (const row of competitorsRes.data as any[]) {
            const customerId: string | undefined = Array.isArray(row.visits)
              ? row.visits[0]?.customer_id
              : row.visits?.customer_id;

            if (customerId) {
              priorityIds.add(customerId);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load priority customer IDs:', err);
      }

      return priorityIds;
    },
  });

  return q.data ?? new Set<string>();
}
