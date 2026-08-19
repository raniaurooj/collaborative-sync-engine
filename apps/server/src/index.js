import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import mongoose from "mongoose";
import "dotenv/config";
import { connectDB, loadDocument, saveDocument } from "./persistence.js";
import { issueGuestToken, verifyToken } from "./auth.js";
import cors from "cors";
import generateUploadSignature, { deleteCloudinaryImage } from "./cloudinary.js";
import documentsRouter from "./routes/documents.route.js";
import Document from "./model/Document.model.js";

const MSG_DOC = 0;
const MSG_AWARENESS = 1;
const MSG_STATE_VECTOR = 2;

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

app.use("/documents", documentsRouter);

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });
const HEARTBEAT_INTERVAL_MS = 30000;

function heartbeat() {
  this.isAlive = true;
}

const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log("Terminating dead connection (no pong received)");
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL_MS);

wss.on("close", () => clearInterval(heartbeatTimer));

const rooms = new Map();
const roomCreationPromises = new Map();
const SAVE_DEBOUNCE_MS = 2000;

async function getOrCreateRoom(roomId) {
  if (rooms.has(roomId)) {
    return rooms.get(roomId);
  }
  if (roomCreationPromises.has(roomId)) {
    return roomCreationPromises.get(roomId);
  }

  const creationPromise = (async () => {
    const doc = new Y.Doc();
    const savedState = await loadDocument(roomId);
    if (savedState) {
      Y.applyUpdate(doc, savedState);
    }
    const room = { doc, clients: new Set(), saveTimeout: null };
    rooms.set(roomId, room);
    console.log(`Room ready: ${roomId}`);
    return room;
  })();

  roomCreationPromises.set(roomId, creationPromise);
  try {
    return await creationPromise;
  } finally {
    roomCreationPromises.delete(roomId);
  }
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
  let connectionRole = null; // "editor" | "viewer" | null
  ws.isAlive = true;
  ws.on("pong", heartbeat);

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
      authenticated = true;
      clearTimeout(authTimeout);

      roomId = parsed.roomId || "default";

      let role = "editor";

      const isOpenRoom = roomId === "default" || roomId.startsWith("guest-");

      if (!isOpenRoom) {
        if (!mongoose.isValidObjectId(roomId)) {
          ws.close(4004, "Invalid document id");
          return;
        }
        const docRecord = await Document.findById(roomId);
        if (!docRecord) {
          ws.close(4004, "Document not found");
          return;
        }
        role = docRecord.roleFor(user.sub);
        if (!role) {
          ws.close(4004, "You do not have access to this document");
          return;
        }
      }
      connectionRole = role;

      room = await getOrCreateRoom(roomId);
      room.clients.add(ws);

      let diff;
      if (parsed.stateVector) {
        const clientStateVector = Uint8Array.from(atob(parsed.stateVector), (c) => c.charCodeAt(0));
        diff = Y.encodeStateAsUpdate(room.doc, clientStateVector);
      } else {
        diff = Y.encodeStateAsUpdate(room.doc);
      }

      const framed = new Uint8Array(diff.length + 1);
      framed[0] = MSG_DOC;
      framed.set(diff, 1);
      ws.send(framed);

      const serverStateVector = Y.encodeStateVector(room.doc);
      const svFramed = new Uint8Array(serverStateVector.length + 1);
      svFramed[0] = MSG_STATE_VECTOR;
      svFramed.set(serverStateVector, 1);
      ws.send(svFramed);
      return;
    }
    
    if (!room) return;
    
    const bytes = new Uint8Array(data);
    const msgType = bytes[0];
    const payload = bytes.subarray(1);

    if (msgType === MSG_AWARENESS) {
      for (const client of room.clients) {
        if (client !== ws && client.readyState === client.OPEN) {
          client.send(data);
        }
      }
      return;
    }

    if (msgType !== MSG_DOC) return;

    if (connectionRole !== "editor") {
      return; 
    }

    const yText = room.doc.getText("quill-content");
    const before = countImageUrls(yText);

    Y.applyUpdate(room.doc, payload);

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