import mongoose from "mongoose";
import * as Y from "yjs";

export async function connectDB(uri) {
  await mongoose.connect(uri, { dbName: "collab-sync-engine" });
  console.log("Connected to MongoDB Atlas!");

  await getCollection().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

function getCollection() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("Database not initialized. Call connectDB first.");
  }
  return mongoose.connection.db.collection("document");
}

async function loadDocument(roomId) {
  const record = await getCollection().findOne({ roomId });

  if (!record || !record.state) {
    console.log(`No saved state for ${roomId} - starting fresh`);
    return null;
  }

  return new Uint8Array(record.state.buffer);
}

async function saveDocument(roomId, doc) {
  const state = Y.encodeStateAsUpdate(doc);
  const isGuestRoom = roomId.startsWith("guest-");

  const update = {
    roomId,
    state: Buffer.from(state),
    updatedAt: new Date(),
  };
  if (isGuestRoom) {
    update.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  await getCollection().updateOne(
    { roomId },
    { $set: update },
    { upsert: true }
  );
}

export { getCollection, loadDocument, saveDocument };