// Known records seeded into the test database by global-setup.ts. Tests import these
// instead of hard-coding values, so the seed and the assertions can't drift apart.

export const PASSWORD = "Test-Password-123";

export const USERS = {
  admin: { name: "Test Admin", email: "admin@test.local", role: "admin", isActive: true },
  staff: { name: "Test Staff", email: "staff@test.local", role: "staff", isActive: true },
  suspended: { name: "Suspended Staff", email: "suspended@test.local", role: "staff", isActive: false },
} as const;

export const CATEGORY = { name: "Sizzling Plates", icon: "🔥", sortOrder: 1 };

export const RAW_MATERIALS = {
  pork: { name: "Test Pork", unit: "g", stockQty: 1000 },
  rice: { name: "Test Rice", unit: "g", stockQty: 500 },
} as const;

type Fixture = {
  id: string;
  name: string;
  price: string;
  barcode: string | null;
  stockQty: number;
  isAvailable: boolean;
  tracking: "unit" | "recipe";
  recipe: readonly (readonly [keyof typeof RAW_MATERIALS, number])[];
};

export const PRODUCTS = {
  sisig: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Sizzling Sisig",
    price: "185.00",
    barcode: "4800000000011",
    stockQty: 20,
    isAvailable: true,
    tracking: "unit",
    recipe: [],
  },
  calamares: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Sizzling Calamares",
    price: "195.00",
    barcode: null,
    stockQty: 0,
    isAvailable: false,
    tracking: "unit",
    recipe: [],
  },
  // Recipe-tracked: one serving uses 150 g pork and 200 g rice, so the seeded stock
  // (1000 g pork, 500 g rice) makes 2 servings; rice runs out first.
  riceBowl: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Test Sisig Rice Bowl",
    price: "150.00",
    barcode: null,
    stockQty: 0,
    isAvailable: true,
    tracking: "recipe",
    recipe: [
      ["pork", 150],
      ["rice", 200],
    ],
  },
  icedTea: {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Test Iced Tea",
    price: "45.00",
    barcode: "4800000000044",
    stockQty: 5,
    isAvailable: true,
    tracking: "unit",
    recipe: [],
  },
  // Used only by orders.test.ts, so its stock changes don't affect other files.
  water: {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Test Bottled Water",
    price: "25.00",
    barcode: null,
    stockQty: 50,
    isAvailable: true,
    tracking: "unit",
    recipe: [],
  },
  // Used only by online-payment.test.ts.
  soda: {
    id: "66666666-6666-4666-8666-666666666666",
    name: "Test Soda",
    price: "40.00",
    barcode: null,
    stockQty: 10,
    isAvailable: true,
    tracking: "unit",
    recipe: [],
  },
} as const satisfies Record<string, Fixture>;
