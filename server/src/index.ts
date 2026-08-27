import http from "node:http";
import { createApp } from "./app";
import { createSocketServer } from "./websocket/socket";
import { config } from "./config";

const app = createApp();
const httpServer = http.createServer(app);

createSocketServer(httpServer);

httpServer.listen(config.port, () => {
  console.log(`[syncroom] API + WebSocket server listening on :${config.port}`);
});
