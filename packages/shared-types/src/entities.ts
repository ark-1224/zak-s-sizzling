export type UserRole = "admin" | "staff" | "customer";

export interface Category {
  id: number;
  name: string;
  icon: string | null;
  sortOrder: number;
  isNew: boolean;
}

export interface Nutrition {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  sugar: number | null;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  cost: number | null;
  barcode: string | null;
  categoryId: number;
  category?: Category;
  description: string | null;
  icon: string | null;
  ingredients: string[];
  allergens: string[];
  nutrition: Nutrition;
  isAvailable: boolean;
  stockQty?: number;
  minStockThreshold?: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface CreateOrderItemInput {
  productId: string;
  qty: number;
  specialInstructions?: string;
}

export interface CreateOrderInput {
  items: CreateOrderItemInput[];
  customerName?: string;
}

export type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
export type PaymentMethod = "gcash" | "maya" | "counter";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export interface OrderItemDTO {
  id: string;
  productId: string;
  productName: string;
  productIcon: string | null;
  qty: number;
  unitPrice: number;
  subtotal: number;
  specialInstructions: string | null;
}

export interface PaymentDTO {
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  reference: string | null;
  paidAt: string | null;
}

export interface OrderDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
  items: OrderItemDTO[];
  payment: PaymentDTO | null;
}

export type KitchenTaskStatus = "pending" | "in_progress" | "completed";

export interface KitchenTaskDTO {
  id: string;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: string;
  productId: string;
  productName: string;
  productIcon: string | null;
  qty: number;
  specialInstructions: string | null;
  status: KitchenTaskStatus;
  startedAt: string | null;
  completedAt: string | null;
}

export interface SalesReportPoint {
  bucket: string; // e.g. "2026-09-10" for daily, ISO week/month key for weekly/monthly
  orderCount: number;
  revenue: number;
}

export interface TopProductPoint {
  productId: string;
  productName: string;
  qtySold: number;
  revenue: number;
}

export interface InventoryMovementPoint {
  productId: string;
  productName: string;
  qtySold: number;
  currentStock: number | null;
}

/** Realized profit from actual sales, not a static price/cost snapshot — null cost/
 *  margin means the product has no cost recorded yet, not that profit was zero. */
export interface ProfitabilityPoint {
  productId: string;
  productName: string;
  cost: number | null;
  price: number;
  marginPct: number | null;
  qtySold: number;
  grossProfit: number | null;
}

export interface UserAccountDTO {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  isActive: boolean;
  createdAt: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: "admin" | "staff";
}

export interface UpdateUserInput {
  name?: string;
  role?: "admin" | "staff";
  isActive?: boolean;
  password?: string;
}

export interface BulkImportRowResult {
  row: number;
  status: "created" | "updated" | "error";
  name?: string;
  message?: string;
}

export interface BulkImportSummary {
  total: number;
  created: number;
  updated: number;
  errors: number;
  results: BulkImportRowResult[];
}
