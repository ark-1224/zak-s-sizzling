import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { PRODUCTS, RAW_MATERIALS } from "./fixtures";
import { app, loginAs } from "./helpers";

// Ingredients, allergens and nutrition: a raw material's nutrition per 100 g (linked to
// a USDA food or typed in), "Calculate from recipe" for a dish, and saving a product's
// ingredients, allergens and nutrition. USDA itself isn't called here (no key in tests;
// the search is unit tested). Everything changed is put back afterwards.

let admin: string;
let staff: string;
let porkId: string;
let riceId: string;
let iceTeaBefore: { ingredients: string[]; allergens: string[]; calories: number | null };

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const linkPork = {
  nutrition: { fdcId: 167812, description: "Pork, fresh, belly, raw", per100g: { calories: 518, protein: 9.3, carbs: 0, sugar: 0 } },
};

beforeAll(async () => {
  admin = await loginAs("admin");
  staff = await loginAs("staff");
  porkId = (await prisma.rawMaterial.findUniqueOrThrow({ where: { name: RAW_MATERIALS.pork.name } })).id;
  riceId = (await prisma.rawMaterial.findUniqueOrThrow({ where: { name: RAW_MATERIALS.rice.name } })).id;
  const tea = await prisma.product.findUniqueOrThrow({ where: { id: PRODUCTS.icedTea.id } });
  iceTeaBefore = { ingredients: tea.ingredients, allergens: tea.allergens, calories: tea.calories };
});

afterAll(async () => {
  const cleared = { fdcId: null, fdcDescription: null, kcalPer100g: null, proteinPer100g: null, carbsPer100g: null, sugarPer100g: null, gramsPerUnit: null };
  await prisma.rawMaterial.updateMany({ where: { id: { in: [porkId, riceId] } }, data: cleared });
  await prisma.product.update({
    where: { id: PRODUCTS.icedTea.id },
    data: { ingredients: iceTeaBefore.ingredients, allergens: iceTeaBefore.allergens, calories: iceTeaBefore.calories, proteinG: null, carbsG: null, sugarG: null },
  });
});

describe("raw material nutrition", () => {
  it("links a raw material to a USDA food and returns its values per 100 g", async () => {
    const res = await request(app).put(`/api/raw-materials/${porkId}`).set(auth(admin)).send(linkPork);
    expect(res.status).toBe(200);
    expect(res.body.nutrition).toEqual(linkPork.nutrition);
  });

  it("refuses values that can't be per 100 g", async () => {
    const res = await request(app)
      .put(`/api/raw-materials/${riceId}`)
      .set(auth(admin))
      .send({ nutrition: { fdcId: null, description: null, per100g: { calories: 2000, protein: 0, carbs: 0, sugar: 0 } } });
    expect(res.status).toBe(400);
  });

  it("is for the Administrator only", async () => {
    expect((await request(app).put(`/api/raw-materials/${riceId}`).set(auth(staff)).send(linkPork)).status).toBe(403);
  });
});

describe("calculate from recipe", () => {
  it("adds up the recipe and lists the raw materials it couldn't count", async () => {
    const res = await request(app)
      .post("/api/nutrition/estimate")
      .set(auth(admin))
      .send({ recipe: [{ rawMaterialId: porkId, qtyPerServing: 150 }, { rawMaterialId: riceId, qtyPerServing: 200 }] });
    expect(res.status).toBe(200);
    expect(res.body.nutrition).toEqual({ calories: 777, protein: 14, carbs: 0, sugar: 0 });
    expect(res.body.missing).toEqual([RAW_MATERIALS.rice.name]);
  });

  it("counts every raw material once each has nutrition", async () => {
    await request(app)
      .put(`/api/raw-materials/${riceId}`)
      .set(auth(admin))
      .send({ nutrition: { fdcId: null, description: null, per100g: { calories: 130, protein: 2.7, carbs: 28.2, sugar: 0.1 } } });
    const res = await request(app)
      .post("/api/nutrition/estimate")
      .set(auth(admin))
      .send({ recipe: [{ rawMaterialId: porkId, qtyPerServing: 150 }, { rawMaterialId: riceId, qtyPerServing: 200 }] });
    expect(res.body.nutrition).toEqual({ calories: 1037, protein: 19.4, carbs: 56.4, sugar: 0.2 });
    expect(res.body.missing).toEqual([]);
  });

  it("refuses an empty recipe or an unknown raw material", async () => {
    expect((await request(app).post("/api/nutrition/estimate").set(auth(admin)).send({ recipe: [] })).status).toBe(400);
    const unknown = await request(app)
      .post("/api/nutrition/estimate")
      .set(auth(admin))
      .send({ recipe: [{ rawMaterialId: "99999999-9999-4999-8999-999999999999", qtyPerServing: 10 }] });
    expect(unknown.status).toBe(404);
  });
});

describe("USDA search without a key", () => {
  it("says the lookup isn't set up", async () => {
    const saved = process.env.USDA_API_KEY;
    delete process.env.USDA_API_KEY;
    const res = await request(app).get("/api/nutrition/search?q=rice").set(auth(admin));
    if (saved !== undefined) process.env.USDA_API_KEY = saved;
    expect(res.status).toBe(501);
    expect(res.body.error).toContain("USDA_API_KEY");
  });
});

describe("product ingredients, allergens and nutrition", () => {
  it("saves them and the kiosk receives them", async () => {
    const res = await request(app)
      .put(`/api/products/${PRODUCTS.icedTea.id}`)
      .set(auth(admin))
      .send({
        ingredients: ["Black tea", "Sugar", "Calamansi"],
        allergens: ["Milk"],
        nutrition: { calories: 120, protein: 0, carbs: 30, sugar: 28.5 },
      });
    expect(res.status).toBe(200);
    const kiosk = await request(app).get(`/api/products/${PRODUCTS.icedTea.id}`);
    expect(kiosk.body.ingredients).toEqual(["Black tea", "Sugar", "Calamansi"]);
    expect(kiosk.body.allergens).toEqual(["Milk"]);
    expect(kiosk.body.nutrition).toEqual({ calories: 120, protein: 0, carbs: 30, sugar: 28.5 });
  });

  it("only accepts allergens from the checklist", async () => {
    const res = await request(app).put(`/api/products/${PRODUCTS.icedTea.id}`).set(auth(admin)).send({ allergens: ["Pollen"] });
    expect(res.status).toBe(400);
  });
});
