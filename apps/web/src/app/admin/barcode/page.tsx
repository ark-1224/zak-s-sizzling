"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import { getStoredUser } from "@/lib/auth";
import { getSocket } from "@/lib/websocket";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { PageHeader, Card, AdmButton, StatusPill, admButtonClass, admInputClass } from "@/components/admin/ui";
import { AdjustStockModal } from "@/components/admin/AdjustStockModal";
import { ProductForm } from "@/components/admin/ProductForm";
import { ProductPhoto } from "@/components/kiosk/ProductPhoto";
import { SuccessMessage, useSuccessMessage } from "@/components/admin/SuccessMessage";
import type { Category, InventoryUpdatedEvent, Product } from "@zaks/shared-types";

// Barcode lookup (Scope, barcode-based stock identification; Sprint 4): scan a product's
// barcode, or type it, to see what it is, its price and how much is in stock, and adjust
// the stock from there. Uses GET /api/products/barcode/:code (admin and staff).
//
// A USB or Bluetooth scanner types the code and presses Enter, so a scan into the field
// submits the form. When the field isn't focused, useBarcodeScanner still catches a
// scan's fast burst of keys. After each lookup the field is cleared and focused again,
// ready for the next item.
//
// A barcode with no product says so plainly; an administrator can add the product
// straight from there with the scanned barcode filled in. Any other failure (no
// connection, server error) offers Try again with the same code. The last few lookups
// stay listed, so an item can be looked up again with one tap.
const MAX_LENGTH = 64; // products.barcode is varchar(64)
const RECENT_COUNT = 5;
const NO_CONNECTION = "The server didn't respond. Check the connection, then try again.";

type Lookup =
  | { state: "idle" }
  | { state: "loading"; code: string }
  | { state: "found"; code: string; product: Product }
  | { state: "notFound"; code: string }
  | { state: "error"; code: string; message: string };

interface RecentLookup {
  code: string;
  /** The product's name, or null when no product has this barcode. */
  name: string | null;
}

/**
 * What the reader sent, cleaned up: scanners can add control characters (a tab, or a
 * prefix some models send), and the ends may carry spaces. Returns an error message
 * instead when what's left can't be a barcode.
 */
