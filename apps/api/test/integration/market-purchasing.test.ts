import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { app, kioskToken, loginAs } from "./helpers";

// The palengke cycle: market units on raw materials and ready-made items, recording market
// purchases (stock and prices), price history, recipe cost and food cost, usage and waste,
// the shopping list, shelf-life warnings and the stock count with its variance. This file
// creates its own raw materials, dish and ready-made item, so other files' stock is untouched,
// and hands over its paid orders afterwards.

let admin: string;
let staff: string;
let customer: string;
let dishCategory: number;
let readyMadeCategory: number;
const placedIds: string[] = [];

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const today = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 8 * 60 * 60 * 1000 - n * 86_400_000).toISOString().slice(0, 10);

const liempo = { id: "", name: "MP Test Liempo" }; // g, bought by the kg
const rice = { id: "", name: "MP Test Rice" }; // g, bought by the sack
const egg = { id: "", name: "MP Test Egg" }; // pc, bought by the tray
const juice = { id: "", name: "MP Test Juice" }; // ready-made, bought by the case
let dishId = "";

const createMaterial = (body: object) => request(app).post("/api/raw-materials").set(as(admin)).send(body);
const purchase = (body: object, token = admin) => request(app).post("/api/purchases").set(as(token)).send(body);
const stockOf = async (id: string) => (await prisma.rawMaterial.findUniqueOrThrow({ where: { id } })).stockQty.toNumber();
const piecesOf = async (id: string) => (await prisma.inventory.findUniqueOrThrow({ where: { productId: id } })).stockQty;

beforeAll(async () => {
  admin = await loginAs("admin");
  staff = await loginAs("staff");
  customer = await kioskToken();
  dishCategory = (await prisma.category.findFirstOrThrow({ where: { isReadyMade: false } })).id;
  // Its own ready-made category, removed afterwards, so the order of test files doesn't matter.
  readyMadeCategory = (await prisma.category.create({ data: { name: "MP Test Ready-made", icon: "🧃", sortOrder: 98, isReadyMade: true } })).id;
});

afterAll(async () => {
  await prisma.order.updateMany({ where: { id: { in: placedIds }, status: { in: ["confirmed", "preparing", "ready"] } }, data: { status: "completed", handedOverAt: new Date() } });
  if (juice.id) await prisma.product.delete({ where: { id: juice.id } });
  await prisma.category.delete({ where: { id: readyMadeCategory } });
});

