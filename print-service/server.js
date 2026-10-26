// Print service for the in-store kiosk. It runs on the kiosk's Raspberry Pi, next to the
// 58 mm thermal printer (RP21UB-Y, USB), and turns an order from the kiosk page into two
// slips: the customer's receipt (with prices) and a kitchen copy (big order number and
// items, no prices). The kiosk page sends the order from apps/web/src/lib/receiptPrinter.ts
// once it is placed (or paid with QR Ph).
//
// It listens on 127.0.0.1 only, so just a page open on the Pi itself can reach it.
const express = require("express");
const cors = require("cors");
const { ThermalPrinter, PrinterTypes } = require("node-thermal-printer");

const PORT = Number(process.env.PORT) || 4000;
const PRINTER_INTERFACE = process.env.PRINTER_INTERFACE || "/dev/usb/lp0";
const LINE_WIDTH = 32; // characters per line on 58 mm paper
// Only the kiosk site may print; any other page open in the Pi's browser is refused.
const KIOSK_ORIGINS = (process.env.KIOSK_ORIGINS || "https://web-production-ba868.up.railway.app,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const isKioskOrigin = (origin) => !!origin && KIOSK_ORIGINS.includes(origin);

const app = express();

// Let the public kiosk site call this local service (Chromium asks for this header), and
// refuse requests from any other site before they reach the printer.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !isKioskOrigin(origin)) return res.status(403).json({ ok: false, error: "origin not allowed" });
  if (origin) res.setHeader("Access-Control-Allow-Private-Network", "true");
  next();
});
app.use(cors({ origin: (origin, callback) => callback(null, isKioskOrigin(origin)) }));
app.use(express.json());

const ORDER_TYPE = { dine_in: "DINE IN", take_out: "TAKE OUT" };
const peso = (n) => Number(n).toFixed(2);
const timeOf = (createdAt) =>
  new Date(createdAt || Date.now()).toLocaleString("en-PH", { timeZone: "Asia/Manila" });

// Feeds the slip past the tear bar, and cuts if the printer has a cutter (ignored if not).
function endSlip(printer, tearLine) {
  printer.newLine();
  printer.alignCenter();
  if (tearLine) printer.println("- - - - tear here - - - -");
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.cut();
}

function customerSlip(printer, order) {
  printer.alignCenter();
  printer.bold(true);
  printer.println("ZAK'S SIZZLING HUB");
  printer.bold(false);
  printer.setTextDoubleHeight();
  printer.println("ORDER #" + order.orderNumber);
  printer.setTextNormal();
  if (ORDER_TYPE[order.orderType]) printer.println(ORDER_TYPE[order.orderType]);
  printer.println(timeOf(order.createdAt));
  printer.drawLine();
  printer.alignLeft();
  order.items.forEach((item) => printer.leftRight(`${item.qty}x ${item.name}`, peso(item.price)));
  printer.drawLine();
  printer.bold(true);
  printer.leftRight("TOTAL", peso(order.total));
  printer.bold(false);
  printer.alignCenter();
  printer.println(order.paid ? "PAID - QR Ph" : "Please pay at the counter");
  if (order.estimatedPrepMinutes) printer.println(`Ready in about ${order.estimatedPrepMinutes} min`);
  printer.println("Thank you!");
}

// No prices; a big order number and items so the kitchen can read it from a distance.
function kitchenSlip(printer, order) {
  printer.alignCenter();
  printer.invert(true);
  printer.println(" KITCHEN COPY ");
  printer.invert(false);
  printer.setTextQuadArea();
  printer.println("#" + order.orderNumber);
  printer.setTextNormal();
  printer.setTextDoubleHeight();
  if (ORDER_TYPE[order.orderType]) printer.println(ORDER_TYPE[order.orderType]);
  printer.setTextNormal();
  printer.println(timeOf(order.createdAt));
  printer.drawLine();
  printer.alignLeft();
  printer.setTextDoubleHeight();
  order.items.forEach((item) => printer.println(`${item.qty} x ${item.name}`));
  printer.setTextNormal();
  printer.drawLine();
  printer.alignCenter();
  printer.bold(true);
  printer.println(order.paid ? "PAID - QR Ph" : "NOT YET PAID - counter");
  printer.bold(false);
}

app.post("/print", async (req, res) => {
  const { orderNumber, items, total = 0, orderType, paid = false, estimatedPrepMinutes, createdAt } = req.body ?? {};
  if (!orderNumber || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: "orderNumber and at least one item are required" });
  }
  const order = { orderNumber, items, total, orderType, paid: paid === true, estimatedPrepMinutes, createdAt };
  try {
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: PRINTER_INTERFACE,
      width: LINE_WIDTH,
    });
    customerSlip(printer, order);
    endSlip(printer, true);
    kitchenSlip(printer, order);
    endSlip(printer, false);
    await printer.execute();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.listen(PORT, "127.0.0.1", () => console.log(`print service on 127.0.0.1:${PORT} -> ${PRINTER_INTERFACE}`));
