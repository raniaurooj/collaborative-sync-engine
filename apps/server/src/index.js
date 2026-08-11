import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import { URL } from "url";
import "dotenv/config";
import { connectDB, loadDocument, saveDocument } from "./persistence.js";

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const rooms = new Map();
const SAVE_DEBOUNCE_MS = 2000;

async function getOrCreateRoom(roomId) {
  if (rooms.has(roomId)) {
    return rooms.get(roomId);
  }

  const doc = new Y.Doc();

  const savedState = await loadDocument(roomId);
  if (savedState) {
    Y.applyUpdate(doc, savedState);
  }

  const room = {
    doc,
    clients: new Set(),
    saveTimeout: null,
  };

  rooms.set(roomId, room);
  console.log(`Room ready: ${roomId}`);
  return room;
}

function scheduleSave(roomId, room) {
  if (room.saveTimeout) {
    clearTimeout(room.saveTimeout);
  }
  room.saveTimeout = setTimeout(() => {
    saveDocument(roomId, room.doc).catch((err) =>
      console.error(`Failed to save room "${roomId}":`, err.message)
    );
  }, SAVE_DEBOUNCE_MS);
}

wss.on("connection", async (ws, req) => {
  const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const roomId = searchParams.get("room") || "default";

  const room = await getOrCreateRoom(roomId);
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
    scheduleSave(roomId, room);
  });

  ws.on("close", () => {
    room.clients.delete(ws);
    console.log(`Client left room "${roomId}" (${room.clients.size} clients remain)`);
  });

  ws.on("error", (err) => {
    console.error(`WebSocket error in room "${roomId}":`, err.message);
  });
});

const PORT = process.env.PORT || 4000;

connectDB(process.env.MONGODB_URI)
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Sync relay server running on ws://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });