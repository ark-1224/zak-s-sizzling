import { createHmac, timingSafeEqual } from "node:crypto";

const PAYMONGO_API = "https://api.paymongo.com/v1";

export class PaymongoNotConfiguredError extends Error {
  constructor() {
    super("Online payment isn't configured yet (missing PAYMONGO_SECRET_KEY) — use Pay at counter instead.");
  }
}

/** QR Ph works only once the server has a PayMongo secret key. */
export function isPaymongoConfigured(): boolean {
  return Boolean(process.env.PAYMONGO_SECRET_KEY);
}

function authHeader(): string {
  const secret = process.env.PAYMONGO_SECRET_KEY;
  if (!secret) throw new PaymongoNotConfiguredError();
  return `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;
}

/** How long a QR Ph code can be scanned before it expires (PayMongo allows 60-9000 s). */
export const QRPH_EXPIRY_SECONDS = 10 * 60;

/** PayMongo amounts are in centavos: the amount put on a QR code, and checked when it's paid. */
export const toCentavos = (pesos: number) => Math.round(pesos * 100);

export interface QrPhCode {
  paymentIntentId: string;
  /** The QR code image as a data: URL, ready for an <img>. */
  imageUrl: string;
  expiresAt: string;
  /** Test mode only: PayMongo's page for simulating the customer's payment. */
  testUrl: string | null;
}

type Resource = { data: { id: string; attributes: Record<string, unknown> } };

async function paymongo<T>(path: string, init: { method: "GET" | "POST"; attributes?: Record<string, unknown> }): Promise<T> {
  const res = await fetch(`${PAYMONGO_API}${path}`, {
    method: init.method,
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: init.attributes ? JSON.stringify({ data: { attributes: init.attributes } }) : undefined,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PayMongo ${init.method} ${path} failed (${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

/** The first string found under a key named `key`, anywhere in a JSON value. */
function findString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  for (const [k, v] of Object.entries(value)) {
    if (k === key && typeof v === "string") return v;
    const nested = findString(v, key);
    if (nested) return nested;
  }
  return null;
}

/**
 * Makes a QR Ph code for an order, shown on the kiosk's own screen: the customer scans it
 * with any bank or e-wallet app (GCash and Maya included). PayMongo's QR Ph flow is to
 * create a Payment Intent that allows "qrph", create a "qrph" Payment Method, and attach
 * it; the attach response carries the QR image (next_action.code.image_url).
 * https://docs.paymongo.com/docs/payment-acceptance-qr-ph-api
 *
 * The order id travels in the intent's metadata so the payment.paid webhook can name the
 * order, and the intent id is stored as the payment's reference.
 */
export async function createQrPhCode(input: { orderId: string; orderNumber: string; amountPhp: number }): Promise<QrPhCode> {
  const intent = await paymongo<Resource>("/payment_intents", {
    method: "POST",
    attributes: {
      amount: toCentavos(input.amountPhp),
      currency: "PHP",
      payment_method_allowed: ["qrph"],
      description: `Zak's Sizzling Hub order ${input.orderNumber}`,
      metadata: { order_id: input.orderId, order_number: input.orderNumber },
    },
  });
  const method = await paymongo<Resource>("/payment_methods", {
    method: "POST",
    attributes: { type: "qrph", expiry_seconds: QRPH_EXPIRY_SECONDS },
  });
  const attached = await paymongo<Resource>(`/payment_intents/${intent.data.id}/attach`, {
    method: "POST",
    attributes: { payment_method: method.data.id, client_key: intent.data.attributes.client_key },
  });

  const imageUrl = findString(attached.data.attributes.next_action, "image_url");
  if (!imageUrl) throw new Error("PayMongo didn't return a QR Ph code");
  return {
    paymentIntentId: intent.data.id,
    imageUrl: imageUrl.startsWith("data:") ? imageUrl : `data:image/png;base64,${imageUrl}`,
    expiresAt: new Date(Date.now() + QRPH_EXPIRY_SECONDS * 1000).toISOString(),
    testUrl: attached.data.attributes.livemode === false ? findString(attached.data.attributes, "test_url") : null,
  };
}

/** A Payment Intent's status and amount, to confirm a QR Ph payment without waiting for the webhook. */
export async function getPaymentIntent(id: string): Promise<{ status: string; amountCentavos: number }> {
  const json = await paymongo<{ data: { attributes: { status: string; amount: number } } }>(
    `/payment_intents/${encodeURIComponent(id)}`,
    { method: "GET" }
  );
  return { status: json.data.attributes.status, amountCentavos: json.data.attributes.amount };
}

/**
 * Verifies the `Paymongo-Signature` header per PayMongo's documented scheme:
 * `t=<unix ts>,te=<test hmac>,li=<live hmac>` where the hmac is SHA-256 of
 * `${t}.${rawBody}` keyed by the webhook secret. Uses a timing-safe comparison.
 */
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, v];
    })
  );
  const timestamp = parts.t;
  // Live events fill `li` and test (sandbox) events fill `te`; the other field is sent
  // but empty ("li="), so fall back on an empty string too, not just a missing field.
  const candidateSignature = parts.li || parts.te;
  if (!timestamp || !candidateSignature) return false;

  // A valid signature never expires on its own — without this, a payload+signature
  // captured once (server logs, a misconfigured proxy) would stay replayable
  // indefinitely, re-triggering stock deduction for an order already paid for.
  const REPLAY_WINDOW_MS = 5 * 60 * 1000;
  const signedAtMs = Number(timestamp) * 1000;
  if (!Number.isFinite(signedAtMs) || Math.abs(Date.now() - signedAtMs) > REPLAY_WINDOW_MS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const candidateBuf = Buffer.from(candidateSignature, "hex");
  if (expectedBuf.length !== candidateBuf.length) return false;
  return timingSafeEqual(expectedBuf, candidateBuf);
}

export interface PaymongoWebhookEvent {
  type: string;
  /** The order, when the event names it (metadata.order_id, or a checkout session's reference_number). */
  orderId: string | null;
  /** The Payment Intent the event is about, when it says (payment.paid carries payment_intent_id). */
  paymentIntentId: string | null;
  /** The amount paid in centavos, when the event says (a payment.paid's payment carries it). */
  amountCentavos: number | null;
}

export function parseWebhookEvent(rawBody: Buffer): PaymongoWebhookEvent {
  const json = JSON.parse(rawBody.toString("utf8")) as {
    data: {
      attributes: {
        type: string;
        data?: {
          attributes?: { reference_number?: string; payment_intent_id?: string; amount?: unknown; metadata?: Record<string, unknown> | null };
        };
      };
    };
  };
  const resource = json.data.attributes.data?.attributes ?? {};
  const metadataOrderId = resource.metadata?.order_id;
  return {
    type: json.data.attributes.type,
    orderId: (typeof metadataOrderId === "string" ? metadataOrderId : null) ?? resource.reference_number ?? null,
    paymentIntentId: resource.payment_intent_id ?? null,
    amountCentavos: typeof resource.amount === "number" ? resource.amount : null,
  };
}
