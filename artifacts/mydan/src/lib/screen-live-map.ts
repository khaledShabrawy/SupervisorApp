import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useScope } from '@/lib/data';
import { todayStr } from '@/lib/format';
import { t } from '@/i18n';

export type LiveStatusKind = 'in_progress' | 'completed' | 'idle';

export interface SupervisorRoutePoint {
  seq: number;
  visitId: string;
  customerId: string;
  customerName: string;
  customerAddress?: string | null;
  latitude: number;
  longitude: number;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status: 'completed' | 'in_progress' | 'pending' | 'skipped';
  onBeat?: boolean | null;
  geoDistance?: number | null;
}

export interface SupervisorLiveTrack {
  supervisorId: string;
  supervisorName: string;
  phone?: string | null;
  role: string;
  branchId?: string | null;
  branchName?: string | null;
  branchLocation?: { latitude: number; longitude: number } | null;
  liveStatus: LiveStatusKind;
  currentLocation: { latitude: number; longitude: number } | null;
  currentCustomerName?: string | null;
  currentCustomerAddress?: string | null;
  lastActiveTime?: string | null;
  route: SupervisorRoutePoint[];
  totalVisitsToday: number;
  completedVisitsToday: number;
}

export interface SupervisorHistoryVisit {
  id: string;
  visitDate: string;
  customerId: string;
  customerName: string;
  customerAddress?: string | null;
  customerPhone?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status: string;
  latitude?: number | null;
  longitude?: number | null;
  onBeat?: boolean | null;
  geoDistance?: number | null;
  notes?: string | null;
}

export interface LiveTrackingSummary {
  totalSupervisors: number;
  activeInVisit: number;
  movingAfterVisit: number;
  idleToday: number;
  totalVisitsRecorded: number;
}

