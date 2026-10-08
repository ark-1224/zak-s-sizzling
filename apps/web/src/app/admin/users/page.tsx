"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { getStoredUser } from "@/lib/auth";
import { SuccessMessage, useSuccessMessage } from "@/components/admin/SuccessMessage";
import {
  PageHeader,
  Card,
  AdmButton,
  StatusPill,
  admInputClass,
  admLabelClass,
  admModalActionsClass,
  admModalBackdropClass,
  admModalPanelClass,
} from "@/components/admin/ui";
import type { UserAccountDTO } from "@zaks/shared-types";

// User Account Administration — Admin-only per the manuscript ("Grants the admin the
// ability to create, manage, assign roles, and revoke user accounts for both admin
// and front desk staff"). StaffGuard (in the layout) already keeps customers/logged-
// out visitors out; this adds the narrower admin-only check on top.
//
// The signed-in admin's own row can't be suspended or have its role changed (the API
// refuses it too), and changing a role or suspending someone asks first (UI review #14).
type PendingChange = { user: UserAccountDTO; kind: "role"; role: "admin" | "staff" } | { user: UserAccountDTO; kind: "suspend" };

export default function UsersPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [users, setUsers] = useState<UserAccountDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const success = useSuccessMessage();

  useEffect(() => {
    const me = getStoredUser();
    if (me?.role !== "admin") {
      router.replace("/admin");
      return;
    }
    setMeId(me.id);
    setChecked(true);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await apiFetch<UserAccountDTO[]>("/api/users", { auth: "staff" }));
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checked) load();
  }, [checked, load]);

  async function saveChange(user: UserAccountDTO, change: { isActive?: boolean; role?: "admin" | "staff" }) {
    setMessage(null);
    try {
      await apiFetch(`/api/users/${user.id}`, { method: "PATCH", auth: "staff", body: JSON.stringify(change) });
      success.show(
        change.role
          ? `${user.name} is now ${change.role === "admin" ? "an Administrator" : "Staff"}`
          : change.isActive
            ? `${user.name} reactivated`
            : `${user.name} suspended`
      );
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not update the account.");
    }
  }

  // Suspending asks first; reactivating restores access, so it happens straight away.
  function toggleActive(user: UserAccountDTO) {
    if (user.isActive) setPending({ user, kind: "suspend" });
    else saveChange(user, { isActive: true });
  }

  function changeRole(user: UserAccountDTO, role: "admin" | "staff") {
    if (role !== user.role) setPending({ user, kind: "role", role });
  }

  async function confirmPending() {
    if (!pending) return;
    await saveChange(pending.user, pending.kind === "role" ? { role: pending.role } : { isActive: false });
    setPending(null);
  }

  if (!checked) return null;

  const admins = users.filter((u) => u.role === "admin").length;
  const staff = users.filter((u) => u.role === "staff").length;

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader
        eyebrow="Authentication & authorization"
        title="Users & roles"
        actions={
          <AdmButton variant="primary" onClick={() => setCreating(true)}>
            + Invite user
          </AdmButton>
        }
      />

      <SuccessMessage text={success.text} onDismiss={success.clear} />
      {message && <div className="text-base text-adm-bad md:text-sm">{message}</div>}

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <RoleCard n="Administrator" count={`${admins} ACCOUNT${admins !== 1 ? "S" : ""}`} d="Everything staff can do, plus products, prices and costs, bulk import, analytics and reports, and user administration." />
        <RoleCard n="Staff" count={`${staff} ACCOUNT${staff !== 1 ? "S" : ""}`} d="Orders, counter payment confirmation, kitchen display, and stock adjustments. No product, price, report, or user administration." />
      </div>

      {loading ? (
        <div className="text-adm-ink-3">Loading…</div>
      ) : (
        <Card title="Accounts">
          <ul className="divide-y divide-adm-line-soft md:hidden">
            {users.map((u) => (
              <li key={u.id} className="flex flex-col gap-3 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-adm-line bg-adm-surface-2 text-xs font-semibold text-adm-ink-2">
                      {u.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-base font-medium break-words">
                        {u.name} {u.id === meId && <YouTag />}
                      </div>
                      <div className="font-adm-mono text-sm break-all text-adm-ink-3">{u.email}</div>
                    </div>
                  </div>
                  <StatusPill tone={u.isActive ? "ok" : "bad"}>{u.isActive ? "ACTIVE" : "SUSPENDED"}</StatusPill>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u, e.target.value as "admin" | "staff")}
                    disabled={u.id === meId}
                    aria-label={`Role for ${u.name}`}
                    className={`${admInputClass} disabled:opacity-60`}
                  >
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                  </select>
                  <AdmButton variant="secondary" onClick={() => toggleActive(u)} disabled={u.id === meId}>
                    {u.isActive ? "Suspend" : "Reactivate"}
                  </AdmButton>
                </div>
                {u.id === meId && <p className="text-sm text-adm-ink-3">{SELF_NOTE}</p>}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10.5px] tracking-[.07em] text-adm-ink-3 uppercase">
                  <th className="px-4.5 py-2.75 font-medium">User</th>
                  <th className="px-3 py-2.75 font-medium">Role</th>
                  <th className="px-3 py-2.75 font-medium">Status</th>
                  <th className="px-4.5 py-2.75 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-adm-line-soft">
                    <td className="px-4.5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-adm-line bg-adm-surface-2 text-[10px] font-semibold text-adm-ink-2">
                          {u.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium">
                            {u.name} {u.id === meId && <YouTag />}
                          </div>
                          <div className="font-adm-mono text-[10.5px] text-adm-ink-3">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value as "admin" | "staff")}
                        disabled={u.id === meId}
                        title={u.id === meId ? SELF_NOTE : undefined}
                        aria-label={`Role for ${u.name}`}
                        className="min-h-8 rounded-[4px] border border-adm-line bg-adm-surface px-2 py-1 text-[12px] disabled:opacity-60"
                      >
                        <option value="admin">Admin</option>
                        <option value="staff">Staff</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill tone={u.isActive ? "ok" : "bad"}>{u.isActive ? "ACTIVE" : "SUSPENDED"}</StatusPill>
                    </td>
                    <td className="px-4.5 py-2 text-right">
                      <AdmButton
                        variant="secondary"
                        size="row"
                        onClick={() => toggleActive(u)}
                        disabled={u.id === meId}
                        title={u.id === meId ? SELF_NOTE : undefined}
                        aria-label={`${u.isActive ? "Suspend" : "Reactivate"} ${u.name}`}
                      >
                        {u.isActive ? "Suspend" : "Reactivate"}
                      </AdmButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pending && <ConfirmChangeModal change={pending} onCancel={() => setPending(null)} onConfirm={confirmPending} />}

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            success.show(`Account created for ${created.name} (${created.role === "admin" ? "Administrator" : "Staff"})`);
            load();
          }}
        />
      )}
    </div>
  );
}

