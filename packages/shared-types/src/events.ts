// Socket.IO event map — Sprint 5 will add kitchen-queue events on top of these.
// Declared now so both apps/api and apps/web import the same typed contract from day one.

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

export interface ServerToClientEvents {
  "inventory:updated": (payload: InventoryUpdatedEvent) => void;
  "payment:confirmed": (payload: PaymentConfirmedEvent) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientToServerEvents {}
