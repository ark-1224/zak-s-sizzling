"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrderType, PaymentOptions, Product } from "@zaks/shared-types";
import { useCatalog } from "@/hooks/useCatalog";
import { useCart } from "@/hooks/useCart";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { ensureKioskSession } from "@/lib/auth";
import { apiFetch } from "@/lib/api-client";
import { inPriceRange, PRICE_RANGES, type PriceRangeId } from "@/lib/priceRanges";
import { WelcomeScreen } from "@/components/kiosk/WelcomeScreen";
import { OrderTypeScreen } from "@/components/kiosk/OrderTypeScreen";
import { TopBar } from "@/components/kiosk/TopBar";
import { CategoryRail } from "@/components/kiosk/CategoryRail";
import { MenuGrid, MenuGridSkeleton } from "@/components/kiosk/MenuGrid";
import { OrderBar } from "@/components/kiosk/OrderBar";
import { ProductModal } from "@/components/kiosk/ProductModal";
import { CartDrawer } from "@/components/kiosk/CartDrawer";
import { IdleTimeoutOverlay } from "@/components/kiosk/IdleTimeoutOverlay";
import { useToast } from "@/components/kiosk/Toast";

// Kiosk home ("/"), laid out like an in-store burger kiosk:
//   welcome screen → "Where will you eat today?" → menu.
// The menu sits in a dark frame: the top bar (dine in / take out, search, start over),
// the category rail on the left, and the order bar along the bottom with the order so far
// and "Review & pay". Between them, one category's dishes at a time, or the search
// results across every category, narrowed by the price chips.
//
// Going idle, or "Start over", empties the order and returns to the welcome screen for
// the next customer. A page refresh mid-order keeps the order and its dine-in / take-out
// choice (both saved on the device by useCart).
export default function KioskHomePage() {
  const { categories, products, loading, error } = useCatalog();
  const { addToCart, clearCart, orderType, setOrderType, hydrated } = useCart();
  const { showToast } = useToast();

  // Welcome → order type → menu. Choosing dine in / take out is what opens the menu, so
  // a customer who has chosen (or a refreshed page with an order in progress) skips ahead.
  const [started, setStarted] = useState(false);
  const stage = !hydrated ? null : orderType ? "menu" : started ? "choose" : "welcome";

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [priceRange, setPriceRange] = useState<PriceRangeId>("any");
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [onlinePayments, setOnlinePayments] = useState<boolean | null>(null);
  const gridRef = useRef<HTMLElement>(null);

  // Anonymous kiosk session: ties this device's orders together.
  useEffect(() => {
    ensureKioskSession().catch(() => {
      // Non-fatal: checkout shows an error if the session couldn't be created.
    });
  }, []);

  // The welcome screen only mentions GCash and Maya once online payment is really set up.
  useEffect(() => {
    let cancelled = false;
    apiFetch<PaymentOptions>("/api/payments/options")
      .then((o) => !cancelled && setOnlinePayments(o.online))
      .catch(() => !cancelled && setOnlinePayments(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryId = selectedCategoryId ?? categories.find((c) => products.some((p) => p.categoryId === c.id))?.id ?? null;
  const searching = searchQuery.trim() !== "";

  // What the grid shows before the price filter: the search results across the whole
  // menu, or the chosen category's dishes. The price chips count these.
  const scoped = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return products
      .filter((p) => (query ? p.name.toLowerCase().includes(query) : p.categoryId === categoryId))
      .sort((a, b) => Number(!a.isAvailable) - Number(!b.isAvailable)); // sold out last; stable otherwise
  }, [products, searchQuery, categoryId]);

  const shown = useMemo(() => scoped.filter((p) => inPriceRange(p.price, priceRange)), [scoped, priceRange]);

  const priceCounts = useMemo(
    () => Object.fromEntries(PRICE_RANGES.map((r) => [r.id, scoped.filter((p) => inPriceRange(p.price, r.id)).length])) as Record<PriceRangeId, number>,
    [scoped]
  );

  // Categories with nothing in the chosen price range can't be picked.
  const disabledCategoryIds = useMemo(
    () => new Set(categories.filter((c) => !products.some((p) => p.categoryId === c.id && inPriceRange(p.price, priceRange))).map((c) => c.id)),
    [categories, products, priceRange]
  );

  const featuredPhoto = useMemo(() => {
    const withPhoto = products.find((p) => p.imageUrl && p.isAvailable);
    return withPhoto?.imageUrl ? { imageUrl: withPhoto.imageUrl, name: withPhoto.name } : null;
  }, [products]);

  const scrollGridToTop = () => gridRef.current?.scrollTo({ top: 0 });

  function selectCategory(id: number) {
    setSelectedCategoryId(id);
    setSearchQuery("");
    scrollGridToTop();
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    scrollGridToTop();
  }

  function handlePriceRangeChange(id: PriceRangeId) {
    setPriceRange(id);
    scrollGridToTop();
  }

  function handleQuickAdd(product: Product) {
    addToCart(product, 1, "");
    showToast(`Added 1 × ${product.name}`);
  }

  function chooseOrderType(type: OrderType) {
    setOrderType(type);
  }

  const startOver = useCallback(() => {
    clearCart();
    setStarted(false);
    setReviewOpen(false);
    setOpenProductId(null);
    setSearchQuery("");
    setPriceRange("any");
    setSelectedCategoryId(null);
  }, [clearCart]);

  const closeProduct = useCallback(() => setOpenProductId(null), []);
  const { showWarning, stayActive } = useIdleTimer({ onReset: startOver });
  const openProduct = products.find((p) => p.id === openProductId);
  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? "Menu";

  if (error) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-char px-6 text-center text-cream">
        <p className="font-display text-3xl font-extrabold">We couldn&apos;t load the menu</p>
        <p className="max-w-md text-base text-cream/80">Please try again, or ask our staff for help. ({error})</p>
        <button onClick={() => window.location.reload()} className="min-h-14 rounded-full bg-matcha px-8 text-lg font-bold text-cream">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-char">
      {stage === "welcome" && <WelcomeScreen onStart={() => setStarted(true)} onlinePayments={onlinePayments} featuredPhoto={featuredPhoto} />}
      {stage === "choose" && <OrderTypeScreen onChoose={chooseOrderType} onStartOver={startOver} />}

      <TopBar
        orderType={orderType}
        onOrderTypeChange={setOrderType}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onStartOver={startOver}
      />
      <div className="flex min-h-0 flex-1">
        {loading ? (
          <>
            <div className="w-[84px] shrink-0 bg-char md:w-48 lg:w-52" />
            <MenuGridSkeleton />
          </>
        ) : (
          <>
            <CategoryRail
              categories={categories}
              activeCategoryId={searching ? null : categoryId}
              disabledIds={disabledCategoryIds}
              onSelect={selectCategory}
            />
            <MenuGrid
              ref={gridRef}
              title={searching ? "Search results" : categoryName}
              subtitle={searching ? `${shown.length} dish${shown.length === 1 ? "" : "es"} for “${searchQuery.trim()}”` : undefined}
              products={shown}
              priceRange={priceRange}
              priceCounts={priceCounts}
              onPriceRangeChange={handlePriceRangeChange}
              searchQuery={searchQuery.trim()}
              onClearSearch={() => handleSearchChange("")}
              onOpenProduct={setOpenProductId}
              onQuickAdd={handleQuickAdd}
            />
          </>
        )}
      </div>
      <OrderBar onReview={() => setReviewOpen(true)} />

      {openProduct && <ProductModal product={openProduct} onClose={closeProduct} />}
      <CartDrawer open={reviewOpen} onClose={() => setReviewOpen(false)} />
      <IdleTimeoutOverlay show={showWarning && stage !== "welcome"} onStayActive={stayActive} />
    </div>
  );
}
