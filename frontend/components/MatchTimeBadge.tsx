"use client";

import { useEffect, useState } from "react";

import { PredictionCountdown } from "@/components/PredictionCountdown";

function getTimestamp(value?: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER;

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

export function getMatchTimestamp(value?: string | null) {
  return getTimestamp(value);
}

export function MatchTimeBadge({
  matchDate,
  status,
}: {
  matchDate?: string | null;
  status?: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const normalizedStatus = (status || "").toUpperCase();
  const kickoffTime = getTimestamp(matchDate);
  const hasValidKickoff = kickoffTime !== Number.MAX_SAFE_INTEGER;
  const hasStarted = hasValidKickoff && now >= kickoffTime;

  useEffect(() => {
    if (!hasValidKickoff || normalizedStatus === "FINISHED") return;

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [hasValidKickoff, normalizedStatus]);

  if (normalizedStatus === "FINISHED") {
    return (
      <span className="rounded-full border border-green-400/30 bg-green-500/15 px-3 py-1 text-xs font-black text-green-200">
        Finished
      </span>
    );
  }

  if (!hasValidKickoff) {
    return (
      <span className="rounded-full border border-slate-400/30 bg-white/10 px-3 py-1 text-xs font-black text-slate-200">
        Time TBD
      </span>
    );
  }

  if (hasStarted) {
    return (
      <span className="rounded-full border border-red-400/30 bg-red-500/15 px-3 py-1 text-xs font-black text-red-200">
        Started
      </span>
    );
  }

  return (
    <span className="rounded-full border border-blue-300/30 bg-blue-500/15 px-3 py-1 text-xs font-black text-blue-100">
      <PredictionCountdown target={matchDate} prefix="Starts in" />
    </span>
  );
}
