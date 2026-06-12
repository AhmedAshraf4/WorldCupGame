"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Star, Trophy } from "lucide-react";

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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type Team = {
  id: string;
  name: string;
  flag_url?: string | null;
  fifa_rank?: number | null;
};

type KnockoutWildcardRound =
  | "ROUND_OF_32"
  | "ROUND_OF_16"
  | "QUARTER_FINAL"
  | "SEMI_FINAL"
  | "FINAL";

type KnockoutPredictionOption = {
  id: string;
  match_id: string;
  team_id: string;
  predicted_winner_team_id?: string;
  wildcard_round: KnockoutWildcardRound;
  round_label: string;
  team: Team | null;
  match?: Record<string, unknown> | null;
};

type WildcardOptionGroup = {
  wildcard_round: KnockoutWildcardRound;
  round_label: string;
  options: KnockoutPredictionOption[];
};

type SavedKnockoutWildcard = {
  id: string;
  wildcard_round: KnockoutWildcardRound;
  team_id: string;
  team?: Team | null;
};

const ROUND_ORDER: KnockoutWildcardRound[] = [
  "ROUND_OF_32",
  "ROUND_OF_16",
  "QUARTER_FINAL",
  "SEMI_FINAL",
  "FINAL",
];

const ROUND_SHORT_LABELS: Record<KnockoutWildcardRound, string> = {
  ROUND_OF_32: "RO32",
  ROUND_OF_16: "RO16",
  QUARTER_FINAL: "QF",
  SEMI_FINAL: "SF",
  FINAL: "Final",
};

function getMatchDateFromOption(option?: KnockoutPredictionOption | null) {
  const value = option?.match?.match_date;

  return typeof value === "string" ? value : null;
}

function getMatchStatusFromOption(option?: KnockoutPredictionOption | null) {
  const value = option?.match?.status;

  return typeof value === "string" ? value : null;
}

function isLockGateOpen(lock?: LockStatus) {
  return !lock || lock.is_open || lock.reason === "DEADLINE_PASSED";
}

function isWildcardOptionDeadlineOpen(
  option?: KnockoutPredictionOption | null
) {
  const matchDateValue = getMatchDateFromOption(option);

  if (!matchDateValue) return true;

  const matchDate = new Date(matchDateValue);

  if (Number.isNaN(matchDate.getTime())) return true;

  return Date.now() < matchDate.getTime();
}

function isWildcardOptionOpen(
  option?: KnockoutPredictionOption | null,
  lock?: LockStatus
) {
  return isLockGateOpen(lock) && isWildcardOptionDeadlineOpen(option);
}

