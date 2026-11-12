"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { getStoredUser } from "@/lib/auth";
import { getSocket } from "@/lib/websocket";
import { formatMaterialQty } from "@/lib/units";
import { PageHeader, Card, AdmButton, StatusPill } from "@/components/admin/ui";
import { SuccessMessage, useSuccessMessage } from "@/components/admin/SuccessMessage";
import { AdjustStockModal, REASON_LABELS } from "@/components/admin/AdjustStockModal";
import { RawMaterialAdjustModal } from "@/components/admin/RawMaterialAdjustModal";
import { RawMaterialForm } from "@/components/admin/RawMaterialForm";
import { RawMaterialNutritionModal } from "@/components/admin/RawMaterialNutritionModal";
import type { Product, RawMaterialDTO, RawMaterialMovementDTO, StockAdjustmentDTO } from "@zaks/shared-types";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function status(m: RawMaterialDTO): { tone: "ok" | "warn" | "bad"; label: string } {
  if (m.stockQty <= 0) return { tone: "bad", label: "OUT" };
  if (m.isLow) return { tone: "warn", label: "LOW" };
  return { tone: "ok", label: "OK" };
}

function movementLabel(m: RawMaterialMovementDTO) {
  if (m.type === "sale") return m.orderNumber ? `Sale · ${m.orderNumber}` : "Sale";
  return m.reason ? REASON_LABELS[m.reason] : "Adjustment";
}

