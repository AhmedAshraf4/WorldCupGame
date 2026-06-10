import { BottomNav } from "@/components/bottomnav";
import { ScoringRules } from "@/components/ScoringRules";

export default function RulesPage() {
  return (
    <main className="wc-page min-h-screen p-4 pb-28 text-white md:p-6">
      <section className="mx-auto max-w-5xl">
        <ScoringRules />
      </section>

      <BottomNav />
    </main>
  );
}
