"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { getStoredUser } from "@/lib/auth";
import { getSocket } from "@/lib/websocket";
import { formatMaterialQty } from "@/lib/units";
import { RAW_MATERIAL_CATEGORIES, RAW_MATERIAL_CATEGORY_LABEL } from "@/lib/rawMaterialCategories";
import { PageHeader, Card, AdmButton, StatusPill, admInputClass, admLabelClass } from "@/components/admin/ui";
import { SuccessMessage, useSuccessMessage } from "@/components/admin/SuccessMessage";
import { AdjustStockModal, REASON_LABELS } from "@/components/admin/AdjustStockModal";
import { RawMaterialAdjustModal } from "@/components/admin/RawMaterialAdjustModal";
import { RawMaterialForm } from "@/components/admin/RawMaterialForm";
import { RawMaterialNutritionModal } from "@/components/admin/RawMaterialNutritionModal";
import type { Product, RawMaterialCategory, RawMaterialDTO, StockMovementDTO } from "@zaks/shared-types";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function status(m: RawMaterialDTO): { tone: "ok" | "warn" | "bad"; label: string } {
  if (m.stockQty <= 0) return { tone: "bad", label: "OUT" };
  if (m.isLow) return { tone: "warn", label: "LOW" };
  return { tone: "ok", label: "OK" };
}

function movementLabel(m: StockMovementDTO) {
  if (m.type === "sale") return m.orderNumber ? `Sale · ${m.orderNumber}` : "Sale";
  if (m.reason) return REASON_LABELS[m.reason];
  return m.type === "restock" ? "Restock" : "Adjustment";
}

type Filter = "all" | "low" | "out";
type Tab = "materials" | "dishes" | "ready-made" | "movements";

const FILTER_LABELS: Record<Filter, string> = { all: "All", low: "Needs restock", out: "Out of stock" };

/** Items in the built-in Ready-made category: sold as they are and counted in pieces. */
const isReadyMade = (p: Product) => p.category?.isReadyMade === true;
const readyMadeIsLow = (p: Product) => (p.stockQty ?? 0) <= (p.minStockThreshold ?? 0);

function pieceStatus(p: Product): { tone: "ok" | "warn" | "bad"; label: string } {
  if ((p.stockQty ?? 0) <= 0) return { tone: "bad", label: "OUT" };
  if (readyMadeIsLow(p)) return { tone: "warn", label: "LOW" };
  return { tone: "ok", label: "OK" };
}

const pieces = (n: number) => `${n} pc${n !== 1 ? "s" : ""}`;

/** All / Needs restock / Out of stock, with how many each shows. */
function FilterChips({
  filter,
  counts,
  onChange,
  explain,
}: {
  filter: Filter;
  counts: Record<Filter, number>;
  onChange: (filter: Filter) => void;
  explain: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show">
      {(["all", "low", "out"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={filter === value}
          onClick={() => onChange(value)}
          className={`min-h-11 rounded-full border px-3.5 text-base md:min-h-8 md:text-sm ${
            filter === value ? "border-adm-ink bg-adm-ink text-adm-surface" : "border-adm-line bg-adm-surface text-adm-ink-2"
          }`}
        >
          {FILTER_LABELS[value]} <span className="font-adm-mono">({counts[value]})</span>
        </button>
      ))}
      {filter !== "all" && <span className="text-base text-adm-ink-3 md:text-sm">{explain}</span>}
    </div>
  );
}

