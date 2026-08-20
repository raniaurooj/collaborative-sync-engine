import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { saveAuth } from "./lib/auth";
import Navbar from "./Navbar.jsx"

const API_BASE = "http://localhost:4000";

export default function AuthPage() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const isSignup = mode === "signup";

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = isSignup ? "/auth/signup" : "/auth/login";
      const body = isSignup ? { email, password, name } : { email, password };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      saveAuth(data.token, data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F5F0] px-6 dark:bg-stone-950">
      <div className="w-full max-w-sm">
        <Navbar
          right={
            <Link to="/write" className="text-sm text-stone-500 underline underline-offset-2 dark:text-stone-400">
              Start writing instead
            </Link>
          }
        />
        <div className="rounded-lg border border-stone-200 bg-white p-7 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <h1 className="font-serif text-2xl text-stone-900 dark:text-stone-50">
            {isSignup ? "Create an account" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
            {isSignup
              ? "Save documents, invite collaborators, export your work."
              : "Sign in to access your documents."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {isSignup && (
              <div>
                <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-50"
                  placeholder="Ada Lovelace"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-50"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-50"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
            >
              {loading ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-stone-500 dark:text-stone-400">
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? "login" : "signup");
                setError(null);
              }}
              className="font-medium text-stone-900 underline underline-offset-2 dark:text-stone-100"
            >
              {isSignup ? "Sign in" : "Sign up"}
            </button>
          </p>
        </div>

        <p className="mt-5 text-center text-sm text-stone-500 dark:text-stone-400">
          <Link to="/write" className="underline underline-offset-2">
            Or start writing without an account →
          </Link>
        </p>
      </div>
    </div>
  );
}