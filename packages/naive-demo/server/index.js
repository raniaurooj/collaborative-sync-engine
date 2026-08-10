import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Serve the static frontend
app.use(express.static(path.join(__dirname, "../public")));

// Naive in-memory "document" — just a raw string, no conflict resolution
let documentText = "";

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send current state to the newly connected client
  socket.emit("init", documentText);

  // Naive broadcast: whenever ANY client sends a full text update,
  // overwrite the shared state and blast it to everyone else.
  // This is intentionally wrong — it has no concept of "who typed what, where."
  socket.on("text-update", (newText) => {
    documentText = newText;
    socket.broadcast.emit("text-update", newText);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Naive demo server running on http://localhost:${PORT}`);
});