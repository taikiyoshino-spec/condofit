import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { listMyMenus } from "@/lib/menus/queries";
import { PageHeader, Section } from "@/components/page";

/** 記録の始め方を選ぶ: メニューから / 自由に */
export default async function StartRecordPage() {
  const member = await requireMember();
  const menus = await listMyMenus(member.id);
  return (
    <>
      <PageHeader title="記録を始める" back="/records" />

      <Section title="メニューから始める">
        {menus.length === 0 ? (
          <p className="text-sm text-muted">メニューを作っておくと、セットごとに「できた」を押すだけで記録できます。</p>
        ) : (
          <ul className="divide-y divide-border">
            {menus.map((m) => (
              <li key={m.id}>
                <Link href={`/records/new?menu=${m.id}`} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{m.name}</span>
                    <span className="block truncate text-xs text-muted">{m.items.map((it) => it.name).join("、")}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg">開始</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/records/menus" className="mt-3 block text-sm text-accent">
          {menus.length === 0 ? "＋ メニューを作る" : "メニューを作る・編集する ›"}
        </Link>
      </Section>

      <div className="mx-4">
        <Link href="/records/new" className="block w-full rounded-xl border border-border bg-surface py-3 text-center font-medium">
          メニューなしで自由に記録する
        </Link>
      </div>
    </>
  );
}
