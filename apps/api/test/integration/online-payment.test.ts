import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { PRODUCTS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// GCash/Maya checkout through PayMongo. The webhook is exercised with requests signed
// using a test secret, the same way PayMongo signs them. PayMongo itself is never
// contacted. Uses Test Soda, which no other test file touches.

const WEBHOOK_SECRET = "test-webhook-secret";
const previousSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

let customer: string;
let staff: string;

beforeAll(async () => {
  process.env.PAYMONGO_WEBHOOK_SECRET = WEBHOOK_SECRET; // read by the API on every webhook
  customer = await kioskToken();
  staff = await loginAs("staff");
});

afterAll(() => {
  if (previousSecret === undefined) delete process.env.PAYMONGO_WEBHOOK_SECRET;
  else process.env.PAYMONGO_WEBHOOK_SECRET = previousSecret;
});

const soda = PRODUCTS.soda;
const sodaStock = async () => (await prisma.inventory.findUniqueOrThrow({ where: { productId: soda.id } })).stockQty;
const placeGcashOrder = async (qty: number) =>
  (await request(app).post("/api/orders").set("Authorization", `Bearer ${customer}`).send({ items: [{ productId: soda.id, qty }], paymentMethod: "gcash" })).body;

function paidEvent(orderId: string, type = "checkout_session.payment.paid") {
  return JSON.stringify({ data: { attributes: { type, data: { attributes: { reference_number: orderId } } } } });
}

// PayMongo puts the signature in `li` for live-mode events and in `te` for test-mode
// events, leaving the other field empty (docs.paymongo.com, "Securing a webhook").
function sign(body: string, { secret = WEBHOOK_SECRET, ageSeconds = 0, mode = "live" as "live" | "test" } = {}) {
  const t = Math.floor(Date.now() / 1000) - ageSeconds;
  const hmac = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return mode === "live" ? `t=${t},te=,li=${hmac}` : `t=${t},te=${hmac},li=`;
}

const postWebhook = (body: string, signature?: string) => {
  const req = request(app).post("/api/payments/webhook").set("Content-Type", "application/json");
  return (signature ? req.set("Paymongo-Signature", signature) : req).send(body);
};

describe("starting an online payment", () => {
  it.skipIf(Boolean(process.env.PAYMONGO_SECRET_KEY))("explains that online payment isn't set up yet when PayMongo has no key", async () => {
    const order = await placeGcashOrder(1);

    const res = await request(app).post("/api/payments/intent").set("Authorization", `Bearer ${customer}`).send({ orderId: order.id, method: "gcash" });

    expect(res.status).toBe(501);
    expect(res.body.error).toMatch(/Online payment isn't configured yet/);
  });

  it("rejects an unsupported payment method", async () => {
    const order = await placeGcashOrder(1);

    const res = await request(app).post("/api/payments/intent").set("Authorization", `Bearer ${customer}`).send({ orderId: order.id, method: "counter" });

    expect(res.status).toBe(400);
  });
});

describe("PayMongo webhook security", () => {
  it("rejects a webhook with no signature", async () => {
    const res = await postWebhook(paidEvent("11111111-1111-4111-8111-111111111111"));

    expect(res.status).toBe(401);
  });

  it("rejects a webhook signed with the wrong secret", async () => {
    const body = paidEvent("11111111-1111-4111-8111-111111111111");

    const res = await postWebhook(body, sign(body, { secret: "wrong-secret" }));

    expect(res.status).toBe(401);
  });

  it("rejects a correctly signed webhook older than 5 minutes (replay protection)", async () => {
    const body = paidEvent("11111111-1111-4111-8111-111111111111");

    const res = await postWebhook(body, sign(body, { ageSeconds: 6 * 60 }));

    expect(res.status).toBe(401);
  });

  // Regression test for defect D-03: a test-mode header has `li=` present but empty,
  // which used to make the check compare against "" and reject every sandbox webhook.
  it("accepts a test-mode (sandbox) signature", async () => {
    const order = await placeGcashOrder(1);
    const body = paidEvent(order.id, "checkout_session.expired"); // accepted but changes nothing

    const res = await postWebhook(body, sign(body, { mode: "test" }));

    expect(res.status).toBe(200);
  });

  it("rejects a body that was changed after signing", async () => {
    const order = await placeGcashOrder(1);
    const signature = sign(paidEvent(order.id));

    const res = await postWebhook(paidEvent(order.id, "checkout_session.payment.failed"), signature);

    expect(res.status).toBe(401);
  });
});

describe("a paid online order", () => {
  let order: { id: string };

  beforeAll(async () => {
    order = await placeGcashOrder(2);
  });

  it("ignores events that are not payments", async () => {
    const body = paidEvent(order.id, "checkout_session.expired");

    const res = await postWebhook(body, sign(body));

    expect(res.status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe("pending");
  });

  it("marks the payment paid, confirms the order, deducts stock, and sends it to the kitchen", async () => {
    const before = await sodaStock();
    const body = paidEvent(order.id);

    const res = await postWebhook(body, sign(body));

    expect(res.status).toBe(200);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true } });
    expect(saved.status).toBe("confirmed");
    expect(saved.payment).toMatchObject({ method: "gcash", status: "paid" });
    expect(await sodaStock()).toBe(before - 2);
    expect(await prisma.kitchenTask.count({ where: { orderItem: { orderId: order.id } } })).toBe(1);
  });

  it("processes a repeated delivery of the same payment only once", async () => {
    const before = await sodaStock();
    const body = paidEvent(order.id);

    const res = await postWebhook(body, sign(body));

    expect(res.status).toBe(200);
    expect(await sodaStock()).toBe(before);
    expect(await prisma.kitchenTask.count({ where: { orderItem: { orderId: order.id } } })).toBe(1);
  });
});

