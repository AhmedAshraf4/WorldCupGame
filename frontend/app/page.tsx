"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { BadgeGrid, type UserBadge } from "@/components/BadgeGrid";
import { BottomNav } from "@/components/bottomnav";
import { WorldCupLoader } from "@/components/WorldCupLoader";
import { supabase } from "@/lib/supabase/client";

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
  score_events?: ScoreEvent[];
  data?: ScoreEvent[];
};

type ScoreEvent = {
  id?: string;
  source_type?: string | null;
  source_key?: string | null;
  points?: number | null;
  description?: string | null;
  created_at?: string | null;
};

type Team = {
  id: string;
  name: string;
  flag_url?: string | null;
};

type Group = {
  id: string;
  code: string;
  name?: string | null;
};

type GroupPrediction = {
  id?: string;
  group_id: string;
  team_id: string;
  predicted_position: number;
  team?: Team | null;
  group?: Group | null;
};

type GroupWildcard = {
  id?: string;
  group_id: string;
  team_id: string;
  predicted_position: number;
  team?: Team | null;
  group?: Group | null;
};

type GroupMatch = {
  id: string;
  group_id?: string | null;
  team_a_id: string;
  team_b_id: string;
  matchday?: number | null;
  match_date?: string | null;
  actual_outcome?: Outcome | null;
  status?: string | null;
  team_a?: Team | null;
  team_b?: Team | null;
  group?: Group | null;
};

type GroupMatchPrediction = {
  id?: string;
  match_id: string;
  predicted_outcome: Outcome;
  matchday?: number | null;
};

type KnockoutRound =
  | "ROUND_OF_32"
  | "ROUND_OF_16"
  | "QUARTER_FINAL"
  | "SEMI_FINAL"
  | "THIRD_PLACE"
  | "FINAL";

type KnockoutMatch = {
  id: string;
  stage?: string | null;
  round_name?: string | null;
  match_round?: KnockoutRound | string | null;
  team_a_id?: string | null;
  team_b_id?: string | null;
  match_date?: string | null;
  actual_winner_team_id?: string | null;
  status?: string | null;
  team_a?: Team | null;
  team_b?: Team | null;
};

type KnockoutPrediction = {
  id?: string;
  match_id: string;
  predicted_winner_team_id: string;
  team?: Team | null;
  team_id?: string | null;
  match?: KnockoutMatch | null;
  match_round?: KnockoutRound | string | null;
  round_name?: string | null;
};

type KnockoutWildcard = {
  id?: string;
  wildcard_round: KnockoutRound | string;
  round_label?: string | null;
  team_id: string;
  team?: Team | null;
  prediction?: KnockoutPrediction | null;
};

type Outcome = "TEAM_A_WIN" | "DRAW" | "TEAM_B_WIN";

type BreakdownTab = "GROUP_STANDINGS" | "GROUP_MATCHES" | KnockoutRound;

type PointsBreakdown = {
  standing: number;
  wildcard: number;
  total: number;
};

type MatchPointsBreakdown = {
  base: number;
  wildcard: number;
  total: number;
};

const KNOCKOUT_ROUND_LABELS: Record<string, string> = {
  ROUND_OF_32: "Round of 32",
  ROUND_OF_16: "Round of 16",
  QUARTER_FINAL: "Quarter Final",
  SEMI_FINAL: "Semi Final",
  THIRD_PLACE: "Third Place",
  FINAL: "Final",
};

const KNOCKOUT_ROUND_POINTS: Record<string, number> = {
  ROUND_OF_32: 5,
  ROUND_OF_16: 10,
  QUARTER_FINAL: 15,
  SEMI_FINAL: 20,
  THIRD_PLACE: 10,
  FINAL: 30,
};

const KNOCKOUT_ROUND_ORDER: KnockoutRound[] = [
  "ROUND_OF_32",
  "ROUND_OF_16",
  "QUARTER_FINAL",
  "SEMI_FINAL",
  "FINAL",
];

