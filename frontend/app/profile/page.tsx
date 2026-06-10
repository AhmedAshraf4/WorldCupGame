import { BottomNav } from "@/components/bottomnav";
import Link from "next/link";

export default function ProfilePage() {
  return (
    <main className="wc-page min-h-screen p-4 pb-24 text-white md:p-6">
      <section className="mx-auto max-w-5xl">
        <p className="wc-gold mb-2 text-sm font-bold uppercase tracking-[0.2em]">
          Account
        </p>

        <h1 className="mb-4 text-3xl font-black">Profile</h1>

        <div className="wc-card p-5">
          <h2 className="text-2xl font-black">My Tournament Profile</h2>
          <p className="wc-muted mt-2">
            Soon this page will show avatar, champion pick, prediction history, and logout.
          </p>
        </div>

        <Link
          href="/rules"
          className="wc-card mt-4 block p-5 transition hover:scale-[1.01]"
        >
          <p className="wc-gold mb-2 text-xs font-black uppercase tracking-[0.2em]">
            Road to 26
          </p>
          <h2 className="text-2xl font-black">Scoring Rules</h2>
          <p className="wc-muted mt-2">
            Review match, wildcard, champion, and underdog scoring.
          </p>
        </Link>
      </section>

      <BottomNav />
    </main>
  );
}
