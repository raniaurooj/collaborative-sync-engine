import * as Y from "yjs";

const docA = new Y.Doc();
const docB = new Y.Doc();

const textA = docA.getText("shared-text");
const textB = docB.getText("shared-text");

console.log("Initial state");
console.log("A:", JSON.stringify(textA.toString()));
console.log("B:", JSON.stringify(textB.toString()));

const initialUpdate = Y.encodeStateAsUpdate(docA);
Y.applyUpdate(docB, initialUpdate);

textA.insert(0, "Hello ");
Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

console.log("\nAfter initial sync");
console.log("A:", textA.toString());
console.log("B:", textB.toString());


textA.insert(6, "World"); // A inserts "World" after "Hello "
textB.insert(6, "There"); // B inserts "There" after "Hello " — concurrently, unaware of A's edit

console.log("\nBefore merge (each peer has diverged)");
console.log("A (local view):", textA.toString());
console.log("B (local view):", textB.toString());


const updateFromA = Y.encodeStateAsUpdate(docA);
const updateFromB = Y.encodeStateAsUpdate(docB);

Y.applyUpdate(docB, updateFromA); // B receives A's change
Y.applyUpdate(docA, updateFromB); // A receives B's change

console.log("\nAfter merge");
console.log("A (final):", textA.toString());
console.log("B (final):", textB.toString());

const converged = textA.toString() === textB.toString();
console.log("\nConvergence check");
console.log("A === B:", converged);

if (!converged) {
  throw new Error("CRDT FAILED TO CONVERGE — this should never happen");
}

console.log("Both peers converged to the same state, despite concurrent, unsynced edits.");
console.log("No data was lost. No central server arbitrated the conflict.");