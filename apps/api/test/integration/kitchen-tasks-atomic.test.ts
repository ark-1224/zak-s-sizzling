import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { refreshAvailability } from "../../src/modules/inventory/fulfillment";
import { setEstimateOnReachingKitchen } from "../../src/modules/orders/prepTime";
import { PRODUCTS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// A paid order must reach the kitchen. Its kitchen tasks are written with the payment, so if
// they can't be written nothing is recorded and the next try does it all. Otherwise that try
// would find the order paid and stop, and the kitchen would never see it. Once the payment
// has committed, a failure telling the kiosks about stock doesn't count as a failed payment.

vi.mock("../../src/modules/orders/prepTime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/modules/orders/prepTime")>();
  return { ...actual, setEstimateOnReachingKitchen: vi.fn(actual.setEstimateOnReachingKitchen) };
});

vi.mock("../../src/modules/inventory/fulfillment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/modules/inventory/fulfillment")>();
  return { ...actual, refreshAvailability: vi.fn(actual.refreshAvailability) };
});

const WEBHOOK_SECRET = "test-webhook-secret";
const coffee = PRODUCTS.coffee;
const QTY = 2;

let staff: string;

beforeAll(async () => {
  vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", WEBHOOK_SECRET);
  staff = await loginAs("staff");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function postPaid(orderId: string, amount: number) {
  const body = JSON.stringify({ data: { attributes: { type: "payment.paid", data: { attributes: { amount, metadata: { order_id: orderId } } } } } });
  const t = Math.floor(Date.now() / 1000);
  const signature = `t=${t},te=,li=${createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${body}`).digest("hex")}`;
  return request(app).post("/api/payments/webhook").set("Content-Type", "application/json").set("Paymongo-Signature", signature).send(body);
}

const confirmAtCounter = (orderId: string) => request(app).post(`/api/payments/counter/${orderId}/confirm`).set("Authorization", `Bearer ${staff}`);

const coffeeStock = async () => (await prisma.inventory.findUniqueOrThrow({ where: { productId: coffee.id } })).stockQty;

async function placeOrder() {
  const customer = await kioskToken();
  const placed = await request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${customer}`)
    .send({ items: [{ productId: coffee.id, qty: QTY }], paymentMethod: "counter" });
  expect(placed.status).toBe(201);
  return { orderId: placed.body.id as string, amount: Math.round(placed.body.totalAmount * 100) };
}

async function expectNothingRecorded(orderId: string, stockBefore: number) {
  expect((await prisma.payment.findUniqueOrThrow({ where: { orderId } })).status).toBe("pending");
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  expect(order.status).toBe("pending");
  expect(order.estimatedReadyAt).toBeNull();
  expect(await prisma.kitchenTask.count({ where: { orderItem: { orderId } } })).toBe(0);
  expect(await coffeeStock()).toBe(stockBefore);
}

async function expectInKitchen(orderId: string, stockBefore: number) {
  expect((await prisma.payment.findUniqueOrThrow({ where: { orderId } })).status).toBe("paid");
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  expect(order.status).toBe("confirmed");
  expect(order.estimatedReadyAt).not.toBeNull();
  expect(await prisma.kitchenTask.count({ where: { orderItem: { orderId } } })).toBe(1);
  expect(await coffeeStock()).toBe(stockBefore - QTY); // deducted once
}

const failEstimateOnce = () =>
  vi.mocked(setEstimateOnReachingKitchen).mockImplementationOnce(() => {
    throw new Error("The database went away");
  });

const failAvailabilityOnce = () => vi.mocked(refreshAvailability).mockRejectedValueOnce(new Error("The database went away"));

describe("when a paid order's kitchen tasks can't be written", () => {
  it("records nothing from PayMongo's delivery, so the next delivery does it all", async () => {
    const { orderId, amount } = await placeOrder();
    const stockBefore = await coffeeStock();

    failEstimateOnce();
    expect((await postPaid(orderId, amount)).status).toBe(500);
    await expectNothingRecorded(orderId, stockBefore);

    expect((await postPaid(orderId, amount)).status).toBe(200);
    await expectInKitchen(orderId, stockBefore);
  });

  it("records nothing from a counter confirmation, so pressing it again does it all", async () => {
    const { orderId } = await placeOrder();
    const stockBefore = await coffeeStock();

    failEstimateOnce();
    expect((await confirmAtCounter(orderId)).status).toBe(500);
    await expectNothingRecorded(orderId, stockBefore);

    expect((await confirmAtCounter(orderId)).status).toBe(200);
    await expectInKitchen(orderId, stockBefore);
  });
});

describe("when the stock update fails after a payment has been recorded", () => {
  it("still answers PayMongo with success, with the order in the kitchen", async () => {
    const { orderId, amount } = await placeOrder();
    const stockBefore = await coffeeStock();

    failAvailabilityOnce();
    expect((await postPaid(orderId, amount)).status).toBe(200);
    await expectInKitchen(orderId, stockBefore);

    // A repeat of the event changes nothing.
    expect((await postPaid(orderId, amount)).status).toBe(200);
    await expectInKitchen(orderId, stockBefore);
  });

  it("still confirms the order at the counter", async () => {
    const { orderId } = await placeOrder();
    const stockBefore = await coffeeStock();

    failAvailabilityOnce();
    const confirmed = await confirmAtCounter(orderId);

    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe("confirmed");
    await expectInKitchen(orderId, stockBefore);
  });
});
