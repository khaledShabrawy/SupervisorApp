export const CUSTOMER_COLUMNS = 'id,name,type,customer_type,address,latitude,longitude,company_id,supervisor_id,is_active';
export const VISIT_COLUMNS = 'id,supervisor_id,customer_id,visit_date,check_in_time,check_out_time,status,latitude,longitude,notes,company_id';
export const VISIT_JOIN = `${VISIT_COLUMNS},customers(name,address,latitude,longitude)`;
export const AUDIT_COLUMNS = 'id,visit_id,supervisor_id,photo_url,audit_summary_ar,audit_score,ai_detailed_report,status,audited_at,company_id';
export const TARGET_COLUMNS = 'id,supervisor_id,month,year,visits_target,audit_target,actual_visits,actual_audits,company_id';
export const SETTINGS_COLUMNS = 'id,company_id,app_name,logo_url,primary_color,success_color,danger_color,background_color,geofence_radius_m,target_brand_name,competitor_brands,ai_audit_enabled';
export const NOTIFICATION_COLUMNS = 'id,supervisor_id,type,title_ar,body_ar,is_read,created_at';