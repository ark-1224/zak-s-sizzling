"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { PageHeader, Card, AdmButton, StatusPill, admInputClass, admLabelClass } from "@/components/admin/ui";
import { LoadErrorAlert } from "@/components/LoadErrorAlert";
import type { Category } from "@zaks/shared-types";

// Category management (Administrator only), using the manuscript's category fields:
// name, icon, sort order and "new". The order here is the order of the kiosk's category
// rail; "Mark as new" puts a NEW badge on the category's tile. Only an empty category
// can be deleted. Open kiosks update straight away (categories:changed).

interface Draft {
  name: string;
  icon: string;
  isNew: boolean;
}

const EMPTY: Draft = { name: "", icon: "", isNew: false };

function CategoryForm({
  initial,
  saving,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial: Draft;
  saving: boolean;
  submitLabel: string;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...draft, name: draft.name.trim(), icon: draft.icon.trim() });
      }}
      className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem] sm:items-end lg:grid-cols-[1fr_8rem_auto_auto]"
    >
      <label className="block">
        <span className={admLabelClass}>Name</span>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          maxLength={80}
          required
          autoFocus
          className={admInputClass}
        />
      </label>
      <label className="block">
        <span className={admLabelClass}>Icon (emoji)</span>
        <input
          value={draft.icon}
          onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
          placeholder="🍽️"
          aria-describedby="icon-hint"
          className={`text-center text-lg ${admInputClass}`}
        />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-base md:min-h-9 md:text-sm">
        <input type="checkbox" checked={draft.isNew} onChange={(e) => setDraft({ ...draft, isNew: e.target.checked })} className="h-5 w-5" />
        Mark as new
      </label>
      <div className="flex gap-2">
        <AdmButton type="submit" variant="primary" disabled={saving || draft.name.trim() === ""}>
          {saving ? "Saving…" : submitLabel}
        </AdmButton>
        <AdmButton type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </AdmButton>
      </div>
      <p id="icon-hint" className="text-sm text-adm-ink-3 sm:col-span-2 lg:col-span-4">
        One emoji, shown on the kiosk&apos;s category tile. On Windows, press Win + . to pick one.
      </p>
    </form>
  );
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteAskId, setDeleteAskId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setCategories(await apiFetch<Category[]>("/api/categories"));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "The server didn't respond. Check the connection, then try again.");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  /** Runs a change, shows the outcome, and reloads the list. */
  async function run(change: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await change();
      setMessage({ text: success, error: false });
      await load();
      return true;
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : "Something went wrong. Please try again.", error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const body = (draft: Draft) => JSON.stringify({ name: draft.name, icon: draft.icon || null, isNew: draft.isNew });

  async function handleAdd(draft: Draft) {
    const ok = await run(
      () => apiFetch("/api/categories", { method: "POST", auth: "staff", body: body(draft) }),
      `"${draft.name}" added at the end of the kiosk's category rail.`
    );
    if (ok) setAdding(false);
  }

  async function handleEdit(category: Category, draft: Draft) {
    const ok = await run(
      () => apiFetch(`/api/categories/${category.id}`, { method: "PUT", auth: "staff", body: body(draft) }),
      `"${draft.name}" saved.`
    );
    if (ok) setEditingId(null);
  }

  async function handleMove(index: number, direction: -1 | 1) {
    if (!categories) return;
    const ids = categories.map((c) => c.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    await run(
      () => apiFetch("/api/categories/order", { method: "PUT", auth: "staff", body: JSON.stringify({ ids }) }),
      `"${categories[index].name}" moved ${direction < 0 ? "up" : "down"}.`
    );
  }

  async function handleDelete(category: Category) {
    await run(() => apiFetch(`/api/categories/${category.id}`, { method: "DELETE", auth: "staff" }), `"${category.name}" deleted.`);
    setDeleteAskId(null);
  }

  return (
    <div className="flex flex-col gap-4.5">
      <div>
        <PageHeader
          eyebrow="Product management"
          title="Categories"
          actions={
            !adding && (
              <AdmButton variant="primary" onClick={() => setAdding(true)}>
                Add category
              </AdmButton>
            )
          }
        />
        <p className="text-base text-adm-ink-2 md:text-sm">
          The order below is the order of the kiosk&apos;s category rail. Kiosks update as soon as you save.
        </p>
      </div>

      {message && (
        <div role="status" className={`text-base md:text-sm ${message.error ? "text-adm-bad" : "text-adm-ink"}`}>
          {message.text}
        </div>
      )}

      {adding && (
        <Card title="New category">
          <div className="p-4">
            <CategoryForm initial={EMPTY} saving={busy} submitLabel="Add category" onSave={handleAdd} onCancel={() => setAdding(false)} />
          </div>
        </Card>
      )}

      {loadError && <LoadErrorAlert what="the categories" detail={loadError} onRetry={retry} retrying={retrying} stale={categories !== null} />}

      {!categories ? (
        !loadError && <div className="text-adm-ink-3">Loading…</div>
      ) : categories.length === 0 ? (
        <div className="text-adm-ink-3">No categories yet. Add the first one.</div>
      ) : (
        <Card>
          <ol className="divide-y divide-adm-line-soft">
            {categories.map((category, index) => (
              <li key={category.id} className="p-4">
                {editingId === category.id ? (
                  <CategoryForm
                    initial={{ name: category.name, icon: category.icon ?? "", isNew: category.isNew }}
                    saving={busy}
                    submitLabel="Save"
                    onSave={(draft) => handleEdit(category, draft)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="font-adm-mono w-6 shrink-0 text-right text-sm text-adm-ink-3">{index + 1}</span>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-adm-surface-2 text-xl" aria-hidden="true">
                        {category.icon ?? "·"}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium break-words">{category.name}</span>
                          {category.isNew && <StatusPill tone="ok">NEW</StatusPill>}
                        </div>
                        <div className="text-sm text-adm-ink-3">
                          {category.productCount ?? 0} product{category.productCount !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                    {deleteAskId === category.id ? (
                      <div role="group" aria-label={`Delete ${category.name}?`} className="flex flex-wrap items-center gap-2">
                        <span className="text-base md:text-sm">Delete &ldquo;{category.name}&rdquo;?</span>
                        <AdmButton variant="danger" size="compact" disabled={busy} onClick={() => handleDelete(category)}>
                          Yes, delete
                        </AdmButton>
                        <AdmButton variant="secondary" size="compact" disabled={busy} onClick={() => setDeleteAskId(null)}>
                          Keep it
                        </AdmButton>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <AdmButton
                          variant="secondary"
                          size="compact"
                          disabled={busy || index === 0}
                          onClick={() => handleMove(index, -1)}
                          aria-label={`Move ${category.name} up`}
                        >
                          ↑
                        </AdmButton>
                        <AdmButton
                          variant="secondary"
                          size="compact"
                          disabled={busy || index === categories.length - 1}
                          onClick={() => handleMove(index, 1)}
                          aria-label={`Move ${category.name} down`}
                        >
                          ↓
                        </AdmButton>
                        <AdmButton variant="secondary" size="compact" disabled={busy} onClick={() => setEditingId(category.id)}>
                          Edit
                        </AdmButton>
                        <AdmButton
                          variant="danger"
                          size="compact"
                          disabled={busy}
                          onClick={() =>
                            (category.productCount ?? 0) > 0
                              ? setMessage({
                                  text: `"${category.name}" still has ${category.productCount} product${category.productCount !== 1 ? "s" : ""}. Move them to another category on the Products page first.`,
                                  error: true,
                                })
                              : setDeleteAskId(category.id)
                          }
                        >
                          Delete
                        </AdmButton>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
