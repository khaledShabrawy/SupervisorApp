export type ID = string;
export type VisitStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export interface Supervisor {
  id: ID; user_id: ID; full_name: string; phone: string | null;
  role: 'admin' | 'supervisor' | 'senior_supervisor' | 'branch_manager' | 'super_admin'; branch_id: ID | null;
  company_id: ID; is_active: boolean;
}
export interface Customer {
  id: ID; name: string; customer_type: string; address: string;
  latitude: number | null; longitude: number | null; company_id: ID;
  supervisor_id: ID; is_active: boolean;
}
export interface Visit {
  id: ID; supervisor_id: ID; customer_id: ID; visit_date: string;
  check_in_time: string | null; check_out_time: string | null;
  status: VisitStatus; latitude: number | null; longitude: number | null;
  notes: string | null; company_id: ID;
  on_beat?: boolean | null; geo_distance?: number | null;
}
export interface ShelfAudit {
  id: ID; visit_id: ID; supervisor_id: ID; photo_url: string | null;
  audit_summary_ar: string | null; audit_score: number | null;
  ai_detailed_report: any; status: 'pending' | 'processing' | 'completed' | 'failed';
  audited_at: string | null; company_id: ID;
}
export interface Notification {
  id: ID; supervisor_id: ID; type: string; title_ar: string; body_ar: string;
  is_read: boolean; created_at: string;
}
export interface AppSettings {
  id: ID; company_id: ID; app_name: string; logo_url: string | null;
  primary_color: string; success_color: string; danger_color: string;
  background_color: string; geofence_radius_m: number; target_brand_name: string;
  competitor_brands: string[]; ai_audit_enabled: boolean;
}
export interface Target {
  id: ID; supervisor_id: ID; month: number; year: number;
  visits_target: number; audit_target: number;
  actual_visits: number; actual_audits: number; company_id: ID;
}
export interface BeatPlan {
  id: ID; supervisor_id: ID; day_of_week: number; customer_id: ID; company_id: ID;
}
export interface Attendance {
  id: ID; supervisor_id: ID; date: string; check_in: string | null;
  check_out: string | null; company_id: ID;
}
export interface TrainingCourse {
  id: ID; company_id: ID; title: string; description: string | null;
  category: string; thumbnail_url: string | null; display_order: number;
  is_published: boolean; created_at: string;
}
export interface TrainingLesson {
  id: ID; course_id: ID; company_id: ID; title: string; description: string | null;
  video_url: string; duration_seconds: number; attachment_url: string | null;
  display_order: number; is_published: boolean; created_at: string;
}
export interface SupervisorTrainingProgress {
  id: ID; company_id: ID; supervisor_id: ID; lesson_id: ID;
  is_completed: boolean; last_watched_seconds: number; completed_at: string | null;
  created_at: string; updated_at: string;
}
export interface TableMap {
  supervisors: Supervisor; customers: Customer; visits: Visit; shelf_audit: ShelfAudit;
  notifications: Notification; app_settings: AppSettings;
  targets: Target; beat_plans: BeatPlan; attendance: Attendance;
  training_courses: TrainingCourse; training_lessons: TrainingLesson;
  supervisor_training_progress: SupervisorTrainingProgress;
}