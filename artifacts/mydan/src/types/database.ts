export type ID = string;
export type VisitStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export interface Supervisor {
  id: ID; user_id: ID; full_name: string; phone: string | null;
  role: 'admin' | 'supervisor' | 'senior_supervisor' | 'branch_manager' | 'super_admin'; branch_id: ID | null;
  company_id: ID; is_active: boolean;
  force_password_change?: boolean; password_changed_at?: string | null;
  device_id?: string | null;
}
export interface Customer {
  id: ID; name: string; customer_type: string; address: string;
  latitude: number | null; longitude: number | null; company_id: ID;
  supervisor_id: ID; is_active: boolean; customer_code?: string | null;
}
export interface Region {
  id: ID; company_id: ID; name: string; name_en?: string | null;
  is_active: boolean; created_at?: string;
}
export interface Visit {
  id: ID; supervisor_id: ID; customer_id: ID; visit_date: string;
  check_in_time: string | null; check_out_time: string | null;
  status: VisitStatus; latitude: number | null; longitude: number | null;
  notes: string | null; company_id: ID;
  on_beat?: boolean | null; geo_distance?: number | null;
}
/** Shape of the JSONB column ai_detailed_report in shelf_audit.
 *  Full payload comes from the analyze-shelf Edge Function (AuditSchema + metadata).
 *  Partial payload is written by the client-side fallback (issues + recommendations only).
 *  Null before first analysis. */
export interface AiDetailedReport {
  issues: string[];
  recommendations: string[];
  audit_summary_ar?: string;
  score?: number;
  target_brand_metrics?: {
    brand_present: boolean;
    facings: number;
    share_of_shelf_percentage: number;
    out_of_stock: boolean;
    oos_items: string[];
  };
  competitor_metrics?: {
    competitor_presence_detected: boolean;
    competitor_share_pct: number;
    brands_detected: string[];
  };
  posm_present?: boolean;
  price_tag_visible?: boolean;
  detailed_report?: {
    brand_analysis: string;
    competitor_analysis: string;
    display_quality: string;
    action_priority: string;
  };
  model?: string;
  engine?: 'google-gemini' | 'anthropic';
}
export interface ShelfAudit {
  id: ID; visit_id: ID; supervisor_id: ID; photo_url: string | null;
  audit_summary_ar: string | null; audit_score: number | null;
  ai_detailed_report: AiDetailedReport | null; status: 'pending' | 'processing' | 'completed' | 'failed';
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
  allow_password_change?: boolean; allow_forgot_password?: boolean;
  password_expiry_enabled?: boolean; password_expiry_days?: number;
  branch_lock_mode?: 'auto_supervisor_branch' | 'manual_selection';
}
export interface Target {
  id: ID; supervisor_id: ID | null; month: number; year: number;
  visits_target: number; audit_target: number;
  actual_visits: number; actual_audits: number; company_id: ID;
  criteria?: string; scope_type?: 'per_user' | 'general';
  target_scope?: 'all_branches' | 'specific_branch';
  branch_id?: ID | null; target_amount?: number;
}
export interface Product {
  id: ID; company_id: ID; name: string; category?: string | null;
  sku_code?: string | null; item_code?: string | null;
  master_brand?: string | null; sub_brand?: string | null;
  units_per_carton?: number | null; carton_price?: number | null;
  unit?: string | null; price?: number | null;
  is_active: boolean; created_at?: string;
}
export interface BeatPlan {
  id: ID; supervisor_id: ID; day_of_week: number; customer_id: ID; company_id: ID;
}
export interface Attendance {
  id: ID; supervisor_id: ID; company_id: ID;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  selfie_url: string | null;
  notes: string | null;
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
  supervisors: Supervisor; customers: Customer; regions: Region; products: Product; visits: Visit; shelf_audit: ShelfAudit;
  notifications: Notification; app_settings: AppSettings;
  targets: Target; beat_plans: BeatPlan; attendance: Attendance;
  training_courses: TrainingCourse; training_lessons: TrainingLesson;
  supervisor_training_progress: SupervisorTrainingProgress;
}