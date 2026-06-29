"use client";

import { useEffect, useState } from "react";
import { Award, CheckCircle2, Crown, Loader2 } from "lucide-react";

import { BadgeGrid, type UserBadge } from "@/components/BadgeGrid";
import { BottomNav } from "@/components/bottomnav";
import { WorldCupLoader } from "@/components/WorldCupLoader";
import { useAdminGuard } from "@/lib/useAdminGuard";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

type BadgeProfile = {
  id: string;
  display_name: string | null;
  total_points: number | null;
  has_winner_badge: boolean;
  badges: UserBadge[];
};

export default function AdminBadgesPage() {
  const { token, checkingAdmin } = useAdminGuard();
  const [profiles, setProfiles] = useState<BadgeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadProfiles(activeToken: string) {
    const response = await fetch(`${API_BASE_URL}/badges/admin/profiles`, {
      headers: {
        Authorization: `Bearer ${activeToken}`,
      },
      cache: "no-store",
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(json?.detail || "Failed to load badge admin data");
    }

    setProfiles(json.data || []);
  }

  useEffect(() => {
    async function init() {
      if (checkingAdmin || !token) return;

      try {
        setLoading(true);
        setError("");
        await loadProfiles(token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [checkingAdmin, token]);

  async function declareWinner(profile: BadgeProfile) {
    if (!token) return;

    try {
      setSavingUserId(profile.id);
      setMessage("");
      setError("");

      const response = await fetch(`${API_BASE_URL}/badges/admin/winner`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: profile.id }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.detail || "Failed to declare winner");
      }

      setMessage(`${profile.display_name || "Player"} declared as winner.`);
      await loadProfiles(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingUserId(null);
    }
  }

  if (checkingAdmin || loading) {
    return (
      <main className="wc-page flex min-h-screen items-center justify-center p-6 text-white">
        <WorldCupLoader />
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
          <h1 className="text-3xl font-black">Badge Control</h1>
          <p className="wc-muted mt-2">
            Point badges are automatic. Use this page to declare the final
            winner and trigger the winner announcement.
          </p>
        </div>

        {message && (
          <p className="mb-4 flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-green-300">
            <CheckCircle2 className="h-4 w-4" />
            {message}
          </p>
        )}

        {error && (
          <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">
            {error}
          </p>
        )}

        <div className="space-y-3">
          {profiles.map((profile, index) => {
            const isSaving = savingUserId === profile.id;

            return (
              <div
                key={profile.id}
                className={`wc-card p-4 ${
                  profile.has_winner_badge
                    ? "border-yellow-300/60"
                    : "border-white/10"
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10 text-sm font-black text-slate-200">
                        #{index + 1}
                      </span>
                      <h2 className="text-xl font-black text-white">
                        {profile.display_name || "Unknown Player"}
                      </h2>
                      {profile.has_winner_badge && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-yellow-300/40 bg-yellow-400/15 px-3 py-1 text-xs font-black text-yellow-100">
                          <Crown className="h-3 w-3" />
                          Winner
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm font-bold text-yellow-200">
                      {profile.total_points ?? 0} pts
                    </p>

                    <div className="mt-3">
                      <BadgeGrid badges={profile.badges || []} compact />
                    </div>
                  </div>

                  <button
                    onClick={() => declareWinner(profile)}
                    disabled={isSaving}
                    className="wc-button-gold shrink-0 px-5 py-3 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : profile.has_winner_badge ? (
                      <>
                        <Award className="h-5 w-5" />
                        Winner Declared
                      </>
                    ) : (
                      <>
                        <Crown className="h-5 w-5" />
                        Declare Winner
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <BottomNav />
    </main>
  );
}
