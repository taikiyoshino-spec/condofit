"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "ホーム", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/schedule", label: "予定", icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
  { href: "/records", label: "記録", icon: "M6 4h12v16H6zM9 9h6M9 13h6M9 17h3" },
  { href: "/exercises", label: "種目", icon: "M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12" },
  { href: "/mypage", label: "マイページ", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
];

export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((tab) => {
          const active = isActive(tab.href) || (tab.href === "/mypage" && pathname.startsWith("/admin"));
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
