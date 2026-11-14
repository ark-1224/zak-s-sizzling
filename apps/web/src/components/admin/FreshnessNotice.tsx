"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { admButtonClass } from "@/components/admin/ui";
import { formatMaterialQty } from "@/lib/units";
import { shortDay } from "@/lib/market";
import type { FreshnessWarningDTO } from "@zaks/shared-types";

// Shelf-life warnings, on the dashboard and the Raw materials page: items whose oldest
// stock (assuming the oldest is used first) is past or near the days it stays fresh, or a
// packaged item near its printed expiry date. Hidden when there's nothing to warn about.

export function FreshnessNotice({ link }: { link?: boolean }) {
  const [warnings, setWarnings] = useState<FreshnessWarningDTO[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<FreshnessWarningDTO[]>("/api/inventory/freshness", { auth: "staff" })
      .then((w) => !cancelled && setWarnings(w))
      .catch(() => {
        // A failed check just shows no warning; the rest of the page still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (warnings.length === 0) return null;
  const expired = warnings.filter((w) => w.status === "expired").length;
  return (
    <div role="status" className={`rounded-[6px] border px-4 py-3.5 ${expired ? "border-adm-bad bg-adm-bad-soft" : "border-adm-warn bg-adm-warn-soft"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-base font-medium md:text-sm">
          {warnings.length} item{warnings.length !== 1 ? "s" : ""} to use soon{expired ? ` · ${expired} past its fresh days` : ""}
        </div>
        {link && (
          <Link href="/admin/raw-materials" className={admButtonClass({ variant: "secondary", size: "compact" })}>
            See items
          </Link>
        )}
      </div>
      <ul className="mt-2 text-base text-adm-ink-2 md:text-sm">
        {warnings.slice(0, 8).map((w) => (
          <li key={`${w.kind}:${w.itemId}`}>
            <strong className="font-medium text-adm-ink">{w.itemName}</strong> ({formatMaterialQty(w.onHand, w.baseUnit)}):{" "}
            {w.status === "expired" ? "went off " : "goes off "}
            {shortDay(w.goesOffOn)}
            {w.basis === "printed_date" ? " (printed date)" : w.boughtOn ? `, bought ${shortDay(w.boughtOn)}` : ""}
            {w.status === "expired" ? ". Check it before using." : w.daysLeft === 0 ? ", today." : `, in ${w.daysLeft} day${w.daysLeft !== 1 ? "s" : ""}.`}
          </li>
        ))}
        {warnings.length > 8 && <li>and {warnings.length - 8} more</li>}
      </ul>
    </div>
  );
}
