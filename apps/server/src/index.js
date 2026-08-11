import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import { URL } from "url";

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      doc: new Y.Doc(),
      clients: new Set(),
    });
    console.log(`Room created: ${roomId}`);
  }
  return rooms.get(roomId);
}

wss.on("connection", (ws, req) => {
  const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const roomId = searchParams.get("room") || "default";

  const room = getOrCreateRoom(roomId);
  room.clients.add(ws);
  console.log(`Client joined room "${roomId}" (${room.clients.size} clients now)`);

  const currentState = Y.encodeStateAsUpdate(room.doc);
  ws.send(currentState);

  ws.on("message", (data) => {
    Y.applyUpdate(room.doc, new Uint8Array(data));
    for (const client of room.clients) {
      if (client !== ws && client.readyState === client.OPEN) {
        client.send(data);
      }
    }
  });

  ws.on("close", () => {
    room.clients.delete(ws);
    console.log(`Client left room "${roomId}" (${room.clients.size} clients remain)`);

    if (room.clients.size === 0) {
      rooms.delete(roomId);
      console.log(`Room "${roomId}" emptied and removed`);
    }
  });

  ws.on("error", (err) => {
    console.error(`WebSocket error in room "${roomId}":`, err.message);
  });
});

const PORT = 4000;
httpServer.listen(PORT, () => {
  console.log(`Sync relay server running on ws://localhost:${PORT}`);
});