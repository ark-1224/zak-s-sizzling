import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@zaks/shared-types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

/** One shared connection per browser tab — components subscribe/unsubscribe to events on it. */
export function getSocket() {
  if (!socket) socket = io(WS_URL);
  return socket;
}
