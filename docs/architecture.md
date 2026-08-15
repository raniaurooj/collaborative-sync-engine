# Architecture & Design Decisions

## Phase 1: The Problem — Naive Last-Write-Wins Sync

### What it does
A minimal Express + Socket.io server broadcasts the *entire* text content
on every keystroke. Any connected client that receives an update simply
overwrites its local state with whatever arrived last.

### Why it breaks
This is a **last-write-wins** strategy applied to a shared mutable string.
It has no concept of individual operations (insert/delete at a position),
no causal ordering, and no way to detect that two clients edited
concurrently. When two clients send updates close together, whichever
update the server processes/broadcasts last simply overwrites the other —
silently. There's no error, no conflict indicator — the earlier client's
edit just disappears.

### Reproducing the bug
Two browser tabs connected to the same document, both firing rapid
`input` events (simulated via a scripted `setInterval` loop to remove
human reaction-time slack and reliably trigger the race):

![Naive sync breaking under concurrent edits](./media/naive-demo-broken.gif)

**Observed failure:** [fill this in with your exact observation —
e.g. "Tab B's inserted characters were silently overwritten by Tab A's
stale snapshot; no error was raised, and the data loss was invisible to
both users."]

### Why this matters beyond a demo
This is the same class of bug that caused real, documented issues in
early collaborative editors before CRDT/OT algorithms were adopted.
Silent data loss under concurrent writes is a correctness bug, not
just a UX glitch — in a production system this could mean a user's
work vanishing with no recovery path.

---

## Phase 2: The Fix — CRDT-Based Convergence (Yjs)

### Why CRDTs over Operational Transformation
[You'll fill this in after reading the Figma blog post — summarize the
tradeoff in your own words: OT requires a central server to transform
operations in the correct order and is notoriously hard to implement
correctly; CRDTs guarantee convergence through math (commutativity,
associativity, idempotency of merges) without needing a central
arbiter, at the cost of some memory overhead from tombstones.]

### Proof of convergence
Before wiring up any server or UI, I validated the core sync mechanism
headlessly: two independent `Y.Doc` instances, concurrent unsynced
edits at the same position, then a manual bidirectional merge.

### Test output

```
Before merge (each peer has diverged)
A (local view): Hello World
B (local view): Hello There

After merge
A (final): Hello ThereWorld
B (final): Hello ThereWorld

Convergence check
A === B: true
```

### What this proves
Both peers independently inserted different text at the same position
(`"World"` and `"There"`) without knowing about each other's edit. After
exchanging updates and merging — with no central server deciding a
winner — both peers converged to an **identical final state**, and
**neither insertion was lost**. Yjs resolves the ordering deterministically
based on each character's internal ID (client ID + logical clock), not
by arrival time — meaning the same two concurrent edits will always
merge to the same result, on any peer, regardless of network timing.

This is the fundamental difference from Phase 1: naive sync *loses data*
under concurrency; CRDT sync *preserves all data* and *guarantees*
identical convergence across all peers.

## Auth

WebSocket connections can't set custom headers, so JWT auth is handled
as the first message after connection opens (rather than a query param,
to avoid tokens leaking into server access logs). The server holds
unauthenticated sockets in a pending state with a 5-second timeout,
rejecting anything that isn't a valid auth message first — this prevents
unauthenticated connections from joining rooms or lingering open
indefinitely.

**Current gap, not yet closed:** auth today issues short-lived guest
tokens, and any valid token can join any `roomId` — there's no check
that a specific user is permitted to view or edit a specific document.
This was a deliberate sequencing choice: I wanted the sync and
persistence architecture validated end-to-end before adding a real
`User`/`Document` model and per-document permission checks on top of it.
That's the next phase, not an oversight.

---
## Phase 3: Real-Time Sync & Persistence

### Room model
Each document lives as an entry in an in-memory
`Map<roomId, { doc, clients, saveTimeout }>` on the server, holding one
live `Y.Doc` per room. Clients connect over a raw WebSocket (`ws`, not
Socket.io — chosen deliberately so I'd work directly with Yjs's actual
sync protocol rather than have a higher-level abstraction hide it from
me) and, once authenticated, receive the room's current encoded state
via `Y.encodeStateAsUpdate` before joining the broadcast group.

From that point, every message in either direction is a raw Yjs update:
applied to the server's in-memory `Y.Doc`, then relayed unmodified to
every other client in the room. The server never parses or understands
document content — it's a dumb relay once a connection is authenticated.

### Persistence
Every applied update triggers a debounced save (2s) to MongoDB, storing
`Y.encodeStateAsUpdate(doc)` as a binary field. On room creation, any
existing saved state is loaded and reconstructed via `Y.applyUpdate`.

**Known tradeoff:** this saves the full encoded document state on each
debounced write, not an append-only update log with periodic compaction.
Simpler to reason about and implement correctly first; grows unbounded
for very long-lived, heavily-edited documents. Compaction via periodic
snapshotting is a documented next step.

---

## Phase 4: Image Pipeline

1. Client requests a signed upload payload from `GET /upload/signature`
   — the server holds the Cloudinary API secret; the client never sees it.
2. Selected file is cropped client-side (`react-easy-crop`) *before*
   upload. The crop interaction never touches the shared `Y.Doc` — it's
   local React state only — so a slow or failed upload can't leave a
   half-formed edit visible or editable to collaborators.
3. The cropped blob uploads directly from the browser to Cloudinary; the
   server is not in the upload's data path at all.
4. On success, the URL is inserted into the document as a real Quill
   embed. This is the *only* point where the pipeline touches shared
   state — everything before it (file picking, cropping, uploading) is
   local UI state.

### Tombstone-aware cleanup on delete
Yjs never truly deletes content — it tombstones it. That means "the user
deleted this image" isn't an event handed to you for free; you have to
detect it. The server diffs image-URL counts in the document's delta
before and after each applied update, and calls Cloudinary's destroy API
for any URL whose count drops to zero. Counts are used deliberately
instead of a Set, so that a duplicated image isn't wrongly purged from
storage when only one of its two copies is removed from the document.

---

## Deliberate Scope Cut: Drag-to-Reorder Images

I attempted a custom `mousedown`/`mousemove`/`mouseup` drag
implementation to let users drag images to a new position inline. This
ran into a genuine, unresolved conflict with `quill-blot-formatter2`'s
own event handling on its selection overlay — the same drag gesture was
being simultaneously interpreted by my code as "move" and by the
library's internal resize logic as "resize," and outracing a third-party
library's internal event order turned into debugging with diminishing
returns and no guaranteed clean fix.

**Decision: cut it.** It didn't test or demonstrate anything relevant to
this project's actual subject — CRDT sync and conflict resolution — and
risked destabilizing a working image pipeline for a UX nice-to-have.
Users can still reorder images via native cut/paste, which goes through
Quill's Delta API correctly with no custom code. This was a scope
decision made deliberately, not a limitation I ran out of time to fix —
worth documenting because the reasoning behind cutting a feature is
often more useful to talk through than the feature itself would have been.

---

## Known Limitations / Next Phases

- [ ] Real `User`/`Document` models + per-document authorization
- [ ] Awareness protocol — live cursors/presence, separate from
      document sync
- [ ] Reconnect with exponential backoff + state-vector-based resync,
      verified end-to-end (not just implemented)
- [ ] Horizontal scaling via Redis pub/sub — removing the assumption
      that room state lives in one server instance's memory
- [ ] Rate limiting, helmet, structured logging, a formal automated
      convergence integration test, health check endpoint
- [ ] Deployment