function cleanBarcode(raw: string): { code: string } | { error: string } {
  const code = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!code) return { error: "Scan or type a barcode first." };
  if (code.length > MAX_LENGTH) return { error: `That's ${code.length} characters; a barcode has at most ${MAX_LENGTH}. Scan it again.` };
  return { code };
}

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
  const [recent, setRecent] = useState<RecentLookup[]>([]);
  // Admin only: adding a product for a barcode that wasn't found.
  const [adding, setAdding] = useState<{ barcode: string; categories: Category[] } | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const success = useSuccessMessage();

  const remember = useCallback((entry: RecentLookup) => {
    setRecent((list) => [entry, ...list.filter((r) => r.code !== entry.code)].slice(0, RECENT_COUNT));
  }, []);

  const runLookup = useCallback(
    async (raw: string) => {
      const cleaned = cleanBarcode(raw);
      if ("error" in cleaned) {
        setInputError(cleaned.error);
        inputRef.current?.focus();
        return;
      }
      const scanned = cleaned.code;
      const id = ++requestId.current; // a newer scan wins over a slower older one
      setInputError(null);
      setCode("");
      setLookup({ state: "loading", code: scanned });
      try {
        const product = await apiFetch<Product>(`/api/products/barcode/${encodeURIComponent(scanned)}`, { auth: "staff" });
        if (id !== requestId.current) return;
        setLookup({ state: "found", code: scanned, product });
        remember({ code: scanned, name: product.name });
      } catch (err) {
        if (id !== requestId.current) return;
        if (err instanceof ApiError && err.status === 404) {
          setLookup({ state: "notFound", code: scanned });
          remember({ code: scanned, name: null });
        } else {
          setLookup({ state: "error", code: scanned, message: err instanceof ApiError ? err.message : NO_CONNECTION });
        }
      } finally {
        if (id === requestId.current) inputRef.current?.focus();
      }
    },
    [remember]
  );

  // A scan while focus is elsewhere on the page. Not while a form is open: the product
  // form catches scans into its own barcode field.
  useBarcodeScanner(runLookup, adjusting === null && adding === null);

  async function startAdding(barcode: string) {
    try {
      const categories = await apiFetch<Category[]>("/api/categories");
      setAdding({ barcode, categories });
    } catch {
      setLookup({ state: "error", code: barcode, message: NO_CONNECTION });
    }
  }

  function handleAdded(saved: Product) {
    setAdding(null);
    success.show(`${saved.name} added`);
    runLookup(saved.barcode ?? "");
  }

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
          // Longer than a barcode can be, so an over-long scan is reported instead of cut short.
          maxLength={MAX_LENGTH * 2}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setInputError(null);
          }}
          placeholder="Scan or type a barcode"
          aria-invalid={inputError ? true : undefined}
          aria-describedby={inputError ? "barcode-input-error" : undefined}
          className={`font-adm-mono sm:max-w-96 ${admInputClass}`}
        />
        <AdmButton type="submit" variant="primary" disabled={!code.trim() || lookup.state === "loading"}>
          Look up
        </AdmButton>
      </form>
      {inputError && (
        <p id="barcode-input-error" className="-mt-2.5 text-base text-adm-bad md:text-sm">
          {inputError}
        </p>
      )}

      <div aria-live="polite">
        {lookup.state === "loading" && <div className="text-adm-ink-3">Looking up {lookup.code}…</div>}
        {lookup.state === "error" && (
          <div role="alert" className="flex flex-col gap-3 rounded-[6px] border border-adm-bad bg-adm-bad-soft p-4 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-base text-adm-ink md:text-sm">
              Couldn&apos;t look up <span className="font-adm-mono font-semibold [overflow-wrap:anywhere]">{lookup.code}</span>. {lookup.message}
            </p>
            <AdmButton variant="secondary" className="bg-adm-surface" onClick={() => runLookup(lookup.code)}>
              Try again
            </AdmButton>
          </div>
        )}
        {lookup.state === "notFound" && <NotFound code={lookup.code} isAdmin={isAdmin} onAdd={() => startAdding(lookup.code)} />}
        {lookup.state === "found" && (
          <ProductResult product={lookup.product} isAdmin={isAdmin} onAdjust={() => setAdjusting(lookup.product)} />
        )}
      </div>

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="font-adm-mono mb-2 text-xs tracking-[.13em] text-adm-ink-3 uppercase">
            Looked up this visit
          </h2>
          <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {recent.map((r) => (
              <li key={r.code}>
                <button
                  type="button"
                  onClick={() => runLookup(r.code)}
                  className="flex min-h-11 w-full flex-wrap items-center gap-x-2 rounded-[5px] border border-adm-line bg-adm-surface px-3 py-1.5 text-left text-base sm:w-auto md:min-h-9 md:text-sm"
                >
                  <span className="font-adm-mono [overflow-wrap:anywhere] text-adm-ink-2">{r.code}</span>
                  <span className={r.name ? "text-adm-ink" : "text-adm-bad"}>{r.name ?? "not found"}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {adding && (
        <ProductForm
          product={null}
          initialBarcode={adding.barcode}
          categories={adding.categories}
          onClose={() => {
            setAdding(null);
            inputRef.current?.focus();
          }}
          onSaved={handleAdded}
        />
      )}

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

function NotFound({ code, isAdmin, onAdd }: { code: string; isAdmin: boolean; onAdd: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-[6px] border border-adm-warn bg-adm-warn-soft p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 text-base text-adm-ink md:text-sm">
        <p>
          No product has the barcode <span className="font-adm-mono font-semibold [overflow-wrap:anywhere]">{code}</span>.
        </p>
        <p className="mt-1 text-adm-ink-2">
          {isAdmin
            ? "Check it against the number printed under the bars, or add the product with this barcode."
            : "Check it against the number printed under the bars. If it's right, ask an administrator to add the product."}
        </p>
      </div>
      {isAdmin && (
        <AdmButton variant="primary" onClick={onAdd}>
          Add product with this barcode
        </AdmButton>
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
        <span className="h-16 w-16 shrink-0 overflow-hidden rounded-[6px] bg-adm-bg">
          <ProductPhoto imageUrl={product.imageUrl} icon={product.icon} iconClassName="text-4xl" eager />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight break-words">{product.name}</h2>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            {!product.isAvailable && qty > 0 && <StatusPill tone="warn">NOT ON THE KIOSK</StatusPill>}
          </div>
          <div className="mt-0.5 text-base text-adm-ink-3 md:text-sm">
            {product.category?.name} · <span className="font-adm-mono [overflow-wrap:anywhere]">{product.barcode}</span>
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
