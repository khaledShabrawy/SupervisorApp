export {
  geofence,
  mapsDirectionsUrl,
  NEAREST_LIMITS,
  optimizeRoute,
  totalRouteKm,
  isVisitOutcome,
  VISIT_OUTCOMES,
} from '@/lib/visit-geo';
export type { NearestLimit, VisitOutcome } from '@/lib/visit-geo';
export {
  useCreateVisit,
  useNearestCustomers,
  useVisitToStart,
  useUpdateVisitStatus,
  useSetVisitOutcome,
  useBeatPlan,
  useBeatPlanDays,
} from '@/lib/data';
export { useVisitsRange, useCustomerById } from '@/lib/screen-data';
