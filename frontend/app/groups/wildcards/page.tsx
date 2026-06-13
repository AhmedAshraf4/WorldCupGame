"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Star, Trophy } from "lucide-react";

import { BottomNav } from "@/components/bottomnav";
import { PredictionLockBadge } from "@/components/PredictionLockBadge";
import { WorldCupLoader } from "@/components/WorldCupLoader";
import {
  getLockedButtonLabel,
  mapLocksByKey,
  type LockStatus,
} from "@/lib/locks";
import { supabase } from "@/lib/supabase/client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type Direction = "left" | "right";

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

type GroupPrediction = {
  id: string;
  group_id: string;
  team_id: string;
  predicted_position: number;
  team: Team | null;
  group: Group | null;
};

type SavedWildcard = {
  id: string;
  team_id: string;
  group_id: string;
  predicted_position: number;
  team?: Team | null;
  group?: Group | null;
};

function getCircularIndex(
  currentIndex: number,
  length: number,
  direction: "prev" | "next"
) {
  if (length === 0) return 0;

  if (direction === "prev") {
    return currentIndex === 0 ? length - 1 : currentIndex - 1;
  }

  return currentIndex === length - 1 ? 0 : currentIndex + 1;
}

function getPositionTitle(position: number) {
  if (position === 1) return "Choose 1st Place Wildcard";
  if (position === 2) return "Choose 2nd Place Wildcard";
  if (position === 3) return "Choose 3rd Place Wildcard";
  return "Choose 4th Place Wildcard";
}

function getPositionSubtitle(position: number) {
  if (position === 1) return "Pick one team you predicted to finish first.";
  if (position === 2) return "Pick one team you predicted to finish second.";
  if (position === 3) return "Pick one team you predicted to finish third.";
  return "Pick one team you predicted to finish fourth.";
}

function getPositionBadgeClass(position: number) {
  if (position === 1 || position === 2) {
    return "border-green-400/40 bg-green-500/15 text-green-200";
  }

  if (position === 3) {
    return "border-yellow-400/40 bg-yellow-500/15 text-yellow-200";
  }

  return "border-red-400/40 bg-red-500/15 text-red-200";
}