describe("market units and planning on an item (unit conversion)", () => {
  it("saves a raw material's market units, par level, safety stock and freshness", async () => {
    const res = await createMaterial({
      name: liempo.name,
      unit: "g",
      category: "meat_seafood",
      parLevel: 8000,
      safetyStock: 1000,
      storage: "frozen",
      shelfLifeDays: 30,
      purchaseUnits: [{ name: "kg", qtyInBase: 1000 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.planning).toEqual({ parLevel: 8000, safetyStock: 1000, storage: "frozen", shelfLifeDays: 30, purchaseUnits: [expect.objectContaining({ name: "kg", qtyInBase: 1000 })] });
    liempo.id = res.body.id;

    rice.id = (await createMaterial({ name: rice.name, unit: "g", purchaseUnits: [{ name: "sack", qtyInBase: 25000 }, { name: "kg", qtyInBase: 1000 }] })).body.id;
    egg.id = (await createMaterial({ name: egg.name, unit: "pc", storage: "room", shelfLifeDays: 6, purchaseUnits: [{ name: "tray", qtyInBase: 30 }] })).body.id;
  });

  it("replaces the market units when the item is saved with new ones", async () => {
    const res = await request(app)
      .put(`/api/raw-materials/${rice.id}`)
      .set(as(admin))
      .send({ purchaseUnits: [{ name: "sack", qtyInBase: 25000 }] });
    expect(res.status).toBe(200);
    expect(res.body.planning.purchaseUnits.map((u: { name: string }) => u.name)).toEqual(["sack"]);
  });

  it("refuses a safety stock above the par level, a base-unit name, or the same unit twice", async () => {
    expect((await request(app).put(`/api/raw-materials/${liempo.id}`).set(as(admin)).send({ safetyStock: 9000 })).status).toBe(400);
    expect((await request(app).put(`/api/raw-materials/${liempo.id}`).set(as(admin)).send({ purchaseUnits: [{ name: "g", qtyInBase: 1 }] })).status).toBe(400);
    expect(
      (await request(app).put(`/api/raw-materials/${liempo.id}`).set(as(admin)).send({ purchaseUnits: [{ name: "kg", qtyInBase: 1000 }, { name: "KG", qtyInBase: 1000 }] })).status
    ).toBe(400);
  });

  it("gives a ready-made item the same planning, in whole pieces", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(as(admin))
      .send({ name: juice.name, price: 35, categoryId: readyMadeCategory, stockQty: 0, minStockThreshold: 6, planning: { parLevel: 48, safetyStock: 6, purchaseUnits: [{ name: "case", qtyInBase: 24 }] } });
    expect(res.status).toBe(201);
    expect(res.body.planning).toMatchObject({ parLevel: 48, safetyStock: 6, purchaseUnits: [expect.objectContaining({ name: "case", qtyInBase: 24 })] });
    juice.id = res.body.id;

    const fraction = await request(app).put(`/api/products/${juice.id}`).set(as(admin)).send({ planning: { parLevel: 4.5 } });
    expect(fraction.status).toBe(400);
  });
});

describe("recording a market purchase", () => {
  it("adds the stock in base units, makes the price paid the cost, and logs a restock linked to the purchase", async () => {
    const res = await purchase({
      purchasedOn: daysAgo(10),
      kind: "market_trip",
      store: "Bacoor public market",
      lines: [
        { kind: "raw_material", itemId: liempo.id, unitName: "kg", qtyUnits: 5, lineTotal: 1600 },
        { kind: "raw_material", itemId: rice.id, unitName: "sack", qtyUnits: 1, lineTotal: 1250 },
        { kind: "raw_material", itemId: egg.id, unitName: "tray", qtyUnits: 1, lineTotal: 240, plannedUnits: 2 },
        { kind: "ready_made", itemId: juice.id, unitName: "case", qtyUnits: 1, lineTotal: 480, expiresOn: daysAgo(-5) },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: "market_trip", totalAmount: 3570, store: "Bacoor public market" });
    expect(res.body.lines.find((l: { itemId: string }) => l.itemId === liempo.id)).toMatchObject({ qtyBase: 5000, pricePerUnit: 320 });
    expect(res.body.lines.find((l: { itemId: string }) => l.itemId === egg.id)).toMatchObject({ plannedUnits: 2, qtyUnits: 1 });
    expect(await stockOf(liempo.id)).toBe(5000);
    expect(await stockOf(rice.id)).toBe(25000);
    expect(await stockOf(egg.id)).toBe(30);
    expect(await piecesOf(juice.id)).toBe(24);

    const liempoRow = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: liempo.id } });
    expect(liempoRow.costPerUnit?.toNumber()).toBe(0.32);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: juice.id } })).cost?.toNumber()).toBe(20);
    const movement = await prisma.rawMaterialMovement.findFirstOrThrow({ where: { rawMaterialId: liempo.id, purchaseId: res.body.id } });
    expect(movement).toMatchObject({ type: "restock", reason: "restock" });
    // The juice is back on the kiosk now that it has pieces.
    expect((await prisma.product.findUniqueOrThrow({ where: { id: juice.id } })).isAvailable).toBe(true);
  });

  it("records an item planned but not found (0 bought) without changing its stock", async () => {
    const before = await stockOf(rice.id);
    const res = await purchase({ purchasedOn: daysAgo(2), kind: "top_up", lines: [{ kind: "raw_material", itemId: rice.id, unitName: "sack", qtyUnits: 0, lineTotal: 0, plannedUnits: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.lines[0]).toMatchObject({ qtyUnits: 0, pricePerUnit: null });
    expect(await stockOf(rice.id)).toBe(before);
  });

  it("refuses a unit the item doesn't have, part of a piece, a future date, a price for nothing, or a dish", async () => {
    const bad = (line: object, extra: object = {}) => purchase({ purchasedOn: today(), lines: [line], ...extra });
    const unknown = await bad({ kind: "raw_material", itemId: liempo.id, unitName: "sack", qtyUnits: 1, lineTotal: 10 });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toContain('no market unit "sack"');
    expect((await bad({ kind: "ready_made", itemId: juice.id, unitName: "pc", qtyUnits: 1.5, lineTotal: 30 })).status).toBe(400);
    expect((await bad({ kind: "raw_material", itemId: liempo.id, unitName: "kg", qtyUnits: 1, lineTotal: 300 }, { purchasedOn: daysAgo(-1) })).status).toBe(400);
    expect((await bad({ kind: "raw_material", itemId: liempo.id, unitName: "kg", qtyUnits: 0, lineTotal: 300 })).status).toBe(400);
    const dish = await prisma.product.findFirstOrThrow({ where: { tracking: "recipe" } });
    expect((await bad({ kind: "ready_made", itemId: dish.id, unitName: "pc", qtyUnits: 1, lineTotal: 10 })).status).toBe(400);
  });

  it("is the owner's work: Staff can't record purchases or see them", async () => {
    expect((await purchase({ purchasedOn: today(), lines: [] }, staff)).status).toBe(403);
    expect((await request(app).get("/api/purchases").set(as(staff))).status).toBe(403);
  });

  it("lists purchases newest first, and shows one with planned against bought", async () => {
    const list = await request(app).get("/api/purchases").set(as(admin));
    expect(list.status).toBe(200);
    expect(list.body[0].purchasedOn >= list.body[list.body.length - 1].purchasedOn).toBe(true);
    const one = await request(app).get(`/api/purchases/${list.body[0].id}`).set(as(admin));
    expect(one.status).toBe(200);
    expect((await request(app).get("/api/purchases/99999999-9999-4999-8999-999999999999").set(as(admin))).status).toBe(404);
  });
});

describe("price history", () => {
  it("lists what an item cost on each purchase, oldest first, comparable per base unit", async () => {
    await purchase({ purchasedOn: daysAgo(3), kind: "top_up", lines: [{ kind: "raw_material", itemId: liempo.id, unitName: "kg", qtyUnits: 2, lineTotal: 720 }] });

    const res = await request(app).get(`/api/purchases/prices?kind=raw_material&itemId=${liempo.id}`).set(as(admin));

    expect(res.status).toBe(200);
    expect(res.body.points.map((p: { pricePerUnit: number }) => p.pricePerUnit)).toEqual([320, 360]);
    expect(res.body.points[1]).toMatchObject({ unitName: "kg", pricePerBase: 0.36 });
    // The latest price is the cost now.
    expect((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: liempo.id } })).costPerUnit?.toNumber()).toBe(0.36);
  });
});

