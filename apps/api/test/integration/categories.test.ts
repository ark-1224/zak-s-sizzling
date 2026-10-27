import { createServer } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { attachWebSocket } from "../../src/websocket";
import { CATEGORY, PRODUCTS } from "./fixtures";
import { app, loginAs } from "./helpers";

// Category management (Administrator only): add, rename, change the icon and "new"
// badge, reorder the kiosk's rail, and delete an empty category. Uses only the
// manuscript's fields. Categories made here are removed again afterwards, and the
// rail's original order is put back.

const io = attachWebSocket(createServer());
const emit = vi.spyOn(io, "emit");
let admin: string;
let originalOrder: number[];
const madeIds: number[] = [];

beforeAll(async () => {
  admin = await loginAs("admin");
  originalOrder = (await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })).map((c) => c.id);
});

afterAll(async () => {
  await prisma.category.deleteMany({ where: { id: { in: madeIds } } });
  await prisma.$transaction(originalOrder.map((id, i) => prisma.category.update({ where: { id }, data: { sortOrder: i + 1 } })));
  vi.restoreAllMocks();
  io.close();
});

const auth = () => ({ Authorization: `Bearer ${admin}` });

async function make(name: string, extra: Record<string, unknown> = {}) {
  const res = await request(app).post("/api/categories").set(auth()).send({ name, ...extra });
  expect(res.status).toBe(201);
  madeIds.push(res.body.id);
  return res.body as { id: number; name: string; icon: string | null; isNew: boolean; sortOrder: number; productCount: number };
}

describe("categories", () => {
  it("lists categories in the rail's order, with how many products each has", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    const fixture = (res.body as { name: string; productCount: number }[]).find((c) => c.name === CATEGORY.name)!;
    expect(fixture.productCount).toBeGreaterThanOrEqual(Object.keys(PRODUCTS).length);
    const orders = (res.body as { sortOrder: number }[]).map((c) => c.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it("adds a category at the end of the rail and tells open kiosks", async () => {
    emit.mockClear();
    const created = await make("Test Merienda", { icon: "🍢", isNew: true });
    expect(created).toMatchObject({ name: "Test Merienda", icon: "🍢", isNew: true, productCount: 0 });
    const all = (await request(app).get("/api/categories")).body as { id: number }[];
    expect(all[all.length - 1].id).toBe(created.id);
    expect(emit).toHaveBeenCalledWith("categories:changed");
  });

  it("refuses a name that's already taken, whatever the capitals", async () => {
    const res = await request(app).post("/api/categories").set(auth()).send({ name: CATEGORY.name.toUpperCase() });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already a category");
  });

  it("refuses an empty name or an icon that isn't a single emoji", async () => {
    expect((await request(app).post("/api/categories").set(auth()).send({ name: "   " })).status).toBe(400);
    expect((await request(app).post("/api/categories").set(auth()).send({ name: "Test Long Icon", icon: "abcdefghij" })).status).toBe(400);
  });

  it("renames a category and changes its icon and new badge", async () => {
    const cat = await make("Test Silog");
    const res = await request(app).put(`/api/categories/${cat.id}`).set(auth()).send({ name: "Test Silog Meals", icon: "🍳", isNew: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Test Silog Meals", icon: "🍳", isNew: true });
    const cleared = await request(app).put(`/api/categories/${cat.id}`).set(auth()).send({ icon: null, isNew: false });
    expect(cleared.body).toMatchObject({ name: "Test Silog Meals", icon: null, isNew: false });
  });

  it("refuses renaming to another category's name", async () => {
    const cat = await make("Test Pulutan");
    const res = await request(app).put(`/api/categories/${cat.id}`).set(auth()).send({ name: CATEGORY.name });
    expect(res.status).toBe(409);
  });

  it("reorders the rail", async () => {
    const before = ((await request(app).get("/api/categories")).body as { id: number }[]).map((c) => c.id);
    const reversed = [...before].reverse();
    const res = await request(app).put("/api/categories/order").set(auth()).send({ ids: reversed });
    expect(res.status).toBe(200);
    expect((res.body as { id: number }[]).map((c) => c.id)).toEqual(reversed);
  });

  it("refuses an order that leaves out or repeats a category", async () => {
    const ids = ((await request(app).get("/api/categories")).body as { id: number }[]).map((c) => c.id);
    expect((await request(app).put("/api/categories/order").set(auth()).send({ ids: ids.slice(1) })).status).toBe(400);
    expect((await request(app).put("/api/categories/order").set(auth()).send({ ids: [ids[0], ...ids.slice(0, -1)] })).status).toBe(400);
  });

  it("deletes an empty category", async () => {
    const cat = await make("Test Empty");
    expect((await request(app).delete(`/api/categories/${cat.id}`).set(auth())).status).toBe(204);
    expect(await prisma.category.findUnique({ where: { id: cat.id } })).toBeNull();
  });

  it("won't delete a category that still has products", async () => {
    const fixture = await prisma.category.findFirstOrThrow({ where: { name: CATEGORY.name } });
    const res = await request(app).delete(`/api/categories/${fixture.id}`).set(auth());
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/^Move its \d+ products to another category first/);
  });

  it("returns 404 for a category that doesn't exist or a malformed id", async () => {
    expect((await request(app).put("/api/categories/999999").set(auth()).send({ name: "X" })).status).toBe(404);
    expect((await request(app).delete("/api/categories/abc").set(auth())).status).toBe(404);
  });
});
