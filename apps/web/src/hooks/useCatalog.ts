"use client";

import { useEffect, useState } from "react";
import type { Category, InventoryUpdatedEvent, Product } from "@zaks/shared-types";
import { apiFetch } from "@/lib/api-client";
import { getSocket } from "@/lib/websocket";

export function useCatalog() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([apiFetch<Category[]>("/api/categories"), apiFetch<Product[]>("/api/products")])
      .then(([cats, prods]) => {
        if (cancelled) return;
        setCategories(cats);
        setProducts(prods);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Sprint 4: live stock/availability updates replace kiosk.html's refreshInventory()
  // stub — an admin adjustment or a paid order deducting stock now patches the grid
  // in place, without the kiosk needing to refetch or refresh.
  useEffect(() => {
    const socket = getSocket();
    function handleInventoryUpdate(payload: InventoryUpdatedEvent) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === payload.productId ? { ...p, isAvailable: payload.isAvailable, stockQty: payload.stockQty } : p
        )
      );
    }
    // The Administrator added, renamed, reordered or deleted a category: reload the rail.
    function handleCategoriesChanged() {
      apiFetch<Category[]>("/api/categories")
        .then(setCategories)
        .catch(() => {}); // keep the current rail; the next change or a reload tries again
    }
    socket.on("inventory:updated", handleInventoryUpdate);
    socket.on("categories:changed", handleCategoriesChanged);
    return () => {
      socket.off("inventory:updated", handleInventoryUpdate);
      socket.off("categories:changed", handleCategoriesChanged);
    };
  }, []);

  return { categories, products, loading, error };
}
