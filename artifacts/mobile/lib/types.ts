export interface Supervisor {
  id: string;
  full_name: string;
  phone: string;
  branch: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  address: string;
  created_at: string;
}

export interface CustomerWithDistance extends Customer {
  distance: number; // meters
}

export interface Visit {
  id: string;
  supervisor_id: string;
  customer_id: string;
  status: 'متعامل' | 'غير متعامل' | 'غير موجود';
  latitude: number;
  longitude: number;
  geo_distance: number;
  on_beat: boolean;
  visit_date: string;
  notes: string;
  perfect_store_score?: number | null;
  customers?: { name: string; type: string; address: string };
}

export interface Product {
  id: string;
  name: string;
  category: string;
  sku?: string;
  unit?: string;
  price?: number | null;
  image_url?: string;
  is_active: boolean;
  created_at: string;
}

export interface AIAnalysis {
  is_present: boolean;
  estimated_quantity: number;
  display_order: 'مرتب' | 'غير مرتب';
  confidence: number;
}

export interface ShelfAuditItem {
  product_id: string;
  product_name: string;
  category: string;
  is_present: boolean;
  quantity: number;
  photo_uri?: string;
  photo_base64?: string;
  ai_analysis?: AIAnalysis | null;
}

export interface CompetitorProduct {
  id: string;
  brand_name: string;
  product_name: string;
  quantity: number;
  price?: number | null;
  photo_uri?: string;
}

export interface CompetitorPriceRecord {
  id: string;
  visit_id: string;
  brand_name: string;
  product_name: string;
  quantity: number;
  price: number | null;
  created_at: string;
  visits?: { visit_date: string; customer_id: string; customers?: { name: string; type: string } };
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  category: string;
  quantity: number;
}

export interface Target {
  id: string;
  supervisor_id: string;
  target_date: string;
  visits_target: number;
  audit_target: number;
  created_at: string;
}
