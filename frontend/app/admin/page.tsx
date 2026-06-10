"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseZap, Loader2, Lock, RefreshCw, Trophy } from "lucide-react";

import { BottomNav } from "@/components/bottomnav";
import { useAdminGuard } from "@/lib/useAdminGuard";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export default function AdminPage() {
  const router = useRouter();
  const { token, checkingAdmin } = useAdminGuard();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function runAction(path: string, label: string) {
    if (!token) return;

    try {
      setBusyAction(label);
      setMessage("");
      setError("");

      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.detail || `Failed to run ${label}`);
      }

      setMessage(`${label} completed successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyAction(null);
    }
  }

  if (checkingAdmin) {
    return (
      <main className="wc-page flex min-h-screen items-center justify-center p-6 text-white">
        <div className="wc-card flex items-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-blue-300" />
          <p className="wc-muted font-bold">Checking admin access...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="wc-page min-h-screen p-4 pb-24 text-white md:p-6">
      <section className="mx-auto max-w-5xl">
        <div className="mb-6">
          <p className="wc-gold mb-2 text-sm font-bold uppercase tracking-[0.2em]">
            Admin
          </p>
          <h1 className="text-3xl font-black">Control Center</h1>
          <p className="wc-muted mt-2">
            Manage results, locks, score recalculation, and data sync.
          </p>
        </div>

        {message && (
          <p className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-green-300">
            {message}
          </p>
        )}

        {error && (
          <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">
            {error}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <button
            onClick={() => router.push("/admin/results")}
            className="wc-card p-5 text-left transition hover:bg-white/10"
          >
            <Trophy className="mb-4 h-7 w-7 text-yellow-300" />
            <h2 className="text-2xl font-black">Results Control</h2>
            <p className="wc-muted mt-2">Enter match and group results.</p>
          </button>

          <button
            onClick={() => router.push("/admin/locks")}
            className="wc-card p-5 text-left transition hover:bg-white/10"
          >
            <Lock className="mb-4 h-7 w-7 text-blue-300" />
            <h2 className="text-2xl font-black">Prediction Locks</h2>
            <p className="wc-muted mt-2">Control open and deadline windows.</p>
          </button>

          <button
            onClick={() => runAction("/scoring/recalculate", "Recalculate Scores")}
            disabled={Boolean(busyAction)}
            className="wc-card p-5 text-left transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={`mb-4 h-7 w-7 text-green-300 ${
                busyAction === "Recalculate Scores" ? "animate-spin" : ""
              }`}
            />
            <h2 className="text-2xl font-black">Recalculate Scores</h2>
            <p className="wc-muted mt-2">Rebuild score events and totals.</p>
          </button>

          <button
            onClick={() =>
              runAction("/admin/sync/football-data", "Sync Football Data")
            }
            disabled={Boolean(busyAction)}
            className="wc-card p-5 text-left transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <DatabaseZap
              className={`mb-4 h-7 w-7 text-red-300 ${
                busyAction === "Sync Football Data" ? "animate-pulse" : ""
              }`}
            />
            <h2 className="text-2xl font-black">Sync Football Data</h2>
            <p className="wc-muted mt-2">Pull fixture and result updates.</p>
          </button>
        </div>
      </section>

      <BottomNav />
    </main>
  );
}
