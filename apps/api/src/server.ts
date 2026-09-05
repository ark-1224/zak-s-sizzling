import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "./app";
import { attachWebSocket } from "./websocket";

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();
const httpServer = createServer(app);
attachWebSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`[api] Zak's Sizzling Hub API listening on http://localhost:${PORT}`);
});
