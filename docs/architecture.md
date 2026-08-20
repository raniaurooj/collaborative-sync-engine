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

Before merge (each peer has diverged)
A (local view): Hello World
B (local view): Hello There

After merge
A (final): Hello ThereWorld
B (final): Hello ThereWorld

Convergence check
A === B: true

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

## Phase 3.5: Real Auth & Per-Document Authorization

The guest-token auth from Phase 3 let anyone join any `roomId` — no
check that a specific user was permitted to view or edit a specific
document. This phase closes that gap.

### Models
- **`User`** — email, bcrypt-hashed password (`passwordHash`, never
  `password`, to make it structurally obvious the field is never
  plaintext), name.
- **`Document`** — title, `owner` (ref to `User`), `collaborators`
  (array of `{ user, role }`, role is `"editor"` or `"viewer"`). A
  single `roleFor(userId)` method lives on the schema and is the *only*
  place permission logic is implemented — both the REST layer and the
  WebSocket layer call this same method, so there's one source of truth
  for "can this user do X to this document," not two implementations
  that could drift out of sync.

### REST layer
`POST /auth/signup`, `POST /auth/login` issue JWTs. `POST /documents`
creates a document (requester becomes owner); `GET /documents` lists
documents the user owns or collaborates on; `POST /documents/:id/collaborators`
lets the owner invite another user by email with a role. All gated by
a `requireAuth` middleware that verifies the JWT and attaches the
decoded payload to `req.user`.

**Design choice — REST-first document creation, not auto-create-on-connect:**
a document must exist as a real, owned `Document` record before anyone
can open it in the editor. This mirrors how every real product in this
space works (Google Docs, Notion — you always open a document from a
list, the editor never creates one implicitly) and makes ownership and
authorization well-defined from the moment a document exists, rather
than needing to retroactively answer "who owns this" for a
`roomId` that only ever existed because a socket connected.

### WebSocket-layer enforcement
The auth handshake now looks up the target document and calls
`doc.roleFor(userId)`. No role → connection is closed (`4004`). A
`"viewer"` role can connect and receive live document state and
awareness (see Phase 4) but any `MSG_DOC` update they send is silently
dropped server-side before ever touching `room.doc` — permission is
enforced at the point of applying an edit, not just at the UI level,
so a viewer can't bypass the restriction by talking to the WebSocket
directly.

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

## Phase 4.5: Awareness — Live Cursors & Presence

Awareness (cursor position, selection, user name/color) is deliberately
**never persisted** — it's not a limitation, it's the correct model.
Document content is durable state that must survive restarts and be
true regardless of who's online; a cursor position has no meaning for
someone who isn't currently looking at the document. Mixing the two
would mean every reconnecting client replays historical cursor noise
that was only ever meant to be seen live.

### Wire protocol change
Previously every WebSocket message was a raw, unframed Yjs document
update. Awareness needed its own channel that could never be mistaken
for document content, so every message now carries a 1-byte type prefix:
`0` = document update, `1` = awareness update, `2` = state vector (see
Phase 5). The server relays awareness messages to the room exactly like
document updates, but never applies them to `room.doc` and never
persists them — they're pure ephemeral relay.

`y-quill`'s built-in cursor rendering (`quill-cursors` module) consumes
the `Awareness` instance directly, so remote cursors render with no
custom overlay code. On clean disconnect, the provider broadcasts an
empty awareness state for its own client ID so peers' cursor overlays
clear immediately rather than waiting on a timeout.

---

## Phase 5: Resilience

### Reconnect with exponential backoff
`YjsWebsocketProvider` retries with backoff (500ms base, doubling, capped
at 15s, with jitter) on any disconnect. One real bug found during
testing: the retry chain could die silently after exactly one failed
attempt if the *token fetch* (not the WebSocket itself) failed — since
only the WebSocket's `onclose` event was wired to trigger a retry, and
a failed `fetch` never gets that far. Fixed by explicitly catching and
rescheduling from the fetch failure path too, not just `onclose`.

### Heartbeat
Server pings every connected client every 30s and terminates any
connection that didn't respond with a pong since the last check — a
dead TCP connection doesn't always fire a clean `close` event, so
without this, a half-open connection could sit in `room.clients`
indefinitely, silently failing to receive relayed updates.

### Bidirectional state-vector resync
On reconnect, the client sends its current state vector instead of a
bare rejoin request; the server responds with only the diff the client
is actually missing (`Y.encodeStateAsUpdate(doc, clientStateVector)`),
not the full document — this degrades gracefully to "send everything"
for a brand-new client with an empty state vector, so it's one code
path, not two.

This only solved half the problem. Edits made *while disconnected* were
never sent anywhere (the socket wasn't open), and the original resync
only asked "what does the server have that I'm missing" — never the
reverse. First fix: on reconnect, resend the client's entire local
state, relying on Yjs's update idempotency (applying an already-known
operation is a safe no-op) to make this correct if wasteful. Second,
better fix: the server now also sends *its* state vector back on
connect, so the client can compute a true two-way diff and send back
only what the server is actually missing — proportional to the size of
the offline edit, not the whole document.

### Race condition: concurrent room creation
Testing three tabs reconnecting to the same room simultaneously (all
three retrying after one server restart) surfaced a real bug:
`getOrCreateRoom`'s `if (rooms.has(roomId))` check and the subsequent
`await loadDocument(roomId)` left a window where multiple concurrent
calls for the same `roomId` would all see "not yet created" and each
independently construct a separate `Y.Doc`, with the last one to finish
silently overwriting the others in the `rooms` Map — leaving different
clients holding references to different, isolated documents that never
synced with each other despite all showing "connected."

Fixed with a singleflight pattern: the first concurrent caller for a
given `roomId` stores an in-flight creation `Promise` before its first
`await`; every other concurrent caller for the same `roomId` awaits that
same promise instead of starting its own. Exactly one `Y.Doc` gets
created per room regardless of how many connections arrive at once.

---

## Known Limitations / Next Phases

- [ ] Horizontal scaling via Redis pub/sub — removing the assumption
      that room state lives in one server instance's memory
- [ ] Rate limiting, helmet, structured logging, a formal automated
      convergence integration test, health check endpoint
- [ ] Deployment
- [ ] Debounced-save crash window: an edit applied to `room.doc` is not
      durable until the 2s debounce fires — if the server process dies
      inside that window, that edit is lost. Known tradeoff, not fixed;
      a stricter design would use synchronous per-edit writes or a
      write-ahead log.
- [ ] Idle rooms are never evicted from the in-memory `rooms` Map after
      all clients disconnect — unbounded memory growth over a very long
      server lifetime with many documents, not yet addressed.


### Testing gotcha: localStorage is shared across tabs
Multi-user auth flows can't be tested with two regular tabs of the same
browser — localStorage is scoped to the origin, not the tab, so logging
into a second account in one tab silently overwrites the token the
first tab was using. Verified end-to-end (owner editing, invited viewer
correctly locked to read-only) using two separate browser contexts
(regular window + a different browser), not two tabs.