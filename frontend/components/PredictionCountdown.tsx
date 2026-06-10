"use client";

import { useEffect, useMemo, useState } from "react";

function formatDuration(target: string | null | undefined, closedText: string) {
  if (!target) return closedText;

  const targetTime = new Date(target).getTime();

  if (Number.isNaN(targetTime)) return closedText;

  const diff = Math.max(0, targetTime - Date.now());

  if (diff <= 0) return closedText;

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h`;
  }

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(
      2,
      "0"
    )}m`;
  }

  return `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(
    2,
    "0"
  )}s`;
}

export function usePredictionCountdown(
  target: string | null | undefined,
  closedText = "Closed"
) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [target]);

  return useMemo(() => formatDuration(target, closedText), [
    target,
    closedText,
    now,
  ]);
}

export function PredictionCountdown({
  target,
  prefix,
  closedText = "Closed",
}: {
  target?: string | null;
  prefix?: string;
  closedText?: string;
}) {
  const countdown = usePredictionCountdown(target, closedText);

  if (!prefix) return <>{countdown}</>;

  return (
    <>
      {prefix} {countdown}
    </>
  );
}
