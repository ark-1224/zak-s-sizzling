"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { AuthUser } from "@zaks/shared-types";
import { getAccessToken, getStoredUser } from "@/lib/auth";

// The staff session lives in browser storage, which the server render can't see. These
// read it the way React expects outside data to be read (useSyncExternalStore):
// `undefined` on the server and while the page hydrates, then the stored value, without
// setting state in an effect. Nothing subscribes: the session only changes by signing
// in or out, and both navigate to another page.
const noSubscription = () => () => {};

/** The signed-in Staff or Admin user on this device: undefined until it can be read, null when nobody is. */
export function useStoredUser(): AuthUser | null | undefined {
  // A string, so React sees the same snapshot until the stored user really changes.
  const saved = useSyncExternalStore(
    noSubscription,
    () => {
      const user = getStoredUser();
      return user ? JSON.stringify(user) : null;
    },
    () => undefined
  );
  return useMemo(() => (typeof saved === "string" ? (JSON.parse(saved) as AuthUser) : saved), [saved]);
}

/** Whether this device has a Staff or Admin session (a token and a staff user): undefined until it can be read. */
export function useStaffSession(): boolean | undefined {
  return useSyncExternalStore(
    noSubscription,
    () => {
      const user = getStoredUser();
      return Boolean(getAccessToken("staff")) && (user?.role === "admin" || user?.role === "staff");
    },
    () => undefined
  );
}
