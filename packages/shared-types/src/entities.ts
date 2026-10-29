export type UserRole = "admin" | "staff" | "customer";

export interface Category {
  id: number;
  name: string;
  icon: string | null;
  sortOrder: number;
  isNew: boolean;
  /** How many products are in it (an empty category is the only kind that can be deleted).
   *  Sent by GET /api/categories; not on the category inside a product. */
  productCount?: number;
}

export interface Nutrition {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  sugar: number | null;
}

/** `unit`: the product has its own stock count. `recipe`: stock comes from its raw materials. */
export type StockTracking = "unit" | "recipe";

export interface RecipeItem {
  rawMaterialId: string;
  rawMaterialName: string;
  unit: MaterialUnit;
  qtyPerServing: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  /** Sent to admins only; null means no cost recorded yet. */
  cost?: number | null;
  barcode: string | null;
  categoryId: number;
  category?: Category;
  description: string | null;
  icon: string | null;
  /** Path of the product's photo on the API (GET /api/products/:id/image?v=…), or null for none; the kiosk shows the icon then. */
  imageUrl: string | null;
  ingredients: string[];
  allergens: string[];
  nutrition: Nutrition;
  isAvailable: boolean;
  tracking: StockTracking;
  /** Minutes the kitchen needs for one serving; 0 for items served as they are. */
  prepMinutes: number;
  /** Unit products: units on hand. Recipe products: servings the raw materials can still make. */
  stockQty?: number;
  minStockThreshold?: number;
  /** Recipe products only; sent to admins only, like cost. */
  recipe?: RecipeItem[];
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

/** POST /api/auth/login's answer to a correct password while sign-in codes are on. */
export interface LoginCodeChallenge {
  codeRequired: true;
  challengeId: string;
  /** The account's email, partly hidden: "ma•••@gmail.com". */
  sentTo: string;
  expiresInSeconds: number;
  /** How long until "Send a new code" may be used. */
  resendInSeconds: number;
}

export interface CreateOrderItemInput {
  productId: string;
  qty: number;
  specialInstructions?: string;
}

export interface CreateOrderInput {
  items: CreateOrderItemInput[];
  customerName?: string;
  orderType?: OrderType;
}

/** POST /api/orders/estimate: the cart's estimated preparation time at checkout. */
export interface PrepEstimate {
  /** 0 = ready right away (only items served as they are). */
  estimatedPrepMinutes: number;
  /** Orders in the kitchen right now, which the estimate allows for. */
  ordersAhead: number;
}

export type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
/** Where the customer eats, chosen on the kiosk right after the welcome screen. */
export type OrderType = "dine_in" | "take_out";
/** "gcash" and "maya" appear only on older orders; new orders use "counter" or "qrph". */
export type PaymentMethod = "counter" | "qrph" | "gcash" | "maya";
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

/** Which payment methods the kiosk can offer right now (GET /api/payments/options). */
export interface PaymentOptions {
  /** False until PayMongo is configured on the server: QR Ph can't be used yet. */
  online: boolean;
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
  orderType: OrderType;
  totalAmount: number;
  /** Paid online but stock ran short: nothing was deducted and staff must substitute or refund. */
  stockIssue: boolean;
  stockIssueNote: string | null;
  /** Estimated preparation time in minutes: from when the order was placed, then from when it reached the kitchen. 0 = ready right away. */
  estimatedPrepMinutes: number | null;
  /** When the order should be ready; set once it reaches the kitchen (paid, or confirmed at the counter). */
  estimatedReadyAt: string | null;
  createdAt: string;
  items: OrderItemDTO[];
  payment: PaymentDTO | null;
}

export type KitchenTaskStatus = "pending" | "in_progress" | "completed";

/** When an order reached each step, for the transaction history (null = not reached). */
export interface OrderTimeline {
  placedAt: string;
  paidAt: string | null;
  /** The kitchen started the first dish. */
  preparingAt: string | null;
  /** The kitchen finished the last dish. */
  readyAt: string | null;
  handedOverAt: string | null;
  cancelledAt: string | null;
}

export interface TransactionDTO extends OrderDTO {
  timeline: OrderTimeline;
}

/** One page of the transaction history, with totals for every order the filters match. */
export interface TransactionPageDTO {
  orders: TransactionDTO[];
  page: number;
  pageSize: number;
  /** Orders matching the filters (all pages). */
  total: number;
  /** Paid orders among them (confirmed to completed), and their sales, in pesos. */
  paidCount: number;
  sales: number;
  /** sales ÷ paidCount, or null with no paid orders. */
  averageOrderValue: number | null;
  /** The dates used (YYYY-MM-DD, Manila), so the page can show the default range. */
  from: string;
  to: string;
}

/** The order status board at the counter: order numbers only (GET /api/orders/board). */
export interface OrderBoardDTO {
  /** Paid orders the kitchen is working on, oldest first. */
  preparing: string[];
  /** Orders waiting to be collected, most recently ready first. */
  ready: string[];
}

export interface KitchenTaskDTO {
  id: string;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: string;
  /** When the whole order should be ready (OrderDTO.estimatedReadyAt). */
  orderEstimatedReadyAt: string | null;
  orderType: OrderType;
  /** confirmed → preparing (a dish started) → ready (every dish done) → completed (handed over). */
  orderStatus: OrderStatus;
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
  /** Revenue ÷ paid orders in the bucket (a bucket only exists when it has orders). */
  averageOrderValue: number;
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
  /** True for a preview: rows were checked and nothing was saved. */
  dryRun: boolean;
  results: BulkImportRowResult[];
}

export type AdjustmentReason = "restock" | "return" | "damaged" | "spoilage" | "correction" | "other";

export interface StockAdjustmentDTO {
  id: string;
  productId: string;
  productName: string;
  productIcon: string | null;
  delta: number;
  previousQty: number;
  newQty: number;
  reason: AdjustmentReason;
  note: string | null;
  adjustedByName: string;
  createdAt: string;
}

export interface AdjustStockInput {
  setQty?: number;
  delta?: number;
  minStockThreshold?: number;
  reason?: AdjustmentReason;
  note?: string;
}

/** Raw materials are stored in base units only; the admin screens show kg or L for large amounts. */
export type MaterialUnit = "g" | "ml" | "pc";

export interface RawMaterialDTO {
  id: string;
  name: string;
  unit: MaterialUnit;
  stockQty: number;
  minStockThreshold: number;
  /** Sent to admins only. */
  costPerUnit?: number | null;
  isActive: boolean;
  isLow: boolean;
  /** Dishes whose recipe uses this raw material. */
  usedBy: { productId: string; productName: string; qtyPerServing: number }[];
  /** Nutrition per 100 g (from a USDA food, or typed in), or null if not set. */
  nutrition: RawMaterialNutrition | null;
  /** Grams in one piece (pc) or one ml (ml); null for g, or when not set. */
  gramsPerUnit: number | null;
}

export interface NutritionPer100g {
  calories: number;
  protein: number;
  carbs: number;
  sugar: number;
}

export interface RawMaterialNutrition {
  /** The USDA FoodData Central food it came from, or null if typed in. */
  fdcId: number | null;
  description: string | null;
  per100g: NutritionPer100g;
}

/** One match from the USDA FoodData Central search (GET /api/nutrition/search). */
export interface UsdaFoodMatch {
  fdcId: number;
  description: string;
  dataType: string;
  per100g: NutritionPer100g;
}

/** A recipe dish's estimated nutrition per serving (POST /api/nutrition/estimate). */
export interface NutritionEstimate {
  nutrition: Nutrition;
  /** Raw materials left out because they have no nutrition, or no weight per piece. */
  missing: string[];
  /** Raw materials in ml without a weight, counted as 1 g per ml. */
  assumedOneGramPerMl: string[];
}

export type RawMaterialMovementType = "sale" | "adjustment" | "restock";

export interface RawMaterialMovementDTO {
  id: string;
  rawMaterialId: string;
  rawMaterialName: string;
  unit: MaterialUnit;
  delta: number;
  previousQty: number;
  newQty: number;
  type: RawMaterialMovementType;
  reason: AdjustmentReason | null;
  note: string | null;
  orderNumber: string | null;
  adjustedByName: string | null;
  createdAt: string;
}
