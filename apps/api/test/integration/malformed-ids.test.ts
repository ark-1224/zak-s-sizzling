import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { PRODUCTS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// Regression tests for defect D-05: a malformed id in the path used to reach Postgres,
// which rejects anything that isn't a UUID, and the API answered 500. A malformed id
// can't match a record, so it now gets the same 404 as an id that doesn't exist.
// (Products and raw materials are covered in their own files, D-01.)

let admin: string;
let pendingOrderId = "";

beforeAll(async () => {
  admin = await loginAs("admin");
  // A real pending order, so a malformed item id is checked after the order is found.
  const customer = await kioskToken();
  pendingOrderId = (
    await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customer}`)
      .send({ items: [{ productId: PRODUCTS.water.id, qty: 1 }], paymentMethod: "counter" })
  ).body.id;
});

const BAD = "not-an-id";
const MISSING = "99999999-9999-4999-8999-999999999999";

describe("a malformed id returns 404, not 500", () => {
  it.each([
    ["get", `/api/orders/${BAD}`, undefined],
    ["get", `/api/orders/${BAD}/receipt`, undefined],
    ["patch", `/api/orders/${BAD}/items/${MISSING}`, { qty: 1 }],
    ["patch", `/api/orders/:pendingOrder/items/${BAD}`, { qty: 1 }],
    ["delete", `/api/orders/${BAD}/items/${MISSING}`, undefined],
    ["post", `/api/orders/${BAD}/cancel`, undefined],
    ["post", `/api/payments/counter/${BAD}/confirm`, undefined],
    ["patch", `/api/kitchen/tasks/${BAD}`, { status: "in_progress" }],
    ["patch", `/api/inventory/${BAD}`, { delta: -1, reason: "correction" }],
    ["get", `/api/inventory/adjustments?productId=${BAD}`, undefined],
    ["patch", `/api/users/${BAD}`, { name: "Nobody" }],
  ] as const)("%s %s", async (method, path, body) => {
    const req = request(app)[method](path.replace(":pendingOrder", pendingOrderId)).set("Authorization", `Bearer ${admin}`);

    const res = await (body ? req.send(body) : req);

    expect(res.status).toBe(404);
  });

  it("returns 404 when editing a user that does not exist", async () => {
    const res = await request(app).patch(`/api/users/${MISSING}`).set("Authorization", `Bearer ${admin}`).send({ name: "Nobody" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
  });
});
