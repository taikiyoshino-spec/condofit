"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// CondoCook の下部タブ。先頭は買い物（トップ）。登録・ランキングはレシピ画面の上から開く（レシピのタブを選んだ状態にする）
const TABS = [
  { href: "/cook/shopping", label: "買い物", icon: "M3 4h2l2.4 11h10.2L20 7H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" },
  { href: "/cook/recipes", label: "レシピ", icon: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6" },
  { href: "/cook/suggest", label: "提案", icon: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" },
  { href: "/cook/pantry", label: "食材", icon: "M6 3h12v18H6zM6 10h12M9 6v2M9 13v3" },
  { href: "/cook/me", label: "マイ", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
];

export function CookNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/cook/recipes"
      ? ["/cook/recipes", "/cook/r/", "/cook/new", "/cook/ranking"].some((p) => pathname.startsWith(p))
      : pathname.startsWith(href);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-accent" : "text-muted"}`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={tab.icon} />
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
