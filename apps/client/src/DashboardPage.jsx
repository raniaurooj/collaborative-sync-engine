import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getToken, getUser, clearAuth } from "./lib/auth";
import Navbar from "./Navbar";

const API_BASE = "http://localhost:4000";

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 stroke-current">
      <path d="M12 5v14M5 12h14" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DocCard({ doc, onOpen, onInviteClick, showInvite }) {
  return (
    <button
      onClick={() => onOpen(doc.id)}
      className="group flex aspect-[3/4] w-full flex-col rounded-md border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:border-stone-400 hover:shadow-md dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-600"
    >
      <div className="flex flex-1 items-start justify-center pt-6">
        <span className="font-serif text-sm text-stone-300 dark:text-stone-700">Aa</span>
      </div>

      <div className="mt-2 flex items-start justify-between gap-2 border-t border-stone-100 pt-2 dark:border-stone-800">
        <div className="min-w-0">
          <p className="truncate font-serif text-sm text-stone-900 dark:text-stone-50">
            {doc.title}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-stone-400 dark:text-stone-500">
            {new Date(doc.updatedAt).toLocaleDateString()}
          </p>
        </div>

        {showInvite && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onInviteClick(doc.id);
            }}
            className="shrink-0 text-[11px] text-stone-400 opacity-0 underline underline-offset-2 group-hover:opacity-100 hover:text-stone-700 dark:hover:text-stone-200"
          >
            Invite
          </span>
        )}
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [inviteOpenFor, setInviteOpenFor] = useState(null);
  const navigate = useNavigate();
  const user = getUser();

  useEffect(() => {
    if (!getToken()) {
      navigate("/login");
      return;
    }
    loadDocs();
  }, []);

  async function loadDocs() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/documents`, { headers: authHeaders() });
      if (res.status === 401) {
        clearAuth();
        navigate("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load documents");
      setDocs(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/documents`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ title: "Untitled" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create document");
      navigate(`/write/${data.id}`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  function handleLogout() {
    clearAuth();
    navigate("/");
  }

  const owned = docs.filter((d) => d.role === "editor" || d.role === "owner");
  const shared = docs.filter((d) => !owned.includes(d));

  return (
    <div className="min-h-screen bg-[#F7F5F0] dark:bg-stone-950">
      
      <Navbar user = {user}/>

      <div className="mx-auto max-w-5xl px-6 pb-16">
        {error && (
          <p className="mb-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        <p className="mb-3 mt-4 font-mono text-[11px] uppercase tracking-wide text-stone-400 dark:text-stone-500">
          Start a new document
        </p>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="mb-10 flex aspect-[3/4] w-32 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-stone-300 text-stone-400 transition hover:border-stone-500 hover:text-stone-600 disabled:opacity-60 dark:border-stone-700 dark:hover:border-stone-500"
        >
          <PlusIcon />
          <span className="text-xs">{creating ? "Creating…" : "Blank"}</span>
        </button>

        {loading ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
        ) : (
          <>
            {owned.length > 0 && (
              <section className="mb-10">
                <p className="mb-3 font-mono text-[11px] uppercase tracking-wide text-stone-400 dark:text-stone-500">
                  Owned by you
                </p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {owned.map((doc) => (
                    <DocCard
                      key={doc.id}
                      doc={doc}
                      onOpen={(id) => navigate(`/write/${id}`)}
                      showInvite
                      onInviteClick={(id) =>
                        setInviteOpenFor(inviteOpenFor === id ? null : id)
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {shared.length > 0 && (
              <section>
                <p className="mb-3 font-mono text-[11px] uppercase tracking-wide text-stone-400 dark:text-stone-500">
                  Shared with you
                </p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {shared.map((doc) => (
                    <DocCard
                      key={doc.id}
                      doc={doc}
                      onOpen={(id) => navigate(`/write/${id}`)}
                      showInvite={false}
                    />
                  ))}
                </div>
              </section>
            )}

            {docs.length === 0 && (
              <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">
                No documents yet — create your first one above.
              </p>
            )}
          </>
        )}

        {inviteOpenFor && (
          <InviteModal docId={inviteOpenFor} onClose={() => setInviteOpenFor(null)} />
        )}
      </div>
    </div>
  );
}

function InviteModal({ docId, onClose }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [status, setStatus] = useState(null);

  async function handleInvite(e) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch(`${API_BASE}/documents/${docId}/collaborators`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to invite");
      setStatus("done");
      setTimeout(onClose, 900);
    } catch (err) {
      setStatus(err.message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
      onClick={onClose}
    >
      <form
        onSubmit={handleInvite}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-stone-900"
      >
        <h3 className="mb-3 font-serif text-lg text-stone-900 dark:text-stone-50">
          Invite a collaborator
        </h3>
        <input
          type="email"
          required
          autoFocus
          placeholder="collaborator@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-2 w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-50"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="mb-3 w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-50"
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-stone-500">
            Cancel
          </button>
          <button type="submit" className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white dark:bg-white dark:text-stone-900">
            {status === "sending" ? "Sending…" : "Send invite"}
          </button>
        </div>
        {status && status !== "sending" && status !== "done" && (
          <p className="mt-2 text-xs text-red-500">{status}</p>
        )}
        {status === "done" && <p className="mt-2 text-xs text-emerald-600">Invited!</p>}
      </form>
    </div>
  );
}