import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckoutSession, PaymongoNotConfiguredError } from "../../src/lib/paymongo";

// What the API sends to PayMongo when a customer pays online. PayMongo itself is never
// contacted: fetch is replaced with a stand-in that records the request.

const input = {
  orderId: "11111111-1111-4111-8111-111111111111",
  orderNumber: "ZK-ABC123",
  amountPhp: 430,
  lineItems: [
    { name: "Sizzling Sisig", qty: 2, unitPricePhp: 185 },
    { name: "Iced Tea", qty: 1, unitPricePhp: 60 },
  ],
  successUrl: "https://kiosk.example.com/checkout/success?order=1",
  cancelUrl: "https://kiosk.example.com/checkout?order=1&cancelled=1",
};

const previousKey = process.env.PAYMONGO_SECRET_KEY;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.PAYMONGO_SECRET_KEY = "sk_test_not_a_real_key";
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ data: { id: "cs_test_1", attributes: { checkout_url: "https://checkout.paymongo.com/cs_test_1" } } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousKey === undefined) delete process.env.PAYMONGO_SECRET_KEY;
  else process.env.PAYMONGO_SECRET_KEY = previousKey;
});

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body as string).data.attributes;

describe("createCheckoutSession", () => {
  it("asks PayMongo for QR Ph only", async () => {
    await createCheckoutSession(input);

    expect(sentBody().payment_method_types).toEqual(["qrph"]);
  });

  it("sends the items in centavos, the order as the reference, and the return addresses", async () => {
    await createCheckoutSession(input);

    const body = sentBody();
    expect(body.line_items).toEqual([
      { name: "Sizzling Sisig", amount: 18500, quantity: 2, currency: "PHP" },
      { name: "Iced Tea", amount: 6000, quantity: 1, currency: "PHP" },
    ]);
    expect(body.reference_number).toBe(input.orderId);
    expect(body.success_url).toBe(input.successUrl);
    expect(body.cancel_url).toBe(input.cancelUrl);
  });

  it("returns PayMongo's checkout page address", async () => {
    await expect(createCheckoutSession(input)).resolves.toEqual({
      id: "cs_test_1",
      checkoutUrl: "https://checkout.paymongo.com/cs_test_1",
    });
  });

  it("signs in to PayMongo with the secret key", async () => {
    await createCheckoutSession(input);

    const expected = `Basic ${Buffer.from("sk_test_not_a_real_key:").toString("base64")}`;
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(expected);
  });

  it("refuses to start without a secret key", async () => {
    delete process.env.PAYMONGO_SECRET_KEY;

    await expect(createCheckoutSession(input)).rejects.toBeInstanceOf(PaymongoNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports PayMongo's refusal", async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"errors":[{"code":"parameter_invalid"}]}', { status: 400 }));

    await expect(createCheckoutSession(input)).rejects.toThrow(/PayMongo checkout session creation failed \(400\)/);
  });
});
