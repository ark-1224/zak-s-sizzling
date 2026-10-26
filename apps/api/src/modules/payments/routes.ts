import { Router, type Request } from "express";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { HttpError } from "../../middleware/errorHandler";
import { parseId } from "../../lib/ids";
import { paymentStartAddressLimit, paymentStartLimit } from "../../middleware/rateLimit";
import { isPaymongoConfigured, PaymongoNotConfiguredError } from "../../lib/paymongo";
import { getOrderOwnerSessionId } from "../orders/service";
import { createPaymentIntentSchema } from "./schema";
import { checkQrPhPayment, confirmCounterPayment, createQrPhPayment, handleWebhook, switchToCounterPayment } from "./service";
import type { PaymentOptions } from "@zaks/shared-types";

export const paymentsRouter = Router();

// Public, so the kiosk can grey out QR Ph before anyone picks it (UI review #2).
paymentsRouter.get("/options", (_req, res) => {
  const options: PaymentOptions = { online: isPaymongoConfigured() };
  res.json(options);
});

/** A kiosk session may only act on its own orders; staff and admins on any. */
async function assertOrderAccess(req: AuthenticatedRequest, orderId: string) {
  if (req.user?.role !== "customer") return;
  const ownerSessionId = await getOrderOwnerSessionId(orderId);
  if (ownerSessionId !== req.kioskSessionId) throw new HttpError(404, "Order not found");
}

// QR Ph via PayMongo (apps/api/src/lib/paymongo.ts): returns the QR code for the kiosk to
// show ({ imageUrl, expiresAt, testUrl }). Called again for a new code after one expires.
// Returns 501 with a clear message until PAYMONGO_SECRET_KEY is configured, so the kiosk
// can fall back to "Pay at counter" instead of the checkout flow silently breaking.
paymentsRouter.post("/intent", authenticate, paymentStartAddressLimit, paymentStartLimit, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { orderId } = createPaymentIntentSchema.parse(req.body);
    await assertOrderAccess(req, orderId);
    const result = await createQrPhPayment(orderId);
    res.json(result);
  } catch (err) {
    if (err instanceof PaymongoNotConfiguredError) return next(new HttpError(501, err.message));
    next(err);
  }
});

// Asked every few seconds by the kiosk while its QR code is on screen; returns the order,
// recording the payment first if PayMongo reports it succeeded.
paymentsRouter.get("/qrph/:orderId", authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const orderId = parseId(req.params.orderId, "Order not found");
    await assertOrderAccess(req, orderId);
    res.json(await checkQrPhPayment(orderId));
  } catch (err) {
    next(err);
  }
});

// "Pay at the counter instead" on the QR screen: the order becomes a counter order.
paymentsRouter.post("/qrph/:orderId/counter", authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const orderId = parseId(req.params.orderId, "Order not found");
    await assertOrderAccess(req, orderId);
    res.json(await switchToCounterPayment(orderId));
  } catch (err) {
    next(err);
  }
});

paymentsRouter.post("/counter/:orderId/confirm", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    const order = await confirmCounterPayment(parseId(req.params.orderId, "Order not found"));
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// PayMongo webhook — needs the raw request body for signature verification, captured
// via the `verify` callback on express.json() in app.ts (req.rawBody).
paymentsRouter.post("/webhook", async (req: Request & { rawBody?: Buffer }, res, next) => {
  try {
    if (!req.rawBody) throw new HttpError(400, "Missing raw body");
    await handleWebhook(req.rawBody, req.headers["paymongo-signature"] as string | undefined);
    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
});