const WILDCARD_LOCK_KEYS: Record<KnockoutWildcardRound, string> = {
  ROUND_OF_32: "KNOCKOUT_WILDCARD_ROUND_OF_32",
  ROUND_OF_16: "KNOCKOUT_WILDCARD_ROUND_OF_16",
  QUARTER_FINAL: "KNOCKOUT_WILDCARD_QUARTER_FINAL",
  SEMI_FINAL: "KNOCKOUT_WILDCARD_SEMI_FINAL",
  FINAL: "KNOCKOUT_WILDCARD_FINAL",
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

function getCircularOffset(index: number, currentIndex: number, length: number) {
  let offset = index - currentIndex;

  if (offset > length / 2) {
    offset -= length;
  }

  if (offset < -length / 2) {
    offset += length;
  }

  return offset;
}

function getCarouselCardStyle(offset: number): CSSProperties {
  const baseCenter = "translate(-50%, -50%)";

  if (Math.abs(offset) > 2) {
    return {
      opacity: 0,
      pointerEvents: "none",
      transform: `${baseCenter} translateX(0px) translateY(30px) translateZ(-360px) rotateY(${
        offset > 0 ? -65 : 65
      }deg) scale(0.35)`,
      zIndex: 0,
    };
  }

  if (offset === 0) {
    return {
      opacity: 1,
      transform: `${baseCenter} translateX(0px) translateY(0px) translateZ(120px) rotateY(0deg) scale(1)`,
      zIndex: 40,
    };
  }

  if (offset === -1) {
    return {
      opacity: 0.45,
      transform: `${baseCenter} translateX(-95px) translateY(18px) translateZ(-120px) rotateY(45deg) scale(0.72)`,
      zIndex: 25,
    };
  }

  if (offset === 1) {
    return {
      opacity: 0.45,
      transform: `${baseCenter} translateX(95px) translateY(18px) translateZ(-120px) rotateY(-45deg) scale(0.72)`,
      zIndex: 25,
    };
  }

  if (offset === -2) {
    return {
      opacity: 0.16,
      transform: `${baseCenter} translateX(-40px) translateY(36px) translateZ(-260px) rotateY(68deg) scale(0.48)`,
      zIndex: 10,
    };
  }

  return {
    opacity: 0.16,
    transform: `${baseCenter} translateX(40px) translateY(36px) translateZ(-260px) rotateY(-68deg) scale(0.48)`,
    zIndex: 10,
  };
}

export default function KnockoutWildcardsPage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [locksByKey, setLocksByKey] = useState<Record<string, LockStatus>>({});

  const [optionGroups, setOptionGroups] = useState<WildcardOptionGroup[]>([]);
  const [currentRound, setCurrentRound] =
    useState<KnockoutWildcardRound>("ROUND_OF_32");

  const [indexByRound, setIndexByRound] = useState<
    Record<KnockoutWildcardRound, number>
  >({
    ROUND_OF_32: 0,
    ROUND_OF_16: 0,
    QUARTER_FINAL: 0,
    SEMI_FINAL: 0,
    FINAL: 0,
  });

  const [selectedTeamByRound, setSelectedTeamByRound] = useState<
    Partial<Record<KnockoutWildcardRound, string>>
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

        const [optionsResponse, savedResponse, locksResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/knockout-wildcards/options`, {
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
          fetch(`${API_BASE_URL}/locks/status`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
        ]);

        const optionsJson = await optionsResponse.json().catch(() => null);
        const savedJson = await savedResponse.json().catch(() => null);
        const locksJson = await locksResponse.json().catch(() => null);

        if (!optionsResponse.ok) {
          throw new Error(
            optionsJson?.detail || "Failed to load knockout wildcard options"
          );
        }

        if (!savedResponse.ok) {
          throw new Error(
            savedJson?.detail || "Failed to load saved knockout wildcards"
          );
        }

        const loadedGroups: WildcardOptionGroup[] = (optionsJson.data || []).map(
          (group: WildcardOptionGroup) => ({
            ...group,
            options: [...(group.options || [])].sort((a, b) => {
              const dateDifference =
                getMatchTimestamp(getMatchDateFromOption(a)) -
                getMatchTimestamp(getMatchDateFromOption(b));

              if (dateDifference !== 0) return dateDifference;

              return (a.team?.name || "").localeCompare(b.team?.name || "");
            }),
          })
        );
        const savedWildcards: SavedKnockoutWildcard[] = savedJson.data || [];

        setOptionGroups(loadedGroups);
        setLocksByKey(mapLocksByKey(locksJson?.data || []));

        const savedSelections: Partial<Record<KnockoutWildcardRound, string>> =
          {};

        savedWildcards.forEach((wildcard) => {
          savedSelections[wildcard.wildcard_round] = wildcard.team_id;
        });

        setSelectedTeamByRound(savedSelections);

        const nextIndexes: Record<KnockoutWildcardRound, number> = {
          ROUND_OF_32: 0,
          ROUND_OF_16: 0,
          QUARTER_FINAL: 0,
          SEMI_FINAL: 0,
          FINAL: 0,
        };

        loadedGroups.forEach((group) => {
          const savedTeamId = savedSelections[group.wildcard_round];

          if (savedTeamId) {
            const savedIndex = group.options.findIndex(
              (option) => option.team_id === savedTeamId
            );

            nextIndexes[group.wildcard_round] =
              savedIndex >= 0 ? savedIndex : 0;
          }
        });

        setIndexByRound(nextIndexes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  const optionsByRound = useMemo(() => {
    const map: Record<KnockoutWildcardRound, WildcardOptionGroup> = {
      ROUND_OF_32: {
        wildcard_round: "ROUND_OF_32",
        round_label: "Round of 32",
        options: [],
      },
      ROUND_OF_16: {
        wildcard_round: "ROUND_OF_16",
        round_label: "Round of 16",
        options: [],
      },
      QUARTER_FINAL: {
        wildcard_round: "QUARTER_FINAL",
        round_label: "Quarter Final",
        options: [],
      },
      SEMI_FINAL: {
        wildcard_round: "SEMI_FINAL",
        round_label: "Semi Final",
        options: [],
      },
      FINAL: {
        wildcard_round: "FINAL",
        round_label: "Final",
        options: [],
      },
    };

    optionGroups.forEach((group) => {
      map[group.wildcard_round] = group;
    });

    return map;
  }, [optionGroups]);

  const currentGroup = optionsByRound[currentRound];
  const currentLock = locksByKey[WILDCARD_LOCK_KEYS[currentRound]];
  const currentGateOpen = isLockGateOpen(currentLock);
  const currentOptions = currentGroup.options || [];
  const currentIndex = indexByRound[currentRound] || 0;
  const currentPrediction = currentOptions[currentIndex];
  const currentPredictionOpen = isWildcardOptionOpen(
    currentPrediction,
    currentLock
  );

  const selectedCount = ROUND_ORDER.filter(
    (round) => selectedTeamByRound[round]
  ).length;

  function previousWildcard() {
    if (!currentGateOpen) return;
    if (currentOptions.length === 0) return;

    setIndexByRound((previous) => ({
      ...previous,
      [currentRound]: getCircularIndex(
        previous[currentRound] || 0,
        currentOptions.length,
        "prev"
      ),
    }));
  }

  function nextWildcard() {
    if (!currentGateOpen) return;
    if (currentOptions.length === 0) return;

    setIndexByRound((previous) => ({
      ...previous,
      [currentRound]: getCircularIndex(
        previous[currentRound] || 0,
        currentOptions.length,
        "next"
      ),
    }));
  }

  function goToWildcardIndex(index: number) {
    if (!currentGateOpen) return;

    setIndexByRound((previous) => ({
      ...previous,
      [currentRound]: index,
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
  if (!currentPredictionOpen) return;
  if (!currentPrediction) return;

  setSelectedTeamByRound((previous) => ({
    ...previous,
    [currentRound]: currentPrediction.team_id,
  }));
}
  async function saveWildcards() {
    try {
      if (!token) {
        router.push("/login");
        return;
      }

      if (!currentGateOpen) {
        throw new Error(getLockedButtonLabel(currentLock));
      }

      setSaving(true);
      setError("");
      setSuccess("");

      const wildcards = ROUND_ORDER.filter((round) => {
        const lock = locksByKey[WILDCARD_LOCK_KEYS[round]];
        const group = optionsByRound[round];
        const selectedTeamId = selectedTeamByRound[round];
        const selectedOption = group.options.find(
          (option) => option.team_id === selectedTeamId
        );

        return selectedTeamId && isWildcardOptionOpen(selectedOption, lock);
      }).map((round) => ({
        wildcard_round: round,
        team_id: selectedTeamByRound[round],
      }));

      if (wildcards.length === 0) {
        throw new Error("Select at least one open knockout wildcard.");
      }

      const response = await fetch(`${API_BASE_URL}/knockout-wildcards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ wildcards }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.detail || "Failed to save knockout wildcards");
      }

      setSuccess("Knockout wildcards saved successfully.");
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
            Knockout Wildcards
          </h1>

          <p className="wc-muted mt-2">
            Pick one wildcard per knockout round. Correct gives x3. Wrong loses
            x3.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
          {ROUND_ORDER.map((round) => {
            const isActive = currentRound === round;
            const isSelected = Boolean(selectedTeamByRound[round]);

            return (
              <button
                key={round}
                onClick={() => setCurrentRound(round)}
                className={`rounded-full border px-4 py-2 text-xs font-black transition-all ${
                  isActive
                    ? "border-blue-400 bg-blue-500 text-white"
                    : isSelected
                    ? "border-yellow-400/40 bg-yellow-500/15 text-yellow-200"
                    : "border-white/10 bg-white/5 text-slate-400"
                }`}
              >
                {ROUND_SHORT_LABELS[round]}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="wc-card flex items-center justify-center gap-3 p-6 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-blue-300" />
            <p className="wc-muted">Loading knockout wildcards...</p>
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

        {!loading &&
          optionGroups.every((group) => group.options.length === 0) && (
            <div className="wc-card p-6 text-center">
              <Trophy className="mx-auto mb-3 h-10 w-10 text-slate-500" />

              <h2 className="text-2xl font-black">
                Save knockout predictions first
              </h2>

              <p className="wc-muted mt-2">
                Wildcards are chosen from your predicted winners in each knockout
                round.
              </p>

              <button
                onClick={() => router.push("/knockouts")}
                className="wc-button mt-5 px-8 py-3"
              >
                Go to Knockouts
              </button>
            </div>
          )}

        {!loading &&
          optionGroups.some((group) => group.options.length > 0) && (
            <div className="wc-card p-5">
              <div className="mb-5 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4">
                <h2 className="mb-1 flex items-center gap-2 text-lg font-black text-yellow-300">
                  <Star className="h-5 w-5" />
                  {currentGroup.round_label} Wildcard
                </h2>

                <p className="text-sm text-yellow-100/90">
                  Select one team from your {currentGroup.round_label} predicted
                  winners.
                </p>
              </div>

              {currentOptions.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-black/25 p-8 text-center">
                  <Trophy className="mx-auto mb-3 h-10 w-10 text-slate-500" />

                  <h2 className="text-2xl font-black">
                    No predictions for this round
                  </h2>

                  <p className="wc-muted mt-2">
                    Save predictions for {currentGroup.round_label} first, then
                    choose its wildcard.
                  </p>

                  <button
                    onClick={() => router.push("/knockouts")}
                    className="wc-button mt-5 px-8 py-3"
                  >
                    Go to Knockouts
                  </button>
                </div>
              ) : (
                <div
                  className="relative flex min-h-[500px] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-black/25 p-5"
                  onTouchStart={(event) =>
                    setTouchStartX(event.touches[0].clientX)
                  }
                  onTouchEnd={(event) =>
                    handleSwipeEnd(event.changedTouches[0].clientX)
                  }
                >
                  <button
                    onClick={previousWildcard}
                    disabled={!currentGateOpen}
                    className="absolute left-4 z-40 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-3xl hover:bg-white/20"
                  >
                    ‹
                  </button>

                  <button
                    onClick={nextWildcard}
                    disabled={!currentGateOpen}
                    className="absolute right-4 z-40 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-3xl hover:bg-white/20"
                  >
                    ›
                  </button>

                  {currentPrediction?.team && (
                    <div className="w-full text-center">
                      <div className="mb-4 flex justify-center">
                        <div className="rounded-full border border-yellow-400/40 bg-yellow-500/15 px-4 py-2 text-xs font-black text-yellow-200">
                          {currentGroup.round_label}
                        </div>
                      </div>

                      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
                        <p className="wc-muted text-sm">
                          One wildcard only for this round.
                        </p>

                        <MatchTimeBadge
                          matchDate={getMatchDateFromOption(currentPrediction)}
                          status={getMatchStatusFromOption(currentPrediction)}
                        />
                      </div>

                      <div
                        className="relative mx-auto mb-5 flex h-64 w-full items-center justify-center overflow-hidden"
                        style={{
                          perspective: "950px",
                          transformStyle: "preserve-3d",
                        }}
                      >
                        {currentOptions.map((prediction, index) => {
                          if (!prediction.team) return null;

                          const offset = getCircularOffset(
                            index,
                            currentIndex,
                            currentOptions.length
                          );

                          const isCurrent = offset === 0;

                          const isSelected =
                            selectedTeamByRound[currentRound] ===
                            prediction.team_id;

                          return (
                            <button
                              key={prediction.id || prediction.team_id}
                              type="button"
                              onClick={() => goToWildcardIndex(index)}
                              disabled={Math.abs(offset) > 2 || !currentGateOpen}
                              className={`absolute left-1/2 top-1/2 flex items-center justify-center rounded-full border shadow-2xl transition-all duration-500 ease-out ${
                                isCurrent
                                  ? "h-40 w-40 border-blue-400/60 bg-blue-500/15 shadow-blue-500/30"
                                  : "h-28 w-28 border-white/10 bg-white/5"
                              } ${
                                Math.abs(offset) > 2
                                  ? "pointer-events-none"
                                  : "cursor-pointer"
                              }`}
                              style={getCarouselCardStyle(offset)}
                            >
                              {prediction.team.flag_url ? (
                                <img
                                  src={prediction.team.flag_url}
                                  alt={prediction.team.name}
                                  className={`rounded-full object-cover ring-4 transition-all duration-500 ${
                                    isCurrent
                                      ? "h-32 w-32 ring-blue-300/30"
                                      : "h-24 w-24 ring-white/10"
                                  }`}
                                />
                              ) : (
                                <div
                                  className={`flex items-center justify-center rounded-full bg-white/10 transition-all duration-500 ${
                                    isCurrent
                                      ? "h-32 w-32 text-5xl"
                                      : "h-24 w-24 text-3xl"
                                  }`}
                                >
                                  🏆
                                </div>
                              )}

                              {isSelected && (
                                <div className="absolute -bottom-1 rounded-full bg-green-500 px-2 py-1 text-[10px] font-black text-white">
                                  ✓
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <h2 className="text-4xl font-black">
                        {currentPrediction.team.name}
                      </h2>

                      <p className="wc-muted mt-1 text-sm">
                        {currentGroup.round_label} · {currentIndex + 1} /{" "}
                        {currentOptions.length}
                      </p>

                      {selectedTeamByRound[currentRound] ===
                        currentPrediction.team_id && (
                        <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-green-500/15 px-4 py-2 text-sm font-bold text-green-200">
                          <CheckCircle2 className="h-4 w-4" />
                          Wildcard Confirmed
                        </div>
                      )}

                      {!currentPredictionOpen && (
                        <div className="mx-auto mt-4 max-w-sm rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold text-red-200">
                          {isWildcardOptionDeadlineOpen(currentPrediction)
                            ? "Wildcards are locked for this round."
                            : "Wildcard closed. This game has already kicked off."}
                        </div>
                      )}

                      <button
                        onClick={confirmCurrentWildcard}
                        disabled={!currentPredictionOpen}
                        className="wc-button-gold mt-5 px-8 py-3 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {selectedTeamByRound[currentRound] ===
                        currentPrediction.team_id
                          ? "Confirmed"
                          : "Confirm Wildcard"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    const currentIndex = ROUND_ORDER.indexOf(currentRound);
                    const previousRound = ROUND_ORDER[currentIndex - 1];

                    if (previousRound) {
                      setCurrentRound(previousRound);
                    }
                  }}
                  disabled={currentRound === "ROUND_OF_32"}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 font-bold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Back
                </button>

                {currentRound !== "FINAL" ? (
                  <button
                    onClick={() => {
                      const currentIndex = ROUND_ORDER.indexOf(currentRound);
                      const nextRound = ROUND_ORDER[currentIndex + 1];

                      if (nextRound) {
                        setCurrentRound(nextRound);
                      }
                    }}
                    className="wc-button px-4 py-4 text-lg"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    onClick={saveWildcards}
                    disabled={saving || selectedCount === 0 || !currentGateOpen}
                    className="wc-button px-4 py-4 text-lg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving
                      ? "Saving..."
                      : !currentGateOpen
                      ? getLockedButtonLabel(currentLock)
                      : selectedCount === 0
                      ? "Choose a prediction first"
                      : "Save Wildcards"}
                  </button>
                )}
              </div>

              <button
                onClick={saveWildcards}
                disabled={saving || selectedCount === 0 || !currentGateOpen}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 font-bold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving
                  ? "Saving..."
                  : !currentGateOpen
                  ? getLockedButtonLabel(currentLock)
                  : selectedCount === 0
                  ? "Choose a prediction first"
                  : `Save ${selectedCount} Wildcard(s)`}
              </button>
            </div>
          )}
      </section>

      <BottomNav />
    </main>
  );
}
