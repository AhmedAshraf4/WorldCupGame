"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Loader2,
  Shield,
  Trophy,
} from "lucide-react";

import { BottomNav } from "@/components/bottomnav";
import { PredictionLockBadge } from "@/components/PredictionLockBadge";
import {
  mapLocksByKey,
  type LockStatus,
} from "@/lib/locks";
import { supabase } from "@/lib/supabase/client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type Team = {
  id: string;
  name: string;
  flag_url?: string | null;
  fifa_rank?: number | null;
};

type KnockoutPrediction = {
  id: string;
  user_id: string;
  match_id: string;
  predicted_winner_team_id: string;
};

type KnockoutMatch = {
  id: string;
  round_name?: string | null;
  round?: string | null;
  stage?: string | null;
  match_date?: string | null;
  venue?: string | null;
  team_a_id: string;
  team_b_id: string;
  team_a: Team | null;
  team_b: Team | null;
  my_prediction?: KnockoutPrediction | null;
};

const KNOCKOUT_LOCK_KEYS: Record<string, string> = {
  ROUND_OF_32: "KNOCKOUT_PREDICTIONS_ROUND_OF_32",
  ROUND_OF_16: "KNOCKOUT_PREDICTIONS_ROUND_OF_16",
  QUARTER_FINAL: "KNOCKOUT_PREDICTIONS_QUARTER_FINAL",
  SEMI_FINAL: "KNOCKOUT_PREDICTIONS_SEMI_FINAL",
  FINAL: "KNOCKOUT_PREDICTIONS_FINAL",
};

function normalizeRound(value?: string | null) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[_-]/g, " ");

  if (text.includes("32")) return "ROUND_OF_32";
  if (text.includes("16")) return "ROUND_OF_16";
  if (text.includes("quarter")) return "QUARTER_FINAL";
  if (text.includes("semi")) return "SEMI_FINAL";
  if (text === "final" || text.includes(" final")) return "FINAL";

  return null;
}

function getRoundLabel(match: KnockoutMatch) {
  return match.round_name || match.stage || match.round || "Knockout";
}

