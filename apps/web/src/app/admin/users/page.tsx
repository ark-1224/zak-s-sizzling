"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { getStoredUser } from "@/lib/auth";
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
export default function UsersPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [users, setUsers] = useState<UserAccountDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const me = getStoredUser();
    if (me?.role !== "admin") {
      router.replace("/admin");
      return;
    }
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

  async function toggleActive(user: UserAccountDTO) {
    try {
      await apiFetch(`/api/users/${user.id}`, {
        method: "PATCH",
        auth: "staff",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not update the account.");
    }
  }

  async function changeRole(user: UserAccountDTO, role: "admin" | "staff") {
    try {
      await apiFetch(`/api/users/${user.id}`, { method: "PATCH", auth: "staff", body: JSON.stringify({ role }) });
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not change role.");
    }
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

      {message && <div className="text-base text-adm-bad md:text-sm">{message}</div>}

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <RoleCard n="Administrator" count={`${admins} ACCOUNT${admins !== 1 ? "S" : ""}`} d="Full inventory and product control, adjustments, analytics, imports, and user administration." />
        <RoleCard n="Staff" count={`${staff} ACCOUNT${staff !== 1 ? "S" : ""}`} d="Order management, counter payment confirmation, product/inventory updates. No user administration." />
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
                      <div className="text-base font-medium break-words">{u.name}</div>
                      <div className="font-adm-mono text-sm break-all text-adm-ink-3">{u.email}</div>
                    </div>
                  </div>
                  <StatusPill tone={u.isActive ? "ok" : "bad"}>{u.isActive ? "ACTIVE" : "SUSPENDED"}</StatusPill>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u, e.target.value as "admin" | "staff")}
                    aria-label={`Role for ${u.name}`}
                    className={admInputClass}
                  >
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                  </select>
                  <AdmButton variant="secondary" onClick={() => toggleActive(u)}>
                    {u.isActive ? "Suspend" : "Reactivate"}
                  </AdmButton>
                </div>
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
                          <div className="font-medium">{u.name}</div>
                          <div className="font-adm-mono text-[10.5px] text-adm-ink-3">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value as "admin" | "staff")}
                        className="rounded-[4px] border border-adm-line bg-adm-surface px-2 py-1 text-[12px]"
                      >
                        <option value="admin">Admin</option>
                        <option value="staff">Staff</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill tone={u.isActive ? "ok" : "bad"}>{u.isActive ? "ACTIVE" : "SUSPENDED"}</StatusPill>
                    </td>
                    <td className="px-4.5 py-3 text-right">
                      <button onClick={() => toggleActive(u)} className="text-[12px] font-medium text-adm-accent">
                        {u.isActive ? "Suspend" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
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

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
      await apiFetch("/api/users", {
        method: "POST",
        auth: "staff",
        body: JSON.stringify({ name, email, password, role }),
      });
      onCreated();
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
