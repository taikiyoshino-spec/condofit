import Link from "next/link";
import type { RecentProgress } from "@/lib/records/queries";
import { formatDelta, formatMetric, METRIC_INFO } from "@/lib/records/progress";

// 記録タブの「最近の成長」。種目ごとの小さな推移グラフと最新値・前回との差。タップでその種目の詳細へ

const W = 72;
const H = 28;
const PAD = 4;

function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => (values.length === 1 ? W / 2 : PAD + (i / (values.length - 1)) * (W - PAD * 2));
  const y = (v: number) => (max === min ? H / 2 : PAD + (1 - (v - min) / (max - min)) * (H - PAD * 2));
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = values.length - 1;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="shrink-0">
      {values.length > 1 && (
        <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      )}
      <circle cx={x(last)} cy={y(values[last])} r={3.5} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

/** 「ラットプル×シーテッドロウ」のような名前は「×」の直後でだけ折り返す（単語の途中で切らない） */
function ExerciseName({ name }: { name: string }) {
  const parts = name.split("×");
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <>
              ×<wbr />
            </>
          )}
        </span>
      ))}
    </>
  );
}

type ListProps = { items: RecentProgress[]; title?: string; moreHref?: string };

export function RecentProgressList({ items, title = "最近の成長", moreHref }: ListProps) {
  if (items.length === 0) return null;
  return (
    <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4" aria-label={title}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        {moreHref && (
          <Link href={moreHref} className="text-sm text-muted">
            すべて見る ›
          </Link>
        )}
      </div>
      <ul className="divide-y divide-border">
        {items.map(({ exerciseId, name, summary: s }) => (
          <li key={exerciseId}>
            <Link href={`/exercises/${exerciseId}`} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-sm font-medium [word-break:keep-all]">
                  <ExerciseName name={name} />
                </span>
                <span className="block text-xs text-muted">{METRIC_INFO[s.metric].label}</span>
              </span>
              <Sparkline values={s.series} />
              <span className="w-24 shrink-0 text-right">
                <span className="block text-sm font-semibold">{formatMetric(s.metric, s.latest, s.latestReps)}</span>
                <span className={`block text-xs ${s.isBest || (s.delta ?? 0) > 0 ? "text-accent" : "text-muted"}`}>
                  {s.isBest ? "★ 自己ベスト" : s.delta === null ? "初記録" : `前回比 ${formatDelta(s.metric, s.delta)}`}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
