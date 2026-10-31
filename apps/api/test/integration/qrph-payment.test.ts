import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { PRODUCTS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

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
/** A second kiosk for the later tests: each session may start only 10 payments in 10 minutes. */
let payer: string;
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
  payer = await kioskToken();
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

async function placeOrder(qty = 1, token = customer): Promise<{ id: string; totalAmount: number }> {
  const res = await request(app).post("/api/orders").set(auth(token)).send({ items: [{ productId: juice.id, qty }], paymentMethod: "qrph" });
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
    // Flagged for staff, with both amounts, as the webhook does.
    expect(res.body.stockIssue).toBe(true);
    expect(res.body.stockIssueNote).toMatch(/₱1\.00 was paid online, but the order total is ₱55\.00/);
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

  const orderOf = (orderId: string) => prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  it("doesn't confirm a payment whose amount isn't the order's total, and flags it for staff", async () => {
    const order = await placeOrder(1, payer);
    await startQr(order.id, payer);

    await postEvent({ payment_intent_id: (await paymentOf(order.id)).reference, amount: 100, metadata: { order_id: order.id } });

    expect((await paymentOf(order.id)).status).toBe("pending");
    const saved = await orderOf(order.id);
    expect(saved.status).toBe("pending");
    expect(saved.stockIssueNote).toMatch(/₱1\.00 was paid online, but the order total is ₱55\.00/);
  });

  it("records an earlier code paid after the kiosk switched to the counter, as QR Ph with that code", async () => {
    const order = await placeOrder(1, payer);
    await startQr(order.id, payer);
    const firstCode = (await paymentOf(order.id)).reference;
    await request(app).post(`/api/payments/qrph/${order.id}/counter`).set(auth(payer));

    await postEvent({ payment_intent_id: firstCode, amount: 5500, metadata: { order_id: order.id } });

    expect(await paymentOf(order.id)).toMatchObject({ method: "qrph", status: "paid", reference: firstCode });
    expect((await orderOf(order.id)).status).toBe("confirmed");
  });

  it("flags a second code paid after the order was already paid, and deducts nothing twice", async () => {
    const order = await placeOrder(1, payer);
    await startQr(order.id, payer);
    const firstCode = (await paymentOf(order.id)).reference;
    await startQr(order.id, payer); // a new code; the first one is still payable at PayMongo
    const secondCode = (await paymentOf(order.id)).reference;
    await postEvent({ payment_intent_id: secondCode, amount: 5500, metadata: { order_id: order.id } });
    const stock = await juiceStock();

    await postEvent({ payment_intent_id: firstCode, amount: 5500, metadata: { order_id: order.id } });

    expect(await juiceStock()).toBe(stock);
    expect((await paymentOf(order.id)).reference).toBe(secondCode);
    expect((await orderOf(order.id)).stockIssueNote).toMatch(/second payment of ₱55\.00 arrived online after this order was already paid/);
  });

  it("flags a QR Ph payment that arrives after staff took the money at the counter", async () => {
    const order = await placeOrder(1, payer);
    await startQr(order.id, payer);
    const code = (await paymentOf(order.id)).reference;
    const staff = await loginAs("staff");
    expect((await request(app).post(`/api/payments/counter/${order.id}/confirm`).set(auth(staff))).status).toBe(200);
    expect((await paymentOf(order.id)).method).toBe("counter");

    await postEvent({ payment_intent_id: code, amount: 5500, metadata: { order_id: order.id } });

    expect((await paymentOf(order.id)).method).toBe("counter");
    expect((await orderOf(order.id)).stockIssue).toBe(true);
  });

  it("doesn't flag a repeated delivery of the event that paid the order", async () => {
    const order = await placeOrder(1, payer);
    await startQr(order.id, payer);
    const event = { payment_intent_id: (await paymentOf(order.id)).reference, amount: 5500, metadata: { order_id: order.id } };
    await postEvent(event);

    await postEvent(event);

    expect((await orderOf(order.id)).stockIssue).toBe(false);
  });
});

describe("changing the items of an order being paid by QR Ph", () => {
  it("is refused, so the code on the kiosk keeps matching the total", async () => {
    const order = await placeOrder(2, payer);
    await startQr(order.id, payer);
    const staff = await loginAs("staff");
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });

    const res = await request(app).patch(`/api/orders/${order.id}/items/${item.id}`).set(auth(staff)).send({ qty: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/being paid by QR Ph/);
    expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).totalAmount)).toBe(110);
  });
});
