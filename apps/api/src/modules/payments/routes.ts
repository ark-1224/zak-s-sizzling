import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { HttpError } from "../../middleware/errorHandler";
import { PaymongoNotConfiguredError } from "../../lib/paymongo";
import { createPaymentIntentSchema } from "./schema";
import { confirmCounterPayment, createGatewayPaymentIntent, handleWebhook } from "./service";

export const paymentsRouter = Router();

const WEB_ORIGIN = () => process.env.WEB_ORIGIN ?? "http://localhost:3000";

// GCash/Maya via PayMongo — see apps/api/src/lib/paymongo.ts. Returns 501 with a clear
// message until PAYMONGO_SECRET_KEY is configured, so the kiosk can fall back to
// "Pay at counter" instead of the checkout flow silently breaking.
paymentsRouter.post("/intent", authenticate, async (req, res, next) => {
  try {
    const { orderId, method } = createPaymentIntentSchema.parse(req.body);
    const result = await createGatewayPaymentIntent(orderId, method, WEB_ORIGIN());
    res.json(result);
  } catch (err) {
    if (err instanceof PaymongoNotConfiguredError) return next(new HttpError(501, err.message));
    next(err);
  }
});

paymentsRouter.post("/counter/:orderId/confirm", authenticate, authorize("admin", "staff"), async (req, res, next) => {
  try {
    const order = await confirmCounterPayment(req.params.orderId);
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
