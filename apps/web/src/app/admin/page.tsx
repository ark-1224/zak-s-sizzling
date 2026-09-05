"use client";

import { useEffect, useState } from "react";
import { getStoredUser, logout } from "@/lib/auth";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@zaks/shared-types";

// Placeholder admin landing page — proves the auth/RBAC round-trip end to end.
// Sprint 4/5 replace this with the real Products/Inventory/Analytics/Users modules.
export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  return (
    <div className="min-h-screen bg-cream p-8">
      <h1 className="font-display text-2xl font-semibold text-matcha-deep">Admin Dashboard</h1>
      {user && (
        <p className="mt-2 text-ink-soft">
          Signed in as <strong>{user.name}</strong> ({user.role})
        </p>
      )}
      <p className="mt-4 max-w-prose text-sm text-ink-soft">
        Product/inventory management, analytics, and user administration ship in Sprints
        4-5. This page currently only proves the Sprint 1 auth + RBAC round-trip.
      </p>
      <button
        onClick={() => {
          logout();
          router.replace("/login");
        }}
        className="mt-6 rounded-full bg-matcha px-5 py-2 text-sm font-semibold text-cream"
      >
        Log out
      </button>
    </div>
  );
}
