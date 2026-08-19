import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const FRAMES = [
  { text: "Hello ", cursor: "alice", pos: 6 },
  { text: "Hello Wor", cursor: "alice", pos: 9 },
  { text: "Hello World", cursor: "alice", pos: 11 },
  { text: "Hello World", cursor: "ben", pos: 6 },
  { text: "Hello there World", cursor: "ben", pos: 11 },
  { text: "Hello there, World", cursor: "ben", pos: 12 },
  { text: "Hello there, World", cursor: null, pos: 0 },
];

const CURSORS = {
  alice: { label: "Alice", color: "bg-indigo-500", text: "text-indigo-600 dark:text-indigo-400" },
  ben: { label: "Ben", color: "bg-teal-500", text: "text-teal-600 dark:text-teal-400" },
};

function LiveMergeDemo() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
    }, 900);
    return () => clearInterval(id);
  }, []);

  const current = FRAMES[frame];
  const cursor = current.cursor ? CURSORS[current.cursor] : null;
  const before = current.text.slice(0, current.pos);
  const after = current.text.slice(current.pos);

  return (
    <div className="relative w-full max-w-sm rotate-2 rounded-lg border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-700 dark:bg-stone-900">
      <div className="mb-4 flex items-center justify-between font-mono text-[11px] text-stone-400 dark:text-stone-500">
        <span>room · default</span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          synced
        </span>
      </div>

      <p className="min-h-[3rem] font-serif text-lg leading-relaxed text-stone-800 dark:text-stone-100">
        {before}
        {cursor && (
          <span className="relative inline-block w-0">
            <span className={`absolute -top-4 left-0 whitespace-nowrap rounded px-1 py-0.5 font-mono text-[9px] text-white ${cursor.color}`}>
              {cursor.label}
            </span>
            <span className={`inline-block h-4 w-[2px] translate-y-[3px] animate-pulse ${cursor.color}`} />
          </span>
        )}
        {after}
      </p>

      <div className="mt-4 flex gap-3 font-mono text-[11px] text-stone-400 dark:text-stone-500">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" /> Alice
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> Ben
        </span>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    title: "Conflict-free by design",
    body: "Every edit merges deterministically, even when two people type the same word at the same instant. Nothing is ever silently overwritten.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 stroke-current">
        <path d="M4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0Z" strokeWidth="1.5" />
        <path d="m9 12 2 2 4-4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Live presence",
    body: "See exactly where your collaborators are, cursor by cursor, in real time — no refresh, no polling.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 stroke-current">
        <circle cx="8" cy="9" r="3" strokeWidth="1.5" />
        <circle cx="16" cy="9" r="3" strokeWidth="1.5" />
        <path d="M3 20c0-2.8 2.2-5 5-5s5 2.2 5 5M11 20c0-2.8 2.2-5 5-5s5 2.2 5 5" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Edit offline, sync after",
    body: "Lose your connection mid-sentence and keep typing. The moment you're back, your edits merge in — nothing lost, nothing duplicated.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 stroke-current">
        <path d="M4 16.5A4.5 4.5 0 0 1 8.5 12h.34a6 6 0 0 1 11.66 1.5A3.5 3.5 0 0 1 17 17H7a3 3 0 0 1-3-3.5Z" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-stone-900 dark:bg-stone-950 dark:text-stone-50">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-serif text-xl font-semibold tracking-tight">Sync.</span>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-50"
          >
            Sign in
          </Link>
          <Link
            to="/write"
            className="rounded-md bg-stone-900 px-3.5 py-1.5 text-sm text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
          >
            Start writing
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
        <div>
          <span className="mb-5 inline-block rounded-full border border-stone-300 px-3 py-1 font-mono text-[11px] tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
            REAL-TIME · CRDT-BACKED
          </span>
          <h1 className="font-serif text-4xl leading-tight tracking-tight md:text-5xl">
            Write together.
            <br />
            Never lose a word.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-stone-600 dark:text-stone-400">
            A collaborative editor built so two people can type into the same
            sentence at the same moment — and both edits survive.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/write"
              className="rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
            >
              Start writing — no account needed
            </Link>
            <Link
              to="/login"
              className="rounded-md border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 hover:border-stone-400 dark:border-stone-700 dark:text-stone-300 dark:hover:border-stone-500"
            >
              Sign in
            </Link>
          </div>
        </div>

        <div className="flex justify-center md:justify-end">
          <LiveMergeDemo />
        </div>
      </section>

      <section className="mx-auto max-w-6xl border-t border-stone-200 px-6 py-14 dark:border-stone-800">
        <div className="grid gap-10 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <div className="mb-3 text-stone-400 dark:text-stone-500">{f.icon}</div>
              <h3 className="mb-1.5 font-serif text-lg">{f.title}</h3>
              <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 font-mono text-[11px] text-stone-400 dark:text-stone-600">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>React</span>
          <span>·</span>
          <span>Yjs</span>
          <span>·</span>
          <span>WebSocket</span>
          <span>·</span>
          <span>MongoDB</span>
        </div>
      </footer>
    </div>
  );
}