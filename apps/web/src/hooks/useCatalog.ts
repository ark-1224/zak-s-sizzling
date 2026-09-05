"use client";

import { useEffect, useState } from "react";
import type { Category, Product } from "@zaks/shared-types";
import { apiFetch } from "@/lib/api-client";

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

  return { categories, products, loading, error };
}
