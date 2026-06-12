"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  Shield,
  Trophy,
  Unlock,
} from "lucide-react";

import { BottomNav } from "@/components/bottomnav";
import {
  getMatchTimestamp,
  MatchTimeBadge,
} from "@/components/MatchTimeBadge";
import {
  getLockedButtonLabel,
  mapLocksByKey,
  type LockStatus,
} from "@/lib/locks";
import { supabase } from "@/lib/supabase/client";
import {
  formatTeamRank,
  getMeaningfulUnderdogTeamId,
} from "@/lib/underdog";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type Team = {
  id: string;
  name: string;
  flag_url?: string | null;
  fifa_rank?: number | null;
  fifa_points?: number | null;
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
  status?: string | null;
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

const ROUND_OPTIONS = [
  { key: "ROUND_OF_32", shortLabel: "RO32", label: "Round of 32" },
  { key: "ROUND_OF_16", shortLabel: "RO16", label: "Round of 16" },
  { key: "QUARTER_FINAL", shortLabel: "QF", label: "Quarterfinals" },
  { key: "SEMI_FINAL", shortLabel: "SF", label: "Semifinals" },
  { key: "FINAL", shortLabel: "Final", label: "Final" },
] as const;

type RoundKey = (typeof ROUND_OPTIONS)[number]["key"];

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

function getRoundKey(match: KnockoutMatch) {
  return normalizeRound(getRoundLabel(match));
}

function getRoundOption(key: RoundKey) {
  return ROUND_OPTIONS.find((round) => round.key === key) || ROUND_OPTIONS[0];
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

function getSortedMatches(matches: KnockoutMatch[]) {
  return [...matches].sort((a, b) => {
    const dateDifference =
      getMatchTimestamp(a.match_date) - getMatchTimestamp(b.match_date);

    if (dateDifference !== 0) return dateDifference;

    const roundDifference = getRoundLabel(a).localeCompare(getRoundLabel(b));

    if (roundDifference !== 0) return roundDifference;

    return (a.team_a?.name || "").localeCompare(b.team_a?.name || "");
  });
}

function isLockGateOpen(lock?: LockStatus | null) {
  return !lock || lock.is_open || lock.reason === "DEADLINE_PASSED";
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

function getLockMessage(
  lock?: LockStatus | null,
  hasConfirmedMatches = false
) {
  if (hasConfirmedMatches) {
    return "This round is open because at least one match is confirmed. Each game closes at kickoff.";
  }

  if (!lock) return "No lock configured. This round is open.";

  if (lock.is_open) return "This round is open for predictions.";

  if (lock.reason === "DEADLINE_PASSED") {
    return "Each game now closes at its own kickoff time.";
  }

  if (lock.reason === "NOT_OPEN_YET") {
    return `This round is not open yet. Opens at ${formatLockDate(
      lock.open_at
    )}.`;
  }

  return "This round is manually locked by admin.";
}

function getLockBadge(lock?: LockStatus | null, hasConfirmedMatches = false) {
  if (
    hasConfirmedMatches ||
    !lock ||
    lock.is_open ||
    lock.reason === "DEADLINE_PASSED"
  ) {
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

  return {
    label: "Locked",
    className: "border-red-400/40 bg-red-500/15 text-red-200",
    Icon: Lock,
  };
}

function isMatchDeadlineOpen(match: KnockoutMatch) {
  if (!match.match_date) return true;

  const matchDate = new Date(match.match_date);

  if (Number.isNaN(matchDate.getTime())) return true;

  return Date.now() < matchDate.getTime();
}

function TeamOption({
  team,
  selected,
  isUnderdog = false,
  onClick,
  disabled,
}: {
  team: Team | null;
  selected: boolean;
  isUnderdog?: boolean;
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

      <p className="mt-1 text-xs font-bold text-slate-500">
        {formatTeamRank(team)}
      </p>

      {isUnderdog && (
        <div className="mt-3 rounded-full border border-yellow-300/40 bg-yellow-400/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-yellow-100">
          Underdog
        </div>
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
  const [activeRound, setActiveRound] = useState<RoundKey>("ROUND_OF_32");
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
        const nextLocksByKey = mapLocksByKey(locksJson?.data || []);

        setMatches(loadedMatches);
        setLocksByKey(nextLocksByKey);

        const firstOpenRound =
          ROUND_OPTIONS.find((round) => {
            return loadedMatches.some(
              (match) => getRoundKey(match) === round.key
            );
          }) ||
          ROUND_OPTIONS[0];

        setActiveRound(firstOpenRound.key);

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

  const roundCounts = useMemo(() => {
    return ROUND_OPTIONS.reduce<Record<RoundKey, number>>((counts, round) => {
      counts[round.key] = matches.filter(
        (match) => getRoundKey(match) === round.key
      ).length;
      return counts;
    }, {} as Record<RoundKey, number>);
  }, [matches]);

  const activeMatches = useMemo(() => {
    return getSortedMatches(
      matches.filter((match) => getRoundKey(match) === activeRound)
    );
  }, [matches, activeRound]);

  const activeRoundOption = getRoundOption(activeRound);
  const activeLock = locksByKey[KNOCKOUT_LOCK_KEYS[activeRound]];
  const activeRoundHasConfirmedMatches = activeMatches.length > 0;
  const activeGateOpen =
    activeRoundHasConfirmedMatches || isLockGateOpen(activeLock);

  const activeSelectedCount = activeMatches.filter(
    (match) => selectedWinnerByMatchId[match.id]
  ).length;

  const activeEditableSelectedCount = activeMatches.filter(
    (match) => isMatchOpen(match) && selectedWinnerByMatchId[match.id]
  ).length;

  const totalSelectedCount = matches.filter(
    (match) => selectedWinnerByMatchId[match.id]
  ).length;

  const totalMatchCount = matches.length;

  function isRoundGateOpen(round: string | null) {
    if (!round) return true;

    const hasConfirmedMatches = matches.some(
      (match) => getRoundKey(match) === round
    );
    const lock = locksByKey[KNOCKOUT_LOCK_KEYS[round]];

    return hasConfirmedMatches || isLockGateOpen(lock);
  }

  function isMatchOpen(match: KnockoutMatch) {
    return isRoundGateOpen(getRoundKey(match)) && isMatchDeadlineOpen(match);
  }

  const editableSelectedCount = activeEditableSelectedCount;

  const selectedCount = activeSelectedCount;
  const matchCount = activeMatches.length;

  const activeLockMessage = getLockMessage(
    activeLock,
    activeRoundHasConfirmedMatches
  );

  const activeSaveDisabled =
    saving ||
    editableSelectedCount === 0 ||
    !activeGateOpen ||
    activeMatches.length === 0;

  const activeSaveLabel = !activeGateOpen
    ? getLockedButtonLabel(activeLock)
    : editableSelectedCount === 0
    ? "Choose a prediction first"
    : "Save";

  const roundButtons = ROUND_OPTIONS.map((round) => {
    const lock = locksByKey[KNOCKOUT_LOCK_KEYS[round.key]];
    const count = roundCounts[round.key] || 0;
    const badge = getLockBadge(lock, count > 0);
    const BadgeIcon = badge.Icon;

    return {
      ...round,
      badge,
      BadgeIcon,
      isActive: activeRound === round.key,
      count,
    };
  });

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

      if (!activeGateOpen) {
        setError(activeLockMessage);
        return;
      }

      const predictions = activeMatches
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

      setSuccess(`${activeRoundOption.label} predictions saved successfully.`);
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

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {roundButtons.map((round) => (
            <button
              key={round.key}
              onClick={() => {
                setActiveRound(round.key);
                setError("");
                setSuccess("");
              }}
              className={`rounded-2xl border p-3 text-left transition ${
                round.isActive
                  ? "border-blue-400 bg-blue-500/20"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <p className="text-sm font-black text-white">
                {round.shortLabel}
              </p>

              <p className="mt-1 text-[11px] font-bold text-slate-400">
                {round.count} matches
              </p>

              <span
                className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${round.badge.className}`}
              >
                <round.BadgeIcon className="h-3 w-3" />
                {round.badge.label}
              </span>
            </button>
          ))}
        </div>

        <div className="wc-card mb-5 p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-white">
                {activeRoundOption.label}: {selectedCount} / {matchCount}{" "}
                selected
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {activeLockMessage}
              </p>
              <p className="mt-1 text-[11px] font-bold text-slate-500">
                Total: {totalSelectedCount} / {totalMatchCount} selected
              </p>
            </div>

            <button
              onClick={savePredictions}
              disabled={activeSaveDisabled}
              className="wc-button min-w-24 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              ) : (
                activeSaveLabel
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
        ) : activeMatches.length === 0 ? (
          <div className="wc-card py-10 text-center">
            <p className="text-lg font-black text-white">
              No {activeRoundOption.label} matches found
            </p>
            <p className="mt-2 text-sm text-slate-400">
              This round will appear here once the matches are available.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {activeMatches.map((match) => {
              const selectedWinner = selectedWinnerByMatchId[match.id];
              const matchOpen = isMatchOpen(match);
              const deadlinePassed = !isMatchDeadlineOpen(match);
              const underdogTeamId = getMeaningfulUnderdogTeamId(
                match.team_a,
                match.team_b
              );

              return (
                <div
                  key={match.id}
                  className="wc-card rounded-3xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-400">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 font-black text-slate-200">
                        <Shield className="h-3 w-3 text-yellow-300" />
                        {getRoundLabel(match)}
                      </span>

                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-4 w-4" />
                        {formatMatchDate(match.match_date)}
                      </span>
                    </div>

                    <MatchTimeBadge
                      matchDate={match.match_date}
                      status={match.status}
                    />
                  </div>

                  {match.venue && (
                    <p className="mb-4 text-xs font-bold text-slate-500">
                      {match.venue}
                    </p>
                  )}

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <TeamOption
                      team={match.team_a}
                      selected={selectedWinner === match.team_a_id}
                      isUnderdog={underdogTeamId === match.team_a_id}
                      disabled={!matchOpen}
                      onClick={() => selectWinner(match.id, match.team_a_id)}
                    />

                    <div className="rounded-full bg-white/10 px-3 py-2 text-xs font-black text-slate-300">
                      VS
                    </div>

                    <TeamOption
                      team={match.team_b}
                      selected={selectedWinner === match.team_b_id}
                      isUnderdog={underdogTeamId === match.team_b_id}
                      disabled={!matchOpen}
                      onClick={() => selectWinner(match.id, match.team_b_id)}
                    />
                  </div>

                  {!matchOpen && (
                    <div className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold text-red-200">
                      {deadlinePassed
                        ? "Prediction closed. This game has already kicked off."
                        : "Predictions are locked for this round."}
                    </div>
                  )}

                  {underdogTeamId && (
                    <div className="mt-3 rounded-2xl border border-yellow-300/20 bg-yellow-400/10 p-3 text-xs font-bold text-yellow-100">
                      Underdog winner pick scores round points x2 if correct,
                      x-2 if wrong.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <BottomNav />
    </main>
  );
}
