import type { OrderDTO } from "@zaks/shared-types";

// Printed receipts on the in-store kiosk. The thermal printer (RP21UB-Y, 58 mm, USB) is
// plugged into the kiosk's Raspberry Pi, and the print service on the Pi (print-service/
// in this repo) prints each order as two slips, the customer's receipt and a kitchen copy:
// POST /print with { orderNumber, items: [{ qty, name, price }], total, ... }. It listens
// on the Pi itself, so only a page open on the Pi can reach it.
//
// Phones that open the kiosk from the QR code must never print (or try to reach the
// service), so printing is switched on per device: the Pi opens the kiosk once with
// ?printer=1 in the address, and the page remembers that on the device. ?printer=0
// switches it off again.
const PRINT_URL = process.env.NEXT_PUBLIC_PRINT_SERVICE_URL || "http://127.0.0.1:4000/print";
const PRINTER_KEY = "zaks.kiosk.printer";
const PRINT_TIMEOUT_MS = 8000;

/** Reads ?printer=1 / ?printer=0 from the address and remembers it on this device. */
export function rememberPrinterSetting() {
  try {
    const value = new URLSearchParams(window.location.search).get("printer");
    if (value === "1") window.localStorage.setItem(PRINTER_KEY, "1");
    else if (value === "0") window.localStorage.removeItem(PRINTER_KEY);
  } catch {
    // Storage can be blocked; the device then simply doesn't print.
  }
}

/** True on the device that has the receipt printer attached. */
export function hasReceiptPrinter(): boolean {
  try {
    return window.localStorage.getItem(PRINTER_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Sends the order to the print service. Resolves true once the receipt has printed,
 * false if the service didn't answer, refused it, or took too long.
 */
export async function printReceipt(order: OrderDTO): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRINT_TIMEOUT_MS);
  try {
    const res = await fetch(PRINT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
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
      }),
    });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return body?.ok !== false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
