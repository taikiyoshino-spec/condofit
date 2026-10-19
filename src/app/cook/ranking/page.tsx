import Link from "next/link";
import { requireCookUser } from "@/lib/auth/session";
import { getCookRanking, listRecipes, type RankingRow } from "@/lib/cook/queries";
import { assignRanks, byDesc } from "@/lib/ranking";
import { addMonths, formatMonth, isValidMonthString, monthOf, todayJst } from "@/lib/date";
import { PageHeader, Section } from "@/components/page";
import { RankBadge } from "@/components/rank-badge";
import { Owner } from "../owner";

const TOP = 10;

/** 月ごとのランキング（グループ公開のレシピだけ。D21・D22） */
export default async function CookRankingPage({ searchParams }: PageProps<"/cook/ranking">) {
  const { m } = await searchParams;
  const thisMonth = monthOf(todayJst());
  // 未来の月は表示しない
  const month = typeof m === "string" && isValidMonthString(m) && m <= thisMonth ? m : thisMonth;
  const [member, ranking, recipes] = await Promise.all([requireCookUser(), getCookRanking(`${month}-01`), listRecipes()]);
  const titles = new Map(recipes.map((r) => [r.id, r.title]));
  const top = (rows: RankingRow[]) => assignRanks(rows, byDesc((r) => r.n)).slice(0, TOP);

  return (
    <>
      <PageHeader title="ランキング" />
      <div className="mx-4 mb-3 flex items-center justify-between">
        <Link href={`/cook/ranking?m=${addMonths(month, -1)}`} className="rounded px-3 py-1 text-muted" aria-label="前の月">
          ‹
        </Link>
        <h2 className="font-semibold">{formatMonth(month)}</h2>
        {month < thisMonth ? (
          <Link href={`/cook/ranking?m=${addMonths(month, 1)}`} className="rounded px-3 py-1 text-muted" aria-label="次の月">
            ›
          </Link>
        ) : (
          <span className="px-3 py-1 text-transparent" aria-hidden>
            ›
          </span>
        )}
      </div>

      <Board title="作られたレシピ" note="その月に作った人の数（作成者本人を除く）" unit="人" rows={top(ranking.recipe)}>
        {(r) => (
          <Link href={`/cook/r/${r.id}`} className="min-w-0 flex-1 truncate underline-offset-2 hover:underline">
            {titles.get(r.id) ?? "レシピ"}
          </Link>
        )}
      </Board>
      <Board title="よく料理した人" note="その月に「作った！」を記録した回数（自分のレシピも数えます）" unit="回" rows={top(ranking.cook)} myId={member.id}>
        {(r) => <Owner userId={r.id} size={28} className="flex-1" />}
      </Board>
      <Board title="レシピを登録した人" note="その月にグループに公開したレシピの数" unit="件" rows={top(ranking.post)} myId={member.id}>
        {(r) => <Owner userId={r.id} size={28} className="flex-1" />}
      </Board>
      <p className="mx-4 mb-4 text-xs text-muted">
        グループに公開したレシピだけを数えます（家族だけ・自分だけのレシピは数えません）。同じ数の人は同じ順位です。
      </p>
    </>
  );
}

function Board({
  title,
  note,
  unit,
  rows,
  myId,
  children,
}: {
  title: string;
  note: string;
  unit: string;
  rows: (RankingRow & { rank: number })[];
  myId?: string;
  children: (r: RankingRow) => React.ReactNode;
}) {
  return (
    <Section title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">この月はまだありません</p>
      ) : (
        <ol className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className={`flex items-center gap-3 py-2.5 ${r.id === myId ? "font-semibold" : ""}`}>
              <RankBadge rank={r.rank} />
              {children(r)}
              <span className="shrink-0 text-sm">
                {r.n}
                {unit}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-xs text-muted">{note}</p>
    </Section>
  );
}
