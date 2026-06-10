"use client";

import { useEffect, useState } from "react";
import {
  Crown,
  Loader2,
  Medal,
  Shield,
  Trophy,
  Users,
} from "lucide-react";

import { BottomNav } from "@/components/bottomnav";
import { supabase } from "@/lib/supabase/client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type Avatar = {
  id: string;
  name?: string | null;
  image_url?: string | null;
};

type Player = {
  id: string;
  display_name: string | null;
  total_points: number | null;
  avatar_id?: string | null;
  rank: number;
  avatar?: Avatar | null;
};

type Club = {
  id: string;
  name: string;
  invite_code: string;
  my_role: string;
  members_count: number;
};

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) {
    return <Crown className="h-5 w-5 text-yellow-300" />;
  }

  if (rank === 2) {
    return <Medal className="h-5 w-5 text-slate-300" />;
  }

  if (rank === 3) {
    return <Medal className="h-5 w-5 text-orange-300" />;
  }

  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 text-xs font-black text-slate-300">
      {rank}
    </div>
  );
}

function PlayerRow({ player }: { player: Player }) {
  const podiumClass =
    player.rank === 1
      ? "border-yellow-300/50 bg-yellow-400/12 shadow-yellow-500/15"
      : player.rank === 2
      ? "border-slate-200/35 bg-slate-200/10"
      : player.rank === 3
      ? "border-orange-300/40 bg-orange-400/10"
      : "border-white/10 bg-white/5";

  return (
    <div
      className={`wc-leaderboard-card flex items-center justify-between border p-4 shadow-lg ${podiumClass}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/10">
          <RankIcon rank={player.rank} />
        </div>

        {player.avatar?.image_url ? (
          <img
            src={player.avatar.image_url}
            alt={player.display_name || "Player avatar"}
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-full bg-white/10" />
        )}

        <div className="min-w-0">
          <p className="truncate font-black text-white">
            {player.display_name || "Unknown Player"}
          </p>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Rank #{player.rank}
          </p>
        </div>
      </div>

      <div className="text-right">
        <p className="text-xl font-black text-yellow-300">
          {player.total_points ?? 0}
        </p>
        <p className="text-xs font-bold text-slate-500">PTS</p>
      </div>
    </div>
  );
}

export default function ScoreboardPage() {
  const [token, setToken] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"global" | "club">("global");

  const [globalPlayers, setGlobalPlayers] = useState<Player[]>([]);
  const [clubPlayers, setClubPlayers] = useState<Player[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);

  const [loading, setLoading] = useState(true);
  const [clubLoading, setClubLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadGlobalScoreboard(accessToken: string) {
    const response = await fetch(`${API_BASE_URL}/scoreboard/global`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(json?.detail || "Failed to load global scoreboard");
    }

    setGlobalPlayers(json.data || []);
  }

  async function loadMyClubs(accessToken: string) {
    const response = await fetch(`${API_BASE_URL}/clubs/my`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(json?.detail || "Failed to load clubs");
    }

    const loadedClubs: Club[] = json.data || [];
    setClubs(loadedClubs);

    if (loadedClubs.length > 0) {
      setSelectedClub(loadedClubs[0]);
      await loadClubScoreboard(loadedClubs[0].id, accessToken);
    }
  }

  async function loadClubScoreboard(clubId: string, accessToken?: string) {
    const activeToken = accessToken || token;

    if (!activeToken) return;

    try {
      setClubLoading(true);
      setError("");

      const response = await fetch(`${API_BASE_URL}/scoreboard/club/${clubId}`, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
        cache: "no-store",
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.detail || "Failed to load club scoreboard");
      }

      setClubPlayers(json.data || []);
    } catch (err) {
      setClubPlayers([]);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setClubLoading(false);
    }
  }

  function selectClub(club: Club) {
    setSelectedClub(club);
    loadClubScoreboard(club.id);
  }

  useEffect(() => {
    async function init() {
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

        setToken(session.access_token);

        await loadGlobalScoreboard(session.access_token);
        await loadMyClubs(session.access_token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  const visiblePlayers = activeTab === "global" ? globalPlayers : clubPlayers;

  return (
    <main className="wc-page min-h-screen pb-28">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="wc-card wc-card-glow mb-6 flex items-center justify-between p-5">
          <div>
            <p className="wc-gold text-xs font-bold uppercase tracking-[0.3em]">
              Leaderboard
            </p>
            <h1 className="mt-2 text-3xl font-black text-white">Scores</h1>
            <p className="mt-2 text-sm text-slate-400">
              Track global and club rankings.
            </p>
          </div>

          <div className="rounded-3xl bg-yellow-400/15 p-3 text-yellow-300">
            <Trophy className="h-7 w-7" />
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 rounded-3xl border border-white/10 bg-white/5 p-2">
          <button
            onClick={() => setActiveTab("global")}
            className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
              activeTab === "global"
                ? "bg-yellow-500/20 text-yellow-100"
                : "text-slate-400 hover:bg-white/5"
            }`}
          >
            Global
          </button>

          <button
            onClick={() => setActiveTab("club")}
            className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
              activeTab === "club"
                ? "bg-yellow-500/20 text-yellow-100"
                : "text-slate-400 hover:bg-white/5"
            }`}
          >
            Club
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-semibold text-red-200">
            {error}
          </div>
        )}

        {activeTab === "club" && (
          <section className="mb-5">
            {clubs.length === 0 ? (
              <div className="wc-card py-8 text-center">
                <Users className="mx-auto mb-3 h-8 w-8 text-slate-500" />
                <p className="font-bold text-white">No clubs yet</p>
                <p className="mt-1 text-sm text-slate-400">
                  Create or join a club first.
                </p>
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {clubs.map((club) => {
                  const isSelected = selectedClub?.id === club.id;

                  return (
                    <button
                      key={club.id}
                      onClick={() => selectClub(club)}
                      className={`shrink-0 rounded-2xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? "border-yellow-300/50 bg-yellow-400/15"
                          : "border-white/10 bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-yellow-300" />
                        <span className="font-black text-white">
                          {club.name}
                        </span>
                      </div>

                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {club.members_count} members
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {loading || clubLoading ? (
          <div className="wc-card flex items-center justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-blue-300" />
          </div>
        ) : visiblePlayers.length === 0 ? (
          <div className="wc-card py-10 text-center">
            <Trophy className="mx-auto mb-3 h-9 w-9 text-slate-500" />
            <p className="text-lg font-black text-white">No players yet</p>
            <p className="mt-2 text-sm text-slate-400">
              Rankings will appear here once players join.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visiblePlayers.map((player) => (
              <PlayerRow key={player.id} player={player} />
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
