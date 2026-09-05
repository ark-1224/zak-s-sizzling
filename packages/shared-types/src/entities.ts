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