type Filter = "all" | "low" | "out";
type Tab = "materials" | "dishes" | "ready-made";

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
// - Raw materials: what's on hand, what's running low, and every change with who made it
//   and why. ?filter=low (at or below minimum) or ?filter=out (none left), which the
//   dashboard links to.
// - Dishes (?tab=dishes): the servings each dish's recipe can make from that stock, and
//   the raw material that limits it. This replaced the separate Inventory page.
// - Ready-made (?tab=ready-made): items sold as they are (bottled drinks), which have no
//   recipe and are counted in pieces. Same filters, restocked with Adjust stock.
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
  const tab: Tab = tabParam === "dishes" || tabParam === "ready-made" ? tabParam : "materials";
  const filterParam = params.get("filter");
  const filter: Filter = filterParam === "low" || filterParam === "out" ? filterParam : "all";

  // The tab and filter live in the address, so the dashboard can link straight to them.
  function navigate(next: { tab?: Tab; filter?: Filter }) {
    const query = new URLSearchParams();
    const nextTab = next.tab ?? tab;
    const nextFilter = next.tab === "dishes" ? "all" : (next.filter ?? filter);
    if (nextTab !== "materials") query.set("tab", nextTab);
    if (nextFilter !== "all") query.set("filter", nextFilter);
    const qs = query.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const [materials, setMaterials] = useState<RawMaterialDTO[]>([]);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [movements, setMovements] = useState<RawMaterialMovementDTO[]>([]);
  const [logMaterialId, setLogMaterialId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<RawMaterialDTO | null>(null);
  const [editing, setEditing] = useState<RawMaterialDTO | "new" | null>(null);
  const [nutritionOf, setNutritionOf] = useState<RawMaterialDTO | null>(null);
  const success = useSuccessMessage();
  const [isAdmin] = useState(() => getStoredUser()?.role === "admin");

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

  useEffect(() => {
    let cancelled = false;
    const query = logMaterialId === "all" ? "" : `?rawMaterialId=${logMaterialId}`;
    apiFetch<RawMaterialMovementDTO[]>(`/api/raw-materials/movements${query}`, { auth: "staff" })
      .then((result) => {
        if (!cancelled) setMovements(result);
      })
      .catch((err) => {
        if (!cancelled) setMessage(err instanceof ApiError ? err.message : "Could not load the movement log.");
      });
    return () => {
      cancelled = true;
    };
  }, [logMaterialId, version]);

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

  function handleSaved(saved: RawMaterialDTO, created: boolean) {
    success.show(created ? `${saved.name} added` : `${saved.name} saved`);
    setEditing(null);
    refresh();
  }

  const low = materials.filter((m) => m.isActive && m.isLow);
  const out = materials.filter((m) => m.isActive && m.stockQty <= 0);
  const shown = filter === "low" ? low : filter === "out" ? out : materials;
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
      ) : tab === "ready-made" ? (
        <ReadyMadeStock
          items={products && readyMade}
          error={productsError}
          filter={filter}
          version={version}
          isAdmin={isAdmin}
          onFilter={(next) => navigate({ filter: next })}
          onAdjusted={(before, after) => {
            success.show(`${after.name}: ${pieces(before.stockQty ?? 0)} → ${pieces(after.stockQty ?? 0)}`);
            refresh();
          }}
        />
      ) : (
      <>
      {low.length > 0 && filter === "all" && (
        <div className="rounded-[6px] border border-adm-warn bg-adm-warn-soft p-4">
          <div className="mb-1 font-medium text-adm-ink">
            {low.length} raw material{low.length !== 1 ? "s" : ""} at or below minimum level
          </div>
          <div className="text-base break-words text-adm-ink-2 md:text-sm">
            {low.map((m) => `${m.name} (${formatMaterialQty(m.stockQty, m.unit)} left)`).join(", ")}
          </div>
        </div>
      )}

      <FilterChips
        filter={filter}
        counts={{ all: materials.length, low: low.length, out: out.length }}
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

      <Card
        title="Stock movements"
        actions={
          <select
            value={logMaterialId}
            onChange={(e) => setLogMaterialId(e.target.value)}
            aria-label="Filter movements by raw material"
            className="min-h-11 w-full min-w-0 rounded-[4px] border border-adm-line bg-adm-surface px-2 text-base md:min-h-0 md:w-auto md:py-1 md:text-sm"
          >
            <option value="all">All raw materials</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        }
      >
        {movements.length === 0 ? (
          <div className="p-4 text-base text-adm-ink-3 md:text-sm">No stock movements recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-base md:text-sm">
              <thead>
                <tr className="text-left text-xs tracking-[.07em] text-adm-ink-3 uppercase">
                  <th className="px-4.5 py-2.75 font-medium">When</th>
                  <th className="px-3 py-2.75 font-medium">Raw material</th>
                  <th className="px-3 py-2.75 text-right font-medium">Change</th>
                  <th className="px-3 py-2.75 font-medium">Why</th>
                  <th className="px-3 py-2.75 font-medium">Note</th>
                  <th className="px-4.5 py-2.75 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-t border-adm-line-soft">
                    <td className="font-adm-mono px-4.5 py-2.75 whitespace-nowrap text-adm-ink-3">{formatTime(m.createdAt)}</td>
                    <td className="px-3 py-2.75">{m.rawMaterialName}</td>
                    <td className="font-adm-mono px-3 py-2.75 text-right whitespace-nowrap">
                      <span className={m.delta > 0 ? "text-adm-ok" : "text-adm-bad"}>
                        {m.delta > 0 ? "+" : "−"}
                        {formatMaterialQty(Math.abs(m.delta), m.unit)}
                      </span>
                      <span className="ml-1.5 text-adm-ink-3">
                        ({formatMaterialQty(m.previousQty, m.unit)}→{formatMaterialQty(m.newQty, m.unit)})
                      </span>
                    </td>
                    <td className="px-3 py-2.75 whitespace-nowrap text-adm-ink-2">{movementLabel(m)}</td>
                    <td className="max-w-50 truncate px-3 py-2.75 text-adm-ink-3" title={m.note ?? undefined}>
                      {m.note ?? "—"}
                    </td>
                    <td className="px-4.5 py-2.75 text-adm-ink-2">{m.adjustedByName ?? (m.type === "sale" ? "Kiosk sale" : "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </>
      )}

      {adjusting && <RawMaterialAdjustModal material={adjusting} onClose={() => setAdjusting(null)} onSaved={handleAdjusted} />}
      {editing && <RawMaterialForm material={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={handleSaved} />}
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
  version,
  isAdmin,
  onFilter,
  onAdjusted,
}: {
  items: Product[] | null;
  error: string | null;
  filter: Filter;
  version: number;
  isAdmin: boolean;
  onFilter: (filter: Filter) => void;
  onAdjusted: (before: Product, after: Product) => void;
}) {
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [log, setLog] = useState<StockAdjustmentDTO[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<StockAdjustmentDTO[]>("/api/inventory/adjustments?limit=30", { auth: "staff" })
      .then((result) => {
        if (!cancelled) setLog(result);
      })
      .catch(() => {
        if (!cancelled) setLog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (error) return <div className="text-base text-adm-bad md:text-sm">{error}</div>;
  if (!items) return <div className="text-adm-ink-3">Loading…</div>;

  const low = items.filter(readyMadeIsLow);
  const out = items.filter((p) => (p.stockQty ?? 0) <= 0);
  const shown = filter === "low" ? low : filter === "out" ? out : items;
  const itemIds = new Set(items.map((p) => p.id));
  const itemLog = log.filter((a) => itemIds.has(a.productId));

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

      <Card title="Ready-made stock changes">
        {itemLog.length === 0 ? (
          <div className="p-4 text-base text-adm-ink-3 md:text-sm">No adjustments recorded yet. Sales are listed on Transactions.</div>
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
                {itemLog.map((a) => (
                  <tr key={a.id} className="border-t border-adm-line-soft">
                    <td className="font-adm-mono px-4.5 py-2.75 whitespace-nowrap text-adm-ink-3">{formatTime(a.createdAt)}</td>
                    <td className="px-3 py-2.75">{a.productName}</td>
                    <td className="font-adm-mono px-3 py-2.75 text-right whitespace-nowrap">
                      <span className={a.delta > 0 ? "text-adm-ok" : "text-adm-bad"}>
                        {a.delta > 0 ? "+" : "−"}
                        {Math.abs(a.delta)}
                      </span>
                      <span className="ml-1.5 text-adm-ink-3">
                        ({a.previousQty}→{a.newQty})
                      </span>
                    </td>
                    <td className="px-3 py-2.75 whitespace-nowrap text-adm-ink-2">{REASON_LABELS[a.reason]}</td>
                    <td className="max-w-50 truncate px-3 py-2.75 text-adm-ink-3" title={a.note ?? undefined}>
                      {a.note ?? "—"}
                    </td>
                    <td className="px-4.5 py-2.75 text-adm-ink-2">{a.adjustedByName ?? "—"}</td>
                  </tr>
                ))}
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
