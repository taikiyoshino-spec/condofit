"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatDate } from "@/lib/date";
import type { Entry, ExerciseType } from "@/lib/records/format";
import { niceTicks, pickDateTicks } from "@/lib/records/chart-scale";
import { formatMetric, METRIC_INFO, METRICS_BY_TYPE, progressSeries, type ProgressMetric } from "@/lib/records/progress";

// 自分の成長グラフ（1系列のみ。指標は切り替え式で、単位の違う値を1つの軸に重ねない）
// 線: 最大重量・推定MAX・時間・距離 / 棒: 総挙上量
// ラベルは自己ベストと最新の点だけ。他の値はタップ・ホバー・キーボードの吹き出しと、下の一覧で見られる

const HEIGHT = 200;
const PAD = { top: 28, right: 16, bottom: 24, left: 40 };
const BAR_METRICS: ProgressMetric[] = ["volume"];

type Props = { type: ExerciseType; sessions: { date: string; entries: Entry[] }[]; initialMetric?: ProgressMetric };

export function ProgressChart({ type, sessions, initialMetric }: Props) {
  const metrics = METRICS_BY_TYPE[type];
  const [metric, setMetric] = useState<ProgressMetric>(initialMetric && metrics.includes(initialMetric) ? initialMetric : metrics[0]);
  const points = useMemo(() => progressSeries(sessions, metric), [sessions, metric]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isBar = BAR_METRICS.includes(metric);
  const info = METRIC_INFO[metric];

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.value);
    const ticks = niceTicks(isBar ? 0 : Math.min(...values), Math.max(...values));
    const yMin = isBar ? 0 : ticks[0];
    const yMax = ticks[ticks.length - 1];
    // 横軸は記録1回ごとに等間隔（日付が近くても棒やラベルが重ならない）
    const days = points.map((_, i) => i);
    const dMin = 0;
    const dMax = points.length - 1;
    const innerW = width - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    // 棒は端で切れないよう左右に半本ぶんの余白
    const barW = Math.min(24, Math.max(6, (innerW / Math.max(points.length, 1)) * 0.6));
    const inset = isBar ? barW / 2 + 2 : 6;
    const x = (d: number) =>
      dMax === dMin ? PAD.left + innerW / 2 : PAD.left + inset + ((d - dMin) / (dMax - dMin)) * (innerW - inset * 2);
    const y = (v: number) => PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
    return { ticks, x, y, days, barW, innerW, baseY: y(yMin) };
  }, [points, width, isBar]);

  const handlePointer = (e: PointerEvent<SVGSVGElement>) => {
    if (!geometry) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    points.forEach((p, i) => {
      if (Math.abs(geometry.x(geometry.days[i]) - px) < Math.abs(geometry.x(geometry.days[nearest]) - px)) nearest = i;
    });
    setActive(nearest);
  };

  const handleKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    if (e.key === "ArrowRight") setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? points.length) - 1));
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };

  const last = points.length - 1;
  // 自己ベストと最新だけに値を書く。2つが近いとラベルが重なるので自己ベストだけ残す
  const bestIndex = points.findIndex((p) => p.isBest);
  const labelled = new Set<number>(bestIndex >= 0 ? [bestIndex] : []);
  if (geometry && last >= 0 && last !== bestIndex && Math.abs(geometry.x(last) - geometry.x(bestIndex)) >= 90) labelled.add(last);
  const anchorFor = (px: number) => (px > width - PAD.right - 50 ? "end" : px < PAD.left + 50 ? "start" : "middle");
  const linePath = geometry
    ? points.map((p, i) => `${i ? "L" : "M"}${geometry.x(geometry.days[i]).toFixed(1)},${geometry.y(p.value).toFixed(1)}`).join("")
    : "";
  const areaPath =
    geometry && points.length > 1
      ? `${linePath}L${geometry.x(geometry.days[last]).toFixed(1)},${geometry.baseY}L${geometry.x(geometry.days[0]).toFixed(1)},${geometry.baseY}Z`
      : "";
  const activePoint = active !== null ? points[active] : null;

  return (
    <div>
      {metrics.length > 1 && (
        <div className="mb-3 flex gap-1 rounded-lg bg-border/60 p-1" role="tablist" aria-label="グラフの指標">
          {metrics.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={m === metric}
              onClick={() => {
                setMetric(m);
                setActive(null);
              }}
              className={`flex-1 rounded-md py-1.5 text-xs ${m === metric ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}
            >
              {METRIC_INFO[m].label}
            </button>
          ))}
        </div>
      )}

      <div ref={wrapRef} className="relative">
        {!geometry ? (
          <p className="py-10 text-center text-sm text-muted">記録すると、ここに成長グラフが出ます</p>
        ) : (
          <>
            <svg
              width={width}
              height={HEIGHT}
              viewBox={`0 0 ${width} ${HEIGHT}`}
              role="img"
              aria-label={`${info.label}の推移。${points.length}回分。最高 ${formatMetric(metric, Math.max(...points.map((p) => p.value)))}`}
              tabIndex={0}
              onPointerMove={handlePointer}
              onPointerDown={handlePointer}
              onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
              onKeyDown={handleKey}
              onBlur={() => setActive(null)}
              className="touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {/* 目盛り線（1px・実線・控えめ） */}
              {geometry.ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.left} x2={width - PAD.right} y1={geometry.y(t)} y2={geometry.y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
                  <text x={PAD.left - 6} y={geometry.y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {t.toLocaleString("ja-JP")}
                  </text>
                </g>
              ))}
              {pickDateTicks(points.map((p) => p.date)).map((d) => (
                <text key={d} x={geometry.x(points.findIndex((p) => p.date === d))} y={HEIGHT - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">
                  {formatDate(d, { withWeekday: false })}
                </text>
              ))}

              {isBar ? (
                points.map((p, i) => {
                  const cx = geometry.x(geometry.days[i]);
                  const top = geometry.y(p.value);
                  const h = Math.max(1, geometry.baseY - top);
                  const r = Math.min(4, h);
                  const w = geometry.barW;
                  // 上端だけ4pxの角丸、根元は四角
                  const d = `M${cx - w / 2},${geometry.baseY}V${top + r}Q${cx - w / 2},${top} ${cx - w / 2 + r},${top}H${cx + w / 2 - r}Q${cx + w / 2},${top} ${cx + w / 2},${top + r}V${geometry.baseY}Z`;
                  return <path key={p.date} d={d} fill="var(--chart-1)" opacity={active === null || active === i ? 1 : 0.55} />;
                })
              ) : (
                <>
                  {areaPath && <path d={areaPath} fill="var(--chart-1)" opacity={0.1} />}
                  <path d={linePath} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {points.map((p, i) => (
                    <circle
                      key={p.date}
                      cx={geometry.x(geometry.days[i])}
                      cy={geometry.y(p.value)}
                      r={p.isBest || active === i ? 5 : 4}
                      fill="var(--chart-1)"
                      stroke="var(--surface)"
                      strokeWidth={2}
                    />
                  ))}
                </>
              )}

              {/* 自己ベストと最新だけに値を書く */}
              {points.map((p, i) =>
                labelled.has(i) ? (
                  <text
                    key={`label-${p.date}`}
                    x={Math.min(width - PAD.right, Math.max(PAD.left, geometry.x(geometry.days[i])))}
                    y={geometry.y(p.value) - 10}
                    textAnchor={anchorFor(geometry.x(geometry.days[i]))}
                    fontSize={11}
                    fontWeight={p.isBest ? 700 : 500}
                    fill="var(--fg)"
                  >
                    {p.isBest ? "★ " : ""}
                    {formatMetric(metric, p.value, p.repsAtMax)}
                  </text>
                ) : null,
              )}

              {/* 十字線（タップ・ホバー位置に最も近い日へ吸着） */}
              {activePoint && active !== null && (
                <line
                  x1={geometry.x(geometry.days[active])}
                  x2={geometry.x(geometry.days[active])}
                  y1={PAD.top - 8}
                  y2={geometry.baseY}
                  stroke="var(--muted)"
                  strokeWidth={1}
                />
              )}
            </svg>

            {activePoint && active !== null && (
              <div
                role="status"
                className="pointer-events-none absolute top-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md"
                style={{
                  left: Math.min(width - 132, Math.max(0, geometry.x(geometry.days[active]) - 66)),
                  width: 132,
                }}
              >
                <span className="block text-sm font-semibold">{formatMetric(metric, activePoint.value, activePoint.repsAtMax)}</span>
                <span className="block text-muted">
                  {formatDate(activePoint.date)}
                  {activePoint.isBest && "・自己ベスト"}
                </span>
              </div>
            )}
          </>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        {info.note}。{isBar ? "棒" : "点"}をタップすると値が出ます。
        {metric === "e1rm" && "（15回以下のセットから計算した目安です）"}
      </p>
    </div>
  );
}
