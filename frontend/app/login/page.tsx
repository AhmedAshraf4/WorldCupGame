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
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 text-center shadow-xl">
          <p className="text-slate-300">Checking session...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h1 className="mb-2 text-3xl font-bold">World Cup Challenge</h1>

        <p className="mb-6 text-slate-300">
          {mode === "login"
            ? "Login to continue your tournament predictions."
            : "Create your account and join the challenge."}
        </p>

        <div className="mb-4 flex rounded-xl bg-slate-800 p-1">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${
              mode === "login" ? "bg-white text-slate-950" : "text-slate-300"
            }`}
          >
            Login
          </button>

          <button
            onClick={() => setMode("register")}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${
              mode === "register" ? "bg-white text-slate-950" : "text-slate-300"
            }`}
          >
            Register
          </button>
        </div>

        <label className="mb-2 block text-sm text-slate-300">Email</label>
        <input
          className="mb-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-400"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          placeholder="you@example.com"
        />

        <label className="mb-2 block text-sm text-slate-300">Password</label>
        <input
          className="mb-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-400"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          placeholder="••••••••"
        />

        {message && (
          <p className="mb-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">
            {message}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !email || !password}
          className="w-full rounded-xl bg-blue-500 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
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