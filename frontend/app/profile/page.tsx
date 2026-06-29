"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, BookOpen, Trophy } from "lucide-react";

import { BadgeGrid, type UserBadge } from "@/components/BadgeGrid";
import { BottomNav } from "@/components/bottomnav";
import { WorldCupLoader } from "@/components/WorldCupLoader";
import { supabase } from "@/lib/supabase/client";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

type MeResponse = {
  profile: {
    display_name: string | null;
    total_points: number | null;
    selected_badge_key?: string | null;
  } | null;
  avatar: {
    name: string | null;
    image_url: string | null;
  } | null;
  total_points: number;
};

export default function ProfilePage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [selectedBadgeKey, setSelectedBadgeKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "badges">("profile");
  const [selectingBadgeKey, setSelectingBadgeKey] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          window.location.href = "/login";
          return;
        }

        const [meResponse, badgesResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/me`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/badges/me`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
        ]);

        const meJson = await meResponse.json().catch(() => null);
        const badgesJson = await badgesResponse.json().catch(() => null);

        if (!meResponse.ok) {
          throw new Error(meJson?.detail || "Failed to load profile");
        }

        if (!badgesResponse.ok) {
          throw new Error(badgesJson?.detail || "Failed to load badges");
        }

        setMe(meJson);
        setBadges(badgesJson.data || []);
        setSelectedBadgeKey(badgesJson.selected_badge_key || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  async function selectBadge(badge: UserBadge) {
    try {
      setSelectingBadgeKey(badge.key);
      setError("");
      setSuccess("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch(`${API_BASE_URL}/badges/selected`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ badge_key: badge.key }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.detail || "Failed to select badge");
      }

      setSelectedBadgeKey(badge.key);
      setSuccess(`${badge.name} will appear next to your name.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSelectingBadgeKey(null);
    }
  }

  return (
    <main className="wc-page min-h-screen p-4 pb-24 text-white md:p-6">
      <section className="mx-auto max-w-5xl">
        <p className="wc-gold mb-2 text-sm font-bold uppercase tracking-[0.2em]">
          Account
        </p>

        <h1 className="mb-4 text-3xl font-black">Profile</h1>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-3xl border border-white/10 bg-white/5 p-2">
          <button
            onClick={() => setActiveTab("profile")}
            className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
              activeTab === "profile"
                ? "bg-yellow-500/20 text-yellow-100"
                : "text-slate-400 hover:bg-white/5"
            }`}
          >
            Main Profile
          </button>

          <button
            onClick={() => setActiveTab("badges")}
            className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
              activeTab === "badges"
                ? "bg-yellow-500/20 text-yellow-100"
                : "text-slate-400 hover:bg-white/5"
            }`}
          >
            Badges
          </button>
        </div>

        {loading ? (
          <div className="py-10">
            <WorldCupLoader />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            {error}
          </div>
        ) : (
          <>
            {success && (
              <p className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-green-300">
                {success}
              </p>
            )}

            {activeTab === "profile" && (
              <div className="wc-card mb-4 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    {me?.avatar?.image_url ? (
                      <img
                        src={me.avatar.image_url}
                        alt={me.avatar.name || "Avatar"}
                        className="h-20 w-20 rounded-full border-4 border-yellow-400 object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/10">
                        <Trophy className="h-8 w-8 text-yellow-300" />
                      </div>
                    )}

                    <div>
                      <p className="wc-muted text-sm">My Tournament Profile</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-black">
                          {me?.profile?.display_name || "Player"}
                        </h2>
                        {selectedBadgeKey && (
                          <img
                            src={
                              badges.find((badge) => badge.key === selectedBadgeKey)
                                ?.image_url
                            }
                            alt={
                              badges.find((badge) => badge.key === selectedBadgeKey)
                                ?.name || "Selected badge"
                            }
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        )}
                      </div>
                      <p className="mt-1 text-sm font-bold text-yellow-200">
                        {me?.total_points ?? me?.profile?.total_points ?? 0} pts
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveTab("badges")}
                    className="inline-flex items-center gap-2 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm font-black text-yellow-100 hover:bg-yellow-400/15"
                  >
                    <Award className="h-5 w-5" />
                    {badges.length} badges
                  </button>
                </div>
              </div>
            )}

            {activeTab === "badges" && (
              <div className="wc-card p-5">
                <div className="mb-4">
                  <p className="wc-gold text-xs font-black uppercase tracking-[0.22em]">
                    Collection
                  </p>
                  <h2 className="mt-1 text-2xl font-black">My Badges</h2>
                  <p className="wc-muted mt-1 text-sm">
                    Select one badge to appear next to your name on the
                    leaderboard.
                  </p>
                </div>

                <BadgeGrid
                  badges={badges}
                  selectedBadgeKey={selectedBadgeKey}
                  selectingBadgeKey={selectingBadgeKey}
                  onSelectBadge={selectBadge}
                />
              </div>
            )}
          </>
        )}

        <Link
          href="/rules"
          className="wc-card mt-4 flex items-center gap-4 p-5 transition hover:scale-[1.01]"
        >
          <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-yellow-200">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <p className="wc-gold mb-1 text-xs font-black uppercase tracking-[0.2em]">
              Road to 26
            </p>
            <h2 className="text-2xl font-black">Scoring Rules</h2>
            <p className="wc-muted mt-1">
              Review match, wildcard, champion, and underdog scoring.
            </p>
          </div>
        </Link>
      </section>

      <BottomNav />
    </main>
  );
}
