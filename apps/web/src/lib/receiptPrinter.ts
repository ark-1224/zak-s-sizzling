import type { OrderDTO } from "@zaks/shared-types";

// Printing on the 58 mm thermal printers (RP21UB-Y, USB). There are two, each plugged into
// a device running the print service (print-service/ in this repo):
// - the in-store kiosk's Raspberry Pi prints the customer's receipt once an order is
//   placed: POST /print with { orderNumber, items: [{ qty, name, price }], total, ... }.
// - the device showing the kitchen display prints a kitchen ticket (order number and
//   dishes) once a paid order reaches the kitchen: POST /print/kitchen.
// The service listens on the device itself, so only a page open on that device reaches it.
//
// Phones that open the kiosk from the QR code, and other staff screens, must never print
// (or try to reach the service), so printing is switched on per device and page: the
// kiosk (or the kitchen display) is opened once with ?printer=1 in the address, and the
// page remembers that on the device. ?printer=0 switches it off again.
const PRINT_URL = process.env.NEXT_PUBLIC_PRINT_SERVICE_URL || "http://127.0.0.1:4000/print";
const PRINT_TIMEOUT_MS = 8000;

export type PrinterPlace = "kiosk" | "kitchen";
const PRINTER_KEY: Record<PrinterPlace, string> = { kiosk: "zaks.kiosk.printer", kitchen: "zaks.kitchen.printer" };
// Orders whose kitchen ticket has printed on this device, so a reload doesn't print again.
const KITCHEN_PRINTED_KEY = "zaks.kitchen.printed";
const KITCHEN_PRINTED_KEEP = 200;

/** Reads ?printer=1 / ?printer=0 from the address and remembers it on this device. */
export function rememberPrinterSetting(place: PrinterPlace = "kiosk") {
  try {
    const value = new URLSearchParams(window.location.search).get("printer");
    if (value === "1") window.localStorage.setItem(PRINTER_KEY[place], "1");
    else if (value === "0") {
      window.localStorage.removeItem(PRINTER_KEY[place]);
      if (place === "kitchen") window.localStorage.removeItem(KITCHEN_PRINTED_KEY);
    }
  } catch {
    // Storage can be blocked; the device then simply doesn't print.
  }
}

/** True on the device (and page) that has a printer attached. */
export function hasPrinter(place: PrinterPlace): boolean {
  try {
    return window.localStorage.getItem(PRINTER_KEY[place]) === "1";
  } catch {
    return false;
  }
}

/** True on the kiosk that has the receipt printer attached. */
export function hasReceiptPrinter(): boolean {
  return hasPrinter("kiosk");
}

/** POSTs to the print service. Resolves true once it has printed, false if the service
 *  didn't answer, refused it, or took too long. */
async function sendToPrinter(url: string, body: unknown): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRINT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    const answer = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return answer?.ok !== false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Prints the customer's receipt on the kiosk printer. */
export function printReceipt(order: OrderDTO): Promise<boolean> {
  return sendToPrinter(PRINT_URL, {
    orderNumber: order.orderNumber,
    // `price` is the line's amount (qty × unit price), printed beside the line.
    items: order.items.map((item) => ({ qty: item.qty, name: item.productName, price: item.subtotal })),
    total: order.totalAmount,
    // The print service prints dine in / take out, paid or not, the time and the ready time.
    orderType: order.orderType,
    paymentMethod: order.payment?.method ?? null,
    paid: order.payment?.status === "paid",
    estimatedPrepMinutes: order.estimatedPrepMinutes,
    createdAt: order.createdAt,
  });
}

export interface KitchenTicket {
  orderNumber: string;
  items: { qty: number; name: string; note: string | null }[];
}

/** Prints a kitchen ticket (order number and dishes only) on the kitchen printer. */
export function printKitchenTicket(ticket: KitchenTicket): Promise<boolean> {
  return sendToPrinter(`${PRINT_URL}/kitchen`, ticket);
}

/** The orders whose kitchen ticket has printed on this device, or null if none are recorded
 *  yet (the printer was only just switched on). */
export function loadPrintedKitchenOrders(): Set<string> | null {
  try {
    const stored = window.localStorage.getItem(KITCHEN_PRINTED_KEY);
    return stored === null ? null : new Set(JSON.parse(stored) as string[]);
  } catch {
    return null;
  }
}

/** Records that these orders' kitchen tickets have printed (keeps the newest ones only). */
export function rememberPrintedKitchenOrders(orderIds: Iterable<string>) {
  try {
    const all = [...(loadPrintedKitchenOrders() ?? []), ...orderIds];
    const unique = [...new Set(all)].slice(-KITCHEN_PRINTED_KEEP);
    window.localStorage.setItem(KITCHEN_PRINTED_KEY, JSON.stringify(unique));
  } catch {
    // Without storage a reload may print a ticket again; nothing else breaks.
  }
}
