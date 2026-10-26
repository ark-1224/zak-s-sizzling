import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { PRODUCTS } from "./fixtures";
import { app, kioskToken } from "./helpers";

// QR Ph shown on the kiosk's own screen: the API asks PayMongo for a QR code, the kiosk
// polls for the result, and the payment is recorded either by that check or by the
// payment.paid webhook, whichever comes first. PayMongo is simulated: fetch calls to
// api.paymongo.com are answered here; everything else goes through. Uses Test Mango
// Juice, which no other test file touches.

const juice = PRODUCTS.juice;
const WEBHOOK_SECRET = "test-webhook-secret";
const realFetch = globalThis.fetch;
const saved = { key: process.env.PAYMONGO_SECRET_KEY, secret: process.env.PAYMONGO_WEBHOOK_SECRET };

let customer: string;
let otherKiosk: string;
let intentCount = 0;
/** What PayMongo reports for each payment intent: its status and amount in centavos. */
const intents = new Map<string, { status: string; amount: number }>();

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fakePaymongo = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://api.paymongo.com/")) return realFetch(input, init);
  const path = url.replace("https://api.paymongo.com/v1", "");
  if (path === "/payment_intents") {
    const id = `pi_test_${++intentCount}`;
    const amount = JSON.parse(String(init?.body)).data.attributes.amount;
    intents.set(id, { status: "awaiting_payment_method", amount });
    return reply({ data: { id, attributes: { client_key: `${id}_client` } } });
  }
  if (path === "/payment_methods") return reply({ data: { id: `pm_${intentCount}`, attributes: {} } });
  const attach = path.match(/^\/payment_intents\/([^/]+)\/attach$/);
  if (attach) {
    intents.get(attach[1])!.status = "awaiting_next_action";
    return reply({
      data: {
        id: attach[1],
        attributes: { livemode: false, next_action: { code: { image_url: `data:image/png;base64,QR-${attach[1]}`, test_url: `https://test/${attach[1]}` } } },
      },
    });
  }
  const get = path.match(/^\/payment_intents\/([^/]+)$/);
  if (get && intents.has(get[1])) return reply({ data: { id: get[1], attributes: intents.get(get[1]) } });
  return reply({ errors: [{ detail: "not found" }] }, 404);
});

beforeAll(async () => {
  process.env.PAYMONGO_SECRET_KEY = "sk_test_not_a_real_key";
  process.env.PAYMONGO_WEBHOOK_SECRET = WEBHOOK_SECRET;
  vi.stubGlobal("fetch", fakePaymongo);
  customer = await kioskToken();
  otherKiosk = await kioskToken();
});

