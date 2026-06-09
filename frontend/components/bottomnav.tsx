"use client";

import { Home, Trophy, Users, BarChart3, GitBranch } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

const navItems = [
  {
    label: "Home",
    path: "/",
    icon: Home,
  },
  {
    label: "Groups",
    path: "/groups",
    icon: Trophy,
  },
  {
    label: "Knockouts",
    path: "/knockouts",
    icon: GitBranch,
  },
  {
    label: "Clubs",
    path: "/clubs",
    icon: Users,
  },
  {
    label: "Scores",
    path: "/scoreboard",
    icon: BarChart3,
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-slate-950/90 px-3 py-2 backdrop-blur-xl md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.path ||
            (item.path !== "/" && pathname.startsWith(item.path));

          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-xs font-bold transition ${
                isActive
                  ? "bg-blue-500 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="mb-1 h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}