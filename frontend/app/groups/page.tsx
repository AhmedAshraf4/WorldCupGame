"use client";

import { BottomNav } from "@/components/bottomnav";
import { CalendarDays, ListOrdered, Star } from "lucide-react";
import { useRouter } from "next/navigation";

export default function GroupsPage() {
  const router = useRouter();

  return (
    <main className="wc-page min-h-screen p-4 pb-24 text-white md:p-6">
      <section className="mx-auto max-w-5xl">
        <div className="mb-6 text-center">
          <p className="wc-gold mb-2 text-sm font-bold uppercase tracking-[0.2em]">
            Group Stage
          </p>

          <h1 className="text-3xl font-black md:text-5xl">
            Group Predictions
          </h1>

          <p className="wc-muted mt-2">
            Choose what you want to predict.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <button
            onClick={() => router.push("/groups/standings")}
            className="wc-card p-6 text-left transition hover:scale-[1.02]"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/20 text-green-300">
              <ListOrdered className="h-7 w-7" />
            </div>

            <h2 className="text-2xl font-black">Groups</h2>

            <p className="wc-muted mt-2 text-sm">
              Arrange each group from 1st to 4th place.
            </p>
          </button>

          <button
            onClick={() => router.push("/groups/matches")}
            className="wc-card p-6 text-left transition hover:scale-[1.02]"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-200">
              <CalendarDays className="h-7 w-7" />
            </div>

            <h2 className="text-2xl font-black">Matches</h2>

            <p className="wc-muted mt-2 text-sm">
              Predict win, draw, or loss for group stage matches.
            </p>
          </button>

          <button
            onClick={() => router.push("/groups/wildcards")}
            className="wc-card p-6 text-left transition hover:scale-[1.02]"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-500/20 text-yellow-300">
              <Star className="h-7 w-7" />
            </div>

            <h2 className="text-2xl font-black">Wildcards</h2>

            <p className="wc-muted mt-2 text-sm">
              Choose your 1st, 2nd, 3rd, and 4th place wildcards.
            </p>
          </button>
        </div>
      </section>

      <BottomNav />
    </main>
  );
}