import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
// The worker's alert sender, run directly against the same *_test database (its Prisma
// client reads the DATABASE_URL that vitest.config.mts points there).
import { MAX_ATTEMPTS, sendLowStockAlerts } from "../../../worker/src/jobs/sendLowStockAlerts";
import type { Mailer, MailMessage } from "../../../worker/src/lib/mailer";
import { app, kioskToken, loginAs } from "./helpers";

// Low-stock notifications (2/3 and 3/3): the database queues an alert when an item
// reaches its minimum, whatever changed the stock, once until the item is restocked;
// the worker emails what is waiting. The tests
// in this file build on each other. Items are named "LSA Test …"; other files' alerts
// may also be waiting, so these tests look only at their own.

let admin: string;
let staff: string;
let customer: string;
const ids = { juice: "", sugar: "", syrup: "", shake: "" };

beforeAll(async () => {
  [admin, staff, customer] = await Promise.all([loginAs("admin"), loginAs("staff"), kioskToken()]);
  const { id: categoryId } = await prisma.category.findFirstOrThrow();

  ids.juice = (
    await prisma.product.create({
      data: { name: "LSA Test Juice", price: 40, categoryId, inventory: { create: { stockQty: 10, minStockThreshold: 5 } } },
    })
  ).id;
  ids.sugar = (await prisma.rawMaterial.create({ data: { name: "LSA Test Sugar", unit: "g", stockQty: 2000, minStockThreshold: 500 } })).id;
  ids.syrup = (
    await prisma.rawMaterial.create({ data: { name: "LSA Test Old Syrup", unit: "ml", stockQty: 1000, minStockThreshold: 100, isActive: false } })
  ).id;
  // A recipe dish keeps an inventory row whose own count isn't used.
  ids.shake = (
    await prisma.product.create({
      data: {
        name: "LSA Test Shake",
        price: 90,
        categoryId,
        tracking: "recipe",
        inventory: { create: { stockQty: 25, minStockThreshold: 30 } },
        recipeItems: { create: [{ rawMaterialId: ids.sugar, qtyPerServing: 300 }] },
      },
    })
  ).id;
});

const alertsFor = (itemName: string) => prisma.lowStockAlert.findMany({ where: { itemName }, orderBy: { createdAt: "asc" } });
const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const adjustProduct = (body: object) => request(app).patch(`/api/inventory/${ids.juice}`).set(as(staff)).send(body);
const adjustMaterial = (id: string, body: object) => request(app).patch(`/api/raw-materials/${id}/stock`).set(as(staff)).send(body);

async function sell(productId: string, qty: number) {
  const order = await request(app).post("/api/orders").set(as(customer)).send({ items: [{ productId, qty }], paymentMethod: "counter" });
  expect(order.status).toBe(201);
  const confirmed = await request(app).post(`/api/payments/counter/${order.body.id}/confirm`).set(as(staff));
  expect(confirmed.status).toBe(200);
}

describe("queuing an alert when an item reaches its minimum", () => {
  it("queues one for a stock adjustment that takes a product to its minimum", async () => {
    expect((await adjustProduct({ delta: -5, reason: "damaged" })).status).toBe(200);

    const alerts = await alertsFor("LSA Test Juice");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ productId: ids.juice, rawMaterialId: null, unit: null, sentAt: null, attempts: 0 });
    expect(alerts[0].stockQty.toNumber()).toBe(5);
    expect(alerts[0].minStockThreshold.toNumber()).toBe(5);
    expect(Math.abs(alerts[0].createdAt.getTime() - Date.now())).toBeLessThan(60_000); // stored in UTC
  });

  it("queues nothing more while the product stays low", async () => {
    await adjustProduct({ delta: -1, reason: "damaged" });

    expect(await alertsFor("LSA Test Juice")).toHaveLength(1);
  });

  it("queues another once it has been restocked and a sale takes it back down", async () => {
    await adjustProduct({ setQty: 10, reason: "restock" });
    expect(await alertsFor("LSA Test Juice")).toHaveLength(1);

    await sell(ids.juice, 5);

    const alerts = await alertsFor("LSA Test Juice");
    expect(alerts).toHaveLength(2);
    expect(alerts[1].stockQty.toNumber()).toBe(5);
  });

  it("queues one when the minimum is raised above the stock", async () => {
    await adjustProduct({ setQty: 20, reason: "restock" });
    await adjustProduct({ minStockThreshold: 25 });

    const alerts = await alertsFor("LSA Test Juice");
    expect(alerts).toHaveLength(3);
    expect(alerts[2].minStockThreshold.toNumber()).toBe(25);
  });

  it("queues one for a raw material, with its unit", async () => {
    expect((await adjustMaterial(ids.sugar, { delta: -1600, reason: "spoilage" })).status).toBe(200);

    const alerts = await alertsFor("LSA Test Sugar");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ rawMaterialId: ids.sugar, productId: null, unit: "g" });
    expect(alerts[0].stockQty.toNumber()).toBe(400);
  });

  it("queues one for the raw material when a recipe dish's sale uses it up, and none for the dish", async () => {
    await adjustMaterial(ids.sugar, { setQty: 1000, reason: "restock" });

    await sell(ids.shake, 2); // 2 × 300 g leaves 400 g, under the 500 g minimum

    expect(await alertsFor("LSA Test Sugar")).toHaveLength(2);
    expect(await alertsFor("LSA Test Shake")).toHaveLength(0);
  });

  it("ignores a recipe dish's own unused count", async () => {
    await prisma.inventory.update({ where: { productId: ids.shake }, data: { stockQty: 0 } });

    expect(await alertsFor("LSA Test Shake")).toHaveLength(0);
  });

  it("ignores a raw material that isn't in use, until it's put back in use while low", async () => {
    await prisma.rawMaterial.update({ where: { id: ids.syrup }, data: { stockQty: 50 } });
    expect(await alertsFor("LSA Test Old Syrup")).toHaveLength(0);

    expect((await request(app).put(`/api/raw-materials/${ids.syrup}`).set(as(admin)).send({ isActive: true })).status).toBe(200);

    expect(await alertsFor("LSA Test Old Syrup")).toHaveLength(1);
  });
});