export default function GroupWildcardsPage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [lock, setLock] = useState<LockStatus | null>(null);

  const [predictions, setPredictions] = useState<GroupPrediction[]>([]);
  const [currentPosition, setCurrentPosition] = useState(1);

  const [indexByPosition, setIndexByPosition] = useState<Record<number, number>>(
    {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
    }
  );

  const [directionByPosition, setDirectionByPosition] = useState<
    Record<number, Direction>
  >({
    1: "right",
    2: "right",
    3: "right",
    4: "right",
  });

  const [selectedTeamByPosition, setSelectedTeamByPosition] = useState<
    Record<number, string>
  >({});

  const [touchStartX, setTouchStartX] = useState<number | null>(null);

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

        const [predictionsResponse, wildcardsResponse, locksResponse] = await Promise.all([
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
          fetch(`${API_BASE_URL}/locks/status`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
        ]);

        const predictionsJson = await predictionsResponse
          .json()
          .catch(() => null);

        const wildcardsJson = await wildcardsResponse.json().catch(() => null);
        const locksJson = await locksResponse.json().catch(() => null);

        if (!predictionsResponse.ok) {
          throw new Error(
            predictionsJson?.detail || "Failed to load group predictions"
          );
        }

        if (!wildcardsResponse.ok) {
          throw new Error(
            wildcardsJson?.detail || "Failed to load group wildcards"
          );
        }

        const loadedPredictions: GroupPrediction[] = predictionsJson.data || [];
        const loadedWildcards: SavedWildcard[] = wildcardsJson.data || [];

        setPredictions(loadedPredictions);
        setLock(mapLocksByKey(locksJson?.data || []).GROUP_WILDCARDS || null);

        const savedSelections: Record<number, string> = {};

        loadedWildcards.forEach((wildcard) => {
          if (
            wildcard.predicted_position >= 1 &&
            wildcard.predicted_position <= 4
          ) {
            savedSelections[wildcard.predicted_position] = wildcard.team_id;
          }
        });

        setSelectedTeamByPosition(savedSelections);

        const nextIndexes: Record<number, number> = {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
        };

        [1, 2, 3, 4].forEach((position) => {
          const options = loadedPredictions
            .filter((prediction) => prediction.predicted_position === position)
            .sort((a, b) => {
              const groupA = a.group?.code || "";
              const groupB = b.group?.code || "";
              return groupA.localeCompare(groupB);
            });

          const savedTeamId = savedSelections[position];

          if (savedTeamId) {
            const savedIndex = options.findIndex(
              (option) => option.team_id === savedTeamId
            );

            nextIndexes[position] = savedIndex >= 0 ? savedIndex : 0;
          }
        });

        setIndexByPosition(nextIndexes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  const predictionsByPosition = useMemo(() => {
    const grouped: Record<number, GroupPrediction[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
    };

    predictions.forEach((prediction) => {
      if (
        prediction.predicted_position >= 1 &&
        prediction.predicted_position <= 4
      ) {
        grouped[prediction.predicted_position].push(prediction);
      }
    });

    [1, 2, 3, 4].forEach((position) => {
      grouped[position].sort((a, b) => {
        const groupA = a.group?.code || "";
        const groupB = b.group?.code || "";
        return groupA.localeCompare(groupB);
      });
    });

    return grouped;
  }, [predictions]);

  const currentOptions = predictionsByPosition[currentPosition] || [];
  const isOpen = !lock || lock.is_open;
  const currentIndex = indexByPosition[currentPosition] || 0;
  const currentDirection = directionByPosition[currentPosition] || "right";

  const currentPrediction = currentOptions[currentIndex];

  const previousPrediction =
    currentOptions.length > 0
      ? currentOptions[
          getCircularIndex(currentIndex, currentOptions.length, "prev")
        ]
      : null;

  const nextPrediction =
    currentOptions.length > 0
      ? currentOptions[
          getCircularIndex(currentIndex, currentOptions.length, "next")
        ]
      : null;

  const selectedCount = [1, 2, 3, 4].filter(
    (position) => selectedTeamByPosition[position]
  ).length;

  function previousWildcard() {
    if (!isOpen) return;
    if (currentOptions.length === 0) return;

    setDirectionByPosition((previous) => ({
      ...previous,
      [currentPosition]: "left",
    }));

    setIndexByPosition((previous) => ({
      ...previous,
      [currentPosition]: getCircularIndex(
        previous[currentPosition] || 0,
        currentOptions.length,
        "prev"
      ),
    }));
  }

  function nextWildcard() {
    if (!isOpen) return;
    if (currentOptions.length === 0) return;

    setDirectionByPosition((previous) => ({
      ...previous,
      [currentPosition]: "right",
    }));

    setIndexByPosition((previous) => ({
      ...previous,
      [currentPosition]: getCircularIndex(
        previous[currentPosition] || 0,
        currentOptions.length,
        "next"
      ),
    }));
  }

  function handleSwipeEnd(endX: number) {
    if (touchStartX === null) return;

    const diff = touchStartX - endX;

    if (Math.abs(diff) < 40) {
      setTouchStartX(null);
      return;
    }

    diff > 0 ? nextWildcard() : previousWildcard();

    setTouchStartX(null);
  }

  function confirmCurrentWildcard() {
    if (!isOpen) return;
    if (!currentPrediction) return;

    setSelectedTeamByPosition((previous) => ({
      ...previous,
      [currentPosition]: currentPrediction.team_id,
    }));

    if (currentPosition < 4) {
      setCurrentPosition((previous) => previous + 1);
    }
  }

  async function saveWildcards() {
    try {
      if (!token) {
        router.push("/login");
        return;
      }

      if (!isOpen) {
        throw new Error(getLockedButtonLabel(lock));
      }

      setSaving(true);
      setError("");
      setSuccess("");

      const wildcards = [1, 2, 3, 4].map((position) => ({
        predicted_position: position,
        team_id: selectedTeamByPosition[position],
      }));

      if (wildcards.some((wildcard) => !wildcard.team_id)) {
        throw new Error("Select one wildcard for each position.");
      }

      const response = await fetch(`${API_BASE_URL}/group-wildcards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ wildcards }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.detail || "Failed to save group wildcards");
      }

      setSuccess("Group wildcards saved successfully.");
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
            Group Stage
          </p>

          <h1 className="text-3xl font-black md:text-5xl">Group Wildcards</h1>

          <p className="wc-muted mt-2">
            Pick one special team from each predicted position.
          </p>
        </div>

        <div className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3, 4].map((position) => {
            const isActive = currentPosition === position;
            const isSelected = Boolean(selectedTeamByPosition[position]);

            return (
              <button
                key={position}
                onClick={() => setCurrentPosition(position)}
                className={`h-2 rounded-full transition-all ${
                  isActive
                    ? "w-14 bg-blue-500"
                    : isSelected
                    ? "w-10 bg-yellow-400"
                    : "w-8 bg-white/20"
                }`}
                aria-label={`Go to wildcard position ${position}`}
              />
            );
          })}
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

        {!loading && <PredictionLockBadge lock={lock} title="Group Wildcards" />}

        {!loading && predictions.length < 48 && (
          <div className="wc-card p-6 text-center">
            <Trophy className="mx-auto mb-3 h-10 w-10 text-slate-500" />

            <h2 className="text-2xl font-black">Save group standings first</h2>

            <p className="wc-muted mt-2">
              You need to finish all group standings before choosing wildcards.
            </p>

            <button
              onClick={() => router.push("/groups/standings")}
              className="wc-button mt-5 px-8 py-3"
            >
              Go to Group Standings
            </button>
          </div>
        )}

        {!loading && predictions.length >= 48 && (
          <div className="wc-card p-5">
            <div className="mb-5 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-black text-yellow-300">
                <Star className="h-5 w-5" />
                Wildcard Rule
              </h2>

              <p className="text-sm text-yellow-100/90">
                Correct wildcard gets a multiplier. Wrong wildcard loses points.
              </p>
            </div>

            <div
              className="relative flex min-h-[500px] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-black/25 p-5"
                onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
                onTouchEnd={(event) =>
                  handleSwipeEnd(event.changedTouches[0].clientX)
              }
            >
              <button
                onClick={previousWildcard}
                disabled={!isOpen}
                className="absolute left-4 z-20 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-3xl hover:bg-white/20"
              >
                ‹
              </button>

              <button
                onClick={nextWildcard}
                disabled={!isOpen}
                className="absolute right-4 z-20 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-3xl hover:bg-white/20"
              >
                ›
              </button>

              {currentPrediction?.team && (
                <div className="w-full text-center">
                  <div className="mb-4 flex justify-center">
                    <div
                      className={`rounded-full border px-4 py-2 text-xs font-black ${getPositionBadgeClass(
                        currentPosition
                      )}`}
                    >
                      {getPositionTitle(currentPosition)}
                    </div>
                  </div>

                  <p className="wc-muted mb-4 text-sm">
                    {getPositionSubtitle(currentPosition)}
                  </p>

                  <div className="relative mx-auto mb-5 flex h-72 w-full items-center justify-center overflow-hidden">
                    {previousPrediction?.team &&
                      previousPrediction.team.id !==
                        currentPrediction.team.id && (
                        <div className="absolute left-0 scale-75 opacity-25 blur-[1px] md:left-16">
                          {previousPrediction.team.flag_url ? (
                            <img
                              src={previousPrediction.team.flag_url}
                              alt={previousPrediction.team.name}
                              className="h-44 w-44 rounded-full border-2 border-white/10 object-cover"
                            />
                          ) : (
                            <div className="flex h-44 w-44 items-center justify-center rounded-full border-2 border-white/10 bg-white/5 text-5xl">
                              🏆
                            </div>
                          )}

                          <p className="mt-2 max-w-36 truncate text-center text-xs font-bold text-white/60">
                            {previousPrediction.team.name}
                          </p>
                        </div>
                      )}

                    {currentPrediction.team.flag_url ? (
                      <img
                        key={`${currentPosition}-${currentPrediction.team.id}`}
                        src={currentPrediction.team.flag_url}
                        alt={currentPrediction.team.name}
                        className={`relative z-10 h-64 w-64 rounded-full border-4 object-cover shadow-2xl transition ${
                          currentDirection === "right"
                            ? "wc-slide-from-right"
                            : "wc-slide-from-left"
                        } ${
                          selectedTeamByPosition[currentPosition] ===
                          currentPrediction.team_id
                            ? "border-yellow-400"
                            : "border-white/15"
                        }`}
                      />
                    ) : (
                      <div
                        key={`${currentPosition}-${currentPrediction.team.id}`}
                        className={`relative z-10 flex h-64 w-64 items-center justify-center rounded-full border-4 bg-white/5 text-7xl shadow-2xl transition ${
                          currentDirection === "right"
                            ? "wc-slide-from-right"
                            : "wc-slide-from-left"
                        } ${
                          selectedTeamByPosition[currentPosition] ===
                          currentPrediction.team_id
                            ? "border-yellow-400"
                            : "border-white/15"
                        }`}
                      >
                        🏆
                      </div>
                    )}

                    {nextPrediction?.team &&
                      nextPrediction.team.id !== currentPrediction.team.id && (
                        <div className="absolute right-0 scale-75 opacity-25 blur-[1px] md:right-16">
                          {nextPrediction.team.flag_url ? (
                            <img
                              src={nextPrediction.team.flag_url}
                              alt={nextPrediction.team.name}
                              className="h-44 w-44 rounded-full border-2 border-white/10 object-cover"
                            />
                          ) : (
                            <div className="flex h-44 w-44 items-center justify-center rounded-full border-2 border-white/10 bg-white/5 text-5xl">
                              🏆
                            </div>
                          )}

                          <p className="mt-2 max-w-36 truncate text-center text-xs font-bold text-white/60">
                            {nextPrediction.team.name}
                          </p>
                        </div>
                      )}
                  </div>

                  <h2 className="text-4xl font-black">
                    {currentPrediction.team.name}
                  </h2>

                  <p className="wc-muted mt-1 text-sm">
                    Group {currentPrediction.group?.code || "-"} ·{" "}
                    {currentIndex + 1} / {currentOptions.length}
                  </p>

                  {selectedTeamByPosition[currentPosition] ===
                    currentPrediction.team_id && (
                    <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-green-500/15 px-4 py-2 text-sm font-bold text-green-200">
                      <CheckCircle2 className="h-4 w-4" />
                      Wildcard Confirmed
                    </div>
                  )}

                  <button
                    onClick={confirmCurrentWildcard}
                    disabled={!isOpen}
                    className="wc-button-gold mt-5 px-8 py-3 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {selectedTeamByPosition[currentPosition] ===
                    currentPrediction.team_id
                      ? "Confirmed"
                      : "Confirm Wildcard"}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() =>
                  setCurrentPosition((previous) =>
                    previous === 1 ? 1 : previous - 1
                  )
                }
                disabled={currentPosition === 1}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 font-bold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Back
              </button>

              {currentPosition < 4 ? (
                <button
                  onClick={() => setCurrentPosition((previous) => previous + 1)}
                  className="wc-button px-4 py-4 text-lg"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={saveWildcards}
                  disabled={saving || selectedCount !== 4 || !isOpen}
                  className="wc-button px-4 py-4 text-lg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : !isOpen
                    ? getLockedButtonLabel(lock)
                    : selectedCount !== 4
                    ? "Complete all required picks"
                    : "Save Wildcards"}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <BottomNav />
    </main>
  );
}
