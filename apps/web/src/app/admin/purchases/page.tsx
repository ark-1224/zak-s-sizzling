"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { AdmButton, PageHeader } from "@/components/admin/ui";
import { PurchaseForm, type PrefillLine } from "@/components/admin/purchasing/PurchaseForm";
import { PriceHistoryView, PurchaseListView, ShoppingListView } from "@/components/admin/purchasing/PurchasingViews";
import { peso } from "@/lib/market";
import type { StockItemDTO } from "@zaks/shared-types";

// Market purchases (Administrator): the shop restocks at the palengke about every two
// weeks, with small top-ups in between. Before the trip: the Shopping list. After it: the
// owner records each resibo (Record a purchase), which adds the stock and updates prices.
// Purchases lists the receipts (planned against bought); Price history shows each item's
// price over time. Tabs are in the address (?tab=).

type Tab = "shopping" | "purchases" | "prices";

export default function PurchasesPage() {
  return (
    <Suspense fallback={<div className="text-adm-ink-3">Loading…</div>}>
      <PurchasesContent />
    </Suspense>
  );
}

function PurchasesContent() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "purchases" || tabParam === "prices" ? tabParam : "shopping";
  const showTab = (next: Tab) => router.replace(next === "shopping" ? pathname : `${pathname}?tab=${next}`, { scroll: false });

  const [items, setItems] = useState<StockItemDTO[] | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [form, setForm] = useState<{ prefill: PrefillLine[] | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const loadItems = useCallback(async () => {
    try {
      setItems(await apiFetch<StockItemDTO[]>("/api/inventory/items", { auth: "staff" }));
      setItemsError(null);
    } catch (err) {
      setItemsError(err instanceof ApiError ? err.message : "Couldn't load the items.");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(loadItems, 0);
    return () => clearTimeout(first);
  }, [loadItems]);

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader
        eyebrow="Inventory · palengke restocking"
        title="Market purchases"
        actions={
          !form && (
            <AdmButton variant="primary" onClick={() => setForm({ prefill: null })} disabled={!items}>
              + Record a purchase
            </AdmButton>
          )
        }
      />
      {itemsError && <p className="text-base text-adm-bad md:text-sm">{itemsError}</p>}
      {message && (
        <div role="status" className="text-base text-adm-ink md:text-sm">
          {message}
        </div>
      )}

      {form && items && (
        <PurchaseForm
          items={items}
          prefill={form.prefill}
          onCancel={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null);
            setMessage(`Purchase of ${peso(saved.totalAmount)} on ${saved.purchasedOn} saved: stock and prices updated.`);
            setVersion((v) => v + 1);
            loadItems();
            showTab("purchases");
          }}
        />
      )}

      <div role="tablist" aria-label="Market purchases" className="flex flex-wrap gap-1 self-start rounded-[6px] border border-adm-line bg-adm-surface p-1">
        {(
          [
            ["shopping", "Shopping list"],
            ["purchases", "Purchases"],
            ["prices", "Price history"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => showTab(value)}
            className={`min-h-11 rounded-[4px] px-4 text-base font-medium transition-colors md:min-h-0 md:py-1.5 md:text-sm ${
              tab === value ? "bg-adm-ink text-adm-surface" : "text-adm-ink-2 hover:bg-adm-bg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "purchases" ? (
        <PurchaseListView version={version} />
      ) : tab === "prices" ? (
        items && <PriceHistoryView items={items} />
      ) : (
        <ShoppingListView key={version} onRecord={(prefill) => setForm({ prefill })} />
      )}
    </div>
  );
}
