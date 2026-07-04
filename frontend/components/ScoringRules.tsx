import {
  AlertTriangle,
  Crown,
  Medal,
  Shield,
  Sparkles,
  Trophy,
} from "lucide-react";

const sections = [
  {
    title: "Group Match Predictions",
    icon: Trophy,
    accent: "text-blue-200",
    items: [
      "Correct win/draw/loss prediction: +1 point.",
      "Correct draw prediction: +1 point.",
      "Wrong draw prediction: 0 points.",
      "If you pick a meaningful underdog to win and they win: +2 points.",
      "If you pick a meaningful underdog to win and the match is a draw: -1 point.",
      "If you pick a meaningful underdog to win and they lose: -2 points.",
      "Picking the stronger team keeps normal scoring: +1 if correct, 0 if wrong.",
      "Draw picks do not use underdog multipliers.",
    ],
  },
  {
    title: "Group Standings",
    icon: Medal,
    accent: "text-green-200",
    items: [
      "Exact group position: +5 points.",
      "Predicted top 2 but wrong top-2 order: +2 points.",
      "Predicted top 2 but team finishes 3rd and qualifies as a best third-place team: +1 point.",
    ],
  },
  {
    title: "Group Wildcards",
    icon: Sparkles,
    accent: "text-purple-200",
    items: [
      "Choose one wildcard from each predicted group position.",
      "If the related group standing prediction earns points, that pick's total becomes base group score x3.",
      "If the wildcard is wrong: -15 points.",
    ],
  },
  {
    title: "Knockout Predictions",
    icon: Shield,
    accent: "text-cyan-200",
    items: [
      "Round of 32 correct winner: +5 points.",
      "Round of 16 correct winner: +10 points.",
      "Quarter Final correct winner: +15 points.",
      "Semi Final correct winner: +20 points.",
      "Final correct winner: +30 points.",
      "If you pick a meaningful underdog and they win: round points x2.",
      "If you pick a meaningful underdog and they lose: round points x-2.",
      "Picking the stronger team keeps normal scoring: round points if correct, 0 if wrong.",
    ],
  },
  {
    title: "Knockout Wildcards",
    icon: AlertTriangle,
    accent: "text-red-200",
    items: [
      "Choose one wildcard per knockout round from your predicted winners.",
      "Correct knockout wildcard makes that pick's total +3 x that round's points.",
      "Wrong knockout wildcard: -3 x that round's points.",
    ],
  },
  {
    title: "Champion Pick",
    icon: Crown,
    accent: "text-yellow-200",
    items: [
      "Correct World Cup champion pick: +50 points.",
      "Champion pick is submitted once and cannot be changed.",
      "Champion scoring does not use underdog multipliers.",
    ],
  },
];

export function ScoringRules({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-4">
      {!compact && (
        <div className="wc-card wc-card-glow wc-26-watermark p-5 text-center">
          <p className="wc-gold mb-2 text-xs font-black uppercase tracking-[0.28em]">
            Road to 26
          </p>
          <h1 className="text-3xl font-black md:text-5xl">Scoring Rules</h1>
          <p className="wc-muted mx-auto mt-2 max-w-2xl text-sm">
            Know the points before the whistle. Underdog picks can swing the
            table fast, but risky calls can also go negative.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;

          return (
            <section key={section.title} className="wc-card p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
                  <Icon className={`h-5 w-5 ${section.accent}`} />
                </div>
                <h2 className="text-xl font-black">{section.title}</h2>
              </div>

              <ul className="space-y-3">
                {section.items.map((item) => (
                  <li
                    key={item}
                    className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm font-semibold text-slate-200"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="wc-card p-5">
        <h2 className="text-xl font-black text-yellow-200">
          What Meaningful Underdog Means
        </h2>
        <p className="wc-muted mt-2 text-sm font-semibold">
          A meaningful underdog is the clearly weaker team in a matchup. The
          gap has to be big enough before double points or negative points can
          apply, so close matchups stay on normal scoring.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm font-semibold text-slate-200">
            FIFA rank is checked first. Lower rank number means stronger team,
            higher rank number means weaker team. The rank gap must be more
            than 3, so rank #60 is an underdog against rank #15.
          </p>
          <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm font-semibold text-slate-200">
            If either rank is missing, FIFA points are checked. Lower points
            are weaker, and the difference must be at least 10.
          </p>
          <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm font-semibold text-slate-200">
            If neither rank nor points show a big enough gap, there is no
            underdog for that match. In group games, only picking that underdog
            to win can trigger +2 or -2.
          </p>
        </div>
      </div>
    </div>
  );
}
