"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// CondoCook の下部タブ（1a はレシピ・登録・マイ。1b 以降でランキング・買い物・食材を足す）
const TABS = [
  { href: "/cook", label: "レシピ", icon: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6" },
  { href: "/cook/new", label: "登録", icon: "M12 5v14M5 12h14" },
  { href: "/cook/me", label: "マイ", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
];

export function CookNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/cook" ? pathname === "/cook" || pathname.startsWith("/cook/r/") : pathname.startsWith(href);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-lg grid-cols-3">
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
