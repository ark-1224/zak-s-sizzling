import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQrPhCode, getPaymentIntent, parseWebhookEvent, PaymongoNotConfiguredError, QRPH_EXPIRY_SECONDS } from "../../src/lib/paymongo";

// What the API sends to PayMongo for a QR Ph payment, and how it reads the answers.
// PayMongo itself is never contacted: fetch is replaced with a stand-in that records
// each request and answers like PayMongo's QR Ph API.

const input = { orderId: "11111111-1111-4111-8111-111111111111", orderNumber: "ZK-ABC123", amountPhp: 430.5 };
const QR = "data:image/png;base64,iVBORw0KGgo=";

const previousKey = process.env.PAYMONGO_SECRET_KEY;
let fetchMock: ReturnType<typeof vi.fn>;
let livemode = false;

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  process.env.PAYMONGO_SECRET_KEY = "sk_test_not_a_real_key";
  livemode = false;
  fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/payment_intents")) return reply({ data: { id: "pi_1", attributes: { client_key: "pi_1_client_abc" } } });
    if (url.endsWith("/payment_methods")) return reply({ data: { id: "pm_1", attributes: {} } });
    if (url.endsWith("/payment_intents/pi_1/attach")) {
      return reply({
        data: {
          id: "pi_1",
          attributes: {
            status: "awaiting_next_action",
            livemode,
            next_action: { type: "consume_qr", code: { image_url: QR, test_url: "https://test.paymongo.com/qr/pi_1" } },
          },
        },
      });
    }
    return reply({ errors: [{ detail: "unexpected" }] }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousKey === undefined) delete process.env.PAYMONGO_SECRET_KEY;
  else process.env.PAYMONGO_SECRET_KEY = previousKey;
});

const call = (i: number) => ({ url: fetchMock.mock.calls[i][0] as string, init: fetchMock.mock.calls[i][1] as RequestInit });
const sent = (i: number) => JSON.parse(call(i).init.body as string).data.attributes;

describe("createQrPhCode", () => {
  it("creates a payment intent for QR Ph only, in centavos, naming the order", async () => {
    await createQrPhCode(input);

    expect(call(0).url).toBe("https://api.paymongo.com/v1/payment_intents");
    expect(sent(0)).toMatchObject({
      amount: 43050,
      currency: "PHP",
      payment_method_allowed: ["qrph"],
      metadata: { order_id: input.orderId, order_number: "ZK-ABC123" },
    });
  });

  it("creates a QR Ph payment method that expires, then attaches it with the intent's client key", async () => {
    await createQrPhCode(input);

    expect(call(1).url).toBe("https://api.paymongo.com/v1/payment_methods");
    expect(sent(1)).toEqual({ type: "qrph", expiry_seconds: QRPH_EXPIRY_SECONDS });
    expect(call(2).url).toBe("https://api.paymongo.com/v1/payment_intents/pi_1/attach");
    expect(sent(2)).toEqual({ payment_method: "pm_1", client_key: "pi_1_client_abc" });
  });

  it("returns the QR image, the intent, when it expires, and the test page in test mode", async () => {
    const before = Date.now();
    const code = await createQrPhCode(input);

    expect(code).toMatchObject({ paymentIntentId: "pi_1", imageUrl: QR, testUrl: "https://test.paymongo.com/qr/pi_1" });
    const expires = new Date(code.expiresAt).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + QRPH_EXPIRY_SECONDS * 1000);
  });

  it("never returns a test page in live mode", async () => {
    livemode = true;

    expect((await createQrPhCode(input)).testUrl).toBeNull();
  });

  it("signs in to PayMongo with the secret key", async () => {
    await createQrPhCode(input);

    const expected = `Basic ${Buffer.from("sk_test_not_a_real_key:").toString("base64")}`;
    for (let i = 0; i < 3; i++) expect((call(i).init.headers as Record<string, string>).Authorization).toBe(expected);
  });

  it("refuses to start without a secret key", async () => {
    delete process.env.PAYMONGO_SECRET_KEY;

    await expect(createQrPhCode(input)).rejects.toBeInstanceOf(PaymongoNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports PayMongo's refusal", async () => {
    fetchMock.mockResolvedValueOnce(reply({ errors: [{ code: "parameter_invalid" }] }, 400));

    await expect(createQrPhCode(input)).rejects.toThrow(/PayMongo POST \/payment_intents failed \(400\)/);
  });
});

describe("getPaymentIntent", () => {
  it("reads the intent's status and amount", async () => {
    fetchMock.mockResolvedValueOnce(reply({ data: { id: "pi_1", attributes: { status: "succeeded", amount: 43050 } } }));

    await expect(getPaymentIntent("pi_1")).resolves.toEqual({ status: "succeeded", amountCentavos: 43050 });
    expect(call(0).url).toBe("https://api.paymongo.com/v1/payment_intents/pi_1");
  });
});

describe("parseWebhookEvent", () => {
  const event = (type: string, attributes: Record<string, unknown>) =>
    Buffer.from(JSON.stringify({ data: { attributes: { type, data: { attributes } } } }));

  it("reads a QR Ph payment.paid event: the order from metadata and the payment intent", () => {
    expect(parseWebhookEvent(event("payment.paid", { payment_intent_id: "pi_1", metadata: { order_id: input.orderId } }))).toEqual({
      type: "payment.paid",
      orderId: input.orderId,
      paymentIntentId: "pi_1",
    });
  });

  it("still reads a hosted-checkout event by its reference number", () => {
    expect(parseWebhookEvent(event("checkout_session.payment.paid", { reference_number: input.orderId }))).toMatchObject({
      orderId: input.orderId,
      paymentIntentId: null,
    });
  });

  it("leaves the order unknown when the event doesn't name it", () => {
    expect(parseWebhookEvent(event("payment.paid", { payment_intent_id: "pi_1", metadata: null })).orderId).toBeNull();
  });
});