function formatMatchDate(value?: string | null) {
  if (!value) return "Date not set";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date not set";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TeamOption({
  team,
  selected,
  onClick,
  disabled,
}: {
  team: Team | null;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!team || disabled}
      className={`flex min-h-36 flex-col items-center justify-center rounded-3xl border p-4 text-center transition ${
        selected
          ? "scale-[1.02] border-yellow-300/70 bg-yellow-400/15 shadow-lg shadow-yellow-500/20"
          : "border-white/10 bg-white/5 hover:bg-white/10 hover:text-white"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {team?.flag_url ? (
        <img
          src={team.flag_url}
          alt={team.name}
          className="h-16 w-16 rounded-full object-cover ring-4 ring-white/10"
        />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-3xl">
          🏆
        </div>
      )}

      <p className="mt-3 line-clamp-2 text-sm font-black text-white">
        {team?.name || "TBD"}
      </p>

      {team?.fifa_rank && (
        <p className="mt-1 text-xs font-bold text-slate-500">
          Rank #{team.fifa_rank}
        </p>
      )}

      {selected && (
        <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-green-500/15 px-3 py-1 text-xs font-bold text-green-200">
          <CheckCircle2 className="h-3 w-3" />
          Winner
        </div>
      )}
    </button>
  );
}

export default function KnockoutsPage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [matches, setMatches] = useState<KnockoutMatch[]>([]);
  const [locksByKey, setLocksByKey] = useState<Record<string, LockStatus>>({});
  const [selectedWinnerByMatchId, setSelectedWinnerByMatchId] = useState<
    Record<string, string>
  >({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadData() {
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

        setToken(session.access_token);

        const [response, locksResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/knockout-predictions/matches`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/locks/status`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
        ]);

        const json = await response.json().catch(() => null);
        const locksJson = await locksResponse.json().catch(() => null);

        if (!response.ok) {
          throw new Error(json?.detail || "Failed to load knockout matches");
        }

        const loadedMatches: KnockoutMatch[] = json.data || [];
        setMatches(loadedMatches);
        setLocksByKey(mapLocksByKey(locksJson?.data || []));

        const savedSelections: Record<string, string> = {};

        loadedMatches.forEach((match) => {
          if (match.my_prediction?.predicted_winner_team_id) {
            savedSelections[match.id] =
              match.my_prediction.predicted_winner_team_id;
          }
        });

        setSelectedWinnerByMatchId(savedSelections);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  const matchesByRound = useMemo(() => {
    const grouped: Record<string, KnockoutMatch[]> = {};

    matches.forEach((match) => {
      const round = getRoundLabel(match);

      if (!grouped[round]) {
        grouped[round] = [];
      }

      grouped[round].push(match);
    });

    return grouped;
  }, [matches]);

  const selectedCount = matches.filter(
    (match) => selectedWinnerByMatchId[match.id]
  ).length;

  function getMatchLock(match: KnockoutMatch) {
    const round = normalizeRound(getRoundLabel(match));
    return round ? locksByKey[KNOCKOUT_LOCK_KEYS[round]] : null;
  }

  function isMatchOpen(match: KnockoutMatch) {
    const lock = getMatchLock(match);
    return !lock || lock.is_open;
  }

  const editableSelectedCount = matches.filter(
    (match) => isMatchOpen(match) && selectedWinnerByMatchId[match.id]
  ).length;

  function selectWinner(matchId: string, teamId: string) {
    setSelectedWinnerByMatchId((previous) => ({
      ...previous,
      [matchId]: teamId,
    }));
  }

  async function savePredictions() {
    try {
      if (!token) {
        router.push("/login");
        return;
      }

      setSaving(true);
      setError("");
      setSuccess("");

      const predictions = matches
        .filter((match) => isMatchOpen(match) && selectedWinnerByMatchId[match.id])
        .map((match) => ({
          match_id: match.id,
          predicted_winner_team_id: selectedWinnerByMatchId[match.id],
        }));

      if (predictions.length === 0) {
        throw new Error("Choose a prediction first.");
      }

      const response = await fetch(`${API_BASE_URL}/knockout-predictions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ predictions }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.detail || "Failed to save knockout predictions");
      }

      setSuccess("Knockout predictions saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="wc-page min-h-screen p-4 pb-28 text-white md:p-6">
      <section className="mx-auto max-w-5xl">
        <div className="mb-6 text-center">
          <p className="wc-gold mb-2 text-sm font-bold uppercase tracking-[0.25em]">
            Knockouts
          </p>

          <h1 className="text-3xl font-black md:text-5xl">
            Knockout Predictions
          </h1>

          <p className="wc-muted mt-2">
            Pick the winner of each knockout match once teams are available.
          </p>
        </div>

        <div className="wc-card mb-5 p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-white">
                {selectedCount} / {matches.length} selected
              </p>
              <p className="mt-1 text-xs text-slate-400">
                These predictions will score when the API result is synced.
              </p>
            </div>

            <button
              onClick={savePredictions}
              disabled={saving || editableSelectedCount === 0}
              className="wc-button min-w-24 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              ) : (
                editableSelectedCount === 0 ? "Choose a prediction first" : "Save"
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-semibold text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 p-3 text-sm font-semibold text-green-200">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </div>
        )}

        {loading ? (
          <div className="wc-card flex items-center justify-center gap-3 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-300" />
            <p className="text-sm font-bold text-slate-400">
              Loading knockout matches...
            </p>
          </div>
        ) : matches.length === 0 ? (
          <div className="wc-card py-12 text-center">
            <Trophy className="mx-auto mb-3 h-10 w-10 text-slate-500" />

            <h2 className="text-2xl font-black text-white">
              Knockouts not ready yet
            </h2>

            <p className="wc-muted mx-auto mt-2 max-w-md">
              No knockout matches have both teams assigned yet. Once the API
              sync fills the knockout teams, this page will work automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(matchesByRound).map(([round, roundMatches]) => (
              <section key={round} className="wc-card">
                <PredictionLockBadge
                  lock={getMatchLock(roundMatches[0])}
                  title={`${round} Status`}
                  compact
                />

                <div className="mb-4 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-yellow-300" />
                  <h2 className="text-xl font-black text-white">{round}</h2>
                </div>

                <div className="space-y-4">
                  {roundMatches.map((match) => {
                    const selectedWinner = selectedWinnerByMatchId[match.id];
                    const matchLock = getMatchLock(match);
                    const matchOpen = !matchLock || matchLock.is_open;

                    return (
                      <div
                        key={match.id}
                        className="rounded-3xl border border-white/10 bg-black/20 p-4"
                      >
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                            <CalendarDays className="h-4 w-4" />
                            {formatMatchDate(match.match_date)}
                          </div>

                          {match.venue && (
                            <p className="text-xs font-bold text-slate-500">
                              {match.venue}
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                          <TeamOption
                            team={match.team_a}
                            selected={selectedWinner === match.team_a_id}
                            disabled={!matchOpen}
                            onClick={() =>
                              selectWinner(match.id, match.team_a_id)
                            }
                          />

                          <div className="rounded-full bg-white/10 px-3 py-2 text-xs font-black text-slate-300">
                            VS
                          </div>

                          <TeamOption
                            team={match.team_b}
                            selected={selectedWinner === match.team_b_id}
                            disabled={!matchOpen}
                            onClick={() =>
                              selectWinner(match.id, match.team_b_id)
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      <BottomNav />
    </main>
  );
}
