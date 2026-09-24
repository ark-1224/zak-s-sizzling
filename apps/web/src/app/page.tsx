"use client";

import { useEffect, useMemo, useState } from "react";
import { useCatalog } from "@/hooks/useCatalog";
import { useCart } from "@/hooks/useCart";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { ensureKioskSession } from "@/lib/auth";
import { Header } from "@/components/kiosk/Header";
import { CategoryRail } from "@/components/kiosk/CategoryRail";
import { ProductGrid } from "@/components/kiosk/ProductGrid";
import { ProductModal } from "@/components/kiosk/ProductModal";
import { CartDrawer } from "@/components/kiosk/CartDrawer";
import { MobileCartBar } from "@/components/kiosk/MobileCartBar";
import { IdleTimeoutOverlay } from "@/components/kiosk/IdleTimeoutOverlay";

// Kiosk home ("/"). Ported/composed from kiosk.html's #app shell (Downloads/kiosk.html,
// lines 365-395). getFilteredProducts() from kiosk.html becomes the useMemo below.
// Sprint 3: checkout/payment moved to its own /checkout page — this page only manages
// browsing, the cart drawer, and the idle-timeout session reset.
export default function KioskHomePage() {
  const { categories, products, loading, error } = useCatalog();
  const { clearCart } = useCart();

  const [activeCategory, setActiveCategory] = useState<number | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  // Anonymous kiosk session — correlates this device's cart/orders and the idle timeout.
  useEffect(() => {
    ensureKioskSession().catch(() => {
      // Non-fatal: checkout will surface an error toast if the session couldn't be created.
    });
  }, []);

  function resetKioskSession() {
    clearCart();
    setCartOpen(false);
    setOpenProductId(null);
    setSearchQuery("");
    setActiveCategory("all");
  }

  const { showWarning, stayActive } = useIdleTimer({ onReset: resetKioskSession });

  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        const matchesCategory = activeCategory === "all" || p.categoryId === activeCategory;
        const matchesSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => Number(!a.isAvailable) - Number(!b.isAvailable)); // sold-out items last; Array.sort is stable, so order is otherwise unchanged
  }, [products, activeCategory, searchQuery]);

  const activeCategoryObj = categories.find((c) => c.id === activeCategory);
  const title = activeCategory === "all" ? "All items" : (activeCategoryObj?.name ?? "");
  const subtitle = searchQuery
    ? `Results for "${searchQuery}"`
    : "Tap an item to see details and customize your order.";

  const openProduct = products.find((p) => p.id === openProductId);

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-ink-soft">Loading menu…</div>;
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center text-berry">
        Could not reach the kitchen — {error}
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} onOpenCart={() => setCartOpen(true)} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <CategoryRail categories={categories} activeCategory={activeCategory} onSelect={setActiveCategory} />
        <ProductGrid
          title={title}
          subtitle={subtitle}
          products={filteredProducts}
          onOpenProduct={setOpenProductId}
        />
      </div>
      {openProduct && <ProductModal product={openProduct} onClose={() => setOpenProductId(null)} />}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
      <MobileCartBar onOpenCart={() => setCartOpen(true)} />
      <IdleTimeoutOverlay show={showWarning} onStayActive={stayActive} />
    </div>
  );
}
