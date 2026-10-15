import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { MAX_IMAGE_BYTES } from "../../src/modules/products/image";
import { app, loginAs } from "./helpers";

// Product photos: upload, serve, replace and remove (products/image.ts). Uses its own
// products, created here, so no other file sees a photo.

let admin: string;
let staff: string;
let categoryId: number;
let productId: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// The smallest real files of each type: a 1×1 PNG, and the signatures the API checks
// for JPEG and WebP (it reads the format from the bytes, not from what the upload says).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1), Buffer.from([0xff, 0xd9])]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([40, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(32, 2)]);

const upload = (id: string, bytes: Buffer, contentType: string, token = admin) =>
  request(app).put(`/api/products/${id}/image`).set(auth(token)).send({ contentType, imageBase64: bytes.toString("base64") });

async function newProduct(name: string) {
  const res = await request(app).post("/api/products").set(auth(admin)).send({ name, price: 99, categoryId });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

beforeAll(async () => {
  admin = await loginAs("admin");
  staff = await loginAs("staff");
  categoryId = (await request(app).get("/api/categories")).body[0].id;
  productId = await newProduct("Photo Test Plate");
});

describe("uploading a product photo", () => {
  it("starts with no photo", async () => {
    const res = await request(app).get(`/api/products/${productId}`);

    expect(res.body.imageUrl).toBeNull();
    expect((await request(app).get(`/api/products/${productId}/image`)).status).toBe(404);
  });

  it("saves the photo and returns the product with its photo URL", async () => {
    const res = await upload(productId, PNG, "image/png");

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toMatch(new RegExp(`^/api/products/${productId}/image\\?v=\\d+$`));
  });

  it("serves exactly the uploaded bytes, cacheable and loadable from the kiosk's origin", async () => {
    const { body } = await request(app).get(`/api/products/${productId}`);
    const res = await request(app).get(body.imageUrl).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
  });

  it("lists the photo URL with the menu, never the photo itself", async () => {
    const res = await request(app).get("/api/products");
    const product = res.body.find((p: { id: string }) => p.id === productId);

    expect(product.imageUrl).toEqual(expect.any(String));
    expect(Object.keys(product)).not.toContain("image");
    expect(JSON.stringify(product)).not.toContain(PNG.toString("base64"));
  });

  it("gives a replaced photo a new URL", async () => {
    const before = (await request(app).get(`/api/products/${productId}`)).body.imageUrl;
    await new Promise((r) => setTimeout(r, 5)); // the version is the save time in ms

    const res = await upload(productId, WEBP, "image/webp");

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).not.toBe(before);
    const served = await request(app).get(res.body.imageUrl);
    expect(served.headers["content-type"]).toBe("image/webp");
  });

  it("accepts JPEG too", async () => {
    expect((await upload(productId, JPEG, "image/jpeg")).status).toBe(200);
  });
});

describe("photos the API refuses", () => {
  it("refuses a file whose bytes aren't the type it claims", async () => {
    const res = await upload(productId, PNG, "image/jpeg");

    expect(res.status).toBe(415);
  });

  it("refuses a file that isn't a JPEG, PNG or WebP image, whatever it claims", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    expect((await upload(productId, svg, "image/png")).status).toBe(415);
  });

  it.each([
    ["an SVG type", { contentType: "image/svg+xml", imageBase64: PNG.toString("base64") }],
    ["a GIF type", { contentType: "image/gif", imageBase64: PNG.toString("base64") }],
    ["no file", { contentType: "image/png", imageBase64: "" }],
    ["text that isn't base64", { contentType: "image/png", imageBase64: "not base64!" }],
    ["no type", { imageBase64: PNG.toString("base64") }],
  ])("refuses %s", async (_label, body) => {
    const res = await request(app).put(`/api/products/${productId}/image`).set(auth(admin)).send(body);

    expect(res.status).toBe(400);
  });

  it("refuses a photo over the size limit", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]);

    const res = await upload(productId, big, "image/png");

    expect(res.status).toBe(400);
    expect(res.body.message ?? JSON.stringify(res.body)).toMatch(/too large/i);
  });

  it("keeps the previous photo when an upload is refused", async () => {
    const res = await request(app).get(`/api/products/${productId}/image`);

    expect(res.headers["content-type"]).toBe("image/jpeg");
  });

  it("returns 404 for a product that doesn't exist", async () => {
    const res = await upload("99999999-9999-4999-8999-999999999999", PNG, "image/png");

    expect(res.status).toBe(404);
  });

  it("doesn't let staff change photos", async () => {
    expect((await upload(productId, PNG, "image/png", staff)).status).toBe(403);
    expect((await request(app).delete(`/api/products/${productId}/image`).set(auth(staff))).status).toBe(403);
  });
});

describe("removing a photo", () => {
  it("removes it, so the kiosk shows the icon again", async () => {
    const res = await request(app).delete(`/api/products/${productId}/image`).set(auth(admin));

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toBeNull();
    expect((await request(app).get(`/api/products/${productId}/image`)).status).toBe(404);
  });

  it("is fine when there's no photo to remove", async () => {
    expect((await request(app).delete(`/api/products/${productId}/image`).set(auth(admin))).status).toBe(200);
  });

  it("goes with the product when the product is deleted", async () => {
    const id = await newProduct("Photo Test Deleted");
    await upload(id, PNG, "image/png");

    expect((await request(app).delete(`/api/products/${id}`).set(auth(admin))).status).toBe(204);
    expect(await prisma.productImage.count({ where: { productId: id } })).toBe(0);
  });
});
