// Print service for the 58 mm thermal printers (RP21UB-Y, USB). The same program runs on
// two devices, each next to its own printer:
// - the kiosk's Raspberry Pi: POST /print prints the customer's receipt once an order is
//   placed (or paid with QR Ph); sent by apps/web/src/lib/receiptPrinter.ts.
// - the device showing the kitchen display: POST /print/kitchen prints a kitchen ticket
//   (order number and items) once a paid order reaches the kitchen; sent by
//   apps/web/src/app/kitchen/page.tsx.
//
// It listens on 127.0.0.1 only, so just a page open on that device can reach it.
const express = require("express");
const cors = require("cors");
const { ThermalPrinter, PrinterTypes } = require("node-thermal-printer");

const PORT = Number(process.env.PORT) || 4000;
const PRINTER_INTERFACE = process.env.PRINTER_INTERFACE || "/dev/usb/lp0";
const LINE_WIDTH = 32; // characters per line on 58 mm paper
// Only the system's own sites may print; any other page open in the browser is refused.
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  "https://web-production-ba868.up.railway.app,https://zaks-sizzling-hub-admin.up.railway.app,http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const isAllowedOrigin = (origin) => !!origin && ALLOWED_ORIGINS.includes(origin);

const app = express();

// Let the public sites call this local service (Chromium asks for this header), and
// refuse requests from any other site before they reach the printer.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) return res.status(403).json({ ok: false, error: "origin not allowed" });
  if (origin) res.setHeader("Access-Control-Allow-Private-Network", "true");
  next();
});
app.use(cors({ origin: (origin, callback) => callback(null, isAllowedOrigin(origin)) }));
app.use(express.json());

const ORDER_TYPE = { dine_in: "DINE IN", take_out: "TAKE OUT" };
const peso = (n) => (Number(n) || 0).toFixed(2);
const count = (n) => Math.max(0, Math.floor(Number(n) || 0));
// Text that reaches the printer must not carry control characters: ESC/POS commands are
// control sequences, and special instructions are typed by customers.
const clean = (value, maxLength) =>
  String(value ?? "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .trim()
    .slice(0, maxLength);
const timeOf = (createdAt) =>
  new Date(createdAt || Date.now()).toLocaleString("en-PH", { timeZone: "Asia/Manila" });

function newPrinter() {
  return new ThermalPrinter({ type: PrinterTypes.EPSON, interface: PRINTER_INTERFACE, width: LINE_WIDTH });
}

// Feeds the slip past the tear bar, and cuts if the printer has a cutter (ignored if not).
function endSlip(printer) {
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.cut();
}

function customerReceipt(printer, order) {
  printer.alignCenter();
  printer.bold(true);
  printer.println("ZAK'S SIZZLING HUB");
  printer.bold(false);
  printer.setTextDoubleHeight();
  printer.println("ORDER #" + clean(order.orderNumber, 20));
  printer.setTextNormal();
  if (ORDER_TYPE[order.orderType]) printer.println(ORDER_TYPE[order.orderType]);
  printer.println(timeOf(order.createdAt));
  printer.drawLine();
  printer.alignLeft();
  order.items.forEach((item) => printer.leftRight(`${count(item.qty)}x ${clean(item.name, 60)}`, peso(item.price)));
  printer.drawLine();
  printer.bold(true);
  printer.leftRight("TOTAL", peso(order.total));
  printer.bold(false);
  printer.alignCenter();
  printer.println(order.paid ? "PAID - QR Ph" : "Please pay at the counter");
  if (order.estimatedPrepMinutes) printer.println(`Ready in about ${order.estimatedPrepMinutes} min`);
  printer.println("Thank you!");
}

// Only what the cooks need: a big order number and the dishes (with any special
// instructions), readable from a distance.
function kitchenTicket(printer, order) {
  printer.alignCenter();
  printer.setTextQuadArea();
  printer.println("#" + clean(order.orderNumber, 20));
  printer.setTextNormal();
  printer.drawLine();
  printer.alignLeft();
  order.items.forEach((item) => {
    printer.setTextDoubleHeight();
    printer.println(`${count(item.qty)} x ${clean(item.name, 60)}`);
    printer.setTextNormal();
    const note = clean(item.note, 140); // the API allows 140 characters
    if (note) printer.println(`   > ${note}`);
  });
  printer.drawLine();
}

function hasOrder(body) {
  return !!body?.orderNumber && Array.isArray(body.items) && body.items.length > 0;
}

async function print(res, layout) {
  try {
    const printer = newPrinter();
    layout(printer);
    endSlip(printer);
    await printer.execute();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err) });
  }
}

app.post("/print", async (req, res) => {
  if (!hasOrder(req.body)) return res.status(400).json({ ok: false, error: "orderNumber and at least one item are required" });
  const { orderNumber, items, total = 0, orderType, paid = false, estimatedPrepMinutes, createdAt } = req.body;
  const order = { orderNumber, items, total, orderType, paid: paid === true, estimatedPrepMinutes, createdAt };
  await print(res, (printer) => customerReceipt(printer, order));
});

app.post("/print/kitchen", async (req, res) => {
  if (!hasOrder(req.body)) return res.status(400).json({ ok: false, error: "orderNumber and at least one item are required" });
  const { orderNumber, items } = req.body;
  await print(res, (printer) => kitchenTicket(printer, { orderNumber, items }));
});

app.listen(PORT, "127.0.0.1", () => console.log(`print service on 127.0.0.1:${PORT} -> ${PRINTER_INTERFACE}`));