describe("recipe cost, margin and food cost", () => {
  it("works out a dish's cost from its recipe, for the Administrator only", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(as(admin))
      .send({ name: "MP Test Liempo Plate", price: 180, categoryId: dishCategory, recipe: [{ rawMaterialId: liempo.id, qtyPerServing: 250 }, { rawMaterialId: rice.id, qtyPerServing: 200 }] });
    expect(res.status).toBe(201);
    dishId = res.body.id;
    // 250 g × ₱0.36 + 200 g × ₱0.05 = ₱90 + ₱10.
    expect(res.body).toMatchObject({ recipeCost: 100, recipeCostComplete: true });

    const asStaff = await request(app).get(`/api/products/${dishId}`).set(as(staff));
    expect(asStaff.body.recipeCost).toBeUndefined();
  });

  it("saves each sale's cost when paid, and the profitability report uses the recipe cost", async () => {
    const placed = await request(app).post("/api/orders").set(as(customer)).send({ items: [{ productId: dishId, qty: 2 }], paymentMethod: "counter" });
    expect(placed.status).toBe(201);
    placedIds.push(placed.body.id);
    expect((await request(app).post(`/api/payments/counter/${placed.body.id}/confirm`).set(as(staff))).status).toBe(200);

    const line = await prisma.orderItem.findFirstOrThrow({ where: { orderId: placed.body.id } });
    expect(line.unitCost?.toNumber()).toBe(100);
    const profit = (await request(app).get("/api/reports/profitability").set(as(admin))).body.find((p: { productId: string }) => p.productId === dishId);
    expect(profit).toMatchObject({ cost: 100, qtySold: 2, grossProfit: 160 });
  });

  it("reports food cost from recipes and from purchases, and each trip against its sales", async () => {
    const res = await request(app).get(`/api/reports/food-cost?from=${daysAgo(13)}&to=${today()}`).set(as(admin));

    expect(res.status).toBe(200);
    expect(res.body.recipeCost).toBeGreaterThanOrEqual(200);
    expect(res.body.recipeFoodCostPct).not.toBeNull();
    // The trip (₱3,570) and the two top-ups (₱0 and ₱720) were all bought in the period.
    expect(res.body.purchases).toBeGreaterThanOrEqual(4290);
    const trip = res.body.trips.find((t: { purchasedOn: string }) => t.purchasedOn === daysAgo(10));
    expect(trip).toMatchObject({ spent: 4290, topUps: 720, untilOn: null });
    expect(trip.sales).toBeGreaterThanOrEqual(360);
  });
});

