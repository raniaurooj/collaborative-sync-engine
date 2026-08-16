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
import { signup, login, requireAuth } from "./auth.js";
import documentsRouter from "./routes/documents.route.js";
import mongoose from "mongoose";
import Document from "./model/Document.model.js";

const app = express();
app.use(express.json());
app.use(cors());

app.get("/auth/guest", (req, res) => {
  const { token, userId, name } = issueGuestToken();
  res.json({ token, userId, name });
});

app.post("/auth/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: "email, password, and name are required" });
    }
    const { token, user } = await signup({ email, password, name });
    res.status(201).json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const { token, user } = await login({ email, password });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get("/upload/signature", (req, res) => {
  const signatureData = generateUploadSignature();
  res.json(signatureData);
});

app.use("/documents", documentsRouter);

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
  let connectionRole = null;

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
      let role = "editor"
      if(roomId !== "default"){
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
      room = await getOrCreateRoom(roomId)
      room.clients.add(ws);

      const currentState = Y.encodeStateAsUpdate(room.doc);
      ws.send(currentState);
      return;
    }

    if (connectionRole !== "editor") {
      return; // viewer -> read-only, drop any attempted write
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
