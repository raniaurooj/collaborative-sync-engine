import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import { URL } from "url";
import "dotenv/config";
import { connectDB, loadDocument, saveDocument } from "./persistence.js";
import { issueGuestToken, verifyToken } from "./auth.js";
import cors from "cors";
import generateUploadSignature, { deleteCloudinaryImage } from "./cloudinary.js";

const app = express();
app.use(express.json());
app.use(cors());

app.get("/auth/guest", (req, res) => {
  const { token, userId, name } = issueGuestToken();
  res.json({ token, userId, name });
});

app.get("/upload/signature", (req, res) => {
  const signatureData = generateUploadSignature();
  res.json(signatureData);
});

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

function countImageUrls(yText) {
  const counts = new Map();
  for (const op of yText.toDelta()) {
    if (op.insert && typeof op.insert === "object" && op.insert.image) {
      const url = op.insert.image;
      counts.set(url, (counts.get(url) || 0) + 1);
    }
  }
  return counts;
}

wss.on("connection", (ws, req) => {
  let authenticated = false;
  let user = null;
  let room = null;
  let roomId = null;

  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      console.log("Client failed to authenticate in time — closing connection");
      ws.close(4001, "Authentication timeout");
    }
  }, 5000);

  ws.on("message", async (data, isBinary) => {
    if (!authenticated) {
      if (isBinary) {
        ws.close(4002, "Expected auth message first");
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        ws.close(4002, "Invalid auth message format");
        return;
      }

      if (parsed.type !== "auth" || !parsed.token) {
        ws.close(4002, "Expected auth message first");
        return;
      }

      const decoded = verifyToken(parsed.token);
      if (!decoded) {
        ws.close(4003, "Invalid or expired token");
        return;
      }
      user = decoded;
      authenticated = true;
      clearTimeout(authTimeout);

      roomId = parsed.roomId || "default";
      room = await getOrCreateRoom(roomId);
      room.clients.add(ws);

      const currentState = Y.encodeStateAsUpdate(room.doc);
      ws.send(currentState);

      return;
    }

    const yText = room.doc.getText("quill-content");
    const before = countImageUrls(yText);

    Y.applyUpdate(room.doc, new Uint8Array(data));

    const after = countImageUrls(yText);

    for (const [url] of before) {
      if (!after.get(url)) {
        deleteCloudinaryImage(url).catch((err) =>
          console.error("Cloudinary cleanup failed:", err.message)
        );
      }
    }

    for (const client of room.clients) {
      if (client !== ws && client.readyState === client.OPEN) {
        client.send(data);
      }
    }

    scheduleSave(roomId, room);
  });

  ws.on("close", () => {
    clearTimeout(authTimeout);
    if (room) {
      room.clients.delete(ws);
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
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