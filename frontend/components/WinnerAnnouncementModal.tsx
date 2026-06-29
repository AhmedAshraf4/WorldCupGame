"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { supabase } from "@/lib/supabase/client";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

type PodiumPlayer = {
  id: string;
  display_name: string | null;
  total_points: number | null;
  rank: number;
  avatar?: {
    image_url?: string | null;
    name?: string | null;
  } | null;
};

type AnnouncementResponse = {
  is_active: boolean;
  message?: string;
  top_three: PodiumPlayer[];
  winner_user_ids: string[];
};

const PODIUM_ORDER = [2, 1, 3];
const CONFETTI_COLORS = [
  "#ffe2a1",
  "#ef233c",
  "#22d3ee",
  "#00c853",
  "#ffffff",
  "#7c3aed",
];

export function WinnerAnnouncementModal() {
  const [announcement, setAnnouncement] =
    useState<AnnouncementResponse | null>(null);
  const [isClosed, setIsClosed] = useState(false);

  useEffect(() => {
    async function loadAnnouncement() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      const response = await fetch(`${API_BASE_URL}/badges/announcement`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const json: AnnouncementResponse | null = await response
        .json()
        .catch(() => null);

      if (!response.ok || !json?.is_active) return;

      const storageKey = `winner-announcement:${json.winner_user_ids.join(",")}`;

      if (sessionStorage.getItem(storageKey) === "closed") {
        setIsClosed(true);
        return;
      }

      setAnnouncement(json);
    }

    loadAnnouncement();
  }, []);

  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 42 }, (_, index) => ({
        id: index,
        left: `${(index * 17) % 100}%`,
        delay: `${(index % 12) * 0.16}s`,
        duration: `${2.4 + (index % 5) * 0.26}s`,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        rotate: `${(index * 29) % 180}deg`,
      })),
    []
  );

  if (!announcement || isClosed) return null;

  const storageKey = `winner-announcement:${announcement.winner_user_ids.join(",")}`;
  const playersByRank = new Map(
    announcement.top_three.map((player) => [player.rank, player])
  );

  function closeModal() {
    sessionStorage.setItem(storageKey, "closed");
    setIsClosed(true);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {confettiPieces.map((piece) => (
          <span
            key={piece.id}
            className="wc-confetti-piece"
            style={{
              left: piece.left,
              animationDelay: piece.delay,
              animationDuration: piece.duration,
              backgroundColor: piece.color,
              transform: `rotate(${piece.rotate})`,
            }}
          />
        ))}
      </div>

      <section className="wc-card wc-card-glow relative w-full max-w-3xl p-5 text-center text-white md:p-7">
        <button
          onClick={closeModal}
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 hover:bg-white/20"
          aria-label="Close winner announcement"
        >
          <X className="h-5 w-5" />
        </button>

        <p className="wc-gold text-xs font-black uppercase tracking-[0.25em]">
          Final Podium
        </p>
        <h2 className="mt-2 text-3xl font-black md:text-5xl">
          World Cup Game Winners
        </h2>

        <div className="mt-8 grid grid-cols-3 items-end gap-2 md:gap-4">
          {PODIUM_ORDER.map((rank) => {
            const player = playersByRank.get(rank);
            const heightClass =
              rank === 1 ? "h-36 md:h-44" : rank === 2 ? "h-28 md:h-36" : "h-24 md:h-32";
            const accentClass =
              rank === 1
                ? "border-yellow-300/60 bg-yellow-400/20"
                : rank === 2
                ? "border-slate-200/40 bg-slate-200/12"
                : "border-orange-300/50 bg-orange-400/14";

            return (
              <div key={rank} className="flex flex-col items-center">
                <div
                  className={`mb-3 flex h-16 w-16 items-center justify-center rounded-full border ${accentClass} md:h-20 md:w-20`}
                >
                  {player?.avatar?.image_url ? (
                    <img
                      src={player.avatar.image_url}
                      alt={player.display_name || "Player avatar"}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-black">#{rank}</span>
                  )}
                </div>

                <p className="line-clamp-2 min-h-10 text-sm font-black md:text-base">
                  {player?.display_name || `Rank ${rank}`}
                </p>
                <p className="mb-2 text-xs font-bold text-yellow-200">
                  {player?.total_points ?? 0} pts
                </p>

                <div
                  className={`flex w-full items-center justify-center rounded-t-3xl border ${accentClass} ${heightClass}`}
                >
                  <span className="text-4xl font-black">#{rank}</span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-7 max-w-2xl text-base font-semibold leading-relaxed text-slate-100 md:text-lg">
          {announcement.message}
        </p>
      </section>
    </div>
  );
}
