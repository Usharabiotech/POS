import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, setSession } from "../api";

export default function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // Trim to survive mobile keyboards / autofill that add stray spaces.
      const { data } = await api.post("/auth/login", {
        username: username.trim(),
        password: password.trim(),
      });
      setSession(data.token, data.user);
      nav("/");
    } catch {
      toast.error("Invalid username or password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="text-5xl">🍓</div>
          <h1 className="mt-2 text-2xl font-bold">CafePOS</h1>
          <p className="text-sm text-slate-500">Sign in to start selling</p>
        </div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Username</label>
        <input
          className="mb-4 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoCapitalize="none"
        />
        <label className="mb-1 block text-sm font-medium text-slate-600">Password</label>
        <input
          type="password"
          className="mb-6 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-4 text-center text-xs text-slate-400">
          Demo: admin / admin123 &nbsp;·&nbsp; cashier / cashier123
        </p>
      </form>
    </div>
  );
}