function formatScoreDate(value?: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPoints(points: number) {
  return `${points > 0 ? "+" : ""}${points}`;
}

function getGroupLabel(group?: Group | null) {
  if (!group) return "Group";

  return group.name || (group.code ? `Group ${group.code}` : "Group");
}

function getOutcomeLabel(outcome?: Outcome | string | null, match?: GroupMatch) {
  if (!outcome) return "Pending";
  if (outcome === "DRAW") return "Draw";
  if (outcome === "TEAM_A_WIN") return `${match?.team_a?.name || "Team A"} win`;
  if (outcome === "TEAM_B_WIN") return `${match?.team_b?.name || "Team B"} win`;

  return outcome;
}

function getKnockoutRoundLabel(round?: string | null) {
  if (!round) return "Knockout";

  return KNOCKOUT_ROUND_LABELS[round] || round;
}

function getKnockoutMatchRound(match?: KnockoutMatch | null) {
  return match?.match_round || match?.stage || match?.round_name || null;
}

function getKnockoutWinnerLabel(
  teamId?: string | null,
  match?: KnockoutMatch | null
) {
  if (!teamId) return "Pending";
  if (teamId === match?.team_a_id) return `${match?.team_a?.name || "Team A"} win`;
  if (teamId === match?.team_b_id) return `${match?.team_b?.name || "Team B"} win`;

  return "Unknown winner";
}

function normalizeTeamName(name?: string | null) {
  return (name || "").trim().toLowerCase();
}

function isSouthAfricaSouthKoreaMatch(match?: GroupMatch) {
  if (!match) return false;

  const teamNames = [
    normalizeTeamName(match.team_a?.name),
    normalizeTeamName(match.team_b?.name),
  ];

  return teamNames.includes("south africa") && teamNames.includes("south korea");
}

function getScoreEventPoints(
  events: ScoreEvent[],
  sourceType: string,
  sourceKey: string
) {
  return events
    .filter(
      (event) =>
        event.source_type === sourceType && event.source_key === sourceKey
    )
    .reduce((total, event) => total + Number(event.points || 0), 0);
}

export default function HomePage() {
  const router = useRouter();

  const [data, setData] = useState<MeResponse | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [scoreEvents, setScoreEvents] = useState<ScoreEvent[]>([]);
  const [groupPredictions, setGroupPredictions] = useState<GroupPrediction[]>(
    []
  );
  const [groupWildcards, setGroupWildcards] = useState<GroupWildcard[]>([]);
  const [groupMatchPredictions, setGroupMatchPredictions] = useState<
    GroupMatchPrediction[]
  >([]);
  const [groupMatches, setGroupMatches] = useState<GroupMatch[]>([]);
  const [knockoutPredictions, setKnockoutPredictions] = useState<
    KnockoutPrediction[]
  >([]);
  const [knockoutWildcards, setKnockoutWildcards] = useState<
    KnockoutWildcard[]
  >([]);
  const [selectedBadgeKey, setSelectedBadgeKey] = useState<string | null>(null);
  const [selectingBadgeKey, setSelectingBadgeKey] = useState<string | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "breakdown" | "badges"
  >("dashboard");
  const [activeBreakdownTab, setActiveBreakdownTab] =
    useState<BreakdownTab>("GROUP_STANDINGS");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedBadge = useMemo(
    () => badges.find((badge) => badge.key === selectedBadgeKey) || null,
    [badges, selectedBadgeKey]
  );

  const groupPredictionsByGroup = useMemo(() => {
    const grouped = new Map<string, GroupPrediction[]>();

    groupPredictions.forEach((prediction) => {
      const groupId = prediction.group_id;
      const predictions = grouped.get(groupId) || [];
      predictions.push(prediction);
      grouped.set(groupId, predictions);
    });

    return Array.from(grouped.values())
      .map((predictions) =>
        [...predictions].sort(
          (a, b) => a.predicted_position - b.predicted_position
        )
      )
      .sort((a, b) =>
        getGroupLabel(a[0]?.group).localeCompare(getGroupLabel(b[0]?.group))
      );
  }, [groupPredictions]);

  const wildcardByStandingKey = useMemo(() => {
    const wildcards = new Map<string, GroupWildcard>();

    groupWildcards.forEach((wildcard) => {
      wildcards.set(
        `${wildcard.group_id}:${wildcard.team_id}:${wildcard.predicted_position}`,
        wildcard
      );
    });

    return wildcards;
  }, [groupWildcards]);

  const matchById = useMemo(() => {
    return new Map(groupMatches.map((match) => [match.id, match]));
  }, [groupMatches]);

  const sortedGroupMatchPredictions = useMemo(() => {
    return [...groupMatchPredictions].sort((a, b) => {
      const matchA = matchById.get(a.match_id);
      const matchB = matchById.get(b.match_id);
      const dateA = matchA?.match_date || "";
      const dateB = matchB?.match_date || "";

      if (dateA !== dateB) return dateA.localeCompare(dateB);

      return (matchA?.team_a?.name || "").localeCompare(
        matchB?.team_a?.name || ""
      );
    });
  }, [groupMatchPredictions, matchById]);

  const knockoutWildcardByRoundTeam = useMemo(() => {
    const wildcards = new Map<string, KnockoutWildcard>();

    knockoutWildcards.forEach((wildcard) => {
      wildcards.set(`${wildcard.wildcard_round}:${wildcard.team_id}`, wildcard);
    });

    return wildcards;
  }, [knockoutWildcards]);

  const sortedKnockoutPredictions = useMemo(() => {
    return [...knockoutPredictions].sort((a, b) => {
      const matchA = a.match;
      const matchB = b.match;
      const dateA = matchA?.match_date || "";
      const dateB = matchB?.match_date || "";

      if (dateA !== dateB) return dateA.localeCompare(dateB);

      return getKnockoutRoundLabel(getKnockoutMatchRound(matchA)).localeCompare(
        getKnockoutRoundLabel(getKnockoutMatchRound(matchB))
      );
    });
  }, [knockoutPredictions]);

  const activeKnockoutPredictions = useMemo(() => {
    if (
      activeBreakdownTab === "GROUP_STANDINGS" ||
      activeBreakdownTab === "GROUP_MATCHES"
    ) {
      return [];
    }

    return sortedKnockoutPredictions.filter((prediction) => {
      const round = prediction.match_round || getKnockoutMatchRound(prediction.match);

      return (
        round === activeBreakdownTab ||
        (activeBreakdownTab === "FINAL" && round === "THIRD_PLACE")
      );
    });
  }, [activeBreakdownTab, sortedKnockoutPredictions]);

  function getStandingPoints(prediction: GroupPrediction): PointsBreakdown {
    const standingKey = `${prediction.group_id}:${prediction.team_id}`;
    const wildcardKey = `${standingKey}:${prediction.predicted_position}`;
    const standing = getScoreEventPoints(
      scoreEvents,
      "GROUP_STANDING",
      standingKey
    );
    const wildcard = getScoreEventPoints(
      scoreEvents,
      "GROUP_WILDCARD",
      wildcardKey
    );
    const normalizedWildcard =
      standing > 0 && wildcard > 0 ? Math.min(wildcard, standing * 2) : wildcard;

    return {
      standing,
      wildcard: normalizedWildcard,
      total: standing + normalizedWildcard,
    };
  }

  function getKnockoutPredictionPoints(
    prediction: KnockoutPrediction
  ): MatchPointsBreakdown {
    const match = prediction.match;
    const round = prediction.match_round || getKnockoutMatchRound(match) || "";
    const wildcardRound = round === "THIRD_PLACE" ? "FINAL" : round;
    const wildcard = knockoutWildcardByRoundTeam.get(
      `${wildcardRound}:${prediction.predicted_winner_team_id}`
    );
    const base = getScoreEventPoints(
      scoreEvents,
      "KNOCKOUT_PREDICTION",
      prediction.match_id
    );
    const rawWildcard = wildcard
      ? getScoreEventPoints(
          scoreEvents,
          "KNOCKOUT_WILDCARD",
          String(wildcardRound)
        )
      : 0;
    const roundPoints = KNOCKOUT_ROUND_POINTS[String(round)] || 0;
    const targetWildcardBonus =
      roundPoints > 0 ? roundPoints * 3 - base : rawWildcard;
    const normalizedWildcard =
      base > 0 && rawWildcard > 0 ? targetWildcardBonus : rawWildcard;

    return {
      base,
      wildcard: normalizedWildcard,
      total: base + normalizedWildcard,
    };
  }

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

        const [
          scoreResponse,
          badgesResponse,
          groupPredictionsResponse,
          groupWildcardsResponse,
          groupMatchPredictionsResponse,
          groupMatchesResponse,
          knockoutPredictionsResponse,
          knockoutWildcardsResponse,
        ] = await Promise.all([
          fetch(`${API_BASE_URL}/scoring/me`, {
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
          fetch(`${API_BASE_URL}/group-predictions/with-teams`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/group-wildcards/with-teams`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/group-match-predictions/with-matches`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/matches/group-stage`, {
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/knockout-predictions/with-teams`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/knockout-wildcards/with-teams`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
        ]);

        const scoreResult: ScoreResponse | null = await scoreResponse
          .json()
          .catch(() => null);
        const badgesResult = await badgesResponse.json().catch(() => null);
        const groupPredictionsResult = await groupPredictionsResponse
          .json()
          .catch(() => null);
        const groupWildcardsResult = await groupWildcardsResponse
          .json()
          .catch(() => null);
        const groupMatchPredictionsResult = await groupMatchPredictionsResponse
          .json()
          .catch(() => null);
        const groupMatchesResult = await groupMatchesResponse
          .json()
          .catch(() => null);
        const knockoutPredictionsResult = await knockoutPredictionsResponse
          .json()
          .catch(() => null);
        const knockoutWildcardsResult = await knockoutWildcardsResponse
          .json()
          .catch(() => null);

        if (scoreResponse.ok && scoreResult) {
          const latestTotal =
            scoreResult.total_points ??
            meResult.total_points ??
            0;

          setTotalPoints(latestTotal);
          setScoreEvents(scoreResult.score_events || scoreResult.data || []);
        } else {
          setTotalPoints(meResult.total_points || 0);
          setScoreEvents([]);
        }

        if (badgesResponse.ok && badgesResult) {
          setBadges(badgesResult.data || []);
          setSelectedBadgeKey(badgesResult.selected_badge_key || null);
        }

        if (groupPredictionsResponse.ok && groupPredictionsResult) {
          setGroupPredictions(groupPredictionsResult.data || []);
        }

        if (groupWildcardsResponse.ok && groupWildcardsResult) {
          setGroupWildcards(groupWildcardsResult.data || []);
        }

        if (
          groupMatchPredictionsResponse.ok &&
          groupMatchPredictionsResult
        ) {
          setGroupMatchPredictions(groupMatchPredictionsResult.data || []);
        }

        if (groupMatchesResponse.ok && groupMatchesResult) {
          setGroupMatches(groupMatchesResult.data || []);
        }

        if (knockoutPredictionsResponse.ok && knockoutPredictionsResult) {
          setKnockoutPredictions(knockoutPredictionsResult.data || []);
        }

        if (knockoutWildcardsResponse.ok && knockoutWildcardsResult) {
          setKnockoutWildcards(knockoutWildcardsResult.data || []);
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

  async function selectBadge(badge: UserBadge) {
    try {
      setSelectingBadgeKey(badge.key);
      setSuccess("");
      setError("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
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

  if (loading) {
    return (
      <main className="wc-page flex min-h-screen items-center justify-center p-6 text-white">
        <WorldCupLoader />
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
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <p className="wc-muted truncate text-sm">
                    Welcome, {data.profile?.display_name}
                  </p>
                  {selectedBadge && (
                    <img
                      src={selectedBadge.image_url}
                      alt={selectedBadge.name}
                      className="h-6 w-6 shrink-0 rounded-full object-cover"
                    />
                  )}
                </div>
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

        <div className="mb-6 space-y-2 rounded-3xl border border-white/10 bg-white/5 p-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                activeTab === "dashboard"
                  ? "bg-yellow-500/20 text-yellow-100"
                  : "text-slate-400 hover:bg-white/5"
              }`}
            >
              Dashboard
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

          <button
            onClick={() => setActiveTab("breakdown")}
            className={`w-full rounded-2xl px-4 py-3 text-sm font-black transition ${
              activeTab === "breakdown"
                ? "bg-yellow-500/20 text-yellow-100"
                : "text-slate-400 hover:bg-white/5"
            }`}
          >
            Points Breakdown
          </button>
        </div>

        {success && (
          <p className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-green-300">
            {success}
          </p>
        )}

        {activeTab === "dashboard" ? (
          <>
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
                  <h3 className="text-xl font-black">
                    {data.champion?.team.name}
                  </h3>
                  <p className="wc-muted text-sm">
                    Rank #{data.champion?.team.fifa_rank ?? "-"} -{" "}
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
          </>
        ) : activeTab === "breakdown" ? (
          <div className="space-y-6">
            <div className="wc-card p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="wc-gold text-xs font-black uppercase tracking-[0.22em]">
                    Points
                  </p>
                  <h2 className="mt-1 text-2xl font-black">Full Breakdown</h2>
                  <p className="wc-muted mt-1 text-sm">
                    Group standings, wildcards, and match points in one place.
                  </p>
                </div>

                <div className="rounded-2xl border border-green-400/20 bg-green-500/10 px-4 py-3 text-right">
                  <p className="wc-muted text-xs font-bold uppercase">
                    Total
                  </p>
                  <p className="text-3xl font-black text-green-300">
                    {totalPoints}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                  { key: "GROUP_STANDINGS" as BreakdownTab, label: "Group Standings" },
                  { key: "GROUP_MATCHES" as BreakdownTab, label: "Group Matches" },
                  ...KNOCKOUT_ROUND_ORDER.map((round) => ({
                    key: round as BreakdownTab,
                    label: getKnockoutRoundLabel(round),
                  })),
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveBreakdownTab(tab.key)}
                    className={`shrink-0 rounded-2xl px-4 py-2 text-xs font-black transition ${
                      activeBreakdownTab === tab.key
                        ? "bg-yellow-500/20 text-yellow-100"
                        : "bg-white/5 text-slate-400 hover:bg-white/10"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {activeBreakdownTab === "GROUP_STANDINGS" && (
            <div className="wc-card p-5">
              <div className="mb-4">
                <p className="wc-gold text-xs font-black uppercase tracking-[0.22em]">
                  Group Stage
                </p>
                <h3 className="mt-1 text-xl font-black">
                  Standings You Chose
                </h3>
              </div>

              {groupPredictionsByGroup.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
                  <p className="font-black">No group standings saved yet.</p>
                  <p className="wc-muted mt-1 text-sm">
                    Your chosen groups will appear here after you submit them.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {groupPredictionsByGroup.map((predictions) => (
                    <div
                      key={predictions[0]?.group_id}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <h4 className="mb-3 text-lg font-black">
                        {getGroupLabel(predictions[0]?.group)}
                      </h4>

                      <div className="space-y-2">
                        {predictions.map((prediction) => {
                          const points = getStandingPoints(prediction);
                          const wildcard = wildcardByStandingKey.get(
                            `${prediction.group_id}:${prediction.team_id}:${prediction.predicted_position}`
                          );

                          return (
                            <div
                              key={`${prediction.group_id}:${prediction.team_id}`}
                              className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 p-3"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="w-6 shrink-0 text-sm font-black text-yellow-300">
                                  {prediction.predicted_position}
                                </span>
                                {prediction.team?.flag_url && (
                                  <img
                                    src={prediction.team.flag_url}
                                    alt={prediction.team.name}
                                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                                  />
                                )}
                                <div className="min-w-0">
                                  <p className="truncate font-black">
                                    {prediction.team?.name || "Unknown team"}
                                  </p>
                                  {wildcard && (
                                    <p className="text-xs font-bold text-yellow-200">
                                      Wildcard total:{" "}
                                      {formatPoints(points.total)}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="shrink-0 text-right">
                                <p
                                  className={`text-lg font-black ${
                                    points.total >= 0
                                      ? "text-green-300"
                                      : "text-red-300"
                                  }`}
                                >
                                  {formatPoints(points.total)}
                                </p>
                                {wildcard && (
                                  <p className="wc-muted text-xs">
                                    Base {formatPoints(points.standing)} + bonus{" "}
                                    {formatPoints(points.wildcard)}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {activeBreakdownTab === "GROUP_MATCHES" && (
            <div className="wc-card p-5">
              <div className="mb-4">
                <p className="wc-gold text-xs font-black uppercase tracking-[0.22em]">
                  Matches
                </p>
                <h3 className="mt-1 text-xl font-black">
                  Actual Outcomes And Points
                </h3>
              </div>

              {sortedGroupMatchPredictions.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
                  <p className="font-black">No group match picks saved yet.</p>
                  <p className="wc-muted mt-1 text-sm">
                    Your match-by-match points will appear after you submit
                    predictions.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedGroupMatchPredictions.map((prediction) => {
                    const match = matchById.get(prediction.match_id);
                    const points = getScoreEventPoints(
                      scoreEvents,
                      "GROUP_MATCH_PREDICTION",
                      prediction.match_id
                    );
                    const showSouthAfricaKoreaEgg =
                      isSouthAfricaSouthKoreaMatch(match);

                    return (
                      <div
                        key={prediction.match_id}
                        className="rounded-2xl border border-white/10 bg-black/20 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              <span className="rounded-full bg-white/10 px-2 py-1 font-black text-slate-200">
                                {getGroupLabel(match?.group)}
                              </span>
                              <span>
                                Matchday {match?.matchday || prediction.matchday || "?"}
                              </span>
                              {match?.match_date && (
                                <span>{formatScoreDate(match.match_date)}</span>
                              )}
                            </div>

                            <p className="text-lg font-black">
                              {match?.team_a?.name || "Team A"} vs{" "}
                              {match?.team_b?.name || "Team B"}{" "}
                              {showSouthAfricaKoreaEgg && (
                                <span
                                  className="text-xl"
                                  aria-label="haha pointing at you"
                                >
                                  🤣 🫵
                                </span>
                              )}
                            </p>
                          </div>

                          <div
                            className={`rounded-2xl px-3 py-2 text-lg font-black ${
                              points >= 0
                                ? "bg-green-500/10 text-green-300"
                                : "bg-red-500/10 text-red-300"
                            }`}
                          >
                            {formatPoints(points)}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 md:grid-cols-2">
                          <div className="rounded-2xl bg-white/5 p-3">
                            <p className="wc-muted text-xs font-bold uppercase">
                              Your Pick
                            </p>
                            <p className="mt-1 font-black">
                              {getOutcomeLabel(
                                prediction.predicted_outcome,
                                match
                              )}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-white/5 p-3">
                            <p className="wc-muted text-xs font-bold uppercase">
                              Actual Result
                            </p>
                            <p className="mt-1 font-black">
                              {getOutcomeLabel(match?.actual_outcome, match)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {activeBreakdownTab !== "GROUP_STANDINGS" &&
              activeBreakdownTab !== "GROUP_MATCHES" && (
            <div className="wc-card p-5">
              <div className="mb-4">
                <p className="wc-gold text-xs font-black uppercase tracking-[0.22em]">
                  Knockouts
                </p>
                <h3 className="mt-1 text-xl font-black">
                  {getKnockoutRoundLabel(activeBreakdownTab)} Outcomes And Points
                </h3>
              </div>

              {activeKnockoutPredictions.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
                  <p className="font-black">
                    No {getKnockoutRoundLabel(activeBreakdownTab)} picks saved yet.
                  </p>
                  <p className="wc-muted mt-1 text-sm">
                    This phase will appear here after you submit predictions for it.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeKnockoutPredictions.map((prediction) => {
                    const match = prediction.match;
                    const round = prediction.match_round || getKnockoutMatchRound(match);
                    const wildcardRound =
                      round === "THIRD_PLACE" ? "FINAL" : round;
                    const points = getKnockoutPredictionPoints(prediction);
                    const wildcard = knockoutWildcardByRoundTeam.get(
                      `${wildcardRound}:${prediction.predicted_winner_team_id}`
                    );

                    return (
                      <div
                        key={prediction.match_id}
                        className="rounded-2xl border border-white/10 bg-black/20 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              <span className="rounded-full bg-white/10 px-2 py-1 font-black text-slate-200">
                                {getKnockoutRoundLabel(round)}
                              </span>
                              {match?.match_date && (
                                <span>{formatScoreDate(match.match_date)}</span>
                              )}
                              {wildcard && (
                                <span className="rounded-full bg-yellow-400/10 px-2 py-1 font-black text-yellow-200">
                                  Wildcard
                                </span>
                              )}
                            </div>

                            <p className="text-lg font-black">
                              {match?.team_a?.name || "Team A"} vs{" "}
                              {match?.team_b?.name || "Team B"}
                            </p>
                          </div>

                          <div
                            className={`rounded-2xl px-3 py-2 text-lg font-black ${
                              points.total >= 0
                                ? "bg-green-500/10 text-green-300"
                                : "bg-red-500/10 text-red-300"
                            }`}
                          >
                            {formatPoints(points.total)}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 md:grid-cols-3">
                          <div className="rounded-2xl bg-white/5 p-3">
                            <p className="wc-muted text-xs font-bold uppercase">
                              Your Pick
                            </p>
                            <p className="mt-1 font-black">
                              {getKnockoutWinnerLabel(
                                prediction.predicted_winner_team_id,
                                match
                              )}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-white/5 p-3">
                            <p className="wc-muted text-xs font-bold uppercase">
                              Actual Winner
                            </p>
                            <p className="mt-1 font-black">
                              {getKnockoutWinnerLabel(
                                match?.actual_winner_team_id,
                                match
                              )}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-white/5 p-3">
                            <p className="wc-muted text-xs font-bold uppercase">
                              Points
                            </p>
                            <p className="mt-1 font-black">
                              Base {formatPoints(points.base)}
                              {wildcard &&
                                ` + wildcard ${formatPoints(points.wildcard)}`}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}
          </div>
        ) : (
          <div className="wc-card p-5">
            <div className="mb-4">
              <p className="wc-gold text-xs font-black uppercase tracking-[0.22em]">
                Collection
              </p>
              <h2 className="mt-1 text-2xl font-black">Owned Badges</h2>
              <p className="wc-muted mt-1 text-sm">
                Select one badge to appear next to your name on the leaderboard.
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
      </section>

      <BottomNav />
    </main>
  );
}
