export type UserRole = "admin" | "staff" | "customer";

export interface Category {
  id: number;
  name: string;
  icon: string | null;
  sortOrder: number;
  isNew: boolean;
  /** The built-in "Ready-made" category: its items are sold as they are (bottled drinks)
   *  and counted in pieces, with no recipe. Its name is fixed and it can't be deleted. */
  isReadyMade: boolean;
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
  /** "recipe" for dishes, whose stock comes from their bill of materials; "unit" for
   *  ready-made items (the Ready-made category), which are counted in pieces. */
  tracking: StockTracking;
  /** Minutes the kitchen needs for one serving; 0 for items served as they are. */
  prepMinutes: number;
  /** Servings the raw materials can still make; pieces on hand for a ready-made item. */
  stockQty?: number;
  /** A ready-made item's minimum: at or below it, it needs restocking. */
  minStockThreshold?: number;
  /** The dish's bill of materials; sent to admins only, like cost. */
  recipe?: RecipeItem[];
  /** Quick special-instruction options the kiosk offers for this dish ("No onions"). */
  instructionOptions: string[];
  /** False hides special instructions (options and the typed note) for this dish on the kiosk. */
  allowInstructions: boolean;
  /** A dish's cost from its recipe at the raw materials' cost per unit; admins only. */
  recipeCost?: number | null;
  /** False when a raw material in the recipe has no cost yet, so recipeCost is too low (or null). */
  recipeCostComplete?: boolean;
  /** A ready-made item's market units, par level, safety stock and freshness. */
  planning?: StockPlanning;
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
  /** What is still ordered (0 for a dish cancelled whole after payment). */
  qty: number;
  /** How many were cancelled after payment (Paid orders > Cancel order); their amount was refunded. */
  cancelledQty: number;
  unitPrice: number;
  subtotal: number;
  specialInstructions: string | null;
  /** The dish's progress in the kitchen; sent only with the paid orders list (GET /api/orders?inKitchen=1). */
  kitchenStatus?: KitchenTaskStatus | null;
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
  /** PayMongo's code for an online payment, or the GCash / Maya reference number staff typed in. */
  reference: string | null;
  /** Cash the customer handed over at the counter, for the change (cash only). */
  amountTendered: number | null;
  paidAt: string | null;
}

export interface OrderDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  orderType: OrderType;
  /** "kiosk", or "counter" for a walk-in order staff rang up on the POS. */
  source: string;
  totalAmount: number;
  /** Staff must sort this order out (shown as NEEDS ATTENTION); the note says what to do. */
  stockIssue: boolean;
  stockIssueNote: string | null;
  /** Why the kitchen cancelled it; null otherwise. */
  cancelReason: string | null;
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
  /** Staff marked a cancelled, paid order as sorted out, having refunded the customer. */
  refundedAt: string | null;
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

/** One row of the import's Products table. A name that matches an existing product updates it. */
export interface BulkImportRowResult {
  row: number;
  status: "created" | "updated" | "error";
  name?: string;
  message?: string;
  /** A row that can be imported but deserves a look first. */
  warning?: string;
}

/** One row of the import's Recipes table (a raw material of a dish, per serving). */
export interface BulkImportRecipeRowResult {
  row: number;
  status: "ok" | "error";
  product?: string;
  rawMaterial?: string;
  message?: string;
  warning?: string;
}

export interface BulkImportSummary {
  /** Rows in the Products table. */
  total: number;
  created: number;
  updated: number;
  /** Rows with a problem, in both tables; nothing should be imported until it's 0. */
  errors: number;
  /** Rows that can be imported but carry a warning. */
  warnings: number;
  /** True for a preview: rows were checked and nothing was saved. */
  dryRun: boolean;
  results: BulkImportRowResult[];
  recipes: {
    /** Rows in the Recipes table. */
    total: number;
    /** Dishes whose recipe the import sets (replacing any recipe they had). */
    dishes: number;
    errors: number;
    results: BulkImportRecipeRowResult[];
  };
}

/** "damaged", "spoilage", "dropped" and "over_prepped" are waste: they only lower the stock. */
export type AdjustmentReason = "restock" | "return" | "damaged" | "spoilage" | "correction" | "other" | "dropped" | "over_prepped";

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

/** What kind of raw material it is (the Raw materials page's category filter). */
export type RawMaterialCategory =
  | "meat_seafood"
  | "produce"
  | "rice_noodles"
  | "sauces_seasonings"
  | "oils_fats"
  | "dairy_eggs"
  | "drinks_ice"
  | "others";

