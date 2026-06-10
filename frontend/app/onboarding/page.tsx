"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { PredictionLockBadge } from "@/components/PredictionLockBadge";
import { ScoringRules } from "@/components/ScoringRules";
import {
  getLockedButtonLabel,
  mapLocksByKey,
  type LockStatus,
} from "@/lib/locks";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

const DASHBOARD_ROUTE = "/";

type Avatar = {
  id: string;
  name: string;
  image_url: string;
  is_active: boolean;
};

type Team = {
  id: string;
  name: string;
  country_code: string;
  flag_url: string | null;
  fifa_rank: number | null;
  fifa_points: number | null;
};

type ApiResponse<T> = {
  count: number;
  data: T[];
};

type Direction = "left" | "right";
type OnboardingStep = "avatar" | "champion" | "rules";

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState<OnboardingStep>("avatar");

  const [displayName, setDisplayName] = useState("");
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [championLock, setChampionLock] = useState<LockStatus | null>(null);

  const [avatarIndex, setAvatarIndex] = useState(0);
  const [championIndex, setChampionIndex] = useState(0);

  const [selectedAvatarId, setSelectedAvatarId] = useState("");
  const [selectedChampionId, setSelectedChampionId] = useState("");

  const [avatarDirection, setAvatarDirection] = useState<Direction>("right");
  const [championDirection, setChampionDirection] = useState<Direction>("right");

  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [introComplete, setIntroComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const currentAvatar = avatars[avatarIndex];
  const currentChampion = teams[championIndex];

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

  const previousAvatarItem =
    avatars[getCircularIndex(avatarIndex, avatars.length, "prev")];

  const nextAvatarItem =
    avatars[getCircularIndex(avatarIndex, avatars.length, "next")];

  const previousChampionItem =
    teams[getCircularIndex(championIndex, teams.length, "prev")];

  const nextChampionItem =
    teams[getCircularIndex(championIndex, teams.length, "next")];

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.replace("/login");
          return;
        }

        const statusResponse = await fetch(`${API_BASE_URL}/onboarding/status`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        const statusJson = await statusResponse.json().catch(() => null);

        if (statusResponse.ok && statusJson?.is_complete) {
          router.replace(DASHBOARD_ROUTE);
          return;
        }

        const [avatarsResponse, teamsResponse, locksResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/avatars`, {
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/teams`, {
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/locks/status`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
        ]);

        if (!avatarsResponse.ok || !teamsResponse.ok) {
          throw new Error("Failed to load onboarding data");
        }

        const avatarsResult: ApiResponse<Avatar> = await avatarsResponse.json();
        const teamsResult: ApiResponse<Team> = await teamsResponse.json();
        const locksJson = await locksResponse.json().catch(() => null);

        setAvatars(avatarsResult.data || []);
        setTeams(teamsResult.data || []);
        setChampionLock(mapLocksByKey(locksJson?.data || []).CHAMPION_PICK || null);
      } catch {
        setError("Could not load onboarding data. Make sure FastAPI is running.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  function previousAvatar() {
    if (avatars.length === 0) return;

    setAvatarDirection("left");
    setAvatarIndex((current) =>
      current === 0 ? avatars.length - 1 : current - 1
    );
    setSelectedAvatarId("");
  }

  function nextAvatar() {
    if (avatars.length === 0) return;

    setAvatarDirection("right");
    setAvatarIndex((current) =>
      current === avatars.length - 1 ? 0 : current + 1
    );
    setSelectedAvatarId("");
  }

  function previousChampion() {
    if (championLock && !championLock.is_open) return;
    if (teams.length === 0) return;

    setChampionDirection("left");
    setChampionIndex((current) =>
      current === 0 ? teams.length - 1 : current - 1
    );
    setSelectedChampionId("");
  }

  function nextChampion() {
    if (championLock && !championLock.is_open) return;
    if (teams.length === 0) return;

    setChampionDirection("right");
    setChampionIndex((current) =>
      current === teams.length - 1 ? 0 : current + 1
    );
    setSelectedChampionId("");
  }

  function handleSwipeEnd(type: "avatar" | "champion", endX: number) {
    if (touchStartX === null) return;

    const diff = touchStartX - endX;

    if (Math.abs(diff) < 40) {
      setTouchStartX(null);
      return;
    }

    if (type === "avatar") {
      diff > 0 ? nextAvatar() : previousAvatar();
    }

    if (type === "champion") {
      diff > 0 ? nextChampion() : previousChampion();
    }

    setTouchStartX(null);
  }

  async function handleContinue() {
    setError("");
    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      if (championLock && !championLock.is_open) {
        throw new Error(getLockedButtonLabel(championLock));
      }

      const response = await fetch(`${API_BASE_URL}/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          display_name: displayName,
          avatar_id: selectedAvatarId,
          champion_team_id: selectedChampionId,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.detail || "Failed to complete onboarding");
      }

      router.replace(DASHBOARD_ROUTE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const canGoToChampion = displayName.trim() && selectedAvatarId;
  const canFinish =
    displayName.trim() &&
    selectedAvatarId &&
    selectedChampionId &&
    !saving &&
    (!championLock || championLock.is_open);

  const stepTitle =
    step === "avatar"
      ? "Choose Your Avatar"
      : step === "champion"
      ? "Choose Your Champion"
      : "Scoring Rules";

  const stepSubtitle =
    step === "avatar"
      ? "Swipe through avatars and confirm your identity."
      : step === "champion"
      ? "If your chosen team wins the World Cup, you win 50 points. Choose wisely."
      : "Review how points are earned before you enter the tournament.";

  return (
    <main className="wc-page min-h-screen p-4 text-white md:p-6">
      <section className="mx-auto max-w-5xl">
        {!loading && !introComplete && (
          <div className="fixed inset-0 z-50 bg-slate-950 text-white">
            <video
              className="h-full w-full object-cover"
              autoPlay
              muted
              playsInline
              preload="auto"
              onEnded={() => setIntroComplete(true)}
              onError={() => {
                setIntroComplete(true);
              }}
              aria-label="World Cup Challenge intro"
            >
              <source src="/assets/intro.mp4" type="video/mp4" />
            </video>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent p-5 pt-24">
              <button
                type="button"
                onClick={() => setIntroComplete(true)}
                className="pointer-events-auto wc-button w-full px-4 py-4 text-lg md:mx-auto md:block md:max-w-sm"
              >
                Skip Intro
              </button>
            </div>
          </div>
        )}

        <div className="mb-6 text-center">
          <img
            src="/assets/wc26-logo.jpg"
            alt="Road to 26"
            className="mx-auto mb-4 h-20 w-20 rounded-[1.5rem] border border-white/15 object-cover shadow-xl shadow-yellow-500/15"
          />
          <p className="wc-gold mb-2 text-sm font-bold uppercase tracking-[0.25em]">
            Tournament Setup
          </p>

          <h1 className="text-3xl font-black md:text-5xl">
            {stepTitle}
          </h1>

          <p className="wc-muted mt-2">{stepSubtitle}</p>
        </div>

        <div className="mb-6 flex items-center justify-center gap-3">
          <div
            className={`h-2 w-16 rounded-full ${
              step === "avatar" ? "bg-blue-500" : "bg-blue-500/40"
            }`}
          />
          <div
            className={`h-2 w-16 rounded-full ${
              step === "champion" ? "bg-yellow-400" : "bg-white/20"
            }`}
          />
          <div
            className={`h-2 w-16 rounded-full ${
              step === "rules" ? "bg-green-400" : "bg-white/20"
            }`}
          />
        </div>

        {loading && (
          <div className="wc-card p-6 text-center">
            <p className="wc-muted">Loading tournament setup...</p>
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">
            {error}
          </p>
        )}

        {!loading && step === "avatar" && (
          <div className="wc-card p-5">
            <div className="mb-5">
              <label className="mb-2 block text-sm font-bold text-slate-300">
                Display Name
              </label>

              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Enter your name"
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-white outline-none focus:border-blue-400"
              />
            </div>

            <div
              className="relative flex min-h-[460px] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-black/25 p-5"
              onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
              onTouchEnd={(event) =>
                handleSwipeEnd("avatar", event.changedTouches[0].clientX)
              }
            >
              <button
                onClick={previousAvatar}
                className="absolute left-4 z-20 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-3xl hover:bg-white/20"
              >
                ‹
              </button>

              <button
                onClick={nextAvatar}
                className="absolute right-4 z-20 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-3xl hover:bg-white/20"
              >
                ›
              </button>

              {avatars.length > 0 && currentAvatar && (
                <div className="w-full text-center">
                  <div className="relative mx-auto mb-5 flex h-72 w-full items-center justify-center overflow-hidden">
                    {previousAvatarItem &&
                      previousAvatarItem.id !== currentAvatar.id && (
                        <div className="absolute left-0 scale-75 opacity-25 blur-[1px] md:left-16">
                          <img
                            src={previousAvatarItem.image_url}
                            alt={previousAvatarItem.name}
                            className="h-44 w-44 rounded-full border-2 border-white/10 object-cover"
                          />
                          <p className="mt-2 max-w-36 truncate text-center text-xs font-bold text-white/60">
                            {previousAvatarItem.name}
                          </p>
                        </div>
                      )}

                    <img
                      key={currentAvatar.id}
                      src={currentAvatar.image_url}
                      alt={currentAvatar.name}
                      className={`relative z-10 h-64 w-64 rounded-full border-4 object-cover shadow-2xl transition ${
                        avatarDirection === "right"
                          ? "wc-slide-from-right"
                          : "wc-slide-from-left"
                      } ${
                        selectedAvatarId === currentAvatar.id
                          ? "border-yellow-400"
                          : "border-white/15"
                      }`}
                    />

                    {nextAvatarItem &&
                      nextAvatarItem.id !== currentAvatar.id && (
                        <div className="absolute right-0 scale-75 opacity-25 blur-[1px] md:right-16">
                          <img
                            src={nextAvatarItem.image_url}
                            alt={nextAvatarItem.name}
                            className="h-44 w-44 rounded-full border-2 border-white/10 object-cover"
                          />
                          <p className="mt-2 max-w-36 truncate text-center text-xs font-bold text-white/60">
                            {nextAvatarItem.name}
                          </p>
                        </div>
                      )}
                  </div>

                  <h2 className="text-4xl font-black">{currentAvatar.name}</h2>

                  <p className="wc-muted mt-1 text-sm">
                    {avatarIndex + 1} / {avatars.length}
                  </p>

                  <button
                    onClick={() => setSelectedAvatarId(currentAvatar.id)}
                    className="wc-button mt-5 px-8 py-3"
                  >
                    {selectedAvatarId === currentAvatar.id
                      ? "Avatar Confirmed"
                      : "Confirm Avatar"}
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setStep("champion")}
              disabled={!canGoToChampion}
              className="wc-button mt-6 w-full px-4 py-4 text-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue to Champion Pick
            </button>
          </div>
        )}

        {!loading && step === "champion" && (
          <div className="wc-card p-5">
            <PredictionLockBadge lock={championLock} title="Champion Pick" />

            <div className="mb-5 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4">
              <h2 className="mb-1 text-lg font-black text-yellow-300">
                Champion Pick Reward
              </h2>
              <p className="text-sm text-yellow-100/90">
                If your chosen champion wins the World Cup, you earn{" "}
                <strong>+50 points</strong>. This pick can only be submitted
                once, so choose wisely.
              </p>
            </div>

            <div
              className="relative flex min-h-[500px] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-black/25 p-5"
              onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
              onTouchEnd={(event) =>
                handleSwipeEnd("champion", event.changedTouches[0].clientX)
              }
            >
              <button
                onClick={previousChampion}
                disabled={Boolean(championLock && !championLock.is_open)}
                className="absolute left-4 z-20 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-3xl hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ‹
              </button>

              <button
                onClick={nextChampion}
                disabled={Boolean(championLock && !championLock.is_open)}
                className="absolute right-4 z-20 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-3xl hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ›
              </button>

              {teams.length > 0 && currentChampion && (
                <div className="w-full text-center">
                  <div className="relative mx-auto mb-5 flex h-72 w-full items-center justify-center overflow-hidden">
                    {previousChampionItem &&
                      previousChampionItem.id !== currentChampion.id && (
                        <div className="absolute left-0 scale-75 opacity-25 blur-[1px] md:left-16">
                          {previousChampionItem.flag_url ? (
                            <img
                              src={previousChampionItem.flag_url}
                              alt={previousChampionItem.name}
                              className="h-44 w-44 rounded-full border-2 border-white/10 object-cover"
                            />
                          ) : (
                            <div className="flex h-44 w-44 items-center justify-center rounded-full border-2 border-white/10 bg-white/5 text-5xl">
                              🏆
                            </div>
                          )}

                          <p className="mt-2 max-w-36 truncate text-center text-xs font-bold text-white/60">
                            {previousChampionItem.name}
                          </p>
                        </div>
                      )}

                    {currentChampion.flag_url ? (
                      <img
                        key={currentChampion.id}
                        src={currentChampion.flag_url}
                        alt={currentChampion.name}
                        className={`relative z-10 h-64 w-64 rounded-full border-4 object-cover shadow-2xl transition ${
                          championDirection === "right"
                            ? "wc-slide-from-right"
                            : "wc-slide-from-left"
                        } ${
                          selectedChampionId === currentChampion.id
                            ? "border-yellow-400"
                            : "border-white/15"
                        }`}
                      />
                    ) : (
                      <div className="relative z-10 flex h-64 w-64 items-center justify-center rounded-full border-4 border-white/15 bg-white/5 text-7xl shadow-2xl">
                        🏆
                      </div>
                    )}

                    {nextChampionItem &&
                      nextChampionItem.id !== currentChampion.id && (
                        <div className="absolute right-0 scale-75 opacity-25 blur-[1px] md:right-16">
                          {nextChampionItem.flag_url ? (
                            <img
                              src={nextChampionItem.flag_url}
                              alt={nextChampionItem.name}
                              className="h-44 w-44 rounded-full border-2 border-white/10 object-cover"
                            />
                          ) : (
                            <div className="flex h-44 w-44 items-center justify-center rounded-full border-2 border-white/10 bg-white/5 text-5xl">
                              🏆
                            </div>
                          )}

                          <p className="mt-2 max-w-36 truncate text-center text-xs font-bold text-white/60">
                            {nextChampionItem.name}
                          </p>
                        </div>
                      )}
                  </div>

                  <h2 className="text-4xl font-black">{currentChampion.name}</h2>

                  <p className="wc-muted mt-1 text-sm">
                    Rank #{currentChampion.fifa_rank ?? "-"} ·{" "}
                    {currentChampion.fifa_points ?? "-"} pts
                  </p>

                  <p className="wc-muted mt-1 text-sm">
                    {championIndex + 1} / {teams.length}
                  </p>

                  <button
                    onClick={() => setSelectedChampionId(currentChampion.id)}
                    disabled={Boolean(championLock && !championLock.is_open)}
                    className="wc-button-gold mt-5 px-8 py-3 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {selectedChampionId === currentChampion.id
                      ? "Champion Confirmed"
                      : "Confirm Champion"}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => setStep("avatar")}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 font-bold text-white hover:bg-white/10"
              >
                Back
              </button>

              <button
                onClick={() => setStep("rules")}
                disabled={!canFinish}
                className="wc-button px-4 py-4 text-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {championLock && !championLock.is_open
                  ? getLockedButtonLabel(championLock)
                  : !selectedChampionId
                  ? "Choose a prediction first"
                  : "Review Rules"}
              </button>
            </div>
          </div>
        )}

        {!loading && step === "rules" && (
          <div className="space-y-5">
            <ScoringRules compact />

            <div className="wc-card p-5">
              <p className="wc-muted text-sm font-semibold">
                By entering the tournament, your avatar and champion pick will
                be saved. Your champion pick cannot be changed later.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setStep("champion")}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 font-bold text-white hover:bg-white/10"
                >
                  Back
                </button>

                <button
                  onClick={handleContinue}
                  disabled={!canFinish}
                  className="wc-button px-4 py-4 text-lg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Enter Tournament"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
