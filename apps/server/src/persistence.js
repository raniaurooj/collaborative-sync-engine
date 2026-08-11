import { MongoClient } from 'mongodb';
import * as Y from 'yjs';

let client;
let db;

export async function connectDB(uri) {
  client = new MongoClient(uri);
  await client.connect();
  db = client.db("collab-sync-engine");
  console.log("Connected to MongoDB Atlas!");
}

function getCollection() {
  if (!db) throw new Error("Database not initialized. Call connectDB first.");
  return db.collection("document");
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

  await getCollection().updateOne(
    { roomId },
    {
      $set: {
        roomId,
        state: Buffer.from(state),
        updatedAt: new Date(), 
      },
    },
    {
      upsert: true, 
    }
  );
}

export {
  getCollection,
  loadDocument,
  saveDocument,
};