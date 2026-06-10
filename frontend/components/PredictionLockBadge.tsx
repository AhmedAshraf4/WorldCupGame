"use client";

import { Clock, Lock, Unlock } from "lucide-react";

import { getLockUiState, type LockStatus } from "@/lib/locks";
import { PredictionCountdown } from "@/components/PredictionCountdown";

const ICONS = {
  unlock: Unlock,
  clock: Clock,
  lock: Lock,
};

export function PredictionLockBadge({
  lock,
  title = "Prediction Status",
  compact = false,
}: {
  lock?: LockStatus | null;
  title?: string;
  compact?: boolean;
}) {
  const state = getLockUiState(lock);
  const Icon = ICONS[state.icon];

  const message = state.isOpen && state.timerTarget ? "Open now" : state.message;

  return (
    <div className={compact ? "" : "wc-card mb-5"}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
            {title}
          </p>
          <p className="mt-1 text-sm font-bold text-white">
            {state.timerTarget ? (
              <>
                {message}
                {state.isOpen ? " · closes in " : " "}
                <PredictionCountdown
                  target={state.timerTarget}
                  closedText={state.closedText}
                />
              </>
            ) : (
              state.message
            )}
          </p>
        </div>

        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${state.badgeClass}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {state.label}
        </span>
      </div>
    </div>
  );
}
