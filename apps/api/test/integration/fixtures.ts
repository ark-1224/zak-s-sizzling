// Known records seeded into the test database by global-setup.ts. Tests import these
// instead of hard-coding values, so the seed and the assertions can't drift apart.

export const PASSWORD = "Test-Password-123";

export const USERS = {
  admin: { name: "Test Admin", email: "admin@test.local", role: "admin", isActive: true },
  staff: { name: "Test Staff", email: "staff@test.local", role: "staff", isActive: true },
  suspended: { name: "Suspended Staff", email: "suspended@test.local", role: "staff", isActive: false },
} as const;

export const CATEGORY = { name: "Sizzling Plates", icon: "🔥", sortOrder: 1 };

export const PRODUCTS = {
  sisig: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Sizzling Sisig",
    price: "185.00",
    barcode: "4800000000011",
    stockQty: 20,
    isAvailable: true,
  },
  calamares: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Sizzling Calamares",
    price: "195.00",
    barcode: null,
    stockQty: 0,
    isAvailable: false,
  },
} as const;
