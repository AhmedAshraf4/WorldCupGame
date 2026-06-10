"use client";

import { Clock, Lock, Unlock } from "lucide-react";

import { PredictionCountdown } from "@/components/PredictionCountdown";
import { getLockUiState, type LockStatus } from "@/lib/locks";

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
  const timerLabel = state.isOpen ? "Closes in" : "Opens in";

  return (
    <div
      className={
        compact
          ? "mb-4 rounded-3xl border border-white/10 bg-white/5 p-4"
          : "wc-card wc-card-glow mb-5 p-4 md:p-5"
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="wc-gold text-xs font-black uppercase tracking-[0.26em]">
            {title}
          </p>
          <p className="mt-2 text-sm font-bold text-slate-200">
            {state.timerTarget ? (
              <>
                {message}
                {state.isOpen ? " - prediction window active" : ""}
              </>
            ) : (
              state.message
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {state.timerTarget && (
            <div className="rounded-2xl border border-yellow-300/35 bg-yellow-400/12 px-4 py-2 text-right shadow-lg shadow-yellow-500/10">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-100/80">
                {timerLabel}
              </p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-yellow-100 md:text-2xl">
                <PredictionCountdown
                  target={state.timerTarget}
                  closedText={state.closedText}
                />
              </p>
            </div>
          )}

          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-2 text-xs font-black ${state.badgeClass}`}
          >
            <Icon className="h-4 w-4" />
            {state.label}
          </span>
        </div>
      </div>
    </div>
  );
}
