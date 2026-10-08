"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { getStoredUser } from "@/lib/auth";
import { getSocket } from "@/lib/websocket";
import { formatMaterialQty } from "@/lib/units";
import { PageHeader, Card, AdmButton, StatusPill } from "@/components/admin/ui";
import { SuccessMessage, useSuccessMessage } from "@/components/admin/SuccessMessage";
import { REASON_LABELS } from "@/components/admin/AdjustStockModal";
import { RawMaterialAdjustModal } from "@/components/admin/RawMaterialAdjustModal";
import { RawMaterialForm } from "@/components/admin/RawMaterialForm";
import type { RawMaterialDTO, RawMaterialMovementDTO } from "@zaks/shared-types";

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

// Raw-material stock for recipe dishes (docs/design/raw-material-stock.md, Objective 3):
// what's on hand, what's running low, and every change with who made it and why. Staff
// restock and adjust here; adding or editing raw materials is Administrator-only.
export default function AdminRawMaterialsPage() {
  const [materials, setMaterials] = useState<RawMaterialDTO[]>([]);
  const [movements, setMovements] = useState<RawMaterialMovementDTO[]>([]);
  const [logMaterialId, setLogMaterialId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<RawMaterialDTO | null>(null);
  const [editing, setEditing] = useState<RawMaterialDTO | "new" | null>(null);
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

  function handleSaved(saved: RawMaterialDTO, created: boolean) {
    success.show(created ? `${saved.name} added` : `${saved.name} saved`);
    setEditing(null);
    refresh();
  }

  const low = materials.filter((m) => m.isActive && m.isLow);

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader
        eyebrow="Stock per raw material"
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

      {low.length > 0 && (
        <div className="rounded-[6px] border border-adm-warn bg-adm-warn-soft p-4">
          <div className="mb-1 font-medium text-adm-ink">
            {low.length} raw material{low.length !== 1 ? "s" : ""} at or below minimum level
          </div>
          <div className="text-base break-words text-adm-ink-2 md:text-sm">
            {low.map((m) => `${m.name} (${formatMaterialQty(m.stockQty, m.unit)} left)`).join(", ")}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-adm-ink-3">Loading…</div>
      ) : materials.length === 0 ? (
        <Card>
          <div className="p-4 text-base text-adm-ink-3 md:text-sm">
            No raw materials yet.{isAdmin ? " Add one, then give a dish a recipe from the Products page." : ""}
          </div>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-adm-line-soft md:hidden">
            {materials.map((m) => {
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
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10.5px] tracking-[.07em] text-adm-ink-3 uppercase">
                  <th className="px-4.5 py-2.75 font-medium">Raw material</th>
                  <th className="px-3 py-2.75 text-right font-medium">On hand</th>
                  <th className="px-3 py-2.75 text-right font-medium">Min</th>
                  <th className="px-3 py-2.75 font-medium">Status</th>
                  <th className="px-3 py-2.75 font-medium">Used in</th>
                  <th className="px-4.5 py-2.75 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => {
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
            className="min-h-11 w-full min-w-0 rounded-[4px] border border-adm-line bg-adm-surface px-2 text-base md:min-h-0 md:w-auto md:py-1 md:text-[11.5px]"
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
                <tr className="text-left text-[10.5px] tracking-[.07em] text-adm-ink-3 uppercase">
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

      {adjusting && <RawMaterialAdjustModal material={adjusting} onClose={() => setAdjusting(null)} onSaved={handleAdjusted} />}
      {editing && <RawMaterialForm material={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={handleSaved} />}
    </div>
  );
}
