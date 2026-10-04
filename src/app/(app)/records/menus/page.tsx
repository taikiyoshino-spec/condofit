import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { listMyMenus } from "@/lib/menus/queries";
import { PageHeader, Section } from "@/components/page";

function setCount(sets: unknown[]) {
  return Math.max(1, sets.length);
}

/** 自分のメニュー一覧 */
export default async function MenusPage() {
  const member = await requireMember();
  const menus = await listMyMenus(member.id);
  return (
    <>
      <PageHeader
        title="メニュー"
        back="/records/start"
        action={
          <Link href="/records/menus/new" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg">
            ＋ 新しいメニュー
          </Link>
        }
      />
      {menus.length === 0 ? (
        <Section>
          <p className="text-sm text-muted">まだメニューがありません。よくやる種目とセットをメニューにしておくと、記録が「できた」ボタンだけで進められます。</p>
        </Section>
      ) : (
        <ul className="mx-4 mb-4 space-y-2">
          {menus.map((m) => (
            <li key={m.id}>
              <Link href={`/records/menus/${m.id}`} className="block rounded-xl border border-border bg-surface p-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{m.name}</span>
                  <span className="text-sm text-muted">{m.items.length}種目 ›</span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {m.items.map((it) => `${it.name}×${setCount(it.sets)}`).join("、")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="px-4 text-xs text-muted">メニューは自分専用です。ほかのメンバーには見えません。</p>
    </>
  );
}
