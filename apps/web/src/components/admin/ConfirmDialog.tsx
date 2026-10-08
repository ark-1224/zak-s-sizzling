"use client";

import { useState } from "react";
import { AdmButton, admModalActionsClass, admModalBackdropClass, admModalPanelClass } from "@/components/admin/ui";

// The in-page "are you sure?" step for actions that are hard to undo: deleting a
// product, suspending an account, changing a role. Replaces the browser's own confirm()
// box, which can't say what will happen in the app's words or match its style
// (UI review #14 and #17).
export function ConfirmDialog({
  title,
  detail,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  detail: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    await onConfirm();
  }

  return (
    <div className={admModalBackdropClass}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" className={`${admModalPanelClass} max-w-md`}>
        <h2 id="confirm-dialog-title" className="mb-2 text-lg font-semibold tracking-tight break-words">
          {title}
        </h2>
        <p className="mb-5 text-base leading-relaxed text-adm-ink-2 md:text-sm">{detail}</p>
        <div className={admModalActionsClass}>
          <AdmButton type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </AdmButton>
          <AdmButton type="button" variant={danger ? "danger" : "primary"} onClick={handleConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </AdmButton>
        </div>
      </div>
    </div>
  );
}