describe("usage and waste", () => {
  it("logs the new waste reasons as decreases only", async () => {
    const dropped = await request(app).patch(`/api/raw-materials/${liempo.id}/stock`).set(as(staff)).send({ delta: -250, reason: "dropped" });
    expect(dropped.status).toBe(200);
    const raise = await request(app).patch(`/api/raw-materials/${liempo.id}/stock`).set(as(staff)).send({ delta: 100, reason: "over_prepped" });
    expect(raise.status).toBe(400);
  });

  it("adds up what sales used, what was wasted (with its value) and what was bought", async () => {
    const res = await request(app).get(`/api/reports/usage?from=${daysAgo(13)}&to=${today()}`).set(as(admin));

    expect(res.status).toBe(200);
    const row = res.body.rows.find((r: { itemId: string }) => r.itemId === liempo.id);
    expect(row).toMatchObject({ used: 500, wasted: 250, purchased: 7000, wastedValue: 90 });
    expect(res.body.wasteByReason).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "dropped" })]));
  });

  it("refuses a period that ends before it starts", async () => {
    expect((await request(app).get(`/api/reports/usage?from=${today()}&to=${daysAgo(3)}`).set(as(admin))).status).toBe(400);
  });
});

describe("the shopping list", () => {
  it("plans what to buy in market units, never above par, with an estimate of the cash to bring", async () => {
    const res = await request(app).get("/api/purchases/shopping-list?days=14").set(as(admin));

    expect(res.status).toBe(200);
    const line = res.body.items.find((i: { itemId: string }) => i.itemId === liempo.id);
    // Used 750 g in 28 days (500 sold + 250 wasted) ≈ 26.8 g a day; 14 days + 1000 g buffer
    // ≈ 1375 g, but 6250 g is on hand: nothing to buy.
    expect(line).toBeUndefined();
    const juiceLine = res.body.items.find((i: { itemId: string }) => i.itemId === juice.id);
    expect(juiceLine).toBeUndefined(); // 24 pieces on hand cover the 6-piece buffer.
  });

  it("buys up to the target when stock is short, rounded up to whole market units", async () => {
    await request(app).patch(`/api/raw-materials/${liempo.id}/stock`).set(as(staff)).send({ setQty: 100, reason: "correction" });

    const res = await request(app).get("/api/purchases/shopping-list?days=14").set(as(admin));

    const line = res.body.items.find((i: { itemId: string }) => i.itemId === liempo.id);
    expect(line).toMatchObject({ unitName: "kg", coverDays: 14, shortShelfLife: false });
    expect(line.buyBase).toBeCloseTo(line.targetQty - 100, 2);
    expect(line.buyUnits).toBe(Math.ceil(line.buyBase / 1000));
    expect(line.lastPricePerUnit).toBe(360);
    expect(line.estimatedCost).toBe(360 * line.buyUnits);
  });

  it("refuses more than 60 days", async () => {
    expect((await request(app).get("/api/purchases/shopping-list?days=90").set(as(admin))).status).toBe(400);
  });
});

