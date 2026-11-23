export interface OrderLineItem {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  unit?: string;
  units_per_carton?: number;
  total_pieces?: number;
}

export interface OrderRecord {
  id: string;
  visit_id: string;
  supervisor_id: string;
  customer_id: string;
  company_id: string;
  items: OrderLineItem[];
  total_amount: number;
  status: 'pending' | 'delivered' | 'cancelled';
  notes: string | null;
  order_date: string;
  delivered_at: string | null;
  created_at: string;
  customers?: {
    id: string;
    name: string;
    address?: string | null;
    customer_type?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    branch?: string | null;
    customer_code?: string | null;
  } | null;
  supervisors?: { id: string; full_name: string; phone?: string | null; branch_id?: string | null } | null;
}

export interface OrdersKPI {
  totalOrders: number;
  totalAmount: number;
  deliveredOrders: number;
  deliveredAmount: number;
  pendingOrders: number;
  pendingAmount: number;
  deliveryRate: number;
}

export function computeOrdersKPI(orders: OrderRecord[]): OrdersKPI {
  let totalOrders = 0;
  let totalAmount = 0;
  let deliveredOrders = 0;
  let deliveredAmount = 0;
  let pendingOrders = 0;
  let pendingAmount = 0;

  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    const amount = Number(o.total_amount) || 0;
    totalOrders += 1;
    totalAmount += amount;
    if (o.status === 'delivered') {
      deliveredOrders += 1;
      deliveredAmount += amount;
    } else {
      pendingOrders += 1;
      pendingAmount += amount;
    }
  }

  const deliveryRate = totalOrders === 0 ? 0 : Math.round((deliveredOrders / totalOrders) * 100);

  return { totalOrders, totalAmount, deliveredOrders, deliveredAmount, pendingOrders, pendingAmount, deliveryRate };
}