export function useLiveTrackingData(date: string = todayStr(), branchFilter: string = 'all') {
  const sc = useScope();

  const query = useQuery({
    queryKey: [...sc.base, 'live-tracking-data', date, branchFilter],
    // Auto-refresh every 30 seconds for real-time tracking
    refetchInterval: 30_000,
    queryFn: async () => {
      // 1. Fetch active supervisors of the company
      let supQuery = supabase
        .from('supervisors')
        .select('id, full_name, phone, role, branch_id, company_id, is_active')
        .eq('company_id', sc.companyId)
        .eq('is_active', true);

      // If user is a branch manager, restrict to their branch
      if (sc.supervisor.role === 'branch_manager' && sc.supervisor.branch_id) {
        supQuery = supQuery.eq('branch_id', sc.supervisor.branch_id);
      } else if (branchFilter !== 'all') {
        supQuery = supQuery.eq('branch_id', branchFilter);
      }

      const { data: sups, error: supErr } = await supQuery.order('full_name');
      if (supErr) throw new Error(t('تعذر تحميل بيانات المشرفين.'));

      const supIds = (sups ?? []).map((s) => s.id);
      if (supIds.length === 0) {
        return { tracks: [], branches: [] };
      }

      // 2. Fetch branches for lookup with coordinates
      const { data: branches } = await supabase
        .from('branches')
        .select('id, name, region, latitude, longitude')
        .eq('company_id', sc.companyId);

      const branchMap = new Map(
        (branches ?? []).map((b) => [
          b.id,
          {
            name: b.name,
            location:
              Number.isFinite(Number(b.latitude)) && Number.isFinite(Number(b.longitude))
                ? { latitude: Number(b.latitude), longitude: Number(b.longitude) }
                : null,
          },
        ])
      );

      // 3. Fetch visits for the specified date
      let visitsQ = supabase
        .from('visits')
        .select(`
          id, supervisor_id, customer_id, visit_date, check_in_time, check_out_time,
          status, latitude, longitude, on_beat, geo_distance, notes,
          customers (id, name, address, latitude, longitude)
        `)
        .eq('company_id', sc.companyId)
        .eq('visit_date', date)
        .order('check_in_time', { ascending: true });

      // If scoped to a specific branch or branch manager, restrict to their supervisors only
      if (branchFilter !== 'all' || (sc.supervisor.role === 'branch_manager' && sc.supervisor.branch_id)) {
        visitsQ = visitsQ.in('supervisor_id', supIds);
      }

      const { data: visitsData, error: visitsErr } = await visitsQ;

      if (visitsErr) throw new Error(t('تعذر تحميل بيانات زيارات اليوم.'));

      // Group visits by supervisor
      const visitsBySup = new Map<string, any[]>();
      for (const v of visitsData ?? []) {
        if (!v.supervisor_id) continue;
        const list = visitsBySup.get(v.supervisor_id) ?? [];
        list.push(v);
        visitsBySup.set(v.supervisor_id, list);
      }

      // Compute live tracking record for each supervisor
      const list: SupervisorLiveTrack[] = (sups ?? []).map((s) => {
        const supVisits = visitsBySup.get(s.id) ?? [];
        const bInfo = s.branch_id ? branchMap.get(s.branch_id) : null;

        // Build route points that have valid coordinates
        const route: SupervisorRoutePoint[] = [];
        let seq = 1;
        for (const v of supVisits) {
          const lat = Number(v.latitude);
          const lng = Number(v.longitude);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            route.push({
              seq: seq++,
              visitId: v.id,
              customerId: v.customer_id,
              customerName: v.customers?.name ?? t('عميل غير معروف'),
              customerAddress: v.customers?.address,
              latitude: lat,
              longitude: lng,
              checkInTime: v.check_in_time,
              checkOutTime: v.check_out_time,
              status: v.status,
              onBeat: v.on_beat,
              geoDistance: v.geo_distance,
            });
          }
        }

        // Determine current live location and status
        // Priority 1: Visit currently in progress
        const inProgress = supVisits.find((v) => v.status === 'in_progress');
        if (inProgress && Number.isFinite(Number(inProgress.latitude)) && Number.isFinite(Number(inProgress.longitude))) {
          return {
            supervisorId: s.id,
            supervisorName: s.full_name,
            phone: s.phone,
            role: s.role,
            branchId: s.branch_id,
            branchName: bInfo?.name ?? null,
            branchLocation: bInfo?.location ?? null,
            liveStatus: 'in_progress',
            currentLocation: {
              latitude: Number(inProgress.latitude),
              longitude: Number(inProgress.longitude),
            },
            currentCustomerName: inProgress.customers?.name,
            currentCustomerAddress: inProgress.customers?.address,
            lastActiveTime: inProgress.check_in_time,
            route,
            totalVisitsToday: supVisits.length,
            completedVisitsToday: supVisits.filter((v) => v.status === 'completed').length,
          };
        }

        // Priority 2: Latest completed visit with coordinates
        const withCoords = route.filter((r) => r.status === 'completed');
        if (withCoords.length > 0) {
          const latest = withCoords[withCoords.length - 1];
          return {
            supervisorId: s.id,
            supervisorName: s.full_name,
            phone: s.phone,
            role: s.role,
            branchId: s.branch_id,
            branchName: bInfo?.name ?? null,
            branchLocation: bInfo?.location ?? null,
            liveStatus: 'completed',
            currentLocation: {
              latitude: latest.latitude,
              longitude: latest.longitude,
            },
            currentCustomerName: latest.customerName,
            currentCustomerAddress: latest.customerAddress,
            lastActiveTime: latest.checkOutTime || latest.checkInTime,
            route,
            totalVisitsToday: supVisits.length,
            completedVisitsToday: supVisits.filter((v) => v.status === 'completed').length,
          };
        }

        // Priority 3: Idle / No visits with coordinates today
        return {
          supervisorId: s.id,
          supervisorName: s.full_name,
          phone: s.phone,
          role: s.role,
          branchId: s.branch_id,
          branchName: bInfo?.name ?? null,
          branchLocation: bInfo?.location ?? null,
          liveStatus: 'idle',
          currentLocation: null,
          currentCustomerName: null,
          currentCustomerAddress: null,
          lastActiveTime: null,
          route,
          totalVisitsToday: supVisits.length,
          completedVisitsToday: 0,
        };
      });

      return {
        tracks: list,
        branches: branches ?? [],
      };
    },
  });

  const summary = useMemo<LiveTrackingSummary>(() => {
    const tracks = query.data?.tracks ?? [];
    let activeInVisit = 0;
    let movingAfterVisit = 0;
    let idleToday = 0;
    let totalVisitsRecorded = 0;

    for (const t of tracks) {
      if (t.liveStatus === 'in_progress') activeInVisit += 1;
      else if (t.liveStatus === 'completed') movingAfterVisit += 1;
      else idleToday += 1;

      totalVisitsRecorded += t.totalVisitsToday;
    }

    return {
      totalSupervisors: tracks.length,
      activeInVisit,
      movingAfterVisit,
      idleToday,
      totalVisitsRecorded,
    };
  }, [query.data?.tracks]);

  return {
    ...query,
    tracks: query.data?.tracks ?? [],
    branches: query.data?.branches ?? [],
    summary,
  };
}

export function useSupervisorVisitsHistory(supervisorId: string | null) {
  const sc = useScope();

  return useQuery({
    queryKey: [...sc.base, 'supervisor-history-visits', supervisorId],
    enabled: !!supervisorId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!supervisorId) return [];
      const { data, error } = await supabase
        .from('visits')
        .select(`
          id, supervisor_id, customer_id, visit_date, check_in_time, check_out_time,
          status, latitude, longitude, on_beat, geo_distance, notes,
          customers (id, name, address, phone)
        `)
        .eq('company_id', sc.companyId)
        .eq('supervisor_id', supervisorId)
        .order('visit_date', { ascending: false })
        .order('check_in_time', { ascending: false })
        .limit(20);

      if (error) throw error;

      return (data ?? []).map((v: any): SupervisorHistoryVisit => ({
        id: v.id,
        visitDate: v.visit_date,
        customerId: v.customer_id,
        customerName: v.customers?.name ?? t('عميل غير معروف'),
        customerAddress: v.customers?.address,
        customerPhone: v.customers?.phone,
        checkInTime: v.check_in_time,
        checkOutTime: v.check_out_time,
        status: v.status,
        latitude: Number.isFinite(Number(v.latitude)) ? Number(v.latitude) : null,
        longitude: Number.isFinite(Number(v.longitude)) ? Number(v.longitude) : null,
        onBeat: v.on_beat,
        geoDistance: v.geo_distance,
        notes: v.notes,
      }));
    },
  });
}
