"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  Trophy,
  Unlock,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { BottomNav } from "@/components/bottomnav";
import { PredictionLockBadge } from "@/components/PredictionLockBadge";
import { getLockedButtonLabel, mapLocksByKey } from "@/lib/locks";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

type Team = {
  id: string;
  name: string;
  flag_url?: string | null;
  fifa_rank?: number | null;
};

type Group = {
  id: string;
  code: string;
  name?: string | null;
};

type Match = {
  id: string;
  stage: string;
  group_id: string | null;
  team_a_id: string;
  team_b_id: string;
  matchday?: number | null;
  match_date?: string | null;
  status?: string | null;
  round_name?: string | null;
  venue?: string | null;
  actual_outcome?: string | null;
  team_a: Team;
  team_b: Team;
  group: Group | null;
};

type SavedPrediction = {
  id: string;
  match_id: string;
  predicted_outcome: Outcome;
};

type Outcome = "TEAM_A_WIN" | "DRAW" | "TEAM_B_WIN";

type LockStatus = {
  lock_key: string;
  lock_name?: string;
  open_at?: string | null;
  deadline_at?: string | null;
  is_locked?: boolean;
  is_open?: boolean;
  reason?: "MANUALLY_LOCKED" | "NOT_OPEN_YET" | "DEADLINE_PASSED" | null;
};

const MATCHDAY_LOCK_KEYS: Record<number, string> = {
  1: "GROUP_MATCHDAY_1",
  2: "GROUP_MATCHDAY_2",
  3: "GROUP_MATCHDAY_3",
};

function formatMatchDate(value?: string | null) {
  if (!value) return "Date not set";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLockDate(value?: string | null) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getLockMessage(lock?: LockStatus) {
  if (!lock) return "No lock configured. This matchday is open.";

  if (lock.is_open) return "This matchday is open for predictions.";

  if (lock.reason === "NOT_OPEN_YET") {
    return `This matchday is not open yet. Opens at ${formatLockDate(
      lock.open_at
    )}.`;
  }

  if (lock.reason === "DEADLINE_PASSED") {
    return `This matchday deadline has passed. Deadline was ${formatLockDate(
      lock.deadline_at
    )}.`;
  }

  return "This matchday is manually locked by admin.";
}

function getLockBadge(lock?: LockStatus) {
  if (!lock || lock.is_open) {
    return {
      label: "Open",
      className: "border-green-400/40 bg-green-500/15 text-green-200",
      Icon: Unlock,
    };
  }

  if (lock.reason === "NOT_OPEN_YET") {
    return {
      label: "Not Open",
      className: "border-yellow-400/40 bg-yellow-500/15 text-yellow-200",
      Icon: Clock,
    };
  }

  if (lock.reason === "DEADLINE_PASSED") {
    return {
      label: "Deadline Passed",
      className: "border-red-400/40 bg-red-500/15 text-red-200",
      Icon: Lock,
    };
  }

  return {
    label: "Locked",
    className: "border-red-400/40 bg-red-500/15 text-red-200",
    Icon: Lock,
  };
}

function TeamLabel({ team }: { team: Team }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {team.flag_url ? (
        <img
          src={team.flag_url}
          alt={team.name}
          className="h-7 w-7 rounded-full object-cover"
        />
      ) : (
        <div className="h-7 w-7 rounded-full bg-white/10" />
      )}

      <span className="truncate text-sm font-bold text-white">{team.name}</span>
    </div>
  );
}