const SELF_NOTE = "You can't suspend your own account or change its role. Another admin can.";

function YouTag() {
  return (
    <span className="font-adm-mono ml-1 rounded-[3px] border border-adm-line px-1.5 py-0.5 align-middle text-[10px] font-normal text-adm-ink-3">
      YOU
    </span>
  );
}

function ConfirmChangeModal({ change, onCancel, onConfirm }: { change: PendingChange; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const name = change.user.name;
  const toAdmin = change.kind === "role" && change.role === "admin";
  const title =
    change.kind === "suspend" ? `Suspend ${name}?` : toAdmin ? `Make ${name} an Administrator?` : `Change ${name} to Staff?`;
  const detail =
    change.kind === "suspend"
      ? "They won't be able to sign in, and they'll be signed out within 15 minutes. You can reactivate the account at any time."
      : toAdmin
        ? "They'll be able to change products, prices and costs, run bulk imports, see analytics and reports, and manage user accounts."
        : "They'll keep orders, payments, the kitchen display and stock adjustments, but lose product, price, report and user administration.";
  const confirmLabel = change.kind === "suspend" ? "Yes, suspend" : toAdmin ? "Yes, make Administrator" : "Yes, change to Staff";

  async function handleConfirm() {
    setSaving(true);
    await onConfirm();
  }

  return (
    <div className={admModalBackdropClass}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-change-title" className={`${admModalPanelClass} max-w-md`}>
        <h2 id="confirm-change-title" className="mb-2 text-lg font-semibold tracking-tight break-words">
          {title}
        </h2>
        <p className="mb-5 text-base leading-relaxed text-adm-ink-2 md:text-sm">{detail}</p>
        <div className={admModalActionsClass}>
          <AdmButton type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </AdmButton>
          <AdmButton type="button" variant={change.kind === "suspend" ? "danger" : "primary"} onClick={handleConfirm} disabled={saving}>
            {saving ? "Saving…" : confirmLabel}
          </AdmButton>
        </div>
      </div>
    </div>
  );
}

function RoleCard({ n, count, d }: { n: string; count: string; d: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-[6px] border border-adm-line bg-adm-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-base font-semibold md:text-[13.5px]">{n}</div>
        <span className="font-adm-mono text-xs text-adm-ink-3 md:text-[10.5px]">{count}</span>
      </div>
      <p className="text-base leading-relaxed text-adm-ink-2 md:text-[11.5px]">{d}</p>
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (created: UserAccountDTO) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<UserAccountDTO>("/api/users", {
        method: "POST",
        auth: "staff",
        body: JSON.stringify({ name, email, password, role }),
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={admModalBackdropClass}>
      <form onSubmit={handleSubmit} className={`${admModalPanelClass} max-w-sm`}>
        <h2 className="mb-5 text-lg font-semibold tracking-tight">Invite a new user</h2>

        <label className="mb-3 block">
          <span className={admLabelClass}>Name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={admInputClass} />
        </label>
        <label className="mb-3 block">
          <span className={admLabelClass}>Email</span>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={admInputClass} />
        </label>
        <label className="mb-3 block">
          <span className={admLabelClass}>Temporary password</span>
          <input
            required
            type="text"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`font-adm-mono ${admInputClass}`}
            placeholder="At least 8 characters"
          />
        </label>
        <label className="mb-4 block">
          <span className={admLabelClass}>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "staff")} className={admInputClass}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        {error && <p className="mb-3 text-base text-adm-bad md:text-sm">{error}</p>}

        <div className={admModalActionsClass}>
          <AdmButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdmButton>
          <AdmButton type="submit" variant="primary" disabled={saving}>
            {saving ? "Creating…" : "Create account"}
          </AdmButton>
        </div>
      </form>
    </div>
  );
}
