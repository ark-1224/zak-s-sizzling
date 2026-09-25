"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Product } from "@zaks/shared-types";
import { useCatalog } from "@/hooks/useCatalog";
import { useCart } from "@/hooks/useCart";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import { ensureKioskSession } from "@/lib/auth";
import { Header } from "@/components/kiosk/Header";
import { CategoryRail } from "@/components/kiosk/CategoryRail";
import { MenuList, MenuSkeleton, type MenuSection } from "@/components/kiosk/MenuList";
import { ProductModal } from "@/components/kiosk/ProductModal";
import { CartDrawer } from "@/components/kiosk/CartDrawer";
import { BasketBar } from "@/components/kiosk/BasketBar";
import { IdleTimeoutOverlay } from "@/components/kiosk/IdleTimeoutOverlay";
import { useToast } from "@/components/kiosk/Toast";

// Kiosk home ("/"). Ported/composed from kiosk.html's #app shell (Downloads/kiosk.html,
// lines 365-395). Sprint 3: checkout/payment moved to its own /checkout page — this page
// only manages browsing, the cart drawer, and the idle-timeout session reset.
//
// Delivery-app layout: the whole menu is one scrolling list grouped into category
// sections, and the category rail scrolls to a section instead of filtering to it.
export default function KioskHomePage() {
  const { categories, products, loading, error } = useCatalog();
  const { addToCart, clearCart } = useCart();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  // Anonymous kiosk session — correlates this device's cart/orders and the idle timeout.
  useEffect(() => {
    ensureKioskSession().catch(() => {
      // Non-fatal: checkout will surface an error toast if the session couldn't be created.
    });
  }, []);

  // Same search match and "sold-out items last" ordering as before; the only change is
  // that results are grouped by category (in the API's sortOrder) instead of flattened.
  const sections = useMemo<MenuSection[]>(() => {
    return categories
      .map((category) => ({
        category,
        products: products
          .filter((p) => p.categoryId === category.id)
          .filter((p) => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
          .sort((a, b) => Number(!a.isAvailable) - Number(!b.isAvailable)), // stable sort: order otherwise unchanged
      }))
      .filter((section) => section.products.length > 0);
  }, [categories, products, searchQuery]);

  const sectionIds = useMemo(() => sections.map((s) => String(s.category.id)), [sections]);
  const { containerRef, activeId, scrollToId, scrollToTop } = useScrollSpy(sectionIds);

  // Categories with nothing to show (no search matches, or no products at all) can't be
  // scrolled to, so the rail dims them.
  const disabledCategoryIds = useMemo(
    () => new Set(categories.filter((c) => !sectionIds.includes(String(c.id))).map((c) => c.id)),
    [categories, sectionIds]
  );

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    scrollToTop();
  }

  function handleQuickAdd(product: Product) {
    addToCart(product, 1, "");
    showToast(`Added 1 × ${product.name} to your order`);
  }

  const closeProduct = useCallback(() => setOpenProductId(null), []);

  function resetKioskSession() {
    clearCart();
    setCartOpen(false);
    setOpenProductId(null);
    setSearchQuery("");
    scrollToTop();
  }

  const { showWarning, stayActive } = useIdleTimer({ onReset: resetKioskSession });

  const openProduct = products.find((p) => p.id === openProductId);

  if (error) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <span aria-hidden="true" className="text-5xl">
          🔌
        </span>
        <p className="font-display text-2xl text-matcha-deep">We couldn&apos;t load the menu</p>
        <p className="max-w-md text-base text-ink-soft">Please try again, or ask our staff for help. ({error})</p>
        <button
          onClick={() => window.location.reload()}
          className="min-h-14 rounded-full bg-matcha px-8 text-lg font-bold text-cream shadow-card"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      <Header searchQuery={searchQuery} onSearchChange={handleSearchChange} onOpenCart={() => setCartOpen(true)} />
      <div className="flex min-h-0 flex-1">
        {loading ? (
          <>
            <div className="w-16 shrink-0 border-r border-line bg-paper md:w-52 lg:w-56" />
            <MenuSkeleton />
          </>
        ) : (
          <>
            <CategoryRail
              categories={categories}
              activeCategoryId={activeId ? Number(activeId) : null}
              disabledIds={disabledCategoryIds}
              onSelect={(id) => scrollToId(String(id))}
            />
            <MenuList
              ref={containerRef}
              sections={sections}
              searchQuery={searchQuery}
              onClearSearch={() => handleSearchChange("")}
              onOpenProduct={setOpenProductId}
              onQuickAdd={handleQuickAdd}
            />
          </>
        )}
      </div>
      {openProduct && <ProductModal product={openProduct} onClose={closeProduct} />}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
      <BasketBar onOpenCart={() => setCartOpen(true)} />
      <IdleTimeoutOverlay show={showWarning} onStayActive={stayActive} />
    </div>
  );
}
