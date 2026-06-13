"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Loader2,
  Save,
  Shield,
  Trophy,
  Users,
} from "lucide-react";

import { BottomNav } from "@/components/bottomnav";
import {
  getMatchTimestamp,
  MatchTimeBadge,
} from "@/components/MatchTimeBadge";
import { WorldCupLoader } from "@/components/WorldCupLoader";
import { supabase } from "@/lib/supabase/client";
import {
  formatTeamRank,
  getMeaningfulUnderdogTeamId,
} from "@/lib/underdog";
import { useAdminGuard } from "@/lib/useAdminGuard";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

type Team = {
  id: string;
  name: string;
  flag_url?: string | null;
  fifa_rank?: number | null;
  fifa_points?: number | null;
};

type Group = {
  id: string;
  code?: string | null;
  name?: string | null;
};

type Outcome = "TEAM_A_WIN" | "DRAW" | "TEAM_B_WIN";

type KnockoutMatch = {
  id: string;
  round_name?: string | null;
  stage?: string | null;
  match_round?: string | null;
  match_date?: string | null;
  status?: string | null;
  venue?: string | null;
  team_a_id: string;
  team_b_id: string;
  actual_winner_team_id?: string | null;
  team_a?: Team | null;
  team_b?: Team | null;
  actual_winner_team?: Team | null;
};

type GroupMatch = {
  id: string;
  matchday?: number | null;
  group_id?: string | null;
  match_date?: string | null;
  venue?: string | null;
  status?: string | null;
  team_a_id: string;
  team_b_id: string;
  actual_outcome?: Outcome | null;
  team_a?: Team | null;
  team_b?: Team | null;
  group?: Group | null;
};

type ActualStanding = {
  id?: string;
  group_id: string;
  team_id: string;
  actual_position: number;
  qualified_to_ro32: boolean;
  qualified_as_best_third: boolean;
};

type GroupTeam = {
  id?: string;
  group_id: string;
  team_id: string;
  team?: Team | null;
  actual_standing?: ActualStanding | null;
};

type GroupWithTeams = {
  id: string;
  name: string;
  teams: GroupTeam[];
};

type GroupResultRow = {
  team_id: string;
  team: Team | null;
  qualified_to_ro32: boolean;
  qualified_as_best_third: boolean;
};

const ROUND_LABELS: Record<string, string> = {
  ROUND_OF_32: "Round of 32",
  ROUND_OF_16: "Round of 16",
  QUARTER_FINAL: "Quarter Final",
  SEMI_FINAL: "Semi Final",
  FINAL: "Final",
};

function getRoundLabel(match: KnockoutMatch) {
  if (match.match_round && ROUND_LABELS[match.match_round]) {
    return ROUND_LABELS[match.match_round];
  }

  return match.round_name || match.stage || "Knockout";
}

