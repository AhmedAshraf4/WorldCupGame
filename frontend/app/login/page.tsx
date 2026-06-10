"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

const DASHBOARD_ROUTE = "/";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [message, setMessage] = useState("");

  async function redirectByOnboardingStatus(accessToken: string) {
    const response = await fetch(`${API_BASE_URL}/onboarding/status`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const json = await response.json().catch(() => null);

    if (response.ok && json?.is_complete) {
      router.replace(DASHBOARD_ROUTE);
      return;
    }

    router.replace("/onboarding");
  }

  useEffect(() => {
    async function checkExistingSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setCheckingSession(false);
          return;
        }

        await redirectByOnboardingStatus(session.access_token);
      } catch {
        setCheckingSession(false);
      }
    }

    checkExistingSession();
  }, []);

  async function handleSubmit() {
    setLoading(true);
    setMessage("");

    try {
      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        if (data.session) {
          router.replace("/onboarding");
          return;
        }

        setMessage(
          "Account created. Check your email if confirmation is enabled, then login."
        );
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      if (!data.session) {
        setMessage("Login succeeded, but no session was returned.");
        return;
      }

      await redirectByOnboardingStatus(data.session.access_token);
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="wc-page flex min-h-screen items-center justify-center p-6 text-white">
        <section className="wc-card w-full max-w-md p-6 text-center">
          <p className="wc-muted">Checking session...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="wc-page flex min-h-screen items-center justify-center p-5 text-white">
      <section className="wc-card wc-card-glow wc-26-watermark w-full max-w-md p-6 shadow-xl">
        <div className="mb-6 text-center">
          <img
            src="/assets/wc26-logo.jpg"
            alt="Road to 26"
            className="mx-auto mb-4 h-28 w-28 rounded-[2rem] border border-white/15 object-cover shadow-2xl shadow-yellow-500/15"
          />
          <p className="wc-gold mb-2 text-xs font-black uppercase tracking-[0.32em]">
            Predict. Compete. Unite.
          </p>
          <h1 className="text-4xl font-black uppercase tracking-tight">
            Road to <span className="text-yellow-300">26</span>
          </h1>
        </div>

        <p className="wc-muted mb-6 text-center text-sm">
          {mode === "login"
            ? "Login to continue your tournament predictions."
            : "Create your account and join the challenge."}
        </p>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1">
          <button
            onClick={() => setMode("login")}
            className={`rounded-xl px-4 py-3 text-sm font-black uppercase tracking-wide transition ${
              mode === "login"
                ? "bg-yellow-500/20 text-yellow-100 shadow-inner shadow-yellow-500/10"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            Login
          </button>

          <button
            onClick={() => setMode("register")}
            className={`rounded-xl px-4 py-3 text-sm font-black uppercase tracking-wide transition ${
              mode === "register"
                ? "bg-yellow-500/20 text-yellow-100 shadow-inner shadow-yellow-500/10"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            Register
          </button>
        </div>

        <label className="mb-2 block text-sm font-bold text-slate-300">
          Email
        </label>
        <input
          className="mb-4 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-semibold outline-none focus:border-yellow-400"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          placeholder="you@example.com"
        />

        <label className="mb-2 block text-sm font-bold text-slate-300">
          Password
        </label>
        <input
          className="mb-4 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-semibold outline-none focus:border-yellow-400"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          placeholder="••••••••"
        />

        {message && (
          <p className="mb-4 rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-3 text-sm font-semibold text-yellow-100">
            {message}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !email || !password}
          className="wc-button w-full px-4 py-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Please wait..."
            : mode === "login"
              ? "Login"
              : "Create account"}
        </button>
      </section>
    </main>
  );
}
