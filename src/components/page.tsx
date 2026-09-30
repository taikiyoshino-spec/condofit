import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, back }: { title: string; back?: string }) {
  return (
    <header className="flex items-center gap-2 px-4 pb-2 pt-4">
      {back && (
        <Link href={back} aria-label="戻る" className="-ml-2 rounded p-2 text-muted">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
      )}
      <h1 className="text-xl font-bold">{title}</h1>
    </header>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4">
      {title && <h2 className="mb-3 font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function MenuList({ items }: { items: { href: string; label: string }[] }) {
  return (
    <ul className="mx-4 mb-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="flex items-center justify-between px-4 py-3.5">
            {item.label}
            <span className="text-muted" aria-hidden>›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Section>
        <p className="text-sm text-muted">この画面は準備中です。</p>
      </Section>
    </>
  );
}
