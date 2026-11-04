import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { addAttentionNote } from "../../src/modules/payments/attentionNote";
import { PRODUCTS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// A payment that can't go to the kitchen is recorded together with its flag. If writing the
// flag fails, nothing is recorded, so PayMongo's next delivery does it all. Otherwise that
// delivery would find the payment paid and stop, with nobody told. Uses Test Bottled Water.

vi.mock("../../src/modules/payments/attentionNote", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/modules/payments/attentionNote")>();
  return { ...actual, addAttentionNote: vi.fn(actual.addAttentionNote) };
});

const WEBHOOK_SECRET = "test-webhook-secret";

beforeAll(() => {
  vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", WEBHOOK_SECRET);
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

describe("a payment for a cancelled order, when writing its flag fails", () => {
  it("records nothing, so the next delivery records the payment and tells staff", async () => {
    const customer = await kioskToken();
    const staff = await loginAs("staff");
    const placed = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customer}`)
      .send({ items: [{ productId: PRODUCTS.water.id, qty: 1 }], paymentMethod: "counter" });
    const orderId = placed.body.id as string;
    await request(app).post(`/api/orders/${orderId}/cancel`).set("Authorization", `Bearer ${staff}`);
    const amount = Math.round(placed.body.totalAmount * 100);

    vi.mocked(addAttentionNote).mockImplementationOnce(() => {
      throw new Error("The database went away");
    });
    const failed = await postPaid(orderId, amount);

    expect(failed.status).toBe(500);
    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId } })).status).toBe("pending");

    const retried = await postPaid(orderId, amount);

    expect(retried.status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId } })).status).toBe("paid");
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(saved.stockIssue).toBe(true);
    expect(saved.stockIssueNote).toMatch(/Paid online after this order was cancelled/);
  });
});
