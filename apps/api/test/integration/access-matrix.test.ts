import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { PRODUCTS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

// The complete access matrix: every endpoint against every kind of caller (a visitor
// who isn't signed in, a kiosk customer, Staff, and the Administrator). It checks only
// whether each caller gets past authentication and the role check, so every request is
// built to stop right after that: an empty or invalid body, or an id that doesn't
// exist. Nothing is written to the database.
//
// "allowed" means anything except 401 or 403 (usually 200, or 400/404 from the
// harmless request). The last test makes sure no endpoint is missing from this list.

type Caller = "visitor" | "kiosk" | "staff" | "admin";
type Outcome = "allowed" | 401 | 403;
type Method = "get" | "post" | "put" | "patch" | "delete";

const MISSING = "99999999-9999-4999-8999-999999999999";
const PUBLIC = { visitor: "allowed", kiosk: "allowed", staff: "allowed", admin: "allowed" } as const;
const SIGNED_IN = { visitor: 401, kiosk: "allowed", staff: "allowed", admin: "allowed" } as const;
const STAFF = { visitor: 401, kiosk: 403, staff: "allowed", admin: "allowed" } as const;
const ADMIN = { visitor: 401, kiosk: 403, staff: 403, admin: "allowed" } as const;

interface Entry {
  method: Method;
  route: string; // as registered in Express, e.g. /api/products/:id
  path: string; // the request actually sent
  expected: Record<Caller, Outcome>;
  body?: object;
  /** A known defect makes this row fail for now; it's run with it.fails until fixed. */
  knownBug?: string;
}

const MATRIX: Entry[] = [
  // Public: the kiosk menu and starting a kiosk session
  { method: "get", route: "/api/categories/", path: "/api/categories", expected: PUBLIC },
  { method: "get", route: "/api/products/", path: "/api/products", expected: PUBLIC },
  { method: "get", route: "/api/products/:id", path: `/api/products/${PRODUCTS.sisig.id}`, expected: PUBLIC },
  { method: "post", route: "/api/auth/kiosk-session", path: "/api/auth/kiosk-session", expected: PUBLIC },

  // Any signed-in caller, including an anonymous kiosk session
  { method: "post", route: "/api/orders/", path: "/api/orders", body: {}, expected: SIGNED_IN },
  { method: "get", route: "/api/orders/:id", path: `/api/orders/${MISSING}`, expected: SIGNED_IN },
  { method: "get", route: "/api/orders/:id/receipt", path: `/api/orders/${MISSING}/receipt`, expected: SIGNED_IN },
  { method: "post", route: "/api/payments/intent", path: "/api/payments/intent", body: {}, expected: SIGNED_IN },
  { method: "get", route: "/api/users/me", path: "/api/users/me", expected: SIGNED_IN },

  // Staff and Administrator: daily operations
  { method: "get", route: "/api/orders/", path: "/api/orders", expected: STAFF },
  { method: "patch", route: "/api/orders/:id/items/:itemId", path: `/api/orders/${MISSING}/items/${MISSING}`, body: {}, expected: STAFF },
  { method: "delete", route: "/api/orders/:id/items/:itemId", path: `/api/orders/${MISSING}/items/${MISSING}`, expected: STAFF },
  { method: "post", route: "/api/payments/counter/:orderId/confirm", path: `/api/payments/counter/${MISSING}/confirm`, expected: STAFF },
  { method: "get", route: "/api/kitchen/tasks", path: "/api/kitchen/tasks", expected: STAFF },
  { method: "patch", route: "/api/kitchen/tasks/:id", path: `/api/kitchen/tasks/${MISSING}`, body: {}, expected: STAFF },
  { method: "get", route: "/api/inventory/low-stock", path: "/api/inventory/low-stock", expected: STAFF },
  { method: "get", route: "/api/inventory/adjustments", path: "/api/inventory/adjustments", expected: STAFF },
  { method: "patch", route: "/api/inventory/:productId", path: `/api/inventory/${MISSING}`, body: {}, expected: STAFF },
  { method: "get", route: "/api/products/barcode/:code", path: `/api/products/barcode/${PRODUCTS.sisig.barcode}`, expected: STAFF },
  { method: "get", route: "/api/raw-materials/", path: "/api/raw-materials", expected: STAFF },
  { method: "get", route: "/api/raw-materials/movements", path: "/api/raw-materials/movements", expected: STAFF },
  { method: "patch", route: "/api/raw-materials/:id/stock", path: `/api/raw-materials/${MISSING}/stock`, body: {}, expected: STAFF },

  // Administrator only: products and prices, raw-material setup, reports, user accounts
  { method: "post", route: "/api/products/", path: "/api/products", body: {}, expected: ADMIN },
  { method: "put", route: "/api/products/:id", path: `/api/products/${MISSING}`, body: { price: -1 }, expected: ADMIN },
  { method: "delete", route: "/api/products/:id", path: `/api/products/${MISSING}`, expected: ADMIN },
  { method: "post", route: "/api/products/bulk-import", path: "/api/products/bulk-import", body: {}, expected: ADMIN },
  { method: "get", route: "/api/products/import-template", path: "/api/products/import-template", expected: ADMIN },
  { method: "post", route: "/api/raw-materials/", path: "/api/raw-materials", body: {}, expected: ADMIN },
  { method: "put", route: "/api/raw-materials/:id", path: `/api/raw-materials/${MISSING}`, body: {}, expected: ADMIN },
  { method: "get", route: "/api/reports/sales", path: "/api/reports/sales?range=weekly", expected: ADMIN },
  { method: "get", route: "/api/reports/top-products", path: "/api/reports/top-products", expected: ADMIN },
  { method: "get", route: "/api/reports/inventory-movement", path: "/api/reports/inventory-movement", expected: ADMIN },
  { method: "get", route: "/api/reports/profitability", path: "/api/reports/profitability", expected: ADMIN },
  { method: "get", route: "/api/reports/export", path: "/api/reports/export?type=unknown", expected: ADMIN },
  { method: "get", route: "/api/users/", path: "/api/users", expected: ADMIN },
  { method: "post", route: "/api/users/", path: "/api/users", body: {}, expected: ADMIN },
  { method: "patch", route: "/api/users/:id", path: `/api/users/${MISSING}`, body: { role: "superuser" }, expected: ADMIN },
];

// Not decided by role: signing in and out (auth.test.ts) and PayMongo's webhook, which
// is checked by its signature instead (online-payment.test.ts).
const NOT_ROLE_BASED = ["POST /api/auth/login", "POST /api/auth/refresh", "POST /api/auth/logout", "POST /api/payments/webhook"];

const tokens: Partial<Record<Caller, string>> = {};

beforeAll(async () => {
  tokens.kiosk = await kioskToken();
  tokens.staff = await loginAs("staff");
  tokens.admin = await loginAs("admin");
});

async function call(entry: Entry, caller: Caller) {
  let req = request(app)[entry.method](entry.path);
  if (caller !== "visitor") req = req.set("Authorization", `Bearer ${tokens[caller]}`);
  return entry.body ? req.send(entry.body) : req;
}

async function expectAccess(entry: Entry) {
  const actual: Record<string, Outcome | number> = {};
  for (const caller of ["visitor", "kiosk", "staff", "admin"] as const) {
    const { status } = await call(entry, caller);
    actual[caller] = status === 401 || status === 403 ? status : "allowed";
  }
  expect(actual).toEqual(entry.expected);
}

const label = (e: Entry) => `${e.method.toUpperCase()} ${e.route}`;

describe("access matrix", () => {
  it.each(MATRIX.filter((e) => !e.knownBug).map((e) => [label(e), e] as const))("%s", (_name, entry) => expectAccess(entry));

  for (const entry of MATRIX.filter((e) => e.knownBug)) {
    it.fails(`${label(entry)} (known bug ${entry.knownBug})`, () => expectAccess(entry));
  }
});

describe("matrix completeness", () => {
  it("lists every endpoint the API registers", () => {
    // Walk Express's routing table: each mounted router's path prefix plus its routes.
    const registered: string[] = [];
    type Layer = { route?: { path: string; methods: Record<string, boolean> }; name: string; regexp: RegExp; handle: { stack?: Layer[] } };
    for (const layer of (app as unknown as { _router: { stack: Layer[] } })._router.stack) {
      if (layer.name !== "router" || !layer.handle.stack) continue;
      const prefix = layer.regexp.source.replace("^\\", "").replace("\\/?(?=\\/|$)", "").replace(/\\\//g, "/");
      for (const sub of layer.handle.stack) {
        if (!sub.route) continue;
        for (const method of Object.keys(sub.route.methods)) registered.push(`${method.toUpperCase()} ${prefix}${sub.route.path}`);
      }
    }
    const listed = [...MATRIX.map((e) => `${e.method.toUpperCase()} ${e.route}`), ...NOT_ROLE_BASED];

    expect(registered.length).toBeGreaterThan(30);
    expect(registered.filter((r) => !listed.includes(r))).toEqual([]); // a new endpoint needs a row above
    expect(listed.filter((r) => !registered.includes(r))).toEqual([]); // no row for a removed endpoint
  });
});
