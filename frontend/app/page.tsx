"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { BottomNav } from "@/components/bottomnav";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

type MeResponse = {
  onboarding_completed: boolean;
  profile: {
    id: string;
    display_name: string;
    avatar_id: string;
    is_admin: boolean;
  } | null;
  avatar: {
    id: string;
    name: string;
    image_url: string;
  } | null;
  champion: {
    prediction: {
      id: string;
      team_id: string;
      created_at: string;
    };
    team: {
      id: string;
      name: string;
      flag_url: string | null;
      fifa_rank: number | null;
      fifa_points: number | null;
    };
  } | null;
  total_points: number;
};

type ScoreResponse = {
  total_points?: number;
  score_events?: unknown[];
  data?: {
    total_points?: number;
  };
};

export default function HomePage() {
  const router = useRouter();

  const [data, setData] = useState<MeResponse | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMe() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push("/login");
          return;
        }

        const meResponse = await fetch(`${API_BASE_URL}/me`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        if (!meResponse.ok) {
          throw new Error("Failed to load profile");
        }

        const meResult: MeResponse = await meResponse.json();

        if (!meResult.onboarding_completed) {
          router.push("/onboarding");
          return;
        }

        setData(meResult);

        const scoreResponse = await fetch(`${API_BASE_URL}/scoring/me`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        const scoreResult: ScoreResponse | null = await scoreResponse
          .json()
          .catch(() => null);

        if (scoreResponse.ok && scoreResult) {
          const latestTotal =
            scoreResult.total_points ??
            scoreResult.data?.total_points ??
            meResult.total_points ??
            0;

          setTotalPoints(latestTotal);
        } else {
          setTotalPoints(meResult.total_points || 0);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    loadMe();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <main className="wc-page flex min-h-screen items-center justify-center p-6 text-white">
        <div className="wc-card p-6 text-center">
          <p className="wc-muted">Loading dashboard...</p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="wc-page flex min-h-screen items-center justify-center p-6 text-white">
        <div className="wc-card max-w-md p-6 text-center">
          <h1 className="mb-2 text-2xl font-black">Something went wrong</h1>
          <p className="wc-muted">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="wc-page min-h-screen p-4 pb-24 text-white md:p-6">
      <section className="mx-auto max-w-5xl">
        <div className="wc-card wc-card-glow wc-26-watermark mb-6 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <img
                src="/assets/wc26-logo.jpg"
                alt="Road to 26"
                className="h-20 w-20 shrink-0 rounded-[1.6rem] border border-white/15 object-cover shadow-xl shadow-yellow-500/15"
              />
              <div className="min-w-0">
                <p className="wc-gold mb-1 text-xs font-black uppercase tracking-[0.22em]">
                  Predict. Compete. Unite.
                </p>
                <h1 className="text-3xl font-black uppercase leading-tight">
                  Road to <span className="text-yellow-300">26</span>
                </h1>
                <p className="wc-muted mt-1 truncate text-sm">
                  Welcome, {data.profile?.display_name}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="wc-card p-5 md:col-span-2">
            <div className="flex items-center gap-4">
              {data.avatar && (
                <img
                  src={data.avatar.image_url}
                  alt={data.avatar.name}
                  className="h-24 w-24 rounded-full border-4 border-yellow-400 object-cover"
                />
              )}

              <div>
                <p className="wc-muted text-sm">Your Avatar</p>
                <h2 className="text-3xl font-black">{data.avatar?.name}</h2>
                <p className="wc-muted mt-1">
                  Ready to start your predictions.
                </p>
              </div>
            </div>
          </div>

          <div className="wc-card wc-card-glow p-5 text-center">
            <p className="wc-muted text-sm">Total Points</p>
            <h2 className="text-5xl font-black text-green-400">
              {totalPoints}
            </h2>
            <p className="wc-muted mt-1 text-sm">Current score</p>
          </div>
        </div>

        <div className="mb-6 wc-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="wc-gold text-sm font-bold uppercase tracking-[0.2em]">
                Champion Pick
              </p>
              <h2 className="text-2xl font-black">
                {data.champion?.team.name}
              </h2>
            </div>

            <div className="rounded-full bg-yellow-400/10 px-4 py-2 text-sm font-black text-yellow-300">
              +50 pts if correct
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-3xl border border-white/10 bg-black/25 p-4">
            {data.champion?.team.flag_url && (
              <img
                src={data.champion.team.flag_url}
                alt={data.champion.team.name}
                className="h-20 w-20 rounded-full border-2 border-white/20 object-cover"
              />
            )}

            <div>
              <h3 className="text-xl font-black">{data.champion?.team.name}</h3>
              <p className="wc-muted text-sm">
                Rank #{data.champion?.team.fifa_rank ?? "-"} ·{" "}
                {data.champion?.team.fifa_points ?? "-"} pts
              </p>
              <p className="mt-2 text-sm text-yellow-100/80">
                This prediction is locked and cannot be changed.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            onClick={() => router.push("/groups")}
            className="wc-card p-5 text-left transition hover:scale-[1.01]"
          >
            <p className="wc-gold mb-2 text-sm font-bold uppercase tracking-[0.2em]">
              Next
            </p>
            <h2 className="text-2xl font-black">Group Predictions</h2>
            <p className="wc-muted mt-2">
              Predict group standings, group matches, and wildcards.
            </p>
          </button>

          <button
            onClick={() => router.push("/scoreboard")}
            className="wc-card p-5 text-left transition hover:scale-[1.01]"
          >
            <p className="wc-gold mb-2 text-sm font-bold uppercase tracking-[0.2em]">
              Rankings
            </p>
            <h2 className="text-2xl font-black">Scoreboard</h2>
            <p className="wc-muted mt-2">
              View global and club leaderboards.
            </p>
          </button>
        </div>
      </section>

      <BottomNav />
    </main>
  );
}