describe("an online order paid after stock ran out", () => {
  let order: { id: string };

  beforeAll(async () => {
    await prisma.inventory.update({ where: { productId: soda.id }, data: { stockQty: 3 } });
    order = await placeGcashOrder(3);
    // Stock drops before PayMongo confirms the payment (another sale, a spoilage count).
    await prisma.inventory.update({ where: { productId: soda.id }, data: { stockQty: 1 } });
  });

  it("records the payment but deducts nothing and flags the order for staff", async () => {
    const body = paidEvent(order.id);

    const res = await postWebhook(body, sign(body));

    expect(res.status).toBe(200);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true, items: { include: { kitchenTask: true } } } });
    expect(saved.payment?.status).toBe("paid");
    expect(saved.stockIssue).toBe(true);
    expect(saved.stockIssueNote).toContain(`${soda.name}: needs 3, only 1 left`);
    expect(saved.status).toBe("pending");
    expect(saved.items.every((i) => i.kitchenTask === null)).toBe(true);
    expect(await sodaStock()).toBe(1);
  });

  it("appears in the staff list of orders needing action, marked as a stock issue", async () => {
    const res = await request(app).get("/api/orders?unpaid=1").set("Authorization", `Bearer ${staff}`);

    const listed = res.body.find((o: { id: string }) => o.id === order.id);
    expect(listed).toMatchObject({ stockIssue: true, stockIssueNote: expect.stringContaining(soda.name) });
  });
});

describe("an online order cancelled before the payment arrived", () => {
  let order: { id: string };

  beforeAll(async () => {
    await prisma.inventory.update({ where: { productId: soda.id }, data: { stockQty: 5 } });
    order = await placeGcashOrder(1);
    // Staff cancel it while the customer is still on PayMongo's page.
    await request(app).post(`/api/orders/${order.id}/cancel`).set("Authorization", `Bearer ${staff}`);
  });

  it("records the payment, deducts nothing, and flags the order so staff refund the customer", async () => {
    const body = paidEvent(order.id);

    const res = await postWebhook(body, sign(body));

    expect(res.status).toBe(200);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true } });
    expect(saved).toMatchObject({ status: "cancelled", stockIssue: true });
    expect(saved.stockIssueNote).toMatch(/Paid online after this order was cancelled/);
    expect(saved.payment?.status).toBe("paid");
    expect(await sodaStock()).toBe(5);
    expect(await prisma.kitchenTask.count({ where: { orderItem: { orderId: order.id } } })).toBe(0);
  });

  it("lists it in the payment queue for staff to sort out", async () => {
    const res = await request(app).get("/api/orders?unpaid=1").set("Authorization", `Bearer ${staff}`);

    expect(res.body.find((o: { id: string }) => o.id === order.id)).toMatchObject({ status: "cancelled", stockIssue: true });
  });
});
