"use client";

export type UserBadge = {
  key: string;
  name: string;
  description: string;
  image_url: string;
  points_required?: number;
};

export function BadgeGrid({
  badges,
  compact = false,
  selectedBadgeKey,
  onSelectBadge,
  selectingBadgeKey,
}: {
  badges: UserBadge[];
  compact?: boolean;
  selectedBadgeKey?: string | null;
  onSelectBadge?: (badge: UserBadge) => void;
  selectingBadgeKey?: string | null;
}) {
  if (badges.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center">
        <p className="text-sm font-bold text-slate-400">
          No badges unlocked yet.
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        compact
          ? "flex flex-wrap gap-2"
          : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {badges.map((badge) => (
        <button
          key={badge.key}
          type="button"
          onClick={() => onSelectBadge?.(badge)}
          disabled={!onSelectBadge || selectingBadgeKey === badge.key}
          className={
            compact
              ? "flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
              : `rounded-3xl border p-4 text-center transition ${
                  selectedBadgeKey === badge.key
                    ? "border-yellow-300/70 bg-yellow-400/15 shadow-lg shadow-yellow-500/15"
                    : "border-white/10 bg-white/5"
                } ${
                  onSelectBadge
                    ? "hover:border-yellow-300/40 hover:bg-yellow-400/10"
                    : ""
                } disabled:cursor-wait disabled:opacity-70`
          }
          title={badge.description}
        >
          <img
            src={badge.image_url}
            alt={badge.name}
            className={
              compact
                ? "h-9 w-9 shrink-0 rounded-full object-cover"
                : "mx-auto h-24 w-24 rounded-full object-cover shadow-xl shadow-yellow-500/10"
            }
          />

          <div className={compact ? "min-w-0" : "mt-3"}>
            <p
              className={
                compact
                  ? "truncate text-xs font-black text-white"
                  : "text-lg font-black text-white"
              }
            >
              {badge.name}
            </p>

            {!compact && (
              <p className="mt-1 text-xs font-semibold text-slate-400">
                {badge.description}
              </p>
            )}

            {!compact && selectedBadgeKey === badge.key && (
              <p className="mt-3 rounded-full border border-yellow-300/40 bg-yellow-400/15 px-3 py-1 text-xs font-black text-yellow-100">
                Shown on leaderboard
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