describe("shelf-life warnings", () => {
  it("warns about stock past its days fresh and a printed date coming up", async () => {
    const res = await request(app).get("/api/inventory/freshness").set(as(staff));

    expect(res.status).toBe(200);
    // Eggs bought 10 days ago stay fresh 6 days.
    expect(res.body.find((w: { itemId: string }) => w.itemId === egg.id)).toMatchObject({ status: "expired", basis: "shelf_life", boughtOn: daysAgo(10), daysLeft: -4 });
    // The juice's printed date is in 5 days.
    expect(res.body.find((w: { itemId: string }) => w.itemId === juice.id)).toMatchObject({ status: "use_soon", basis: "printed_date", daysLeft: 5 });
    // Frozen liempo, 30 days: nothing to say.
    expect(res.body.find((w: { itemId: string }) => w.itemId === liempo.id)).toBeUndefined();
  });
});

describe("the stock count and its variance", () => {
  it("sets the stock to what was counted and records the difference, with its value for the Administrator", async () => {
    const res = await request(app)
      .post("/api/inventory/counts")
      .set(as(admin))
      .send({
        note: "Before the next trip",
        lines: [
          { kind: "raw_material", itemId: rice.id, countedQty: 24500 },
          { kind: "ready_made", itemId: juice.id, countedQty: 24 },
        ],
      });

    expect(res.status).toBe(201);
    const riceLine = res.body.lines.find((l: { itemId: string }) => l.itemId === rice.id);
    // 25 kg bought, 400 g sold (2 plates × 200 g): 24,600 g expected, 24,500 g counted.
    expect(riceLine).toMatchObject({ systemQty: 24600, countedQty: 24500, difference: -100, differenceValue: -5 });
    expect(riceLine.since).toMatchObject({ previousCountedQty: null, purchased: 25000, sold: 400, wasted: 0 });
    expect(res.body.lines.find((l: { itemId: string }) => l.itemId === juice.id)).toMatchObject({ difference: 0 });
    expect(await stockOf(rice.id)).toBe(24500);
    const correction = await prisma.rawMaterialMovement.findFirstOrThrow({ where: { rawMaterialId: rice.id, stockCountId: res.body.id } });
    expect(correction).toMatchObject({ reason: "correction", note: "Stock count" });
  });

  it("shows Staff the count without its peso value, and lists past counts", async () => {
    const list = await request(app).get("/api/inventory/counts").set(as(staff));
    expect(list.status).toBe(200);
    expect(list.body[0]).toMatchObject({ itemCount: 2, itemsOff: 1 });
    expect(list.body[0].totalDifferenceValue).toBeUndefined();
    const one = await request(app).get(`/api/inventory/counts/${list.body[0].id}`).set(as(staff));
    expect(one.body.lines[0].differenceValue).toBeUndefined();
  });

  it("compares a later count with the previous one", async () => {
    const res = await request(app).post("/api/inventory/counts").set(as(staff)).send({ lines: [{ kind: "raw_material", itemId: rice.id, countedQty: 24500 }] });
    expect(res.status).toBe(201);
    expect(res.body.lines[0]).toMatchObject({ difference: 0, since: { previousCountedQty: 24500, purchased: 0, sold: 0 } });
  });

  it("refuses part of a piece, the same item twice, or nothing counted", async () => {
    const send = (lines: object[]) => request(app).post("/api/inventory/counts").set(as(staff)).send({ lines });
    expect((await send([{ kind: "ready_made", itemId: juice.id, countedQty: 2.5 }])).status).toBe(400);
    expect(
      (await send([
        { kind: "raw_material", itemId: rice.id, countedQty: 1 },
        { kind: "raw_material", itemId: rice.id, countedQty: 2 },
      ])).status
    ).toBe(400);
    expect((await send([])).status).toBe(400);
  });
});

describe("the item list for the count sheet and the purchase form", () => {
  it("includes raw materials and ready-made items with their market units; cost for the Administrator only", async () => {
    const asAdmin = (await request(app).get("/api/inventory/items").set(as(admin))).body;
    const asStaff = (await request(app).get("/api/inventory/items").set(as(staff))).body;
    const adminJuice = asAdmin.find((i: { itemId: string }) => i.itemId === juice.id);
    expect(adminJuice).toMatchObject({ kind: "ready_made", baseUnit: "pc", costPerBase: 20, units: [{ name: "case", qtyInBase: 24 }] });
    expect(asStaff.find((i: { itemId: string }) => i.itemId === juice.id).costPerBase).toBeUndefined();
  });
});
