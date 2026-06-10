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
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="wc-nav grid w-full grid-cols-5 items-center gap-1 rounded-none border-x-0 border-b-0 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.path ||
            (item.path !== "/" && pathname.startsWith(item.path));
          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`wc-nav-item flex min-h-14 flex-col items-center justify-center rounded-2xl px-1.5 py-2 text-[10px] font-black uppercase tracking-wide ${
                isActive
                  ? "wc-nav-item-active"
                  : "hover:bg-white/5 hover:text-white"
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
