// Socket.IO event map. Declared here so both apps/api and apps/web import the same
// typed contract from day one.

export interface InventoryUpdatedEvent {
  productId: string;
  isAvailable: boolean;
  stockQty: number;
}

export interface PaymentConfirmedEvent {
  orderId: string;
  orderNumber: string;
  kioskSessionId: string | null;
}

export interface OrderCreatedEvent {
  orderId: string;
  orderNumber: string;
}

export interface KitchenTaskUpdatedEvent {
  taskId: string;
  orderId: string;
  status: "pending" | "in_progress" | "completed";
}

export interface ServerToClientEvents {
  "inventory:updated": (payload: InventoryUpdatedEvent) => void;
  "payment:confirmed": (payload: PaymentConfirmedEvent) => void;
  "order:created": (payload: OrderCreatedEvent) => void;
  "kitchen:task_updated": (payload: KitchenTaskUpdatedEvent) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientToServerEvents {}