function formatDate(value?: string | null) {
  if (!value) return "Date not set";

  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getOutcomeLabel(match: GroupMatch, outcome: Outcome) {
  if (outcome === "TEAM_A_WIN") return `${match.team_a?.name || "Team A"} win`;
  if (outcome === "TEAM_B_WIN") return `${match.team_b?.name || "Team B"} win`;

  return "Draw";
}

function getGroupTitle(group?: Group | null) {
  if (!group) return "Group";

  return group.name || (group.code ? `Group ${group.code}` : "Group");
}

function TeamBadge({
  team,
  isUnderdog = false,
}: {
  team?: Team | null;
  isUnderdog?: boolean;
}) {
  if (!team) return null;

  return (
    <div className="flex items-center gap-3">
      {team.flag_url ? (
        <img
          src={team.flag_url}
          alt={team.name}
          className="h-11 w-11 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
          🏆
        </div>
      )}

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-black">{team.name}</p>

          {isUnderdog && (
            <span className="rounded-full border border-yellow-300/40 bg-yellow-400/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-yellow-100">
              Underdog
            </span>
          )}
        </div>

        <p className="mt-0.5 text-xs font-bold text-slate-400">
          {formatTeamRank(team)}
        </p>
      </div>
    </div>
  );
}

function sortByMatchTime<T extends { match_date?: string | null }>(
  items: T[],
  getFallbackLabel: (item: T) => string
) {
  return [...items].sort((a, b) => {
    const dateDifference =
      getMatchTimestamp(a.match_date) - getMatchTimestamp(b.match_date);

    if (dateDifference !== 0) return dateDifference;

    return getFallbackLabel(a).localeCompare(getFallbackLabel(b));
  });
}

export default function AdminResultsPage() {
  const router = useRouter();
  const { checkingAdmin } = useAdminGuard();

  const [token, setToken] = useState<string | null>(null);

  const [knockoutMatches, setKnockoutMatches] = useState<KnockoutMatch[]>([]);
  const [groupMatches, setGroupMatches] = useState<GroupMatch[]>([]);
  const [groups, setGroups] = useState<GroupWithTeams[]>([]);

  const [winnerByMatch, setWinnerByMatch] = useState<Record<string, string>>({});
  const [outcomeByGroupMatch, setOutcomeByGroupMatch] = useState<
    Record<string, Outcome>
  >({});
  const [groupRowsByGroup, setGroupRowsByGroup] = useState<
    Record<string, GroupResultRow[]>
  >({});

  const [activeTab, setActiveTab] = useState<
    "groupMatches" | "knockouts" | "groups"
  >("groupMatches");

  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      setToken(session.access_token);

      const matchesResponse = await fetch(
        `${API_BASE_URL}/admin/results/knockout-matches`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const groupsResponse = await fetch(`${API_BASE_URL}/admin/results/groups`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const groupMatchesResponse = await fetch(
        `${API_BASE_URL}/admin/results/group-matches`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const matchesJson = await matchesResponse.json().catch(() => null);
      const groupsJson = await groupsResponse.json().catch(() => null);
      const groupMatchesJson = await groupMatchesResponse
        .json()
        .catch(() => null);

      if (!matchesResponse.ok) {
        throw new Error(
          matchesJson?.detail || "Failed to load knockout matches"
        );
      }

      if (!groupsResponse.ok) {
        throw new Error(groupsJson?.detail || "Failed to load groups");
      }

      if (!groupMatchesResponse.ok) {
        throw new Error(
          groupMatchesJson?.detail || "Failed to load group matches"
        );
      }

      const loadedMatches: KnockoutMatch[] = matchesJson.data || [];
      const loadedGroups: GroupWithTeams[] = groupsJson.data || [];
      const loadedGroupMatches: GroupMatch[] = groupMatchesJson.data || [];

      setKnockoutMatches(loadedMatches);
      setGroups(loadedGroups);
      setGroupMatches(loadedGroupMatches);

      const nextWinnerByMatch: Record<string, string> = {};

      loadedMatches.forEach((match) => {
        if (match.actual_winner_team_id) {
          nextWinnerByMatch[match.id] = match.actual_winner_team_id;
        }
      });

      setWinnerByMatch(nextWinnerByMatch);

      const nextOutcomeByGroupMatch: Record<string, Outcome> = {};

      loadedGroupMatches.forEach((match) => {
        if (match.actual_outcome) {
          nextOutcomeByGroupMatch[match.id] = match.actual_outcome;
        }
      });

      setOutcomeByGroupMatch(nextOutcomeByGroupMatch);

      const nextGroupRowsByGroup: Record<string, GroupResultRow[]> = {};

      loadedGroups.forEach((group) => {
        const rows = group.teams.map((groupTeam, index) => {
          const standing = groupTeam.actual_standing;

          return {
            team_id: groupTeam.team_id,
            team: groupTeam.team || null,
            qualified_to_ro32: standing?.qualified_to_ro32 ?? index < 2,
            qualified_as_best_third:
              standing?.qualified_as_best_third ?? false,
            actual_position: standing?.actual_position,
          };
        });

        const withExistingOrder = [...rows].sort((a, b) => {
          const posA = a.actual_position || 999;
          const posB = b.actual_position || 999;

          if (posA !== posB) return posA - posB;

          return (a.team?.name || "").localeCompare(b.team?.name || "");
        });

        nextGroupRowsByGroup[group.id] = withExistingOrder.map(
          ({ actual_position, ...row }, index) => ({
            ...row,
            qualified_to_ro32: row.qualified_to_ro32 || index < 2,
          })
        );
      });

      setGroupRowsByGroup(nextGroupRowsByGroup);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (checkingAdmin) return;

    void Promise.resolve().then(loadData);
  }, [checkingAdmin]);

  async function recalculateScores(authToken: string) {
    const response = await fetch(
      `${API_BASE_URL}/admin/sync/recalculate-scores`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(json?.detail || "Failed to recalculate scores");
    }

    return json;
  }

  const sortedKnockoutMatches = useMemo(() => {
    return sortByMatchTime(knockoutMatches, getRoundLabel);
  }, [knockoutMatches]);

  const sortedGroupMatches = useMemo(() => {
    return sortByMatchTime(groupMatches, (match) =>
      `${match.matchday || ""}:${getGroupTitle(match.group)}`
    );
  }, [groupMatches]);

  function moveTeam(groupId: string, index: number, direction: "up" | "down") {
    setGroupRowsByGroup((previous) => {
      const rows = [...(previous[groupId] || [])];

      const targetIndex = direction === "up" ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= rows.length) {
        return previous;
      }

      const temp = rows[index];
      rows[index] = rows[targetIndex];
      rows[targetIndex] = temp;

      return {
        ...previous,
        [groupId]: rows,
      };
    });
  }

  function toggleGroupFlag(
    groupId: string,
    index: number,
    key: "qualified_to_ro32" | "qualified_as_best_third"
  ) {
    setGroupRowsByGroup((previous) => {
      const rows = [...(previous[groupId] || [])];

      rows[index] = {
        ...rows[index],
        [key]: !rows[index][key],
      };

      if (key === "qualified_as_best_third" && !rows[index].qualified_to_ro32) {
        rows[index].qualified_to_ro32 = true;
      }

      return {
        ...previous,
        [groupId]: rows,
      };
    });
  }

  async function saveGroupMatchOutcome(match: GroupMatch) {
    try {
      if (!token) {
        router.push("/login");
        return;
      }

      const selectedOutcome = outcomeByGroupMatch[match.id];

      if (!selectedOutcome) {
        throw new Error("Select the actual outcome first.");
      }

      setSavingKey(`group-match:${match.id}`);
      setError("");
      setSuccess("");

      const response = await fetch(
        `${API_BASE_URL}/admin/results/group-match-outcome`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            match_id: match.id,
            actual_outcome: selectedOutcome,
          }),
        }
      );

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.detail || "Failed to save group match outcome");
      }

      await recalculateScores(token);
      setSuccess("Group match outcome saved and scores recalculated.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingKey(null);
    }
  }

  async function saveMatchWinner(match: KnockoutMatch) {
    try {
      if (!token) {
        router.push("/login");
        return;
      }

      const selectedWinner = winnerByMatch[match.id];

      if (!selectedWinner) {
        throw new Error("Select a winner first.");
      }

      setSavingKey(`match:${match.id}`);
      setError("");
      setSuccess("");

      const response = await fetch(`${API_BASE_URL}/admin/results/match-winner`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          match_id: match.id,
          actual_winner_team_id: selectedWinner,
        }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.detail || "Failed to save match winner");
      }

      await recalculateScores(token);
      setSuccess("Match winner saved and scores recalculated.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingKey(null);
    }
  }

  async function saveGroupStandings(group: GroupWithTeams) {
    try {
      if (!token) {
        router.push("/login");
        return;
      }

      const rows = groupRowsByGroup[group.id] || [];

      if (rows.length !== 4) {
        throw new Error("Group standings must contain exactly 4 teams.");
      }

      setSavingKey(`group:${group.id}`);
      setError("");
      setSuccess("");

      const response = await fetch(
        `${API_BASE_URL}/admin/results/group-standings`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            group_id: group.id,
            standings: rows.map((row, index) => ({
              team_id: row.team_id,
              actual_position: index + 1,
              qualified_to_ro32: row.qualified_to_ro32,
              qualified_as_best_third: row.qualified_as_best_third,
            })),
          }),
        }
      );

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.detail || "Failed to save group standings");
      }

      await recalculateScores(token);
      setSuccess("Group standings saved and scores recalculated.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingKey(null);
    }
  }

  if (checkingAdmin) {
    return (
      <main className="wc-page flex min-h-screen items-center justify-center p-6 text-white">
        <WorldCupLoader />
      </main>
    );
  }

  return (
    <main className="wc-page min-h-screen p-4 pb-28 text-white md:p-6">
      <section className="mx-auto max-w-6xl">
        <div className="mb-6 text-center">
          <p className="wc-gold mb-2 text-sm font-bold uppercase tracking-[0.25em]">
            Admin
          </p>

          <h1 className="text-3xl font-black md:text-5xl">Results Control</h1>

          <p className="wc-muted mt-2">
            Enter actual results. Scores will recalculate automatically.
          </p>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-3">
          <button
            onClick={() => setActiveTab("groupMatches")}
            className={`rounded-2xl border px-3 py-4 text-sm font-black transition-all ${
              activeTab === "groupMatches"
                ? "border-blue-400 bg-blue-500 text-white"
                : "border-white/10 bg-white/5 text-slate-300"
            }`}
          >
            Group Matches
          </button>

          <button
            onClick={() => setActiveTab("knockouts")}
            className={`rounded-2xl border px-3 py-4 text-sm font-black transition-all ${
              activeTab === "knockouts"
                ? "border-blue-400 bg-blue-500 text-white"
                : "border-white/10 bg-white/5 text-slate-300"
            }`}
          >
            Knockouts
          </button>

          <button
            onClick={() => setActiveTab("groups")}
            className={`rounded-2xl border px-3 py-4 text-sm font-black transition-all ${
              activeTab === "groups"
                ? "border-blue-400 bg-blue-500 text-white"
                : "border-white/10 bg-white/5 text-slate-300"
            }`}
          >
            Group Tables
          </button>
        </div>

        {loading && (
          <div className="py-8">
            <WorldCupLoader />
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">
            {error}
          </p>
        )}

        {success && (
          <p className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-green-300">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </p>
        )}

        {!loading && activeTab === "groupMatches" && (
          <div className="space-y-6">
            {groupMatches.length === 0 && (
              <div className="wc-card p-6 text-center">
                <Trophy className="mx-auto mb-3 h-10 w-10 text-slate-500" />
                <h2 className="text-2xl font-black">No group matches</h2>
                <p className="wc-muted mt-2">
                  Run the football-data sync first.
                </p>
              </div>
            )}

            <div className="grid gap-4">
              {sortedGroupMatches.map((match) => {
                    const selectedOutcome = outcomeByGroupMatch[match.id];
                    const isSaving = savingKey === `group-match:${match.id}`;
                    const underdogTeamId = getMeaningfulUnderdogTeamId(
                      match.team_a,
                      match.team_b
                    );

                    return (
                      <div
                        key={match.id}
                        className="rounded-3xl border border-white/10 bg-black/25 p-4"
                      >
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-300">
                              <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-slate-200">
                                Matchday {match.matchday || "?"}
                              </span>

                              <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-slate-200">
                                {getGroupTitle(match.group)}
                              </span>

                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-4 w-4" />
                                {formatDate(match.match_date)}
                              </span>
                            </div>

                            <p className="wc-muted text-xs">
                              {match.venue || "Venue not set"}
                            </p>
                          </div>

                          {match.actual_outcome && (
                            <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-black text-green-200">
                              Result: {getOutcomeLabel(match, match.actual_outcome)}
                            </span>
                          )}

                          {!match.actual_outcome && (
                            <MatchTimeBadge
                              matchDate={match.match_date}
                              status={match.status}
                            />
                          )}
                        </div>

                        <div className="mb-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <TeamBadge
                              team={match.team_a}
                              isUnderdog={underdogTeamId === match.team_a_id}
                            />
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <TeamBadge
                              team={match.team_b}
                              isUnderdog={underdogTeamId === match.team_b_id}
                            />
                          </div>
                        </div>

                        {underdogTeamId && (
                          <div className="mb-4 rounded-2xl border border-yellow-300/20 bg-yellow-400/10 p-3 text-xs font-bold text-yellow-100">
                            This matchup has a meaningful underdog.
                          </div>
                        )}

                        <div className="grid gap-2 md:grid-cols-3">
                          {(["TEAM_A_WIN", "DRAW", "TEAM_B_WIN"] as Outcome[]).map(
                            (outcome) => {
                              const isSelected = selectedOutcome === outcome;

                              return (
                                <button
                                  key={outcome}
                                  onClick={() =>
                                    setOutcomeByGroupMatch((previous) => ({
                                      ...previous,
                                      [match.id]: outcome,
                                    }))
                                  }
                                  className={`rounded-2xl border p-3 text-sm font-black transition-all ${
                                    isSelected
                                      ? "border-green-400 bg-green-500/15 text-green-100"
                                      : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                                  }`}
                                >
                                  {getOutcomeLabel(match, outcome)}
                                </button>
                              );
                            }
                          )}
                        </div>

                        <button
                          onClick={() => saveGroupMatchOutcome(match)}
                          disabled={isSaving || !selectedOutcome}
                          className="wc-button mt-4 flex w-full items-center justify-center gap-2 py-3 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Save Outcome
                        </button>
                      </div>
                    );
              })}
            </div>
          </div>
        )}

        {!loading && activeTab === "knockouts" && (
          <div className="space-y-6">
            {knockoutMatches.length === 0 && (
              <div className="wc-card p-6 text-center">
                <Trophy className="mx-auto mb-3 h-10 w-10 text-slate-500" />
                <h2 className="text-2xl font-black">No knockout matches</h2>
                <p className="wc-muted mt-2">
                  Add demo knockout matches or wait for API knockout teams.
                </p>
              </div>
            )}

            <div className="grid gap-4">
              {sortedKnockoutMatches.map((match) => {
                      const selectedWinner = winnerByMatch[match.id];
                      const isSaving = savingKey === `match:${match.id}`;
                      const underdogTeamId = getMeaningfulUnderdogTeamId(
                        match.team_a,
                        match.team_b
                      );

                      return (
                        <div
                          key={match.id}
                          className="rounded-3xl border border-white/10 bg-black/25 p-4"
                        >
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-300">
                                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs font-black text-slate-200">
                                  <Shield className="h-3 w-3 text-blue-300" />
                                  {getRoundLabel(match)}
                                </span>

                                <span className="flex items-center gap-1">
                                  <CalendarDays className="h-4 w-4" />
                                  {formatDate(match.match_date)}
                                </span>
                              </div>

                              <p className="wc-muted text-xs">
                                {match.venue || "Venue not set"}
                              </p>
                            </div>

                            {match.actual_winner_team && (
                              <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-black text-green-200">
                                Winner: {match.actual_winner_team.name}
                              </span>
                            )}

                            {!match.actual_winner_team && (
                              <MatchTimeBadge
                                matchDate={match.match_date}
                                status={match.status}
                              />
                            )}
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            {[match.team_a, match.team_b].map((team) => {
                              if (!team) return null;

                              const isSelected = selectedWinner === team.id;

                              return (
                                <button
                                  key={team.id}
                                  onClick={() =>
                                    setWinnerByMatch((previous) => ({
                                      ...previous,
                                      [match.id]: team.id,
                                    }))
                                  }
                                  className={`rounded-2xl border p-4 text-left transition-all ${
                                    isSelected
                                      ? "border-green-400 bg-green-500/15"
                                      : "border-white/10 bg-white/5 hover:bg-white/10"
                                  }`}
                                >
                                  <TeamBadge
                                    team={team}
                                    isUnderdog={underdogTeamId === team.id}
                                  />
                                </button>
                              );
                            })}
                          </div>

                          {underdogTeamId && (
                            <div className="mt-3 rounded-2xl border border-yellow-300/20 bg-yellow-400/10 p-3 text-xs font-bold text-yellow-100">
                              This matchup has a meaningful underdog.
                            </div>
                          )}

                          <button
                            onClick={() => saveMatchWinner(match)}
                            disabled={isSaving || !selectedWinner}
                            className="wc-button mt-4 flex w-full items-center justify-center gap-2 py-3 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            Save Winner
                          </button>
                        </div>
                      );
              })}
            </div>
          </div>
        )}

        {!loading && activeTab === "groups" && (
          <div className="grid gap-6 md:grid-cols-2">
            {groups.map((group) => {
              const rows = groupRowsByGroup[group.id] || [];
              const isSaving = savingKey === `group:${group.id}`;

              return (
                <div key={group.id} className="wc-card p-5">
                  <h2 className="mb-4 flex items-center gap-2 text-2xl font-black">
                    <Users className="h-6 w-6 text-blue-300" />
                    {group.name}
                  </h2>

                  <div className="space-y-3">
                    {rows.map((row, index) => (
                      <div
                        key={row.team_id}
                        className="rounded-3xl border border-white/10 bg-black/25 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 font-black">
                              {index + 1}
                            </div>

                            <TeamBadge team={row.team} />
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => moveTeam(group.id, index, "up")}
                              disabled={index === 0}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-black disabled:opacity-30"
                            >
                              ↑
                            </button>

                            <button
                              onClick={() => moveTeam(group.id, index, "down")}
                              disabled={index === rows.length - 1}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-black disabled:opacity-30"
                            >
                              ↓
                            </button>
                          </div>
                        </div>

                        <div className="grid gap-2 text-sm">
                          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                            <input
                              type="checkbox"
                              checked={row.qualified_to_ro32}
                              onChange={() =>
                                toggleGroupFlag(
                                  group.id,
                                  index,
                                  "qualified_to_ro32"
                                )
                              }
                            />
                            Qualified to RO32
                          </label>

                          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                            <input
                              type="checkbox"
                              checked={row.qualified_as_best_third}
                              onChange={() =>
                                toggleGroupFlag(
                                  group.id,
                                  index,
                                  "qualified_as_best_third"
                                )
                              }
                            />
                            Qualified as best 3rd
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => saveGroupStandings(group)}
                    disabled={isSaving}
                    className="wc-button mt-4 flex w-full items-center justify-center gap-2 py-3 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save Group Result
                  </button>
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