afterAll(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of [["PAYMONGO_SECRET_KEY", saved.key], ["PAYMONGO_WEBHOOK_SECRET", saved.secret]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

beforeEach(() => {
  fakePaymongo.mockClear();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const juiceStock = async () => (await prisma.inventory.findUniqueOrThrow({ where: { productId: juice.id } })).stockQty;
const paymentOf = (orderId: string) => prisma.payment.findUniqueOrThrow({ where: { orderId } });

async function placeOrder(qty = 1): Promise<{ id: string; totalAmount: number }> {
  const res = await request(app).post("/api/orders").set(auth(customer)).send({ items: [{ productId: juice.id, qty }], paymentMethod: "qrph" });
  expect(res.status).toBe(201);
  return res.body;
}

const startQr = (orderId: string, token = customer) => request(app).post("/api/payments/intent").set(auth(token)).send({ orderId, method: "qrph" });
const checkQr = (orderId: string, token = customer) => request(app).get(`/api/payments/qrph/${orderId}`).set(auth(token));

describe("showing a QR Ph code", () => {
  it("returns the QR image, when it expires, and the test page, and records the intent", async () => {
    const order = await placeOrder();

    const res = await startQr(order.id);

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toMatch(/^data:image\/png;base64,QR-pi_test_/);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(res.body.testUrl).toMatch(/^https:\/\/test\//);
    const payment = await paymentOf(order.id);
    expect(payment).toMatchObject({ method: "qrph", status: "pending" });
    expect(payment.reference).toMatch(/^pi_test_/);
    expect(intents.get(payment.reference!)!.amount).toBe(5500);
  });

  it("gives a new code (a new intent) when asked again after one expires", async () => {
    const order = await placeOrder();
    await startQr(order.id);
    const first = (await paymentOf(order.id)).reference;

    await startQr(order.id);

    expect((await paymentOf(order.id)).reference).not.toBe(first);
  });

  it("doesn't let another kiosk start a payment for this order", async () => {
    const order = await placeOrder();

    const res = await startQr(order.id, otherKiosk);

    expect(res.status).toBe(404);
    expect(fakePaymongo).not.toHaveBeenCalled();
  });
});

describe("checking a QR Ph payment", () => {
  it("leaves the order unpaid while the customer hasn't paid", async () => {
    const order = await placeOrder();
    await startQr(order.id);

    const res = await checkQr(order.id);

    expect(res.status).toBe(200);
    expect(res.body.payment).toMatchObject({ method: "qrph", status: "pending" });
  });

  it("records the payment once PayMongo reports it succeeded: paid, confirmed, stock deducted, sent to the kitchen", async () => {
    const order = await placeOrder(2);
    await startQr(order.id);
    intents.get((await paymentOf(order.id)).reference!)!.status = "succeeded";
    const before = await juiceStock();

    const res = await checkQr(order.id);

    expect(res.body.status).toBe("confirmed");
    expect(res.body.payment).toMatchObject({ method: "qrph", status: "paid" });
    expect(await juiceStock()).toBe(before - 2);
    expect(await prisma.kitchenTask.count({ where: { orderItem: { orderId: order.id } } })).toBe(1);

    // Checking again (or the webhook arriving later) changes nothing.
    await checkQr(order.id);
    expect(await juiceStock()).toBe(before - 2);
  });

  it("ignores a succeeded intent whose amount isn't the order's total", async () => {
    const order = await placeOrder();
    await startQr(order.id);
    const intent = intents.get((await paymentOf(order.id)).reference!)!;
    intent.status = "succeeded";
    intent.amount = 100;

    const res = await checkQr(order.id);

    expect(res.body.payment.status).toBe("pending");
  });

  it("doesn't show another kiosk's order", async () => {
    const order = await placeOrder();

    expect((await checkQr(order.id, otherKiosk)).status).toBe(404);
  });
});

describe("paying at the counter instead", () => {
  it("turns the order into an ordinary counter order", async () => {
    const order = await placeOrder();
    await startQr(order.id);

    const res = await request(app).post(`/api/payments/qrph/${order.id}/counter`).set(auth(customer));

    expect(res.status).toBe(200);
    expect(await paymentOf(order.id)).toMatchObject({ method: "counter", status: "pending", reference: null });
  });
});

describe("the payment.paid webhook", () => {
  function signed(body: string) {
    const t = Math.floor(Date.now() / 1000);
    return `t=${t},te=${createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${body}`).digest("hex")},li=`;
  }
  const postEvent = (attributes: Record<string, unknown>) => {
    const body = JSON.stringify({ data: { attributes: { type: "payment.paid", data: { id: "pay_1", attributes } } } });
    return request(app).post("/api/payments/webhook").set("Content-Type", "application/json").set("Paymongo-Signature", signed(body)).send(body);
  };

  it("records the payment for the order named in the metadata", async () => {
    const order = await placeOrder();
    await startQr(order.id);

    const res = await postEvent({ payment_intent_id: (await paymentOf(order.id)).reference, metadata: { order_id: order.id } });

    expect(res.status).toBe(200);
    expect(await paymentOf(order.id)).toMatchObject({ method: "qrph", status: "paid" });
  });

  it("finds the order by its payment intent when there is no metadata", async () => {
    const order = await placeOrder();
    await startQr(order.id);

    await postEvent({ payment_intent_id: (await paymentOf(order.id)).reference });

    expect((await paymentOf(order.id)).status).toBe("paid");
  });
});