export interface RawMaterialDTO {
  id: string;
  name: string;
  unit: MaterialUnit;
  category: RawMaterialCategory;
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
  /** Market units, par level, safety stock and freshness. */
  planning: StockPlanning;
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

/** One row of the Stock movements tab (GET /api/inventory/movements). */
export interface StockMovementDTO {
  id: string;
  kind: "raw_material" | "ready_made";
  /** The raw material's id, or the ready-made item's product id. */
  itemId: string;
  itemName: string;
  unit: MaterialUnit;
  delta: number;
  /** Null for a ready-made item's sale, whose before/after counts aren't recorded. */
  previousQty: number | null;
  newQty: number | null;
  type: "sale" | "restock" | "adjustment";
  reason: AdjustmentReason | null;
  note: string | null;
  orderNumber: string | null;
  adjustedByName: string | null;
  createdAt: string;
}

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

// --- Market purchasing and the palengke cycle -------------------------------------------

/** How a stock item is kept, which sets how long it stays fresh. */
export type StorageType = "frozen" | "chilled" | "room";

/** A stock item is a raw material or a ready-made item (a product counted in pieces). */
export type StockItemKind = "raw_material" | "ready_made";

/** A unit the item is bought in at the market, and how many base units (g, ml, pieces) one is. */
export interface PurchaseUnitDTO {
  id: string;
  name: string;
  qtyInBase: number;
}

export interface PurchaseUnitInput {
  name: string;
  qtyInBase: number;
}

/** Planning fields shared by raw materials and ready-made items, in base units. */
export interface StockPlanning {
  /** The most to keep on hand: the shopping list never plans above it. */
  parLevel: number | null;
  /** A buffer kept on top of the expected usage until the next trip. */
  safetyStock: number | null;
  storage: StorageType | null;
  /** Days a purchase stays fresh in its storage; null = no shelf-life warning. */
  shelfLifeDays: number | null;
  purchaseUnits: PurchaseUnitDTO[];
}

export interface StockPlanningInput {
  parLevel?: number | null;
  safetyStock?: number | null;
  storage?: StorageType | null;
  shelfLifeDays?: number | null;
  /** Replaces the item's market units. */
  purchaseUnits?: PurchaseUnitInput[];
}

export type PurchaseKind = "market_trip" | "top_up";

export interface PurchaseLineDTO {
  id: string;
  kind: StockItemKind;
  itemId: string;
  itemName: string;
  baseUnit: MaterialUnit;
  unitName: string;
  unitQtyInBase: number;
  qtyUnits: number;
  qtyBase: number;
  lineTotal: number;
  /** Price of one market unit; null when nothing was bought. */
  pricePerUnit: number | null;
  /** From the shopping list, to compare with what was bought. */
  plannedUnits: number | null;
  /** A packaged item's printed expiry date (YYYY-MM-DD). */
  expiresOn: string | null;
}

/** One market receipt (GET /api/purchases, admins only). */
export interface PurchaseDTO {
  id: string;
  /** YYYY-MM-DD */
  purchasedOn: string;
  kind: PurchaseKind;
  store: string | null;
  note: string | null;
  totalAmount: number;
  createdByName: string;
  createdAt: string;
  lines: PurchaseLineDTO[];
}

export interface CreatePurchaseLineInput {
  kind: StockItemKind;
  itemId: string;
  /** One of the item's market units, or its base unit ("g", "ml", "pc"). */
  unitName: string;
  qtyUnits: number;
  lineTotal: number;
  plannedUnits?: number;
  expiresOn?: string;
}

export interface CreatePurchaseInput {
  purchasedOn: string;
  kind: PurchaseKind;
  store?: string;
  note?: string;
  lines: CreatePurchaseLineInput[];
}

export interface PricePointDTO {
  purchasedOn: string;
  unitName: string;
  qtyUnits: number;
  lineTotal: number;
  pricePerUnit: number;
  /** Price of one base unit (g, ml, piece), comparable across market units. */
  pricePerBase: number;
  store: string | null;
}

/** An item's prices over time, oldest first (GET /api/purchases/prices). */
export interface PriceHistoryDTO {
  kind: StockItemKind;
  itemId: string;
  itemName: string;
  baseUnit: MaterialUnit;
  points: PricePointDTO[];
}

export interface ShoppingListItemDTO {
  kind: StockItemKind;
  itemId: string;
  itemName: string;
  baseUnit: MaterialUnit;
  onHand: number;
  /** Average used per day over the recent window (sales and waste). */
  avgDailyUsage: number;
  /** Days the purchase has to cover: until the next trip, or less if it won't stay fresh. */
  coverDays: number;
  safetyStock: number;
  parLevel: number | null;
  /** How much to have after the trip: usage over coverDays + safety stock, up to par. */
  targetQty: number;
  /** How much to buy, in base units. */
  buyBase: number;
  /** The market unit to buy it in (the last one bought, else the first, else the base unit). */
  unitName: string;
  unitQtyInBase: number;
  /** How many market units to buy, rounded up. */
  buyUnits: number;
  lastPricePerUnit: number | null;
  estimatedCost: number | null;
  /** True when it won't stay fresh until the next trip: plan a top-up. */
  shortShelfLife: boolean;
  shelfLifeDays: number | null;
}

/** What to buy on the next market trip (GET /api/purchases/shopping-list, admins only). */
export interface ShoppingListDTO {
  days: number;
  usageWindowDays: number;
  items: ShoppingListItemDTO[];
  estimatedTotal: number;
  /** Items to buy with no price yet, left out of estimatedTotal. */
  itemsWithoutPrice: number;
}

export interface StockCountLineDTO {
  kind: StockItemKind;
  itemId: string;
  itemName: string;
  baseUnit: MaterialUnit;
  /** What the system expected when counted. */
  systemQty: number;
  countedQty: number;
  /** counted − system: negative is missing stock. */
  difference: number;
  /** Admins only. */
  differenceValue?: number | null;
  /** What happened since the previous count of this item (base units). */
  since: { previousCountedQty: number | null; purchased: number; sold: number; wasted: number; otherAdjustments: number };
}

/** A physical count and its variance (GET /api/inventory/counts/:id). */
export interface StockCountDTO {
  id: string;
  countedAt: string;
  note: string | null;
  createdByName: string;
  previousCountAt: string | null;
  lines: StockCountLineDTO[];
  /** Admins only. */
  totalDifferenceValue?: number | null;
}

export interface StockCountSummaryDTO {
  id: string;
  countedAt: string;
  createdByName: string;
  itemCount: number;
  /** Items whose count differed from the system. */
  itemsOff: number;
  /** Admins only. */
  totalDifferenceValue?: number | null;
}

export interface CreateStockCountInput {
  note?: string;
  lines: { kind: StockItemKind; itemId: string; countedQty: number }[];
}

export interface UsageRowDTO {
  kind: StockItemKind;
  itemId: string;
  itemName: string;
  baseUnit: MaterialUnit;
  /** Used by sales (base units). */
  used: number;
  /** Thrown away: damaged, spoiled, dropped, over-prepped. */
  wasted: number;
  purchased: number;
  avgDailyUsage: number;
  onHand: number;
  usedValue: number | null;
  wastedValue: number | null;
}

/** Usage and waste per item for a period (GET /api/reports/usage, admins only). */
export interface UsageReportDTO {
  from: string;
  to: string;
  days: number;
  rows: UsageRowDTO[];
  totalWastedValue: number;
  wasteByReason: { reason: AdjustmentReason; value: number }[];
}

/** An item to use soon or throw out (GET /api/inventory/freshness). */
export interface FreshnessWarningDTO {
  kind: StockItemKind;
  itemId: string;
  itemName: string;
  baseUnit: MaterialUnit;
  onHand: number;
  status: "expired" | "use_soon";
  /** From the days it stays fresh in storage, or from a printed expiry date. */
  basis: "shelf_life" | "printed_date";
  /** When the oldest stock still on hand was bought (YYYY-MM-DD). */
  boughtOn: string | null;
  /** When it goes off (YYYY-MM-DD). */
  goesOffOn: string;
  daysLeft: number;
  storage: StorageType | null;
}

export interface FoodCostTripDTO {
  purchaseId: string;
  purchasedOn: string;
  /** The next market trip (exclusive), or null for the current one. */
  untilOn: string | null;
  /** The trip plus the top-ups until the next trip. */
  spent: number;
  topUps: number;
  /** Sales paid from the trip until the next one. */
  sales: number;
  /** spent ÷ sales; null with no sales. */
  ratio: number | null;
}

/** Food cost for a period (GET /api/reports/food-cost, admins only). */
export interface FoodCostReportDTO {
  from: string;
  to: string;
  sales: number;
  /** What the dishes sold cost, from their recipes when paid (sales with a cost only). */
  recipeCost: number;
  salesWithCost: number;
  /** recipeCost ÷ salesWithCost. */
  recipeFoodCostPct: number | null;
  /** What was spent at the market in the period. */
  purchases: number;
  /** purchases ÷ sales. */
  purchaseFoodCostPct: number | null;
  /** Sales of dishes whose cost wasn't known when paid. */
  uncostedSales: number;
  trips: FoodCostTripDTO[];
}

/** A raw material in use or a ready-made item (GET /api/inventory/items). */
export interface StockItemDTO {
  kind: StockItemKind;
  itemId: string;
  name: string;
  baseUnit: MaterialUnit;
  onHand: number;
  /** Admins only. */
  costPerBase?: number | null;
  minStock: number;
  parLevel: number | null;
  safetyStock: number | null;
  storage: StorageType | null;
  shelfLifeDays: number | null;
  /** Market units, smallest first. */
  units: { name: string; qtyInBase: number }[];
}
