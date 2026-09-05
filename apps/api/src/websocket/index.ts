import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@zaks/shared-types";

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

let ioInstance: IO | null = null;

// Rooms populated starting Sprint 4/5: "kitchen", "admin", "kiosk:{sessionId}".
// Sprint 1 just stood the server up; Sprint 3 is the first module (payments) to emit.
export function attachWebSocket(httpServer: HttpServer): IO {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" },
  });

  io.on("connection", (socket) => {
    console.log(`[ws] client connected: ${socket.id}`);
    socket.on("disconnect", () => console.log(`[ws] client disconnected: ${socket.id}`));
  });

  ioInstance = io;
  return io;
}

/** Access the Socket.IO server from anywhere after attachWebSocket() has run in server.ts. */
export function getIO(): IO | null {
  return ioInstance;
}
