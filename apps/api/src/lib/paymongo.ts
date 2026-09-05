import { createHmac, timingSafeEqual } from "node:crypto";

const PAYMONGO_API = "https://api.paymongo.com/v1";

export class PaymongoNotConfiguredError extends Error {
  constructor() {
    super("Online payment isn't configured yet (missing PAYMONGO_SECRET_KEY) — use Pay at counter instead.");
  }
}

function authHeader(): string {
  const secret = process.env.PAYMONGO_SECRET_KEY;
  if (!secret) throw new PaymongoNotConfiguredError();
  return `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;
}

interface CheckoutLineItem {
  name: string;
  amount: number; // centavos
  quantity: number;
  currency: "PHP";
}

interface CreateCheckoutSessionInput {
  orderId: string;
  orderNumber: string;
  method: "gcash" | "maya";
  amountPhp: number;
  lineItems: { name: string; qty: number; unitPricePhp: number }[];
  successUrl: string;
  cancelUrl: string;
}

interface PaymongoCheckoutSession {
  id: string;
  checkoutUrl: string;
}

// PayMongo's checkout method id for Maya is "paymaya" (their API predates the Maya
// rebrand from PayMaya) — mapped here so the rest of the app can just say "maya".
const METHOD_MAP: Record<"gcash" | "maya", string> = { gcash: "gcash", maya: "paymaya" };

/**
 * Creates a PayMongo hosted Checkout Session scoped to GCash or Maya.
 * NOT yet exercised against a live PayMongo sandbox — this session doesn't have
 * PayMongo credentials. Verify against https://developers.paymongo.com/reference/create-a-checkout-session
 * once PAYMONGO_SECRET_KEY is set, and adjust the payload shape if their API has moved on.
 */
export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<PaymongoCheckoutSession> {
  const lineItems: CheckoutLineItem[] = input.lineItems.map((li) => ({
    name: li.name,
    amount: Math.round(li.unitPricePhp * 100),
    quantity: li.qty,
    currency: "PHP",
  }));

  const res = await fetch(`${PAYMONGO_API}/checkout_sessions`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: lineItems,
          payment_method_types: [METHOD_MAP[input.method]],
          description: `Zak's Sizzling Hub order ${input.orderNumber}`,
          reference_number: input.orderId,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          send_email_receipt: false,
          show_line_items: true,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PayMongo checkout session creation failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { data: { id: string; attributes: { checkout_url: string } } };
  return { id: json.data.id, checkoutUrl: json.data.attributes.checkout_url };
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
  const candidateSignature = parts.li ?? parts.te;
  if (!timestamp || !candidateSignature) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const candidateBuf = Buffer.from(candidateSignature, "hex");
  if (expectedBuf.length !== candidateBuf.length) return false;
  return timingSafeEqual(expectedBuf, candidateBuf);
}

export interface PaymongoWebhookEvent {
  type: string;
  orderId: string | null;
}

export function parseWebhookEvent(rawBody: Buffer): PaymongoWebhookEvent {
  const json = JSON.parse(rawBody.toString("utf8")) as {
    data: { attributes: { type: string; data: { attributes: { reference_number?: string } } } };
  };
  return {
    type: json.data.attributes.type,
    orderId: json.data.attributes.data.attributes.reference_number ?? null,
  };
}
