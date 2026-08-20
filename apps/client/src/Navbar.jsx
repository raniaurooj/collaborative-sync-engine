import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearAuth, getToken } from "./lib/auth";

const API_BASE = "http://localhost:4000";

function initials(name) {
  if (!name) return "?";
  return name.trim()[0].toUpperCase();
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 stroke-current">
      <path
        d="M6 8a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 12 6 8Z"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 19a2 2 0 0 0 4 0" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [hasUnread, setHasUnread] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_BASE}/documents/notifications`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setItems(data);
        setHasUnread(data.length > 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleOpen() {
    setOpen((o) => !o);
    if (!open && hasUnread) {
      setHasUnread(false); // clear the dot immediately, don't wait on the network
      fetch(`${API_BASE}/documents/notifications/mark-seen`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      }).catch(() => {});
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={handleOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
      >
        <BellIcon />
        {hasUnread && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-md border border-stone-200 bg-white py-1.5 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          {items.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-stone-400 dark:text-stone-500">
              No new invites
            </p>
          ) : (
            items.map((n) => (
              <button
                key={n.docId}
                onClick={() => {
                  setOpen(false);
                  navigate(`/write/${n.docId}`);
                }}
                className="block w-full px-3.5 py-2 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-800"
              >
                <p className="truncate text-stone-800 dark:text-stone-200">{n.title}</p>
                <p className="text-xs text-stone-400 dark:text-stone-500">
                  invited as {n.role}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AvatarMenu({ user }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleLogout() {
    clearAuth();
    navigate("/");
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 font-serif text-sm text-white transition hover:opacity-90 dark:bg-white dark:text-stone-900"
      >
        {initials(user?.name)}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-md border border-stone-200 bg-white py-1.5 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          <div className="border-b border-stone-100 px-3.5 py-2 dark:border-stone-800">
            <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-50">
              {user?.name}
            </p>
            <p className="truncate text-xs text-stone-400 dark:text-stone-500">
              {user?.email}
            </p>
          </div>
          <Link
            to="/dashboard"
            onClick={() => setOpen(false)}
            className="block px-3.5 py-2 text-sm text-stone-700 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Your documents
          </Link>
          <button
            onClick={handleLogout}
            className="block w-full px-3.5 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Navbar({ user, right }) {
  return (
    <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
      <Link to="/" className="font-serif text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
        Sync.
      </Link>
      <div className="flex items-center gap-2">
        {user ? (
          <>
            <NotificationBell />
            <AvatarMenu user={user} />
          </>
        ) : (
          right
        )}
      </div>
    </nav>
  );
}