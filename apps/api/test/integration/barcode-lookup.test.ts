import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app, loginAs } from "./helpers";

// Barcode lookup with the kinds of barcode a store's products really carry (Barcode lookup
// screen 2/2). Every code below has a correct check digit:
// - EAN-13, the barcode on most packaged goods in the Philippines (country prefix 480)
// - UPC-A, 12 digits starting with 0 (imported goods), where the leading zero matters
// - EAN-8, the short code on small packs
// - Code 128, letters and symbols, as on a label printed for the store's own items
// The products are created here, so their barcodes can't clash with other files.

let admin: string;
let staff: string;
let categoryId: number;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const lookup = (code: string, token = staff) =>
  request(app).get(`/api/products/barcode/${encodeURIComponent(code)}`).set(auth(token));

const CODES = {
  ean13: "4800016644290",
  upcA: "036000291452",
  ean8: "96385074",
  code128: "ZSH-SAUCE/01",
};

beforeAll(async () => {
  admin = await loginAs("admin");
  staff = await loginAs("staff");
  categoryId = (await request(app).get("/api/categories")).body[0].id;
  for (const [kind, barcode] of Object.entries(CODES)) {
    const res = await request(app)
      .post("/api/products")
      .set(auth(admin))
      .send({ name: `Barcode Test ${kind}`, price: 50, categoryId, barcode, stockQty: 12, minStockThreshold: 3 });
    expect(res.status).toBe(201);
  }
});

describe("looking up real barcode formats", () => {
  it.each(Object.entries(CODES))("finds the product by its %s barcode", async (kind, code) => {
    const res = await lookup(code);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: `Barcode Test ${kind}`, barcode: code, price: 50, stockQty: 12, minStockThreshold: 3 });
  });

  it("keeps a UPC-A's leading zero: without it, it's a different barcode", async () => {
    const res = await lookup(CODES.upcA.slice(1));

    expect(res.status).toBe(404);
  });

  it("matches the whole code only, not part of one", async () => {
    expect((await lookup(CODES.ean13.slice(0, 12))).status).toBe(404);
    expect((await lookup(`${CODES.ean13}0`)).status).toBe(404);
  });

  it("matches letters exactly, as a Code 128 label prints them", async () => {
    expect((await lookup(CODES.code128.toLowerCase())).status).toBe(404);
  });

  it("finds a code containing a slash when the screen encodes it", async () => {
    expect((await lookup(CODES.code128)).body.name).toBe("Barcode Test code128");
  });
});

describe("barcodes that aren't found", () => {
  it("answers 404 with a message the screen can show", async () => {
    const res = await lookup("4800000000004");

    expect(res.status).toBe(404);
    expect(res.body.error ?? res.body.message).toBe("No product with that barcode");
  });

  it("answers 404, not a server error, for odd input", async () => {
    for (const code of ["%", "x".repeat(200), "' OR 1=1 --", "🍔"]) {
      expect((await lookup(code)).status).toBe(404);
    }
  });

  it("finds a product once an admin gives it the scanned barcode", async () => {
    const scanned = "4800001234567";
    expect((await lookup(scanned)).status).toBe(404);

    const created = await request(app)
      .post("/api/products")
      .set(auth(admin))
      .send({ name: "Barcode Test Added After Scan", price: 30, categoryId, barcode: scanned });

    expect(created.status).toBe(201);
    expect((await lookup(scanned)).body.id).toBe(created.body.id);
  });
});
