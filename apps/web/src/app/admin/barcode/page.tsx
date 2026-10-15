"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import { getStoredUser } from "@/lib/auth";
import { getSocket } from "@/lib/websocket";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { PageHeader, Card, AdmButton, StatusPill, admButtonClass, admInputClass } from "@/components/admin/ui";
import { AdjustStockModal } from "@/components/admin/AdjustStockModal";
import { SuccessMessage, useSuccessMessage } from "@/components/admin/SuccessMessage";
import type { InventoryUpdatedEvent, Product } from "@zaks/shared-types";

// Barcode lookup (Scope, barcode-based stock identification; Sprint 4): scan a product's
// barcode, or type it, to see what it is, its price and how much is in stock, and adjust
// the stock from there. Uses GET /api/products/barcode/:code (admin and staff).
//
// A USB or Bluetooth scanner types the code and presses Enter, so a scan into the field
// submits the form. When the field isn't focused, useBarcodeScanner still catches a
// scan's fast burst of keys. After each lookup the field is cleared and focused again,
// ready for the next item.
const MAX_LENGTH = 64; // products.barcode is varchar(64)

type Lookup =
  | { state: "idle" }
  | { state: "loading"; code: string }
  | { state: "found"; code: string; product: Product }
  | { state: "error"; code: string; message: string };

function stockStatus(product: Product): { tone: "ok" | "warn" | "bad"; label: string } {
  const qty = product.stockQty ?? 0;
  if (qty <= 0) return { tone: "bad", label: "OUT OF STOCK" };
  if (product.tracking === "unit" && qty <= (product.minStockThreshold ?? 0)) return { tone: "warn", label: "LOW STOCK" };
  return { tone: "ok", label: "IN STOCK" };
}

export default function BarcodeLookupPage() {
  const [isAdmin] = useState(() => getStoredUser()?.role === "admin");
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const success = useSuccessMessage();

  const runLookup = useCallback(async (raw: string) => {
    const scanned = raw.trim();
    if (!scanned) return;
    const id = ++requestId.current; // a newer scan wins over a slower older one
    setCode("");
    setLookup({ state: "loading", code: scanned });
    try {
      const product = await apiFetch<Product>(`/api/products/barcode/${encodeURIComponent(scanned)}`, { auth: "staff" });
      if (id === requestId.current) setLookup({ state: "found", code: scanned, product });
    } catch (err) {
      if (id !== requestId.current) return;
      setLookup({ state: "error", code: scanned, message: err instanceof ApiError ? err.message : "Could not look up the barcode." });
    } finally {
      if (id === requestId.current) inputRef.current?.focus();
    }
  }, []);

  // A scan while focus is elsewhere on the page (not while the adjust form is open).
  useBarcodeScanner(runLookup, adjusting === null);

  // Keep the shown product's stock live, the same way the inventory page does.
  useEffect(() => {
    const socket = getSocket();
    function onInventoryUpdated(event: InventoryUpdatedEvent) {
      setLookup((current) =>
        current.state === "found" && current.product.id === event.productId
          ? { ...current, product: { ...current.product, stockQty: event.stockQty, isAvailable: event.isAvailable } }
          : current
      );
    }
    socket.on("inventory:updated", onInventoryUpdated);
    return () => {
      socket.off("inventory:updated", onInventoryUpdated);
    };
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runLookup(code);
  }

  function handleAdjusted(updated: Product) {
    setAdjusting(null);
    setLookup((current) => (current.state === "found" ? { ...current, product: { ...current.product, ...updated } } : current));
    success.show(`${updated.name}: stock is now ${updated.stockQty ?? 0}`);
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-4.5">
      <div>
        <PageHeader eyebrow="Operations" title="Barcode lookup" />
        <p className="text-base text-adm-ink-2 md:text-sm">
          Scan a product&apos;s barcode with the barcode reader, or type it and press Enter, to see its price and stock.
        </p>
      </div>

      <SuccessMessage text={success.text} onDismiss={success.clear} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="barcode-input" className="sr-only">
          Barcode
        </label>
        <input
          id="barcode-input"
          ref={inputRef}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          maxLength={MAX_LENGTH}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Scan or type a barcode"
          className={`font-adm-mono sm:max-w-96 ${admInputClass}`}
        />
        <AdmButton type="submit" variant="primary" disabled={!code.trim() || lookup.state === "loading"}>
          Look up
        </AdmButton>
      </form>

      <div aria-live="polite">
        {lookup.state === "loading" && <div className="text-adm-ink-3">Looking up {lookup.code}…</div>}
        {lookup.state === "error" && (
          <div role="alert" className="rounded-[6px] border border-adm-bad bg-adm-bad-soft p-4 text-base text-adm-ink md:text-sm">
            <span className="font-adm-mono font-semibold break-all">{lookup.code}</span>: {lookup.message}
          </div>
        )}
        {lookup.state === "found" && (
          <ProductResult product={lookup.product} isAdmin={isAdmin} onAdjust={() => setAdjusting(lookup.product)} />
        )}
      </div>

      {adjusting && (
        <AdjustStockModal
          product={adjusting}
          onClose={() => {
            setAdjusting(null);
            inputRef.current?.focus();
          }}
          onSaved={handleAdjusted}
        />
      )}
    </div>
  );
}

function ProductResult({ product, isAdmin, onAdjust }: { product: Product; isAdmin: boolean; onAdjust: () => void }) {
  const status = stockStatus(product);
  const qty = product.stockQty ?? 0;

  return (
    <Card>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start md:p-5">
        <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[6px] bg-adm-bg text-4xl">
          {product.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight break-words">{product.name}</h2>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            {!product.isAvailable && qty > 0 && <StatusPill tone="warn">NOT ON THE KIOSK</StatusPill>}
          </div>
          <div className="mt-0.5 text-base text-adm-ink-3 md:text-sm">
            {product.category?.name} · <span className="font-adm-mono break-all">{product.barcode}</span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Detail label="Price">₱{product.price.toFixed(2)}</Detail>
            {isAdmin && <Detail label="Cost">{product.cost != null ? `₱${product.cost.toFixed(2)}` : "—"}</Detail>}
            {product.tracking === "recipe" ? (
              <Detail label="Servings left">{qty}</Detail>
            ) : (
              <>
                <Detail label="In stock">{qty}</Detail>
                <Detail label="Minimum">{product.minStockThreshold ?? "—"}</Detail>
              </>
            )}
          </dl>
          {product.tracking === "recipe" && (
            <p className="mt-3 text-base text-adm-ink-2 md:text-sm">
              Made from a recipe, so its stock is the servings its raw materials can still make.
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {product.tracking === "recipe" ? (
            <Link href="/admin/raw-materials" className={admButtonClass({ variant: "secondary" })}>
              Raw materials
            </Link>
          ) : (
            <AdmButton variant="primary" onClick={onAdjust} aria-label={`Adjust stock of ${product.name}`}>
              Adjust stock
            </AdmButton>
          )}
        </div>
      </div>
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-adm-mono text-xs tracking-[.13em] text-adm-ink-3 uppercase">{label}</dt>
      <dd className="font-adm-mono mt-1 text-lg break-words">{children}</dd>
    </div>
  );
}
