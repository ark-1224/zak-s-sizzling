"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { getSocket } from "@/lib/websocket";
import type { KitchenTaskDTO } from "@zaks/shared-types";

// Kitchen Display System — real-time order queue per the manuscript's Kitchen Display
// Module wireframe: order ID/date, food items, and serving status. KitchenTask is
// per-order-item (see the ERD), so each order card lists its items with their own
// Pending → In-Progress → Completed control.
const STATUS_LABEL = { pending: "Pending", in_progress: "In Progress", completed: "Completed" } as const;
const NEXT_STATUS = { pending: "in_progress", in_progress: "completed" } as const;

export default function KitchenPage() {
  const [tasks, setTasks] = useState<KitchenTaskDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<KitchenTaskDTO[]>("/api/kitchen/tasks", { auth: "staff" });
      setTasks(result);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not load the kitchen queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A full refetch on either event is simple and correct at this scale — no need for
  // granular client-side patching of a queue that's realistically a handful of orders.
  useEffect(() => {
    const socket = getSocket();
    socket.on("order:created", load);
    socket.on("kitchen:task_updated", load);
    return () => {
      socket.off("order:created", load);
      socket.off("kitchen:task_updated", load);
    };
  }, [load]);

  async function advance(task: KitchenTaskDTO) {
    const next = NEXT_STATUS[task.status as "pending" | "in_progress"];
    if (!next) return;
    try {
      await apiFetch(`/api/kitchen/tasks/${task.id}`, {
        method: "PATCH",
        auth: "staff",
        body: JSON.stringify({ status: next }),
      });
      // No optimistic update needed — the kitchen:task_updated broadcast triggers load().
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not update the task.");
    }
  }

  const orders = useMemo(() => {
    const byOrder = new Map<string, { orderNumber: string; createdAt: string; tasks: KitchenTaskDTO[] }>();
    for (const t of tasks) {
      const entry = byOrder.get(t.orderId) ?? { orderNumber: t.orderNumber, createdAt: t.orderCreatedAt, tasks: [] };
      entry.tasks.push(t);
      byOrder.set(t.orderId, entry);
    }
    return Array.from(byOrder.entries())
      .map(([orderId, v]) => ({ orderId, ...v }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [tasks]);

  return (
    <div className="min-h-screen bg-ink p-6 text-cream">
      <h1 className="font-display mb-1 text-2xl font-semibold">Kitchen Display</h1>
      <p className="mb-6 text-sm text-cream/60">{orders.length} active order{orders.length !== 1 ? "s" : ""}</p>

      {message && <div className="mb-4 text-sm text-berry">{message}</div>}

      {loading ? (
        <div className="text-cream/60">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="text-cream/60">No active orders — the kitchen is caught up.</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {orders.map((order) => (
            <div key={order.orderId} className="rounded-card bg-white/8 p-4">
              <div className="mb-3 flex items-center justify-between border-b border-white/15 pb-2.5">
                <span className="font-display text-lg font-bold">{order.orderNumber}</span>
                <span className="text-xs text-cream/50">{new Date(order.createdAt).toLocaleTimeString()}</span>
              </div>
              <div className="space-y-2.5">
                {order.tasks.map((task) => (
                  <div key={task.id} className="rounded-lg bg-white/5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">
                          {task.qty}× {task.productName}
                        </div>
                        {task.specialInstructions && (
                          <div className="mt-0.5 text-xs text-honey-soft italic">
                            &ldquo;{task.specialInstructions}&rdquo;
                          </div>
                        )}
                      </div>
                      <StatusBadge status={task.status} />
                    </div>
                    {task.status !== "completed" && (
                      <button
                        onClick={() => advance(task)}
                        className="mt-2 w-full rounded-full bg-matcha py-1.5 text-xs font-bold text-cream"
                      >
                        {task.status === "pending" ? "Start preparing" : "Mark done"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: KitchenTaskDTO["status"] }) {
  const colors = {
    pending: "bg-grey-out/30 text-cream",
    in_progress: "bg-honey/30 text-honey-soft",
    completed: "bg-available/30 text-available",
  } as const;
  return (
    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${colors[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