// The whole inventory (panel feedback: every dish is made from a bill of materials, so
// stock lives in raw materials; docs/design/raw-material-stock.md, Objective 3).
// - Raw materials: what's on hand and what's running low, found by name (search) and
//   category. ?filter=low (at or below minimum) or ?filter=out (none left), which the
//   dashboard links to.
// - Dishes (?tab=dishes): the servings each dish's recipe can make from that stock, and
//   the raw material that limits it. This replaced the separate Inventory page.
// - Ready-made (?tab=ready-made): items sold as they are (bottled drinks), which have no
//   recipe and are counted in pieces. Same filters, restocked with Adjust stock.
// - Stock movements (?tab=movements): one log of every stock change, for raw materials and
//   ready-made items together (sales, restocks, adjustments, cancelled orders put back),
//   filtered by item, kind of change and dates.
// Staff restock and adjust here; adding or editing raw materials is Administrator-only.
export default function AdminRawMaterialsPage() {
  // useSearchParams needs a Suspense boundary, so the page can still be prerendered.
  return (
    <Suspense fallback={<div className="text-adm-ink-3">Loading…</div>}>
      <RawMaterialsContent />
    </Suspense>
  );
}

function RawMaterialsContent() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "dishes" || tabParam === "ready-made" || tabParam === "movements" ? tabParam : "materials";
  const filterParam = params.get("filter");
  const filter: Filter = filterParam === "low" || filterParam === "out" ? filterParam : "all";

  // The tab and filter live in the address, so the dashboard can link straight to them.
  function navigate(next: { tab?: Tab; filter?: Filter }) {
    const query = new URLSearchParams();
    const nextTab = next.tab ?? tab;
    const nextFilter = next.tab === "dishes" || next.tab === "movements" ? "all" : (next.filter ?? filter);
    if (nextTab !== "materials") query.set("tab", nextTab);
    if (nextFilter !== "all") query.set("filter", nextFilter);
    const qs = query.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const [materials, setMaterials] = useState<RawMaterialDTO[]>([]);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<RawMaterialDTO | null>(null);
  const [editing, setEditing] = useState<RawMaterialDTO | "new" | null>(null);
  const [nutritionOf, setNutritionOf] = useState<RawMaterialDTO | null>(null);
  const success = useSuccessMessage();
  const [isAdmin] = useState(() => getStoredUser()?.role === "admin");
  // Finding a raw material: by name, and by category.
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<RawMaterialCategory | "all">("all");

  // Bumped to refetch after a save or a live update. Each effect ignores the response
  // of a request it has since replaced, so a slow older response can't overwrite a newer one.
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    let cancelled = false;
    apiFetch<RawMaterialDTO[]>("/api/raw-materials", { auth: "staff" })
      .then((result) => {
        if (!cancelled) setMaterials(result);
      })
      .catch((err) => {
        if (!cancelled) setMessage(err instanceof ApiError ? err.message : "Could not load raw materials.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  // Dishes (for their servings) and the ready-made items (for their pieces).
  useEffect(() => {
    let cancelled = false;
    apiFetch<Product[]>("/api/products")
      .then((result) => {
        if (!cancelled) {
          setProducts(result);
          setProductsError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setProductsError(err instanceof ApiError ? err.message : "Could not load the products.");
      });
    return () => {
      cancelled = true;
    };
  }, [version]);


  // A sale or another session's adjustment changes stock: the public inventory:updated
  // event is used only as a "something changed" signal, then the staff-only data is refetched.
  useEffect(() => {
    const socket = getSocket();
    const handleUpdate = () => setVersion((v) => v + 1);
    socket.on("inventory:updated", handleUpdate);
    return () => {
      socket.off("inventory:updated", handleUpdate);
    };
  }, []);

  function handleAdjusted(updated: RawMaterialDTO) {
    success.show(`${updated.name}: ${formatMaterialQty(adjusting?.stockQty ?? 0, updated.unit)} → ${formatMaterialQty(updated.stockQty, updated.unit)}`);
    setAdjusting(null);
    refresh();
  }

  function handleNutritionSaved(saved: RawMaterialDTO) {
    success.show(saved.nutrition ? `${saved.name}: nutrition saved` : `${saved.name}: nutrition removed`);
    setNutritionOf(null);
    refresh();
  }

  function handleRemoved(removed: RawMaterialDTO) {
    success.show(`${removed.name} removed`);
    setEditing(null);
    refresh();
  }

  function handleSaved(saved: RawMaterialDTO, created: boolean) {
    success.show(created ? `${saved.name} added` : `${saved.name} saved`);
    setEditing(null);
    refresh();
  }

  // Every raw material at or below its minimum, for the warning, whatever is searched.
  const lowAll = materials.filter((m) => m.isActive && m.isLow);
  const q = search.trim().toLowerCase();
  const narrowed = q !== "" || category !== "all";
  const matching = materials.filter((m) => (category === "all" || m.category === category) && (q === "" || m.name.toLowerCase().includes(q)));
  const low = matching.filter((m) => m.isActive && m.isLow);
  const out = matching.filter((m) => m.isActive && m.stockQty <= 0);
  const shown = filter === "low" ? low : filter === "out" ? out : matching;
  const clearSearch = () => {
    setSearch("");
    setCategory("all");
  };
  const readyMade = (products ?? []).filter(isReadyMade);
  const readyMadeMatching = filter === "low" ? readyMade.filter(readyMadeIsLow) : filter === "out" ? readyMade.filter((p) => (p.stockQty ?? 0) <= 0) : [];

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader
        eyebrow="Inventory · bill of materials"
        title="Raw materials"
        actions={
          isAdmin && (
            <AdmButton variant="primary" onClick={() => setEditing("new")}>
              + Add raw material
            </AdmButton>
          )
        }
      />

      <SuccessMessage text={success.text} onDismiss={success.clear} />
      {message && <div className="text-base text-adm-bad md:text-sm">{message}</div>}

      <div role="tablist" aria-label="Inventory view" className="flex gap-1 self-start rounded-[6px] border border-adm-line bg-adm-surface p-1">
        {(
          [
            ["materials", "Raw materials"],
            ["dishes", "Dishes (servings)"],
            ["ready-made", "Ready-made (pieces)"],
            ["movements", "Stock movements"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => navigate({ tab: value })}
            className={`min-h-11 rounded-[4px] px-4 text-base font-medium transition-colors md:min-h-0 md:py-1.5 md:text-sm ${
              tab === value ? "bg-adm-ink text-adm-surface" : "text-adm-ink-2 hover:bg-adm-bg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "dishes" ? (
        <DishServings materials={materials} products={products} error={productsError} isAdmin={isAdmin} />
      ) : tab === "movements" ? (
        <StockMovements materials={materials} readyMade={readyMade} version={version} />
      ) : tab === "ready-made" ? (
        <ReadyMadeStock
          items={products && readyMade}
          error={productsError}
          filter={filter}
          isAdmin={isAdmin}
          onFilter={(next) => navigate({ filter: next })}
          onAdjusted={(before, after) => {
            success.show(`${after.name}: ${pieces(before.stockQty ?? 0)} → ${pieces(after.stockQty ?? 0)}`);
            refresh();
          }}
        />
      ) : (
      <>
      {lowAll.length > 0 && filter === "all" && !narrowed && (
        <div className="rounded-[6px] border border-adm-warn bg-adm-warn-soft p-4">
          <div className="mb-1 font-medium text-adm-ink">
            {lowAll.length} raw material{lowAll.length !== 1 ? "s" : ""} at or below minimum level
          </div>
          <div className="text-base break-words text-adm-ink-2 md:text-sm">
            {lowAll.map((m) => `${m.name} (${formatMaterialQty(m.stockQty, m.unit)} left)`).join(", ")}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center" role="search" aria-label="Find raw materials">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search raw materials"
          aria-label="Search raw materials by name"
          className={`sm:max-w-72 ${admInputClass}`}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as RawMaterialCategory | "all")}
          aria-label="Category"
          className={`sm:w-auto ${admInputClass}`}
        >
          <option value="all">All categories</option>
          {RAW_MATERIAL_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label} ({materials.filter((m) => m.category === c.value).length})
            </option>
          ))}
        </select>
        {narrowed && (
          <AdmButton variant="secondary" onClick={clearSearch}>
            Clear
          </AdmButton>
        )}
      </div>

      <FilterChips
        filter={filter}
        counts={{ all: matching.length, low: low.length, out: out.length }}
        onChange={(next) => navigate({ filter: next })}
        explain={`Raw materials in use ${filter === "low" ? "at or below their minimum level" : "with none left"}.`}
      />

      {readyMadeMatching.length > 0 && (
        <div className="text-base text-adm-ink-2 md:text-sm">
          Also {readyMadeMatching.length} ready-made item{readyMadeMatching.length !== 1 ? "s" : ""}{" "}
          {filter === "low" ? "at or below minimum" : "with none left"}:{" "}
          <button type="button" onClick={() => navigate({ tab: "ready-made" })} className="text-adm-ink underline underline-offset-2">
            {readyMadeMatching.map((p) => p.name).join(", ")}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-adm-ink-3">Loading…</div>
      ) : narrowed && shown.length === 0 && materials.length > 0 ? (
        <Card>
          <div className="p-4 text-base text-adm-ink-3 md:text-sm">
            No raw material {q ? <>matches &ldquo;{search.trim()}&rdquo;</> : "is in this category"}
            {filter !== "all" ? (filter === "low" ? " and needs restocking" : " and has run out") : ""}.{" "}
            <button type="button" onClick={clearSearch} className="text-adm-ink underline underline-offset-2">
              Clear the search
            </button>
          </div>
        </Card>
      ) : filter !== "all" && shown.length === 0 ? (
        <Card>
          <div className="p-4 text-base text-adm-ink-3 md:text-sm">
            {filter === "low" ? "Nothing needs restocking right now." : "No raw material in use has run out."}{" "}
            <button type="button" onClick={() => navigate({ filter: "all" })} className="text-adm-ink underline underline-offset-2">
              Show all
            </button>
          </div>
        </Card>
      ) : materials.length === 0 ? (
        <Card>
          <div className="p-4 text-base text-adm-ink-3 md:text-sm">
            No raw materials yet.{isAdmin ? " Add one, then give a dish a recipe from the Products page." : ""}
          </div>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-adm-line-soft md:hidden">
            {shown.map((m) => {
              const s = status(m);
              return (
                <li key={m.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${m.isActive ? "" : "opacity-60"}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-base font-medium break-words">
                      {m.name} <StatusPill tone={s.tone}>{s.label}</StatusPill>
                    </div>
                    <div className="text-sm text-adm-ink-3">{RAW_MATERIAL_CATEGORY_LABEL[m.category]}</div>
                    <div className="font-adm-mono text-sm text-adm-ink-3">
                      <span className="font-bold text-adm-ink">{formatMaterialQty(m.stockQty, m.unit)}</span> · min{" "}
                      {formatMaterialQty(m.minStockThreshold, m.unit)}
                    </div>
                    {m.usedBy.length > 0 && <div className="text-sm break-words text-adm-ink-3">Used in {m.usedBy.map((u) => u.productName).join(", ")}</div>}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <AdmButton variant="secondary" onClick={() => setAdjusting(m)} aria-label={`Adjust ${m.name}`}>
                      Adjust
                    </AdmButton>
                    {isAdmin && (
                      <AdmButton variant="secondary" onClick={() => setEditing(m)} aria-label={`Edit ${m.name}`}>
                        Edit
                      </AdmButton>
                    )}
                    {isAdmin && (
                      <AdmButton variant="secondary" onClick={() => setNutritionOf(m)} aria-label={`Nutrition of ${m.name}`}>
                        Nutrition{m.nutrition ? " ✓" : ""}
                      </AdmButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
                  <th className="px-4.5 py-2.75 font-medium">Raw material</th>
                  <th className="px-3 py-2.75 text-right font-medium">On hand</th>
                  <th className="px-3 py-2.75 text-right font-medium">Min</th>
                  <th className="px-3 py-2.75 font-medium">Status</th>
                  <th className="px-3 py-2.75 font-medium">Used in</th>
                  <th className="px-4.5 py-2.75 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => {
                  const s = status(m);
                  return (
                    <tr key={m.id} className={`border-t border-adm-line-soft ${m.isActive ? "" : "opacity-60"}`}>
                      <td className="px-4.5 py-3 font-medium">
                        {m.name}
                        {!m.isActive && <span className="ml-2 text-xs font-normal text-adm-ink-3">(not in use)</span>}
                        <div className="text-xs font-normal text-adm-ink-3">{RAW_MATERIAL_CATEGORY_LABEL[m.category]}</div>
                      </td>
                      <td className={`font-adm-mono px-3 py-3 text-right font-bold whitespace-nowrap ${s.tone === "ok" ? "" : "text-adm-bad"}`}>
                        {formatMaterialQty(m.stockQty, m.unit)}
                      </td>
                      <td className="font-adm-mono px-3 py-3 text-right whitespace-nowrap text-adm-ink-3">
                        {formatMaterialQty(m.minStockThreshold, m.unit)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill tone={s.tone}>{s.label}</StatusPill>
                      </td>
                      <td className="max-w-64 px-3 py-3 text-adm-ink-2">
                        {m.usedBy.length === 0 ? (
                          <span className="text-adm-ink-3">—</span>
                        ) : (
                          m.usedBy.map((u) => `${u.productName} (${formatMaterialQty(u.qtyPerServing, m.unit)})`).join(", ")
                        )}
                      </td>
                      <td className="px-4.5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex gap-2">
                          <AdmButton variant="secondary" size="row" onClick={() => setAdjusting(m)} aria-label={`Adjust ${m.name}`}>
                            Adjust
                          </AdmButton>
                          {isAdmin && (
                            <AdmButton variant="secondary" size="row" onClick={() => setEditing(m)} aria-label={`Edit ${m.name}`}>
                              Edit
                            </AdmButton>
                          )}
                          {isAdmin && (
                            <AdmButton
                              variant="secondary"
                              size="row"
                              onClick={() => setNutritionOf(m)}
                              aria-label={`Nutrition of ${m.name}`}
                              title={m.nutrition ? `Per 100 g: ${m.nutrition.per100g.calories} kcal` : "No nutrition yet"}
                            >
                              Nutrition{m.nutrition ? " ✓" : ""}
                            </AdmButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      </>
      )}

      {adjusting && <RawMaterialAdjustModal material={adjusting} onClose={() => setAdjusting(null)} onSaved={handleAdjusted} />}
      {editing && <RawMaterialForm material={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={handleSaved} onRemoved={handleRemoved} />}
      {nutritionOf && <RawMaterialNutritionModal material={nutritionOf} onClose={() => setNutritionOf(null)} onSaved={handleNutritionSaved} />}
    </div>
  );
}

/**
 * Servings each dish can make from the raw materials on hand: for every ingredient, the
 * stock divided by the amount one serving uses, and the smallest of those (the
 * ingredient that runs out first limits the dish). Built from the raw materials' "used
 * in" lists, so staff see it too (the recipes themselves are admin-only on products).
 */
function DishServings({
  materials,
  products,
  error,
  isAdmin,
}: {
  materials: RawMaterialDTO[];
  products: Product[] | null;
  error: string | null;
  isAdmin: boolean;
}) {
  if (error) return <div className="text-base text-adm-bad md:text-sm">{error}</div>;
  if (!products) return <div className="text-adm-ink-3">Loading…</div>;

  // Ready-made items have no recipe; they're on the Ready-made tab.
  const rows = products
    .filter((p) => !isReadyMade(p))
    .map((p) => {
      const lines = materials.flatMap((m) =>
        m.usedBy
          .filter((u) => u.productId === p.id)
          .map((u) => ({ material: m, servings: u.qtyPerServing > 0 ? Math.floor(m.stockQty / u.qtyPerServing) : 0 }))
      );
      const limiting = lines.length ? lines.reduce((a, b) => (b.servings < a.servings ? b : a)) : null;
      return { product: p, lines, limiting, servings: limiting ? limiting.servings : 0 };
    })
    .sort((a, b) => a.servings - b.servings || a.product.name.localeCompare(b.product.name));

  return (
    <Card>
      <p className="border-b border-adm-line-soft px-4 py-3 text-base text-adm-ink-2 md:px-4.5 md:text-sm">
        A dish has no stock of its own: it can be made as long as every raw material in its recipe has enough for a serving. Restock
        the limiting raw material to make more.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-base md:text-sm">
          <thead>
            <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
              <th className="px-4.5 py-2.75 font-medium">Dish</th>
              <th className="px-3 py-2.75 text-right font-medium">Servings</th>
              <th className="px-3 py-2.75 font-medium">Limited by</th>
              <th className="px-4.5 py-2.75 font-medium">Recipe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ product, lines, limiting, servings }) => (
              <tr key={product.id} className="border-t border-adm-line-soft align-top">
                <td className="px-4.5 py-3 font-medium">
                  {product.name}
                  <div className="text-sm font-normal text-adm-ink-3">{product.category?.name}</div>
                </td>
                <td className="font-adm-mono px-3 py-3 text-right whitespace-nowrap">
                  {lines.length === 0 ? (
                    <StatusPill tone="bad">NO RECIPE</StatusPill>
                  ) : (
                    <span className={`font-bold ${servings > 0 ? "text-adm-ink" : "text-adm-bad"}`}>{servings}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-adm-ink-2">
                  {limiting ? (
                    <>
                      {limiting.material.name}{" "}
                      <span className="font-adm-mono text-adm-ink-3">({formatMaterialQty(limiting.material.stockQty, limiting.material.unit)} left)</span>
                    </>
                  ) : isAdmin ? (
                    <Link href="/admin/products" className="text-adm-ink underline underline-offset-2">
                      Add its recipe in Products
                    </Link>
                  ) : (
                    <span className="text-adm-ink-3">Ask an administrator to add its recipe</span>
                  )}
                </td>
                <td className="max-w-80 px-4.5 py-3 text-adm-ink-3">
                  {lines.length === 0
                    ? "—"
                    : lines.map((l) => `${l.material.name} ${formatMaterialQty(l.material.usedBy.find((u) => u.productId === product.id)!.qtyPerServing, l.material.unit)}`).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Ready-made items (the built-in Ready-made category, e.g. bottled drinks): sold as they
 * are, so they have no recipe and are counted in pieces. Each order takes one piece; at or
 * below the minimum the item needs restocking. Adjust stock logs who changed it and why.
 */
function ReadyMadeStock({
  items,
  error,
  filter,
  isAdmin,
  onFilter,
  onAdjusted,
}: {
  items: Product[] | null;
  error: string | null;
  filter: Filter;
  isAdmin: boolean;
  onFilter: (filter: Filter) => void;
  onAdjusted: (before: Product, after: Product) => void;
}) {
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  if (error) return <div className="text-base text-adm-bad md:text-sm">{error}</div>;
  if (!items) return <div className="text-adm-ink-3">Loading…</div>;

  const low = items.filter(readyMadeIsLow);
  const out = items.filter((p) => (p.stockQty ?? 0) <= 0);
  const shown = filter === "low" ? low : filter === "out" ? out : items;

  return (
    <>
      <FilterChips
        filter={filter}
        counts={{ all: items.length, low: low.length, out: out.length }}
        onChange={onFilter}
        explain={`Ready-made items ${filter === "low" ? "at or below their minimum" : "with none left"}.`}
      />

      <Card>
        <p className="border-b border-adm-line-soft px-4 py-3 text-base text-adm-ink-2 md:px-4.5 md:text-sm">
          Sold as they are, so they have no recipe: each order takes one piece, and the item shows as sold out at 0.
          {isAdmin && " Add one on the Products page in the Ready-made category."}
        </p>
        {items.length === 0 ? (
          <div className="p-4 text-base text-adm-ink-3 md:text-sm">
            No ready-made items yet.{isAdmin ? " Put a product in the Ready-made category on the Products page." : ""}
          </div>
        ) : shown.length === 0 ? (
          <div className="p-4 text-base text-adm-ink-3 md:text-sm">
            {filter === "low" ? "No ready-made item needs restocking right now." : "No ready-made item has run out."}{" "}
            <button type="button" onClick={() => onFilter("all")} className="text-adm-ink underline underline-offset-2">
              Show all
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-base md:text-sm">
              <thead>
                <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
                  <th className="px-4.5 py-2.75 font-medium">Item</th>
                  <th className="px-3 py-2.75 text-right font-medium">On hand</th>
                  <th className="px-3 py-2.75 text-right font-medium">Min</th>
                  <th className="px-3 py-2.75 font-medium">Status</th>
                  <th className="px-4.5 py-2.75 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const st = pieceStatus(p);
                  return (
                    <tr key={p.id} className="border-t border-adm-line-soft">
                      <td className="px-4.5 py-3 font-medium">
                        <span aria-hidden="true" className="mr-1.5">
                          {p.icon}
                        </span>
                        {p.name}
                      </td>
                      <td className={`font-adm-mono px-3 py-3 text-right font-bold whitespace-nowrap ${st.tone === "ok" ? "" : "text-adm-bad"}`}>
                        {pieces(p.stockQty ?? 0)}
                      </td>
                      <td className="font-adm-mono px-3 py-3 text-right whitespace-nowrap text-adm-ink-3">{pieces(p.minStockThreshold ?? 0)}</td>
                      <td className="px-3 py-3">
                        <StatusPill tone={st.tone}>{st.label}</StatusPill>
                      </td>
                      <td className="px-4.5 py-3 text-right whitespace-nowrap">
                        <AdmButton variant="secondary" size="row" onClick={() => setAdjusting(p)} aria-label={`Adjust ${p.name}`}>
                          Adjust
                        </AdmButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {adjusting && (
        <AdjustStockModal
          product={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={(updated) => {
            onAdjusted(adjusting, updated);
            setAdjusting(null);
          }}
        />
      )}
    </>
  );
}

const TYPE_LABELS = { sale: "Sales", restock: "Restocks", adjustment: "Other adjustments" } as const;
type MovementType = keyof typeof TYPE_LABELS;

/**
 * Every stock change, newest first, for raw materials and ready-made items together:
 * sales (a dish's raw materials, a ready-made item's pieces), restocks, corrections,
 * spoilage and cancelled orders put back, each with who made it and why where recorded.
 * Filtered by kind of item, one item, kind of change and Manila dates (GET /api/inventory/movements).
 */
function StockMovements({ materials, readyMade, version }: { materials: RawMaterialDTO[]; readyMade: Product[]; version: number }) {
  const [kind, setKind] = useState<"all" | "raw_material" | "ready_made">("all");
  const [itemId, setItemId] = useState("all");
  const [type, setType] = useState<"all" | MovementType>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<StockMovementDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams();
    if (kind !== "all") query.set("kind", kind);
    if (itemId !== "all") query.set("itemId", itemId);
    if (type !== "all") query.set("type", type);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    apiFetch<StockMovementDTO[]>(`/api/inventory/movements?${query}`, { auth: "staff" })
      .then((result) => {
        if (!cancelled) {
          setRows(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load the stock movements.");
      });
    return () => {
      cancelled = true;
    };
  }, [kind, itemId, type, from, to, version]);

  const filtered = kind !== "all" || itemId !== "all" || type !== "all" || from !== "" || to !== "";
  const selectClass = `md:w-auto ${admInputClass}`;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end" role="group" aria-label="Filter stock movements">
        <label className="block">
          <span className={admLabelClass}>Show</span>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as typeof kind);
              setItemId("all");
            }}
            className={selectClass}
          >
            <option value="all">Raw materials and ready-made</option>
            <option value="raw_material">Raw materials</option>
            <option value="ready_made">Ready-made items</option>
          </select>
        </label>
        <label className="block">
          <span className={admLabelClass}>Item</span>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={selectClass}>
            <option value="all">All items</option>
            {kind !== "ready_made" && (
              <optgroup label="Raw materials">
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            )}
            {kind !== "raw_material" && readyMade.length > 0 && (
              <optgroup label="Ready-made">
                {readyMade.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label className="block">
          <span className={admLabelClass}>Change</span>
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={selectClass}>
            <option value="all">All changes</option>
            {(Object.keys(TYPE_LABELS) as MovementType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={admLabelClass}>From</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={selectClass} />
        </label>
        <label className="block">
          <span className={admLabelClass}>To</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={selectClass} />
        </label>
        {filtered && (
          <AdmButton
            variant="secondary"
            onClick={() => {
              setKind("all");
              setItemId("all");
              setType("all");
              setFrom("");
              setTo("");
            }}
          >
            Clear filters
          </AdmButton>
        )}
      </div>

      {error && <div className="text-base text-adm-bad md:text-sm">{error}</div>}

      <Card title={rows ? `${rows.length} movement${rows.length !== 1 ? "s" : ""}${rows.length >= 150 ? " (the latest 150)" : ""}` : "Stock movements"}>
        {rows === null ? (
          <div className="p-4 text-adm-ink-3">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-base text-adm-ink-3 md:text-sm">{filtered ? "No stock movement matches these filters." : "No stock movements recorded yet."}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-base md:text-sm">
              <thead>
                <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
                  <th className="px-4.5 py-2.75 font-medium">When</th>
                  <th className="px-3 py-2.75 font-medium">Item</th>
                  <th className="px-3 py-2.75 text-right font-medium">Change</th>
                  <th className="px-3 py-2.75 font-medium">Why</th>
                  <th className="px-3 py-2.75 font-medium">Note</th>
                  <th className="px-4.5 py-2.75 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-t border-adm-line-soft">
                    <td className="font-adm-mono px-4.5 py-2.75 whitespace-nowrap text-adm-ink-3">{formatTime(m.createdAt)}</td>
                    <td className="px-3 py-2.75">
                      {m.itemName}
                      {m.kind === "ready_made" && <span className="ml-1.5 text-xs text-adm-ink-3">(ready-made)</span>}
                    </td>
                    <td className="font-adm-mono px-3 py-2.75 text-right whitespace-nowrap">
                      <span className={m.delta > 0 ? "text-adm-ok" : "text-adm-bad"}>
                        {m.delta > 0 ? "+" : "−"}
                        {formatMaterialQty(Math.abs(m.delta), m.unit)}
                      </span>
                      {m.previousQty !== null && m.newQty !== null && (
                        <span className="ml-1.5 text-adm-ink-3">
                          ({formatMaterialQty(m.previousQty, m.unit)}→{formatMaterialQty(m.newQty, m.unit)})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.75 whitespace-nowrap text-adm-ink-2">{movementLabel(m)}</td>
                    <td className="max-w-50 truncate px-3 py-2.75 text-adm-ink-3" title={m.note ?? undefined}>
                      {m.note ?? "—"}
                    </td>
                    <td className="px-4.5 py-2.75 text-adm-ink-2">{m.adjustedByName ?? (m.type === "sale" ? "Sale" : "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