describe("only once until restocked (3/3)", () => {
  it("doesn't alert again when the minimum is lowered and raised back without a restock", async () => {
    await adjustProduct({ minStockThreshold: 10 }); // 20 left: no longer low
    await adjustProduct({ minStockThreshold: 25 }); // low again, but never restocked

    expect(await alertsFor("LSA Test Juice")).toHaveLength(3);
  });

  it("doesn't alert again when a low raw material is taken out of use and put back", async () => {
    const put = (isActive: boolean) => request(app).put(`/api/raw-materials/${ids.syrup}`).set(as(admin)).send({ isActive });
    await put(false);
    await put(true);

    expect(await alertsFor("LSA Test Old Syrup")).toHaveLength(1);
  });

  it("doesn't count a restock that leaves the item at or below its minimum", async () => {
    await adjustMaterial(ids.sugar, { delta: 100, reason: "restock" }); // 500 g: still at the minimum
    await adjustMaterial(ids.sugar, { delta: -100, reason: "spoilage" });

    const alerts = await alertsFor("LSA Test Sugar");
    expect(alerts).toHaveLength(2);
    expect(alerts[1].resolvedAt).toBeNull();
  });

  it("closes the alert once restocked above the minimum, so the next time it runs low alerts again", async () => {
    await adjustMaterial(ids.sugar, { setQty: 1000, reason: "restock" });
    expect((await alertsFor("LSA Test Sugar")).every((a) => a.resolvedAt !== null)).toBe(true);

    await adjustMaterial(ids.sugar, { delta: -600, reason: "spoilage" });

    const alerts = await alertsFor("LSA Test Sugar");
    expect(alerts).toHaveLength(3);
    expect(alerts[2]).toMatchObject({ resolvedAt: null });
  });
});

/** A mailer that keeps what it is asked to send, or fails like a refused Gmail sign-in. */
function fakeMailer(fail = false): Mailer & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    to: ["owner@example.com"],
    sent,
    async verify() {},
    async send(message) {
      if (fail) throw Object.assign(new Error("Invalid login: 535-5.7.8 Username and Password not accepted"), { code: "EAUTH" });
      sent.push(message);
      return { messageId: `<test-${sent.length}@example.com>`, accepted: ["owner@example.com"] };
    },
  };
}

const OUR_ALERTS = { itemName: { startsWith: "LSA Test" } };

describe("emailing the alerts (worker)", () => {
  it("sends nothing while email isn't set up, and the alerts wait", async () => {
    const result = await sendLowStockAlerts(null);

    expect(result.sent).toBe(0);
    expect(result.waiting).toBeGreaterThanOrEqual(6);
    expect(await prisma.lowStockAlert.count({ where: { ...OUR_ALERTS, sentAt: { not: null } } })).toBe(0);
  });

  it("sends everything waiting, one line per item with its latest figures, and marks it sent", async () => {
    const mailer = fakeMailer();
    // Other test files may have left alerts too; one email holds 50, so keep going until none wait.
    for (let run = 0; run < 10 && (await sendLowStockAlerts(mailer)).waiting > 0; run++);

    expect(await prisma.lowStockAlert.count({ where: { ...OUR_ALERTS, sentAt: null } })).toBe(0);
    const text = mailer.sent.map((m) => m.text).join("\n");
    // The juice and the sugar each reached their minimum three times before this email.
    expect(text).toMatch(/- LSA Test Juice: 20 left, minimum 25 \([^)]*; reached it 3 times since the last email\)/);
    expect(text).toMatch(/- LSA Test Sugar \(raw material\): 400 g left, minimum 500 g \([^)]*; reached it 3 times since the last email\)/);
    expect(text).toMatch(/- LSA Test Old Syrup \(raw material\): 50 ml left, minimum 100 ml \([^;)]*\)/);
    expect(text.match(/LSA Test Juice/g)).toHaveLength(1);
  });

  it("doesn't send them again", async () => {
    const mailer = fakeMailer();

    await sendLowStockAlerts(mailer);

    expect(mailer.sent.map((m) => m.text).join("\n")).not.toMatch(/LSA Test/);
  });

  it("keeps a failed alert waiting with the reason, and gives up after five tries", async () => {
    await adjustProduct({ setQty: 30, reason: "restock" });
    await adjustProduct({ delta: -10, reason: "damaged" }); // 20, under the minimum of 25
    const [fresh] = (await alertsFor("LSA Test Juice")).slice(-1);

    await sendLowStockAlerts(fakeMailer(true));
    const afterOne = await prisma.lowStockAlert.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(afterOne).toMatchObject({ sentAt: null, attempts: 1 });
    expect(afterOne.lastError).toMatch(/App Password/);

    for (let run = 1; run < MAX_ATTEMPTS; run++) await sendLowStockAlerts(fakeMailer(true));
    const working = fakeMailer();
    await sendLowStockAlerts(working);

    expect(await prisma.lowStockAlert.findUniqueOrThrow({ where: { id: fresh.id } })).toMatchObject({ sentAt: null, attempts: MAX_ATTEMPTS });
    expect(working.sent.map((m) => m.text).join("\n")).not.toMatch(/LSA Test Juice/);
  });
});