function OutcomeButton({
  active,
  label,
  disabled,
  onClick,
}: {
  active: boolean;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? "border border-yellow-300/60 bg-yellow-400/20 text-yellow-100 shadow-lg shadow-yellow-500/20"
          : "border border-white/10 bg-white/10 text-slate-300 hover:bg-white/15 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

export default function GroupMatchesPage() {
  const router = useRouter();

  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedOutcomes, setSelectedOutcomes] = useState<
    Record<string, Outcome>
  >({});
  const [locksByKey, setLocksByKey] = useState<Record<string, LockStatus>>({});
  const [activeMatchday, setActiveMatchday] = useState<number>(1);
  const [token, setToken] = useState<string | null>(null);

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

        const [matchesResponse, predictionsResponse, locksResponse] =
          await Promise.all([
            fetch(`${API_BASE_URL}/matches/group-stage`, {
              cache: "no-store",
            }),
            fetch(`${API_BASE_URL}/group-match-predictions`, {
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

        if (!matchesResponse.ok) {
          throw new Error("Failed to load group matches");
        }

        if (!predictionsResponse.ok) {
          throw new Error("Failed to load your match predictions");
        }

        if (!locksResponse.ok) {
          throw new Error("Failed to load prediction locks");
        }

        const matchesJson = await matchesResponse.json();
        const predictionsJson = await predictionsResponse.json();
        const locksJson = await locksResponse.json();

        const saved: Record<string, Outcome> = {};

        (predictionsJson.data || []).forEach((prediction: SavedPrediction) => {
          saved[prediction.match_id] = prediction.predicted_outcome;
        });

        const nextLocksByKey = mapLocksByKey(locksJson.data || []);

        setMatches(matchesJson.data || []);
        setSelectedOutcomes(saved);
        setLocksByKey(nextLocksByKey);

        const firstOpenMatchday =
          [1, 2, 3].find((matchday) => {
            const lock = nextLocksByKey[MATCHDAY_LOCK_KEYS[matchday]];
            return !lock || lock.is_open;
          }) || 1;

        setActiveMatchday(firstOpenMatchday);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  const activeLock = locksByKey[MATCHDAY_LOCK_KEYS[activeMatchday]];
  const activeIsOpen = !activeLock || activeLock.is_open;

  const matchdayCounts = useMemo(() => {
    return {
      1: matches.filter((match) => match.matchday === 1).length,
      2: matches.filter((match) => match.matchday === 2).length,
      3: matches.filter((match) => match.matchday === 3).length,
    };
  }, [matches]);

  const activeMatches = useMemo(() => {
    return matches.filter((match) => match.matchday === activeMatchday);
  }, [matches, activeMatchday]);

  const groupedMatches = useMemo(() => {
    const grouped: Record<string, Match[]> = {};

    activeMatches.forEach((match) => {
      const code = match.group?.code || "Other";

      if (!grouped[code]) {
        grouped[code] = [];
      }

      grouped[code].push(match);
    });

    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [activeMatches]);

  const activeSelectedCount = activeMatches.filter(
    (match) => selectedOutcomes[match.id]
  ).length;

  async function savePredictions() {
    try {
      if (!token) {
        router.push("/login");
        return;
      }

      if (!activeIsOpen) {
        setError(getLockMessage(activeLock));
        return;
      }

      setSaving(true);
      setError("");
      setSuccess("");

      const predictions = activeMatches
        .filter((match) => selectedOutcomes[match.id])
        .map((match) => ({
          match_id: match.id,
          predicted_outcome: selectedOutcomes[match.id],
        }));

      if (predictions.length === 0) {
        setError("Choose at least one prediction before saving.");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/group-match-predictions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ predictions }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Failed to save predictions");
      }

      setSuccess(`Matchday ${activeMatchday} predictions saved successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="wc-page min-h-screen pb-28">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="wc-muted text-xs font-bold uppercase tracking-[0.3em]">
              Group Stage
            </p>
            <h1 className="mt-2 text-2xl font-black text-white">
              Match Predictions
            </h1>
          </div>

          <div className="rounded-3xl bg-yellow-400/15 p-3 text-yellow-300">
            <Trophy className="h-6 w-6" />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {[1, 2, 3].map((matchday) => {
            const lock = locksByKey[MATCHDAY_LOCK_KEYS[matchday]];
            const badge = getLockBadge(lock);
            const BadgeIcon = badge.Icon;
            const isActive = activeMatchday === matchday;

            return (
              <button
                key={matchday}
                onClick={() => {
                  setActiveMatchday(matchday);
                  setError("");
                  setSuccess("");
                }}
                className={`rounded-2xl border p-3 text-left transition ${
                  isActive
                    ? "border-blue-400 bg-blue-500/20"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <p className="text-sm font-black text-white">MD {matchday}</p>

                <p className="mt-1 text-[11px] font-bold text-slate-400">
                  {matchdayCounts[matchday as 1 | 2 | 3]} matches
                </p>

                <span
                  className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${badge.className}`}
                >
                  <BadgeIcon className="h-3 w-3" />
                  {badge.label}
                </span>
              </button>
            );
          })}
        </div>

        <PredictionLockBadge
          lock={activeLock}
          title={`Matchday ${activeMatchday} Status`}
        />

        <div className="wc-card mb-5 p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-white">
                Matchday {activeMatchday}: {activeSelectedCount} /{" "}
                {activeMatches.length} predicted
              </p>

              <p className="mt-1 text-xs text-slate-400">
                {getLockMessage(activeLock)}
              </p>
            </div>

            <button
              onClick={savePredictions}
              disabled={
                saving ||
                activeSelectedCount === 0 ||
                !activeIsOpen ||
                activeMatches.length === 0
              }
              className="wc-button min-w-24 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              ) : (
                !activeIsOpen
                  ? getLockedButtonLabel(activeLock)
                  : activeSelectedCount === 0
                  ? "Choose a prediction first"
                  : "Save"
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
          <div className="wc-card flex items-center justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-blue-300" />
          </div>
        ) : activeMatches.length === 0 ? (
          <div className="wc-card py-10 text-center">
            <p className="text-lg font-black text-white">
              No Matchday {activeMatchday} matches found
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Make sure the matches table has matchday values.
            </p>
          </div>
        ) : (
          <div className="space-y-5 md:grid md:grid-cols-2 md:gap-5 md:space-y-0">
            {groupedMatches.map(([groupCode, groupMatches]) => (
              <section key={groupCode} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-black text-white">
                    Group {groupCode}
                  </h2>

                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">
                    {groupMatches.length} matches
                  </span>
                </div>

                {groupMatches.map((match) => {
                  const selected = selectedOutcomes[match.id];

                  return (
                    <div key={match.id} className="wc-card space-y-4">
                      <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                        <div className="flex items-center gap-1">
                          <CalendarDays className="h-4 w-4" />
                          {formatMatchDate(match.match_date)}
                        </div>

                        <span className="rounded-full bg-white/10 px-2 py-1 font-bold">
                          {match.status || "SCHEDULED"}
                        </span>
                      </div>

                      <div className="space-y-3">
                        <div className="rounded-2xl bg-white/5 p-3">
                          <TeamLabel team={match.team_a} />
                        </div>

                        <div className="text-center text-xs font-black uppercase tracking-[0.3em] text-slate-500">
                          vs
                        </div>

                        <div className="rounded-2xl bg-white/5 p-3">
                          <TeamLabel team={match.team_b} />
                        </div>
                      </div>

                      {!activeIsOpen && (
                        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold text-red-200">
                          {getLockMessage(activeLock)}
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2">
                        <OutcomeButton
                          label={`${match.team_a.name} win`}
                          active={selected === "TEAM_A_WIN"}
                          disabled={!activeIsOpen}
                          onClick={() =>
                            setSelectedOutcomes((previous) => ({
                              ...previous,
                              [match.id]: "TEAM_A_WIN",
                            }))
                          }
                        />

                        <OutcomeButton
                          label="Draw"
                          active={selected === "DRAW"}
                          disabled={!activeIsOpen}
                          onClick={() =>
                            setSelectedOutcomes((previous) => ({
                              ...previous,
                              [match.id]: "DRAW",
                            }))
                          }
                        />

                        <OutcomeButton
                          label={`${match.team_b.name} win`}
                          active={selected === "TEAM_B_WIN"}
                          disabled={!activeIsOpen}
                          onClick={() =>
                            setSelectedOutcomes((previous) => ({
                              ...previous,
                              [match.id]: "TEAM_B_WIN",
                            }))
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
