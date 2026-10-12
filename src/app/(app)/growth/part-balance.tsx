import { formatDate } from "@/lib/date";
import { weakestParts, type PartBalance } from "@/lib/records/parts";

/** 成長タブ: 直近4週間の部位ごとのセット数（横棒）と、有酸素の合計（数字のタイル） */
export function PartBalanceSection({ balance, excludeFromWeak }: { balance: PartBalance; excludeFromWeak: Set<string> }) {
  const { strength, cardio, customSets } = balance;
  const max = Math.max(1, ...strength.map((p) => p.sets));
  const weak = new Set(weakestParts(strength.filter((p) => !excludeFromWeak.has(p.partId))).map((p) => p.partId));
  const total = strength.reduce((sum, p) => sum + p.sets, 0);

  return (
    <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold">部位のバランス</h2>
        <span className="text-xs text-muted">直近4週間</span>
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted">直近4週間の筋トレの記録はまだありません。</p>
      ) : (
        <>
          <ul className="space-y-2.5" aria-label="部位ごとのセット数">
            {strength.map((p) => {
              const isWeak = weak.has(p.partId);
              return (
                <li
                  key={p.partId}
                  className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2"
                  title={p.lastDate ? `${p.name}: ${p.sets}セット（最後は${formatDate(p.lastDate)}）` : `${p.name}: 記録なし`}
                >
                  <span className="truncate text-sm">{p.name}</span>
                  <span className="relative h-2.5">
                    {p.sets > 0 ? (
                      <span
                        className="absolute inset-y-0 left-0 rounded-r bg-[var(--chart-1)]"
                        style={{ width: `${Math.max(2, (p.sets / max) * 100)}%` }}
                      />
                    ) : (
                      <span className="absolute inset-y-0 left-0 w-px bg-[var(--chart-grid)]" />
                    )}
                  </span>
                  <span className="text-right text-sm tabular-nums">
                    {p.sets}
                    <span className="text-xs text-muted">セット</span>
                  </span>
                  {isWeak && (
                    <span className="col-start-2 col-end-4 -mt-1.5 text-xs text-muted">
                      ↓ 少なめ{p.lastDate ? `（最後は${formatDate(p.lastDate, { withWeekday: false })}）` : "（この4週間はなし）"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {weak.size > 0 && (
            <p className="mt-3 rounded-lg bg-bg px-3 py-2 text-sm">
              少なめの部位: <span className="font-semibold">{strength.filter((p) => weak.has(p.partId)).map((p) => p.name).join("・")}</span>
            </p>
          )}
        </>
      )}

      <h3 className="mb-2 mt-4 text-sm font-semibold">有酸素</h3>
      {cardio.days === 0 ? (
        <p className="text-sm text-muted">直近4週間の有酸素の記録はまだありません。</p>
      ) : (
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "やった日", value: cardio.days, unit: "日" },
            { label: "合計時間", value: cardio.minutes, unit: "分" },
            { label: "合計距離", value: cardio.distanceKm, unit: "km" },
          ].map((t) => (
            <div key={t.label} className="rounded-lg bg-bg px-2 py-2.5">
              <dt className="text-xs text-muted">{t.label}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                {t.value}
                <span className="ml-0.5 text-xs font-normal text-muted">{t.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-3 text-xs text-muted">
        筋トレは記録したセット数、有酸素は時間と距離の合計です。
        {customSets > 0 && `自分の種目（部位なし）の${customSets}セットは含みません。`}
      </p>
    </section>
  );
}
