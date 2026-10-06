import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { app, loginAs } from "./helpers";

// Manual product stock adjustments (PATCH /api/inventory/:productId), UI review #5:
// damaged goods and spoilage can only lower the stock. Test files share one database
// and run in no fixed order, so this file creates its own product.

let admin: string;
let staff: string;
let productId = "";

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const adjust = (body: object) => request(app).patch(`/api/inventory/${productId}`).set(as(staff)).send(body);
const stock = async () => (await prisma.inventory.findUniqueOrThrow({ where: { productId } })).stockQty;
const logCount = () => prisma.stockAdjustment.count({ where: { productId } });

beforeAll(async () => {
  admin = await loginAs("admin");
  staff = await loginAs("staff");
  const categoryId = (await request(app).get("/api/categories")).body[0].id;
  const created = await request(app)
    .post("/api/products")
    .set(as(admin))
    .send({ name: "Adjust Test Iced Tea", price: 45, categoryId, stockQty: 20, minStockThreshold: 5 });
  productId = created.body.id;
});

describe("adjusting a product's stock (Staff)", () => {
  it.each(["damaged", "spoilage"])("removes stock written off as %s and logs it", async (reason) => {
    const before = await stock();

    const res = await adjust({ delta: -2, reason });

    expect(res.status).toBe(200);
    expect(await stock()).toBe(before - 2);
    const [entry] = (await request(app).get("/api/inventory/adjustments").set(as(staff))).body;
    expect(entry).toMatchObject({ productId, reason, delta: -2 });
  });

  it("accepts a lower counted amount for spoilage", async () => {
    const res = await adjust({ setQty: 10, reason: "spoilage" });

    expect(res.status).toBe(200);
    expect(await stock()).toBe(10);
  });

  it.each([
    ["an increase for damaged goods", { delta: 3, reason: "damaged" }],
    ["an increase for spoilage", { delta: 3, reason: "spoilage" }],
    ["a higher counted amount for spoilage", { setQty: 15, reason: "spoilage" }],
    ["the same counted amount for damaged goods", { setQty: 10, reason: "damaged" }],
  ])("refuses %s, changing and logging nothing", async (_label, body) => {
    const before = await stock();
    const logged = await logCount();

    const res = await adjust(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Damaged goods and spoilage can only lower the stock");
    expect(await stock()).toBe(before);
    expect(await logCount()).toBe(logged);
  });

  it("still lets a restock or a recount raise the stock", async () => {
    expect((await adjust({ delta: 5, reason: "restock" })).status).toBe(200);
    expect((await adjust({ setQty: 30, reason: "correction" })).status).toBe(200);
    expect(await stock()).toBe(30);
  });

  it("refuses a quantity change without a reason, changing nothing", async () => {
    const res = await adjust({ delta: -1 });

    expect(res.status).toBe(400);
    expect(await stock()).toBe(30);
  });
});
